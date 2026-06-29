# Import final rapide MyBasket

1. Copier tout le contenu de ce dossier à la racine de `mybasket`.
2. Vérifier que `.env.local` contient une vraie clé :
   `SUPABASE_SERVICE_ROLE_KEY=eyJ...`
3. Lancer :

```bash
node scripts/import-exercises-final.mjs
node scripts/check-exercises-supabase.mjs
npm run dev
```

4. Ouvrir : http://localhost:3000/exercices

Le script :
- supprime les anciens exercices ;
- tente l'upload des schémas dans `exercise-schemas` ;
- si l'upload échoue, garde le chemin local `/schemas/...` ;
- insère les 242 exercices en `public / approved`.
