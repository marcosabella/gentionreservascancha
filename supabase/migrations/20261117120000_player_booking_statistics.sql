BEGIN;

-- Statistics belong to the database: all booking entry points (including
-- recurring bookings and the player app) must produce the same totals.
CREATE OR REPLACE FUNCTION public.refresh_player_booking_statistics(target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Serialize concurrent changes for the same player before reading bookings.
  PERFORM 1 FROM public.players WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.players p SET
    total_bookings = stats.total,
    last_booking = stats.last_date
  FROM (
    SELECT count(DISTINCT b.id)::integer AS total, max(b.date) AS last_date
    FROM public.booking_players bp
    JOIN public.bookings b ON b.id = bp.booking_id
    WHERE bp.player_id = target AND b.status <> 'cancelled'
  ) stats
  WHERE p.id = target;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_player_booking_statistics()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target uuid; old_player uuid; new_player uuid;
BEGIN
  IF TG_TABLE_NAME = 'booking_players' THEN
    IF TG_OP <> 'INSERT' THEN old_player := OLD.player_id; END IF;
    IF TG_OP <> 'DELETE' THEN new_player := NEW.player_id; END IF;
    FOR target IN
      SELECT DISTINCT id FROM unnest(ARRAY[old_player, new_player]) AS ids(id)
      WHERE id IS NOT NULL ORDER BY id
    LOOP
      PERFORM public.refresh_player_booking_statistics(target);
    END LOOP;
  ELSE
    FOR target IN
      SELECT DISTINCT player_id FROM public.booking_players
      WHERE booking_id = NEW.id ORDER BY player_id
    LOOP
      PERFORM public.refresh_player_booking_statistics(target);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_player_booking_statistics(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_player_booking_statistics() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS player_booking_statistics_members ON public.booking_players;
CREATE TRIGGER player_booking_statistics_members
AFTER INSERT OR UPDATE OR DELETE ON public.booking_players
FOR EACH ROW EXECUTE FUNCTION public.sync_player_booking_statistics();

DROP TRIGGER IF EXISTS player_booking_statistics_booking ON public.bookings;
CREATE TRIGGER player_booking_statistics_booking
AFTER UPDATE OF status, date ON public.bookings
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.date IS DISTINCT FROM NEW.date)
EXECUTE FUNCTION public.sync_player_booking_statistics();

-- Repair historical counters, including players with no remaining bookings.
DO $$
DECLARE target uuid;
BEGIN
  FOR target IN SELECT id FROM public.players ORDER BY id LOOP
    PERFORM public.refresh_player_booking_statistics(target);
  END LOOP;
END;
$$;

COMMIT;
