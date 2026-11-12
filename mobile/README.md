# MyBasket mobile

Première version Expo pour iOS et Android : navigation native, logo du site, menu en tuiles, sous-menus et raccourci personnalisable. La grille adapte son nombre de colonnes à la largeur et à la taille du texte. L’application conserve le nom, le pictogramme et la destination du raccourci sur l’appareil.

## Lancer la préversion

Depuis la racine du dépôt :

```sh
cd mobile
npm ci
npm start
```

Ouvrir le projet sur un appareil avec une version d’Expo Go compatible avec le SDK 54, ou utiliser un simulateur iOS / Android compatible. Pour tester la navigation, ouvrir Bibliothèque puis Exercices, Dessin puis Plaquette, et Mon compte puis Management → LiveStats. Dans le menu principal, modifier le raccourci, puis fermer et relancer l’app pour vérifier qu’il est conservé.

```sh
npm run typecheck
npx expo export --platform ios --platform android
```

## Périmètre actuel

Les tuiles de consultation ouvrent les pages du site dans l’app. Le navigateur reste proposé en haut de chaque page. Dessin, Montage, le codage LiveStats et les parcours de paiement s’ouvrent dans le navigateur pour garder le fonctionnement web existant. L’utilisateur s’y identifie avec son compte MyBasket si nécessaire ; le navigateur applique les droits existants. La connexion native utilise le même compte Supabase ; les sessions native et navigateur sont distinctes. La bibliothèque, le dessin et la saisie LiveStats restent disponibles sur le site. La navigation native et le raccourci local fonctionnent hors connexion ; les pages du site dépendent de leur propre fonctionnement.

Le catalogue est défini dans `navigation.ts`. Pour le prochain lot, étendre la consultation aux équipes et matchs partagés, puis intégrer le flux d’écriture LiveStats décrit dans [le plan mobile](../docs/application-mobile.md). L’app n’est pas publiée sur les stores.

## Connexion et actualisation

La préversion utilise par défaut l’URL et la clé publishable publiques déjà utilisées par le site. Aucun réglage Supabase n’est nécessaire pour ce projet. Pour un environnement de test séparé, copier `.env.example` dans `.env.local` puis fournir les deux valeurs publiques correspondantes. Ne jamais utiliser la clé de service. Dans Mon compte, se connecter avec l’adresse et le mot de passe du site. L’app conserve sa propre session dans le stockage sécurisé de l’appareil ; les pages du site conservent leur propre session, dans l’app ou dans le navigateur. Une deuxième connexion peut être demandée lors du premier accès à un module web.

L’écran Mon compte affiche les derniers matchs personnels et écoute les changements de la table `match_stats`. Si Realtime n’est pas actif pour cette table, la lecture est renouvelée toutes les 10 secondes lorsque l’app est au premier plan, ainsi qu’à la reconnexion et au retour dans l’app. Aucune migration de production n’est appliquée par cette version. Cette intégration est en lecture. L’écran natif Mes playbooks affiche les playbooks personnels, leurs saisons et les noms des systèmes. Il écoute les changements Supabase Realtime quand ils sont disponibles et se rafraîchit au retour du réseau, à la reprise de l’app et toutes les 10 secondes au premier plan. Après un premier chargement, ces listes restent consultables hors ligne. L’ouverture des schémas et la modification utilisent le site.

La grille adapte ses colonnes à la largeur utile, aux zones de sécurité et à la taille du texte du système. Les tuiles peuvent grandir lorsque les libellés passent sur plusieurs lignes.

La dernière liste des matchs personnels chargée reste lisible hors ligne après une première connexion. Le cache est séparé par compte et affiché uniquement lorsque la session de ce compte est restaurée. Le premier accès et la première récupération nécessitent Internet. Le cache ne contient ni actions ni vidéos.


## Préparer les versions de test et les stores

1. Préparer les comptes [Expo](https://expo.dev/), [Apple Developer](https://developer.apple.com/programs/) et [Google Play Console](https://play.google.com/console). Vérifier la disponibilité de l’identifiant `fr.mybasket.app` sur les deux stores avant de l’enregistrer.
2. Dans `mobile/`, lancer `npm ci`, puis rattacher le projet au compte Expo. La configuration iOS de production utilise Xcode 26. Vérifier la cible Android 36 sur le premier build.

   ```sh
   npx eas-cli@latest login
   npx eas-cli@latest init
   npx eas-cli@latest build --platform all --profile production
   ```

3. Sur iOS, créer la fiche dans App Store Connect, puis lancer `npx eas-cli@latest submit --platform ios --latest` et installer le build via TestFlight. Sur Android, créer la fiche Google Play Console et importer le fichier AAB en test interne. Les nouveaux comptes personnels Google Play concernés passent ensuite par un test fermé avec au moins 12 testeurs inscrits pendant 14 jours consécutifs.
4. Tester sur téléphone et tablette avec un compte de test. Vérifier la connexion, l’actualisation d’un nom de système modifié sur le site, la consultation des playbooks en mode avion, le comportement à la reconnexion et les droits Club et Institution. Les modules ouverts sur le web utilisent une session web distincte.
5. Avant la soumission publique, compléter les captures, la description, la fiche de confidentialité et le parcours de suppression de compte. Fournir un compte de démonstration pour la revue. Vérifier les liens d’achat numérique et l’usage des modules web au regard des règles des stores. Dans App Store Connect, sélectionner le build validé et envoyer en revue. Dans Play Console, promouvoir le build validé vers Production.

## Accès Club et Institution

Le bouton de demande préremplit le formulaire de contact. Le site envoie la demande à `MYBASKET_ADMIN_EMAIL` ou, par défaut, à `contact@mybasket.fr` via `RESEND_API_KEY` et `RESEND_FROM`.

Pour traiter la demande, ouvrir **Admin → Paiements → Offrir un accès gratuit**, renseigner l’adresse du compte MyBasket, choisir Institution ou la formule Club, puis saisir la durée. Le bénéficiaire pourra créer sa structure depuis l’espace correspondant. Le parcours existant d’invitation permet ensuite d’ajouter les membres. Une demande seule n’active aucun droit.


## Installer mybasket.fr par lien

La page `/installer` du site permet d’ajouter mybasket.fr à l’écran d’accueil sur iPhone, iPad et Android. La version web installée ouvre le site et ses fonctionnalités. Elle suit les mises à jour de Vercel et dépend du réseau pour les fonctionnalités en ligne.

Pour partager la préversion native sur Android, depuis `mobile/` et après `npx eas-cli@latest init`, lancer `npx eas-cli@latest build --platform android --profile preview`, puis copier le lien d’installation de l’APK dans le tableau de bord Expo. Sur iOS, utiliser TestFlight pour partager un lien de test ou une distribution interne EAS avec les appareils enregistrés.

Avant de mettre en ligne le formulaire et le slider, appliquer la migration Supabase `20261112200000_contact_requests_and_slider.sql`. Les demandes sont consultables dans **Administration → Demandes de contact**. Elles y sont enregistrées même si Resend est temporairement indisponible.
