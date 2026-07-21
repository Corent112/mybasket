# Import systèmes MyBasket

Ce pack importe les systèmes extraits de `Répertoire Systèmes.pdf`.

## Contenu

- `systems_import.json` : systèmes pré-remplis.
- `systemes_schemas/` : images des pages utilisées comme schémas.
- `scripts/import-systems-final.mjs` : import Supabase + upload Storage.
- `scripts/check-systems-supabase.mjs` : vérification.

## Commandes

Copie tout le contenu du pack à la racine de `mybasket`, puis lance :

```bash
node scripts/import-systems-final.mjs
node scripts/check-systems-supabase.mjs
npm run dev
```

Puis ouvre :

```txt
http://localhost:3000/systemes
```

## Notes

- `status = published`
- `review_status = pending`
- Les champs manquants pourront être complétés fiche par fiche dans l'admin.
- Les schémas sont uploadés dans le bucket `system-schemas`.
