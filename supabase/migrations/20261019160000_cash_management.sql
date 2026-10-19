-- Apply only after employee_permissions. No historical payments are imported.
BEGIN;
CREATE TABLE public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  opened_by uuid NOT NULL, opened_by_name text NOT NULL,
  opening_amount numeric(14,2) NOT NULL CHECK (opening_amount>=0),
  opening_notes text NOT NULL DEFAULT '',
  closed_at timestamptz, closed_by uuid, closed_by_name text,
  expected_cash numeric(14,2), counted_cash numeric(14,2) CHECK (counted_cash>=0),
  difference numeric(14,2), retained_cash numeric(14,2) CHECK (retained_cash>=0),
  handed_over numeric(14,2), closing_notes text,
  CHECK ((closed_at IS NULL AND counted_cash IS NULL) OR
    (closed_at IS NOT NULL AND counted_cash IS NOT NULL AND retained_cash<=counted_cash))
);
CREATE UNIQUE INDEX cash_one_open ON public.cash_sessions ((true)) WHERE closed_at IS NULL;
CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cash_sessions(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id uuid, actor_name text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('collection','correction','manual_in','expense','withdrawal','reversal')),
  method text NOT NULL CHECK(method IN ('cash','card','transfer')),
  amount numeric(14,2) NOT NULL CHECK(amount<>0),
  description text NOT NULL CHECK(length(trim(description))>0),
  source_type text CHECK(source_type IN ('booking','sale','account')),
  source_id uuid,
  reversal_of uuid UNIQUE REFERENCES public.cash_movements(id)
);
CREATE INDEX cash_movements_session ON public.cash_movements(session_id,created_at);
CREATE INDEX cash_movements_source ON public.cash_movements(source_type,source_id);
-- Internal current receipt state; retained even when a source is deleted.
CREATE TABLE public.cash_source_balances (
  source_type text NOT NULL, source_id uuid NOT NULL, method text NOT NULL,
  amount numeric(14,2) NOT NULL, PRIMARY KEY(source_type,source_id,method)
);

CREATE FUNCTION public.cash_allowed(permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND is_active
    AND (role='admin' OR (role='employee' AND permissions ? 'cash.view' AND permissions ? permission)));
$$;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_source_balances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_sessions,public.cash_movements,public.cash_source_balances FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cash_sessions,public.cash_movements TO authenticated;
GRANT ALL ON public.cash_sessions,public.cash_movements,public.cash_source_balances TO service_role;
CREATE POLICY cash_read_sessions ON public.cash_sessions FOR SELECT TO authenticated
  USING(public.cash_allowed('cash.view') AND (closed_at IS NULL OR public.cash_allowed('cash.report')));
CREATE POLICY cash_read_movements ON public.cash_movements FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.cash_sessions s WHERE s.id=session_id));

