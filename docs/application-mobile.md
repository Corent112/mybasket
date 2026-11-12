# MyBasket sur iOS et Android

L’application aura sa propre interface, avec le même compte MyBasket et les mêmes équipes, matchs et statistiques que le site. Une application Expo / React Native dans un dossier `mobile/` permettra de concevoir les écrans indépendamment de Next.js. Le site reste sur Vercel. Les deux clients partagent les règles métier et l’accès aux données, pas leurs composants d’interface.

| Écran | Téléphone | Tablette |
| --- | --- | --- |
| Accueil | Reprendre le dernier match, accès rapide aux équipes | Matchs récents et raccourcis côte à côte |
| LiveStats | Score, chrono et boutons tactiles ; accès au terrain par onglet | Codage et terrain/joueurs visibles côte à côte en paysage |
| Match | Historique et box-score en onglets | Historique et box-score consultables ensemble |
| Synchronisation | Nombre d’actions en attente et bouton Réessayer | Même état, affiché dans la barre de match |

## Première version : prendre des stats et les retrouver sur le site

1. Authentifier l’utilisateur avec son compte Supabase existant. Charger les équipes et matchs auxquels le compte a accès, puis préparer localement l’effectif et le match. Pour le premier pilote hors ligne, préparer le match une fois en ligne.
2. À chaque saisie, sauvegarder l’action dans SQLite avant de confirmer le clic. Conserver son identifiant stable et une file locale séparée par compte. Afficher « En attente », « Synchronisé » ou « À réessayer ». L’utilisateur ne perd pas sa saisie en fermant l’app.
3. À la reconnexion ou au retour dans l’application, transmettre les opérations dans l’ordre, avec le jeton du compte. Le serveur vérifie l’accès au match, valide l’opération puis confirme seulement après écriture. Un nouvel essai avec le même identifiant ne crée pas de doublon. Si une autre personne modifie la même action, signaler le conflit au lieu d’écraser la correction.
4. Relire les actions confirmées dans le site. Prévoir une actualisation automatique de la consultation, sans remplacer les actions locales non envoyées d’une session de codage ouverte. Garder un seul pilote pour le codage individuel du match pendant le pilote mobile.
5. Tester sur des appareils iOS et Android : couper le réseau, saisir et corriger des actions, fermer l’app, retrouver le réseau puis vérifier le score, les actions et le box-score sur le site. Distribuer ensuite un pilote par TestFlight et le test interne Google Play.

## Point à sécuriser dans l’existant

`lib/stats-supabase.ts` écrit dans `match_stats` et `match_actions`. `persistLiveAction` remplace actuellement une action au moyen d’une suppression puis d’une insertion. Les deux appels ne forment pas une transaction. Avant de connecter l’app aux écritures, vérifier les droits effectifs et auditer les identifiants existants. Prévoir une écriture atomique et idempotente, protégée par une contrainte validée ou par une table d’opérations. Le premier flux mobile doit utiliser cette écriture avant tout essai en production. Aucune clé de service Supabase dans l’app.

Après LiveStats : ajouter progressivement fiches, calendrier, exercices, dessin et Montage. Pour la vidéo, commencer par la lecture ; un fichier qui existe seulement sur un ordinateur ne devient pas accessible sur le téléphone lors de la synchronisation des stats.
