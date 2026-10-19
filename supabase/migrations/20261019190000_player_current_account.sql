BEGIN;
-- Preserve existing authorizations; new players require explicit approval.
ALTER TABLE public.players ADD COLUMN current_account_enabled boolean NOT NULL DEFAULT false;
UPDATE public.players SET current_account_enabled=true;

CREATE FUNCTION public.guard_player_credit_authorization() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF (TG_OP='INSERT' AND NEW.current_account_enabled) OR
     (TG_OP='UPDATE' AND NEW.current_account_enabled IS DISTINCT FROM OLD.current_account_enabled) THEN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT EXISTS(
      SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND is_active AND
        (role='admin' OR (role='employee' AND permissions ? 'players.view' AND permissions ? 'players.credit'))
    ) THEN RAISE EXCEPTION 'No tenés permiso para habilitar o deshabilitar cuenta corriente' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER player_credit_authorization BEFORE INSERT OR UPDATE ON public.players
FOR EACH ROW EXECUTE FUNCTION public.guard_player_credit_authorization();

CREATE FUNCTION public.booking_credit_amounts(target uuid)
RETURNS TABLE(player_uuid uuid,charge numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.bookings; p public.booking_players; c public.booking_consumptions;
  n integer; cost numeric; share numeric; paid numeric;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id=target;
  IF NOT FOUND OR b.status<>'completed' THEN RETURN; END IF;
  SELECT count(*) INTO n FROM public.booking_players WHERE booking_id=target;
  IF n=0 THEN RETURN; END IF;
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
    charge:=0;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p.payment_splits,'[]'::jsonb)) part WHERE part->>'method'='current_account') THEN
      SELECT coalesce(sum((part->>'amount')::numeric),0),coalesce(sum((part->>'amount')::numeric) FILTER(WHERE part->>'method'='current_account'),0)
        INTO paid,charge FROM jsonb_array_elements(p.payment_splits) part;
      charge:=charge+greatest(round(share-paid,2),0);
    ELSIF p.payment_method='current_account' THEN charge:=share;
    END IF;
    player_uuid:=p.player_id; charge:=round(charge,2);
    RETURN NEXT;
  END LOOP;
END;
$$;
-- Last approved credit by booking and player, independent of later payments.
-- This permits preserving/reducing historical debt after authorization is revoked.
CREATE TABLE public.player_booking_credit (
  booking_id uuid NOT NULL, player_id uuid NOT NULL, amount numeric(14,2) NOT NULL,
  PRIMARY KEY(booking_id,player_id)
);
ALTER TABLE public.player_booking_credit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.player_booking_credit FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.player_booking_credit TO service_role;
INSERT INTO public.player_booking_credit(booking_id,player_id,amount)
SELECT b.id,c.player_uuid,sum(c.charge) FROM public.bookings b
CROSS JOIN LATERAL public.booking_credit_amounts(b.id) c
WHERE c.player_uuid IS NOT NULL GROUP BY b.id,c.player_uuid;

CREATE FUNCTION public.guard_booking_credit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid; item record; authorized boolean; player_name text; previous numeric;
BEGIN
  IF TG_TABLE_NAME='bookings' THEN
    target:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
  ELSE
    target:=CASE WHEN TG_OP='DELETE' THEN OLD.booking_id ELSE NEW.booking_id END;
  END IF;
  PERFORM pg_advisory_xact_lock(19160000);
  FOR item IN SELECT player_uuid,sum(charge) amount FROM public.booking_credit_amounts(target) GROUP BY player_uuid ORDER BY player_uuid LOOP
    SELECT current_account_enabled,name INTO authorized,player_name FROM public.players WHERE id=item.player_uuid FOR SHARE;
    SELECT amount INTO previous FROM public.player_booking_credit WHERE booking_id=target AND player_id=item.player_uuid;
    IF item.amount>coalesce(previous,0) AND NOT coalesce(authorized,false) THEN
      RAISE EXCEPTION 'Cuenta corriente deshabilitada para %. Elegí otro medio de pago',coalesce(player_name,'este jugador');
    END IF;
  END LOOP;
  DELETE FROM public.player_booking_credit WHERE booking_id=target;
  INSERT INTO public.player_booking_credit(booking_id,player_id,amount)
    SELECT target,player_uuid,sum(charge) FROM public.booking_credit_amounts(target)
    WHERE player_uuid IS NOT NULL GROUP BY player_uuid;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER credit_booking AFTER INSERT OR UPDATE OR DELETE ON public.bookings DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_booking_credit();
