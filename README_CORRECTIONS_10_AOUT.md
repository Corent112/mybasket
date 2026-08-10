# MyBasket — Correctifs du 10 août 2026

## 1. Ajout d'un joueur à une équipe — CORRIGÉ
Cause réelle : la regex UUID utilisée dans MyBasket était incorrecte.
Elle rejetait un UUID Supabase valide comme :
`a6f53244-af60-4c94-8ac0-c0db99e6ac29`.

Regex corrigée dans :
- lib/equipes-store.ts
- app/panier/page.tsx
- app/equipes/[teamId]/page.tsx
- lib/systems.ts

Le payload joueur reste aligné sur le schéma Supabase réel :
position_primary, position_secondary, birth_date, licence, tuteurs, etc.

## 2. PDF fiche séance — logo club
Le générateur cherche désormais le logo :
- dans la séance ;
- dans l'équipe ;
- dans metadata de l'équipe ;
- dans le club ;
- en dernier recours dans profiles.club_logo_url du créateur.

## 3. Accompagnement — emails CEO
Direction technique, Formation et Scouting vidéo : chaque demande :
- reste enregistrée en base ;
- envoie une copie au mail administrateur ;
- crée une conversation dans la messagerie interne CEO si la migration SQL a été appliquée.

Email par défaut : `contact@asket.fr`
Peut être surchargé par :
`MYBASKET_ADMIN_EMAIL=...`

## 4. Dépôt d'annonce
- ajout du niveau `Tous niveaux` ;
- notification email CEO après dépôt ;
- création d'une conversation CEO dans la messagerie interne ;
- popup de consultation rendue scrollable ;
- Administration > Annonces > Voir ouvre maintenant une vraie fiche admin avec toutes les données, y compris payload_data.

## 5. Abonnements / Boutique / commandes
Après un paiement confirmé Stripe ou PayPal :
- le client reçoit un email détaillé de facture ;
- le CEO reçoit un bon de commande ;
- les achats d'abonnement déclenchent donc aussi l'email CEO ;
- les deux routes webhook Stripe présentes dans le projet sont couvertes ;
- PayPal est couvert.

Pré-requis email :
- RESEND_API_KEY
- RESEND_FROM (recommandé, domaine vérifié chez Resend)
- MYBASKET_ADMIN_EMAIL=contact@asket.fr (optionnel car valeur par défaut intégrée)

## 6. Mon compte
- Logo du club : object-fit contain + fond blanc, il reste entièrement visible dans le carré.
- Mon abonnement : la carte/visuel est de nouveau placée à droite des informations.
- Messagerie CEO : fusion avec les conversations plateforme créées par les demandes d'accompagnement et les annonces.

## 7. Suppression d'équipe
La suppression reste irréversible et nettoie les principales données liées au team_id :
match_actions, match_player_stats, match_stats, team_matches, LiveStats tags,
game plans, practice sessions, calendar events et players avant suppression de l'équipe.

## 8. Slider accueil
L'administration existante est conservée et reste reliée au slider de la page d'accueil.
Le libellé CEO précise qu'il s'agit du slider affiché sous le bandeau noir.

---

# À FAIRE UNE SEULE FOIS DANS SUPABASE
Exécuter : `SUPABASE_PLATFORM_MESSAGING.sql`
Cela crée les conversations et réponses pour la messagerie plateforme avec les RLS nécessaires.

# TEST
Le ZIP fourni ne contient pas package.json/tsconfig.json, donc un `npm run build` complet n'est pas exécutable dans l'archive reçue.
En revanche, tous les fichiers TypeScript/TSX modifiés ont été passés dans le parseur TypeScript : syntaxe OK.

Dans ton projet complet :

```bash
npx tsc --noEmit
npm run build
```

Puis :

```bash
git add .
git commit -m "Corrige joueurs notifications commandes annonces et seances"
git push origin main
```
