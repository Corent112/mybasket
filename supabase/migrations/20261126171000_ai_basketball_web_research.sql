create table public.ai_basketball_web_research (
  user_id uuid not null references auth.users(id) on delete cascade,
  query_key text not null,
  question text not null,
  answer text not null,
  citations jsonb not null,
  researched_at timestamptz not null default now(),
  primary key (user_id, query_key)
);

alter table public.ai_basketball_web_research enable row level security;
revoke all on public.ai_basketball_web_research from anon, authenticated;
grant select, insert, update on public.ai_basketball_web_research to authenticated;

create policy "Users read their basketball research" on public.ai_basketball_web_research
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Users save their basketball research" on public.ai_basketball_web_research
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Users refresh their basketball research" on public.ai_basketball_web_research
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
