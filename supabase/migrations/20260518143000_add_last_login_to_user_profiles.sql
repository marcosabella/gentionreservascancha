alter table public.user_profiles
add column if not exists last_login timestamptz;
