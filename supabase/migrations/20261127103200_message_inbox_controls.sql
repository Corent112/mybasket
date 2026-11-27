alter table public.platform_conversations add column if not exists recipient_email text;
alter table public.platform_conversations alter column recipient_user_id drop not null;
alter table public.platform_conversations add constraint platform_conversation_recipient_required
  check (recipient_user_id is not null or recipient_email is not null) not valid;

create table public.message_hidden_threads (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.platform_conversations(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);
create table public.message_user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index message_user_blocks_blocked_idx on public.message_user_blocks(blocked_id);
alter table public.message_hidden_threads enable row level security;
alter table public.message_user_blocks enable row level security;
revoke all on public.message_hidden_threads, public.message_user_blocks from public, anon, authenticated;
grant select, insert, update, delete on public.message_hidden_threads, public.message_user_blocks to service_role;

create or replace function public.find_message_recipient(p_email text)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select u.id from auth.users u
  where lower(u.email) = lower(p_email) and u.email_confirmed_at is not null
  order by u.created_at, u.id
  limit 1
$$;
revoke all on function public.find_message_recipient(text) from public, anon, authenticated;
grant execute on function public.find_message_recipient(text) to service_role;
