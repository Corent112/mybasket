-- Vidéo facultative de démonstration / déplacements pour les grilles de tir
alter table if exists public.shooting_grids add column if not exists movement_video_url text;
alter table if exists public.institutional_shooting_grids add column if not exists movement_video_url text;
alter table if exists public.personal_shooting_grids add column if not exists movement_video_url text;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('shooting-grid-videos','shooting-grid-videos',true,262144000,array['video/mp4','video/quicktime','video/webm','video/x-m4v'])
on conflict (id) do update set public=true,file_size_limit=262144000,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "shooting_grid_videos_insert_own" on storage.objects;
create policy "shooting_grid_videos_insert_own" on storage.objects for insert to authenticated
with check (bucket_id='shooting-grid-videos' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "shooting_grid_videos_update_own" on storage.objects;
create policy "shooting_grid_videos_update_own" on storage.objects for update to authenticated
using (bucket_id='shooting-grid-videos' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='shooting-grid-videos' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "shooting_grid_videos_delete_own" on storage.objects;
create policy "shooting_grid_videos_delete_own" on storage.objects for delete to authenticated
using (bucket_id='shooting-grid-videos' and (storage.foldername(name))[1]=auth.uid()::text);
