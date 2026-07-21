# Import MyBasket - Cahier d'exercices T1

Ce pack a été généré à partir du PDF `cahier exo T1 VF(1).pdf`.
Il contient une fiche MyBasket par exercice détecté et un schéma PNG associé à chaque fiche.

## Contenu

- `exercises_import.json` : 242 fiches exercices structurées.
- `schemas/` : schémas PNG extraits/croppés depuis le PDF.
- `scripts/import-exercises-beta-v1.mjs` : script Node pour uploader les schémas dans Supabase Storage puis insérer les fiches dans `public.exercises`.
- `01_backup_and_clear_exercises_systems.sql` : sauvegarde puis suppression des anciens exercices et systèmes.
- `exercises_import_preview.csv` : aperçu rapide pour contrôle.

## Répartition

- Échauffement: 71
- Pré-collectif: 49
- Passe: 11
- Dribble: 12
- Défense: 18
- Tir: 45
- Jeu rapide: 20
- Physique: 16

## Installation dans ton projet

1. Dézippe ce pack à la racine de ton projet `mybasket/`.

Tu dois obtenir :

```txt
mybasket/
  exercises_import.json
  schemas/
  scripts/import-exercises-beta-v1.mjs
  01_backup_and_clear_exercises_systems.sql
```

2. Dans Supabase SQL Editor, lance `01_backup_and_clear_exercises_systems.sql`.

3. Ajoute dans `.env.local` si tu l'as :

```env
SUPABASE_SERVICE_ROLE_KEY=ta_cle_service_role_supabase
EXERCISE_SCHEMA_BUCKET=exercise-schemas
```

La clé service role est recommandée pour insérer et uploader sans être bloqué par les RLS.
Ne la mets jamais côté client et ne la commit jamais sur GitHub.

4. Lance l'import :

```bash
node scripts/import-exercises-beta-v1.mjs
```

5. Vérifie ensuite :

```bash
npm run build
npm run dev
```

Puis ouvre :

```txt
http://localhost:3000/exercices
```

## Notes importantes

- Les systèmes actuels sont vidés par le SQL pour repartir proprement.
- Ce cahier contient principalement des exercices, pas des systèmes offensifs structurés.
- Chaque fiche contient : titre, thème, catégorie, niveau, durée, organisation, déroulement, consignes, variantes, tags et schéma.
- Le script est robuste : si certaines colonnes n'existent pas dans ta table `exercises`, il les ignore automatiquement et continue l'import.
