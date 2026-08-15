-- =====================================================================
-- MyBasket — Knowledge Engine (cerveau IA central)
-- Migration : 20260814120000_ai_knowledge_engine.sql
--
-- Cette migration est IDEMPOTENTE : elle peut être rejouée sans danger.
-- Elle ne modifie ni ne supprime AUCUNE table existante.
-- Elle ajoute uniquement des tables préfixées `ai_`, un bucket privé
-- `ai-knowledge`, des fonctions helper préfixées `ai_` et leurs RLS.
--
-- Dépendances : extension `vector` (pgvector) — disponible sur Supabase.
-- Dimension des embeddings : 1536 (OpenAI text-embedding-3-small).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------
-- 1. Fonctions helper (utilisées par les policies RLS)
-- ---------------------------------------------------------------------

-- Admin plateforme = rôle ceo/superadmin non suspendu (cf. lib/admin/guard.ts)
create or replace function public.ai_is_platform_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user
      and coalesce(p.status, 'active') <> 'suspended'
      and p.platform_role in ('ceo', 'superadmin')
  );
$$;

-- Membre actif d'un club
create or replace function public.ai_is_club_member(p_club uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.club_members m
    where m.club_id = p_club
      and m.user_id = p_user
      and coalesce(m.status, 'active') = 'active'
  );
$$;

-- Membre du club autorisé à administrer les connaissances du club
create or replace function public.ai_is_club_manager(p_club uuid, p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.club_members m
    where m.club_id = p_club
      and m.user_id = p_user
      and coalesce(m.status, 'active') = 'active'
      and m.role in ('owner', 'admin', 'direction_technique')
  );
$$;

comment on function public.ai_is_platform_admin(uuid) is 'MyBasket AI — vrai si le profil est ceo/superadmin actif.';
comment on function public.ai_is_club_member(uuid, uuid) is 'MyBasket AI — vrai si l''utilisateur est membre actif du club.';
comment on function public.ai_is_club_manager(uuid, uuid) is 'MyBasket AI — vrai si l''utilisateur peut administrer les connaissances du club.';

-- Trigger générique updated_at
create or replace function public.ai_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Catégories de connaissances (évolutives, non hardcodées)
-- ---------------------------------------------------------------------
create table if not exists public.ai_knowledge_categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  label        text not null,
  description  text,
  icon         text,
  position     integer not null default 0,
  is_active    boolean not null default true,
  is_system    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ai_knowledge_categories_active_idx
  on public.ai_knowledge_categories (is_active, position);

-- ---------------------------------------------------------------------
-- 3. Sources de connaissance (documents)
-- ---------------------------------------------------------------------
create table if not exists public.ai_knowledge_sources (
  id                uuid primary key default gen_random_uuid(),

  title             text not null,
  description       text,

  -- pdf | docx | txt | markdown | csv | image | video | pptx | link | manual
  source_type       text not null default 'pdf',
  category_slug     text references public.ai_knowledge_categories (slug) on update cascade on delete set null,

  -- Fichier dans le bucket privé `ai-knowledge`
  storage_bucket    text not null default 'ai-knowledge',
  storage_path      text,
  original_filename text,
  mime_type         text,
  file_size         bigint,
  checksum          text,

  -- Provenance affichable dans les citations IA
  provenance        text,
  source_url        text,
  author            text,
  published_at      date,

  -- Cycle de vie
  status            text not null default 'uploaded'
                    check (status in ('uploaded','processing','indexed','failed','archived')),
  index_status      text not null default 'pending'
                    check (index_status in ('pending','running','done','failed','skipped')),
  index_error       text,
  indexed_at        timestamptz,
  chunk_count       integer not null default 0,
  token_count       integer not null default 0,
  is_active         boolean not null default true,

  -- Portée
  scope             text not null default 'global' check (scope in ('global','club','user')),
  club_id           uuid,
  owner_id          uuid references auth.users (id) on delete set null,

  created_by        uuid references auth.users (id) on delete set null,
  updated_by        uuid references auth.users (id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint ai_knowledge_sources_scope_ck check (
    (scope = 'global' and club_id is null)
    or (scope = 'club' and club_id is not null)
    or (scope = 'user' and owner_id is not null)
  )
);

create index if not exists ai_knowledge_sources_scope_idx      on public.ai_knowledge_sources (scope, is_active, status);
create index if not exists ai_knowledge_sources_club_idx       on public.ai_knowledge_sources (club_id) where club_id is not null;
create index if not exists ai_knowledge_sources_owner_idx      on public.ai_knowledge_sources (owner_id) where owner_id is not null;
create index if not exists ai_knowledge_sources_category_idx   on public.ai_knowledge_sources (category_slug);
create index if not exists ai_knowledge_sources_created_at_idx on public.ai_knowledge_sources (created_at desc);
create index if not exists ai_knowledge_sources_index_idx      on public.ai_knowledge_sources (index_status);

-- ---------------------------------------------------------------------
-- 4. Chunks indexés (RAG / pgvector)
-- ---------------------------------------------------------------------
create table if not exists public.ai_knowledge_chunks (
  id           uuid primary key default gen_random_uuid(),
  source_id    uuid not null references public.ai_knowledge_sources (id) on delete cascade,

  chunk_index  integer not null,
  content      text not null,
  token_count  integer not null default 0,

  -- Localisation dans le document d'origine (citations : « page X »)
  page_from    integer,
  page_to      integer,
  heading      text,

  embedding    vector(1536),
  embedding_model text not null default 'text-embedding-3-small',

  -- Dénormalisé pour filtrer efficacement sans jointure dans la recherche vectorielle
  scope        text not null default 'global' check (scope in ('global','club','user')),
  club_id      uuid,
  owner_id     uuid,
  category_slug text,
  is_active    boolean not null default true,

  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),

  unique (source_id, chunk_index)
);

