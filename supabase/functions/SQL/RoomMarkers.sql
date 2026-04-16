create table if not exists public.room_map_meta (
  room_id text not null references public.rooms(id) on delete cascade,
  map_id text not null,
  name text not null default 'Карта',
  section_id text null,
  board_width integer not null default 10,
  board_height integer not null default 10,
  board_bg_url text null,
  board_bg_storage_path text null,
  board_bg_storage_bucket text null,
  grid_alpha double precision not null default 1,
  wall_alpha double precision not null default 1,
  updated_at timestamptz not null default now(),
  primary key (room_id, map_id)
);

create table if not exists public.room_walls (
  room_id text not null references public.rooms(id) on delete cascade,
  map_id text not null,
  x integer not null,
  y integer not null,
  dir text not null,
  wall_type text not null default 'stone',
  thickness integer not null default 4,
  updated_at timestamptz not null default now(),
  primary key (room_id, map_id, x, y, dir)
);
create index if not exists idx_room_walls_room_map on public.room_walls(room_id, map_id);

create table if not exists public.room_marks (
  room_id text not null references public.rooms(id) on delete cascade,
  map_id text not null,
  mark_id text not null,
  owner_id text null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, map_id, mark_id)
);
create index if not exists idx_room_marks_room_map on public.room_marks(room_id, map_id);
create index if not exists idx_room_marks_owner on public.room_marks(room_id, owner_id);

create table if not exists public.room_fog (
  room_id text not null references public.rooms(id) on delete cascade,
  map_id text not null,
  settings jsonb not null default '{}'::jsonb,
  manual_stamps jsonb not null default '[]'::jsonb,
  explored_packed text not null default '',
  updated_at timestamptz not null default now(),
  primary key (room_id, map_id)
);
create index if not exists idx_room_fog_room_map on public.room_fog(room_id, map_id);

create table if not exists public.room_music_state (
  room_id text not null references public.rooms(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id)
);

alter table public.room_map_meta replica identity full;
alter table public.room_walls replica identity full;
alter table public.room_marks replica identity full;
alter table public.room_fog replica identity full;
alter table public.room_music_state replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.room_map_meta;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.room_walls;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.room_marks;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.room_fog;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.room_music_state;
  exception when duplicate_object then null; end;
end $$;


-- Compatibility migrations for already-created tables (safe to run repeatedly)
alter table if exists public.room_marks
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table if exists public.room_fog
  add column if not exists settings jsonb not null default '{}'::jsonb;
alter table if exists public.room_fog
  add column if not exists manual_stamps jsonb not null default '[]'::jsonb;
alter table if exists public.room_fog
  add column if not exists explored_packed text not null default '';

alter table if exists public.room_music_state
  add column if not exists payload jsonb not null default '{}'::jsonb;
