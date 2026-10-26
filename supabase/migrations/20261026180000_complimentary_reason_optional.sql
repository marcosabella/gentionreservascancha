BEGIN;
-- Keep authorization and amounts, but do not require or invent a reason.
CREATE OR REPLACE FUNCTION public.authorize_booking_complimentary() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE part jsonb; parts jsonb:='[]'; value numeric; reason text;
BEGIN
  IF NEW.payment_splits IS NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.payment_splits) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Pagos inválidos'; END IF;
  FOR part IN SELECT * FROM jsonb_array_elements(NEW.payment_splits) LOOP
    IF part->>'method'='complimentary' THEN
      IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND is_active AND (role='admin'
        OR (role='employee' AND (public.employee_has_permission('bookings.close') OR public.employee_has_permission('bookings.edit'))))) THEN
        RAISE EXCEPTION 'Sin permiso para bonificar reservas' USING ERRCODE='42501';
      END IF;
      value:=(part->>'amount')::numeric;
      IF value IS NULL OR value<=0 OR value::text IN ('NaN','Infinity','-Infinity') OR value<>round(value,2) THEN RAISE EXCEPTION 'Importe bonificado inválido'; END IF;
      reason:=nullif(trim(part->>'reason'),'');
      part:=(part-'reason') || jsonb_build_object('approvedBy',auth.uid(),'approvedAt',clock_timestamp());
      IF reason IS NOT NULL THEN part:=part || jsonb_build_object('reason',reason); END IF;
    END IF;
    parts:=parts || jsonb_build_array(part);
  END LOOP;
  NEW.payment_splits:=parts;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_shared_sale(action text, target uuid DEFAULT NULL, payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE person jsonb; people jsonb:='[]'; sanitized jsonb:='[]'; shares jsonb; waived_shares jsonb:='{}';
  gross numeric; waived numeric; net numeric; result uuid; bonus jsonb;
BEGIN
  IF jsonb_typeof(payload#>'{distribution,participants}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Revisá los participantes'; END IF;
  FOR person IN SELECT * FROM jsonb_array_elements(payload#>'{distribution,participants}') LOOP
    sanitized:=sanitized || jsonb_build_array(CASE WHEN person->>'paymentMethod'='complimentary' THEN jsonb_set(person,'{paymentMethod}','"cash"') ELSE person END);
  END LOOP;
  result:=public.save_shared_sale_before_complimentary(action,target,jsonb_set(payload,'{distribution,participants}',sanitized));
  SELECT distribution->'shares' INTO shares FROM public.sales WHERE id=result;
  FOR person IN SELECT * FROM jsonb_array_elements(payload#>'{distribution,participants}') LOOP
    gross:=(shares->>(person->>'id'))::numeric/100;
    bonus:=person->'complimentary';
    waived:=CASE WHEN person->>'paymentMethod'='complimentary' THEN gross ELSE coalesce((bonus->>'amount')::numeric,0) END;
    IF NOT (person->>'registered')::boolean AND lower(trim(person->>'name'))='consumidor final' AND (waived>0 OR person->>'paymentMethod'='complimentary') THEN
      RAISE EXCEPTION 'La bonificación no aplica a Consumidor Final. Agregá un jugador o cliente con nombre';
    END IF;
    IF waived::text IN ('NaN','Infinity','-Infinity') OR waived<0 OR waived>gross OR waived<>round(waived,2) THEN RAISE EXCEPTION 'Importe bonificado inválido para %',person->>'name'; END IF;
    IF waived>0 OR person->>'paymentMethod'='complimentary' THEN
      person:=jsonb_set(person,'{complimentary}',jsonb_strip_nulls(jsonb_build_object('amount',waived,'reason',nullif(trim(bonus->>'reason'),''),'approvedBy',auth.uid(),'approvedAt',clock_timestamp())));
    ELSE person:=person-'complimentary'; END IF;
    waived_shares:=jsonb_set(waived_shares,ARRAY[person->>'id'],to_jsonb(round(waived*100)::bigint));
    people:=people || jsonb_build_array(person);
    net:=gross-waived;
    IF person->>'paymentMethod'='current_account' THEN
      IF net=0 THEN DELETE FROM public.current_account_entries WHERE related_sale_id=result AND player_id=(person->>'id')::uuid;
      ELSE UPDATE public.current_account_entries SET amount=net WHERE related_sale_id=result AND player_id=(person->>'id')::uuid AND type='debit'; END IF;
    END IF;
  END LOOP;
  UPDATE public.sales SET distribution=jsonb_set(distribution,'{participants}',people) || jsonb_build_object('waivedShares',waived_shares) WHERE id=result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cash_source_detail(source text, target uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE distribution jsonb; person jsonb; result text[]; method text; amount numeric; waived numeric; reason text;
BEGIN
  result:=public.cash_source_detail_before_shared_sales(source,target);
  IF source='sale' THEN
    SELECT s.distribution INTO distribution FROM public.sales s WHERE id=target AND type='direct';
    IF distribution IS NOT NULL THEN
      FOR person IN SELECT * FROM jsonb_array_elements(distribution->'participants') LOOP
        method:=CASE person->>'paymentMethod' WHEN 'cash' THEN 'Efectivo' WHEN 'card' THEN 'Tarjeta' WHEN 'transfer' THEN 'Transferencia' WHEN 'current_account' THEN 'Cuenta corriente' WHEN 'complimentary' THEN 'Bonificado' END;
        waived:=coalesce((distribution#>>ARRAY['waivedShares',person->>'id'])::numeric,0)/100;
        amount:=(distribution#>>ARRAY['shares',person->>'id'])::numeric/100-waived;
        IF person->>'paymentMethod'<>'complimentary' THEN result:=array_append(result,(person->>'name') || ' · ' || method || ' $ ' || replace(round(amount,2)::text,'.',',')); END IF;
        IF waived>0 THEN
          result:=array_append(result,(person->>'name') || ' · Bonificado $ ' || replace(round(waived,2)::text,'.',','));
          reason:=nullif(trim(person#>>'{complimentary,reason}'),'');
          IF reason IS NOT NULL THEN result:=array_append(result,'Motivo de bonificación de ' || (person->>'name') || ': ' || reason); END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN result;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
