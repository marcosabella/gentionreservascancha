-- Backward-compatible employee permissions. Apply to the isolated local database
-- while testing; production application requires an explicit release request.
BEGIN;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_role_check CHECK (role IN ('admin','player','employee'));
ALTER TABLE public.user_profiles DROP CONSTRAINT IF EXISTS user_profiles_permissions_array;
ALTER TABLE public.user_profiles ADD CONSTRAINT user_profiles_permissions_array CHECK (jsonb_typeof(permissions) = 'array');
GRANT SELECT (permissions) ON public.user_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.employee_has_permission(permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id=auth.uid()
    AND p.role='employee' AND p.is_active AND p.permissions ? permission
    AND p.permissions ? (split_part(permission,'.',1)||'.view'));
$$;

CREATE OR REPLACE FUNCTION public.employee_table_access(target_table text, operation text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE profile public.user_profiles; module text; needed text;
BEGIN
  SELECT * INTO profile FROM public.user_profiles WHERE id=auth.uid();
  IF profile.id IS NULL OR NOT profile.is_active THEN RETURN false; END IF;
  IF profile.role <> 'employee' THEN RETURN true; END IF;
  IF operation='select' THEN
    RETURN CASE
      WHEN target_table IN ('courts','schedule_settings') THEN profile.permissions ?| ARRAY['courts.view','bookings.view','recurring.view','availability.view']
      WHEN target_table='players' THEN profile.permissions ?| ARRAY['players.view','bookings.create','bookings.edit','bookings.close','recurring.view','sales.create','sales.edit','accounts.view','tournaments.view']
      WHEN target_table IN ('consumables','consumable_categories') THEN profile.permissions ?| ARRAY['products.view','bookings.create','bookings.edit','bookings.close','sales.create','sales.edit']
      WHEN target_table IN ('bookings','booking_players','booking_consumptions') THEN profile.permissions ?| ARRAY['bookings.view','recurring.view','sales.view']
      WHEN target_table='recurring_bookings' THEN profile.permissions ?| ARRAY['recurring.view','bookings.view']
      WHEN target_table='court_unavailabilities' THEN profile.permissions ?| ARRAY['availability.view','bookings.view','recurring.view']
      WHEN target_table IN ('sales','sale_items') THEN profile.permissions ? 'sales.view'
      WHEN target_table='current_account_entries' THEN profile.permissions ? 'accounts.view'
      WHEN target_table='tournaments' THEN profile.permissions ? 'tournaments.view'
      ELSE false END;
  END IF;
  -- Composite mutations use employee_mutate so parents, children and account
  -- entries are checked and committed together. Direct employee writes are denied.
  IF target_table IN ('bookings','booking_players','booking_consumptions','sales','sale_items','current_account_entries','user_profiles','system_config') THEN RETURN false; END IF;
  module := CASE target_table WHEN 'courts' THEN 'courts' WHEN 'schedule_settings' THEN 'courts'
    WHEN 'players' THEN 'players' WHEN 'consumables' THEN 'products' WHEN 'consumable_categories' THEN 'products'
    WHEN 'recurring_bookings' THEN 'recurring' WHEN 'court_unavailabilities' THEN 'availability' WHEN 'tournaments' THEN 'tournaments' END;
  IF module IS NULL THEN RETURN false; END IF;
  needed := CASE operation WHEN 'insert' THEN 'create' WHEN 'update' THEN 'edit' WHEN 'delete' THEN 'delete' END;
  IF target_table='consumable_categories' THEN needed:='categories'; END IF;
  IF target_table='schedule_settings' THEN needed:='edit'; END IF;
  IF target_table='tournaments' AND operation IN ('insert','update') THEN needed:='manage'; END IF;
  RETURN public.employee_has_permission(module||'.'||needed);
END;
$$;

DO $policies$
DECLARE target record; operation text;
BEGIN
  FOR target IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'user_profiles' LOOP
    FOREACH operation IN ARRAY ARRAY['select','insert','update','delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','employee_'||operation,target.tablename);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s',
        'employee_'||operation, target.tablename, operation,
        CASE WHEN operation='insert' THEN format('WITH CHECK ((SELECT public.employee_table_access(%L,%L)))',target.tablename,operation)
          WHEN operation='update' THEN format('USING ((SELECT public.employee_table_access(%L,%L))) WITH CHECK ((SELECT public.employee_table_access(%L,%L)))',target.tablename,operation,target.tablename,operation)
          ELSE format('USING ((SELECT public.employee_table_access(%L,%L)))',target.tablename,operation) END);
    END LOOP;
  END LOOP;