-- A single lock serializes openings, closings, manual entries and receipts.
CREATE FUNCTION public.cash_command(action text, payload jsonb DEFAULT '{}'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.cash_sessions; m public.cash_movements; who text; result uuid;
  value numeric(14,2); counted numeric(14,2); retained numeric(14,2); expected numeric(14,2); note text;
BEGIN
  IF NOT public.cash_allowed('cash.view') THEN RAISE EXCEPTION 'No tenés acceso a Caja' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(19160000);
  SELECT username INTO who FROM public.user_profiles WHERE id=auth.uid();
  SELECT * INTO s FROM public.cash_sessions WHERE closed_at IS NULL FOR UPDATE;
  note:=trim(coalesce(payload->>'notes',''));
  IF action='open' THEN
    IF NOT public.cash_allowed('cash.open') THEN RAISE EXCEPTION 'No tenés permiso para abrir caja' USING ERRCODE='42501'; END IF;
    IF s.id IS NOT NULL THEN RAISE EXCEPTION 'Ya hay una caja abierta. Actualizá la pantalla'; END IF;
    value:=(payload->>'amount')::numeric;
    IF value IS NULL OR value<0 OR value::text='NaN' THEN RAISE EXCEPTION 'Ingresá un monto de apertura válido'; END IF;
    INSERT INTO public.cash_sessions(opened_by,opened_by_name,opening_amount,opening_notes)
      VALUES(auth.uid(),who,value,note) RETURNING id INTO result;
    RETURN result;
  END IF;
  IF s.id IS NULL THEN RAISE EXCEPTION 'Abrí la caja antes de registrar movimientos'; END IF;
  IF s.id IS DISTINCT FROM (payload->>'sessionId')::uuid THEN RAISE EXCEPTION 'La caja cambió. Actualizá la pantalla'; END IF;
  SELECT s.opening_amount+coalesce(sum(amount) FILTER(WHERE method='cash'),0) INTO expected
    FROM public.cash_movements WHERE session_id=s.id;
  IF action='move' THEN
    IF NOT public.cash_allowed('cash.move') THEN RAISE EXCEPTION 'No tenés permiso para registrar movimientos' USING ERRCODE='42501'; END IF;
    value:=(payload->>'amount')::numeric;
    IF value IS NULL OR value<=0 OR value::text='NaN' OR note='' OR payload->>'kind' NOT IN ('manual_in','expense','withdrawal') OR payload->>'kind' IS NULL
      THEN RAISE EXCEPTION 'Completá el concepto, el tipo y un monto mayor a cero'; END IF;
    IF payload->>'kind'<>'manual_in' THEN value:=-value; END IF;
    IF expected+value<0 THEN RAISE EXCEPTION 'El egreso supera el efectivo disponible'; END IF;
    INSERT INTO public.cash_movements(session_id,actor_id,actor_name,kind,method,amount,description)
      VALUES(s.id,auth.uid(),who,payload->>'kind','cash',value,note) RETURNING id INTO result;
    RETURN result;
  ELSIF action='reverse' THEN
    IF NOT public.cash_allowed('cash.adjust') THEN RAISE EXCEPTION 'No tenés permiso para anular movimientos' USING ERRCODE='42501'; END IF;
    SELECT * INTO STRICT m FROM public.cash_movements WHERE id=(payload->>'movementId')::uuid AND session_id=s.id;
    IF m.kind NOT IN ('manual_in','expense','withdrawal') OR note='' OR EXISTS(SELECT 1 FROM public.cash_movements WHERE reversal_of=m.id)
      THEN RAISE EXCEPTION 'Solo se anulan movimientos manuales de la caja abierta, una única vez y con motivo'; END IF;
    IF expected-m.amount<0 THEN RAISE EXCEPTION 'La anulación dejaría la caja sin efectivo suficiente'; END IF;
    INSERT INTO public.cash_movements(session_id,actor_id,actor_name,kind,method,amount,description,reversal_of)
      VALUES(s.id,auth.uid(),who,'reversal',m.method,-m.amount,note,m.id) RETURNING id INTO result;
    RETURN result;
  ELSIF action='close' THEN
    IF NOT public.cash_allowed('cash.close') THEN RAISE EXCEPTION 'No tenés permiso para cerrar caja' USING ERRCODE='42501'; END IF;
    counted:=(payload->>'counted')::numeric; retained:=coalesce((payload->>'retained')::numeric,0);
    IF counted IS NULL OR counted<0 OR retained<0 OR retained>counted OR counted::text='NaN' OR retained::text='NaN'
      THEN RAISE EXCEPTION 'Revisá el efectivo contado y el fondo reservado'; END IF;
    IF counted<>expected AND note='' THEN RAISE EXCEPTION 'Indicá una observación para justificar la diferencia'; END IF;
    UPDATE public.cash_sessions SET closed_at=clock_timestamp(),closed_by=auth.uid(),closed_by_name=who,
      expected_cash=expected,counted_cash=counted,difference=counted-expected,retained_cash=retained,
      handed_over=counted-retained,closing_notes=note WHERE id=s.id;
    RETURN s.id;
  END IF;
  RAISE EXCEPTION 'Acción de caja desconocida';
END;
$$;

-- Receipt calculation uses actual per-player splits, never the synthetic booking sale.
CREATE FUNCTION public.cash_payment_totals(source text, target uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.bookings; p public.booking_players; c public.booking_consumptions;
  sale public.sales; entry public.current_account_entries; n integer; cost numeric; share numeric;
  part jsonb; method text; value numeric; totals jsonb:='{"cash":0,"card":0,"transfer":0}'::jsonb;
BEGIN
  IF source='sale' THEN
    SELECT * INTO sale FROM public.sales WHERE id=target;
    IF FOUND AND sale.type='direct' AND sale.booking_id IS NULL AND sale.payment_method IN ('cash','card','transfer') THEN
      IF sale.total_amount<0 THEN RAISE EXCEPTION 'El cobro de una venta no puede ser negativo'; END IF;
      totals:=jsonb_set(totals,ARRAY[sale.payment_method],to_jsonb(sale.total_amount));
    END IF;
  ELSIF source='account' THEN
    SELECT * INTO entry FROM public.current_account_entries WHERE id=target;
    IF FOUND AND entry.type='credit' THEN
      IF entry.amount<=0 OR entry.payment_method IS NULL OR entry.payment_method NOT IN ('cash','card','transfer') THEN RAISE EXCEPTION 'El pago requiere un monto positivo y un medio de cobro'; END IF;
      totals:=jsonb_set(totals,ARRAY[entry.payment_method],to_jsonb(entry.amount));
    END IF;
  ELSIF source='booking' THEN
    SELECT * INTO b FROM public.bookings WHERE id=target;
    IF NOT FOUND OR b.status<>'completed' THEN RETURN totals; END IF;
    SELECT count(*) INTO n FROM public.booking_players WHERE booking_id=target;
    IF n=0 THEN RETURN totals; END IF;
    SELECT CASE WHEN b.total_price>0 THEN b.total_price ELSE greatest(coalesce(b.final_total,0)-coalesce(sum(price*quantity),0),0) END
      INTO cost FROM public.booking_consumptions WHERE booking_id=target;
    FOR p IN SELECT * FROM public.booking_players WHERE booking_id=target LOOP
      share:=cost/n;
      FOR c IN SELECT * FROM public.booking_consumptions WHERE booking_id=target LOOP
        IF c.split_between_players THEN share:=share+c.price*c.quantity::numeric/n;
        ELSIF cardinality(c.assigned_to_players)>0 AND p.player_id=ANY(c.assigned_to_players) THEN
          share:=share+c.price*c.quantity::numeric/cardinality(c.assigned_to_players);
        END IF;
      END LOOP;
      IF jsonb_array_length(coalesce(p.payment_splits,'[]'::jsonb))>0 THEN
        FOR part IN SELECT * FROM jsonb_array_elements(p.payment_splits) LOOP
          method:=part->>'method'; value:=round((part->>'amount')::numeric,2);
          IF value IS NULL OR value<0 OR value::text='NaN' OR method IS NULL OR method NOT IN ('cash','card','transfer','current_account') THEN RAISE EXCEPTION 'Distribución de pago inválida'; END IF;
          IF method IN ('cash','card','transfer') THEN totals:=jsonb_set(totals,ARRAY[method],to_jsonb((totals->>method)::numeric+value)); END IF;
        END LOOP;
      ELSIF p.payment_method IN ('cash','card','transfer') THEN
        totals:=jsonb_set(totals,ARRAY[p.payment_method],to_jsonb((totals->>p.payment_method)::numeric+round(share,2)));
      END IF;
    END LOOP;
  END IF;
  RETURN totals;
END;
$$;

-- Seed only the internal baseline. No movements or sessions are generated.
INSERT INTO public.cash_source_balances(source_type,source_id,method,amount)
SELECT sources.kind,sources.id,parts.key,parts.value::numeric FROM (
  SELECT 'booking' kind,id FROM public.bookings WHERE status='completed'
  UNION ALL SELECT 'sale',id FROM public.sales WHERE type='direct'
  UNION ALL SELECT 'account',id FROM public.current_account_entries WHERE type='credit'
) sources CROSS JOIN LATERAL jsonb_each_text(public.cash_payment_totals(sources.kind,sources.id)) parts;

CREATE FUNCTION public.cash_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source text:=TG_ARGV[0]; target uuid; totals jsonb; pay_method text; previous numeric; value numeric; delta numeric;
  session uuid; who text; label text;
BEGIN
  IF TG_TABLE_NAME IN ('booking_players','booking_consumptions') THEN
    target:=CASE WHEN TG_OP='DELETE' THEN OLD.booking_id ELSE NEW.booking_id END;
  ELSE target:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END; END IF;
  PERFORM pg_advisory_xact_lock(19160000);
  totals:=public.cash_payment_totals(source,target);
  SELECT username INTO who FROM public.user_profiles WHERE id=auth.uid();
  label:=CASE source WHEN 'booking' THEN 'Cobro de reserva' WHEN 'sale' THEN 'Venta directa' ELSE 'Pago de cuenta corriente' END;
  FOREACH pay_method IN ARRAY ARRAY['cash','card','transfer'] LOOP
    SELECT amount INTO previous FROM public.cash_source_balances WHERE source_type=source AND source_id=target AND cash_source_balances.method=pay_method;
    value:=(totals->>pay_method)::numeric; delta:=value-coalesce(previous,0);
    IF delta<>0 THEN
      SELECT id INTO session FROM public.cash_sessions WHERE closed_at IS NULL;
      IF session IS NULL THEN RAISE EXCEPTION 'Abrí la caja antes de registrar o corregir un cobro'; END IF;
      INSERT INTO public.cash_movements(session_id,actor_id,actor_name,kind,method,amount,description,source_type,source_id)
        VALUES(session,auth.uid(),coalesce(who,'Sistema'),CASE WHEN previous IS NULL OR previous=0 AND delta>0 THEN 'collection' ELSE 'correction' END,
          pay_method,delta,label||CASE WHEN previous IS NOT NULL AND previous<>0 THEN ' · ajuste' ELSE '' END,source,target);
    END IF;
    INSERT INTO public.cash_source_balances(source_type,source_id,method,amount) VALUES(source,target,pay_method,value)
      ON CONFLICT(source_type,source_id,method) DO UPDATE SET amount=excluded.amount;
  END LOOP;
  RETURN NULL;
END;
$$;
-- Deferred to capture the final atomic state, not intermediate child replacements.
CREATE CONSTRAINT TRIGGER cash_booking AFTER INSERT OR UPDATE OR DELETE ON public.bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.cash_capture('booking');
CREATE CONSTRAINT TRIGGER cash_booking_players AFTER INSERT OR UPDATE OR DELETE ON public.booking_players DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.cash_capture('booking');
CREATE CONSTRAINT TRIGGER cash_booking_consumptions AFTER INSERT OR UPDATE OR DELETE ON public.booking_consumptions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.cash_capture('booking');
CREATE CONSTRAINT TRIGGER cash_sale AFTER INSERT OR UPDATE OR DELETE ON public.sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.cash_capture('sale');
CREATE CONSTRAINT TRIGGER cash_account AFTER INSERT OR UPDATE OR DELETE ON public.current_account_entries DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.cash_capture('account');

-- Admin booking changes also need one transaction for parent + players + consumptions.
CREATE FUNCTION public.cash_save_booking(target uuid, payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND role='admin' AND is_active) THEN
    RAISE EXCEPTION 'Solo un administrador puede usar esta operación' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.bookings WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva inexistente'; END IF;
  UPDATE public.bookings SET court_id=coalesce((payload->>'courtId')::uuid,court_id),court_name=coalesce(payload->>'courtName',court_name),
    date=coalesce((payload->>'date')::date,date),start_time=coalesce((payload->>'startTime')::time,start_time),end_time=coalesce((payload->>'endTime')::time,end_time),
    total_price=coalesce((payload->>'totalPrice')::numeric,total_price),final_total=coalesce((payload->>'finalTotal')::numeric,final_total),
    status=coalesce(payload->>'status',status),closed_at=coalesce((payload->>'closedAt')::timestamptz,closed_at) WHERE id=target;
  IF payload ? 'players' THEN
    DELETE FROM public.booking_players WHERE booking_id=target;
    FOR item IN SELECT * FROM jsonb_array_elements(payload->'players') LOOP
      INSERT INTO public.booking_players(booking_id,player_id,player_name,player_email,player_phone,is_organizer,payment_method,payment_splits)
      VALUES(target,(item->>'id')::uuid,item->>'name',coalesce(item->>'email',''),coalesce(item->>'phone',''),coalesce((item->>'isOrganizer')::boolean,false),item->>'paymentMethod',nullif(item->'paymentSplits','null'::jsonb));
    END LOOP;
  END IF;
  IF payload ? 'consumptions' THEN
    DELETE FROM public.booking_consumptions WHERE booking_id=target;
    FOR item IN SELECT * FROM jsonb_array_elements(payload->'consumptions') LOOP
      INSERT INTO public.booking_consumptions(booking_id,consumable_id,name,price,quantity,category,split_between_players,assigned_to_players)
      VALUES(target,coalesce(item->>'consumableId',item->>'id'),item->>'name',(item->>'price')::numeric,(item->>'quantity')::integer,
        coalesce(item->>'category','other'),coalesce((item->>'splitBetweenPlayers')::boolean,true),ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(item->'assignedToPlayers','[]'::jsonb))));
    END LOOP;
  END IF;
  RETURN target;
END;
$$;
REVOKE ALL ON FUNCTION public.cash_allowed(text),public.cash_command(text,jsonb),public.cash_payment_totals(text,uuid),public.cash_capture(),public.cash_save_booking(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cash_allowed(text),public.cash_command(text,jsonb),public.cash_save_booking(uuid,jsonb) TO authenticated;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
