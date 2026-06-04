alter table public.user_profiles
  add column if not exists password_hash text,
  add column if not exists password_updated_at timestamptz;

