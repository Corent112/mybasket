# Zone 8 — Dashboard CEO / Admin

## Statut vérifié dans le code

### Utilisateurs
- [x] Le dashboard utilise les comptes Supabase Auth lorsque `SUPABASE_SERVICE_ROLE_KEY` est configurée.
- [x] Repli automatique sur `profiles` lorsque la clé service n'est pas disponible.
- [x] Migration de rattrapage : tous les comptes Auth existants sont insérés dans `profiles`.
- [x] Trigger : les futurs comptes créent ou mettent à jour automatiquement leur profil.
- [x] Le CEO conserve son rôle et son accès total indépendant d'un abonnement (Zone 3).

### Modération des contenus
- [x] Les exercices soumis apparaissent dans `/admin/exercices`.
- [x] Les systèmes soumis apparaissent dans `/admin/systemes`.
- [x] Les annonces utilisent `announcements`, la même table que le formulaire public.
- [x] Validation, refus et suppression restent disponibles dans les pages de modération.
- [x] Les séances modèles publiques sont administrées dans `/admin/seances` par un CEO/Superadmin.
- [x] Les séances privées des utilisateurs ne sont pas transformées en séances modèles CEO.

### Demandes
- [x] Route `/api/accompagnement` présente et reliée à Supabase.
- [x] Formation et mentorat alimentent `formation_requests`.
- [x] Accompagnement et direction technique alimentent `accompagnement_requests`.
- [x] Scouting/vidéo disposent d'une page CEO dédiée `/admin/scouting-video`.
- [x] Statut, note interne, traitement et archivage disponibles pour le scouting.

### Navigation CEO
- [x] Onglet LiveStat retiré du menu Dashboard CEO.
- [x] Onglet Tags retiré du menu Dashboard CEO.
- [x] Onglet Filtres retiré du menu Dashboard CEO.
- [x] Onglet Scouting vidéo ajouté.
- [x] Le compteur des tâches inclut le scouting vidéo.

### Slider accueil
- [x] Création d'une slide.
- [x] Modification d'une slide.
- [x] Téléversement d'une image dans Supabase Storage.
- [x] Possibilité de conserver une URL d'image externe.
- [x] Titre, sous-titre, texte du bouton et lien de destination.
- [x] Ordre d'affichage.
- [x] Publication / dépublication.
- [x] Suppression.
- [x] La page d'accueil lit réellement les slides actives de `admin_slider`.
- [x] Les slides locales d'origine restent utilisées comme secours si aucune slide n'est publiée.

## Validation technique
- [x] `tsc --noEmit` passe avec les dépendances du projet.

## À valider sur ton environnement Supabase
- [ ] Exécuter `zone8_dashboard_ceo.sql`.
- [ ] Ajouter `SUPABASE_SERVICE_ROLE_KEY` à `.env.local` pour lire directement la liste Auth.
- [ ] Créer un compte test et confirmer son apparition immédiate dans Utilisateurs.
- [ ] Envoyer une demande Formation, Accompagnement et Scouting depuis les trois formulaires.
- [ ] Créer une slide avec une image, la publier et vérifier l'accueil.
