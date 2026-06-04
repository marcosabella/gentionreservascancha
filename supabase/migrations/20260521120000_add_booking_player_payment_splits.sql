alter table public.booking_players
add column if not exists payment_splits jsonb;

