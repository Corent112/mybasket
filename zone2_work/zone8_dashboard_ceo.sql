-- MYBASKET — ZONE 8 : DASHBOARD CEO / ADMIN
create extension if not exists pgcrypto;

create table if not exists public.admin_slider (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text,
  button_label text,
  button_href text,
  placement text not null default 'home',
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.formation_requests (
  id uuid primary key default gen_random_uuid(),
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

alter table public.admin_slider enable row level security;
alter table public.formation_requests enable row level security;
alter table public.accompagnement_requests enable row level security;

drop policy if exists "Public read active slides" on public.admin_slider;
create policy "Public read active slides" on public.admin_slider for select
to anon, authenticated using (status = 'active');

drop policy if exists "CEO manage slides" on public.admin_slider;
create policy "CEO manage slides" on public.admin_slider for all
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin')));

drop policy if exists "Public submit formation" on public.formation_requests;
create policy "Public submit formation" on public.formation_requests for insert
to anon, authenticated with check (true);

drop policy if exists "CEO manage formation" on public.formation_requests;
create policy "CEO manage formation" on public.formation_requests for all
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin')));

drop policy if exists "Public submit accompagnement" on public.accompagnement_requests;
create policy "Public submit accompagnement" on public.accompagnement_requests for insert
to anon, authenticated with check (true);

drop policy if exists "CEO manage accompagnement" on public.accompagnement_requests;
create policy "CEO manage accompagnement" on public.accompagnement_requests for all
to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin')));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('slider-images','slider-images',true,15728640,array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Public read slider images" on storage.objects;
create policy "Public read slider images" on storage.objects for select to public
using (bucket_id='slider-images');

drop policy if exists "CEO manage slider images" on storage.objects;
create policy "CEO manage slider images" on storage.objects for all to authenticated
using (bucket_id='slider-images' and exists (select 1 from public.profiles p where p.id=auth.uid() and p.platform_role in ('ceo','superadmin')))
with check (bucket_id='slider-images' and exists (select 1 from public.profiles p where p.id=auth.uid() and p.platform_role in ('ceo','superadmin')));

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles (id,email,display_name,platform_role,status,created_at)
  values (new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name',split_part(coalesce(new.email,''),'@',1)),'user','active',now())
  on conflict (id) do update set email=excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

insert into public.profiles (id,email,display_name,platform_role,status,created_at)
select u.id,u.email,coalesce(u.raw_user_meta_data->>'display_name',u.raw_user_meta_data->>'full_name',split_part(coalesce(u.email,''),'@',1)),'user','active',coalesce(u.created_at,now())
from auth.users u left join public.profiles p on p.id=u.id where p.id is null
on conflict (id) do nothing;

alter table public.formation_requests enable row level security;
alter table public.accompagnement_requests enable row level security;

drop policy if exists "formation public insert" on public.formation_requests;
create policy "formation public insert" on public.formation_requests
for insert to anon, authenticated with check (true);

drop policy if exists "formation ceo manage" on public.formation_requests;
create policy "formation ceo manage" on public.formation_requests
for all to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin'))
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin'))
);

drop policy if exists "accompagnement public insert" on public.accompagnement_requests;
create policy "accompagnement public insert" on public.accompagnement_requests
for insert to anon, authenticated with check (true);

drop policy if exists "accompagnement ceo manage" on public.accompagnement_requests;
create policy "accompagnement ceo manage" on public.accompagnement_requests
for all to authenticated using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin'))
) with check (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.platform_role in ('ceo','superadmin'))
);
