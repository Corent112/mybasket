# Bloc 5 — Paiements, abonnements et permissions

## Corrigé

- Les prix TTC ne reçoivent plus 20 % de TVA supplémentaire dans le panier.
- Le panier affiche désormais la part de TVA incluse avec « Dont TVA 20 % ».
- Le serveur Stripe respecte `price_tax_mode` :
  - TTC : le prix enregistré est le montant payé ;
  - HT : 20 % sont ajoutés au paiement.
- L'erreur Supabase liée à l'absence de `subtotal_cents` est contournée automatiquement et la migration ajoute les colonnes attendues.
- Carte bancaire : session Stripe Checkout conservée.
- Apple Pay : le bouton utilise Stripe Checkout. Apple Pay s'affiche sur les appareils et navigateurs compatibles lorsque le domaine et le moyen de paiement sont activés dans Stripe.
- PayPal : création et capture réelles via l'API PayPal, avec activation de l'abonnement après paiement.
- La matrice `subscription_access` est désormais réellement appliquée par `/api/access`.
- Les rôles CEO, Super Admin et Admin ont toujours un accès total, sans abonnement artificiel.
- L'onglet Mon abonnement affiche : visuel, nom, statut, période et échéance.
- Le CEO voit « Accès CEO » au lieu d'un abonnement Bronze.
- Bouton « Voir les abonnements » placé en haut à droite de la carte.

## Configuration PayPal à ajouter dans `.env.local`

```env
PAYPAL_CLIENT_ID=ton_client_id
PAYPAL_CLIENT_SECRET=ton_secret
PAYPAL_ENV=sandbox
```

Pour la production, remplacer `sandbox` par `live` et utiliser les identifiants Live.

## Supabase

Exécuter `supabase_bloc_5.sql` dans Supabase > SQL Editor.

## Vérification

`npx tsc --noEmit` : validé sans erreur.

## Important

Le ZIP n'inclut pas `node_modules`, `.next` ni `.env.local`. Après remplacement du dossier :

```bash
npm install
npx tsc --noEmit
npm run dev
```