create index if not exists ai_knowledge_chunks_source_idx on public.ai_knowledge_chunks (source_id);
create index if not exists ai_knowledge_chunks_scope_idx  on public.ai_knowledge_chunks (scope, is_active);
create index if not exists ai_knowledge_chunks_club_idx   on public.ai_knowledge_chunks (club_id) where club_id is not null;
create index if not exists ai_knowledge_chunks_owner_idx  on public.ai_knowledge_chunks (owner_id) where owner_id is not null;

-- Recherche sémantique (cosine). HNSW = meilleur rappel/latence que IVFFlat et
-- ne nécessite pas de ré-entraînement quand le volume grandit.
do $$
begin
  if not exists (select 1 from pg_class where relname = 'ai_knowledge_chunks_embedding_idx') then
    begin
      execute 'create index ai_knowledge_chunks_embedding_idx
               on public.ai_knowledge_chunks
               using hnsw (embedding vector_cosine_ops)';
    exception when others then
      raise notice 'Index HNSW non créé (%). Fallback ivfflat.', sqlerrm;
      begin
        execute 'create index ai_knowledge_chunks_embedding_idx
                 on public.ai_knowledge_chunks
                 using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
      exception when others then
        raise notice 'Aucun index vectoriel créé (%). La recherche restera séquentielle.', sqlerrm;
      end;
    end;
  end if;
end$$;

