create table if not exists public.rooms (
  id text primary key,
  name text not null,
  scenario text,
  created_at timestamptz not null default now()
);

create table if not exists public.room_state (
  room_id text primary key references public.rooms(id) on delete cascade,
  phase text not null default 'EXPLORE'
    check (phase in ('EXPLORE','INIT_FREE','COMBAT')),
  current_actor_id text,
  round int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.tokens (
  room_id text not null references public.rooms(id) on delete cascade,
  token_id text not null,
  owner_user_id text not null,
  name text not null,
  color text,
  size int not null default 40,
  x int not null default 0,
  y int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (room_id, token_id)
);

create table if not exists public.initiative (
  room_id text not null references public.rooms(id) on delete cascade,
  actor_id text not null,
  total int not null,
  d20 int not null,
  bonus int not null,
  updated_at timestamptz not null default now(),
  primary key (room_id, actor_id)
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  name text not null,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_tokens_room on public.tokens(room_id);
create index if not exists idx_initiative_room on public.initiative(room_id);
create index if not exists idx_characters_user on public.characters(user_id);

alter table public.room_state
add column if not exists state jsonb not null default '{}'::jsonb;

alter table public.room_state
drop constraint if exists room_state_phase_check;

-- 1) Таблица участников комнаты
create table if not exists public.room_members (
  room_id text not null references public.rooms(id) on delete cascade,
  user_id text not null,
  name text not null,
  role text not null,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists idx_room_members_room
on public.room_members(room_id);

-- 2) Жёсткое правило: в одной комнате только один GM
create unique index if not exists uq_one_gm_per_room
on public.room_members (room_id)
where (role = 'GM');

alter table public.room_members
add column if not exists last_seen timestamptz not null default now();

create index if not exists idx_room_members_last_seen
on public.room_members(last_seen);

alter table public.rooms
add column if not exists emptied_at timestamptz null;

create index if not exists idx_room_emptied_at
on public.rooms(emptied_at);

create or replace function public.cleanup_rooms()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.room_members
  where last_seen < now() - interval '30 minutes';

  update public.rooms r
  set emptied_at = now()
  where r.emptied_at is null
    and not exists (
      select 1 from public.room_members rm where rm.room_id = r.id
    );

  update public.rooms r
  set emptied_at = null
  where r.emptied_at is not null
    and exists (
      select 1 from public.room_members rm where rm.room_id = r.id
    );

  delete from public.initiative i
  where exists (
    select 1 from public.rooms r
    where r.id = i.room_id
      and r.emptied_at < now() - interval '10 minutes'
      and not exists (
        select 1 from public.room_members rm where rm.room_id = r.id
      )
  );

  delete from public.tokens t
  where exists (
    select 1 from public.rooms r
    where r.id = t.room_id
      and r.emptied_at < now() - interval '10 minutes'
      and not exists (
        select 1 from public.room_members rm where rm.room_id = r.id
      )
  );

  delete from public.room_state s
  where exists (
    select 1 from public.rooms r
    where r.id = s.room_id
      and r.emptied_at < now() - interval '10 minutes'
      and not exists (
        select 1 from public.room_members rm where rm.room_id = r.id
      )
  );

  delete from public.rooms r
  where r.emptied_at < now() - interval '10 minutes'
    and not exists (
      select 1 from public.room_members rm where rm.room_id = r.id
    );
end;
$$;

-- ==============================
-- FIXED STORAGE POLICIES
-- ==============================

drop policy if exists "anon can upload board bg" on storage.objects;
drop policy if exists "anon can read board bg"   on storage.objects;
drop policy if exists "anon can delete board bg" on storage.objects;

create policy "anon can upload board bg"
on storage.objects for insert
to anon
with check (bucket_id = 'dnd-board-bg');

create policy "anon can read board bg"
on storage.objects for select
to anon
using (bucket_id = 'dnd-board-bg');

create policy "anon can delete board bg"
on storage.objects for delete
to anon
using (bucket_id = 'dnd-board-bg');

create table if not exists public.campaign_saves (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  name text not null,
  state jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists campaign_saves_room_id_created_at_idx
on public.campaign_saves (room_id, created_at desc);


-- ================== DND-GAME v4 realtime architecture ==================
-- Goal:
-- 1) Stop "last write wins" overwrites by removing high-frequency data from room_state JSON.
-- 2) Make movement / logs / dice events atomic and append-only.
--
-- Apply in Supabase SQL editor.

