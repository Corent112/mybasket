# Installation finale

1. Décompresser le projet.
2. Conserver votre `.env.local` actuel.
3. Dans Supabase SQL Editor, exécuter :
   `supabase/migrations/20260716_myBasket_consolidated.sql`
4. Dans le terminal :

```bash
npm install
rm -rf .next
npx tsc --noEmit
npm run build
npm run dev
```

## Correctifs intégrés

- appels Supabase du header protégés contre `Load failed`, sans changer sa présentation ;
- PDF et pièces jointes de séance ouverts/téléchargés sans popup JavaScript ;
- migration Supabase unique et consolidée ;
- limites `max_coaches` et `max_players` ajoutées et contrôlées ;
- routes `/admin/livestat`, `/admin/tags`, `/admin/filtres` redirigées vers `/admin` ;
- profil utilisateur retiré du localStorage ;
- anciens états métier copiés dans `user_app_state` pour migration vers Supabase ;
- fichiers npm et TypeScript replacés à la racine du projet.

## LocalStorage restant

Les clés encore utilisées concernent principalement :
- le passage temporaire d’un dessin entre la Plaquette et un formulaire ;
- le dernier onglet sélectionné ;
- un cache de compatibilité pendant la migration progressive.

Les données principales (profils, équipes, joueurs, séances, playbooks, calendriers,
Game Plans, scouting, commandes et abonnements) restent stockées dans Supabase.
