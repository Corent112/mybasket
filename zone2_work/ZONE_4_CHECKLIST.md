# ZONE 4 — ANNONCES & PROFILS COACHS

## Statut vérifié dans le code

### Profil coach individuel
- [x] Publication dans `coach_profiles` via `upsert` sur `user_id`.
- [x] Erreurs Supabase détaillées (`message`, `details`, `hint`, `code`).
- [x] RLS ajoutées pour lecture/écriture du propriétaire.
- [x] Profil complet stocké dans `profile_data` JSONB.
- [x] Photo, couverture, galerie et vidéo stockées dans Supabase Storage (`annonces-media`).
- [x] Instagram et vidéo conservés dans des colonnes dédiées.
- [x] Statut initial `pending` pour validation CEO.

### Formulaire coach
- [x] « À propos de moi — valeurs » en texte libre et affichage en paragraphes, sans puces imposées.
- [x] Disponibilités alignées en trois colonnes : jour, début, fin.
- [x] Étapes « Déroulement » et « Propose » absentes du wizard.
- [x] Sections publiques correspondantes supprimées.
- [x] Lien Instagram cliquable.
- [x] Vidéo possible par lien YouTube/Vimeo ou téléversement.

### Camp / Stage
- [x] « Valeurs du stage » en grand champ texte, sans bouton Ajouter.
- [x] Grand champ « Journée type / programme de la semaine ».
- [x] Champ « Coachs présents » ajouté et affiché sur la fiche publique.
- [x] Rubrique « Atouts » absente.
- [x] Vidéo par lien ou téléversement dans Supabase Storage.
- [x] Photos et documents joints stockés dans Supabase Storage.

### Référentiels
- [x] Niveaux : Départemental, Régional, National.
- [x] Catégories : U13, U15, U18, U21, Seniors.
- [x] Type d’annonce « Autre » absent.
- [x] Mappage base de données corrigé pour les quatre types d’annonces actuels.

### Dashboard CEO
- [x] Annonces enregistrées dans `announcements`, la même table que le dashboard CEO.
- [x] Statut `pending` visible pour validation.
- [x] Actions validation, refus, archivage, mise en avant et suppression déjà présentes dans `/admin/annonces`.
- [x] Profils coach en attente visibles dans `/admin/coachs` et activables par le CEO.

## Validation technique
- [x] `npx tsc --noEmit` passe sans erreur.
- [ ] Test réel des politiques RLS après exécution de `zone4_annonces_coachs.sql` sur ton projet Supabase.
- [ ] Test d’upload vidéo volumineuse selon la connexion et les limites du projet Supabase.
