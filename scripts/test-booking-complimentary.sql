DO $test$
DECLARE admin_id uuid; p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); court uuid; b1 uuid; b2 uuid;
  payload jsonb; original_payload jsonb; who uuid:=gen_random_uuid(); parts jsonb; product uuid;
BEGIN
  SELECT id INTO STRICT admin_id FROM public.user_profiles WHERE role='admin' AND is_active LIMIT 1;
  SELECT id INTO STRICT product FROM public.consumables LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  INSERT INTO public.players(id,name,email,phone,current_account_enabled) VALUES(p1,'Bonificado test A','','',false),(p2,'Bonificado test B','','',true);
  INSERT INTO public.courts(name,description,price_per_turn,features) VALUES('Bonificaciones test','Test reversible',10000,'{}') RETURNING id INTO court;
  INSERT INTO public.bookings(court_id,court_name,date,start_time,end_time,total_price,status)
    VALUES(court,'Bonificaciones test','2031-03-01','12:30','14:00',10000,'confirmed') RETURNING id INTO b1;
  payload:=jsonb_build_object('courtId',court,'courtName','Bonificaciones test','date','2031-03-01','startTime','12:30','endTime','14:00',
    'totalPrice',10000,'finalTotal',12000,'status','completed','closedAt',clock_timestamp(),
    'players',jsonb_build_array(
      jsonb_build_object('id',p1,'name','Bonificado test A','isOrganizer',true,'paymentSplits',jsonb_build_array(
        jsonb_build_object('method','complimentary','amount',5000,'complimentaryFor','court','reason','Invitación del dueño'),
        jsonb_build_object('method','complimentary','amount',2000,'complimentaryFor','consumptions','reason','Consumible de cortesía'))),
      jsonb_build_object('id',p2,'name','Bonificado test B','paymentMethod','cash','paymentSplits',jsonb_build_array(jsonb_build_object('method','cash','amount',5000)))),
    'consumptions',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'consumableId',product,'name','Agua de cortesía','price',2000,'quantity',1,'category','drink','splitBetweenPlayers',false,'assignedToPlayers',jsonb_build_array(p1))));
  original_payload:=payload;
  PERFORM public.cash_save_booking(b1,payload);
  PERFORM public.employee_sync_booking_account(b1);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  IF (public.cash_payment_totals('booking',b1)->>'cash')::numeric<>5000 OR EXISTS(SELECT 1 FROM public.current_account_entries WHERE related_booking_id=b1) THEN RAISE EXCEPTION 'Bonificación generó cobro o deuda'; END IF;
  SELECT payment_splits INTO parts FROM public.booking_players WHERE booking_id=b1 AND player_id=p1;
  IF parts#>>'{0,approvedBy}' IS DISTINCT FROM admin_id::text OR parts#>>'{0,reason}'<>'Invitación del dueño' THEN RAISE EXCEPTION 'Falta registro de autorización'; END IF;
  IF array_to_string(public.cash_source_detail('booking',b1),' ') NOT LIKE '%Bonificado%' THEN RAISE EXCEPTION 'Detalle sin bonificación'; END IF;
  PERFORM public.cash_save_booking(b1,jsonb_set(payload,'{players,0,paymentSplits,0,reason}','""'));
  IF EXISTS(SELECT 1 FROM public.booking_players WHERE booking_id=b1 AND player_id=p1 AND payment_splits#>'{0,reason}' IS NOT NULL) THEN RAISE EXCEPTION 'Se registró un motivo vacío'; END IF;
  BEGIN
    PERFORM public.cash_save_booking(b1,jsonb_set(payload,'{players,0,paymentSplits,0,amount}','9000'));
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Bonificación excesiva aceptada' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  SET CONSTRAINTS ALL DEFERRED;
  INSERT INTO public.bookings(court_id,court_name,date,start_time,end_time,total_price,status)
    VALUES(court,'Bonificaciones test','2031-03-02','12:30','14:00',10000,'confirmed') RETURNING id INTO b2;
  payload:=jsonb_set(original_payload,'{date}','"2031-03-02"');
  payload:=jsonb_set(payload,'{players,1,paymentSplits}',jsonb_build_array(jsonb_build_object('method','complimentary','amount',5000,'complimentaryFor','court','reason','Cortesía total')));
  payload:=jsonb_set(payload,'{players,1,paymentMethod}','null');
  PERFORM public.cash_save_booking(b2,payload);
  PERFORM public.employee_sync_booking_account(b2);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  IF (public.cash_payment_totals('booking',b2)->>'cash')::numeric<>0 OR EXISTS(SELECT 1 FROM public.cash_movements WHERE source_type='booking' AND source_id=b2)
    OR EXISTS(SELECT 1 FROM public.current_account_entries WHERE related_booking_id=b2) THEN RAISE EXCEPTION 'Turno totalmente bonificado alteró caja o cuentas'; END IF;
  -- An employee can combine a courtesy for A with credit for B.
  INSERT INTO auth.users(id,email) VALUES(who,who::text||'@example.invalid');
  INSERT INTO public.user_profiles(id,username,password_hash,role,is_active,permissions)
    VALUES(who,who::text,'unused','employee',true,'["bookings.view","bookings.edit","bookings.close"]');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
  payload:=jsonb_set(original_payload,'{players,1,paymentSplits}',jsonb_build_array(jsonb_build_object('method','current_account','amount',5000)));
  payload:=jsonb_set(payload,'{players,1,paymentMethod}','"current_account"');
  PERFORM public.employee_mutate('bookings','update',b1,payload);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT coalesce(sum(amount),0) FROM public.current_account_entries WHERE related_booking_id=b1 AND player_id=p1)<>0
    OR (SELECT coalesce(sum(amount),0) FROM public.current_account_entries WHERE related_booking_id=b1 AND player_id=p2)<>5000 THEN RAISE EXCEPTION 'Cuenta corriente incluye bonificación'; END IF;
  UPDATE public.user_profiles SET permissions='["bookings.view"]' WHERE id=who;
  BEGIN
    UPDATE public.booking_players SET payment_splits=parts WHERE booking_id=b1 AND player_id=p1;
    RAISE EXCEPTION 'Empleado sin permiso bonificó' USING ERRCODE='XX000';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
SET CONSTRAINTS ALL IMMEDIATE;
