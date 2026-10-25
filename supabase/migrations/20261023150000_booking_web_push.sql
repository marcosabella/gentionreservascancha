BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Only the public application key and site URL live here. Private keys are
-- Edge Function secrets; the database dispatcher credential lives in Vault.
CREATE TABLE public.booking_push_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  public_key text NOT NULL,
  app_url text NOT NULL CHECK (app_url ~ '^https://'),
  enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE public.booking_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (length(endpoint) <= 2048),
  p256dh text NOT NULL CHECK (p256dh ~ '^[A-Za-z0-9_-]{87}$'),
  auth text NOT NULL CHECK (auth ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_push_subscriptions_user ON public.booking_push_subscriptions(user_id);
CREATE INDEX booking_push_subscriptions_session ON public.booking_push_subscriptions(session_id);
CREATE TABLE public.booking_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.booking_notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.booking_push_subscriptions(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'sending', 'sent', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease uuid,
  last_status integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (notification_id, subscription_id)
);
CREATE INDEX booking_push_deliveries_due ON public.booking_push_deliveries(next_attempt_at) WHERE state IN ('queued', 'sending');
ALTER TABLE public.booking_push_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_push_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.booking_push_config, public.booking_push_subscriptions, public.booking_push_deliveries FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.booking_push_config, public.booking_push_subscriptions, public.booking_push_deliveries TO service_role;

CREATE FUNCTION public.booking_push_settings() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.app_is_active_admin() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT jsonb_build_object('publicKey', public_key, 'enabled', enabled) FROM public.booking_push_config WHERE singleton);
END;
$$;

CREATE FUNCTION public.register_booking_push(subscription jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE current_session uuid := (auth.jwt()->>'session_id')::uuid; result uuid; address text := subscription->>'endpoint';
BEGIN
  IF NOT public.app_is_active_admin() OR NOT EXISTS (SELECT 1 FROM auth.sessions WHERE id = current_session AND user_id = auth.uid() AND (not_after IS NULL OR not_after > now())) THEN
    RAISE EXCEPTION 'Se requiere una sesión de administrador activa' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.booking_push_config WHERE enabled) THEN RAISE EXCEPTION 'Push no disponible'; END IF;
  -- Restrict outgoing requests to browser push providers. No arbitrary URLs.
  IF address IS NULL OR address !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/[^[:space:]#]+$'
    OR coalesce(subscription#>>'{keys,p256dh}', '') !~ '^[A-Za-z0-9_-]{87}$'
    OR coalesce(subscription#>>'{keys,auth}', '') !~ '^[A-Za-z0-9_-]{22}$' THEN
    RAISE EXCEPTION 'Suscripción push inválida';
  END IF;
  IF (SELECT count(*) FROM public.booking_push_subscriptions WHERE user_id = auth.uid() AND endpoint <> address) >= 20 THEN
    RAISE EXCEPTION 'Desactivá las notificaciones en otro dispositivo antes de agregar uno nuevo';
  END IF;
  INSERT INTO public.booking_push_subscriptions(user_id, session_id, endpoint, p256dh, auth)
  VALUES (auth.uid(), current_session, address, subscription#>>'{keys,p256dh}', subscription#>>'{keys,auth}')
  ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, session_id = excluded.session_id,
    p256dh = excluded.p256dh, auth = excluded.auth, updated_at = now()
  WHERE public.booking_push_subscriptions.user_id = auth.uid()
  RETURNING id INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'El dispositivo pertenece a otra cuenta'; END IF;
  RETURN result;
END;
$$;

CREATE FUNCTION public.unregister_booking_push(address text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM public.booking_push_subscriptions
  WHERE user_id = auth.uid() AND endpoint = address;
$$;

CREATE FUNCTION public.wake_booking_push() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE destination text; credential text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.booking_push_config WHERE enabled) OR NOT EXISTS (
    SELECT 1 FROM public.booking_push_deliveries WHERE state IN ('queued', 'sending') AND next_attempt_at <= now()
  ) THEN RETURN; END IF;
  SELECT decrypted_secret INTO destination FROM vault.decrypted_secrets WHERE name = 'booking_push_dispatch_url';
  SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name = 'booking_push_dispatch_token';
  IF destination IS NULL OR credential IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := destination, headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-dispatch-token', credential),
    body := '{}'::jsonb, timeout_milliseconds := 5000);
EXCEPTION WHEN OTHERS THEN
  -- A temporary HTTP scheduling failure must not reject a player's reservation.
  -- The durable queue is retried by cron after the transaction commits.
  RAISE WARNING 'No se pudo despertar el envío push; se reintentará por cron';
END;
$$;

CREATE FUNCTION public.enqueue_booking_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.booking_push_deliveries(notification_id, subscription_id)
  SELECT NEW.id, s.id FROM public.booking_push_subscriptions s
  JOIN public.user_profiles p ON p.id = s.user_id AND p.role = 'admin' AND p.is_active
  JOIN auth.sessions a ON a.id = s.session_id AND a.user_id = s.user_id AND (a.not_after IS NULL OR a.not_after > now())
  WHERE EXISTS (SELECT 1 FROM public.booking_push_config WHERE enabled)
  ON CONFLICT DO NOTHING;
  PERFORM public.wake_booking_push();
  RETURN NEW;
END;
$$;
CREATE TRIGGER enqueue_booking_push AFTER INSERT ON public.booking_notifications
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_booking_push();

CREATE FUNCTION public.revoke_inactive_booking_push() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT NEW.is_active OR NEW.role <> 'admin' THEN
    DELETE FROM public.booking_push_subscriptions WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER revoke_inactive_booking_push AFTER UPDATE OF role, is_active ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.revoke_inactive_booking_push();

-- SKIP LOCKED and a lease prevent simultaneous workers sending the same job.
CREATE FUNCTION public.claim_booking_push() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE jobs jsonb;
BEGIN
  DELETE FROM public.booking_push_subscriptions s USING auth.sessions a
    WHERE a.id = s.session_id AND a.not_after <= now();
  UPDATE public.booking_push_deliveries SET state = 'failed', finished_at = now()
    WHERE state IN ('queued', 'sending') AND (created_at < now() - interval '1 hour' OR attempts >= 5) AND next_attempt_at <= now();
  DELETE FROM public.booking_push_deliveries WHERE finished_at < now() - interval '7 days';
  WITH candidates AS (
    SELECT d.id FROM public.booking_push_deliveries d
    JOIN public.booking_push_subscriptions s ON s.id = d.subscription_id
    JOIN public.user_profiles p ON p.id = s.user_id AND p.is_active AND p.role = 'admin'
    JOIN auth.sessions a ON a.id = s.session_id AND a.user_id = s.user_id AND (a.not_after IS NULL OR a.not_after > now())
    WHERE d.state IN ('queued', 'sending') AND d.next_attempt_at <= now() AND d.attempts < 5
      AND EXISTS (SELECT 1 FROM public.booking_push_config WHERE enabled)
    ORDER BY d.created_at LIMIT 20 FOR UPDATE OF d SKIP LOCKED
  ), claimed AS (
    UPDATE public.booking_push_deliveries d SET state = 'sending', attempts = attempts + 1,
      lease = gen_random_uuid(), next_attempt_at = now() + interval '2 minutes'
    FROM candidates c WHERE c.id = d.id RETURNING d.*
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'lease', d.lease, 'subscriptionId', s.id,
    'endpoint', s.endpoint, 'keys', jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth),
    'notificationId', n.id, 'kind', n.kind, 'court', n.court_name, 'date', n.booking_date,
    'start', n.start_time, 'end', n.end_time)), '[]'::jsonb) INTO jobs
  FROM claimed d JOIN public.booking_push_subscriptions s ON s.id = d.subscription_id
    JOIN public.booking_notifications n ON n.id = d.notification_id;
  RETURN jobs;
