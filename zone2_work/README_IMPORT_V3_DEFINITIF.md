# Import exercices MyBasket V3 définitif

Ce pack est compatible avec ta structure réelle Supabase :

- `deroulement`, `consignes`, `variantes` = `text`
- `schema_images`, `schema_data_list` = `jsonb`
- `themes`, `equipment`, `materiel`, `tags` = `text[]`

## Méthode recommandée : SQL direct fiable

1. Copie tout le contenu du pack à la racine de `mybasket/`.
2. Dans Supabase SQL Editor, lance :
   - `00_SETUP_SUPABASE_EXERCISES.sql`
   - puis `01_IMPORT_EXERCISES_SQL_COMPATIBLE.sql`
3. Le résultat doit afficher `total_exercises = 242`.
4. Dans le terminal :
   ```bash
   node scripts/upload-exercise-schemas.mjs
   ```
   Si tu n'as pas ce script, lance plutôt :
   ```bash
   node scripts/import-exercises-beta-v1.mjs
   ```
   Ce script upload aussi les schémas et réimporte les lignes.

## Vérification

```bash
node scripts/check-exercises-supabase.mjs
npm run dev
```

Puis ouvre :

http://localhost:3000/exercices

## Important

Si Supabase SQL Editor donne une erreur de type, c'est que tu n'as pas lancé le fichier V3 `01_IMPORT_EXERCISES_SQL_COMPATIBLE.sql`. Les anciens fichiers utilisaient `schema_images` en `text[]`, ce qui ne correspond pas à ta base.
