# Outils coach reliés — novembre 2026

## Accès

- `/mon-compte?tab=messagerie` : démarrer une conversation individuelle avec un membre du staff actif ou un joueur relié à son compte personnel. L’utilisateur doit posséder l’équipe ou en être membre actif ; la liste des joueurs exige les droits de gestion des joueurs. Un joueur sans compte relié est identifié comme tel. Le destinataire retrouve la conversation dans sa messagerie et peut répondre.
- `/assistant` : chat coach authentifié et historique privé, basé sur les services IA existants. Nécessite `OPENAI_API_KEY` et les tables IA existantes.
- Dessin, import photo : option « Compléter la lecture par l’IA ». Le résultat local reste conservé si l’IA échoue. Les propositions ajoutées restent à vérifier avant import. Cette assistance ne garantit pas une reconnaissance exhaustive et ne remplace pas la lecture locale.
- `/application` : accueil adaptatif et installation web sur téléphone/tablette. Sur Safari iOS/iPadOS : Partager, Sur l’écran d’accueil. Ce livrable est une PWA ; il ne constitue pas une application native publiée sur les stores. Le service worker ne met en cache que la page publique hors connexion, jamais les messages ou les réponses API. Pas de promesse d’utilisation complète hors ligne.

## Montage

« Ajouter au montage » insère le clip reçu dans la timeline et conserve sa référence dans les clips reçus. La destination explicite `library` reste disponible sans insertion. Les bornes vidéo éditées restent absolues et les statistiques sources ne sont pas modifiées.

Un fichier vidéo déjà sélectionné peut être réutilisé entre onglets de la même origine et du même compte, sans téléversement. Les fichiers ne sont pas automatiquement transférés entre appareils. La déconnexion ou le changement de compte nettoie les références vidéo de session.

Une copie locale IndexedDB est écrite après 450 ms d’inactivité et isolée par compte, équipe et montage. À la réouverture, un choix explicite permet de récupérer une version non synchronisée. Une sauvegarde en ligne ne supprime pas une copie locale plus récente. Les exports restent ceux de l’éditeur existant.

La sauvegarde partagée utilise toujours `save_montage_timeline_atomic` (migration `20261006143000_atomic_montage_save.sql`). Si le RPC manque ou rejette la sauvegarde, une copie locale ne doit pas être présentée comme une synchronisation réussie. Aucun repli vers une sauvegarde SQL non atomique.

## Vérification

- `node scripts/test-montage-foundations.cjs`
- `node scripts/test-montage-transaction.cjs` (dépendance de test externe : `@electric-sql/pglite`)
- `node scripts/test-montage-inbox-ui.cjs` (dépendance de test externe : `jsdom`)
- `node scripts/test-montage-title-export.cjs`
- `node scripts/test-coach-workflows.cjs` (dépendance de test externe : `fake-indexeddb`)
- `node scripts/test-local-video-bridge.cjs`

Les tests utilisent des comptes et données fictifs. Aucun message réel n’est envoyé. Les appels OpenAI et les appareils physiques iOS/Android restent à vérifier avec la configuration de production.