-- Recherche plein texte de secours (si l'embedding échoue ou en complément lexical)
create index if not exists ai_knowledge_chunks_fts_idx
  on public.ai_knowledge_chunks
  using gin (to_tsvector('french', content));

-- ---------------------------------------------------------------------
-- 5. Lexique basket
-- ---------------------------------------------------------------------
create table if not exists public.ai_terms (
  id            uuid primary key default gen_random_uuid(),

  term          text not null,
  definition    text not null,
  category_slug text references public.ai_knowledge_categories (slug) on update cascade on delete set null,

  synonyms      text[] not null default '{}',
  translations  text[] not null default '{}',
  examples      text[] not null default '{}',
  notes         text,
  source        text,

  -- Référence optionnelle vers un schéma (URL storage ou play/exercice)
  schema_url    text,
  schema_ref_type text check (schema_ref_type in ('exercise','system','play','image')),
  schema_ref_id uuid,

  priority      text not null default 'normal' check (priority in ('critical','high','normal','low')),
  is_active     boolean not null default true,

  embedding     vector(1536),

  scope         text not null default 'global' check (scope in ('global','club','user')),
  club_id       uuid,
  owner_id      uuid references auth.users (id) on delete set null,

  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint ai_terms_scope_ck check (
    (scope = 'global' and club_id is null)
    or (scope = 'club' and club_id is not null)
    or (scope = 'user' and owner_id is not null)
  )
);

-- Unicité du terme par portée (insensible à la casse)
create unique index if not exists ai_terms_global_unique_idx
  on public.ai_terms (lower(term))
  where scope = 'global';
create unique index if not exists ai_terms_club_unique_idx
  on public.ai_terms (club_id, lower(term))
  where scope = 'club';
create unique index if not exists ai_terms_user_unique_idx
  on public.ai_terms (owner_id, lower(term))
  where scope = 'user';

create index if not exists ai_terms_scope_idx    on public.ai_terms (scope, is_active);
create index if not exists ai_terms_category_idx on public.ai_terms (category_slug);
create index if not exists ai_terms_trgm_idx     on public.ai_terms using gin (to_tsvector('french', term || ' ' || definition));

do $$
begin
  if not exists (select 1 from pg_class where relname = 'ai_terms_embedding_idx') then
    begin
      execute 'create index ai_terms_embedding_idx on public.ai_terms
               using hnsw (embedding vector_cosine_ops)';
    exception when others then
      raise notice 'Index HNSW ai_terms non créé (%).', sqlerrm;
    end;
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 6. Règles métier IA
-- ---------------------------------------------------------------------
create table if not exists public.ai_rules (
  id            uuid primary key default gen_random_uuid(),

  name          text not null,
  instruction   text not null,
  category_slug text references public.ai_knowledge_categories (slug) on update cascade on delete set null,

  -- Modules concernés. Tableau vide = toutes les fonctionnalités IA.
  modules       text[] not null default '{}',

  priority      text not null default 'normal' check (priority in ('critical','high','normal','low')),
  is_active     boolean not null default true,
  position      integer not null default 0,

  examples_good text[] not null default '{}',
  examples_bad  text[] not null default '{}',

  scope         text not null default 'global' check (scope in ('global','club','user')),
  club_id       uuid,
  owner_id      uuid references auth.users (id) on delete set null,

  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint ai_rules_scope_ck check (
    (scope = 'global' and club_id is null)
    or (scope = 'club' and club_id is not null)
    or (scope = 'user' and owner_id is not null)
  )
);

create index if not exists ai_rules_active_idx  on public.ai_rules (is_active, priority, position);
create index if not exists ai_rules_scope_idx   on public.ai_rules (scope, is_active);
create index if not exists ai_rules_modules_idx on public.ai_rules using gin (modules);

-- ---------------------------------------------------------------------
-- 7. Contenus de référence (exercices / systèmes existants)
--    Aucune duplication : simple relation vers exercises / systems.
-- ---------------------------------------------------------------------
create table if not exists public.ai_reference_content (
  id            uuid primary key default gen_random_uuid(),

  content_type  text not null check (content_type in ('exercise','system','session','play')),
  content_id    uuid not null,

  reason        text,
  quality_score integer not null default 5 check (quality_score between 1 and 10),
  tags          text[] not null default '{}',

  -- Ce que l'IA doit apprendre de ce contenu (structure, rédaction, variantes…)
  learning_focus text[] not null default '{}',

  is_active     boolean not null default true,

  scope         text not null default 'global' check (scope in ('global','club','user')),
  club_id       uuid,
  owner_id      uuid references auth.users (id) on delete set null,

  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (content_type, content_id, scope, club_id, owner_id)
);

create index if not exists ai_reference_content_type_idx  on public.ai_reference_content (content_type, is_active);
create index if not exists ai_reference_content_scope_idx on public.ai_reference_content (scope, is_active);

-- Clés étrangères posées seulement si les tables cibles existent avec un id uuid.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exercises'
      and column_name = 'id' and data_type = 'uuid'
  ) then
    raise notice 'Table exercises (uuid) détectée — référencée par ai_reference_content.content_id (contrainte applicative).';
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 8. Corrections / apprentissage
-- ---------------------------------------------------------------------
create table if not exists public.ai_corrections (
  id              uuid primary key default gen_random_uuid(),

  -- Contexte : ce qui a été demandé à l'IA
  context         text not null,
  ai_output       text not null,
  user_correction text not null,
  explanation     text,

  -- terminology | structure | tactics | wording | factual | format | other
  correction_type text not null default 'other'
                  check (correction_type in ('terminology','structure','tactics','wording','factual','format','other')),

  -- coach-chat | exercise-generation | system-generation | drawing-analysis |
  -- photo-analysis | session-scan | video-exercise | video-system | livestats | search | other
  module          text not null default 'other',

  related_type    text check (related_type in ('exercise','system','session','match','play','document')),
  related_id      uuid,

  status          text not null default 'active'
                  check (status in ('pending','active','rejected','archived')),

  embedding       vector(1536),

  scope           text not null default 'global' check (scope in ('global','club','user')),
  club_id         uuid,
  owner_id        uuid references auth.users (id) on delete set null,

  created_by      uuid references auth.users (id) on delete set null,
  reviewed_by     uuid references auth.users (id) on delete set null,
  reviewed_at     timestamptz,

  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint ai_corrections_scope_ck check (
    (scope = 'global' and club_id is null)
    or (scope = 'club' and club_id is not null)
    or (scope = 'user' and owner_id is not null)
  )
);

create index if not exists ai_corrections_status_idx on public.ai_corrections (status, created_at desc);
create index if not exists ai_corrections_module_idx on public.ai_corrections (module);
create index if not exists ai_corrections_scope_idx  on public.ai_corrections (scope, status);

do $$
begin
  if not exists (select 1 from pg_class where relname = 'ai_corrections_embedding_idx') then
    begin
      execute 'create index ai_corrections_embedding_idx on public.ai_corrections
               using hnsw (embedding vector_cosine_ops)';
    exception when others then
      raise notice 'Index HNSW ai_corrections non créé (%).', sqlerrm;
    end;
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 9. Conversations Coach IA
-- ---------------------------------------------------------------------
create table if not exists public.ai_conversations (
  id           uuid primary key default gen_random_uuid(),
  title        text not null default 'Nouvelle conversation',
  module       text not null default 'coach-chat',

  user_id      uuid not null references auth.users (id) on delete cascade,
  club_id      uuid,
  scope        text not null default 'user' check (scope in ('global','club','user')),

  is_archived  boolean not null default false,
  last_message_at timestamptz not null default now(),
  message_count integer not null default 0,

  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx on public.ai_conversations (user_id, is_archived, last_message_at desc);

create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,

  role            text not null check (role in ('system','user','assistant','tool')),
  content         text not null default '',

  -- Provenance : [{ kind, id, label, detail, score }]
  citations       jsonb not null default '[]'::jsonb,
  attachments     jsonb not null default '[]'::jsonb,

  model           text,
  prompt_tokens   integer,
  completion_tokens integer,
  latency_ms      integer,
  error           text,

  created_at      timestamptz not null default now()
);

