BEGIN;
ALTER TABLE public.cash_movements ADD COLUMN source_detail text[] NOT NULL DEFAULT '{}';

-- Internal only: names and payment allocation, without contact information.
CREATE FUNCTION public.cash_source_detail(source text, target uuid) RETURNS text[]
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
      SELECT string_agg(
        CASE part->>'method' WHEN 'cash' THEN 'Efectivo' WHEN 'card' THEN 'Tarjeta' WHEN 'transfer' THEN 'Transferencia' WHEN 'current_account' THEN 'Cuenta corriente' ELSE 'Sin medio informado' END
        || ' $ ' || replace(round((part->>'amount')::numeric,2)::text,'.',','), ' + ' ORDER BY ord)
        INTO payments FROM jsonb_array_elements(CASE WHEN jsonb_array_length(coalesce(p.payment_splits,'[]'))>0 THEN p.payment_splits
          ELSE jsonb_build_array(jsonb_build_object('method',p.payment_method,'amount',round(share,2))) END) WITH ORDINALITY AS parts(part,ord);
      result:=array_append(result, p.player_name || ' · ' || coalesce(payments,'Sin pago informado'));
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
REVOKE ALL ON FUNCTION public.cash_source_detail(text,uuid) FROM PUBLIC,anon,authenticated;

-- Legacy movements cannot be represented as historical payment snapshots.
UPDATE public.cash_movements m SET source_detail = ARRAY['Detalle recuperado del origen actual (no histórico)'] || public.cash_source_detail(m.source_type,m.source_id)
WHERE m.source_type IS NOT NULL AND cardinality(public.cash_source_detail(m.source_type,m.source_id))>0;

CREATE FUNCTION public.cash_snapshot_detail() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.source_type IS NOT NULL THEN
    NEW.source_detail:=public.cash_source_detail(NEW.source_type,NEW.source_id);
    IF cardinality(NEW.source_detail)=0 THEN
      SELECT source_detail INTO NEW.source_detail FROM public.cash_movements
        WHERE source_type=NEW.source_type AND source_id=NEW.source_id AND cardinality(source_detail)>0 ORDER BY created_at DESC,id DESC LIMIT 1;
      NEW.source_detail:=ARRAY['Origen eliminado · último detalle disponible'] || coalesce(NEW.source_detail,'{}');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cash_snapshot_detail() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cash_snapshot_detail BEFORE INSERT ON public.cash_movements FOR EACH ROW EXECUTE FUNCTION public.cash_snapshot_detail();
SELECT pg_notify('pgrst','reload schema');
COMMIT;
