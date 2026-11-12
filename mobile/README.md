# MyBasket mobile

Première version Expo pour iOS et Android : navigation native, logo du site, menu en tuiles, sous-menus et raccourci personnalisable. La grille passe de trois colonnes sur téléphone à quatre sur tablette. L’application conserve le nom, le pictogramme et la destination du raccourci sur l’appareil.

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

Les tuiles finales ouvrent la page correspondante sur le site MyBasket. L’utilisateur s’y identifie avec son compte MyBasket si nécessaire ; le navigateur applique les droits existants. Il n’y a pas encore de session native partagée, de bibliothèque ou d’éditeur de dessin natifs, ni de saisie LiveStats et de synchronisation depuis l’app. La navigation native et le raccourci local fonctionnent hors connexion ; les pages du site dépendent de leur propre fonctionnement.

Le catalogue est défini dans `navigation.ts`. Pour le prochain lot, intégrer l’authentification et la consultation des équipes/matchs, puis le flux d’écriture LiveStats décrit dans [le plan mobile](../docs/application-mobile.md). L’app n’est pas publiée sur les stores.
