-- MYBASKET — ZONE 8 : DASHBOARD CEO / ADMIN
create extension if not exists pgcrypto;

-- Profils : un profil est créé automatiquement pour chaque compte Auth.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  platform_role text not null default 'user',
  status text not null default 'active',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, platform_role, status, created_at, updated_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    'user',
    'active',
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_auth_user();

-- Rattrapage des anciens comptes Auth sans profil.
insert into public.profiles (id, email, display_name, platform_role, status, created_at, updated_at)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'display_name', u.raw_user_meta_data ->> 'full_name', split_part(coalesce(u.email, ''), '@', 1)),
  'user',
  'active',
  coalesce(u.created_at, now()),
  now()
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Slider d'accueil.
create table if not exists public.admin_slider (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text,
  button_label text,
  button_href text,
  placement text not null default 'home',
  status text not null default 'inactive',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_slider_public_idx
  on public.admin_slider(placement, status, sort_order);

alter table public.admin_slider enable row level security;

drop policy if exists "Public read active slider" on public.admin_slider;
create policy "Public read active slider"
on public.admin_slider for select
to anon, authenticated
using (status = 'active');

drop policy if exists "CEO manage slider" on public.admin_slider;
create policy "CEO manage slider"
on public.admin_slider for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.platform_role in ('ceo', 'superadmin', 'admin')
      and coalesce(p.status, 'active') <> 'suspended'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.platform_role in ('ceo', 'superadmin', 'admin')
      and coalesce(p.status, 'active') <> 'suspended'
  )
);

-- Images du slider.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'slider-images',
  'slider-images',
  true,
  15728640,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public read slider images" on storage.objects;
create policy "Public read slider images"
on storage.objects for select
to public
using (bucket_id = 'slider-images');

drop policy if exists "CEO upload slider images" on storage.objects;
create policy "CEO upload slider images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'slider-images'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.platform_role in ('ceo', 'superadmin', 'admin')
  )
);

drop policy if exists "CEO update slider images" on storage.objects;
create policy "CEO update slider images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'slider-images'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.platform_role in ('ceo', 'superadmin', 'admin')
  )
);

drop policy if exists "CEO delete slider images" on storage.objects;
create policy "CEO delete slider images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'slider-images'
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.platform_role in ('ceo', 'superadmin', 'admin')
  )
);

-- Tables de demandes centralisées.
create table if not exists public.formation_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  club text,
  request_type text,
  message text,
  status text not null default 'new',
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accompagnement_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  first_name text,
  last_name text,
  email text,
  phone text,
  club text,
  service_type text,
  message text,
  status text not null default 'new',
  internal_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Les visiteurs peuvent déposer une demande ; seul le CEO peut toutes les gérer.
alter table public.formation_requests enable row level security;
alter table public.accompagnement_requests enable row level security;

drop policy if exists "Create formation request" on public.formation_requests;
create policy "Create formation request" on public.formation_requests
for insert to anon, authenticated with check (true);

drop policy if exists "CEO manage formation requests" on public.formation_requests;
create policy "CEO manage formation requests" on public.formation_requests
for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin','admin')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin','admin')));

drop policy if exists "Create accompagnement request" on public.accompagnement_requests;
create policy "Create accompagnement request" on public.accompagnement_requests
for insert to anon, authenticated with check (true);

drop policy if exists "CEO manage accompagnement requests" on public.accompagnement_requests;
create policy "CEO manage accompagnement requests" on public.accompagnement_requests
for all to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin','admin')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin','admin')));
