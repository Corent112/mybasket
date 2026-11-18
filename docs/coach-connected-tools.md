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

## Destinataires multiples et groupes

La sélection de plusieurs destinataires en mode « Message privé » crée un fil séparé pour chacun, en une seule insertion SQL. Les réponses ne sont jamais partagées entre ces fils. Le mode « Créer un groupe » crée un seul fil partagé ; le nom et les membres sont conservés dans `teams.metadata.messagingGroups`, avec mise à jour conditionnelle sur `updated_at`. Les messages restent dans les tables de conversations existantes. Chaque lecture et réponse du groupe vérifie son registre de membres, y compris pour le destinataire initial du fil. Une création de groupe incomplète est annulée et ne déclenche pas de notification. Les anciens paramètres de l’équipe sont préservés. Un joueur peut recevoir et répondre sans être membre du staff.

## Notifications sur l’application web installée

Le bouton de Messagerie demande la permission à la suite d’un clic. L’abonnement Web Push est lié au compte et à cet appareil ; ce n’est pas une inscription automatique de tous les utilisateurs. Les notifications affichent un avis générique et ouvrent la bonne conversation. Elles sont distribuées après la sauvegarde du message et n’en ralentissent pas la réponse HTTP. Une notification non distribuée ne signifie pas que le message a échoué.

Le service utilise `web-push`, un bucket Supabase privé `message-push-private` (créé à la première activation) et des objets chiffrés AES-GCM. La paire VAPID est générée une fois puis réutilisée. La clé de chiffrement est dérivée de `MESSAGE_PUSH_STORAGE_KEY`, ou à défaut de `SUPABASE_SERVICE_ROLE_KEY`. Si ce dernier secret doit être renouvelé, prévoir une clé de stockage stable avant activation ; des abonnements chiffrés avec l’ancien secret ne peuvent pas être relus sans ce secret. Aucun secret VAPID ni abonnement d’un autre compte n’est envoyé au navigateur.

Un endpoint d’appareil n’a qu’un propriétaire canonique. Le service worker conserve uniquement l’identifiant du compte actif dans IndexedDB et refuse les notifications d’un autre compte, notamment après déconnexion. Seuls les endpoints HTTPS des services Apple, Google, Mozilla et Microsoft sont acceptés ; aucune destination arbitraire n’est appelée. Les abonnements expirés sont retirés. L’envoi Web Push est limité en durée et en parallélisme, sans promesse de livraison garantie ou d’accusé de lecture.

Sur iOS/iPadOS, utiliser une version compatible Web Push (16.4+) et ouvrir MyBasket depuis l’écran d’accueil. Une future application native devra utiliser son propre enregistrement APNs/FCM ; ce code ne constitue pas une publication native sur les stores. Le fonctionnement sur appareil physique et l’autorisation réelle de notification doivent être vérifiés sur cet appareil. Aucun push réel n’a été envoyé pendant les tests.

## Import revu

L’accueil d’import privilégie la sélection des photos ; les détails techniques sont repliés. La vérification met le terrain, la liste des actions et l’élément sélectionné au premier plan. Le type d’action se modifie par sélection directe ou double-clic sur le corps du trait. Passer de déplacement à dribble crée le zigzag le long du trajet sans déplacer les extrémités ni changer le joueur associé. Une action non confirmée ou non liée à un joueur bloque la validation, au lieu d’être supprimée silencieusement ; les alternatives de passe non choisies ne bloquent pas les déplacements.

Tests supplémentaires : `test-team-messaging.cjs`, `test-message-push.cjs` (fake-indexeddb), `test-import-action-editing.cjs` (jsdom).
