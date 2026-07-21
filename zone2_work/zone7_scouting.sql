-- MyBasket — Zone 7 : Scouting / Game Plan
-- Migration idempotente à exécuter dans Supabase SQL Editor.

create table if not exists public.management_gameplans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id text not null,
  scouting jsonb not null default '{}'::jsonb,
  library_systems jsonb not null default '[]'::jsonb,
  drawings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.management_gameplans
  add column if not exists scouting jsonb not null default '{}'::jsonb,
  add column if not exists library_systems jsonb not null default '[]'::jsonb,
  add column if not exists drawings jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Supprime uniquement les doublons stricts user/équipe afin que l'upsert fonctionne.
with ranked as (
  select id,
         row_number() over (
           partition by user_id, team_id
           order by updated_at desc nulls last, created_at desc nulls last, id desc
         ) as rn
  from public.management_gameplans
)
delete from public.management_gameplans g
using ranked r
where g.id = r.id and r.rn > 1;

create unique index if not exists management_gameplans_user_team_uidx
  on public.management_gameplans(user_id, team_id);

alter table public.management_gameplans enable row level security;

drop policy if exists "Users read own management gameplans" on public.management_gameplans;
create policy "Users read own management gameplans"
  on public.management_gameplans for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own management gameplans" on public.management_gameplans;
create policy "Users insert own management gameplans"
  on public.management_gameplans for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own management gameplans" on public.management_gameplans;
create policy "Users update own management gameplans"
  on public.management_gameplans for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users delete own management gameplans" on public.management_gameplans;
create policy "Users delete own management gameplans"
  on public.management_gameplans for delete
  using (auth.uid() = user_id);
