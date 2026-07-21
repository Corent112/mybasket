# Correctifs prioritaires intégrés

- Header : appels Supabase protégés contre `Load failed`, sans modifier le design.
- PDF : les fiches séance et pièces jointes ne dépendent plus de `window.open` / popups.
- Supabase : migration consolidée dans `supabase/migrations/20260716_myBasket_consolidated.sql`.
- Limites : `max_coaches` et `max_players` sont lus et appliqués comme les autres limites.
- Anciennes routes Admin : `/admin/livestat`, `/admin/tags`, `/admin/filtres` redirigent vers `/admin`.
- Stockage local métier : profil retiré de localStorage ; les anciens états persistants sont copiés dans `user_app_state`. Les clés locales encore lues par d’anciens composants sont conservées comme cache de compatibilité, tandis que Supabase reçoit désormais une copie durable. Les clés strictement transitoires servent uniquement au passage plaquette ↔ formulaire.
- Projet : package.json, package-lock.json, tsconfig et configs racine reconstitués.

## Après décompression
1. Conserver `.env.local`.
2. Exécuter la migration consolidée.
3. `npm install`
4. `rm -rf .next`
5. `npx tsc --noEmit`
6. `npm run build`
