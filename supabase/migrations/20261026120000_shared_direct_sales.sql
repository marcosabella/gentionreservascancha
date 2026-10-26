BEGIN;
-- Shared amounts can include cents even when the product price is a whole peso.
ALTER TABLE public.current_account_entries ALTER COLUMN amount TYPE numeric(14,2);
ALTER TABLE public.sales ALTER COLUMN total_amount TYPE numeric(14,2);
ALTER TABLE public.sale_items ALTER COLUMN price TYPE numeric(14,2), ALTER COLUMN subtotal TYPE numeric(14,2);
ALTER TABLE public.sales ADD COLUMN distribution jsonb;
ALTER TABLE public.sales ADD CONSTRAINT sales_distribution_object CHECK (distribution IS NULL OR jsonb_typeof(distribution) = 'object');

-- One transaction keeps the receipt, distribution and individual debts together.
CREATE FUNCTION public.save_shared_sale(action text, target uuid DEFAULT NULL, payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid; person jsonb; item jsonb; assignment jsonb; ids text[]; person_id text;
  participants jsonb := payload#>'{distribution,participants}'; assignments jsonb := payload#>'{distribution,items}';
  shares jsonb := '{}'::jsonb; amount bigint; base bigint; remainder bigint; idx integer; role_name text;
BEGIN
  SELECT role INTO role_name FROM public.user_profiles WHERE id=auth.uid() AND is_active;
  IF role_name IS NULL OR role_name NOT IN ('admin','employee') THEN RAISE EXCEPTION 'Sin permiso para guardar ventas' USING ERRCODE='42501'; END IF;
  IF action IS NULL OR action NOT IN ('create','update') THEN RAISE EXCEPTION 'Acción de venta inválida'; END IF;
  IF role_name='employee' AND NOT public.employee_has_permission('sales.' || CASE action WHEN 'create' THEN 'create' ELSE 'edit' END) THEN
    RAISE EXCEPTION 'Sin permiso para guardar ventas' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(participants) IS DISTINCT FROM 'array' OR jsonb_array_length(participants)=0 OR jsonb_array_length(participants)>100
    OR jsonb_typeof(assignments) IS DISTINCT FROM 'array' OR jsonb_typeof(payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(payload->'items')=0 THEN
    RAISE EXCEPTION 'Revisá los participantes y productos de la venta';
  END IF;
  FOR person IN SELECT * FROM jsonb_array_elements(participants) LOOP
    person_id:=person->>'id';
    IF coalesce(person_id,'')='' OR coalesce(trim(person->>'name'),'')='' OR shares ? person_id OR jsonb_typeof(person->'registered') IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'Participante inválido o duplicado';
    END IF;
    IF (person->>'registered')::boolean AND NOT EXISTS(SELECT 1 FROM public.players WHERE id::text=person_id) THEN RAISE EXCEPTION 'Jugador inexistente'; END IF;
    shares:=jsonb_set(shares,ARRAY[person_id],'0');
    IF person->>'paymentMethod' IS NULL OR person->>'paymentMethod' NOT IN ('cash','card','transfer','current_account') THEN RAISE EXCEPTION 'Seleccioná un medio de pago para cada cliente'; END IF;
    IF person->>'paymentMethod'='current_account' AND (NOT (person->>'registered')::boolean OR NOT EXISTS(
      SELECT 1 FROM public.players WHERE id::text=person_id AND current_account_enabled FOR SHARE)) THEN
      RAISE EXCEPTION 'El jugador no tiene cuenta corriente habilitada';
    END IF;
  END LOOP;
  IF (participants->0->>'name') IS DISTINCT FROM (payload#>>'{customer,name}')
    OR (CASE WHEN (participants->0->>'registered')::boolean THEN participants->0->>'id' ELSE NULL END) IS DISTINCT FROM nullif(payload#>>'{customer,id}','') THEN
    RAISE EXCEPTION 'El cliente principal no coincide con los participantes';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(payload->'items') i GROUP BY i->>'consumableId' HAVING count(*)>1)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(assignments) a GROUP BY a->>'consumableId' HAVING count(*)>1) THEN RAISE EXCEPTION 'Producto duplicado'; END IF;
  amount:=0;
  FOR item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    IF (item->>'quantity')::numeric<=0 OR (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric)
      OR (item->>'price')::numeric<0 OR (item->>'subtotal')::numeric IS DISTINCT FROM (item->>'price')::numeric*(item->>'quantity')::numeric
      OR (item->>'subtotal')::numeric IS NULL OR (item->>'subtotal')::numeric<>round((item->>'subtotal')::numeric,2) THEN RAISE EXCEPTION 'Importe de producto inválido'; END IF;
    amount:=amount+round((item->>'subtotal')::numeric*100)::bigint;
    SELECT a INTO assignment FROM jsonb_array_elements(assignments) a WHERE a->>'consumableId'=item->>'consumableId';
    IF assignment IS NOT NULL AND jsonb_typeof(assignment->'splitBetweenPlayers') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Reparto inválido'; END IF;
    IF assignment IS NULL OR (assignment->>'splitBetweenPlayers')::boolean THEN
      SELECT array_agg(p->>'id' ORDER BY n) INTO ids FROM jsonb_array_elements(participants) WITH ORDINALITY AS people(p,n);
    ELSE
      IF jsonb_typeof(assignment->'assignedToPlayers') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Seleccioná los participantes del producto'; END IF;
      IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(assignment->'assignedToPlayers') v WHERE NOT shares ? v) THEN RAISE EXCEPTION 'Participante ajeno a la venta'; END IF;
      SELECT array_agg(p->>'id' ORDER BY n) INTO ids FROM jsonb_array_elements(participants) WITH ORDINALITY AS people(p,n)
        WHERE assignment->'assignedToPlayers' ? (p->>'id');
    END IF;
    IF coalesce(cardinality(ids),0)=0 THEN RAISE EXCEPTION 'Seleccioná quiénes comparten cada producto'; END IF;
    base:=round((item->>'subtotal')::numeric*100)::bigint / cardinality(ids);
    remainder:=round((item->>'subtotal')::numeric*100)::bigint % cardinality(ids);
    FOR idx IN 1..cardinality(ids) LOOP
      shares:=jsonb_set(shares,ARRAY[ids[idx]],to_jsonb((shares->>ids[idx])::bigint+base+CASE WHEN idx<=remainder THEN 1 ELSE 0 END));
    END LOOP;
  END LOOP;
  IF amount::numeric/100 IS DISTINCT FROM (payload->>'totalAmount')::numeric THEN RAISE EXCEPTION 'El total no coincide con los productos'; END IF;
  IF role_name='admin' THEN result:=public.cash_save_sale(action,target,jsonb_set(payload,'{paymentMethod}','"cash"'));
  ELSE result:=public.employee_mutate('sales',action,target,jsonb_set(payload,'{paymentMethod}','"cash"')); END IF;
  UPDATE public.sales SET distribution=(payload->'distribution') || jsonb_build_object('shares',shares) WHERE id=result;
  DELETE FROM public.current_account_entries WHERE related_sale_id=result;
    FOR person IN SELECT * FROM jsonb_array_elements(participants) LOOP
      IF person->>'paymentMethod'='current_account' AND (shares->>(person->>'id'))::bigint>0 THEN
        INSERT INTO public.current_account_entries(player_id,type,amount,description,date,time,related_sale_id)
          VALUES((person->>'id')::uuid,'debit',(shares->>(person->>'id'))::numeric/100,'Venta directa compartida',
            (payload->>'date')::date,(payload->>'time')::time,result);
      END IF;
    END LOOP;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_shared_sale(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_shared_sale(text,uuid,jsonb) TO authenticated;

ALTER FUNCTION public.cash_payment_totals(text,uuid) RENAME TO cash_payment_totals_before_shared_sales;
REVOKE ALL ON FUNCTION public.cash_payment_totals_before_shared_sales(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cash_payment_totals(source text, target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE distribution jsonb; person jsonb; method text; amount numeric; totals jsonb:='{"cash":0,"card":0,"transfer":0}';
BEGIN
  IF source='sale' THEN
    SELECT s.distribution INTO distribution FROM public.sales s WHERE id=target AND type='direct' AND booking_id IS NULL;
    IF distribution IS NOT NULL THEN
      FOR person IN SELECT * FROM jsonb_array_elements(distribution->'participants') LOOP
        method:=person->>'paymentMethod';
        IF method IN ('cash','card','transfer') THEN
          amount:=(distribution#>>ARRAY['shares',person->>'id'])::numeric/100;
          totals:=jsonb_set(totals,ARRAY[method],to_jsonb((totals->>method)::numeric+amount));
        END IF;
      END LOOP;
      RETURN totals;
    END IF;
  END IF;
  RETURN public.cash_payment_totals_before_shared_sales(source,target);
END;
$$;
REVOKE ALL ON FUNCTION public.cash_payment_totals(text,uuid) FROM PUBLIC,anon,authenticated;

ALTER FUNCTION public.cash_source_detail(text,uuid) RENAME TO cash_source_detail_before_shared_sales;
REVOKE ALL ON FUNCTION public.cash_source_detail_before_shared_sales(text,uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.cash_source_detail(source text, target uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE distribution jsonb; person jsonb; result text[]; method text; amount numeric;
BEGIN
  result:=public.cash_source_detail_before_shared_sales(source,target);
  IF source='sale' THEN
    SELECT s.distribution INTO distribution FROM public.sales s WHERE id=target AND type='direct';
    IF distribution IS NOT NULL THEN
      FOR person IN SELECT * FROM jsonb_array_elements(distribution->'participants') LOOP
        method:=CASE person->>'paymentMethod' WHEN 'cash' THEN 'Efectivo' WHEN 'card' THEN 'Tarjeta' WHEN 'transfer' THEN 'Transferencia' WHEN 'current_account' THEN 'Cuenta corriente' END;
        amount:=(distribution#>>ARRAY['shares',person->>'id'])::numeric/100;
        result:=array_append(result,(person->>'name') || ' · ' || method || ' $ ' || replace(round(amount,2)::text,'.',','));
      END LOOP;
    END IF;
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.cash_source_detail(text,uuid) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
