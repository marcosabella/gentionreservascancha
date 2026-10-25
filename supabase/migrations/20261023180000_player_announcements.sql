BEGIN;

CREATE TABLE public.player_announcements (
  id uuid PRIMARY KEY,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 100),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 2000),
  filters jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.player_announcement_recipients (
  announcement_id uuid NOT NULL REFERENCES public.player_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  read_at timestamptz,
  PRIMARY KEY (announcement_id, user_id)
);
CREATE INDEX player_announcement_recipients_user ON public.player_announcement_recipients(user_id, announcement_id);
CREATE INDEX player_announcements_recent ON public.player_announcements(created_at DESC, id DESC);
ALTER TABLE public.player_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_announcement_recipients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_announcements, public.player_announcement_recipients FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.player_announcements, public.player_announcement_recipients TO service_role;

ALTER TABLE public.booking_push_deliveries
  DROP CONSTRAINT booking_push_deliveries_delivery_type_check,
  DROP CONSTRAINT booking_push_delivery_source,
  ADD COLUMN announcement_id uuid REFERENCES public.player_announcements(id) ON DELETE CASCADE,
  ADD CONSTRAINT booking_push_deliveries_delivery_type_check CHECK (delivery_type IN ('admin','reminder','announcement')),
  ADD CONSTRAINT booking_push_delivery_source CHECK (
    (delivery_type = 'admin' AND notification_id IS NOT NULL AND booking_id IS NULL AND scheduled_start IS NULL AND announcement_id IS NULL) OR
    (delivery_type = 'reminder' AND notification_id IS NULL AND booking_id IS NOT NULL AND scheduled_start IS NOT NULL AND announcement_id IS NULL) OR
    (delivery_type = 'announcement' AND notification_id IS NULL AND booking_id IS NULL AND scheduled_start IS NULL AND announcement_id IS NOT NULL)
  ),
  ADD UNIQUE (announcement_id, subscription_id);

CREATE FUNCTION public.player_announcement_audience() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.app_is_active_admin() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name, x.id), '[]'::jsonb) FROM (
    SELECT p.id, p.name, p.category, p.gender, count(s.id) AS push_devices
    FROM public.players p JOIN public.user_profiles u ON u.player_id = p.id AND u.is_active AND u.role = 'player'
    LEFT JOIN public.booking_push_subscriptions s ON s.user_id = u.id
      AND EXISTS (SELECT 1 FROM auth.sessions a WHERE a.id = s.session_id AND a.user_id = u.id AND (a.not_after IS NULL OR a.not_after > now()))
      AND EXISTS (SELECT 1 FROM public.booking_push_config WHERE enabled)
    GROUP BY p.id
  ) x);
END;
$$;

CREATE FUNCTION public.send_player_announcement(request_id uuid, heading text, message text, filters jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing public.player_announcements; chosen_category integer; chosen_gender text; chosen_player uuid;
  player_count integer; device_count integer; send_result jsonb;
BEGIN
  IF NOT public.app_is_active_admin() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501'; END IF;
  IF request_id IS NULL OR heading IS NULL OR message IS NULL OR length(btrim(heading)) NOT BETWEEN 1 AND 100
    OR length(btrim(message)) NOT BETWEEN 1 AND 2000 OR filters IS NULL OR jsonb_typeof(filters) <> 'object' THEN
    RAISE EXCEPTION 'Título, mensaje o filtros inválidos';
  END IF;
  chosen_category := (filters->>'category')::integer;
  chosen_gender := filters->>'gender';
  chosen_player := (filters->>'player_id')::uuid;
  IF (chosen_category IS NOT NULL AND chosen_category NOT BETWEEN 1 AND 8)
    OR (chosen_gender IS NOT NULL AND chosen_gender NOT IN ('masculino','femenino'))
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(filters) k WHERE k NOT IN ('category','gender','player_id')) THEN
    RAISE EXCEPTION 'Filtros inválidos';
  END IF;
  -- A retry with the same UUID returns the committed result; concurrent submits serialize.
  PERFORM pg_advisory_xact_lock(hashtextextended(request_id::text, 23180000));
  SELECT * INTO existing FROM public.player_announcements WHERE id = request_id;
  IF FOUND THEN
    IF existing.sender_id IS DISTINCT FROM auth.uid() OR existing.title <> btrim(heading)
      OR existing.body <> btrim(message) OR existing.filters <> filters THEN RAISE EXCEPTION 'Solicitud de envío ya utilizada'; END IF;
    RETURN existing.result;
  END IF;
  INSERT INTO public.player_announcements(id,sender_id,title,body,filters) VALUES(request_id,auth.uid(),btrim(heading),btrim(message),filters);
  INSERT INTO public.player_announcement_recipients(announcement_id,user_id,player_id)
    SELECT request_id,u.id,p.id FROM public.players p
    JOIN public.user_profiles u ON u.player_id = p.id AND u.is_active AND u.role = 'player'
    WHERE (chosen_category IS NULL OR p.category = chosen_category) AND (chosen_gender IS NULL OR p.gender = chosen_gender)
      AND (chosen_player IS NULL OR p.id = chosen_player);
  SELECT count(DISTINCT player_id) INTO player_count FROM public.player_announcement_recipients WHERE announcement_id = request_id;
  IF player_count = 0 THEN RAISE EXCEPTION 'No hay jugadores con cuenta activa para estos filtros'; END IF;
  INSERT INTO public.booking_push_deliveries(delivery_type,announcement_id,subscription_id)
    SELECT 'announcement',request_id,s.id FROM public.player_announcement_recipients r
    JOIN public.booking_push_subscriptions s ON s.user_id = r.user_id
    JOIN auth.sessions a ON a.id = s.session_id AND a.user_id = r.user_id AND (a.not_after IS NULL OR a.not_after > now())
    WHERE r.announcement_id = request_id AND EXISTS (SELECT 1 FROM public.booking_push_config WHERE enabled);
  GET DIAGNOSTICS device_count = ROW_COUNT;
  send_result := jsonb_build_object('players',player_count,'devices',device_count);
  UPDATE public.player_announcements SET result = send_result WHERE id = request_id;
  PERFORM public.wake_booking_push();
  RETURN send_result;
