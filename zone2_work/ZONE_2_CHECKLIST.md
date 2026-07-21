# MYBASKET — ZONE 2 : PLAYBOOKS

## Vérification point par point

### 1. ATO supprimé des playbooks
**Statut : validé dans le code.**

- Aucun onglet ATO dans la fiche Playbook.
- Aucun compteur ATO.
- Aucun champ ATO dans l'export PDF Playbook.
- Les catégories internes d'un système du Playbook restent : Demi-terrain, SLOB et BLOB.

> Les références ATO encore présentes dans le module Scouting ne concernent pas les Playbooks et seront traitées dans la zone Scouting.

### 2. Catégories de création
**Statut : validé dans le code.**

Les seules catégories proposées lors de la création sont :

- U13
- U15
- U18
- U21
- Seniors

### 3. Formulaire de création
**Statut : validé dans le code.**

Le formulaire conserve uniquement :

- Nom du playbook
- Catégorie
- Saison

### 4. Erreur `Load failed`
**Statut : corrigé dans le code.**

- Les erreurs réseau Supabase sont transformées en message compréhensible.
- Les erreurs brutes `{}` ne sont plus affichées à l'utilisateur.
- La vérification de session essaie d'abord la session locale, puis l'utilisateur Supabase.

La disponibilité réelle de Supabase reste à confirmer lors du test local.

### 5. Faux message `Non connecté`
**Statut : corrigé dans le code.**

La création n'utilise plus une seule méthode d'authentification fragile. Une session encore valide est récupérée avant de demander une reconnexion.

### 6. Création et ouverture de la page
**Statut : corrigé dans le code.**

Après création, la navigation ouvre maintenant systématiquement :

`/mon-compte/playbooks/[id]`

Corrections apportées :

- suppression de la navigation vers l'ancienne route `?id=` ;
- correction de la route erronée au singulier `/playbook/[id]` ;
- ajout d'une route de compatibilité pour les anciens favoris/liens ;
- navigation sans rechargement complet depuis la bibliothèque Systèmes.

### 7. Base Supabase et RLS
**Statut : migration fournie.**

Le fichier `zone2_playbooks.sql` :

- crée ou complète `playbooks` ;
- crée ou complète `playbook_systems` ;
- ajoute les index ;
- active les politiques RLS par propriétaire ;
- normalise les catégories U13 à Seniors.

## Vérifications techniques

- `npx tsc --noEmit` : **réussi sans erreur**.
- Le build Next.js n'a pas été validé dans l'environnement de génération, car Turbopack refuse le lien symbolique temporaire utilisé vers `node_modules`. Ce problème ne concerne pas le code livré : le lien est supprimé du ZIP.

## Tests à effectuer localement

1. Exécuter `zone2_playbooks.sql` dans Supabase.
2. Se connecter à MyBasket.
3. Ouvrir Mon compte → Mes Playbooks.
4. Créer un playbook U13, U15, U18, U21 puis Seniors.
5. Vérifier l'ouverture immédiate de sa fiche.
6. Ajouter un système depuis la bibliothèque Systèmes.
7. Fermer puis rouvrir la fiche.
8. Modifier son nom puis le supprimer.
