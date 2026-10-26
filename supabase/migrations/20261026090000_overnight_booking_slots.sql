-- Treat an end before the start as the following day, on the booking's date.
CREATE OR REPLACE FUNCTION public.booking_times_overlap(first_start time, first_end time, second_start time, second_end time)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT extract(epoch FROM first_start) < extract(epoch FROM second_end) + CASE WHEN second_end < second_start THEN 86400 ELSE 0 END
    AND extract(epoch FROM first_end) + CASE WHEN first_end < first_start THEN 86400 ELSE 0 END > extract(epoch FROM second_start);
$$;
REVOKE ALL ON FUNCTION public.booking_times_overlap(time,time,time,time) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_times_overlap(time,time,time,time) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.player_create_booking(payload jsonb) RETURNS uuid
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
  IF booking_date IS NULL OR starts IS NULL OR ends IS NULL OR (starts = ends OR (starts > ends AND extract(epoch FROM ends) + 86400 - extract(epoch FROM starts) <> 5400))
    OR booking_date < (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date THEN
    RAISE EXCEPTION 'Fecha u horario de reserva inválido';
  END IF;
  -- Serialize player reservations for the same court to reject double submits.
  PERFORM pg_advisory_xact_lock(hashtextextended(payload->>'courtId', 23120000));
  SELECT * INTO STRICT court FROM public.courts WHERE id = (payload->>'courtId')::uuid;
  IF EXISTS (SELECT 1 FROM public.bookings WHERE court_id = court.id AND date = booking_date
    AND status IN ('confirmed', 'pending', 'in-progress') AND public.booking_times_overlap(start_time, end_time, starts, ends)) THEN
    RAISE EXCEPTION 'Ese horario ya está reservado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.court_unavailabilities WHERE court_id = court.id AND is_active
    AND ((NOT is_recurring AND date = booking_date) OR (is_recurring AND day_of_week = extract(dow FROM booking_date)))
    AND public.booking_times_overlap(start_time, end_time, starts, ends))
    OR EXISTS (SELECT 1 FROM public.recurring_bookings WHERE court_id = court.id AND is_active
      AND day_of_week = extract(dow FROM booking_date) AND NOT booking_date = ANY(coalesce(skip_dates, ARRAY[]::date[]))
      AND public.booking_times_overlap(start_time, end_time, starts, ends)) THEN
    RAISE EXCEPTION 'Ese horario no está disponible';
  END IF;
  INSERT INTO public.bookings(court_id, court_name, date, start_time, end_time, total_price, status)
    VALUES (court.id, court.name, booking_date, starts, ends, court.price_per_turn, 'confirmed') RETURNING id INTO result_id;
  INSERT INTO public.booking_players(booking_id, player_id, player_name, player_email, player_phone, is_organizer)
    VALUES (result_id, player.id, player.name, coalesce(player.email, ''), coalesce(player.phone, ''), true);
  RETURN result_id;
END;
$$;


NOTIFY pgrst, 'reload schema';
