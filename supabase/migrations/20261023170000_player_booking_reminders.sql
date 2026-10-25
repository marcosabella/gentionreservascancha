BEGIN;

ALTER TABLE public.booking_push_config
  ADD COLUMN reminder_minutes integer NOT NULL DEFAULT 60 CHECK (reminder_minutes BETWEEN 5 AND 1440),
  ADD COLUMN reminders_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.booking_push_deliveries
  ALTER COLUMN notification_id DROP NOT NULL,
  ADD COLUMN delivery_type text NOT NULL DEFAULT 'admin' CHECK (delivery_type IN ('admin', 'reminder')),
  ADD COLUMN booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  ADD COLUMN scheduled_start timestamptz,
  ADD CONSTRAINT booking_push_delivery_source CHECK (
    (delivery_type = 'admin' AND notification_id IS NOT NULL AND booking_id IS NULL AND scheduled_start IS NULL) OR
    (delivery_type = 'reminder' AND notification_id IS NULL AND booking_id IS NOT NULL AND scheduled_start IS NOT NULL)
  ),
  ADD CONSTRAINT booking_push_reminder_once UNIQUE (booking_id, subscription_id, scheduled_start);
CREATE INDEX booking_push_reminder_bookings ON public.bookings(date, start_time) WHERE status = 'confirmed';

CREATE FUNCTION public.booking_push_start(day date, starts time) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (day + starts) AT TIME ZONE 'America/Argentina/Buenos_Aires';
$$;

CREATE FUNCTION public.can_receive_booking_push() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles p JOIN auth.sessions s ON s.user_id = p.id
    WHERE p.id = auth.uid() AND p.is_active AND (p.role = 'admin' OR (p.role = 'player' AND p.player_id IS NOT NULL))
    AND s.id = (auth.jwt()->>'session_id')::uuid AND (s.not_after IS NULL OR s.not_after > now()));
$$;

CREATE OR REPLACE FUNCTION public.booking_push_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.can_receive_booking_push() THEN RAISE EXCEPTION 'Se requiere una sesión activa' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object('publicKey', public_key, 'enabled', enabled,
    'remindersEnabled', reminders_enabled, 'reminderMinutes', reminder_minutes) FROM public.booking_push_config WHERE singleton);
END;
$$;

