-- 1) Создаем bucket, если его еще нет
insert into storage.buckets (id, name, public)
values ('room-board-bg', 'room-board-bg', true)
on conflict (id) do update
set public = true;

-- 2) На случай повторного запуска удалим старые политики с теми же именами
drop policy if exists "room-board-bg public read" on storage.objects;
drop policy if exists "room-board-bg anon insert" on storage.objects;
drop policy if exists "room-board-bg anon update" on storage.objects;
drop policy if exists "room-board-bg anon delete" on storage.objects;

-- 3) Разрешить читать файлы из bucket room-board-bg
create policy "room-board-bg public read"
on storage.objects
for select
to public
using (bucket_id = 'room-board-bg');

-- 4) Разрешить anon загружать файлы только в папку board-bg/
create policy "room-board-bg anon insert"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'room-board-bg'
  and (storage.foldername(name))[1] = 'board-bg'
);

-- 5) Разрешить anon обновлять файлы только в папке board-bg/
create policy "room-board-bg anon update"
on storage.objects
for update
to anon
using (
  bucket_id = 'room-board-bg'
  and (storage.foldername(name))[1] = 'board-bg'
)
with check (
  bucket_id = 'room-board-bg'
  and (storage.foldername(name))[1] = 'board-bg'
);

-- 6) Разрешить anon удалять файлы только в папке board-bg/
create policy "room-board-bg anon delete"
on storage.objects
for delete
to anon
using (
  bucket_id = 'room-board-bg'
  and (storage.foldername(name))[1] = 'board-bg'
);