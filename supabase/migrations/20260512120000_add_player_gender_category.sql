alter table public.players
  add column if not exists gender text check (gender in ('masculino', 'femenino')),
  add column if not exists category integer check (category between 1 and 8);

