-- =====================================================================
-- MyBasket — Google Drive : objets requis + contrôle d'accès aux équipes
-- Migration : 20260815120000_google_drive.sql
--
-- Idempotent. N'active AUCUNE RLS sur des tables existantes, ne supprime
-- rien, et ne touche à aucune autre fonctionnalité.
--
-- Exécuter dans l'ordre : PARTIE A (diagnostic) puis PARTIE B (correctifs).
-- =====================================================================


-- =====================================================================
-- PARTIE A — DIAGNOSTIC (lecture seule)
-- =====================================================================

-- A1. Signature EXACTE des deux fonctions appelées par le code.
-- Le code appelle supabase.rpc('can_access_team',      { p_team_id })
--                supabase.rpc('can_manage_team_media', { p_team_id })
-- PostgREST résout la fonction par le NOM DE SON ARGUMENT. Si l'argument
-- s'appelle autrement que `p_team_id`, la réponse est PGRST202
-- « Could not find the function » → 500 sans aucun appel à Google.
select
  p.proname                                   as fonction,
  pg_get_function_identity_arguments(p.oid)   as arguments,
  pg_get_function_result(p.oid)               as retour,
  p.prosecdef                                 as security_definer,
  p.proconfig                                 as search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('can_access_team', 'can_manage_team_media')
order by 1;

-- A2. Corps des fonctions : vérifier si elles accordent un accès spécial
-- à platform_role 'ceo' / 'superadmin'. Cherche `platform_role` dans le
-- résultat : s'il apparaît, un CEO voit les équipes des autres utilisateurs.
select p.proname, pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('can_access_team', 'can_manage_team_media');

-- A3. Droits d'exécution : le rôle `authenticated` doit pouvoir les appeler.
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in ('can_access_team', 'can_manage_team_media')
order by 1, 2;

-- A4. Tables et contraintes requises par le flux Drive.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('team_drive_connections', 'match_media_sources')
order by table_name, ordinal_position;

select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  to_regclass('public.team_drive_connections'),
  to_regclass('public.match_media_sources')
)
order by conname;

-- A5. Type de teams.id : les fonctions doivent accepter ce type.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'teams' and column_name = 'id';


-- =====================================================================
-- PARTIE B — CORRECTIFS
-- =====================================================================

-- ---------------------------------------------------------------------
-- B1. Contrôle d'accès aux équipes — SANS privilège CEO.
--
-- Règle métier : dans les outils personnels, un utilisateur n'accède qu'à
-- SES équipes. Être ceo/superadmin ne doit PAS ouvrir les équipes des
-- autres. Ces deux fonctions ne servent QUE au flux Google Drive, qui est
-- un outil personnel : elles ne contiennent donc aucune exception admin.
--
-- `create or replace` conserve les droits déjà accordés. Si tes fonctions
-- actuelles ont une signature différente (cf. A1), supprime-les d'abord :
--   drop function if exists public.can_access_team(uuid);
--   drop function if exists public.can_manage_team_media(uuid);
-- ---------------------------------------------------------------------

create or replace function public.can_access_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and t.user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_team_media(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    where t.id = p_team_id
      and t.user_id = auth.uid()
  );
$$;

comment on function public.can_access_team(uuid) is
  'MyBasket — vrai si l''équipe appartient à l''utilisateur courant. Aucune exception CEO : outil personnel.';
comment on function public.can_manage_team_media(uuid) is
  'MyBasket — vrai si l''utilisateur peut gérer les médias de l''équipe (propriétaire). Aucune exception CEO.';

grant execute on function public.can_access_team(uuid) to authenticated;
grant execute on function public.can_manage_team_media(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- B2. Table des connexions Drive (refresh tokens chiffrés).
-- Lue et écrite UNIQUEMENT côté serveur avec la clé service role.
-- ---------------------------------------------------------------------
create table if not exists public.team_drive_connections (
  team_id                 uuid not null,
  provider                text not null default 'google_drive',
  connected_by            uuid references auth.users (id) on delete set null,
  refresh_token_encrypted text not null,
  scope                   text,
  connected_at            timestamptz not null default now(),
  revoked_at              timestamptz
);

-- Le code fait un upsert `onConflict: "team_id,provider"` : cette contrainte
-- unique est OBLIGATOIRE, sinon le callback échoue après l'OAuth.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = to_regclass('public.team_drive_connections')
      and contype in ('p', 'u')
      and pg_get_constraintdef(oid) like '%(team_id, provider)%'
  ) then
    alter table public.team_drive_connections
      add constraint team_drive_connections_team_provider_key
      unique (team_id, provider);
  end if;
end$$;

alter table public.team_drive_connections enable row level security;
-- Volontairement AUCUNE policy : la table ne doit jamais être lisible depuis
-- le navigateur. Le service role contourne la RLS côté serveur.


-- ---------------------------------------------------------------------
-- B3. Média rattaché à un match.
-- ---------------------------------------------------------------------
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

drop policy if exists match_media_sources_owner on public.match_media_sources;
create policy match_media_sources_owner on public.match_media_sources
  for select to authenticated
  using (
    exists (
      select 1 from public.teams t
      where t.id = match_media_sources.team_id
        and t.user_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------
-- B4. Vérification finale
-- ---------------------------------------------------------------------
-- Doit renvoyer `true` pour une équipe qui t'appartient, `false` sinon.
-- Remplace l'uuid par un id réel de ta table teams.
-- select public.can_manage_team_media('00000000-0000-0000-0000-000000000000'::uuid);
