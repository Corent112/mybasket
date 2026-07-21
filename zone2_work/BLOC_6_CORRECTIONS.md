# Bloc 6 — Annonces, camps et profils coachs

## Corrigé

- Suppression du type d'annonce « Autre ».
- Niveaux simplifiés : Départemental, Régional, National.
- Catégories limitées : U13, U15, U18, U21, Seniors.
- Camp / Stage :
  - « Piliers du stage » devient « Valeurs du stage » ;
  - champ texte libre sans bouton Ajouter ;
  - grand champ « Journée type / programme de la semaine » ;
  - retrait de la rubrique Atouts ;
  - vidéo par lien YouTube/Vimeo ou téléversement de fichier.
- Profil coach individuel :
  - « À propos de moi — valeurs » en texte libre, sans puces imposées ;
  - disponibilités réalignées ;
  - suppression des étapes Déroulement et Propose ;
  - ajout d'un lien Instagram cliquable ;
  - vidéo par lien ou fichier ;
  - message Supabase détaillé au lieu de `{}`.
- Dashboard CEO : correction de la table lue/modifiée (`announcements` au lieu de `annonces`).
- Les annonces soumises apparaissent désormais dans la modération CEO.
- Le profil coach complet est conservé dans `profile_data`.

## Validation

- `npm install` exécuté.
- `npx tsc --noEmit` : aucune erreur.

## À faire avant test

Exécuter `supabase_bloc_6.sql` dans Supabase SQL Editor.
