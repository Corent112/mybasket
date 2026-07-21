# Zone 1 — Séances et calendrier

## Corrigé dans le code

1. **Bibliothèque de séances avec séances modèles publiques**
   - La page `/seances` charge uniquement les séances publiques.
   - Ajout des filtres Catégorie, Niveau, Thème et Durée maximale.
   - Catégories : U13, U15, U18, U21, Seniors.

2. **Formulaire CEO pour créer et publier une séance modèle**
   - Ajouté dans `/admin/seances`.
   - Publication immédiate dans la bibliothèque avec `visibility=public` et `status=published`.

3. **Filtres proches de ceux des exercices**
   - Catégorie, niveau, thème, durée, nombre de joueurs et matériel.

4. **Séances utilisateurs sans validation CEO**
   - Les séances utilisateurs restent `private` et ne figurent pas dans la modération CEO.

5. **Séance → événement calendrier**
   - La création d’une séance insère automatiquement un événement `training` dans `calendar_events`.

6. **PDF automatique de la séance**
   - Après création, l’API `/api/seances/[id]/pdf` est appelée automatiquement.
   - Le PDF est téléversé, lié à la séance et ajouté à l’événement calendrier.
   - La route PDF lit maintenant la table réellement utilisée par la création : `practice_session_attendance`.

7. **Consultation depuis l’œil**
   - Le calendrier propose `👁 Fiche PDF`, qui ouvre `/seances/apercu/[id]`.
   - Le lien direct vers le PDF reste disponible lorsqu’il existe.

8. **Match LiveStats → calendrier**
   - `ensureLiveMatch` crée également un événement calendrier avec `match_id` et `team_id`.

9. **Accès au résumé du match depuis le calendrier**
   - Ajout d’un bouton `Boxscore complet` vers la fiche équipe avec l’identifiant du match.

10. **Game Plan → calendrier + PDF**
   - Cette liaison existait déjà dans la base reçue (`lib/game-plans.ts` et migration bloc 8) et a été conservée.

## À valider sur ton Supabase

- Exécuter `zone1_sessions_calendar.sql`.
- Vérifier que le bucket `user-documents` accepte `application/pdf`.
- Créer une séance utilisateur et vérifier : séance, événement, PDF et bouton œil.
- Démarrer un match LiveStats et vérifier l’événement puis le bouton Boxscore complet.
- Vérifier que les règles RLS permettent au CEO d’insérer les modèles publics.

## Limite encore identifiée

La création manuelle d’un simple événement « entraînement » depuis le formulaire du calendrier ne peut pas automatiquement alimenter une fiche équipe tant qu’aucune équipe n’est choisie dans ce formulaire. Les séances créées depuis le constructeur, elles, possèdent bien un `team_id`. Ce formulaire manuel sera traité dans la zone Espace club/Équipes afin d’éviter de mélanger deux flux différents.

## Vérifications techniques

```bash
npx tsc --noEmit
```

Résultat : aucune erreur TypeScript.

Le build Next.js démarre sans erreur et dépasse la durée d’exécution disponible pendant l’optimisation Turbopack.
