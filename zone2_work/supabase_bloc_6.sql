-- MYBASKET — BLOC 6 : ANNONCES, CAMPS ET PROFILS COACHS
-- À exécuter dans Supabase > SQL Editor.

-- 1) Profil coach : conserver le formulaire complet sans perdre les champs avancés.
alter table if exists public.coach_profiles
  add column if not exists profile_data jsonb not null default '{}'::jsonb,
  add column if not exists instagram_url text,
  add column if not exists video_url text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists coach_profiles_user_id_unique
  on public.coach_profiles(user_id);

-- 2) Annonces : colonnes utilisées par le formulaire public et le dashboard CEO.
alter table if exists public.announcements
  add column if not exists author_user_id uuid,
  add column if not exists author_type text,
  add column if not exists author_name text,
  add column if not exists author_email text,
  add column if not exists author_phone text,
  add column if not exists category text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists city text,
  add column if not exists price_cents integer,
  add column if not exists image_url text,
  add column if not exists status text not null default 'pending',
  add column if not exists views_count integer not null default 0,
  add column if not exists contacts_count integer not null default 0,
  add column if not exists is_featured boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists announcements_status_created_idx
  on public.announcements(status, created_at desc);

-- Les annonces utilisateurs restent en attente jusqu'à validation CEO.
update public.announcements
set status = 'pending'
where status is null or status = '';
