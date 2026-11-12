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
npx expo export --platform all
```

## Périmètre actuel

Les tuiles finales ouvrent la page correspondante sur le site MyBasket. L’utilisateur s’y identifie avec son compte MyBasket si nécessaire ; le navigateur applique les droits existants. La connexion native utilise le même compte Supabase ; les sessions native et navigateur sont distinctes. La bibliothèque, le dessin et la saisie LiveStats restent disponibles sur le site. La navigation native et le raccourci local fonctionnent hors connexion ; les pages du site dépendent de leur propre fonctionnement.

Le catalogue est défini dans `navigation.ts`. Pour le prochain lot, étendre la consultation aux équipes et matchs partagés, puis intégrer le flux d’écriture LiveStats décrit dans [le plan mobile](../docs/application-mobile.md). L’app n’est pas publiée sur les stores.

## Connexion et actualisation

Copier `.env.example` dans `.env.local` et renseigner l’URL ainsi que la clé publique (publishable ou anon) du **même projet Supabase** que le site. Redémarrer Expo après modification. Ne jamais utiliser la clé de service. Dans Mon compte, se connecter avec l’adresse et le mot de passe du site. L’app conserve sa propre session dans le stockage sécurisé de l’appareil ; le navigateur conserve la sienne pour les modules qui s’y ouvrent.

L’écran Mon compte affiche les derniers matchs personnels et écoute les changements de la table `match_stats`. Si Realtime n’est pas actif pour cette table, la lecture est renouvelée toutes les 10 secondes lorsque l’app est au premier plan, ainsi qu’à la reconnexion et au retour dans l’app. Aucune migration de production n’est appliquée par cette version. Cette première intégration est en lecture : la saisie de matchs et la synchronisation des autres modules depuis l’app ne sont pas encore intégrées.

La grille adapte ses colonnes à la largeur utile, aux zones de sécurité et à la taille du texte du système. Les tuiles peuvent grandir lorsque les libellés passent sur plusieurs lignes.
