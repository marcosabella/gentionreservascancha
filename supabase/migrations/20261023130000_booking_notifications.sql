BEGIN;

CREATE TABLE public.booking_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('created', 'cancelled')),
  actor_id uuid,
  player_name text NOT NULL,
  court_name text NOT NULL,
  booking_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (booking_id, kind)
);
CREATE INDEX booking_notifications_recent ON public.booking_notifications(created_at DESC, id DESC);

CREATE TABLE public.booking_notification_reads (
  notification_id uuid NOT NULL REFERENCES public.booking_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX booking_notification_reads_user ON public.booking_notification_reads(user_id, notification_id);
ALTER TABLE public.booking_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_notification_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_notifications, public.booking_notification_reads FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.booking_notifications, public.booking_notification_reads TO authenticated;
GRANT ALL ON public.booking_notifications, public.booking_notification_reads TO service_role;
CREATE POLICY booking_notifications_admin_read ON public.booking_notifications FOR SELECT TO authenticated
  USING ((SELECT public.app_is_active_admin()));
CREATE POLICY booking_notification_reads_own ON public.booking_notification_reads FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.app_is_active_admin()));

-- Authenticated identity, not a client supplied role, determines the source.
-- Staff-created bookings and staff cancellations do not produce these alerts.
CREATE FUNCTION public.capture_player_booking_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE profile public.user_profiles; actor_name text; event_kind text;
BEGIN
  SELECT * INTO profile FROM public.user_profiles WHERE id = auth.uid() AND is_active AND role = 'player';
  IF NOT FOUND OR profile.player_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('confirmed', 'pending') OR coalesce(NEW.is_recurring, false) THEN RETURN NEW; END IF;
    event_kind := 'created';
  ELSE
    IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN RETURN NEW; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.booking_players WHERE booking_id = NEW.id AND player_id = profile.player_id) THEN RETURN NEW; END IF;
    event_kind := 'cancelled';
  END IF;
  SELECT name INTO actor_name FROM public.players WHERE id = profile.player_id;
  INSERT INTO public.booking_notifications(booking_id, kind, actor_id, player_name, court_name, booking_date, start_time, end_time)
  VALUES (NEW.id, event_kind, profile.id, coalesce(actor_name, profile.username), NEW.court_name, NEW.date, NEW.start_time, NEW.end_time)
  ON CONFLICT (booking_id, kind) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER player_booking_notification AFTER INSERT OR UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.capture_player_booking_notification();

-- Keep the player booking, organizer and notification in one transaction.
-- A failed reservation must never leave an alert for the administrator.
CREATE FUNCTION public.player_create_booking(payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE profile public.user_profiles; player public.players; court public.courts;
  booking_date date; starts time; ends time; result_id uuid;
BEGIN
  SELECT id, player_id INTO profile.id, profile.player_id FROM public.user_profiles WHERE id = auth.uid() AND is_active AND role = 'player';
  IF NOT FOUND OR profile.player_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere un jugador activo' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT player FROM public.players WHERE id = profile.player_id;
  IF jsonb_array_length(coalesce(payload->'players', '[]'::jsonb)) <> 1
    OR (payload#>>'{players,0,id}')::uuid IS DISTINCT FROM profile.player_id
    OR jsonb_array_length(coalesce(payload->'consumptions', '[]'::jsonb)) <> 0 THEN
    RAISE EXCEPTION 'La reserva debe corresponder al jugador que inició sesión';
  END IF;
  booking_date := (payload->>'date')::date;
  starts := (payload->>'startTime')::time;
  ends := (payload->>'endTime')::time;
  IF booking_date IS NULL OR starts IS NULL OR ends IS NULL OR starts >= ends
    OR booking_date < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
    RAISE EXCEPTION 'Fecha u horario de reserva inválido';
  END IF;
  -- Serialize player reservations for the same court to reject double submits.
  PERFORM pg_advisory_xact_lock(hashtextextended(payload->>'courtId', 23120000));
  SELECT * INTO STRICT court FROM public.courts WHERE id = (payload->>'courtId')::uuid;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE court_id = court.id AND date = booking_date
    AND status IN ('confirmed', 'pending', 'in-progress') AND start_time < ends AND end_time > starts) THEN
    RAISE EXCEPTION 'Ese horario ya está reservado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.court_unavailabilities WHERE court_id = court.id AND is_active
    AND ((NOT is_recurring AND date = booking_date) OR (is_recurring AND day_of_week = extract(dow FROM booking_date)))
    AND start_time < ends AND end_time > starts)
    OR EXISTS (SELECT 1 FROM public.recurring_bookings WHERE court_id = court.id AND is_active
      AND day_of_week = extract(dow FROM booking_date) AND NOT booking_date = ANY(coalesce(skip_dates, ARRAY[]::date[]))
      AND start_time < ends AND end_time > starts) THEN
    RAISE EXCEPTION 'Ese horario no está disponible';
  END IF;
  INSERT INTO public.bookings(court_id, court_name, date, start_time, end_time, total_price, status)
    VALUES (court.id, court.name, booking_date, starts, ends, court.price_per_turn, 'confirmed') RETURNING id INTO result_id;
  INSERT INTO public.booking_players(booking_id, player_id, player_name, player_email, player_phone, is_organizer)
    VALUES (result_id, player.id, player.name, coalesce(player.email, ''), coalesce(player.phone, ''), true);
  RETURN result_id;
END;
$$;

CREATE FUNCTION public.booking_notification_feed(before_at timestamptz DEFAULT NULL, before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb; unread_count bigint;
BEGIN
  IF NOT public.app_is_active_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede consultar las notificaciones' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO unread_count FROM public.booking_notifications n
    WHERE NOT EXISTS (SELECT 1 FROM public.booking_notification_reads r WHERE r.notification_id = n.id AND r.user_id = auth.uid());
  SELECT coalesce(jsonb_agg(to_jsonb(item) ORDER BY item.created_at DESC, item.id DESC), '[]'::jsonb) INTO result FROM (
    SELECT n.*, EXISTS (SELECT 1 FROM public.booking_notification_reads r WHERE r.notification_id = n.id AND r.user_id = auth.uid()) AS is_read
    FROM public.booking_notifications n
    WHERE before_at IS NULL OR (n.created_at, n.id) < (before_at, before_id)
    ORDER BY n.created_at DESC, n.id DESC LIMIT 31
  ) item;
  RETURN jsonb_build_object('items', result, 'unreadCount', unread_count);
END;
$$;

CREATE FUNCTION public.mark_booking_notifications_read(target uuid DEFAULT NULL, through timestamptz DEFAULT now())
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.app_is_active_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede marcar notificaciones' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.booking_notification_reads(notification_id, user_id)
    SELECT id, auth.uid() FROM public.booking_notifications
    WHERE (target IS NOT NULL AND id = target) OR (target IS NULL AND created_at <= through)
    ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_player_booking_notification(), public.player_create_booking(jsonb),
  public.booking_notification_feed(timestamptz, uuid), public.mark_booking_notifications_read(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_create_booking(jsonb), public.booking_notification_feed(timestamptz, uuid),
  public.mark_booking_notifications_read(uuid, timestamptz) TO authenticated;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.booking_notifications, public.booking_notification_reads;
  END IF;
END $$;
SELECT pg_notify('pgrst', 'reload schema');
COMMIT;
