-- Pura Vida only: preserve the existing active-admin rules without recursively
-- querying user_profiles under its own row-level security policies.
BEGIN;
CREATE OR REPLACE FUNCTION public.pura_vida_is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
$$;
ALTER FUNCTION public.pura_vida_is_active_admin() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.pura_vida_is_active_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pura_vida_is_active_admin() TO authenticated, service_role;

ALTER POLICY "Admins can create profiles" ON public.user_profiles
  WITH CHECK ((SELECT public.pura_vida_is_active_admin()));
ALTER POLICY "Admins can delete profiles" ON public.user_profiles
  USING ((SELECT public.pura_vida_is_active_admin()));
ALTER POLICY "Admins can update profiles" ON public.user_profiles
  USING ((SELECT public.pura_vida_is_active_admin()))
  WITH CHECK ((SELECT public.pura_vida_is_active_admin()));
ALTER POLICY "Admins can view all profiles" ON public.user_profiles
  USING ((SELECT public.pura_vida_is_active_admin()));
SELECT pg_notify('pgrst', 'reload schema');
COMMIT;