create index if not exists ai_messages_conversation_idx on public.ai_messages (conversation_id, created_at);

-- ---------------------------------------------------------------------
-- 10. Journal d'usage IA
-- ---------------------------------------------------------------------
create table if not exists public.ai_usage (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete set null,
  club_id           uuid,
  module            text not null default 'other',
  operation         text not null default 'chat',
  model             text,
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens      integer not null default 0,
  latency_ms        integer,
  success           boolean not null default true,
  error             text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists ai_usage_created_idx on public.ai_usage (created_at desc);
create index if not exists ai_usage_user_idx    on public.ai_usage (user_id, created_at desc);
create index if not exists ai_usage_module_idx  on public.ai_usage (module, created_at desc);

-- ---------------------------------------------------------------------
-- 11. Triggers updated_at
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_knowledge_categories','ai_knowledge_sources','ai_terms','ai_rules',
    'ai_reference_content','ai_corrections','ai_conversations'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.ai_touch_updated_at()',
      'trg_' || t || '_touch', t
    );
  end loop;
end$$;

-- ---------------------------------------------------------------------
-- 12. Clés étrangères vers `clubs` (posées seulement si compatible)
-- ---------------------------------------------------------------------
do $$
declare
  tbl text;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'clubs'
      and column_name = 'id' and data_type = 'uuid'
  ) then
    foreach tbl in array array[
      'ai_knowledge_sources','ai_knowledge_chunks','ai_terms','ai_rules',
      'ai_reference_content','ai_corrections','ai_conversations','ai_usage'
    ] loop
      begin
        execute format(
          'alter table public.%I add constraint %I foreign key (club_id) references public.clubs (id) on delete cascade',
          tbl, tbl || '_club_fk'
        );
      exception
        when duplicate_object then null;
        when others then raise notice 'FK club sur % non posée : %', tbl, sqlerrm;
      end;
    end loop;
  else
    raise notice 'Table clubs absente ou id non-uuid : les FK club_id ne sont pas posées.';
  end if;
end$$;

-- ---------------------------------------------------------------------
-- 13. RLS
-- ---------------------------------------------------------------------
alter table public.ai_knowledge_categories enable row level security;
alter table public.ai_knowledge_sources    enable row level security;
alter table public.ai_knowledge_chunks     enable row level security;
alter table public.ai_terms                enable row level security;
alter table public.ai_rules                enable row level security;
alter table public.ai_reference_content    enable row level security;
alter table public.ai_corrections          enable row level security;
alter table public.ai_conversations        enable row level security;
alter table public.ai_messages             enable row level security;
alter table public.ai_usage                enable row level security;

-- --- Catégories : lecture pour tout utilisateur authentifié, écriture admin
drop policy if exists ai_categories_read on public.ai_knowledge_categories;
create policy ai_categories_read on public.ai_knowledge_categories
  for select to authenticated
  using (is_active or public.ai_is_platform_admin());

drop policy if exists ai_categories_write on public.ai_knowledge_categories;
create policy ai_categories_write on public.ai_knowledge_categories
  for all to authenticated
  using (public.ai_is_platform_admin())
  with check (public.ai_is_platform_admin());

-- --- Sources
drop policy if exists ai_sources_read on public.ai_knowledge_sources;
create policy ai_sources_read on public.ai_knowledge_sources
  for select to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'global' and is_active and status <> 'archived')
    or (scope = 'club'   and club_id is not null and public.ai_is_club_member(club_id))
    or (scope = 'user'   and owner_id = auth.uid())
  );

drop policy if exists ai_sources_insert on public.ai_knowledge_sources;
create policy ai_sources_insert on public.ai_knowledge_sources
  for insert to authenticated
  with check (
    (scope = 'global' and public.ai_is_platform_admin())
    or (scope = 'club'  and club_id is not null and public.ai_is_club_manager(club_id))
    or (scope = 'user'  and owner_id = auth.uid())
  );

drop policy if exists ai_sources_update on public.ai_knowledge_sources;
create policy ai_sources_update on public.ai_knowledge_sources
  for update to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'club' and club_id is not null and public.ai_is_club_manager(club_id))
    or (scope = 'user' and owner_id = auth.uid())
  )
  with check (
    public.ai_is_platform_admin()
    or (scope = 'club' and club_id is not null and public.ai_is_club_manager(club_id))
    or (scope = 'user' and owner_id = auth.uid())
  );

drop policy if exists ai_sources_delete on public.ai_knowledge_sources;
create policy ai_sources_delete on public.ai_knowledge_sources
  for delete to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'club' and club_id is not null and public.ai_is_club_manager(club_id))
    or (scope = 'user' and owner_id = auth.uid())
  );

-- --- Chunks : lecture seule dérivée de la source ; écriture réservée au serveur
drop policy if exists ai_chunks_read on public.ai_knowledge_chunks;
create policy ai_chunks_read on public.ai_knowledge_chunks
  for select to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'global' and is_active)
    or (scope = 'club'   and club_id is not null and public.ai_is_club_member(club_id))
    or (scope = 'user'   and owner_id = auth.uid())
  );

