create table if not exists public.court_unavailabilities (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.courts(id) on delete cascade,
  court_name text not null,
  title text not null,
  reason text not null default 'other'
    check (reason in ('class', 'closed', 'maintenance', 'other')),
  date date,
  day_of_week integer check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_recurring boolean not null default false,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  constraint court_unavailabilities_time_order check (start_time < end_time),
  constraint court_unavailabilities_date_or_day check (
    (is_recurring = false and date is not null and day_of_week is null)
    or
    (is_recurring = true and date is null and day_of_week is not null)
  )
);

create index if not exists court_unavailabilities_court_date_idx
  on public.court_unavailabilities (court_id, date, start_time);

create index if not exists court_unavailabilities_court_day_idx
  on public.court_unavailabilities (court_id, day_of_week, start_time)
  where is_recurring = true;

alter table public.court_unavailabilities enable row level security;

create policy "Authenticated users can read court unavailabilities"
  on public.court_unavailabilities
  for select
  to authenticated
  using (true);

create policy "Authenticated users can manage court unavailabilities"
  on public.court_unavailabilities
  for all
  to authenticated
  using (true)
  with check (true);
