# Bloc 8 — Management, Game Plan, calendrier et scouting

## Corrections
- Le bouton d’ajout du Game Plan au calendrier génère désormais le PDF du Game Plan.
- Le PDF est associé à l’événement via `attachment_url` et devient consultable depuis Mon Calendrier.
- Synchronisation de l’événement dans Supabase, avec conservation locale en secours.
- Retour de la plaquette forcé vers l’onglet Scouting du Game Plan après insertion d’un système adverse.
- Retrait de la mention ATO dans l’export scouting.
- Mise en page calendrier Management modernisée.
- Tableau Présence admin harmonisé : colonne joueur lisible, initiales, poste et colonne fixe.

## Installation
1. Conserver `.env.local`.
2. Remplacer le projet par le contenu du ZIP.
3. Exécuter `supabase_bloc_8.sql` dans Supabase.
4. Lancer `npm install`, `npx tsc --noEmit`, puis `npm run build`.