CREATE FUNCTION public.update_booking_reminder_settings(minutes_before integer, send_reminders boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.app_is_active_admin() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501'; END IF;
  IF minutes_before IS NULL OR minutes_before NOT BETWEEN 5 AND 1440 OR send_reminders IS NULL THEN
    RAISE EXCEPTION 'El intervalo debe estar entre 5 y 1440 minutos';
  END IF;
  UPDATE public.booking_push_config SET reminder_minutes = minutes_before, reminders_enabled = send_reminders WHERE singleton;
  -- Invalidate any in-flight lease so a changed interval takes effect before send.
  UPDATE public.booking_push_deliveries SET state = 'queued', lease = NULL,
    next_attempt_at = greatest(now(), scheduled_start - make_interval(mins => minutes_before))
  WHERE delivery_type = 'reminder' AND state IN ('queued', 'sending');
END;
$$;

CREATE OR REPLACE FUNCTION public.register_booking_push(subscription jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_session uuid := (auth.jwt()->>'session_id')::uuid; result uuid; address text := subscription->>'endpoint';
BEGIN
  IF NOT public.can_receive_booking_push() THEN RAISE EXCEPTION 'Se requiere una sesión activa' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.booking_push_config WHERE enabled) THEN RAISE EXCEPTION 'Push no disponible'; END IF;
  IF address IS NULL OR address !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/[^[:space:]#]+$'
    OR coalesce(subscription#>>'{keys,p256dh}', '') !~ '^[A-Za-z0-9_-]{87}$'
    OR coalesce(subscription#>>'{keys,auth}', '') !~ '^[A-Za-z0-9_-]{22}$' THEN RAISE EXCEPTION 'Suscripción push inválida'; END IF;
  IF (SELECT count(*) FROM public.booking_push_subscriptions WHERE user_id = auth.uid() AND endpoint <> address) >= 20 THEN
    RAISE EXCEPTION 'Desactivá las notificaciones en otro dispositivo antes de agregar uno nuevo';
  END IF;
  INSERT INTO public.booking_push_subscriptions(user_id, session_id, endpoint, p256dh, auth)
  VALUES (auth.uid(), current_session, address, subscription#>>'{keys,p256dh}', subscription#>>'{keys,auth}')
  ON CONFLICT (endpoint) DO UPDATE SET session_id = excluded.session_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now()
    WHERE public.booking_push_subscriptions.user_id = auth.uid()
  RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'El dispositivo pertenece a otra cuenta'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_inactive_booking_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT NEW.is_active OR NEW.role NOT IN ('admin', 'player') OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.player_id IS DISTINCT FROM OLD.player_id THEN
    DELETE FROM public.booking_push_subscriptions WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER revoke_inactive_booking_push ON public.user_profiles;
CREATE TRIGGER revoke_inactive_booking_push AFTER UPDATE OF role, is_active, player_id ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.revoke_inactive_booking_push();

-- This predicate is also rechecked by the worker immediately before dispatch.
CREATE FUNCTION public.booking_push_delivery_allowed(job uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.booking_push_deliveries d
    JOIN public.booking_push_subscriptions s ON s.id = d.subscription_id
    JOIN public.user_profiles p ON p.id = s.user_id AND p.is_active
    JOIN auth.sessions a ON a.id = s.session_id AND a.user_id = p.id AND (a.not_after IS NULL OR a.not_after > now())
    CROSS JOIN public.booking_push_config cfg
    LEFT JOIN public.bookings b ON b.id = d.booking_id
    WHERE d.id = job AND cfg.enabled AND (
      (d.delivery_type = 'admin' AND p.role = 'admin') OR
      (d.delivery_type = 'reminder' AND p.role = 'player' AND cfg.reminders_enabled AND b.status = 'confirmed'
        AND d.scheduled_start = public.booking_push_start(b.date,b.start_time)
        AND d.scheduled_start > now() AND d.scheduled_start - make_interval(mins => cfg.reminder_minutes) <= now()
        AND EXISTS (SELECT 1 FROM public.booking_players bp WHERE bp.booking_id = b.id AND bp.player_id = p.player_id))
    ));
$$;

CREATE FUNCTION public.booking_push_job_current(job uuid, claim uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.booking_push_deliveries WHERE id = job AND lease = claim AND state = 'sending')
    AND public.booking_push_delivery_allowed(job);
$$;

CREATE FUNCTION public.queue_booking_reminders() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE added integer;
BEGIN
  -- Suppress cancelled/rescheduled/removed-player jobs, even if already leased.
  UPDATE public.booking_push_deliveries d SET state = 'failed', lease = NULL, last_status = 409, finished_at = now()
  WHERE d.delivery_type = 'reminder' AND d.state IN ('queued','sending') AND NOT EXISTS (
    SELECT 1 FROM public.bookings b JOIN public.booking_push_subscriptions s ON s.id = d.subscription_id
    JOIN public.user_profiles p ON p.id = s.user_id AND p.is_active AND p.role = 'player'
    WHERE b.id = d.booking_id AND b.status = 'confirmed' AND d.scheduled_start = public.booking_push_start(b.date,b.start_time)
      AND d.scheduled_start > now() AND EXISTS (SELECT 1 FROM public.booking_players bp WHERE bp.booking_id = b.id AND bp.player_id = p.player_id)
  );
  DELETE FROM public.booking_push_deliveries WHERE finished_at < now() - interval '7 days';
  INSERT INTO public.booking_push_deliveries(delivery_type, booking_id, subscription_id, scheduled_start)
  SELECT DISTINCT 'reminder', b.id, s.id, public.booking_push_start(b.date,b.start_time)
  FROM public.bookings b
  JOIN public.booking_players bp ON bp.booking_id = b.id
  JOIN public.user_profiles p ON p.player_id = bp.player_id AND p.role = 'player' AND p.is_active
  JOIN public.booking_push_subscriptions s ON s.user_id = p.id
  JOIN auth.sessions a ON a.id = s.session_id AND a.user_id = p.id AND (a.not_after IS NULL OR a.not_after > now())
  CROSS JOIN public.booking_push_config cfg
  WHERE cfg.enabled AND cfg.reminders_enabled AND b.status = 'confirmed'
    AND b.date BETWEEN (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date AND (now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date + 1
    AND public.booking_push_start(b.date,b.start_time) > now()
    AND public.booking_push_start(b.date,b.start_time) - make_interval(mins => cfg.reminder_minutes) <= now()
  ON CONFLICT (booking_id, subscription_id, scheduled_start) DO UPDATE SET
    state = 'queued', lease = NULL, last_status = NULL, finished_at = NULL, next_attempt_at = now()
    WHERE public.booking_push_deliveries.state = 'failed' AND public.booking_push_deliveries.last_status = 409 AND public.booking_push_deliveries.attempts < 5;
  GET DIAGNOSTICS added = ROW_COUNT;
  RETURN added;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_booking_push() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE jobs jsonb;
BEGIN
  PERFORM public.queue_booking_reminders();
  DELETE FROM public.booking_push_subscriptions s USING auth.sessions a WHERE a.id = s.session_id AND a.not_after <= now();
  UPDATE public.booking_push_deliveries SET state = 'failed', finished_at = now()
    WHERE state IN ('queued','sending') AND next_attempt_at <= now() AND (attempts >= 5 OR (delivery_type = 'admin' AND created_at < now() - interval '1 hour'));
  WITH candidates AS (
    SELECT d.id FROM public.booking_push_deliveries d
    WHERE d.state IN ('queued','sending') AND d.next_attempt_at <= now() AND d.attempts < 5
      AND public.booking_push_delivery_allowed(d.id)
    ORDER BY d.next_attempt_at, d.created_at LIMIT 20 FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.booking_push_deliveries d SET state = 'sending', attempts = attempts + 1,
      lease = gen_random_uuid(), next_attempt_at = now() + interval '2 minutes'
    FROM candidates c WHERE c.id = d.id RETURNING d.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'lease', d.lease, 'subscriptionId', s.id,
    'endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh',s.p256dh,'auth',s.auth),
    'notificationId', coalesce(n.id,d.id), 'bookingId', d.booking_id, 'startsAt', d.scheduled_start,
    'kind', CASE WHEN d.delivery_type = 'reminder' THEN 'reminder' ELSE n.kind END,
    'court', CASE WHEN d.delivery_type = 'reminder' THEN b.court_name ELSE n.court_name END,
    'date', CASE WHEN d.delivery_type = 'reminder' THEN b.date ELSE n.booking_date END,
    'start', CASE WHEN d.delivery_type = 'reminder' THEN b.start_time ELSE n.start_time END,
    'end', CASE WHEN d.delivery_type = 'reminder' THEN b.end_time ELSE n.end_time END)), '[]'::jsonb) INTO jobs
  FROM claimed d JOIN public.booking_push_subscriptions s ON s.id = d.subscription_id
  LEFT JOIN public.booking_notifications n ON n.id = d.notification_id LEFT JOIN public.bookings b ON b.id = d.booking_id;
  RETURN jobs;
END;
$$;

CREATE OR REPLACE FUNCTION public.wake_booking_push() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE destination text; credential text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.booking_push_config WHERE enabled) OR NOT EXISTS (
    SELECT 1 FROM public.booking_push_deliveries d WHERE d.state IN ('queued','sending') AND d.next_attempt_at <= now()
      AND (d.delivery_type = 'admin' OR (SELECT reminders_enabled FROM public.booking_push_config))
  ) THEN RETURN; END IF;
  SELECT decrypted_secret INTO destination FROM vault.decrypted_secrets WHERE name = 'booking_push_dispatch_url';
  SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name = 'booking_push_dispatch_token';
  IF destination IS NULL OR credential IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := destination, headers := jsonb_build_object('Content-Type','application/json','x-push-dispatch-token',credential), body := '{}'::jsonb, timeout_milliseconds := 5000);
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'No se pudo despertar el envío push; se reintentará por cron';
END;
$$;

REVOKE ALL ON FUNCTION public.booking_push_start(date,time), public.can_receive_booking_push(),
  public.update_booking_reminder_settings(integer,boolean), public.booking_push_delivery_allowed(uuid),
  public.booking_push_job_current(uuid,uuid), public.queue_booking_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_booking_reminder_settings(integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_push_job_current(uuid,uuid) TO service_role;
SELECT cron.schedule('booking-push-retry', '* * * * *', 'SELECT public.queue_booking_reminders(); SELECT public.wake_booking_push()');
SELECT pg_notify('pgrst', 'reload schema');
COMMIT;