drop policy if exists ai_chunks_write on public.ai_knowledge_chunks;
create policy ai_chunks_write on public.ai_knowledge_chunks
  for all to authenticated
  using (public.ai_is_platform_admin())
  with check (public.ai_is_platform_admin());

-- --- Lexique
drop policy if exists ai_terms_read on public.ai_terms;
create policy ai_terms_read on public.ai_terms
  for select to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'global' and is_active)
    or (scope = 'club'   and club_id is not null and public.ai_is_club_member(club_id))
    or (scope = 'user'   and owner_id = auth.uid())
  );

drop policy if exists ai_terms_write on public.ai_terms;
create policy ai_terms_write on public.ai_terms
  for all to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'club' and club_id is not null and public.ai_is_club_manager(club_id))
    or (scope = 'user' and owner_id = auth.uid())
  )
  with check (
    (scope = 'global' and public.ai_is_platform_admin())
    or (scope = 'club'  and club_id is not null and public.ai_is_club_manager(club_id))
    or (scope = 'user'  and owner_id = auth.uid())
  );

-- --- Règles
drop policy if exists ai_rules_read on public.ai_rules;
create policy ai_rules_read on public.ai_rules
  for select to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'global' and is_active)
    or (scope = 'club'   and club_id is not null and public.ai_is_club_member(club_id))
    or (scope = 'user'   and owner_id = auth.uid())
  );

drop policy if exists ai_rules_write on public.ai_rules;
create policy ai_rules_write on public.ai_rules
  for all to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'club' and club_id is not null and public.ai_is_club_manager(club_id))
    or (scope = 'user' and owner_id = auth.uid())
  )
  with check (
    (scope = 'global' and public.ai_is_platform_admin())
    or (scope = 'club'  and club_id is not null and public.ai_is_club_manager(club_id))
    or (scope = 'user'  and owner_id = auth.uid())
  );

-- --- Références
drop policy if exists ai_reference_read on public.ai_reference_content;
create policy ai_reference_read on public.ai_reference_content
  for select to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'global' and is_active)
    or (scope = 'club'   and club_id is not null and public.ai_is_club_member(club_id))
    or (scope = 'user'   and owner_id = auth.uid())
  );

drop policy if exists ai_reference_write on public.ai_reference_content;
create policy ai_reference_write on public.ai_reference_content
  for all to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'club' and club_id is not null and public.ai_is_club_manager(club_id))
    or (scope = 'user' and owner_id = auth.uid())
  )
  with check (
    (scope = 'global' and public.ai_is_platform_admin())
    or (scope = 'club'  and club_id is not null and public.ai_is_club_manager(club_id))
    or (scope = 'user'  and owner_id = auth.uid())
  );

-- --- Corrections : un utilisateur peut créer les siennes, l'admin voit tout
drop policy if exists ai_corrections_read on public.ai_corrections;
create policy ai_corrections_read on public.ai_corrections
  for select to authenticated
  using (
    public.ai_is_platform_admin()
    or created_by = auth.uid()
    or (scope = 'global' and status = 'active')
    or (scope = 'club'   and club_id is not null and public.ai_is_club_member(club_id))
    or (scope = 'user'   and owner_id = auth.uid())
  );

drop policy if exists ai_corrections_insert on public.ai_corrections;
create policy ai_corrections_insert on public.ai_corrections
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      (scope = 'global' and public.ai_is_platform_admin())
      or (scope = 'club' and club_id is not null and public.ai_is_club_member(club_id))
      or (scope = 'user' and owner_id = auth.uid())
    )
  );

drop policy if exists ai_corrections_update on public.ai_corrections;
create policy ai_corrections_update on public.ai_corrections
  for update to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'user' and owner_id = auth.uid())
    or (scope = 'club' and club_id is not null and public.ai_is_club_manager(club_id))
  )
  with check (
    public.ai_is_platform_admin()
    or (scope = 'user' and owner_id = auth.uid())
    or (scope = 'club' and club_id is not null and public.ai_is_club_manager(club_id))
  );

drop policy if exists ai_corrections_delete on public.ai_corrections;
create policy ai_corrections_delete on public.ai_corrections
  for delete to authenticated
  using (
    public.ai_is_platform_admin()
    or (scope = 'user' and owner_id = auth.uid())
  );

-- --- Conversations & messages : strictement privés à leur auteur
drop policy if exists ai_conversations_own on public.ai_conversations;
create policy ai_conversations_own on public.ai_conversations
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists ai_messages_own on public.ai_messages;
create policy ai_messages_own on public.ai_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id and c.user_id = auth.uid()
    )
  );

