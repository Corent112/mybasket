-- 00_SETUP_SUPABASE_EXERCISES.sql
-- À lancer une seule fois dans Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.exercises
  add column if not exists theme text,
  add column if not exists level text,
  add column if not exists duration text,
  add column if not exists objectif text,
  add column if not exists objectifs text,
  add column if not exists equipment text[],
  add column if not exists materiel text[],
  add column if not exists tags text[],
  add column if not exists author_name text,
  add column if not exists source text,
  add column if not exists source_page integer,
  add column if not exists is_public boolean default true,
  add column if not exists status text default 'approved',
  add column if not exists visibility text default 'public',
  add column if not exists review_status text default 'approved',
  add column if not exists updated_at timestamptz default now();

-- Garantit les bons types pour le modèle actuel de ton projet.
-- schema_images et schema_data_list sont jsonb dans ta base, donc l'import V3 insère du jsonb.

insert into storage.buckets (id, name, public)
values ('exercise-schemas', 'exercise-schemas', true)
on conflict (id) do update set public = true;

-- Lecture publique du bucket si les politiques Storage sont actives.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'exercise_schemas_public_read'
  ) then
    create policy exercise_schemas_public_read
    on storage.objects for select
    using (bucket_id = 'exercise-schemas');
  end if;
end $$;

-- Lecture des exercices publics côté application.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'exercises'
      and policyname = 'public_exercises_read'
  ) then
    create policy public_exercises_read
    on public.exercises for select
    using (visibility = 'public' or is_public = true or status in ('approved','published','active'));
  end if;
end $$;