CREATE CONSTRAINT TRIGGER credit_booking_players AFTER INSERT OR UPDATE OR DELETE ON public.booking_players DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_booking_credit();
CREATE CONSTRAINT TRIGGER credit_booking_consumptions AFTER INSERT OR UPDATE OR DELETE ON public.booking_consumptions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.guard_booking_credit();

CREATE FUNCTION public.guard_sale_credit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE authorized boolean; player_name text;
BEGIN
  IF NEW.payment_method='current_account' AND NEW.type='direct' THEN
    IF NEW.customer_id IS NULL OR NEW.customer_type<>'registered' THEN RAISE EXCEPTION 'Cuenta corriente requiere un jugador registrado'; END IF;
    SELECT current_account_enabled,name INTO authorized,player_name FROM public.players WHERE id=NEW.customer_id FOR SHARE;
    IF NOT coalesce(authorized,false) THEN
      IF TG_OP='UPDATE' AND OLD.payment_method='current_account' AND OLD.customer_id=NEW.customer_id AND NEW.total_amount<=OLD.total_amount THEN RETURN NEW; END IF;
      RAISE EXCEPTION 'Cuenta corriente deshabilitada para %. Elegí otro medio de pago',coalesce(player_name,'este jugador');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sale_credit BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.guard_sale_credit();

CREATE FUNCTION public.guard_account_credit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE authorized boolean; player_name text; allowance numeric; used numeric;
BEGIN
  -- Credits/payments are always allowed, even for disabled players.
  IF NEW.type<>'debit' THEN RETURN NEW; END IF;
  SELECT current_account_enabled,name INTO authorized,player_name FROM public.players WHERE id=NEW.player_id FOR SHARE;
  IF coalesce(authorized,false) THEN RETURN NEW; END IF;
  IF NEW.related_booking_id IS NOT NULL THEN
    SELECT amount INTO allowance FROM public.player_booking_credit WHERE booking_id=NEW.related_booking_id AND player_id=NEW.player_id;
    SELECT coalesce(sum(amount),0) INTO used FROM public.current_account_entries
      WHERE related_booking_id=NEW.related_booking_id AND player_id=NEW.player_id AND type='debit' AND id<>NEW.id;
    IF NEW.amount+used<=coalesce(allowance,0) THEN RETURN NEW; END IF;
  ELSIF NEW.related_sale_id IS NOT NULL THEN
    SELECT total_amount INTO allowance FROM public.sales WHERE id=NEW.related_sale_id AND payment_method='current_account' AND customer_id=NEW.player_id;
    SELECT coalesce(sum(amount),0) INTO used FROM public.current_account_entries
      WHERE related_sale_id=NEW.related_sale_id AND player_id=NEW.player_id AND type='debit' AND id<>NEW.id;
    IF NEW.amount+used<=coalesce(allowance,0) THEN RETURN NEW; END IF;
  ELSIF TG_OP='UPDATE' THEN
    IF OLD.type='debit' AND OLD.player_id=NEW.player_id AND NEW.amount<=OLD.amount THEN RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'Cuenta corriente deshabilitada para %. No se puede generar nueva deuda',coalesce(player_name,'este jugador');
END;
$$;
CREATE TRIGGER account_credit BEFORE INSERT OR UPDATE ON public.current_account_entries FOR EACH ROW EXECUTE FUNCTION public.guard_account_credit();
REVOKE ALL ON FUNCTION public.guard_player_credit_authorization(),public.booking_credit_amounts(uuid),public.guard_booking_credit(),public.guard_sale_credit(),public.guard_account_credit() FROM PUBLIC,anon,authenticated;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
