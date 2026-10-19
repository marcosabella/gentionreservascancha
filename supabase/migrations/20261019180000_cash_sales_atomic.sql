BEGIN;
-- Save an administrator's sale and its items in one transaction. A failed item
-- must not leave a receipt in the register without a completed sale.
CREATE FUNCTION public.cash_save_sale(action text, target uuid DEFAULT NULL, payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sales; item jsonb; result uuid; subtotal numeric:=0; value numeric;
BEGIN
  IF action IS NULL OR action NOT IN ('create','update','delete') THEN RAISE EXCEPTION 'Acción de venta desconocida'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND role='admin' AND is_active) THEN
    RAISE EXCEPTION 'Solo un administrador puede usar esta operación' USING ERRCODE='42501';
  END IF;
  IF action IN ('update','delete') THEN
    SELECT * INTO STRICT s FROM public.sales WHERE id=target FOR UPDATE;
    IF s.type<>'direct' OR s.booking_id IS NOT NULL THEN RAISE EXCEPTION 'Los cobros de reservas se modifican desde la reserva'; END IF;
    result:=target;
  ELSIF action<>'create' THEN RAISE EXCEPTION 'Acción de venta desconocida'; END IF;
  IF action='delete' THEN
    DELETE FROM public.current_account_entries WHERE related_sale_id=target;
    DELETE FROM public.sale_items WHERE sale_id=target;
    DELETE FROM public.sales WHERE id=target;
    RETURN target;
  END IF;
  IF jsonb_typeof(payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'items')=0 THEN RAISE EXCEPTION 'Agregá al menos un producto'; END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    IF NOT EXISTS(SELECT 1 FROM public.consumables WHERE id::text=item->>'consumableId') THEN RAISE EXCEPTION 'Producto inexistente'; END IF;
    value:=(item->>'price')::numeric*(item->>'quantity')::numeric;
    IF (item->>'quantity')::numeric<=0 OR (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric) OR (item->>'price')::numeric<0 OR value IS NULL OR value::text='NaN'
      OR value IS DISTINCT FROM (item->>'subtotal')::numeric THEN RAISE EXCEPTION 'Revisá los importes de los productos'; END IF;
    subtotal:=subtotal+value;
  END LOOP;
  IF subtotal IS DISTINCT FROM (payload->>'totalAmount')::numeric THEN RAISE EXCEPTION 'El total no coincide con los productos'; END IF;
  IF action='create' THEN
    INSERT INTO public.sales(type,date,time,customer_type,customer_id,customer_name,customer_email,customer_phone,total_amount,payment_method,notes)
    VALUES('direct',(payload->>'date')::date,(payload->>'time')::time,payload->>'customerType',nullif(payload#>>'{customer,id}','')::uuid,
      payload#>>'{customer,name}',payload#>>'{customer,email}',payload#>>'{customer,phone}',subtotal,payload->>'paymentMethod',payload->>'notes') RETURNING id INTO result;
  ELSE
    UPDATE public.sales SET date=(payload->>'date')::date,time=(payload->>'time')::time,customer_type=payload->>'customerType',
      customer_id=nullif(payload#>>'{customer,id}','')::uuid,customer_name=payload#>>'{customer,name}',customer_email=payload#>>'{customer,email}',
      customer_phone=payload#>>'{customer,phone}',total_amount=subtotal,payment_method=payload->>'paymentMethod',notes=payload->>'notes' WHERE id=result;
    DELETE FROM public.sale_items WHERE sale_id=result;
  END IF;
  FOR item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    INSERT INTO public.sale_items(sale_id,consumable_id,name,price,quantity,subtotal)
      VALUES(result,item->>'consumableId',item->>'name',(item->>'price')::numeric,(item->>'quantity')::integer,(item->>'subtotal')::numeric);
  END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.cash_save_sale(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cash_save_sale(text,uuid,jsonb) TO authenticated;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