END;
$$;

CREATE FUNCTION public.player_announcement_feed(before_at timestamptz DEFAULT NULL, before_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE profile public.user_profiles; items jsonb; unread_count bigint;
BEGIN
  SELECT * INTO profile FROM public.user_profiles WHERE id = auth.uid() AND is_active AND role = 'player' AND player_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Se requiere un jugador activo' USING ERRCODE = '42501'; END IF;
  SELECT count(*) INTO unread_count FROM public.player_announcement_recipients
    WHERE user_id = profile.id AND player_id = profile.player_id AND read_at IS NULL;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC, x.id DESC),'[]'::jsonb) INTO items FROM (
    SELECT n.id,n.title,n.body,n.created_at,r.read_at FROM public.player_announcements n
    JOIN public.player_announcement_recipients r ON r.announcement_id = n.id
    WHERE r.user_id = profile.id AND r.player_id = profile.player_id
      AND (before_at IS NULL OR (n.created_at,n.id) < (before_at,before_id))
    ORDER BY n.created_at DESC,n.id DESC LIMIT 31
  ) x;
  RETURN jsonb_build_object('items',items,'unreadCount',unread_count);
END;
$$;

CREATE FUNCTION public.read_player_announcement(target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.player_announcement_recipients r SET read_at = coalesce(r.read_at,now())
  FROM public.user_profiles p WHERE p.id = auth.uid() AND p.is_active AND p.role = 'player'
    AND r.user_id = p.id AND r.player_id = p.player_id AND r.announcement_id = target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notificación no disponible' USING ERRCODE = '42501'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.player_announcement_audience(), public.send_player_announcement(uuid,text,text,jsonb),
  public.player_announcement_feed(timestamptz,uuid), public.read_player_announcement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_announcement_audience(), public.send_player_announcement(uuid,text,text,jsonb),
  public.player_announcement_feed(timestamptz,uuid), public.read_player_announcement(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.booking_push_delivery_allowed(job uuid) RETURNS boolean
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
      (d.delivery_type = 'announcement' AND p.role = 'player' AND d.created_at > now() - interval '24 hours'
        AND EXISTS (SELECT 1 FROM public.player_announcement_recipients r
          WHERE r.announcement_id = d.announcement_id AND r.user_id = p.id AND r.player_id = p.player_id)) OR
      (d.delivery_type = 'reminder' AND p.role = 'player' AND cfg.reminders_enabled AND b.status = 'confirmed'
        AND d.scheduled_start = public.booking_push_start(b.date,b.start_time)
        AND d.scheduled_start > now() AND d.scheduled_start - make_interval(mins => cfg.reminder_minutes) <= now()
        AND EXISTS (SELECT 1 FROM public.booking_players bp WHERE bp.booking_id = b.id AND bp.player_id = p.player_id))
    ));
$$;

CREATE OR REPLACE FUNCTION public.claim_booking_push() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE jobs jsonb;
BEGIN
  PERFORM public.queue_booking_reminders();
  DELETE FROM public.booking_push_subscriptions s USING auth.sessions a WHERE a.id = s.session_id AND a.not_after <= now();
  UPDATE public.booking_push_deliveries SET state = 'failed', finished_at = now()
    WHERE state IN ('queued','sending') AND next_attempt_at <= now() AND (attempts >= 5 OR (delivery_type = 'admin' AND created_at < now() - interval '1 hour') OR (delivery_type = 'announcement' AND created_at < now() - interval '24 hours'));
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
    'kind', CASE WHEN d.delivery_type = 'announcement' THEN 'announcement' WHEN d.delivery_type = 'reminder' THEN 'reminder' ELSE n.kind END,
    'announcementId', d.announcement_id, 'title', msg.title, 'body', msg.body,
    'court', CASE WHEN d.delivery_type = 'reminder' THEN b.court_name ELSE n.court_name END,
    'date', CASE WHEN d.delivery_type = 'reminder' THEN b.date ELSE n.booking_date END,
    'start', CASE WHEN d.delivery_type = 'reminder' THEN b.start_time ELSE n.start_time END,
    'end', CASE WHEN d.delivery_type = 'reminder' THEN b.end_time ELSE n.end_time END)), '[]'::jsonb) INTO jobs
  FROM claimed d JOIN public.booking_push_subscriptions s ON s.id = d.subscription_id
  LEFT JOIN public.player_announcements msg ON msg.id = d.announcement_id
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
      AND (d.delivery_type IN ('admin','announcement') OR (SELECT reminders_enabled FROM public.booking_push_config))
  ) THEN RETURN; END IF;
  SELECT decrypted_secret INTO destination FROM vault.decrypted_secrets WHERE name = 'booking_push_dispatch_url';
  SELECT decrypted_secret INTO credential FROM vault.decrypted_secrets WHERE name = 'booking_push_dispatch_token';
  IF destination IS NULL OR credential IS NULL THEN RETURN; END IF;
  PERFORM net.http_post(url := destination, headers := jsonb_build_object('Content-Type','application/json','x-push-dispatch-token',credential), body := '{}'::jsonb, timeout_milliseconds := 5000);
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'No se pudo despertar el envío push; se reintentará por cron';
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
COMMIT;
