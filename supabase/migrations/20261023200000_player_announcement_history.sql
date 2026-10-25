BEGIN;

-- Retain outcomes when subscriptions are removed or the working queue is purged.
CREATE TABLE public.player_announcement_push_history (
  id uuid PRIMARY KEY,
  announcement_id uuid NOT NULL REFERENCES public.player_announcements(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  state text NOT NULL CHECK (state IN ('queued','sending','sent','failed')),
  attempts integer NOT NULL,
  last_status integer,
  next_attempt_at timestamptz,
  created_at timestamptz NOT NULL,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX player_announcement_push_history_parent ON public.player_announcement_push_history(announcement_id,id);
ALTER TABLE public.player_announcement_push_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_announcement_push_history FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.player_announcement_push_history TO service_role;

-- Backfill and start tracking against one consistent working-queue snapshot.
LOCK TABLE public.booking_push_deliveries IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.player_announcement_push_history(id,announcement_id,player_name,state,attempts,last_status,next_attempt_at,created_at,finished_at)
  SELECT d.id,d.announcement_id,coalesce(p.name,'Jugador no disponible'),d.state,d.attempts,d.last_status,d.next_attempt_at,d.created_at,d.finished_at
  FROM public.booking_push_deliveries d
  JOIN public.booking_push_subscriptions s ON s.id=d.subscription_id
  LEFT JOIN public.user_profiles u ON u.id=s.user_id LEFT JOIN public.players p ON p.id=u.player_id
  WHERE d.delivery_type='announcement';

CREATE FUNCTION public.capture_announcement_push_history() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE row_data public.booking_push_deliveries; recipient_name text;
BEGIN
  IF TG_OP='DELETE' THEN row_data := OLD; ELSE row_data := NEW; END IF;
  IF row_data.delivery_type <> 'announcement' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  -- Parent deletion intentionally removes the whole campaign, including its history.
  IF NOT EXISTS(SELECT 1 FROM public.player_announcements WHERE id=row_data.announcement_id) THEN RETURN OLD; END IF;
  SELECT p.name INTO recipient_name FROM public.booking_push_subscriptions s
    JOIN public.user_profiles u ON u.id=s.user_id JOIN public.players p ON p.id=u.player_id
    WHERE s.id=row_data.subscription_id;
  IF TG_OP='DELETE' AND row_data.state IN ('queued','sending') THEN
    row_data.state := 'failed'; row_data.last_status := coalesce(row_data.last_status,409); row_data.finished_at := clock_timestamp();
  END IF;
  INSERT INTO public.player_announcement_push_history(id,announcement_id,player_name,state,attempts,last_status,next_attempt_at,created_at,finished_at)
    VALUES(row_data.id,row_data.announcement_id,coalesce(recipient_name,'Jugador no disponible'),row_data.state,row_data.attempts,row_data.last_status,row_data.next_attempt_at,row_data.created_at,row_data.finished_at)
    ON CONFLICT(id) DO UPDATE SET state=excluded.state,attempts=excluded.attempts,last_status=excluded.last_status,
      next_attempt_at=excluded.next_attempt_at,finished_at=excluded.finished_at,updated_at=clock_timestamp();
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER capture_announcement_push_history AFTER INSERT OR UPDATE OR DELETE ON public.booking_push_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.capture_announcement_push_history();

CREATE OR REPLACE FUNCTION public.finish_booking_push(job uuid, claim uuid, result_status integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE sub uuid;
BEGIN
  SELECT subscription_id INTO sub FROM public.booking_push_deliveries WHERE id=job AND lease=claim AND state='sending' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF result_status IN (404,410) THEN
    -- Record the provider response before the FK cascade removes the working job.
    UPDATE public.booking_push_deliveries SET state='failed',last_status=result_status,finished_at=now(),lease=NULL WHERE id=job;
    DELETE FROM public.booking_push_subscriptions WHERE id=sub;
    RETURN;
  END IF;
  UPDATE public.booking_push_deliveries SET last_status=result_status,
    state=CASE WHEN result_status BETWEEN 200 AND 299 THEN 'sent'
      WHEN attempts>=5 OR (result_status BETWEEN 400 AND 499 AND result_status NOT IN (401,403,408,429)) THEN 'failed' ELSE 'queued' END,
    finished_at=CASE WHEN result_status BETWEEN 200 AND 299 OR attempts>=5
      OR (result_status BETWEEN 400 AND 499 AND result_status NOT IN (401,403,408,429)) THEN now() ELSE NULL END,
    next_attempt_at=now()+make_interval(secs=>least(900,30*(2^attempts)::integer)),lease=NULL
    WHERE id=job AND lease=claim;
END;
$$;

CREATE FUNCTION public.admin_player_announcement_history(before_at timestamptz DEFAULT NULL,before_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE items jsonb;
BEGIN
  IF NOT public.app_is_active_admin() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id DESC),'[]'::jsonb) INTO items FROM (
    SELECT n.id,n.title,n.body,n.created_at,coalesce(u.username,'Administrador no disponible') AS sender,
      coalesce((n.result->>'players')::integer,0) AS players,
      greatest(coalesce((n.result->>'devices')::integer,0),stats.total)::integer AS devices,
      stats.queued,stats.sending,stats.sent,stats.failed,
      greatest(0,coalesce((n.result->>'devices')::integer,0)-stats.total)::integer AS untracked,
      (SELECT count(DISTINCT player_id)::integer FROM public.player_announcement_recipients WHERE announcement_id=n.id AND read_at IS NOT NULL) AS read_players
    FROM public.player_announcements n LEFT JOIN public.user_profiles u ON u.id=n.sender_id
    CROSS JOIN LATERAL (SELECT count(*)::integer AS total,count(*) FILTER(WHERE state='queued')::integer AS queued,
      count(*) FILTER(WHERE state='sending')::integer AS sending,count(*) FILTER(WHERE state='sent')::integer AS sent,
      count(*) FILTER(WHERE state='failed')::integer AS failed FROM public.player_announcement_push_history WHERE announcement_id=n.id) stats
    WHERE before_at IS NULL OR (n.created_at,n.id)<(before_at,before_id)
    ORDER BY n.created_at DESC,n.id DESC LIMIT 21
  ) x;
  RETURN items;
END;
$$;

CREATE FUNCTION public.admin_player_announcement_deliveries(target uuid,before_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE items jsonb;
BEGIN
  IF NOT public.app_is_active_admin() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) INTO items FROM (
    SELECT id,player_name,state,attempts,last_status,next_attempt_at,created_at,finished_at
    FROM public.player_announcement_push_history WHERE announcement_id=target AND (before_id IS NULL OR id>before_id)
    ORDER BY id LIMIT 31
  ) x;
  RETURN items;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_announcement_push_history(),public.admin_player_announcement_history(timestamptz,uuid),
  public.admin_player_announcement_deliveries(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_player_announcement_history(timestamptz,uuid),public.admin_player_announcement_deliveries(uuid,uuid) TO authenticated;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
