BEGIN;
CREATE OR REPLACE FUNCTION public.get_all_users()
 RETURNS TABLE(id uuid, email text, phone text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        u.id,
        u.email,
        u.phone,
        u.created_at,
        u.last_sign_in_at
    FROM auth.users u
    ORDER BY u.created_at DESC;
END;
$function$;
CREATE OR REPLACE FUNCTION public.handle_first_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
user_count integer;
BEGIN
-- Count existing user_profiles
SELECT COUNT(*) INTO user_count FROM public.user_profiles WHERE role = 'admin';

-- If this is the first admin being created, mark it
IF user_count = 0 AND NEW.role = 'admin' THEN
UPDATE public.system_config
SET value = 'true', updated_at = now()
WHERE key = 'admin_initialized';
END IF;

RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.make_first_user_admin()
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
first_user_id uuid;
admin_count integer;
BEGIN
-- Check if admin already exists
SELECT COUNT(*) INTO admin_count FROM public.user_profiles WHERE role = 'admin' AND is_active = true;

IF admin_count > 0 THEN
RETURN QUERY SELECT false, 'Admin user already exists'::text;
RETURN;
END IF;

-- Get the first created user
SELECT id INTO first_user_id
FROM public.user_profiles
ORDER BY created_at ASC
LIMIT 1;

IF first_user_id IS NULL THEN
RETURN QUERY SELECT false, 'No users found'::text;
RETURN;
END IF;

-- Make them admin
UPDATE public.user_profiles
SET role = 'admin', is_active = true, updated_at = now()
WHERE id = first_user_id;

-- Update system config
UPDATE public.system_config
SET value = 'true', updated_at = now()
WHERE key = 'admin_initialized';

RETURN QUERY SELECT true, 'First user promoted to admin'::text;
END;
$function$;
CREATE OR REPLACE FUNCTION public.sync_user_profile_last_login()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  profile_id uuid;
  metadata_profile_id text;
begin
  if new.last_sign_in_at is null then
    return new;
  end if;

  if old.last_sign_in_at is not null and old.last_sign_in_at = new.last_sign_in_at then
    return new;
  end if;

  metadata_profile_id := nullif(new.raw_user_meta_data ->> 'profile_id', '');
  profile_id := case
    when metadata_profile_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then metadata_profile_id::uuid
    else new.id
  end;

  update public.user_profiles
  set
    last_login = new.last_sign_in_at,
    updated_at = now()
  where id = profile_id;

  return new;
end;
$function$;
CREATE OR REPLACE FUNCTION public.update_schedule_settings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_user_profiles_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;
COMMIT;