-- --- Usage : lecture admin ou propriétaire, écriture serveur (service role)
drop policy if exists ai_usage_read on public.ai_usage;
create policy ai_usage_read on public.ai_usage
  for select to authenticated
  using (public.ai_is_platform_admin() or user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 14. Fonctions de recherche sémantique (SECURITY INVOKER : la RLS s'applique)
-- ---------------------------------------------------------------------
create or replace function public.ai_match_chunks(
  p_query_embedding vector(1536),
  p_match_count     integer default 8,
  p_min_similarity  double precision default 0.15,
  p_scopes          text[] default array['global'],
  p_club_id         uuid default null,
  p_owner_id        uuid default null,
  p_categories      text[] default null
)
returns table (
  id            uuid,
  source_id     uuid,
  content       text,
  similarity    double precision,
  chunk_index   integer,
  page_from     integer,
  page_to       integer,
  heading       text,
  category_slug text,
  source_title  text,
  provenance    text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    c.source_id,
    c.content,
    1 - (c.embedding <=> p_query_embedding) as similarity,
    c.chunk_index,
    c.page_from,
    c.page_to,
    c.heading,
    c.category_slug,
    s.title as source_title,
    coalesce(s.provenance, s.title) as provenance
  from public.ai_knowledge_chunks c
  join public.ai_knowledge_sources s on s.id = c.source_id
  where c.embedding is not null
    and c.is_active
    and s.is_active
    and s.status = 'indexed'
    and c.scope = any (p_scopes)
    and (c.scope <> 'club' or c.club_id = p_club_id)
    and (c.scope <> 'user' or c.owner_id = p_owner_id)
    and (p_categories is null or c.category_slug = any (p_categories))
    and (1 - (c.embedding <=> p_query_embedding)) >= p_min_similarity
  order by c.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 50));
$$;

create or replace function public.ai_match_terms(
  p_query_embedding vector(1536),
  p_match_count     integer default 6,
  p_min_similarity  double precision default 0.2,
  p_scopes          text[] default array['global'],
  p_club_id         uuid default null,
  p_owner_id        uuid default null
)
returns table (
  id         uuid,
  term       text,
  definition text,
  synonyms   text[],
  examples   text[],
  notes      text,
  source     text,
  priority   text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    t.id, t.term, t.definition, t.synonyms, t.examples, t.notes, t.source, t.priority,
    1 - (t.embedding <=> p_query_embedding) as similarity
  from public.ai_terms t
  where t.embedding is not null
    and t.is_active
    and t.scope = any (p_scopes)
    and (t.scope <> 'club' or t.club_id = p_club_id)
    and (t.scope <> 'user' or t.owner_id = p_owner_id)
    and (1 - (t.embedding <=> p_query_embedding)) >= p_min_similarity
  order by t.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 30));
$$;

create or replace function public.ai_match_corrections(
  p_query_embedding vector(1536),
  p_match_count     integer default 5,
  p_min_similarity  double precision default 0.25,
  p_module          text default null,
  p_scopes          text[] default array['global'],
  p_club_id         uuid default null,
  p_owner_id        uuid default null
)
returns table (
  id              uuid,
  context         text,
  ai_output       text,
  user_correction text,
  explanation     text,
  correction_type text,
  module          text,
  similarity      double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    k.id, k.context, k.ai_output, k.user_correction, k.explanation,
    k.correction_type, k.module,
    1 - (k.embedding <=> p_query_embedding) as similarity
  from public.ai_corrections k
  where k.embedding is not null
    and k.status = 'active'
    and (p_module is null or k.module = p_module)
    and k.scope = any (p_scopes)
    and (k.scope <> 'club' or k.club_id = p_club_id)
    and (k.scope <> 'user' or k.owner_id = p_owner_id)
    and (1 - (k.embedding <=> p_query_embedding)) >= p_min_similarity
  order by k.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 20));
$$;

-- Recherche lexicale de secours (aucun embedding disponible)
create or replace function public.ai_search_chunks_text(
  p_query       text,
  p_match_count integer default 8,
  p_scopes      text[] default array['global'],
  p_club_id     uuid default null,
  p_owner_id    uuid default null
)
returns table (
  id            uuid,
  source_id     uuid,
  content       text,
  similarity    double precision,
  chunk_index   integer,
  page_from     integer,
  page_to       integer,
  heading       text,
  category_slug text,
  source_title  text,
  provenance    text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id, c.source_id, c.content,
    ts_rank(to_tsvector('french', c.content), websearch_to_tsquery('french', p_query))::double precision as similarity,
    c.chunk_index, c.page_from, c.page_to, c.heading, c.category_slug,
    s.title, coalesce(s.provenance, s.title)
  from public.ai_knowledge_chunks c
  join public.ai_knowledge_sources s on s.id = c.source_id
  where c.is_active and s.is_active
    and c.scope = any (p_scopes)
    and (c.scope <> 'club' or c.club_id = p_club_id)
    and (c.scope <> 'user' or c.owner_id = p_owner_id)
    and to_tsvector('french', c.content) @@ websearch_to_tsquery('french', p_query)
  order by similarity desc
  limit greatest(1, least(p_match_count, 50));
$$;

grant execute on function public.ai_match_chunks(vector, integer, double precision, text[], uuid, uuid, text[]) to authenticated;
grant execute on function public.ai_match_terms(vector, integer, double precision, text[], uuid, uuid) to authenticated;
grant execute on function public.ai_match_corrections(vector, integer, double precision, text, text[], uuid, uuid) to authenticated;
grant execute on function public.ai_search_chunks_text(text, integer, text[], uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 15. Storage : bucket privé `ai-knowledge`
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-knowledge',
  'ai-knowledge',
  false,
  52428800, -- 50 Mo
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Convention de chemin :
--   global/<uuid>/<filename>
--   club/<club_id>/<uuid>/<filename>
--   user/<user_id>/<uuid>/<filename>
drop policy if exists ai_knowledge_objects_read on storage.objects;
create policy ai_knowledge_objects_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ai-knowledge'
    and (
      public.ai_is_platform_admin()
      or ((storage.foldername(name))[1] = 'user' and (storage.foldername(name))[2] = auth.uid()::text)
      or ((storage.foldername(name))[1] = 'club'
          and public.ai_is_club_member(nullif((storage.foldername(name))[2], '')::uuid))
    )
  );

drop policy if exists ai_knowledge_objects_write on storage.objects;
create policy ai_knowledge_objects_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ai-knowledge'
    and (
      ((storage.foldername(name))[1] = 'global' and public.ai_is_platform_admin())
      or ((storage.foldername(name))[1] = 'user' and (storage.foldername(name))[2] = auth.uid()::text)
      or ((storage.foldername(name))[1] = 'club'
          and public.ai_is_club_manager(nullif((storage.foldername(name))[2], '')::uuid))
    )
  );

