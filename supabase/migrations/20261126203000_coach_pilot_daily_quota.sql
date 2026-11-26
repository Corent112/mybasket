create table public.coach_pilot_daily_totals (
  day date primary key,
  used integer not null default 0 check (used >= 0)
);

create table public.coach_pilot_daily_users (
  day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  used integer not null default 0 check (used >= 0),
  primary key (day, user_id)
);

alter table public.coach_pilot_daily_totals enable row level security;
alter table public.coach_pilot_daily_users enable row level security;
revoke all on public.coach_pilot_daily_totals, public.coach_pilot_daily_users from public, anon, authenticated;
grant select, insert, update on public.coach_pilot_daily_totals, public.coach_pilot_daily_users to service_role;

create function public.reserve_coach_pilot_turn(p_user uuid, p_user_limit integer, p_site_limit integer)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  quota_day date := (statement_timestamp() at time zone 'Europe/Paris')::date;
  total_used integer;
  user_used integer;
begin
  if p_user is null or p_user_limit is null or p_site_limit is null or p_user_limit < 1 or p_site_limit < 1 then
    raise exception 'Invalid coach quota';
  end if;

  insert into public.coach_pilot_daily_totals(day) values (quota_day) on conflict do nothing;
  select used into total_used from public.coach_pilot_daily_totals where day = quota_day for update;
  if total_used >= p_site_limit then return 'site_limit'; end if;

  select used into user_used from public.coach_pilot_daily_users where day = quota_day and user_id = p_user;
  if coalesce(user_used, 0) >= p_user_limit then return 'user_limit'; end if;

  insert into public.coach_pilot_daily_users(day, user_id, used) values (quota_day, p_user, 1)
    on conflict (day, user_id) do update set used = public.coach_pilot_daily_users.used + 1;
  update public.coach_pilot_daily_totals set used = used + 1 where day = quota_day;
  return 'allowed';
end;
$$;

revoke all on function public.reserve_coach_pilot_turn(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_coach_pilot_turn(uuid, integer, integer) to service_role;
