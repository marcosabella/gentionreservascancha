BEGIN;

-- Take the inventory lock before the existing RPCs acquire receipt/reservation
-- row locks. All established permission and payment validations remain in place.
ALTER FUNCTION public.cash_save_sale(text,uuid,jsonb) RENAME TO inventory_base_save_sale;
CREATE FUNCTION public.cash_save_sale(action text,target uuid DEFAULT NULL,payload jsonb DEFAULT '{}'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM pg_advisory_xact_lock(29120000); RETURN public.inventory_base_save_sale(action,target,payload); END;
$$;
ALTER FUNCTION public.cash_save_booking(uuid,jsonb) RENAME TO inventory_base_save_booking;
CREATE FUNCTION public.cash_save_booking(target uuid,payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM pg_advisory_xact_lock(29120000); RETURN public.inventory_base_save_booking(target,payload); END;
$$;
ALTER FUNCTION public.employee_mutate(text,text,uuid,jsonb) RENAME TO inventory_base_employee_mutate;
CREATE FUNCTION public.employee_mutate(resource text,action text,record_id uuid DEFAULT NULL,payload jsonb DEFAULT '{}'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM pg_advisory_xact_lock(29120000); RETURN public.inventory_base_employee_mutate(resource,action,record_id,payload); END;
$$;
ALTER FUNCTION public.save_shared_sale(text,uuid,jsonb) RENAME TO inventory_base_shared_sale;
CREATE FUNCTION public.save_shared_sale(action text,target uuid DEFAULT NULL,payload jsonb DEFAULT '{}'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM pg_advisory_xact_lock(29120000); RETURN public.inventory_base_shared_sale(action,target,payload); END;
$$;
REVOKE ALL ON FUNCTION public.inventory_base_save_sale(text,uuid,jsonb),public.inventory_base_save_booking(uuid,jsonb),public.inventory_base_employee_mutate(text,text,uuid,jsonb),public.inventory_base_shared_sale(text,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cash_save_sale(text,uuid,jsonb),public.cash_save_booking(uuid,jsonb),public.employee_mutate(text,text,uuid,jsonb),public.save_shared_sale(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cash_save_sale(text,uuid,jsonb),public.cash_save_booking(uuid,jsonb),public.employee_mutate(text,text,uuid,jsonb),public.save_shared_sale(text,uuid,jsonb) TO authenticated;

-- Opt in only: existing products continue selling without an inventory count.
ALTER TABLE public.consumables
  ADD COLUMN stock_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN stock_quantity integer NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  ADD COLUMN stock_minimum integer NOT NULL DEFAULT 0 CHECK (stock_minimum >= 0);
ALTER TABLE public.sale_items ADD CONSTRAINT inventory_sale_quantity_positive CHECK (quantity>0) NOT VALID;
ALTER TABLE public.booking_consumptions ADD CONSTRAINT inventory_booking_quantity_positive CHECK (quantity>0) NOT VALID;

CREATE TABLE public.stock_movements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.consumables(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  kind text NOT NULL,
  quantity integer NOT NULL,
  balance integer NOT NULL CHECK (balance >= 0),
  reason text NOT NULL,
  actor_id uuid,
  actor_name text NOT NULL,
  source_kind text,
  source_id uuid
);
CREATE INDEX stock_movements_product_date ON public.stock_movements(product_id, created_at DESC, id DESC);

-- Remember totals even while disabled. tracked_quantity is only the part actually
-- deducted since activation, so editing historical receipts cannot invent stock.
CREATE TABLE public.stock_source_totals (
  source_kind text NOT NULL,
  source_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.consumables(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity >= 0),
  tracked_quantity integer NOT NULL DEFAULT 0 CHECK (tracked_quantity >= 0 AND tracked_quantity <= quantity),
  PRIMARY KEY(source_kind, source_id, product_id)
);
INSERT INTO public.stock_source_totals(source_kind,source_id,product_id,quantity)
SELECT 'sale', i.sale_id, p.id, sum(i.quantity)::integer FROM public.sale_items i
JOIN public.sales s ON s.id=i.sale_id AND s.type='direct' AND s.booking_id IS NULL
JOIN public.consumables p ON p.id::text=i.consumable_id OR starts_with(i.consumable_id,p.id::text||'-') GROUP BY i.sale_id,p.id
UNION ALL
SELECT 'booking', i.booking_id, p.id, sum(i.quantity)::integer FROM public.booking_consumptions i
JOIN public.bookings b ON b.id=i.booking_id AND b.status<>'cancelled'
JOIN public.consumables p ON p.id::text=i.consumable_id OR starts_with(i.consumable_id,p.id::text||'-') GROUP BY i.booking_id,p.id;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_source_totals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.stock_movements, public.stock_source_totals FROM anon, authenticated;
GRANT SELECT ON public.stock_movements TO authenticated;
CREATE POLICY stock_history_read ON public.stock_movements FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND is_active AND
    (role='admin' OR (role='employee' AND permissions ? 'products.view')))
);

CREATE FUNCTION public.inventory_allowed(permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND is_active
    AND (role='admin' OR (role='employee' AND permissions ? 'products.view' AND permissions ? permission)));
$$;

-- One short transaction lock serializes inventory changes across all entry points,
-- including legacy RPCs. It is taken before row locks to prevent overselling.
CREATE FUNCTION public.inventory_lock() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM pg_advisory_xact_lock(29120000); RETURN NULL; END;
$$;
CREATE TRIGGER inventory_lock_products BEFORE INSERT OR UPDATE OR DELETE ON public.consumables FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_lock();
CREATE TRIGGER inventory_lock_sales BEFORE INSERT OR UPDATE OR DELETE ON public.sales FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_lock();
CREATE TRIGGER inventory_lock_sale_items BEFORE INSERT OR UPDATE OR DELETE ON public.sale_items FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_lock();
CREATE TRIGGER inventory_lock_bookings BEFORE INSERT OR UPDATE OR DELETE ON public.bookings FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_lock();
CREATE TRIGGER inventory_lock_consumptions BEFORE INSERT OR UPDATE OR DELETE ON public.booking_consumptions FOR EACH STATEMENT EXECUTE FUNCTION public.inventory_lock();

CREATE FUNCTION public.inventory_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF (TG_OP='INSERT' AND (NEW.stock_enabled OR NEW.stock_quantity<>0 OR NEW.stock_minimum<>0))
    OR (TG_OP='UPDATE' AND (NEW.stock_enabled,NEW.stock_quantity,NEW.stock_minimum) IS DISTINCT FROM (OLD.stock_enabled,OLD.stock_quantity,OLD.stock_minimum)) THEN
    IF current_setting('inventory.internal',true) IS DISTINCT FROM 'yes' THEN
      RAISE EXCEPTION 'Usá la gestión de stock para modificar las existencias';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_guard BEFORE INSERT OR UPDATE ON public.consumables FOR EACH ROW EXECUTE FUNCTION public.inventory_guard();

CREATE FUNCTION public.inventory_apply(product uuid, delta integer, movement_kind text, explanation text, origin text DEFAULT NULL, origin_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.consumables; next_balance integer; old_flag text;
BEGIN
  PERFORM pg_advisory_xact_lock(29120000);
  SELECT * INTO STRICT p FROM public.consumables WHERE id=product FOR UPDATE;
  next_balance:=p.stock_quantity+delta;
  IF next_balance<0 THEN RAISE EXCEPTION 'Stock insuficiente de "%": disponible %, solicitado %',p.name,p.stock_quantity,-delta; END IF;
  old_flag:=current_setting('inventory.internal',true);
  PERFORM set_config('inventory.internal','yes',true);
  UPDATE public.consumables SET stock_quantity=next_balance WHERE id=product;
  PERFORM set_config('inventory.internal',coalesce(old_flag,''),true);
  INSERT INTO public.stock_movements(product_id,kind,quantity,balance,reason,actor_id,actor_name,source_kind,source_id)
  VALUES(product,movement_kind,delta,next_balance,explanation,auth.uid(),
    coalesce((SELECT username FROM public.user_profiles WHERE id=auth.uid()),'Sistema'),origin,origin_id);
END;
$$;

CREATE FUNCTION public.inventory_reconcile(origin text, origin_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE line record; prior public.stock_source_totals; delta integer; tracked integer; active_source boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(29120000);
  IF origin='sale' THEN
    active_source:=EXISTS(SELECT 1 FROM public.sales WHERE id=origin_id AND type='direct' AND booking_id IS NULL);
  ELSE
    active_source:=EXISTS(SELECT 1 FROM public.bookings WHERE id=origin_id AND status<>'cancelled');
  END IF;
  FOR line IN
    WITH quantities AS (
      SELECT p.id, sum(i.quantity)::integer qty FROM public.sale_items i JOIN public.consumables p ON p.id::text=i.consumable_id OR starts_with(i.consumable_id,p.id::text||'-')
        WHERE origin='sale' AND i.sale_id=origin_id AND active_source GROUP BY p.id
      UNION ALL
      SELECT p.id, sum(i.quantity)::integer FROM public.booking_consumptions i JOIN public.consumables p ON p.id::text=i.consumable_id OR starts_with(i.consumable_id,p.id::text||'-')
        WHERE origin='booking' AND i.booking_id=origin_id AND active_source GROUP BY p.id
    ), ids AS (
      SELECT id FROM quantities UNION SELECT product_id FROM public.stock_source_totals WHERE source_kind=origin AND source_id=origin_id
    )
    SELECT p.id,p.stock_enabled,coalesce(q.qty,0) qty FROM ids JOIN public.consumables p ON p.id=ids.id LEFT JOIN quantities q ON q.id=p.id ORDER BY p.id
  LOOP
    SELECT * INTO prior FROM public.stock_source_totals WHERE source_kind=origin AND source_id=origin_id AND product_id=line.id;
    delta:=line.qty-coalesce(prior.quantity,0); tracked:=coalesce(prior.tracked_quantity,0);
    IF line.qty<0 THEN RAISE EXCEPTION 'La cantidad de productos debe ser positiva'; END IF;
    IF line.stock_enabled THEN
      IF delta>0 THEN
        PERFORM public.inventory_apply(line.id,-delta,'consumption','Salida por '||CASE origin WHEN 'sale' THEN 'venta directa' ELSE 'consumo de reserva' END,origin,origin_id);
        tracked:=tracked+delta;
      ELSIF delta<0 THEN
        IF tracked>0 AND (active_source OR current_setting('inventory.return_cancelled',true)='yes') THEN
          PERFORM public.inventory_apply(line.id,least(-delta,tracked),'return','Devolución de productos',origin,origin_id);
        END IF;
        tracked:=greatest(0,tracked+delta);
      END IF;
    ELSE tracked:=0;
    END IF;
    INSERT INTO public.stock_source_totals(source_kind,source_id,product_id,quantity,tracked_quantity)
    VALUES(origin,origin_id,line.id,line.qty,tracked)
    ON CONFLICT(source_kind,source_id,product_id) DO UPDATE SET quantity=excluded.quantity,tracked_quantity=excluded.tracked_quantity;
  END LOOP;
END;
$$;

-- Deferred reconciliation sees the final total after delete/reinsert edits, and
-- runs in the same transaction as sales, cash, accounts and reservation changes.
CREATE FUNCTION public.inventory_capture() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous uuid; following uuid; origin text:=TG_ARGV[0];
BEGIN
  IF TG_TABLE_NAME IN ('sales','bookings') THEN
    IF TG_OP<>'INSERT' THEN previous:=OLD.id; END IF;
    IF TG_OP<>'DELETE' THEN following:=NEW.id; END IF;
  ELSIF origin='sale' THEN
    IF TG_OP<>'INSERT' THEN previous:=OLD.sale_id; END IF;
    IF TG_OP<>'DELETE' THEN following:=NEW.sale_id; END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN previous:=OLD.booking_id; END IF;
    IF TG_OP<>'DELETE' THEN following:=NEW.booking_id; END IF;
  END IF;
  IF previous IS NOT NULL THEN PERFORM public.inventory_reconcile(origin,previous); END IF;
  IF following IS NOT NULL AND following IS DISTINCT FROM previous THEN PERFORM public.inventory_reconcile(origin,following); END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER inventory_sales AFTER INSERT OR UPDATE OR DELETE ON public.sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_capture('sale');
CREATE CONSTRAINT TRIGGER inventory_sale_items AFTER INSERT OR UPDATE OR DELETE ON public.sale_items DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_capture('sale');
CREATE CONSTRAINT TRIGGER inventory_bookings AFTER INSERT OR UPDATE OR DELETE ON public.bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_capture('booking');
CREATE CONSTRAINT TRIGGER inventory_consumptions AFTER INSERT OR UPDATE OR DELETE ON public.booking_consumptions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_capture('booking');

CREATE FUNCTION public.inventory_save_product(target uuid DEFAULT NULL,payload jsonb DEFAULT '{}'::jsonb)
RETURNS public.consumables LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.consumables; result public.consumables; enabled boolean; minimum integer; initial integer; old_flag text;
BEGIN
  PERFORM pg_advisory_xact_lock(29120000);
  IF NOT public.inventory_allowed(CASE WHEN target IS NULL THEN 'products.create' ELSE 'products.edit' END) THEN
    RAISE EXCEPTION 'Sin permiso para guardar productos' USING ERRCODE='42501';
  END IF;
  IF target IS NOT NULL THEN SELECT * INTO STRICT p FROM public.consumables WHERE id=target FOR UPDATE; END IF;
  enabled:=coalesce((payload->>'stockEnabled')::boolean,p.stock_enabled,false);
  minimum:=coalesce((payload->>'stockMinimum')::integer,p.stock_minimum,0);
  IF enabled IS DISTINCT FROM coalesce(p.stock_enabled,false) OR minimum<>coalesce(p.stock_minimum,0) THEN
    IF NOT public.inventory_allowed('products.stock') THEN RAISE EXCEPTION 'Sin permiso para administrar stock' USING ERRCODE='42501'; END IF;
  END IF;
  IF enabled AND NOT coalesce(p.stock_enabled,false) THEN
    initial:=(payload->>'initialStock')::integer;
    IF initial IS NULL OR initial<0 THEN RAISE EXCEPTION 'Ingresá el conteo inicial de stock'; END IF;
  END IF;
  IF minimum<0 THEN RAISE EXCEPTION 'El stock mínimo no puede ser negativo'; END IF;
  old_flag:=current_setting('inventory.internal',true); PERFORM set_config('inventory.internal','yes',true);
  IF target IS NULL THEN
    INSERT INTO public.consumables(name,description,price,category,available,icon,stock_enabled,stock_minimum)
    VALUES(payload->>'name',coalesce(payload->>'description',''),(payload->>'price')::numeric,payload->>'category',
      coalesce((payload->>'available')::boolean,true),payload->>'icon',enabled,minimum) RETURNING * INTO result;
  ELSE
    UPDATE public.consumables SET name=payload->>'name',description=payload->>'description',price=(payload->>'price')::numeric,
      category=payload->>'category',available=(payload->>'available')::boolean,icon=payload->>'icon',stock_enabled=enabled,stock_minimum=minimum
      WHERE id=target RETURNING * INTO result;
  END IF;
  PERFORM set_config('inventory.internal',coalesce(old_flag,''),true);
  IF enabled IS DISTINCT FROM coalesce(p.stock_enabled,false) THEN
    UPDATE public.stock_source_totals SET tracked_quantity=0 WHERE product_id=result.id;
    PERFORM public.inventory_apply(result.id,CASE WHEN enabled THEN initial-result.stock_quantity ELSE 0 END,
      CASE WHEN enabled THEN 'initial' ELSE 'disabled' END,CASE WHEN enabled THEN 'Conteo al activar el control de stock' ELSE 'Control de stock desactivado' END);
  END IF;
  SELECT * INTO result FROM public.consumables WHERE id=result.id;
  RETURN result;
END;
$$;

CREATE FUNCTION public.inventory_move(target uuid,movement_kind text,amount integer,explanation text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.consumables; delta integer;
BEGIN
  PERFORM pg_advisory_xact_lock(29120000);
  IF NOT public.inventory_allowed('products.stock') THEN RAISE EXCEPTION 'Sin permiso para administrar stock' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT p FROM public.consumables WHERE id=target FOR UPDATE;
  IF NOT p.stock_enabled THEN RAISE EXCEPTION 'Activá primero el control de stock de este producto'; END IF;
  IF explanation IS NULL OR length(trim(explanation))<3 THEN RAISE EXCEPTION 'Ingresá el motivo del movimiento'; END IF;
  IF amount IS NULL OR amount<0 OR (movement_kind<>'count' AND amount=0) THEN RAISE EXCEPTION 'Revisá la cantidad'; END IF;
  delta:=CASE movement_kind WHEN 'entry' THEN amount WHEN 'loss' THEN -amount WHEN 'count' THEN amount-p.stock_quantity ELSE NULL END;
  IF delta IS NULL THEN RAISE EXCEPTION 'Tipo de movimiento inválido'; END IF;
  PERFORM public.inventory_apply(target,delta,movement_kind,trim(explanation));
END;
$$;

CREATE FUNCTION public.inventory_cancel(resource text,target uuid,return_stock boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE profile public.user_profiles; old_flag text;
BEGIN
  PERFORM pg_advisory_xact_lock(29120000);
  SELECT * INTO STRICT profile FROM public.user_profiles WHERE id=auth.uid() AND is_active;
  old_flag:=current_setting('inventory.return_cancelled',true);
  PERFORM set_config('inventory.return_cancelled',CASE WHEN return_stock THEN 'yes' ELSE 'no' END,true);
  IF resource='sales' THEN
    IF profile.role='admin' THEN PERFORM public.cash_save_sale('delete',target,'{}');
    ELSE PERFORM public.employee_mutate('sales','delete',target,'{}'); END IF;
    PERFORM public.inventory_reconcile('sale',target);
  ELSIF resource='bookings' THEN
    IF profile.role='admin' THEN PERFORM public.cash_save_booking(target,'{"status":"cancelled"}');
    ELSE PERFORM public.employee_mutate('bookings','update',target,'{"status":"cancelled"}'); END IF;
    PERFORM public.inventory_reconcile('booking',target);
  ELSE RAISE EXCEPTION 'Operación inválida'; END IF;
  PERFORM set_config('inventory.return_cancelled',coalesce(old_flag,''),true);
END;
$$;

-- Creation must also be atomic when an administrator includes consumptions.
CREATE FUNCTION public.inventory_create_booking(payload jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(29120000);
  IF NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND role='admin' AND is_active) THEN
    RAISE EXCEPTION 'Solo un administrador puede usar esta operación' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.bookings(court_id,court_name,date,start_time,end_time,total_price,final_total,status,is_recurring,recurring_booking_id,closed_at)
  VALUES((payload->>'courtId')::uuid,payload->>'courtName',(payload->>'date')::date,(payload->>'startTime')::time,(payload->>'endTime')::time,
    (payload->>'totalPrice')::numeric,(payload->>'finalTotal')::numeric,coalesce(payload->>'status','confirmed'),
    coalesce((payload->>'isRecurring')::boolean,false),nullif(payload->>'recurringBookingId','')::uuid,(payload->>'closedAt')::timestamptz)
  RETURNING id INTO result;
  PERFORM public.cash_save_booking(result,payload);
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_allowed(text),public.inventory_lock(),public.inventory_guard(),public.inventory_apply(uuid,integer,text,text,text,uuid),
  public.inventory_reconcile(text,uuid),public.inventory_capture(),public.inventory_save_product(uuid,jsonb),public.inventory_move(uuid,text,integer,text),public.inventory_cancel(text,uuid,boolean),public.inventory_create_booking(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_save_product(uuid,jsonb),public.inventory_move(uuid,text,integer,text),public.inventory_cancel(text,uuid,boolean),public.inventory_create_booking(jsonb) TO authenticated;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
