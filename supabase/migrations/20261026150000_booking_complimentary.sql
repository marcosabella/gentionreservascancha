BEGIN;
-- Bonifications are settlements of a price, never receipts or account debt.
-- Preserve the existing shared-sales wrappers and legacy calculations.
DO $$
DECLARE definition text;
BEGIN
  definition:=pg_get_functiondef('public.cash_payment_totals_before_shared_sales(text,uuid)'::regprocedure);
  IF position('method NOT IN (''cash'',''card'',''transfer'',''current_account'')' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected cash validation'; END IF;
  EXECUTE replace(definition,'method NOT IN (''cash'',''card'',''transfer'',''current_account'')',
    'method NOT IN (''cash'',''card'',''transfer'',''current_account'',''complimentary'')');
  definition:=pg_get_functiondef('public.cash_source_detail_before_shared_sales(text,uuid)'::regprocedure);
  IF position('WHEN ''current_account'' THEN ''Cuenta corriente''' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected cash detail'; END IF;
  EXECUTE replace(definition,'WHEN ''current_account'' THEN ''Cuenta corriente''',
    'WHEN ''current_account'' THEN ''Cuenta corriente'' WHEN ''complimentary'' THEN ''Bonificado''');
END;
$$;

CREATE FUNCTION public.authorize_booking_complimentary() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE part jsonb; parts jsonb:='[]'; value numeric;
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
      IF coalesce(trim(part->>'reason'),'')='' THEN RAISE EXCEPTION 'Ingresá el motivo de la bonificación'; END IF;
      part:=part || jsonb_build_object('reason',trim(part->>'reason'),'approvedBy',auth.uid(),'approvedAt',clock_timestamp());
    END IF;
    parts:=parts || jsonb_build_array(part);
  END LOOP;
  NEW.payment_splits:=parts;
  RETURN NEW;
END;
$$;
CREATE TRIGGER authorize_booking_complimentary BEFORE INSERT OR UPDATE OF payment_splits ON public.booking_players
  FOR EACH ROW EXECUTE FUNCTION public.authorize_booking_complimentary();

CREATE FUNCTION public.validate_booking_complimentary() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; b public.bookings; p public.booking_players; c public.booking_consumptions;
  part jsonb; gross numeric; court_cost numeric; share numeric; n integer; waived numeric; covered numeric:=0;
BEGIN
  IF TG_TABLE_NAME='bookings' THEN target:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE target:=CASE WHEN TG_OP='DELETE' THEN OLD.booking_id ELSE NEW.booking_id END; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.booking_players bp CROSS JOIN LATERAL jsonb_array_elements(coalesce(bp.payment_splits,'[]')) AS parts(value)
    WHERE bp.booking_id=target AND parts.value->>'method'='complimentary') THEN RETURN NULL; END IF;
  SELECT * INTO b FROM public.bookings WHERE id=target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF b.status<>'completed' THEN RAISE EXCEPTION 'La bonificación se registra al finalizar el turno'; END IF;
  SELECT count(*) INTO n FROM public.booking_players WHERE booking_id=target;
  SELECT CASE WHEN b.total_price>0 THEN b.total_price ELSE greatest(coalesce(b.final_total,0)-coalesce(sum(price*quantity),0),0) END,
    coalesce(sum(price*quantity),0) INTO court_cost,gross FROM public.booking_consumptions WHERE booking_id=target;
  gross:=gross+court_cost;
  FOR p IN SELECT * FROM public.booking_players WHERE booking_id=target LOOP
    share:=court_cost/n;
    FOR c IN SELECT * FROM public.booking_consumptions WHERE booking_id=target LOOP
      IF c.split_between_players THEN share:=share+c.price*c.quantity::numeric/n;
      ELSIF cardinality(c.assigned_to_players)>0 AND p.player_id=ANY(c.assigned_to_players) THEN share:=share+c.price*c.quantity::numeric/cardinality(c.assigned_to_players); END IF;
    END LOOP;
    waived:=0;
    IF p.payment_splits IS NOT NULL THEN
      FOR part IN SELECT * FROM jsonb_array_elements(p.payment_splits) LOOP
        IF part->>'method' IS NULL OR part->>'method' NOT IN ('cash','card','transfer','current_account','complimentary')
          OR (part->>'amount')::numeric IS NULL OR (part->>'amount')::numeric<0 OR (part->>'amount')::numeric::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Revisá los pagos del turno'; END IF;
        covered:=covered+round((part->>'amount')::numeric,2);
        IF part->>'method'='complimentary' THEN waived:=waived+(part->>'amount')::numeric; END IF;
      END LOOP;
    ELSIF p.payment_method IS NOT NULL THEN covered:=covered+round(share,2);
    END IF;
    -- Allow the remainder cent assigned deterministically by the frontend.
    IF waived>round(share,2)+0.01 THEN RAISE EXCEPTION 'La bonificación supera la parte del jugador'; END IF;
  END LOOP;
  IF covered<>round(gross,2) THEN RAISE EXCEPTION 'Pagos y bonificaciones deben cubrir el total del turno'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER validate_booking_complimentary AFTER INSERT OR UPDATE OR DELETE ON public.bookings
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_booking_complimentary();
CREATE CONSTRAINT TRIGGER validate_booking_complimentary AFTER INSERT OR UPDATE OR DELETE ON public.booking_players
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_booking_complimentary();
CREATE CONSTRAINT TRIGGER validate_booking_complimentary AFTER INSERT OR UPDATE OR DELETE ON public.booking_consumptions
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_booking_complimentary();
REVOKE ALL ON FUNCTION public.authorize_booking_complimentary(),public.validate_booking_complimentary() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
