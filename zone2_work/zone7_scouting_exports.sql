-- ZONE 7 — Scouting et exports PDF

alter table if exists public.management_gameplans
  add column if not exists scouting_pdf_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'scouting-exports',
  'scouting-exports',
  true,
  52428800,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "scouting exports insert own" on storage.objects;
create policy "scouting exports insert own"
on storage.objects for insert to authenticated
with check (bucket_id = 'scouting-exports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "scouting exports update own" on storage.objects;
create policy "scouting exports update own"
on storage.objects for update to authenticated
using (bucket_id = 'scouting-exports' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'scouting-exports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "scouting exports delete own" on storage.objects;
create policy "scouting exports delete own"
on storage.objects for delete to authenticated
using (bucket_id = 'scouting-exports' and (storage.foldername(name))[1] = auth.uid()::text);
