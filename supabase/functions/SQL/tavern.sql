-- Tavern announcements table for board modal.
create table if not exists public.tavern_announcements (
  id uuid primary key default gen_random_uuid(),
  author_id text not null,
  author_name text not null,
  scenario text not null,
  adventure_type text not null check (adventure_type in ('Кампания', 'Ваншот')),
  level text not null,
  max_players integer not null check (max_players > 0),
  needed_players integer not null check (needed_players > 0 and needed_players <= max_players),
  start_at timestamptz not null,
  contact text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tavern_announcements_start_at_idx
  on public.tavern_announcements (start_at);

create index if not exists tavern_announcements_author_start_idx
  on public.tavern_announcements (author_id, start_at);

alter table public.tavern_announcements enable row level security;

create policy "tavern announcements read"
  on public.tavern_announcements
  for select
  using (true);

create policy "tavern announcements insert"
  on public.tavern_announcements
  for insert
  with check (true);

create policy "tavern announcements update own"
  on public.tavern_announcements
  for update
  using (true);

create policy "tavern announcements delete own"
  on public.tavern_announcements
  for delete
  using (true);