-- ---------- TOKENS (authoritative positions) ----------
create table if not exists public.room_tokens (
  room_id text not null,
  map_id  text not null,
  token_id text not null,

  owner_id text null,

  x integer null,
  y integer null,
  size integer not null default 1,
  color text null,

  updated_at timestamptz not null default now(),

  constraint room_tokens_pk primary key (room_id, map_id, token_id)
);

create index if not exists room_tokens_room_map_idx on public.room_tokens (room_id, map_id);
create index if not exists room_tokens_room_idx on public.room_tokens (room_id);

-- ---------- ACTION LOG (append-only) ----------
create table if not exists public.room_log (
  id bigserial primary key,
  room_id text not null,
  created_at timestamptz not null default now(),
  text text not null
);

create index if not exists room_log_room_created_idx on public.room_log (room_id, created_at);

-- ---------- DICE EVENTS (append-only) ----------
create table if not exists public.room_dice_events (
  id bigserial primary key,
  room_id text not null,
  created_at timestamptz not null default now(),

  from_id text null,
  from_name text null,

  kind_text text null,
  sides integer null,
  count integer null,
  bonus integer not null default 0,
  rolls integer[] not null default '{}',
  total integer null,
  crit text null
);

create index if not exists room_dice_room_created_idx on public.room_dice_events (room_id, created_at);


-- ================== Realtime replication ==================
-- Supabase Realtime does NOT automatically start streaming new tables.
-- Add them to the supabase_realtime publication so clients receive
-- postgres_changes events immediately.
do $$
begin
  begin
    alter publication supabase_realtime add table public.room_tokens;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.room_log;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.room_dice_events;
  exception when duplicate_object then null;
  end;
end $$;


-- ================== RPC: MOVE TOKEN (atomic + collision) ==================
-- Returns the updated token row.
create or replace function public.move_token(
  p_room_id text,
  p_map_id text,
  p_token_id text,
  p_actor_user_id text,
  p_x integer,
  p_y integer
)
returns public.room_tokens
language plpgsql
as $$
declare
  t public.room_tokens;
  s integer;
begin
  if p_room_id is null or p_room_id = '' then
    raise exception 'room_id required';
  end if;
  if p_map_id is null or p_map_id = '' then
    raise exception 'map_id required';
  end if;
  if p_token_id is null or p_token_id = '' then
    raise exception 'token_id required';
  end if;

  -- Upsert token if it doesn't exist
  insert into public.room_tokens(room_id, map_id, token_id, owner_id, x, y, updated_at)
  values (p_room_id, p_map_id, p_token_id, nullif(p_actor_user_id,''), p_x, p_y, now())
  on conflict (room_id, map_id, token_id)
  do update set
    x = excluded.x,
    y = excluded.y,
    updated_at = now()
  returning * into t;

  -- basic collision check: no overlapping bounding boxes
  s := greatest(1, coalesce(t.size,1));

  if exists (
    select 1
    from public.room_tokens ot
    where ot.room_id = p_room_id
      and ot.map_id = p_map_id
      and ot.token_id <> p_token_id
      and ot.x is not null and ot.y is not null
      and t.x is not null and t.y is not null
      and not (
        (t.x + s) <= ot.x
        or (ot.x + greatest(1,coalesce(ot.size,1))) <= t.x
        or (t.y + s) <= ot.y
        or (ot.y + greatest(1,coalesce(ot.size,1))) <= t.y
      )
  ) then
    raise exception 'Cell is occupied';
  end if;

  -- optional: append log
  insert into public.room_log(room_id, text)
  values (p_room_id, format('%s перемещён в (%s,%s)', p_token_id, p_x, p_y));

  return t;
end;
$$;


-- ================== RPC: ADD DICE EVENT (atomic + log) ==================
create or replace function public.add_dice_event(
  p_room_id text,
  p_from_id text,
  p_from_name text,
  p_kind_text text,
  p_sides integer,
  p_count integer,
  p_bonus integer,
  p_rolls integer[],
  p_total integer,
  p_crit text
)
returns void
language plpgsql
as $$
declare
  who text;
  kind text;
  bonus_txt text;
  total_txt text;
  crit_txt text;
  rolls_txt text;
  body text;
  line text;
