-- MyBasket — Zone 5 : Espace club
-- À exécuter dans Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.club_teams (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  name text not null,
  team_number integer not null default 1,
  category text not null,
  gender text not null default 'Mixte',
  level text,
  season text,
  status text not null default 'active',
  coach_id uuid,
  assistant_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.club_teams add column if not exists team_number integer not null default 1;
alter table public.club_teams add column if not exists coach_id uuid;
alter table public.club_teams add column if not exists assistant_id uuid;
alter table public.club_teams add column if not exists created_by uuid;
alter table public.club_teams add column if not exists notes text;
alter table public.club_teams add column if not exists status text not null default 'active';
alter table public.club_teams add column if not exists season text;
alter table public.club_teams add column if not exists level text;
alter table public.club_teams add column if not exists updated_at timestamptz not null default now();

update public.club_teams
set team_number = coalesce(
  nullif(substring(name from 'Équipe[[:space:]]+([0-9]+)')::integer, 0),
  team_number,
  1
)
where team_number is null or team_number < 1;

update public.club_teams
set name = trim(category) || ' Équipe ' || team_number::text
where category is not null and trim(category) <> '';

create unique index if not exists club_teams_club_category_number_uidx
  on public.club_teams(club_id, category, team_number)
  where status <> 'archived';
create index if not exists club_teams_club_idx on public.club_teams(club_id);
create index if not exists club_teams_coach_idx on public.club_teams(coach_id);

create table if not exists public.club_coaches (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  user_id uuid,
  name text,
  first_name text,
  last_name text,
  email text,
  phone text,
  role text not null default 'coach',
  status text not null default 'active',
  team_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists club_coaches_club_idx on public.club_coaches(club_id);

create table if not exists public.club_training_slots (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null,
  gymnase_id uuid not null,
  day integer not null default 0,
  day_of_week text,
  category text not null,
  gender text not null default 'Mixte',
  team text,
  start_min integer not null,
  duration_min integer not null default 90,
  start_time time,
  end_time time,
  color text,
  slot_type text,
  coach_name text,
  coach_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.club_training_slots add column if not exists coach_name text;
alter table public.club_training_slots add column if not exists coach_id uuid;
alter table public.club_training_slots add column if not exists notes text;
alter table public.club_training_slots add column if not exists updated_at timestamptz not null default now();
create index if not exists club_training_slots_club_idx on public.club_training_slots(club_id);
create index if not exists club_training_slots_coach_idx on public.club_training_slots(coach_id);

-- RLS : membres actifs du club en lecture, rôles de gestion en écriture.
alter table public.club_teams enable row level security;
alter table public.club_coaches enable row level security;
alter table public.club_training_slots enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='club_teams' and policyname='club teams members read') then
    create policy "club teams members read" on public.club_teams for select using (
      exists (select 1 from public.club_members m where m.club_id=club_teams.club_id and m.user_id=auth.uid() and m.status='active')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='club_teams' and policyname='club teams managers write') then
    create policy "club teams managers write" on public.club_teams for all using (
      exists (select 1 from public.club_members m where m.club_id=club_teams.club_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin','direction_technique','secretariat'))
    ) with check (
      exists (select 1 from public.club_members m where m.club_id=club_teams.club_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin','direction_technique','secretariat'))
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='club_coaches' and policyname='club coaches members read') then
    create policy "club coaches members read" on public.club_coaches for select using (
      exists (select 1 from public.club_members m where m.club_id=club_coaches.club_id and m.user_id=auth.uid() and m.status='active')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='club_training_slots' and policyname='club slots members read') then
    create policy "club slots members read" on public.club_training_slots for select using (
      exists (select 1 from public.club_members m where m.club_id=club_training_slots.club_id and m.user_id=auth.uid() and m.status='active')
    );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='club_training_slots' and policyname='club slots staff write') then
    create policy "club slots staff write" on public.club_training_slots for all using (
      exists (select 1 from public.club_members m where m.club_id=club_training_slots.club_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin','direction_technique','secretariat','coach'))
    ) with check (
      exists (select 1 from public.club_members m where m.club_id=club_training_slots.club_id and m.user_id=auth.uid() and m.status='active' and m.role in ('owner','admin','direction_technique','secretariat','coach'))
    );
  end if;
end $$;

notify pgrst, 'reload schema';
