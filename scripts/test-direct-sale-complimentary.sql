DO $test$
DECLARE admin_id uuid; customer uuid:=gen_random_uuid(); guest uuid:=gen_random_uuid(); product uuid; sale_id uuid; full_sale uuid;
  payload jsonb; saved jsonb; who uuid:=gen_random_uuid();
BEGIN
  SELECT id INTO STRICT admin_id FROM public.user_profiles WHERE role='admin' AND is_active LIMIT 1;
  SELECT id INTO STRICT product FROM public.consumables LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  INSERT INTO public.players(id,name,email,phone,current_account_enabled) VALUES(customer,'Bonificación venta test','','',true);
  payload:=jsonb_build_object('type','direct','date','2031-03-01','time','12:00','customerType','registered','customer',jsonb_build_object('id',customer,'name','Bonificación venta test'),
    'paymentMethod','cash','totalAmount',100.02,'items',jsonb_build_array(jsonb_build_object('consumableId',product,'name','Producto test','price',100.02,'quantity',1,'subtotal',100.02)),
    'distribution',jsonb_build_object('items','[]'::jsonb,'participants',jsonb_build_array(
      jsonb_build_object('id',customer,'name','Bonificación venta test','registered',true,'paymentMethod','current_account','complimentary',jsonb_build_object('amount',20,'reason','Descuento de cortesía')),
      jsonb_build_object('id',guest,'name','Cliente ocasional test','registered',false,'paymentMethod','complimentary','complimentary',jsonb_build_object('amount',99999,'reason','Invitación del dueño')))));
  sale_id:=public.save_shared_sale('create',NULL,payload);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT sum(amount) FROM public.current_account_entries WHERE related_sale_id=sale_id)<>30.01 OR
    (public.cash_payment_totals('sale',sale_id)->>'cash')::numeric<>0 OR EXISTS(SELECT 1 FROM public.cash_movements WHERE source_type='sale' AND source_id=sale_id) THEN RAISE EXCEPTION 'Bonificación generó caja o deuda incorrecta'; END IF;
  SELECT distribution INTO saved FROM public.sales WHERE id=sale_id;
  IF saved#>>'{participants,1,complimentary,approvedBy}' IS DISTINCT FROM admin_id::text OR (saved#>>'{participants,1,complimentary,amount}')::numeric<>50.01 THEN RAISE EXCEPTION 'Falta registro o cálculo de bonificación'; END IF;
  IF array_to_string(public.cash_source_detail('sale',sale_id),' ') NOT LIKE '%Bonificado%' THEN RAISE EXCEPTION 'Detalle sin bonificación'; END IF;
  BEGIN
    PERFORM public.save_shared_sale('update',sale_id,jsonb_set(payload,'{distribution,participants,0,complimentary,amount}','90'));
    RAISE EXCEPTION 'Bonificación excesiva aceptada' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  PERFORM public.save_shared_sale('update',sale_id,jsonb_set(payload,'{distribution,participants,1,complimentary,reason}','""'));
  IF EXISTS(SELECT 1 FROM public.sales WHERE id=sale_id AND distribution#>'{participants,1,complimentary,reason}' IS NOT NULL) THEN RAISE EXCEPTION 'Se registró un motivo vacío'; END IF;
  IF (SELECT sum(amount) FROM public.current_account_entries WHERE related_sale_id=sale_id)<>30.01 THEN RAISE EXCEPTION 'Edición fallida alteró cuenta'; END IF;
  -- Mixed cash and courtesy, then restore the full price without losing history.
  payload:=jsonb_set(payload,'{distribution,participants,0,paymentMethod}','"cash"');
  PERFORM public.save_shared_sale('update',sale_id,payload);
  IF (public.cash_payment_totals('sale',sale_id)->>'cash')::numeric<>30.01 OR EXISTS(SELECT 1 FROM public.current_account_entries WHERE related_sale_id=sale_id) THEN RAISE EXCEPTION 'Pago parcial en efectivo incorrecto'; END IF;
  payload:=jsonb_set(payload,'{distribution,participants,0,complimentary,amount}','0');
  PERFORM public.save_shared_sale('update',sale_id,payload);
  IF (public.cash_payment_totals('sale',sale_id)->>'cash')::numeric<>50.01 THEN RAISE EXCEPTION 'Quitar bonificación no restauró importe'; END IF;
  payload:=jsonb_set(payload,'{distribution,participants,0,paymentMethod}','"complimentary"');
  payload:=jsonb_set(payload,'{distribution,participants,0,complimentary,reason}','"Cortesía total"');
  full_sale:=public.save_shared_sale('create',NULL,payload);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  IF EXISTS(SELECT 1 FROM public.cash_movements WHERE source_type='sale' AND source_id=full_sale)
    OR EXISTS(SELECT 1 FROM public.current_account_entries WHERE related_sale_id=full_sale) THEN RAISE EXCEPTION 'Venta gratis alteró caja o cuentas'; END IF;
  INSERT INTO auth.users(id,email) VALUES(who,who::text||'@example.invalid');
  INSERT INTO public.user_profiles(id,username,password_hash,role,is_active,permissions)
    VALUES(who,who::text,'unused','employee',true,'["sales.view","sales.create","sales.edit","sales.delete"]');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',who,'role','authenticated')::text,true);
  PERFORM public.save_shared_sale('update',full_sale,payload);
  PERFORM public.employee_mutate('sales','delete',full_sale,'{}');
  UPDATE public.user_profiles SET permissions='["sales.view"]' WHERE id=who;
  BEGIN
    PERFORM public.save_shared_sale('create',NULL,payload);
    RAISE EXCEPTION 'Empleado sin permiso bonificó' USING ERRCODE='XX000';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
SET CONSTRAINTS ALL IMMEDIATE;