begin
  insert into public.room_dice_events(
    room_id, from_id, from_name,
    kind_text, sides, count, bonus, rolls, total, crit
  )
  values (
    p_room_id,
    nullif(p_from_id,''),
    nullif(p_from_name,''),
    nullif(p_kind_text,''),
    p_sides,
    p_count,
    coalesce(p_bonus,0),
    coalesce(p_rolls,'{}'),
    p_total,
    nullif(p_crit,'')
  );

  -- log formatting (same spirit as client)
  who := coalesce(nullif(trim(p_from_name),''), 'Игрок');
  kind := coalesce(nullif(trim(p_kind_text),''), case when p_sides is not null then 'd' || p_sides::text else 'Бросок' end);
  bonus_txt := case when coalesce(p_bonus,0) = 0 then '' when p_bonus > 0 then '+'||p_bonus::text else p_bonus::text end;
  total_txt := case when p_total is null then '' else ' = '||p_total::text end;
  crit_txt := case when p_crit = 'crit-success' then ' (КРИТ)' when p_crit = 'crit-fail' then ' (ПРОВАЛ)' else '' end;
  rolls_txt := case when p_rolls is null or array_length(p_rolls,1) is null then '' else array_to_string(p_rolls, ',') end;
  body := case when rolls_txt <> '' then rolls_txt || bonus_txt || total_txt else coalesce(p_total::text,'') end;
  line := trim(who || ': ' || kind || ': ' || body || crit_txt);

  if line <> '' then
    insert into public.room_log(room_id, text) values (p_room_id, line);
  end if;
end;
$$;



-- ================== DND-GAME v5 patch ==================
-- Fix: movement log should show token name (not UUID)
-- Apply in Supabase SQL editor.

create or replace function public.move_token_v2(
  p_room_id text,
  p_map_id text,
  p_token_id text,
  p_token_name text,
  p_actor_user_id text,
  p_x integer,
  p_y integer
)
returns public.room_tokens
language plpgsql
as $$
declare
  t public.room_tokens;
  s integer;
  who text;
begin
  if p_room_id is null or p_room_id = '' then
    raise exception 'room_id required';
  end if;
  if p_map_id is null or p_map_id = '' then
    raise exception 'map_id required';
  end if;
  if p_token_id is null or p_token_id = '' then
    raise exception 'token_id required';
  end if;

  insert into public.room_tokens(room_id, map_id, token_id, owner_id, x, y, updated_at)
  values (p_room_id, p_map_id, p_token_id, nullif(p_actor_user_id,''), p_x, p_y, now())
  on conflict (room_id, map_id, token_id)
  do update set
    x = excluded.x,
    y = excluded.y,
    updated_at = now()
  returning * into t;

  s := greatest(1, coalesce(t.size,1));

  if exists (
    select 1
    from public.room_tokens ot
    where ot.room_id = p_room_id
      and ot.map_id = p_map_id
      and ot.token_id <> p_token_id
      and ot.x is not null and ot.y is not null
      and t.x is not null and t.y is not null
      and not (
        (t.x + s) <= ot.x
        or (ot.x + greatest(1,coalesce(ot.size,1))) <= t.x
        or (t.y + s) <= ot.y
        or (ot.y + greatest(1,coalesce(ot.size,1))) <= t.y
      )
  ) then
    raise exception 'Cell is occupied';
  end if;

  who := coalesce(nullif(trim(p_token_name),''), p_token_id);
  insert into public.room_log(room_id, text)
  values (p_room_id, format('%s перемещён в (%s,%s)', who, p_x, p_y));

  return t;
end;
$$;



-- v6: token visibility in room_tokens (reliable realtime for "eye" button)

-- 1) Add column (safe if already exists)
ALTER TABLE IF EXISTS public.room_tokens
  ADD COLUMN IF NOT EXISTS is_public boolean;

-- 2) Default: visible unless explicitly hidden
ALTER TABLE IF EXISTS public.room_tokens
  ALTER COLUMN is_public SET DEFAULT true;

-- 3) Backfill NULLs
UPDATE public.room_tokens
SET is_public = true
WHERE is_public IS NULL;

-- 4) Ensure realtime publication includes the table (idempotent in many setups)
-- If this errors in your Supabase (already added), you can ignore.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_tokens;
  EXCEPTION WHEN others THEN
    -- ignore
  END;
END$$;


-- 1) Разрешить публичное чтение файлов из bucket room-audio
create policy "Public read room-audio"
on storage.objects
for select
to public
using (bucket_id = 'room-audio');

-- 2) Разрешить загрузку (insert) в bucket room-audio
create policy "Public upload room-audio"
on storage.objects
for insert
to public
with check (bucket_id = 'room-audio');

-- 3) Разрешить удаление файлов из bucket room-audio
create policy "Public delete room-audio"
on storage.objects
for delete
to public
using (bucket_id = 'room-audio');

