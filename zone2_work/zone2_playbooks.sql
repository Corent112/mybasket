-- MYBASKET — ZONE 2 : PLAYBOOKS
-- Exécutable plusieurs fois dans Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.playbooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text default '',
  category text,
  level text,
  season text,
  team_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.playbooks add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.playbooks add column if not exists title text;
alter table public.playbooks add column if not exists description text default '';
alter table public.playbooks add column if not exists category text;
alter table public.playbooks add column if not exists level text;
alter table public.playbooks add column if not exists season text;
alter table public.playbooks add column if not exists team_id text;
alter table public.playbooks add column if not exists created_at timestamptz default now();
alter table public.playbooks add column if not exists updated_at timestamptz default now();

create table if not exists public.playbook_systems (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  playbook_id uuid not null references public.playbooks(id) on delete cascade,
  title text not null,
  category text not null default 'Système demi-terrain',
  description text default '',
  system_id text,
  schema_images jsonb not null default '[]'::jsonb,
  schema_data_list jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.playbook_systems add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.playbook_systems add column if not exists playbook_id uuid references public.playbooks(id) on delete cascade;
alter table public.playbook_systems add column if not exists title text;
alter table public.playbook_systems add column if not exists category text default 'Système demi-terrain';
alter table public.playbook_systems add column if not exists description text default '';
alter table public.playbook_systems add column if not exists system_id text;
alter table public.playbook_systems add column if not exists schema_images jsonb default '[]'::jsonb;
alter table public.playbook_systems add column if not exists schema_data_list jsonb default '[]'::jsonb;
alter table public.playbook_systems add column if not exists tags jsonb default '[]'::jsonb;
alter table public.playbook_systems add column if not exists created_at timestamptz default now();
alter table public.playbook_systems add column if not exists updated_at timestamptz default now();

create index if not exists playbooks_owner_updated_idx
  on public.playbooks(owner_id, updated_at desc);
create index if not exists playbook_systems_playbook_idx
  on public.playbook_systems(playbook_id, created_at);

alter table public.playbooks enable row level security;
alter table public.playbook_systems enable row level security;

drop policy if exists "playbooks_owner_all" on public.playbooks;
create policy "playbooks_owner_all" on public.playbooks
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

drop policy if exists "playbook_systems_owner_all" on public.playbook_systems;
create policy "playbook_systems_owner_all" on public.playbook_systems
  for all using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Normalisation des anciennes catégories de playbooks.
update public.playbooks
set category = case
  when upper(coalesce(category, '')) in ('U13','U15','U18','U21') then upper(category)
  when lower(coalesce(category, '')) in ('senior','seniors') then 'Seniors'
  else category
end;
