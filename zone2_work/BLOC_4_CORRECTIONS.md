# MyBasket — Bloc 4 : harmonisation UI / UX

## Modifications appliquées

- Les polices globales utilisent désormais les variables Next.js réellement chargées : Roboto pour les textes et Alfa Slab One pour les titres d'identité.
- Les pages Direction technique, Mentorat/Formation et Scouting vidéo partagent la même typographie, les mêmes hauteurs de boutons, espacements et comportements responsive.
- Les CTA des pages Accompagnement utilisent une présentation cohérente et lisible.
- Les boutons existants conservent leurs couleurs et fonctions, mais leurs tailles, alignements, retours à la ligne et états désactivés sont harmonisés.
- Les boutons du formulaire de modification d'équipe (`Choisir`, `Choisir une photo`, `Annuler`, `Enregistrer`) ont une taille minimale suffisante pour empêcher le texte de dépasser.
- Les champs de formulaires ont une hauteur et une typographie homogènes sans modifier leurs événements ou leur logique.
- Les tableaux gagnent une meilleure lisibilité (en-têtes, alignement vertical, densité), sans changer les données ni les composants.
- Amélioration responsive des actions de modales et des pages Accompagnement.

## Fichiers modifiés

- `app/globals.css`
- `app/accompagnement/accompagnement.css`

## Fonctionnalités

Aucune fonction métier, requête Supabase, route API, formulaire ou règle d'accès n'a été modifiée dans ce bloc.
