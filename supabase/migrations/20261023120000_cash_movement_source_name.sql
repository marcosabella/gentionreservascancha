BEGIN;

ALTER TABLE public.cash_movements ADD COLUMN source_name text;

-- Keep the organizer/customer with the receipt, even if its source is deleted.
CREATE FUNCTION public.cash_source_name(source text, target uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE source
    WHEN 'booking' THEN (
      SELECT nullif(btrim(player_name),'') FROM public.booking_players
      WHERE booking_id=target AND is_organizer
      ORDER BY player_id LIMIT 1
    )
    WHEN 'sale' THEN (
      SELECT coalesce(nullif(btrim(customer_name),''),'Consumidor final')
      FROM public.sales WHERE id=target
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.cash_source_name(text,uuid) FROM PUBLIC,anon,authenticated;

UPDATE public.cash_movements m
SET source_name=public.cash_source_name(m.source_type,m.source_id)
WHERE m.source_type IN ('booking','sale');

-- Deleted sales may still have a customer in their saved source detail.
UPDATE public.cash_movements m SET source_name=regexp_replace(detail.line,' · [0-9]{2}/[0-9]{2}/[0-9]{4} · [0-9]{2}:[0-9]{2}$','')
FROM (
  SELECT DISTINCT ON (id) id,line
  FROM public.cash_movements CROSS JOIN LATERAL unnest(source_detail) WITH ORDINALITY AS d(line,position)
  WHERE source_type='sale' AND source_name IS NULL
    AND line ~ ' · [0-9]{2}/[0-9]{2}/[0-9]{4} · [0-9]{2}:[0-9]{2}$'
  ORDER BY id,position
) detail WHERE m.id=detail.id;

CREATE FUNCTION public.cash_snapshot_source_name() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  NEW.source_name:=public.cash_source_name(NEW.source_type,NEW.source_id);
  IF NEW.source_name IS NULL AND NEW.source_type IN ('booking','sale') THEN
    SELECT source_name INTO NEW.source_name FROM public.cash_movements
    WHERE source_type=NEW.source_type AND source_id=NEW.source_id AND source_name IS NOT NULL
    ORDER BY created_at DESC,id DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.cash_snapshot_source_name() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER cash_snapshot_source_name BEFORE INSERT ON public.cash_movements
FOR EACH ROW EXECUTE FUNCTION public.cash_snapshot_source_name();

SELECT pg_notify('pgrst','reload schema');
COMMIT;
