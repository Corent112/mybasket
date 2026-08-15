-- =====================================================================
-- MyBasket — Isolation par utilisateur (RLS)
-- Migration : 20260815090000_isolation_rls.sql
--
-- ⚠️ À LIRE AVANT D'EXÉCUTER
--
-- Le filtrage applicatif corrigé dans cette intervention empêche l'interface
-- d'afficher les données d'autrui. Il ne suffit PAS : un utilisateur peut
-- toujours interroger Supabase directement depuis son navigateur avec la clé
-- anon. Seule la RLS ferme réellement la porte.
--
-- Ce fichier est fourni en DEUX parties :
--   PARTIE A — DIAGNOSTIC (lecture seule, à exécuter en premier)
--   PARTIE B — ACTIVATION (à exécuter seulement après avoir lu le diagnostic)
--
-- N'exécute PAS la partie B en aveugle : activer la RLS sur une table qui n'en
-- avait pas coupe immédiatement tous les accès non couverts par une policy.
-- Teste d'abord sur une branche de base Supabase si tu en as une.
-- =====================================================================


-- =====================================================================
-- PARTIE A — DIAGNOSTIC (aucune modification)
-- =====================================================================

-- A1. Quelles tables ont la RLS activée ?
select
  c.relname                as table_name,
  c.relrowsecurity         as rls_active,
  c.relforcerowsecurity    as rls_forcee
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'teams','players','practice_sessions','practice_session_exercises',
    'practice_session_players','practice_session_attendance',
    'calendar_events','user_documents','player_documents',
    'playbooks','playbook_systems','plays','game_plans',
    'match_stats','match_actions','match_player_stats','favorites',
    'team_drive_connections','match_media_sources'
  )
order by 1;

-- A2. Quelles policies existent déjà ? (repérer les `using (true)`)
select
  schemaname, tablename, policyname, cmd, roles,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
    'teams','players','practice_sessions','calendar_events',
    'user_documents','playbooks','match_stats','match_actions','favorites'
  )
order by tablename, policyname;

-- A3. Les colonnes propriétaires existent-elles réellement ?
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and column_name in ('user_id','owner_id','created_by','visibility')
  and table_name in (
    'teams','players','practice_sessions','calendar_events',
    'user_documents','playbooks','match_stats','favorites'
  )
order by table_name, column_name;

-- A4. Y a-t-il déjà des lignes orphelines (sans propriétaire) ?
-- Elles deviendraient INVISIBLES après activation de la RLS.
-- select 'teams' as t, count(*) from public.teams where user_id is null
-- union all select 'players', count(*) from public.players where user_id is null
-- union all select 'practice_sessions', count(*) from public.practice_sessions where user_id is null
-- union all select 'calendar_events', count(*) from public.calendar_events where user_id is null and owner_id is null
-- union all select 'user_documents', count(*) from public.user_documents where user_id is null;


-- =====================================================================
-- PARTIE B — ACTIVATION
-- N'exécuter qu'après A1→A4, et de préférence table par table.
-- =====================================================================

-- ---------------------------------------------------------------------
-- B0. Helper : admin plateforme.
-- Permet aux pages /admin de conserver leur vision plateforme SANS ouvrir
-- les outils personnels : côté application, les requêtes personnelles sont
-- désormais filtrées explicitement par user_id, donc la policy admin ne
-- « contamine » plus l'espace perso.
-- ---------------------------------------------------------------------
create or replace function public.is_platform_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and coalesce(p.status, 'active') <> 'suspended'
      and p.platform_role in ('ceo', 'superadmin')
  );
$$;

comment on function public.is_platform_admin(uuid) is
  'MyBasket — vrai si le profil est ceo/superadmin actif. Utilisé par les policies RLS pour préserver le dashboard /admin.';

grant execute on function public.is_platform_admin(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- B1. teams
-- ---------------------------------------------------------------------
alter table public.teams enable row level security;

drop policy if exists teams_select_own on public.teams;
create policy teams_select_own on public.teams
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists teams_insert_own on public.teams;
create policy teams_insert_own on public.teams
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists teams_update_own on public.teams;
create policy teams_update_own on public.teams
  for update to authenticated
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists teams_delete_own on public.teams;
create policy teams_delete_own on public.teams
  for delete to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());


-- ---------------------------------------------------------------------
-- B2. players
-- ---------------------------------------------------------------------
alter table public.players enable row level security;

drop policy if exists players_all_own on public.players;
create policy players_all_own on public.players
  for all to authenticated
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());


-- ---------------------------------------------------------------------
-- B3. practice_sessions — propriétaire OU séance publique (modèles MyBasket)
-- ---------------------------------------------------------------------
alter table public.practice_sessions enable row level security;

drop policy if exists practice_sessions_select on public.practice_sessions;
create policy practice_sessions_select on public.practice_sessions
  for select to authenticated
  using (
    user_id = auth.uid()
    or coalesce(visibility, 'private') = 'public'
    or public.is_platform_admin()
  );

drop policy if exists practice_sessions_write on public.practice_sessions;
create policy practice_sessions_write on public.practice_sessions
  for all to authenticated
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());


