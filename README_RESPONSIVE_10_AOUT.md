# MyBasket — adaptation tablette et smartphone

Cette archive reprend **Archive(8).zip**, puis applique les corrections globales du 10 août et l'adaptation responsive.

## Responsive ajouté

- Header desktop conservé.
- À partir de 980 px : navigation compacte avec menu latéral tactile.
- Fermeture du menu par bouton, clic hors menu ou touche `Échap`.
- Blocage du scroll de la page pendant l'ouverture du menu mobile.
- Barre panier/favoris adaptée aux petits écrans.
- `viewport` explicite `device-width` + `viewport-fit: cover`.
- Images, SVG, vidéos, canvas et iframes limités à la largeur disponible.
- Formulaires tactiles : champs à 16 px pour éviter le zoom automatique iOS.
- Modales limitées à la hauteur visible (`100dvh`) et scrollables.
- Boutons de modales toujours accessibles, y compris en paysage smartphone.
- Grilles commerciales : 2 colonnes tablette, 1 colonne smartphone.
- Tables et modules d'analyse : défilement horizontal tactile plutôt que contenu coupé.
- Page **Mon compte** : menu horizontal scrollable sur tablette/mobile, profil compact, cartes équipes et actions adaptées.
- Logo du club dans Mon compte : `object-fit: contain` pour conserver le logo entier.
- LiveStatsPro : conteneur conservé complet et accessible au pan horizontal sur petits écrans afin de ne pas supprimer de fonctionnalités.
- Recharts contraint à la largeur du parent.

## Corrections précédentes incluses

Les fichiers du pack `MyBasket_CORRECTIONS_GLOBALES_10_AOUT.zip` ont été appliqués dans cette base avant le responsive.

## Fichiers projet ajoutés

Les fichiers fournis `package-lock.json` et `tsconfig.json` sont inclus. Un `package.json` cohérent avec le lockfile a été recréé pour permettre les commandes npm.

## Vérification effectuée ici

- Analyse syntaxique TypeScript/TSX : OK sur les fichiers `.ts/.tsx` (hors fichier déclaratif `next-env.d.ts`).
- `npm ci` n'a pas pu être terminé dans l'environnement de génération car le miroir npm interne ne contient pas `zod-validation-error@4.0.2`. Ce blocage vient du registre de cet environnement, pas du code MyBasket.

## À lancer sur ton Mac

```bash
npm ci
npx tsc --noEmit
npm run build
```

Puis, si tout passe :

```bash
git add .
git commit -m "Corrige le site et ajoute le responsive tablette mobile"
git push origin main
```

## Important

Le responsive est conçu pour ne pas retirer les fonctionnalités desktop. Les interfaces très riches comme LiveStatsPro restent complètes sur smartphone : elles utilisent le défilement/pan tactile plutôt qu'une version amputée.
