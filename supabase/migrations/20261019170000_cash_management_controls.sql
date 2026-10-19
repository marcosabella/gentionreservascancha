BEGIN;
ALTER TABLE public.cash_sessions ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by_name text, ADD COLUMN delete_reason text;
DROP INDEX public.cash_one_open;
CREATE UNIQUE INDEX cash_one_open ON public.cash_sessions ((true)) WHERE closed_at IS NULL AND deleted_at IS NULL;
CREATE TABLE public.cash_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.cash_sessions(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_id uuid NOT NULL, actor_name text NOT NULL,
  action text NOT NULL, reason text NOT NULL,
  before_data jsonb, after_data jsonb NOT NULL
);
CREATE INDEX cash_audit_session ON public.cash_audit(session_id,created_at);
ALTER TABLE public.cash_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.cash_audit TO authenticated;
GRANT ALL ON public.cash_audit TO service_role;
DROP POLICY cash_read_sessions ON public.cash_sessions;
CREATE POLICY cash_read_sessions ON public.cash_sessions FOR SELECT TO authenticated
  USING(public.cash_allowed('cash.view') AND
    ((closed_at IS NULL AND deleted_at IS NULL) OR public.cash_allowed('cash.report')
      OR public.cash_allowed('cash.edit') OR public.cash_allowed('cash.delete') OR public.cash_allowed('cash.reopen')));
CREATE POLICY cash_read_audit ON public.cash_audit FOR SELECT TO authenticated
  USING(public.cash_allowed('cash.report'));

-- Keep the existing receipt and basic command logic, excluding deleted sessions
-- from every lookup of the currently open register.
DO $$
DECLARE signature text; definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.cash_capture()','public.cash_command(text,jsonb)'] LOOP
    definition:=pg_get_functiondef(signature::regprocedure);
    IF position('WHERE closed_at IS NULL' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected cash function definition: %',signature; END IF;
    EXECUTE replace(definition,'WHERE closed_at IS NULL','WHERE closed_at IS NULL AND deleted_at IS NULL');
  END LOOP;
END;
$$;
ALTER FUNCTION public.cash_command(text,jsonb) RENAME TO cash_command_basic;
REVOKE ALL ON FUNCTION public.cash_command_basic(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.cash_command(action text, payload jsonb DEFAULT '{}'::jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.cash_sessions; before_state jsonb; after_state jsonb; who text;
  value numeric(14,2); expected numeric(14,2); result uuid; reason text:=trim(coalesce(payload->>'notes',''));
BEGIN
  IF NOT public.cash_allowed('cash.view') THEN RAISE EXCEPTION 'No tenés acceso a Caja' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(19160000);
  SELECT username INTO who FROM public.user_profiles WHERE id=auth.uid();
  IF action IN ('edit','delete','reopen') THEN
    IF NOT public.cash_allowed('cash.'||action) THEN RAISE EXCEPTION 'No tenés permiso para esta acción de Caja' USING ERRCODE='42501'; END IF;
    IF reason='' THEN RAISE EXCEPTION 'Ingresá el motivo del cambio'; END IF;
    SELECT * INTO STRICT s FROM public.cash_sessions WHERE id=(payload->>'sessionId')::uuid FOR UPDATE;
    before_state:=to_jsonb(s);
    IF action='edit' THEN
      IF s.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Restaurá la caja antes de modificarla'; END IF;
      value:=(payload->>'amount')::numeric;
      IF value IS NULL OR value<0 OR value::text='NaN' THEN RAISE EXCEPTION 'Monto de apertura inválido'; END IF;
      SELECT value+coalesce(sum(amount) FILTER(WHERE method='cash'),0) INTO expected FROM public.cash_movements WHERE session_id=s.id;
      UPDATE public.cash_sessions SET opening_amount=value,opening_notes=coalesce(payload->>'openingNotes',opening_notes),
        expected_cash=CASE WHEN closed_at IS NOT NULL THEN expected ELSE expected_cash END,
        difference=CASE WHEN closed_at IS NOT NULL THEN counted_cash-expected ELSE difference END WHERE id=s.id;
    ELSIF action='delete' THEN
      IF s.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'La caja ya fue eliminada'; END IF;
      UPDATE public.cash_sessions SET deleted_at=clock_timestamp(),deleted_by_name=who,delete_reason=reason WHERE id=s.id;
    ELSE
      IF s.closed_at IS NULL AND s.deleted_at IS NULL THEN RAISE EXCEPTION 'Esta caja ya está abierta'; END IF;
      IF EXISTS(SELECT 1 FROM public.cash_sessions WHERE closed_at IS NULL AND deleted_at IS NULL AND id<>s.id) THEN
        RAISE EXCEPTION 'Cerrá la caja abierta antes de reabrir otra';
      END IF;
      UPDATE public.cash_sessions SET closed_at=NULL,closed_by=NULL,closed_by_name=NULL,
        expected_cash=NULL,counted_cash=NULL,difference=NULL,retained_cash=NULL,handed_over=NULL,closing_notes=NULL,
        deleted_at=NULL,deleted_by_name=NULL,delete_reason=NULL WHERE id=s.id;
    END IF;
    result:=s.id;
  ELSE
    SELECT to_jsonb(c) INTO before_state FROM public.cash_sessions c WHERE id=(payload->>'sessionId')::uuid;
    result:=public.cash_command_basic(action,payload);
  END IF;
  SELECT to_jsonb(c) INTO after_state FROM public.cash_sessions c WHERE id=result;
  -- Movement commands return a movement ID; their own ledger is the audit trail.
  IF after_state IS NOT NULL THEN
    INSERT INTO public.cash_audit(session_id,actor_id,actor_name,action,reason,before_data,after_data)
      VALUES(result,auth.uid(),who,action,reason,before_state,after_state);
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.cash_command(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cash_command(text,jsonb) TO authenticated;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