-- ---------------------------------------------------------------------
-- B4. Tables filles des séances — portée héritée de la séance parente
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'practice_session_exercises',
    'practice_session_players',
    'practice_session_attendance'
  ] loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t || '_via_session', t);
      execute format($f$
        create policy %I on public.%I
          for all to authenticated
          using (
            exists (
              select 1 from public.practice_sessions s
              where s.id = %I.session_id
                and (s.user_id = auth.uid()
                     or coalesce(s.visibility,'private') = 'public'
                     or public.is_platform_admin())
            )
          )
          with check (
            exists (
              select 1 from public.practice_sessions s
              where s.id = %I.session_id
                and (s.user_id = auth.uid() or public.is_platform_admin())
            )
          )
      $f$, t || '_via_session', t, t, t);
    end if;
  end loop;
end$$;


-- ---------------------------------------------------------------------
-- B5. calendar_events — DEUX colonnes propriétaires alimentées (user_id + owner_id)
-- ---------------------------------------------------------------------
alter table public.calendar_events enable row level security;

drop policy if exists calendar_events_own on public.calendar_events;
create policy calendar_events_own on public.calendar_events
  for all to authenticated
  using (
    user_id = auth.uid()
    or owner_id = auth.uid()
    or public.is_platform_admin()
  )
  with check (
    user_id = auth.uid()
    or owner_id = auth.uid()
    or public.is_platform_admin()
  );


-- ---------------------------------------------------------------------
-- B6. user_documents — données personnelles sensibles, PAS d'exception admin
-- ---------------------------------------------------------------------
alter table public.user_documents enable row level security;

drop policy if exists user_documents_own on public.user_documents;
create policy user_documents_own on public.user_documents
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- B7. favorites
-- ---------------------------------------------------------------------
alter table public.favorites enable row level security;

drop policy if exists favorites_own on public.favorites;
create policy favorites_own on public.favorites
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- B8. playbooks / playbook_systems — colonne propriétaire : owner_id
-- ---------------------------------------------------------------------
alter table public.playbooks enable row level security;

drop policy if exists playbooks_own on public.playbooks;
create policy playbooks_own on public.playbooks
  for all to authenticated
  using (owner_id = auth.uid() or public.is_platform_admin())
  with check (owner_id = auth.uid() or public.is_platform_admin());


-- ---------------------------------------------------------------------
-- B9. match_stats / match_actions / match_player_stats
-- ---------------------------------------------------------------------
alter table public.match_stats enable row level security;

drop policy if exists match_stats_own on public.match_stats;
create policy match_stats_own on public.match_stats
  for all to authenticated
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());

alter table public.match_actions enable row level security;

drop policy if exists match_actions_own on public.match_actions;
create policy match_actions_own on public.match_actions
  for all to authenticated
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'match_player_stats'
  ) then
    execute 'alter table public.match_player_stats enable row level security';
    execute 'drop policy if exists match_player_stats_via_match on public.match_player_stats';
    execute $f$
      create policy match_player_stats_via_match on public.match_player_stats
        for all to authenticated
        using (
          exists (
            select 1 from public.match_stats m
            where m.id = match_player_stats.match_id
              and (m.user_id = auth.uid() or public.is_platform_admin())
          )
        )
        with check (
          exists (
            select 1 from public.match_stats m
            where m.id = match_player_stats.match_id
              and (m.user_id = auth.uid() or public.is_platform_admin())
          )
        )
    $f$;
  end if;
end$$;


-- =====================================================================
-- PARTIE C — GOOGLE DRIVE (optionnel)
--
-- Les objets suivants sont utilisés par app/api/google-drive/** mais ne sont
-- versionnés nulle part. Ils sont créés en `if not exists` : si ta base les
-- possède déjà, ce bloc ne fait rien.
--
-- Le correctif applicatif de cette intervention rend les RPC
-- `can_access_team` / `can_manage_team_media` FACULTATIVES (repli automatique
-- sur le contrôle de propriété de l'équipe). Ce bloc n'est donc utile que si
-- tu veux, plus tard, ouvrir l'accès Drive au staff d'une équipe.
-- =====================================================================

create table if not exists public.team_drive_connections (
  team_id                 uuid not null,
  provider                text not null default 'google_drive',
  connected_by            uuid references auth.users (id) on delete set null,
  refresh_token_encrypted text not null,
  scope                   text,
  connected_at            timestamptz not null default now(),
  revoked_at              timestamptz,
  primary key (team_id, provider)
);

alter table public.team_drive_connections enable row level security;
-- Aucune policy : cette table ne contient que des jetons chiffrés et n'est
-- lue QUE côté serveur avec la clé service role. RLS activee sans policy =
-- inaccessible depuis le navigateur, ce qui est le comportement voulu.

create table if not exists public.match_media_sources (
  match_id             uuid primary key,
  team_id              uuid,
  provider             text not null default 'google_drive',
  external_file_id     text not null,
  resource_key         text,
  file_name            text,
  mime_type            text,
  file_size            bigint,
  md5_checksum         text,
  provider_modified_at timestamptz,
  web_view_link        text,
  linked_by            uuid references auth.users (id) on delete set null,
  linked_at            timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

alter table public.match_media_sources enable row level security;

drop policy if exists match_media_sources_via_match on public.match_media_sources;
create policy match_media_sources_via_match on public.match_media_sources
  for select to authenticated
  using (
    exists (
      select 1 from public.match_stats m
      where m.id = match_media_sources.match_id
        and (m.user_id = auth.uid() or public.is_platform_admin())
    )
  );
