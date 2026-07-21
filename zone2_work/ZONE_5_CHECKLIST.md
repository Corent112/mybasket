# Zone 5 — Espace club

## Statut vérifié dans le code

- [x] Création d’une équipe depuis l’Espace club.
- [x] Le nom libre de l’équipe est supprimé des deux formulaires utilisés dans l’application.
- [x] Le nom est généré automatiquement sous la forme `U15 Équipe 1`.
- [x] Choix Équipe 1 à Équipe 5.
- [x] Catégories d’équipe limitées à U13, U15, U18, U21 et Seniors.
- [x] Affectation d’un coach principal depuis la liste `club_coaches`.
- [x] Affectation facultative d’un assistant.
- [x] Correction du mélange `user_id` / `club_coaches.id` qui pouvait casser la clé coach.
- [x] Erreurs Supabase détaillées dans `CLUB_CORE_SUPABASE_ERROR`.
- [x] Compatibilité avec les anciennes colonnes après migration.
- [x] Dans Créer un créneau, l’entraîneur est choisi dans une vraie liste déroulante des entraîneurs du club.
- [x] Les créneaux restent stockés dans `club_training_slots` sur Supabase.
- [x] Texte des créneaux non écrasé : retour à la ligne, alignement à gauche, hauteur minimale et meilleure lisibilité.
- [x] Politiques RLS ajoutées pour les équipes, coachs et créneaux.
- [x] Index d’unicité club + catégorie + numéro d’équipe.
- [x] `npx tsc --noEmit` sans erreur.

## À valider sur ton Supabase après migration

1. Créer `U15 Équipe 1` et lui affecter un coach.
2. Créer `U15 Équipe 2`.
3. Vérifier que la création d’un deuxième `U15 Équipe 1` est refusée proprement.
4. Modifier le coach principal d’une équipe.
5. Créer un créneau et choisir un entraîneur dans la liste.
6. Vérifier que le texte du créneau reste lisible dans une petite cellule.

## Migration

Exécuter `zone5_club_space.sql` dans Supabase SQL Editor avant les tests.
