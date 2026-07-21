# Zone 6 — Joueurs & Management

## Vérifié dans le code

- [x] L'état de chargement s'affiche avant « Joueur introuvable ».
- [x] La fiche joueur utilise le composant ShotChart du module LiveStats.
- [x] L'onglet principal « Montage » affiche les montages assignés depuis Supabase.
- [x] Les bilans existants sont rechargeables et modifiables.
- [x] L'export PDF du bilan ne dépend plus de `window.open` ni de l'autorisation des popups.
- [x] Les documents joueur acceptent PDF, JPEG, PNG, WEBP et DOCX.
- [x] Les fichiers sont envoyés dans le bucket Supabase `player-documents`.
- [x] Le tableau Stats joueurs est plus lisible, avec en-tête et première colonne fixes.
- [x] Le haut de Stats jeu est harmonisé avec un bandeau MyBasket.
- [x] Les lineups ont une première colonne fixe et les noms peuvent revenir à la ligne.
- [x] L'historique propose les onglets Boxscore individuel, analyse collective et lineups.

## Validation technique

- [x] `npx tsc --noEmit` passe sans erreur avec les dépendances du projet.

## À tester sur ton Supabase

- [ ] Exécuter `zone6_players_management.sql`.
- [ ] Envoyer puis ouvrir un fichier de chaque format autorisé.
- [ ] Générer le PDF d'un bilan dans Safari et Chrome.
- [ ] Ouvrir un match contenant des lineups et vérifier le tableau complet.
