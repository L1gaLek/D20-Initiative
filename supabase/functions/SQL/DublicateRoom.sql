select room_id, user_id, count(*)
from room_members
group by room_id, user_id
having count(*) > 1;

create table if not exists public.campaign_saves (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  name text not null,
  state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists campaign_saves_room_id_created_at_idx
  on public.campaign_saves (room_id, created_at desc);

alter table public.campaign_saves
  add column if not exists owner_key text;

-- если у тебя room_id был NOT NULL, то лучше разрешить NULL
alter table public.campaign_saves
  alter column room_id drop not null;

-- заполним старые строки (если они есть), чтобы не оставались NULL
update public.campaign_saves
set owner_key = coalesce(owner_key, 'legacy_' || room_id::text)
where owner_key is null;

-- сделаем owner_key обязательным
alter table public.campaign_saves
  alter column owner_key set not null;

create index if not exists campaign_saves_owner_created_idx
  on public.campaign_saves (owner_key, created_at desc);

