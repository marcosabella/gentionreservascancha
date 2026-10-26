DO $test$
DECLARE admin_id uuid; product uuid; person uuid:=gen_random_uuid(); payload jsonb; sale_id uuid; saved jsonb;
BEGIN
  SELECT id INTO STRICT admin_id FROM public.user_profiles WHERE role='admin' AND is_active LIMIT 1;
  SELECT id INTO STRICT product FROM public.consumables LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  payload:=jsonb_build_object('type','direct','date','2031-03-01','time','12:00','customerType','guest','customer',jsonb_build_object('name','Cliente con nombre'),
    'paymentMethod','cash','totalAmount',100,'items',jsonb_build_array(jsonb_build_object('consumableId',product,'name','Producto test','price',100,'quantity',1,'subtotal',100)),
    'distribution',jsonb_build_object('items','[]'::jsonb,'participants',jsonb_build_array(jsonb_build_object('id',person,'name','Cliente con nombre','registered',false,'paymentMethod','complimentary'))));
  sale_id:=public.save_shared_sale('create',NULL,payload);
  SET CONSTRAINTS ALL IMMEDIATE;
  SET CONSTRAINTS ALL DEFERRED;
  SELECT distribution INTO saved FROM public.sales WHERE id=sale_id;
  IF saved#>'{participants,0,complimentary,reason}' IS NOT NULL OR (saved#>>'{participants,0,complimentary,amount}')::numeric<>100
    OR EXISTS(SELECT 1 FROM public.cash_movements WHERE source_type='sale' AND source_id=sale_id)
    OR EXISTS(SELECT 1 FROM public.current_account_entries WHERE related_sale_id=sale_id) THEN RAISE EXCEPTION 'Bonificar sin motivo alteró caja, deuda o registró motivo'; END IF;
  IF array_position(public.cash_source_detail('sale',sale_id),NULL) IS NOT NULL THEN RAISE EXCEPTION 'Detalle contiene línea nula por motivo ausente'; END IF;
  payload:=jsonb_set(jsonb_set(payload,'{customer,name}','"Consumidor Final"'),'{distribution,participants,0,name}','"Consumidor Final"');
  BEGIN
    PERFORM public.save_shared_sale('create',NULL,payload);
    RAISE EXCEPTION 'Consumidor Final bonificado' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  payload:=jsonb_set(payload,'{distribution,participants,0,paymentMethod}','"cash"');
  sale_id:=public.save_shared_sale('create',NULL,payload);
  IF (public.cash_payment_totals('sale',sale_id)->>'cash')::numeric<>100 THEN RAISE EXCEPTION 'Consumidor Final no registra cobro normal'; END IF;
END;
$test$;
SET CONSTRAINTS ALL IMMEDIATE;