END;
$$;

CREATE FUNCTION public.finish_booking_push(job uuid, claim uuid, result_status integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sub uuid;
BEGIN
  SELECT subscription_id INTO sub FROM public.booking_push_deliveries WHERE id = job AND lease = claim AND state = 'sending' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF result_status IN (404, 410) THEN
    DELETE FROM public.booking_push_subscriptions WHERE id = sub;
    RETURN;
  END IF;
  UPDATE public.booking_push_deliveries SET last_status = result_status,
    state = CASE WHEN result_status BETWEEN 200 AND 299 THEN 'sent'
      WHEN attempts >= 5 OR (result_status BETWEEN 400 AND 499 AND result_status NOT IN (401, 403, 408, 429)) THEN 'failed' ELSE 'queued' END,
    finished_at = CASE WHEN result_status BETWEEN 200 AND 299 OR attempts >= 5
      OR (result_status BETWEEN 400 AND 499 AND result_status NOT IN (401, 403, 408, 429)) THEN now() ELSE NULL END,
    next_attempt_at = now() + make_interval(secs => least(900, 30 * (2 ^ attempts)::integer)), lease = NULL
  WHERE id = job AND lease = claim;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_push_settings(), public.register_booking_push(jsonb), public.unregister_booking_push(text),
  public.wake_booking_push(), public.enqueue_booking_push(), public.revoke_inactive_booking_push(),
  public.claim_booking_push(), public.finish_booking_push(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.booking_push_settings(), public.register_booking_push(jsonb), public.unregister_booking_push(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_push(), public.finish_booking_push(uuid, uuid, integer) TO service_role;
SELECT cron.schedule('booking-push-retry', '* * * * *', 'SELECT public.wake_booking_push()');
SELECT pg_notify('pgrst', 'reload schema');
COMMIT;
