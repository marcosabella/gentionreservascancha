-- Required on both clients: roles/permissions may only be changed by the
-- authenticated administrative Edge Functions, never by editing one's profile.
BEGIN;
CREATE OR REPLACE FUNCTION public.app_is_active_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND role='admin' AND is_active);
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon;
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.user_profiles FROM authenticated;
GRANT SELECT(id,player_id,role,is_active,created_by,created_at,updated_at,username,last_login,permissions)
  ON public.user_profiles TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_is_active_admin() TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.get_all_users() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.make_first_user_admin() FROM authenticated;
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_profiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.user_profiles',item.policyname);
  END LOOP;
END;
$$;
CREATE POLICY profiles_session_read ON public.user_profiles FOR SELECT TO authenticated
  USING(id=auth.uid() OR (SELECT public.app_is_active_admin()));
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'user_profiles' LOOP
    EXECUTE format('DROP POLICY IF EXISTS active_application_user ON public.%I',item.tablename);
    EXECUTE format('CREATE POLICY active_application_user ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND is_active)) WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id=auth.uid() AND is_active))',item.tablename);
  END LOOP;
END;
$$;
SELECT pg_notify('pgrst','reload schema');
COMMIT;