drop policy if exists ai_knowledge_objects_delete on storage.objects;
create policy ai_knowledge_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ai-knowledge'
    and (
      public.ai_is_platform_admin()
      or ((storage.foldername(name))[1] = 'user' and (storage.foldername(name))[2] = auth.uid()::text)
      or ((storage.foldername(name))[1] = 'club'
          and public.ai_is_club_manager(nullif((storage.foldername(name))[2], '')::uuid))
    )
  );

-- ---------------------------------------------------------------------
-- 16. Données initiales
-- ---------------------------------------------------------------------

-- Catégories
insert into public.ai_knowledge_categories (slug, label, description, icon, position, is_system) values
  ('basketball-general',      'Basketball général',      'Culture basket, principes de jeu, vocabulaire général.', '🏀', 10, true),
  ('exercices',               'Exercices',               'Contenus liés aux exercices d''entraînement.',           '🎯', 20, true),
  ('systemes',                'Systèmes',                'Systèmes de jeu, playbooks, continuités.',               '📋', 30, true),
  ('tactique-offensive',      'Tactique offensive',      'Attaque placée, transition, spacing, lectures.',          '⚡', 40, true),
  ('tactique-defensive',      'Tactique défensive',      'Défenses individuelles, de zone, aides, rotations.',      '🛡️', 50, true),
  ('developpement-individuel','Développement individuel','Skills, gestes techniques, progression joueur.',          '📈', 60, true),
  ('formation-entraineur',    'Formation entraîneur',    'Contenus de formation et de certification.',              '🎓', 70, true),
  ('livestatspro',            'LiveStatsPro',            'Documentation et méthodologie LiveStatsPro.',             '📊', 80, true),
  ('statistiques',            'Statistiques',            'Analyse statistique, indicateurs, box score.',            '📉', 90, true),
  ('video',                   'Vidéo',                   'Analyse vidéo, montage, scouting.',                       '🎬', 100, true),
  ('regles-mybasket',         'Règles MyBasket',         'Règles de rédaction et conventions internes MyBasket.',   '🧭', 110, true),
  ('autre',                   'Autre',                   'Non classé.',                                             '📁', 999, true)
on conflict (slug) do nothing;

-- Règles fondatrices (critiques)
insert into public.ai_rules (name, instruction, category_slug, priority, position, modules, examples_good, examples_bad, scope, is_active)
select
  'Rédaction au présent',
  'Rédige TOUJOURS les exercices, systèmes, consignes et descriptions au présent de l''indicatif. N''utilise jamais l''infinitif, l''impératif, le futur ou le passé pour décrire le déroulement d''une action.',
  'regles-mybasket',
  'critical',
  1,
  '{}',
  array['Le joueur 1 dribble vers la ligne médiane puis passe au joueur 2.'],
  array['Le joueur 1 devra dribbler vers la ligne médiane.', 'Dribbler vers la ligne médiane puis passer.'],
  'global',
  true
where not exists (select 1 from public.ai_rules where name = 'Rédaction au présent' and scope = 'global');

insert into public.ai_rules (name, instruction, category_slug, priority, position, modules, examples_good, examples_bad, scope, is_active)
select
  'Désignation des joueurs',
  'Désigne TOUJOURS les joueurs sous la forme « le joueur 1 », « le joueur 2 », « le joueur 3 », « le joueur 4 », « le joueur 5 ». N''écris jamais « 1 », « 2 », « J1 », « J2 », « n°1 » ni « le 5 » seuls. La même règle s''applique aux défenseurs : « le défenseur du joueur 1 ».',
  'regles-mybasket',
  'critical',
  2,
  '{}',
  array['Le joueur 1 passe au joueur 2 puis coupe vers le panier.', 'Le joueur 5 pose un écran pour le joueur 1.'],
  array['1 passe à 2 puis coupe.', 'J1 passe à J2.', 'Le 5 pose un écran pour le 1.'],
  'global',
  true
