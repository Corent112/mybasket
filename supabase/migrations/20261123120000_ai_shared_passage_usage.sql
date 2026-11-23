create table if not exists public.ai_shared_passage_usage (
  chunk_id uuid primary key references public.ai_knowledge_chunks(id) on delete cascade,
  response_count bigint not null default 1 check (response_count > 0)
);

alter table public.ai_shared_passage_usage enable row level security;
revoke all on public.ai_shared_passage_usage from public, anon, authenticated;
grant select, insert, update on public.ai_shared_passage_usage to service_role;

create or replace function public.ai_record_shared_passages(p_chunk_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  insert into public.ai_shared_passage_usage as usage (chunk_id)
  select c.id
  from public.ai_knowledge_chunks c
  join public.ai_knowledge_sources s on s.id = c.source_id
  where c.id = any(p_chunk_ids)
    and c.scope = 'global' and s.scope = 'global'
    and c.is_active and s.is_active
  order by c.id
  limit 40
  on conflict (chunk_id) do update set response_count = usage.response_count + 1;
$$;

revoke all on function public.ai_record_shared_passages(uuid[]) from public, anon, authenticated;
grant execute on function public.ai_record_shared_passages(uuid[]) to service_role;
