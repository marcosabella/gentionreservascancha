BEGIN;
-- Costs allocated to a player are not evidence of payment. An explicit empty
-- split list is a recorded zero, including when a teammate covered that share.
CREATE OR REPLACE FUNCTION public.cash_source_detail(source text, target uuid) RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.bookings; p public.booking_players; c public.booking_consumptions;
  result text[] := '{}'; n integer; cost numeric; share numeric; payments text;
BEGIN
  IF source='booking' THEN
    SELECT * INTO b FROM public.bookings WHERE id=target;
    IF NOT FOUND THEN RETURN result; END IF;
    result:=array_append(result, b.court_name || ' · ' || to_char(b.date,'DD/MM/YYYY') || ' · ' || to_char(b.start_time,'HH24:MI') || ' a ' || to_char(b.end_time,'HH24:MI'));
    SELECT count(*) INTO n FROM public.booking_players WHERE booking_id=target;
    SELECT CASE WHEN b.total_price>0 THEN b.total_price ELSE greatest(coalesce(b.final_total,0)-coalesce(sum(price*quantity),0),0) END
      INTO cost FROM public.booking_consumptions WHERE booking_id=target;
    FOR p IN SELECT * FROM public.booking_players WHERE booking_id=target ORDER BY player_name,player_id LOOP
      share:=cost/n;
      FOR c IN SELECT * FROM public.booking_consumptions WHERE booking_id=target LOOP
        IF c.split_between_players THEN share:=share+c.price*c.quantity::numeric/n;
        ELSIF cardinality(c.assigned_to_players)>0 AND p.player_id=ANY(c.assigned_to_players) THEN
          share:=share+c.price*c.quantity::numeric/cardinality(c.assigned_to_players);
        END IF;
      END LOOP;
      IF p.payment_splits = '[]'::jsonb OR (p.payment_splits IS NULL AND p.payment_method IS NULL) THEN
        payments := 'Sin pago $ 0,00';
      ELSE
        SELECT string_agg(
          CASE part->>'method' WHEN 'cash' THEN 'Efectivo' WHEN 'card' THEN 'Tarjeta' WHEN 'transfer' THEN 'Transferencia' WHEN 'current_account' THEN 'Cuenta corriente' ELSE 'Sin medio informado' END
          || ' $ ' || replace(round((part->>'amount')::numeric,2)::text,'.',','), ' + ' ORDER BY ord)
          INTO payments FROM jsonb_array_elements(CASE WHEN jsonb_array_length(coalesce(p.payment_splits,'[]'))>0 THEN p.payment_splits
            ELSE jsonb_build_array(jsonb_build_object('method',p.payment_method,'amount',round(share,2))) END) WITH ORDINALITY AS parts(part,ord);
      END IF;
      result:=array_append(result, p.player_name || ' · ' || coalesce(payments,'Sin pago $ 0,00'));
    END LOOP;
  ELSIF source='sale' THEN
    SELECT ARRAY[coalesce(customer_name,'Consumidor final') || ' · ' || to_char(date,'DD/MM/YYYY') || ' · ' || to_char(time,'HH24:MI')]
      INTO result FROM public.sales WHERE id=target;
  ELSIF source='account' THEN
    SELECT ARRAY[coalesce(player.name,'Jugador sin nombre') || ' · ' || e.description || ' · ' || to_char(e.date,'DD/MM/YYYY')]
      INTO result FROM public.current_account_entries e LEFT JOIN public.players player ON player.id=e.player_id WHERE e.id=target;
  END IF;
  RETURN coalesce(result,'{}');
END;
$$;

-- Repair only the identifiable presentation error in saved snapshots. Preserve
-- the rest of each historical snapshot and every ledger amount/payment/debt.
WITH corrected AS (
  SELECT m.id, array_agg(CASE WHEN EXISTS (
    SELECT 1 FROM public.booking_players p WHERE p.booking_id = m.source_id
      AND p.payment_splits = '[]'::jsonb AND p.payment_method IS NULL
      AND position(p.player_name || ' · Sin medio informado $ ' IN d.line) = 1
    ) THEN regexp_replace(d.line, ' · Sin medio informado \$ -?[0-9]+(,[0-9]+)?$', ' · Sin pago $ 0,00') ELSE d.line END ORDER BY d.position) detail
  FROM public.cash_movements m CROSS JOIN LATERAL unnest(m.source_detail) WITH ORDINALITY AS d(line,position)
  WHERE m.source_type = 'booking'
  GROUP BY m.id
)
UPDATE public.cash_movements m SET source_detail = c.detail FROM corrected c
WHERE m.id = c.id AND m.source_detail IS DISTINCT FROM c.detail;
SELECT pg_notify('pgrst', 'reload schema');
COMMIT;
