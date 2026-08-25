-- MyBasket — Club -> équipe personnelle du coach
-- 2026-08-25
--
-- Objectif :
-- 1. Une équipe créée dans l'Espace Club conserve le MEME UUID dans public.teams.
-- 2. Quand un coach est affecté dans Club > Coachs / Club > Equipes,
--    son compte MyBasket est ajouté dans public.team_members.
-- 3. getTeams() récupère déjà public.team_members : l'équipe apparaît donc
--    automatiquement dans "Mes équipes" du coach.
-- 4. Les permissions restent celles du système de collaboration existant.
-- 5. Les autres membres du club n'obtiennent aucun accès automatiquement.

begin;

create or replace function public.link_club_coach_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  if new.user_id is null and nullif(trim(coalesce(new.email, '')), '') is not null then
    select u.id
      into v_user_id
    from auth.users u
    where lower(coalesce(u.email, '')) = lower(trim(new.email))
    limit 1;

    if v_user_id is not null then
      new.user_id := v_user_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_link_club_coach_auth_user on public.club_coaches;

create trigger trg_link_club_coach_auth_user
before insert or update of email, user_id
on public.club_coaches
for each row
execute function public.link_club_coach_auth_user();

update public.club_coaches cc
set user_id = au.id
from auth.users au
where cc.user_id is null
  and nullif(trim(coalesce(cc.email, '')), '') is not null
  and lower(coalesce(au.email, '')) = lower(trim(cc.email));

