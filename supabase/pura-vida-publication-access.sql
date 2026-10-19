-- Apply only to qsvdpdifygmzdawxfyqv before its first public deployment.
BEGIN;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
REVOKE CREATE ON SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_all_users() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.make_first_user_admin() FROM authenticated;

-- User management is performed by the authenticated server functions. Never let
-- a browser overwrite roles or read password hashes directly.
REVOKE ALL ON public.user_profiles FROM authenticated;
GRANT SELECT (id, player_id, role, is_active, created_by, created_at, updated_at, username, last_login)
  ON public.user_profiles TO authenticated;
DROP POLICY IF EXISTS "Allow all selects" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow all inserts" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow all updates" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow all deletes" ON public.user_profiles;

-- Even when a permissive legacy policy exists, require an active application
-- profile. A standalone Supabase Auth signup does not grant application access.
DO $policies$
DECLARE application_table record;
BEGIN
  FOR application_table IN SELECT tablename FROM pg_tables
    WHERE schemaname='public' AND tablename <> 'user_profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS active_application_user ON public.%I', application_table.tablename);
    EXECUTE format(
      'CREATE POLICY active_application_user ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_active = true)) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND is_active = true))',
      application_table.tablename
    );
  END LOOP;
END;
$policies$;
SELECT pg_notify('pgrst', 'reload schema');
COMMIT;