END;
$policies$;

CREATE OR REPLACE FUNCTION public.employee_sync_booking_account(target_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.bookings; p public.booking_players; c public.booking_consumptions;
  player_count integer; court_cost numeric; player_cost numeric; charge numeric; paid numeric;
BEGIN
  SELECT * INTO STRICT b FROM public.bookings WHERE id=target_id;
  DELETE FROM public.current_account_entries WHERE related_booking_id=target_id;
  IF b.status <> 'completed' THEN RETURN; END IF;
  SELECT count(*) INTO player_count FROM public.booking_players WHERE booking_id=target_id;
  IF player_count=0 THEN RETURN; END IF;
  SELECT CASE WHEN b.total_price>0 THEN b.total_price ELSE greatest(coalesce(b.final_total,0)-coalesce(sum(price*quantity),0),0) END
    INTO court_cost FROM public.booking_consumptions WHERE booking_id=target_id;
  FOR p IN SELECT * FROM public.booking_players WHERE booking_id=target_id LOOP
    player_cost := court_cost/player_count;
    FOR c IN SELECT * FROM public.booking_consumptions WHERE booking_id=target_id LOOP
      IF c.split_between_players THEN player_cost:=player_cost+c.price*c.quantity::numeric/player_count;
      ELSIF cardinality(c.assigned_to_players)>0 AND p.player_id=ANY(c.assigned_to_players) THEN
        player_cost:=player_cost+c.price*c.quantity::numeric/cardinality(c.assigned_to_players);
      END IF;
    END LOOP;
    charge:=0;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.payment_splits,'[]'::jsonb)) split WHERE split->>'method'='current_account') THEN
      SELECT coalesce(sum((split->>'amount')::numeric),0),coalesce(sum((split->>'amount')::numeric) FILTER(WHERE split->>'method'='current_account'),0)
        INTO paid,charge FROM jsonb_array_elements(p.payment_splits) split;
      charge:=charge+greatest(round(player_cost-paid,2),0);
    ELSIF p.payment_method='current_account' THEN charge:=player_cost;
    END IF;
    IF charge>0 THEN
      INSERT INTO public.current_account_entries(player_id,type,amount,description,date,time,related_booking_id)
        VALUES(p.player_id,'debit',round(charge,2),'Turno - '||b.court_name,b.date,b.start_time,target_id);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.employee_mutate(resource text, action text, record_id uuid DEFAULT NULL, payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE profile public.user_profiles; result_id uuid; item jsonb; b public.bookings;
  recurring public.recurring_bookings; s public.sales; needed text; next_status text;
BEGIN
  SELECT * INTO profile FROM public.user_profiles WHERE id=auth.uid();
  IF profile.id IS NULL OR profile.role<>'employee' OR NOT profile.is_active THEN RAISE EXCEPTION 'Empleado activo requerido' USING ERRCODE='42501'; END IF;
  IF resource='bookings' THEN
    IF action='create' THEN
      IF NOT public.employee_has_permission('bookings.create') THEN
        IF NOT (public.employee_has_permission('recurring.create') OR public.employee_has_permission('recurring.edit')) OR nullif(payload->>'recurringBookingId','') IS NULL THEN
          RAISE EXCEPTION 'Sin permiso para crear reservas' USING ERRCODE='42501';
        END IF;
        SELECT * INTO STRICT recurring FROM public.recurring_bookings WHERE id=(payload->>'recurringBookingId')::uuid;
        IF NOT recurring.is_active OR recurring.court_id<>(payload->>'courtId')::uuid OR recurring.start_time<>(payload->>'startTime')::time OR recurring.end_time<>(payload->>'endTime')::time THEN
          RAISE EXCEPTION 'La reserva no corresponde al turno fijo' USING ERRCODE='42501';
        END IF;
      END IF;
      IF coalesce(payload->>'status','confirmed') NOT IN ('confirmed','pending') THEN RAISE EXCEPTION 'Estado inicial no permitido' USING ERRCODE='42501'; END IF;
      INSERT INTO public.bookings(court_id,court_name,date,start_time,end_time,total_price,status,is_recurring,recurring_booking_id)
      VALUES((payload->>'courtId')::uuid,payload->>'courtName',(payload->>'date')::date,(payload->>'startTime')::time,(payload->>'endTime')::time,
        coalesce((payload->>'totalPrice')::numeric,0),coalesce(payload->>'status','confirmed'),coalesce((payload->>'isRecurring')::boolean,false),nullif(payload->>'recurringBookingId','')::uuid)
      RETURNING id INTO result_id;
    ELSIF action='update' THEN
      SELECT * INTO STRICT b FROM public.bookings WHERE id=record_id FOR UPDATE;
      result_id:=b.id; next_status:=coalesce(payload->>'status',b.status);
      needed:=CASE WHEN next_status='cancelled' AND b.status<>'cancelled' THEN 'cancel'
        WHEN next_status='completed' AND b.status<>'completed' THEN 'close' ELSE 'edit' END;
      IF NOT public.employee_has_permission('bookings.'||needed) THEN
        -- Editing a recurring template can synchronize its pending reservations,
        -- but cannot modify unrelated reservations, consumptions or payments.
        IF needed='edit' AND b.recurring_booking_id IS NOT NULL AND b.status NOT IN ('completed','cancelled')
          AND public.employee_has_permission('recurring.edit') THEN
          SELECT * INTO STRICT recurring FROM public.recurring_bookings WHERE id=b.recurring_booking_id;
          IF (payload->>'courtId')::uuid IS DISTINCT FROM recurring.court_id OR (payload->>'startTime')::time IS DISTINCT FROM recurring.start_time
            OR (payload->>'endTime')::time IS DISTINCT FROM recurring.end_time OR (payload->>'date')::date IS DISTINCT FROM b.date
            OR (payload->>'totalPrice')::numeric IS DISTINCT FROM b.total_price OR next_status IS DISTINCT FROM b.status THEN
            RAISE EXCEPTION 'Solo se permite sincronizar los datos del turno fijo' USING ERRCODE='42501';
          END IF;
          UPDATE public.bookings SET court_id=recurring.court_id,court_name=recurring.court_name,start_time=recurring.start_time,end_time=recurring.end_time WHERE id=result_id;
          DELETE FROM public.booking_players WHERE booking_id=result_id AND (is_organizer OR player_id=recurring.player_id);
          INSERT INTO public.booking_players(booking_id,player_id,player_name,player_email,player_phone,is_organizer)
            SELECT result_id,id,recurring.player_name,email,phone,true FROM public.players WHERE id=recurring.player_id;
          RETURN result_id;
        END IF;
        RAISE EXCEPTION 'Accion de reserva no permitida' USING ERRCODE='42501';
      END IF;
      IF needed IN ('cancel','close') AND b.status<>'confirmed' THEN
        RAISE EXCEPTION 'Solo se cancelan o cierran reservas confirmadas' USING ERRCODE='42501';
      END IF;
      IF needed='cancel' THEN
        IF payload - 'status' <> '{}'::jsonb THEN RAISE EXCEPTION 'Cancelar no permite modificar otros datos' USING ERRCODE='42501'; END IF;
        UPDATE public.bookings SET status='cancelled' WHERE id=result_id;
        RETURN result_id;
      END IF;
      IF needed='close' AND ((payload->>'courtId')::uuid IS DISTINCT FROM b.court_id OR (payload->>'date')::date IS DISTINCT FROM b.date
        OR (payload->>'startTime')::time IS DISTINCT FROM b.start_time OR (payload->>'endTime')::time IS DISTINCT FROM b.end_time) THEN
        RAISE EXCEPTION 'Cerrar un turno no permite cambiar su horario o cancha' USING ERRCODE='42501';
      END IF;
      IF needed='edit' AND next_status IS DISTINCT FROM b.status THEN RAISE EXCEPTION 'El cambio de estado requiere permiso especifico' USING ERRCODE='42501'; END IF;
      UPDATE public.bookings SET court_id=coalesce((payload->>'courtId')::uuid,court_id),court_name=coalesce(payload->>'courtName',court_name),
        date=coalesce((payload->>'date')::date,date),start_time=coalesce((payload->>'startTime')::time,start_time),end_time=coalesce((payload->>'endTime')::time,end_time),
        total_price=coalesce((payload->>'totalPrice')::numeric,total_price),final_total=coalesce((payload->>'finalTotal')::numeric,final_total),
        status=next_status,closed_at=coalesce((payload->>'closedAt')::timestamptz,closed_at) WHERE id=result_id;
    ELSE RAISE EXCEPTION 'Accion no permitida' USING ERRCODE='42501'; END IF;
    IF payload ? 'players' THEN
      DELETE FROM public.booking_players WHERE booking_id=result_id;
      FOR item IN SELECT * FROM jsonb_array_elements(payload->'players') LOOP
        INSERT INTO public.booking_players(booking_id,player_id,player_name,player_email,player_phone,is_organizer,payment_method,payment_splits)
        VALUES(result_id,(item->>'id')::uuid,item->>'name',coalesce(item->>'email',''),coalesce(item->>'phone',''),coalesce((item->>'isOrganizer')::boolean,false),item->>'paymentMethod',nullif(item->'paymentSplits','null'::jsonb));
      END LOOP;
    END IF;
    IF payload ? 'consumptions' THEN
      DELETE FROM public.booking_consumptions WHERE booking_id=result_id;
      FOR item IN SELECT * FROM jsonb_array_elements(payload->'consumptions') LOOP
        INSERT INTO public.booking_consumptions(booking_id,consumable_id,name,price,quantity,category,split_between_players,assigned_to_players)
        VALUES(result_id,coalesce(nullif(item->>'consumableId',''),item->>'id')::uuid,item->>'name',(item->>'price')::numeric,(item->>'quantity')::integer,
          coalesce(item->>'category','other'),coalesce((item->>'splitBetweenPlayers')::boolean,true),ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(item->'assignedToPlayers','[]'::jsonb))));
      END LOOP;
    END IF;
    IF action='update' THEN PERFORM public.employee_sync_booking_account(result_id); END IF;
    RETURN result_id;
  ELSIF resource='sales' THEN
    needed:=CASE action WHEN 'create' THEN 'create' WHEN 'update' THEN 'edit' WHEN 'delete' THEN 'delete' END;
    IF needed IS NULL OR NOT public.employee_has_permission('sales.'||needed) THEN RAISE EXCEPTION 'Accion de ventas no permitida' USING ERRCODE='42501'; END IF;
    IF action='delete' THEN
      SELECT * INTO STRICT s FROM public.sales WHERE id=record_id FOR UPDATE;
      IF s.type<>'direct' OR s.booking_id IS NOT NULL THEN RAISE EXCEPTION 'No se elimina una venta de reserva' USING ERRCODE='42501'; END IF;
      DELETE FROM public.current_account_entries WHERE related_sale_id=record_id;
      DELETE FROM public.sale_items WHERE sale_id=record_id;
      DELETE FROM public.sales WHERE id=record_id;
      RETURN record_id;
    ELSIF action='create' THEN
      INSERT INTO public.sales(type,date,time,customer_type,customer_id,customer_name,customer_email,customer_phone,total_amount,payment_method,notes)
      VALUES('direct',(payload->>'date')::date,(payload->>'time')::time,payload->>'customerType',nullif(payload#>>'{customer,id}','')::uuid,payload#>>'{customer,name}',
        payload#>>'{customer,email}',payload#>>'{customer,phone}',(payload->>'totalAmount')::numeric,payload->>'paymentMethod',payload->>'notes') RETURNING id INTO result_id;
    ELSE
      SELECT * INTO STRICT s FROM public.sales WHERE id=record_id FOR UPDATE;
      IF s.type<>'direct' OR s.booking_id IS NOT NULL THEN RAISE EXCEPTION 'No se modifica una venta de reserva' USING ERRCODE='42501'; END IF;
      result_id:=record_id;
      UPDATE public.sales SET date=(payload->>'date')::date,time=(payload->>'time')::time,customer_type=payload->>'customerType',customer_id=nullif(payload#>>'{customer,id}','')::uuid,
        customer_name=payload#>>'{customer,name}',customer_email=payload#>>'{customer,email}',customer_phone=payload#>>'{customer,phone}',total_amount=(payload->>'totalAmount')::numeric,
        payment_method=payload->>'paymentMethod',notes=payload->>'notes' WHERE id=result_id;
      DELETE FROM public.sale_items WHERE sale_id=result_id;
      DELETE FROM public.current_account_entries WHERE related_sale_id=result_id;
    END IF;
    FOR item IN SELECT * FROM jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.consumables WHERE id=(item->>'consumableId')::uuid)
        OR coalesce((item->>'quantity')::integer,0)<=0 OR coalesce((item->>'price')::numeric,-1)<0
        OR (item->>'subtotal')::numeric IS DISTINCT FROM (item->>'price')::numeric*(item->>'quantity')::integer THEN
        RAISE EXCEPTION 'Producto o importe de venta no valido' USING ERRCODE='22023';
      END IF;
      INSERT INTO public.sale_items(sale_id,consumable_id,name,price,quantity,subtotal)
      VALUES(result_id,(item->>'consumableId')::uuid,item->>'name',(item->>'price')::numeric,(item->>'quantity')::integer,(item->>'subtotal')::numeric);
    END LOOP;
    SELECT * INTO s FROM public.sales WHERE id=result_id;
    IF s.payment_method='current_account' AND s.customer_id IS NOT NULL THEN
      INSERT INTO public.current_account_entries(player_id,type,amount,description,date,time,related_sale_id)
        VALUES(s.customer_id,'debit',s.total_amount,'Venta directa',s.date,s.time,result_id);
    END IF;
    RETURN result_id;
  ELSIF resource='accounts' THEN
    IF action='create' AND public.employee_has_permission('accounts.pay') AND payload->>'type'='credit'
      AND coalesce((payload->>'amount')::numeric,0)>0 AND nullif(payload->>'relatedBookingId','') IS NULL AND nullif(payload->>'relatedSaleId','') IS NULL THEN
      INSERT INTO public.current_account_entries(player_id,type,amount,description,date,time,payment_method)
      VALUES((payload->>'playerId')::uuid,'credit',(payload->>'amount')::numeric,payload->>'description',(payload->>'date')::date,(payload->>'time')::time,payload->>'paymentMethod') RETURNING id INTO result_id;
      RETURN result_id;
    ELSIF action='delete' AND public.employee_has_permission('accounts.delete') THEN
      DELETE FROM public.current_account_entries WHERE id=record_id RETURNING id INTO result_id;
      RETURN result_id;
    END IF;
  END IF;
  RAISE EXCEPTION 'Accion no permitida' USING ERRCODE='42501';
END;
$$;

REVOKE ALL ON FUNCTION public.employee_has_permission(text),public.employee_table_access(text,text),public.employee_mutate(text,text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.employee_has_permission(text),public.employee_table_access(text,text),public.employee_mutate(text,text,uuid,jsonb) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.employee_sync_booking_account(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.employee_sync_booking_account(uuid) TO service_role;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
