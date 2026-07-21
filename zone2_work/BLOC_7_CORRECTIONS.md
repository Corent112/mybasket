# MyBasket — Bloc 7

## Fiche joueur
- Suppression du faux message « Joueur introuvable » pendant le chargement initial.
- Affichage d'un état de chargement, puis du vrai état introuvable uniquement après la requête.
- Ajout d'un bouton de retour vers l'équipe si le joueur n'existe réellement pas.
- Shot chart personnelle remplacée par le composant officiel utilisé dans LiveStats.
- Points verts/rouges, zones, statistiques et clic sur les tirs conservés.
- L'onglet « Clips » est remplacé par « Montage ».
- L'onglet Montage affiche les montages assignés via la table `montages`.
- Compatibilité maintenue avec les anciens montages présents dans `match_stats.project_state`.

## Historique / boxscores
- Le bouton « Voir la feuille » devient « Boxscore complet ».
- La fenêtre est clairement présentée comme le boxscore complet du match.
- Les données individuelles, collectives et lineups déjà disponibles restent accessibles.

## Graphiques
- Ajout de dimensions minimales aux conteneurs Recharts de la fiche joueur.
- Correction ciblée de l'avertissement width(-1) / height(-1) lors du rendu statique.

## Vérifications
- `npx tsc --noEmit` : validé sans erreur.
- `next build` : démarrage de la compilation sans erreur de code, mais optimisation Turbopack interrompue par la limite d'exécution de l'environnement.

## Installation
Conserver votre `.env.local`, puis :

```bash
npm install
npx tsc --noEmit
npm run build
npm run dev
```
