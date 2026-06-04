create or replace function public.sync_user_profile_last_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists sync_user_profile_last_login_on_auth_users on auth.users;

create trigger sync_user_profile_last_login_on_auth_users
after update of last_sign_in_at on auth.users
for each row
execute function public.sync_user_profile_last_login();
