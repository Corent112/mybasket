-- MyBasket — dossier racine des vidéos de match
-- 2026-08-27
--
-- Objectif : que « le dossier racine des matchs est ici » suive le COMPTE,
-- et non le navigateur. L'autorisation technique d'accès au dossier reste
-- forcément locale au navigateur (sécurité du système de fichiers), mais le
-- chemin déclaré, lui, s'affiche à l'identique sur Chrome, Edge ou Safari,
-- et sur n'importe quelle machine.
--
-- Portée volontairement minimale : une colonne texte nullable.
-- Aucune RLS n'est modifiée : les politiques existantes de `profiles`
-- (lecture/écriture de sa propre ligne) couvrent déjà cette colonne.
-- Aucun impact sur les abonnements, les droits ou les équipes.

alter table public.profiles
  add column if not exists video_root_folder text;

comment on column public.profiles.video_root_folder is
  'Chemin déclaré par l''utilisateur vers son dossier local de vidéos de match (ex. ~/Movies/MyBasket). Purement indicatif : aucun accès disque n''est fait depuis le serveur.';
