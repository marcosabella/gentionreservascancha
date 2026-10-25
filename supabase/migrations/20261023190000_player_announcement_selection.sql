BEGIN;

-- Keep the original filter API working and accept an explicit recipient grid.
CREATE OR REPLACE FUNCTION public.send_player_announcement(request_id uuid, heading text, message text, filters jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing public.player_announcements; chosen_category integer; chosen_gender text; chosen_player uuid; chosen_players uuid[];
  player_count integer; device_count integer; send_result jsonb;
BEGIN
  IF NOT public.app_is_active_admin() THEN RAISE EXCEPTION 'Solo administradores' USING ERRCODE = '42501'; END IF;
  IF request_id IS NULL OR heading IS NULL OR message IS NULL OR length(btrim(heading)) NOT BETWEEN 1 AND 100
    OR length(btrim(message)) NOT BETWEEN 1 AND 2000 OR filters IS NULL OR jsonb_typeof(filters) <> 'object' THEN
    RAISE EXCEPTION 'Título, mensaje o filtros inválidos';
  END IF;
  IF filters ? 'player_ids' THEN
    IF jsonb_typeof(filters->'player_ids') <> 'array' THEN RAISE EXCEPTION 'La selección debe ser una lista de jugadores'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(filters->'player_ids') item WHERE jsonb_typeof(item) <> 'string') THEN
      RAISE EXCEPTION 'La selección contiene jugadores inválidos';
    END IF;
    SELECT coalesce(array_agg(DISTINCT item::uuid), ARRAY[]::uuid[]) INTO chosen_players
      FROM jsonb_array_elements_text(filters->'player_ids') item;
    IF cardinality(chosen_players) = 0 THEN RAISE EXCEPTION 'Seleccioná al menos un jugador'; END IF;
  END IF;
  chosen_category := (filters->>'category')::integer;
  chosen_gender := filters->>'gender';
  chosen_player := (filters->>'player_id')::uuid;
  IF (chosen_category IS NOT NULL AND chosen_category NOT BETWEEN 1 AND 8)
    OR (chosen_gender IS NOT NULL AND chosen_gender NOT IN ('masculino','femenino'))
    OR EXISTS (SELECT 1 FROM jsonb_object_keys(filters) k WHERE k NOT IN ('category','gender','player_id','player_ids')) THEN
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
      AND (chosen_player IS NULL OR p.id = chosen_player)
      AND (chosen_players IS NULL OR p.id = ANY(chosen_players));
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

SELECT pg_notify('pgrst', 'reload schema');
COMMIT;
