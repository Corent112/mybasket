-- MYBASKET — ZONE 4 : ANNONCES & PROFILS COACHS

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid references auth.users(id) on delete set null,
  author_type text,
  author_name text,
  author_email text,
  author_phone text,
  category text,
  title text,
  description text,
  city text,
  price_cents integer,
  image_url text,
  images jsonb not null default '[]'::jsonb,
  video_url text,
  payload_data jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  views_count integer not null default 0,
  contacts_count integer not null default 0,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.announcements
  add column if not exists images jsonb not null default '[]'::jsonb,
  add column if not exists video_url text,
  add column if not exists payload_data jsonb not null default '{}'::jsonb;

create table if not exists public.coach_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text,
  city text,
  bio text,
  speciality text,
  price_from integer,
  rating numeric not null default 0,
  status text not null default 'pending',
  profile_data jsonb not null default '{}'::jsonb,
  instagram_url text,
  video_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_profiles
  add column if not exists profile_data jsonb not null default '{}'::jsonb,
  add column if not exists instagram_url text,
  add column if not exists video_url text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists coach_profiles_user_id_unique on public.coach_profiles(user_id);
create index if not exists announcements_status_created_idx on public.announcements(status, created_at desc);

alter table public.announcements enable row level security;
alter table public.coach_profiles enable row level security;

drop policy if exists "Public read approved announcements" on public.announcements;
create policy "Public read approved announcements" on public.announcements
for select using (status in ('approved','published'));

drop policy if exists "Users read own announcements" on public.announcements;
create policy "Users read own announcements" on public.announcements
for select to authenticated using (author_user_id = auth.uid());

drop policy if exists "Users create own announcements" on public.announcements;
create policy "Users create own announcements" on public.announcements
for insert to authenticated with check (author_user_id = auth.uid() and status = 'pending');

drop policy if exists "Users update own pending announcements" on public.announcements;
create policy "Users update own pending announcements" on public.announcements
for update to authenticated using (author_user_id = auth.uid() and status in ('pending','draft','rejected'))
with check (author_user_id = auth.uid());

drop policy if exists "Public read active coach profiles" on public.coach_profiles;
create policy "Public read active coach profiles" on public.coach_profiles
for select using (status in ('active','approved','published'));

drop policy if exists "Users read own coach profile" on public.coach_profiles;
create policy "Users read own coach profile" on public.coach_profiles
for select to authenticated using (user_id = auth.uid());

drop policy if exists "Users create own coach profile" on public.coach_profiles;
create policy "Users create own coach profile" on public.coach_profiles
for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Users update own coach profile" on public.coach_profiles;
create policy "Users update own coach profile" on public.coach_profiles
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'annonces-media', 'annonces-media', true, 1073741824,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read annonces media" on storage.objects;
create policy "Public read annonces media" on storage.objects
for select using (bucket_id = 'annonces-media');

drop policy if exists "Users upload own annonces media" on storage.objects;
create policy "Users upload own annonces media" on storage.objects
for insert to authenticated with check (
  bucket_id = 'annonces-media' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update own annonces media" on storage.objects;
create policy "Users update own annonces media" on storage.objects
for update to authenticated using (
  bucket_id = 'annonces-media' and owner_id = auth.uid()::text
);

drop policy if exists "Users delete own annonces media" on storage.objects;
create policy "Users delete own annonces media" on storage.objects
for delete to authenticated using (
  bucket_id = 'annonces-media' and owner_id = auth.uid()::text
);
