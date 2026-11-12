create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  organization text,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now(),
  handled_at timestamptz,
  notified_at timestamptz
);
alter table public.contact_requests enable row level security;
revoke all on public.contact_requests from public, anon, authenticated;
grant select, insert, update on public.contact_requests to service_role;

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
alter table public.admin_slider enable row level security;
grant select on public.admin_slider to anon, authenticated;
grant select, insert, update, delete on public.admin_slider to service_role;
drop policy if exists home_slider_published on public.admin_slider;
create policy home_slider_published on public.admin_slider for select to anon, authenticated
  using (status = 'active' and placement in ('home', 'global'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('slider-images', 'slider-images', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
