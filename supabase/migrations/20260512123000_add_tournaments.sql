create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default false,
  pairs jsonb not null default '[]'::jsonb,
  zones jsonb not null default '[]'::jsonb,
  playoff_rounds jsonb not null default '[]'::jsonb,
  matches jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists tournaments_one_active_idx
  on public.tournaments (is_active)
  where is_active = true;

alter table public.tournaments enable row level security;

create policy "Authenticated users can read tournaments"
  on public.tournaments
  for select
  to authenticated
  using (true);

create policy "Authenticated users can manage tournaments"
  on public.tournaments
  for all
  to authenticated
  using (true)
  with check (true);
