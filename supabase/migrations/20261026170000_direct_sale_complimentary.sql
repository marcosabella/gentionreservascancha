BEGIN;
ALTER FUNCTION public.save_shared_sale(text,uuid,jsonb) RENAME TO save_shared_sale_before_complimentary;
REVOKE ALL ON FUNCTION public.save_shared_sale_before_complimentary(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.save_shared_sale(action text, target uuid DEFAULT NULL, payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE person jsonb; people jsonb:='[]'; sanitized jsonb:='[]'; shares jsonb; waived_shares jsonb:='{}';
  gross numeric; waived numeric; net numeric; result uuid; bonus jsonb;
BEGIN
  IF jsonb_typeof(payload#>'{distribution,participants}') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Revisá los participantes'; END IF;
  FOR person IN SELECT * FROM jsonb_array_elements(payload#>'{distribution,participants}') LOOP
    sanitized:=sanitized || jsonb_build_array(CASE WHEN person->>'paymentMethod'='complimentary' THEN jsonb_set(person,'{paymentMethod}','"cash"') ELSE person END);
  END LOOP;
  -- The established RPC checks role, permissions, products, totals and shares.
  result:=public.save_shared_sale_before_complimentary(action,target,jsonb_set(payload,'{distribution,participants}',sanitized));
  SELECT distribution->'shares' INTO shares FROM public.sales WHERE id=result;
  FOR person IN SELECT * FROM jsonb_array_elements(payload#>'{distribution,participants}') LOOP
    gross:=(shares->>(person->>'id'))::numeric/100;
    bonus:=person->'complimentary';
    waived:=CASE WHEN person->>'paymentMethod'='complimentary' THEN gross ELSE coalesce((bonus->>'amount')::numeric,0) END;
    IF waived::text IN ('NaN','Infinity','-Infinity') OR waived<0 OR waived>gross OR waived<>round(waived,2) THEN RAISE EXCEPTION 'Importe bonificado inválido para %',person->>'name'; END IF;
    IF waived>0 OR person->>'paymentMethod'='complimentary' THEN
      IF coalesce(trim(bonus->>'reason'),'')='' THEN RAISE EXCEPTION 'Ingresá el motivo de bonificación de %',person->>'name'; END IF;
      person:=jsonb_set(person,'{complimentary}',jsonb_build_object('amount',waived,'reason',trim(bonus->>'reason'),'approvedBy',auth.uid(),'approvedAt',clock_timestamp()));
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
REVOKE ALL ON FUNCTION public.save_shared_sale(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_shared_sale(text,uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.cash_payment_totals(source text, target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE distribution jsonb; person jsonb; method text; amount numeric; totals jsonb:='{"cash":0,"card":0,"transfer":0}';
BEGIN
  IF source='sale' THEN
    SELECT s.distribution INTO distribution FROM public.sales s WHERE id=target AND type='direct' AND booking_id IS NULL;
    IF distribution IS NOT NULL THEN
      FOR person IN SELECT * FROM jsonb_array_elements(distribution->'participants') LOOP
        method:=person->>'paymentMethod';
        IF method IN ('cash','card','transfer') THEN
          amount:=((distribution#>>ARRAY['shares',person->>'id'])::numeric-coalesce((distribution#>>ARRAY['waivedShares',person->>'id'])::numeric,0))/100;
          totals:=jsonb_set(totals,ARRAY[method],to_jsonb((totals->>method)::numeric+amount));
        END IF;
      END LOOP;
      RETURN totals;
    END IF;
  END IF;
  RETURN public.cash_payment_totals_before_shared_sales(source,target);
END;
$$;

CREATE OR REPLACE FUNCTION public.cash_source_detail(source text, target uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE distribution jsonb; person jsonb; result text[]; method text; amount numeric; waived numeric;
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
          result:=array_append(result,'Motivo de bonificación de ' || (person->>'name') || ': ' || (person#>>'{complimentary,reason}'));
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN result;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
