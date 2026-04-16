-- room_marks_realtime.sql
-- 1) Таблица room_marks (если ещё не создана)
create table if not exists public.room_marks (
  room_id text not null,
  map_id text not null,
  mark_id text not null,
  owner_id text not null,
  mark jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (room_id, map_id, mark_id)
);

create index if not exists room_marks_room_idx on public.room_marks (room_id);
create index if not exists room_marks_room_map_idx on public.room_marks (room_id, map_id);
create index if not exists room_marks_owner_idx on public.room_marks (owner_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_room_marks_updated_at on public.room_marks;
create trigger trg_room_marks_updated_at
before update on public.room_marks
for each row execute function public.set_updated_at();

alter table public.room_marks enable row level security;

drop policy if exists "room_marks_select_all" on public.room_marks;
create policy "room_marks_select_all" on public.room_marks
for select using (true);

drop policy if exists "room_marks_write_all" on public.room_marks;
create policy "room_marks_write_all" on public.room_marks
for insert with check (true);

drop policy if exists "room_marks_update_all" on public.room_marks;
create policy "room_marks_update_all" on public.room_marks
for update using (true) with check (true);

drop policy if exists "room_marks_delete_all" on public.room_marks;
create policy "room_marks_delete_all" on public.room_marks
for delete using (true);

-- 2) ВКЛЮЧАЕМ Realtime для таблицы room_marks.
-- В Supabase это эквивалентно переключателю Database -> Replication -> supabase_realtime.
-- Если таблица уже добавлена в publication, команда может ругаться — тогда просто пропусти.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_marks;
  EXCEPTION WHEN duplicate_object THEN
    -- already in publication
    NULL;
  END;
END $$;
