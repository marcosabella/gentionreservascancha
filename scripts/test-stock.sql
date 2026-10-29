DO $test$
DECLARE product uuid:='20000000-0000-0000-0000-000000000001'; historical uuid:='30000000-0000-0000-0000-000000000001';
  receipt uuid; booking uuid; court uuid; payload jsonb; p public.consumables; employee uuid:=gen_random_uuid(); count_before integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.consumables WHERE stock_enabled) THEN RAISE EXCEPTION 'Existing products must default to NO'; END IF;
  payload:=jsonb_build_object('date','2031-01-02','time','12:00','customerType','guest','customer',jsonb_build_object('name','Cliente'),
    'totalAmount',500,'paymentMethod','cash','items',jsonb_build_array(jsonb_build_object('consumableId',product,'name','Agua','price',100,'quantity',5,'subtotal',500)));
  receipt:=public.cash_save_sale('create',NULL,payload);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>0 THEN RAISE EXCEPTION 'Disabled products must sell without stock'; END IF;
  SELECT to_jsonb(c)||'{"stockEnabled":true,"stockMinimum":2,"initialStock":10}' INTO payload FROM public.consumables c WHERE id=product;
  p:=public.inventory_save_product(product,payload);
  IF p.stock_quantity<>10 THEN RAISE EXCEPTION 'Initial count'; END IF;
  -- Removing pre-control quantities does not return stock.
  DELETE FROM public.sale_items WHERE sale_id=historical;
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>10 THEN RAISE EXCEPTION 'Historical receipts invented stock'; END IF;
  payload:=jsonb_build_object('date','2031-01-02','time','12:00','customerType','guest','customer',jsonb_build_object('name','Cliente'),
    'totalAmount',300,'paymentMethod','cash','items',jsonb_build_array(jsonb_build_object('consumableId',product,'name','Agua','price',100,'quantity',3,'subtotal',300)));
  receipt:=public.cash_save_sale('create',NULL,payload);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>7 THEN RAISE EXCEPTION 'Sale deduction'; END IF;
  SELECT count(*) INTO count_before FROM public.stock_movements;
  PERFORM public.cash_save_sale('update',receipt,payload);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT count(*) FROM public.stock_movements)<>count_before THEN RAISE EXCEPTION 'Unchanged edit produced movement'; END IF;
  payload:=jsonb_set(jsonb_set(jsonb_set(payload,'{items,0,quantity}','4'),'{items,0,subtotal}','400'),'{totalAmount}','400');
  PERFORM public.cash_save_sale('update',receipt,payload);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>6 THEN RAISE EXCEPTION 'Edit must deduct only difference'; END IF;
  -- A failing receipt must roll back its items and cash as well as stock.
  SELECT count(*) INTO count_before FROM public.sales;
  BEGIN
    payload:=jsonb_set(jsonb_set(jsonb_set(payload,'{items,0,quantity}','99'),'{items,0,subtotal}','9900'),'{totalAmount}','9900');
    PERFORM public.cash_save_sale('create',NULL,payload);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Expected insufficient stock';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Stock insuficiente%' THEN RAISE; END IF;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT count(*) FROM public.sales)<>count_before OR (SELECT stock_quantity FROM public.consumables WHERE id=product)<>6 THEN RAISE EXCEPTION 'Failed receipt was not rolled back'; END IF;
  PERFORM public.inventory_cancel('sales',receipt,true);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>10 THEN RAISE EXCEPTION 'Cancellation return'; END IF;
  payload:=jsonb_set(jsonb_set(jsonb_set(payload,'{items,0,quantity}','2'),'{items,0,subtotal}','200'),'{totalAmount}','200');
  receipt:=public.cash_save_sale('create',NULL,payload);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM public.inventory_cancel('sales',receipt,false);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>8 THEN RAISE EXCEPTION 'Consumed goods must not return'; END IF;
  INSERT INTO public.courts(name,description,price_per_turn,features) VALUES('Stock test','Test',1000,'{}') RETURNING id INTO court;
  INSERT INTO public.bookings(court_id,court_name,date,start_time,end_time,total_price,status) VALUES(court,'Stock test','2031-01-02','12:00','13:00',1000,'confirmed') RETURNING id INTO booking;
  PERFORM public.cash_save_booking(booking,jsonb_build_object('consumptions',jsonb_build_array(jsonb_build_object('consumableId',product,'name','Agua','price',100,'quantity',2,'category','drink','assignedToPlayers','[]'::jsonb))));
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>6 THEN RAISE EXCEPTION 'Unpaid booking must deduct'; END IF;
  -- Payment changes and reservation closing do not rededuct consumptions.
  UPDATE public.bookings SET status='completed',closed_at=now(),final_total=1200 WHERE id=booking;
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>6 THEN RAISE EXCEPTION 'Closing deducted twice'; END IF;
  PERFORM public.inventory_cancel('bookings',booking,true);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>8 THEN RAISE EXCEPTION 'Booking return'; END IF;
  PERFORM public.inventory_move(product,'entry',12,'Reposición');
  PERFORM public.inventory_move(product,'loss',3,'Rotura');
  PERFORM public.inventory_move(product,'count',0,'Conteo físico');
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>0 THEN RAISE EXCEPTION 'Manual movements'; END IF;
  BEGIN UPDATE public.consumables SET stock_quantity=100 WHERE id=product; RAISE EXCEPTION 'Expected guard';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Usá la gestión%' THEN RAISE; END IF; END;
  INSERT INTO auth.users(id) VALUES(employee);
  INSERT INTO public.user_profiles(id,username,password_hash,role,is_active,permissions) VALUES(employee,'Stock employee','unused','employee',true,'["products.view","products.edit"]');
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',employee,'role','authenticated')::text,true);
  BEGIN PERFORM public.inventory_move(product,'entry',1,'Sin permiso'); RAISE EXCEPTION 'Expected permission denial';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  UPDATE public.user_profiles SET permissions='["products.view","products.edit","products.stock"]' WHERE id=employee;
  PERFORM public.inventory_move(product,'entry',4,'Con permiso');
  IF NOT EXISTS(SELECT 1 FROM public.stock_movements WHERE product_id=product AND actor_id=employee AND balance=4) THEN RAISE EXCEPTION 'Missing actor audit'; END IF;
  -- Disabled sales do not change stock; reenabling requires a fresh count.
  SELECT to_jsonb(c)||'{"stockEnabled":false,"stockMinimum":2}' INTO payload FROM public.consumables c WHERE id=product;
  PERFORM public.inventory_save_product(product,payload);
  BEGIN PERFORM public.inventory_move(product,'entry',1,'No habilitado'); RAISE EXCEPTION 'Expected disabled refusal';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Activá primero%' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.inventory_save_product(product,payload||'{"stockEnabled":true}'); RAISE EXCEPTION 'Expected fresh count';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Ingresá el conteo%' THEN RAISE; END IF; END;
  PERFORM public.inventory_save_product(product,payload||'{"stockEnabled":true,"initialStock":5}');
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>5 THEN RAISE EXCEPTION 'Reactivation must use fresh count'; END IF;
  -- Employee sales use the same inventory path, including legacy RPCs.
  UPDATE public.user_profiles SET permissions='["products.view","products.edit","products.stock","sales.view","sales.create"]' WHERE id=employee;
  payload:=jsonb_build_object('date','2031-01-02','time','12:00','customerType','guest','customer',jsonb_build_object('name','Cliente'),
    'totalAmount',200,'paymentMethod','cash','items',jsonb_build_array(jsonb_build_object('consumableId',product,'name','Agua','price',100,'quantity',2,'subtotal',200)));
  receipt:=public.employee_mutate('sales','create',NULL,payload);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>3 THEN RAISE EXCEPTION 'Employee sale did not deduct'; END IF;
  PERFORM set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
  -- Duplicate lines and complimentary payments still consume physical units.
  payload:=jsonb_set(payload,'{items}',(payload->'items')||(payload->'items'));
  payload:=jsonb_set(payload,'{totalAmount}','400');
  BEGIN
    PERFORM public.cash_save_sale('create',NULL,payload); SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Expected combined shortage';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Stock insuficiente%' THEN RAISE; END IF; END;
  SET CONSTRAINTS ALL DEFERRED;
  payload:=jsonb_set(payload,'{items}',jsonb_build_array((payload#>'{items,0}')||'{"quantity":1,"subtotal":100}'));
  payload:=jsonb_set(payload,'{totalAmount}','100');
  payload:=payload||jsonb_build_object('distribution',jsonb_build_object('participants',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name','Cliente','registered',false,'paymentMethod','complimentary')),'items','[]'::jsonb));
  receipt:=public.save_shared_sale('create',NULL,payload);
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT stock_quantity FROM public.consumables WHERE id=product)<>2 THEN RAISE EXCEPTION 'Complimentary product must deduct'; END IF;
  -- Creation with consumption must fail atomically too.
  SELECT count(*) INTO count_before FROM public.bookings;
  BEGIN
    PERFORM public.inventory_create_booking(jsonb_build_object('courtId',court,'courtName','Stock test','date','2031-01-02','startTime','14:00','endTime','15:00','totalPrice',1000,
      'consumptions',jsonb_build_array(jsonb_build_object('consumableId',product,'name','Agua','price',100,'quantity',99,'category','drink','assignedToPlayers','[]'::jsonb))));
    SET CONSTRAINTS ALL IMMEDIATE; RAISE EXCEPTION 'Expected booking shortage';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM NOT LIKE 'Stock insuficiente%' THEN RAISE; END IF; END;
  SET CONSTRAINTS ALL DEFERRED;
  IF (SELECT count(*) FROM public.bookings)<>count_before THEN RAISE EXCEPTION 'Failed booking was partially saved'; END IF;
END;
$test$;
