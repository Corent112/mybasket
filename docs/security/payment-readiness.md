# Payment and security readiness

Implemented in application code:
- Next.js and image/HTML processing security updates; repeat `npm audit --omit=dev` over time.
- All `/admin` pages use the server admin guard; enrolled TOTP requires an AAL2 session.
- Optional TOTP enrollment: `/mon-compte/securite`. No account is enrolled automatically. Keep access to the authenticator; factor recovery requires the account administrator/Supabase procedure.
- Security headers, safe internal redirects, cross-site API mutation rejection. No blanket script/media restriction that would disable video editing.
- A bounded in-memory rate limiter on checkout and password reset; this is **per instance**, not a distributed firewall.
- One hosted Stripe Checkout integration for card, Apple Pay and PayPal when enabled and eligible. The old custom PayPal capture endpoint is closed.
- Server catalog prices, signed-provider item digest, verified owner/session/amount/currency/payment status, deterministic row IDs for retries, completion after access writes.
- Both historical Stripe webhook URLs share the same implementation.
- Existing password recovery and exhaustive users/free-grants resolution retained and regression tested.

Required production checks; not verified by a successful build:
1. Stripe merchant activation/KYC, live payment methods and PayPal enabled. Apple Pay visibility depends on eligible device/card/browser.
2. Vercel server-only `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; public site URL must be the canonical HTTPS domain.
3. One Stripe webhook destination `/api/stripe/webhook` with `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Do not configure duplicate destinations unnecessarily; duplicate delivery remains safe for access/payment rows.
4. End-to-end sandbox checkout -> webhook -> one payment -> correct dated subscription -> user can access. Then live low-value test chosen by owner. No real payments or emails were triggered during code tests.
5. Review live Supabase RLS and column permissions using `scripts/security/production-access-audit.sql`. Users must not write their platform_role, paid status, payments, subscriptions or free grants. Coordinate existing admin queries before restricting writes. **No production DB policy is changed blindly.**
6. Enable provider-side rate limits/bot protections and review Vercel WAF; client + per-instance rate limits are insufficient against distributed attacks.
7. Activate MFA for owner accounts on Vercel, GitHub, Stripe and Supabase. Set Supabase password policy, leak protection and trusted redirect URLs; confirm production email delivery.
8. Review backups/restoration, secret rotation, logs, private player data and existing publicly stored documents.

Limits / compatibility:
- Subscriptions retain the existing prepaid monthly/yearly purchase behavior; no automatic recurring billing was introduced.
- Pending old Stripe sessions without `items_digest` fail closed and require operator reconciliation; do not silently grant access from mutable historical order items.
- A successful dependency audit is not a penetration test or a guarantee of zero vulnerabilities. Live RLS/configuration and all unrelated API routes have not been certified.
- Receipt delivery retains existing best-effort semantics. Replays do not intentionally send a second receipt; an email delivery failure needs separate reconciliation.