create or replace function public.club_team_staff_permissions(
  p_role text,
  p_slot text default 'coach'
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_role text := lower(coalesce(p_role, ''));
  v_slot text := lower(coalesce(p_slot, 'coach'));
  v_permissions jsonb;
begin
  v_permissions := jsonb_build_object(
    'view_team', true,
    'players', false,
    'sessions', false,
    'livestats', false,
    'media', false,
    'rpe', false,
    'rpe_individual', false,
    'rpe_group', false,
    'rpe_manage_target', false,
    'rpe_manage_questionnaires', false,
    'rpe_receive_digest', false,
    'rpe_receive_alerts', false,
    'rpe_channel_in_app', true,
    'rpe_channel_email', true,
    'rpe_channel_external', false,
    'club_managed', true
  );

  if v_slot = 'coach'
     or v_role like '%principal%'
     or v_role like '%responsable%'
     or v_role = 'coach'
     or v_role like '%entraîneur%'
     or v_role like '%entraineur%' then
    v_permissions := v_permissions || jsonb_build_object(
      'players', true,
      'sessions', true,
      'livestats', true,
      'media', true,
      'rpe', true,
      'rpe_individual', true,
      'rpe_group', true,
      'rpe_manage_target', true,
      'rpe_manage_questionnaires', true,
      'rpe_receive_digest', true,
      'rpe_receive_alerts', true
    );
  end if;

  if v_role like '%préparateur physique%'
     or v_role like '%preparateur physique%' then
    v_permissions := v_permissions || jsonb_build_object(
      'sessions', true,
      'rpe', true,
      'rpe_individual', true,
      'rpe_group', true,
      'rpe_manage_target', true,
      'rpe_manage_questionnaires', true,
      'rpe_receive_digest', true,
      'rpe_receive_alerts', true
    );
  end if;

  if v_role like '%vidéo%'
     or v_role like '%video%'
     or v_role like '%analyste%' then
    v_permissions := v_permissions || jsonb_build_object(
      'livestats', true,
      'media', true
    );
  end if;

  if v_slot = 'assistant' or v_role like '%assistant%' then
    v_permissions := v_permissions || jsonb_build_object(
      'players', true,
      'sessions', true,
      'livestats', true,
      'media', true
    );
  end if;

  return v_permissions;
end;
$$;

create or replace function public.sync_club_team_personal_access()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_owner_id uuid;
  v_club_name text;
  v_coach public.club_coaches%rowtype;
  v_assistant public.club_coaches%rowtype;
  v_coach_name text := '';
begin
  select cm.user_id
    into v_owner_id
  from public.club_members cm
  where cm.club_id = new.club_id
    and cm.status = 'active'
    and cm.role in ('owner', 'admin')
  order by case when cm.role = 'owner' then 0 else 1 end, cm.created_at
  limit 1;

  if v_owner_id is null then
    return new;
  end if;

  select c.name
    into v_club_name
  from public.clubs c
  where c.id = new.club_id
  limit 1;

  if new.coach_id is not null then
    select *
      into v_coach
    from public.club_coaches cc
    where cc.id = new.coach_id
      and cc.club_id = new.club_id
    limit 1;

    v_coach_name := coalesce(
      nullif(trim(coalesce(v_coach.name, '')), ''),
      nullif(trim(concat_ws(' ', v_coach.first_name, v_coach.last_name)), ''),
      ''
    );
  end if;

  if new.assistant_id is not null then
    select *
      into v_assistant
    from public.club_coaches cc
    where cc.id = new.assistant_id
      and cc.club_id = new.club_id
    limit 1;
  end if;

  insert into public.teams (
    id,
    user_id,
    team_type,
    name,
    club_name,
    category,
    coach_name,
    metadata,
    updated_at
  )
  values (
    new.id,
    v_owner_id,
    'coached',
    new.name,
    coalesce(v_club_name, new.name),
    coalesce(new.category, ''),
    v_coach_name,
    jsonb_build_object(
      'isClubTeam', true,
      'clubManaged', true,
      'clubId', new.club_id::text,
      'clubTeamId', new.id::text,
      'clubName', coalesce(v_club_name, ''),
      'category', coalesce(new.category, ''),
      'cat', coalesce(new.category, ''),
      'season', coalesce(new.season, '')
    ),
    now()
  )
  on conflict (id) do update
  set
    name = excluded.name,
    club_name = excluded.club_name,
    category = excluded.category,
    coach_name = excluded.coach_name,
    metadata = coalesce(public.teams.metadata, '{}'::jsonb) || excluded.metadata,
    updated_at = now();

  delete from public.team_members tm
  where tm.team_id = new.id
    and coalesce(tm.permissions ->> 'club_managed', 'false') = 'true'
    and tm.user_id not in (
      coalesce(v_coach.user_id, '00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(v_assistant.user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );

  if v_coach.user_id is not null then
    insert into public.team_members (
      team_id,
      user_id,
      role,
      permissions,
      status
    )
    values (
      new.id,
      v_coach.user_id,
      coalesce(nullif(trim(v_coach.role), ''), 'Entraîneur principal'),
      public.club_team_staff_permissions(v_coach.role, 'coach'),
      'active'
    )
    on conflict (team_id, user_id) do update
    set
      role = excluded.role,
      permissions = excluded.permissions,
      status = 'active';
  end if;

  if v_assistant.user_id is not null then
    insert into public.team_members (
      team_id,
      user_id,
      role,
      permissions,
      status
    )
    values (
      new.id,
      v_assistant.user_id,
      coalesce(nullif(trim(v_assistant.role), ''), 'Assistant'),
      public.club_team_staff_permissions(v_assistant.role, 'assistant'),
      'active'
    )
    on conflict (team_id, user_id) do update
    set
      role = excluded.role,
      permissions = excluded.permissions,
      status = 'active';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_club_team_personal_access on public.club_teams;

create trigger trg_sync_club_team_personal_access
after insert or update of
  name,
  category,
  season,
  coach_id,
  assistant_id,
  status
on public.club_teams
for each row
execute function public.sync_club_team_personal_access();

create or replace function public.cleanup_club_team_personal_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.team_members
  where team_id = old.id
    and coalesce(permissions ->> 'club_managed', 'false') = 'true';

  delete from public.teams
  where id = old.id
    and coalesce(metadata ->> 'clubManaged', 'false') = 'true';

  return old;
end;
$$;

drop trigger if exists trg_cleanup_club_team_personal_access on public.club_teams;

create trigger trg_cleanup_club_team_personal_access
after delete
on public.club_teams
for each row
execute function public.cleanup_club_team_personal_access();

update public.club_teams
set name = name;

commit;
