# Zone 3 — Paiements, abonnements et permissions

## Corrigé dans le code

- Stripe ne plante plus le build au chargement du module si la clé est absente : une erreur explicite est renvoyée seulement au paiement.
- Compatibilité avec les bases anciennes sans `orders.subtotal_cents`, `tax_cents`, `total_cents`.
- Compatibilité avec les bases anciennes sans les colonnes centimes de `order_items`.
- Les prix marqués TTC ne reçoivent pas une seconde TVA.
- Les prix marqués HT reçoivent 20 % au paiement.
- Le panier affiche la TVA incluse dans le total TTC.
- PayPal utilise un vrai parcours création → approbation → capture → commande payée → abonnement activé.
- Apple Pay utilise Stripe Checkout (`card`) ; Stripe affiche Apple Pay sur un appareil et un domaine compatibles.
- L’image du plan et le bouton « Voir les abonnements » sont présents dans Mon compte.
- Le CEO/Admin affiche « Accès total CEO » et ne dépend pas d’un abonnement Bronze.
- La matrice `subscription_access` est appliquée dans l’API et désormais aussi dans `lib/access.ts`.
- Les limites équipes, playbooks et documents utilisent les colonnes du plan.
- Les données commandes, abonnements et droits sont persistées dans Supabase.

## Validé techniquement

- `npx tsc --noEmit` : aucune erreur.

## À valider avec tes comptes externes

- Stripe : effectuer un paiement test avec une clé Stripe de test et le webhook configuré.
- Apple Pay : enregistrer/valider le domaine dans Stripe et tester sur Safari avec Apple Pay configuré.
- PayPal : renseigner `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`, puis faire un paiement sandbox.
- Vérifier dans l’admin que chaque ligne de `subscription_access` correspond exactement aux accès souhaités pour chaque plan.

## Variables `.env.local`

```env
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_ENV=sandbox
```