where not exists (select 1 from public.ai_rules where name = 'Désignation des joueurs' and scope = 'global');

-- Lexique de démarrage (les définitions sont éditables depuis le dashboard)
insert into public.ai_terms (term, definition, category_slug, synonyms, examples, priority, scope, is_active)
select v.term, v.definition, v.category, v.synonyms, v.examples, 'normal', 'global', true
from (values
  ('Pick and Roll',
   'Action à deux joueurs dans laquelle un joueur pose un écran sur le défenseur du porteur de balle, puis plonge vers le panier après le contact.',
   'tactique-offensive'::text,
   array['P&R','Pick n Roll','Écran et roule'],
   array['Le joueur 5 pose un écran pour le joueur 1 puis plonge vers le panier.']),
  ('Short Roll',
   'Variante du pick and roll dans laquelle le poseur d''écran s''arrête à mi-distance (autour de la ligne des lancers francs) au lieu de plonger jusqu''au panier, afin de recevoir la balle dans l''espace laissé par une défense en hedge ou en blitz.',
   'tactique-offensive',
   array['Roll court'],
   array['Face au blitz, le joueur 5 réalise un short roll et prend la balle à la ligne des lancers francs.']),
  ('Ghost Screen',
   'Écran feint : le joueur simule la pose d''un écran puis s''écarte immédiatement vers l''extérieur sans contact, pour se libérer derrière la ligne à trois points.',
   'tactique-offensive',
   array['Écran fantôme','Slip screen'],
   array['Le joueur 4 réalise un ghost screen puis ressort à trois points.']),
  ('Spain Pick and Roll',
   'Pick and roll dans lequel un troisième joueur pose un back screen sur le défenseur du poseur d''écran pendant que celui-ci plonge, créant un double problème de lecture pour la défense.',
   'tactique-offensive',
   array['Stack Pick and Roll','Spain'],
   array['Le joueur 3 pose un back screen sur le défenseur du joueur 5 pendant le roll.']),
  ('Flare',
   'Écran posé à contre-sens du ballon qui libère un joueur vers l''extérieur, généralement en direction de l''aile ou du corner opposé.',
   'tactique-offensive',
   array['Flare screen','Écran arrière extérieur'],
   array['Le joueur 5 pose un flare pour le joueur 2 qui ressort à trois points.']),
  ('Curl',
   'Coupe dans laquelle le joueur contourne l''écran en s''enroulant autour du poseur, en direction du panier.',
   'tactique-offensive',
   array['Curl cut','Coupe enroulée'],
   array['Le joueur 2 réalise un curl autour de l''écran du joueur 5.']),
  ('Backdoor',
   'Coupe dans le dos du défenseur vers le panier, exploitant une surprotection de la ligne de passe.',
   'tactique-offensive',
   array['Back door','Coupe dans le dos'],
   array['Le joueur 3 réalise un backdoor et reçoit la balle sous le panier.']),
  ('Iverson Cut',
   'Coupe horizontale d''un joueur extérieur qui traverse la raquette au niveau de la ligne des lancers francs en utilisant deux écrans posés par les intérieurs.',
   'tactique-offensive',
   array['Iverson'],
   array['Le joueur 2 réalise un Iverson cut au-dessus de la raquette.']),
  ('UCLA Cut',
   'Coupe vers le panier réalisée après une passe à l''aile, en utilisant un écran posé par un intérieur situé au niveau du poste haut.',
   'tactique-offensive',
   array['UCLA'],
   array['Le joueur 1 passe au joueur 2 puis réalise un UCLA cut sur l''écran du joueur 5.'])
) as v(term, definition, category, synonyms, examples)
where not exists (
  select 1 from public.ai_terms t where lower(t.term) = lower(v.term) and t.scope = 'global'
);

-- ---------------------------------------------------------------------
-- 17. Commentaires
-- ---------------------------------------------------------------------
comment on table public.ai_knowledge_sources is 'MyBasket Knowledge Engine — documents sources (PDF, DOCX, TXT, MD, CSV…).';
comment on table public.ai_knowledge_chunks  is 'MyBasket Knowledge Engine — passages indexés avec embeddings pgvector (RAG).';
comment on table public.ai_terms             is 'MyBasket Knowledge Engine — lexique basket consultable par toutes les IA.';
comment on table public.ai_rules             is 'MyBasket Knowledge Engine — règles métier injectées dans les prompts.';
comment on table public.ai_reference_content is 'MyBasket Knowledge Engine — exercices/systèmes existants marqués comme modèles (aucune duplication).';
comment on table public.ai_corrections       is 'MyBasket Knowledge Engine — mémoire des corrections utilisateur (pas de fine-tuning).';
comment on table public.ai_conversations     is 'MyBasket Knowledge Engine — conversations Coach IA.';
comment on table public.ai_messages          is 'MyBasket Knowledge Engine — messages Coach IA avec citations de provenance.';
comment on table public.ai_usage             is 'MyBasket Knowledge Engine — journal de consommation des appels IA.';
