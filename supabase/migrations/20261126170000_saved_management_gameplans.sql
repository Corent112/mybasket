create table public.management_saved_gameplans (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id text not null,
  title text not null,
  match_date date,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

create index management_saved_gameplans_owner_team_updated_idx
  on public.management_saved_gameplans (user_id, team_id, updated_at desc);

alter table public.management_saved_gameplans enable row level security;
revoke all on public.management_saved_gameplans from anon, authenticated;
grant select, insert, update on public.management_saved_gameplans to authenticated;

create policy "Owners read saved game plans" on public.management_saved_gameplans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Owners insert saved game plans" on public.management_saved_gameplans
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Owners update saved game plans" on public.management_saved_gameplans
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
