DO $test$
DECLARE admin_id uuid; p1 uuid:=gen_random_uuid(); p2 uuid:=gen_random_uuid(); product text; sale_id uuid; payload jsonb; employee_id uuid:=gen_random_uuid();
BEGIN
  SELECT id INTO STRICT admin_id FROM public.user_profiles WHERE role='admin' AND is_active LIMIT 1;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  SELECT id::text INTO STRICT product FROM public.consumables LIMIT 1;
  INSERT INTO public.players(id,name,email,phone,current_account_enabled) VALUES(p1,'Shared test A','','',true),(p2,'Shared test B','','',true);
  payload:=jsonb_build_object('type','direct','date','2031-03-01','time','12:00','customerType','registered','customer',jsonb_build_object('id',p1,'name','Shared test A'),
    'items',jsonb_build_array(jsonb_build_object('id','line','consumableId',product,'name','Test','price',10.01,'quantity',1,'subtotal',10.01)),
    'totalAmount',10.01,'paymentMethod','current_account','distribution',jsonb_build_object('participants',jsonb_build_array(
      jsonb_build_object('id',p1,'name','Shared test A','registered',true,'paymentMethod','current_account'),jsonb_build_object('id',p2,'name','Shared test B','registered',true,'paymentMethod','current_account')), 'items','[]'::jsonb));
  sale_id:=public.save_shared_sale('create',NULL,payload);
  IF (SELECT count(*) FROM public.current_account_entries WHERE related_sale_id=sale_id)<>2
    OR (SELECT sum(amount) FROM public.current_account_entries WHERE related_sale_id=sale_id)<>10.01
    OR (SELECT amount FROM public.current_account_entries WHERE related_sale_id=sale_id AND player_id=p1)<>5.01
    OR (SELECT distribution-'shares' FROM public.sales WHERE id=sale_id) IS DISTINCT FROM payload->'distribution' THEN
    RAISE EXCEPTION 'Shared sale creation failed: entries %, saved distribution %', (SELECT jsonb_agg(jsonb_build_object('amount',amount,'first',player_id=p1)) FROM public.current_account_entries WHERE related_sale_id=sale_id), (SELECT distribution FROM public.sales WHERE id=sale_id); END IF;
  payload:=jsonb_set(payload,'{distribution,items}',jsonb_build_array(jsonb_build_object('consumableId',product,'splitBetweenPlayers',false,'assignedToPlayers',jsonb_build_array(p2))));
  PERFORM public.save_shared_sale('update',sale_id,payload);
  IF (SELECT count(*) FROM public.current_account_entries WHERE related_sale_id=sale_id)<>1 OR
    (SELECT amount FROM public.current_account_entries WHERE related_sale_id=sale_id AND player_id=p2)<>10.01 THEN RAISE EXCEPTION 'Assignment/edit failed'; END IF;
  BEGIN
    PERFORM public.save_shared_sale('update',sale_id,jsonb_set(payload,'{distribution,items,0,assignedToPlayers}','[]'::jsonb));
    RAISE EXCEPTION 'Empty assignment accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  IF (SELECT amount FROM public.current_account_entries WHERE related_sale_id=sale_id AND player_id=p2)<>10.01 THEN RAISE EXCEPTION 'Failed edit modified debt'; END IF;
  payload:=jsonb_set(jsonb_set(payload,'{distribution,participants,0,paymentMethod}','"cash"'),'{distribution,participants,1,paymentMethod}','"cash"');
  PERFORM public.save_shared_sale('update',sale_id,payload);
  IF EXISTS(SELECT 1 FROM public.current_account_entries WHERE related_sale_id=sale_id) THEN RAISE EXCEPTION 'Debt left after cash payment'; END IF;
  IF (public.cash_payment_totals('sale',sale_id)->>'cash')::numeric<>10.01 THEN RAISE EXCEPTION 'Cash receipt total incorrect'; END IF;
  payload:=jsonb_set(jsonb_set(jsonb_set(payload,'{distribution,items}','[]'),'{distribution,participants,0,paymentMethod}','"current_account"'),'{distribution,participants,1,paymentMethod}','"transfer"');
  PERFORM public.save_shared_sale('update',sale_id,payload);
  IF (public.cash_payment_totals('sale',sale_id)->>'cash')::numeric<>0 OR (public.cash_payment_totals('sale',sale_id)->>'transfer')::numeric<>5
    OR (SELECT amount FROM public.current_account_entries WHERE related_sale_id=sale_id AND player_id=p1)<>5.01 THEN RAISE EXCEPTION 'Mixed payment failed'; END IF;
  IF array_length(public.cash_source_detail('sale',sale_id),1)<>3 THEN RAISE EXCEPTION 'Cash detail missing clients'; END IF;
  PERFORM public.cash_save_sale('delete',sale_id,'{}'::jsonb);
  IF EXISTS(SELECT 1 FROM public.sales WHERE id=sale_id) THEN RAISE EXCEPTION 'Delete failed'; END IF;
  INSERT INTO auth.users(id,email) VALUES(employee_id,employee_id::text||'@example.invalid');
  INSERT INTO public.user_profiles(id,username,password_hash,role,is_active,permissions)
    VALUES(employee_id,employee_id::text,'unused','employee',true,'["sales.view","sales.create","sales.edit","sales.delete"]'::jsonb);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',employee_id,'role','authenticated')::text,true);
  sale_id:=public.save_shared_sale('create',NULL,payload);
  PERFORM public.save_shared_sale('update',sale_id,payload);
  IF (SELECT count(*) FROM public.current_account_entries WHERE related_sale_id=sale_id)<>1 THEN RAISE EXCEPTION 'Employee debt duplicated'; END IF;
  PERFORM public.employee_mutate('sales','delete',sale_id,'{}'::jsonb);
  UPDATE public.user_profiles SET permissions='[]'::jsonb WHERE id=employee_id;
  BEGIN
    PERFORM public.save_shared_sale('create',NULL,payload);
    RAISE EXCEPTION 'Unauthorized employee accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('role','anon')::text,true);
  BEGIN
    PERFORM public.save_shared_sale('create',NULL,payload);
    RAISE EXCEPTION 'Anonymous accepted' USING ERRCODE='XX000';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
SET CONSTRAINTS ALL IMMEDIATE;
