-- Перенос пароля комнаты в таблицу rooms
alter table public.rooms
  add column if not exists has_password boolean not null default false,
  add column if not exists password_hash text;

create index if not exists idx_rooms_has_password on public.rooms (has_password);

-- Таблица банов по комнатам
create table if not exists public.room_bans (
  id uuid primary key default gen_random_uuid(),
  room_id text not null references public.rooms(id) on delete cascade,
  user_id text not null,
  reason text,
  banned_until timestamptz not null,
  banned_by_user_id text,
  banned_by_name text,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_room_bans_room_user
  on public.room_bans (room_id, user_id);

create index if not exists idx_room_bans_room_user_until
  on public.room_bans (room_id, user_id, banned_until desc);

create index if not exists idx_room_bans_room_until
  on public.room_bans (room_id, banned_until desc);
