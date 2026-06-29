-- MyBasket beta import - backup + clear old official content
-- A lancer dans Supabase SQL Editor AVANT le script d'import.

create table if not exists public.exercises_backup_before_cahier_t1_import as
select * from public.exercises;

create table if not exists public.systems_backup_before_cahier_t1_import as
select * from public.systems;

-- Suppression complète des contenus actuels + relations dépendantes éventuelles
truncate table public.exercises restart identity cascade;
truncate table public.systems restart identity cascade;
