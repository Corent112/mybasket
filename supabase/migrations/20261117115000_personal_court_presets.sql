create table if not exists public.plaquette_court_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  style jsonb not null default '{}'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  player_colors jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.plaquette_court_presets enable row level security;
drop policy if exists "Court presets owner access" on public.plaquette_court_presets;
create policy "Court presets owner access" on public.plaquette_court_presets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists plaquette_court_presets_owner_created_idx
  on public.plaquette_court_presets (user_id, created_at desc);
grant select, insert, update, delete on public.plaquette_court_presets to authenticated;
