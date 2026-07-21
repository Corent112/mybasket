import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type Payment = {
  id: string;
  user_id: string | null;
  amount_cents: number | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  provider: string | null;
  description: string | null;
  created_at: string | null;
};

type PromoCode = {
  id: string;
  code: string;
  discount_type: string | null;
  discount_value: number | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number | null;
  created_at: string | null;
};

type FreeAccess = {
  id: string;
  user_email: string | null;
  plan_slug: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function getPaymentCents(payment: Payment) {
  if (payment.amount_cents !== null && payment.amount_cents !== undefined) {
    return payment.amount_cents;
  }

  return Math.round(Number(payment.amount || 0) * 100);
}

function statusLabel(status: string | null) {
  if (status === "paid" || status === "succeeded") return "Payé";
  if (status === "pending") return "En attente";
  if (status === "failed") return "Échoué";
  if (status === "refunded") return "Remboursé";
  if (status === "active") return "Actif";
  if (status === "inactive") return "Inactif";
  return status || "—";
}

function statusClass(status: string | null) {
  if (["paid", "succeeded", "active"].includes(status || "")) {
    return styles.active;
  }

  if (status === "pending") return styles.pending;

  if (["failed", "refunded", "inactive"].includes(status || "")) {
    return styles.danger;
  }

  return styles.neutral;
}

async function createPromoCodeAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const code = String(formData.get("code") || "").trim().toUpperCase();
  const discountType = String(formData.get("discount_type") || "percent");
  const discountValue = Number(formData.get("discount_value") || 0);
  const startsAt = String(formData.get("starts_at") || "");
  const endsAt = String(formData.get("ends_at") || "");
  const maxUses = String(formData.get("max_uses") || "").trim();

  if (!code || discountValue <= 0) return;

  await supabase.from("promo_codes").insert({
    code,
    discount_type: discountType,
    discount_value: discountValue,
    status: "active",
    starts_at: startsAt ? new Date(startsAt).toISOString() : null,
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    max_uses: maxUses ? Number(maxUses) : null,
    used_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/paiements");
}

async function togglePromoCodeAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "inactive");

  if (!id) return;

  await supabase
    .from("promo_codes")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/paiements");
}

async function deletePromoCodeAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");

  if (!id) return;

  await supabase.from("promo_codes").delete().eq("id", id);

  revalidatePath("/admin/paiements");
}

async function createFreeAccessAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const planSlug = String(formData.get("plan_slug") || "premium");
  const days = Number(formData.get("days") || 30);

  if (!email || days <= 0) return;

  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + days);

  await supabase.from("free_access_grants").insert({
    user_email: email,
    plan_slug: planSlug,
    status: "active",
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/paiements");
}

async function disableFreeAccessAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");

  if (!id) return;

  await supabase
    .from("free_access_grants")
    .update({
      status: "inactive",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/paiements");
}

export default async function AdminPaiementsPage() {
  const { supabase } = await requireAdmin();

  const { data: paymentsData } = await supabase
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: promoCodesData } = await supabase
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });

  const { data: freeAccessData } = await supabase
    .from("free_access_grants")
    .select("*")
    .order("created_at", { ascending: false });

  const payments = (paymentsData || []) as Payment[];
  const promoCodes = (promoCodesData || []) as PromoCode[];
  const freeAccess = (freeAccessData || []) as FreeAccess[];

  const paidPayments = payments.filter((payment) =>
    ["paid", "succeeded"].includes(payment.status || "")
  );

  const pendingPayments = payments.filter(
    (payment) => payment.status === "pending"
  );

  const failedPayments = payments.filter((payment) =>
    ["failed", "refunded"].includes(payment.status || "")
  );

  const totalRevenueCents = paidPayments.reduce(
    (sum, payment) => sum + getPaymentCents(payment),
    0
  );

  const activePromos = promoCodes.filter((promo) => promo.status === "active");
  const activeFreeAccess = freeAccess.filter((grant) => grant.status === "active");

  return (
    <main className={styles.adminPayments}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Paiements</h1>
            <span>
              Transactions, codes promotionnels et accès gratuits temporaires.
            </span>
          </div>

          <div className={styles.heroActions}>
            <Link href="/admin/paiements/export">Exporter</Link>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{payments.length}</strong>
            <span>Transactions</span>
          </div>

          <div className={`${styles.statCard} ${styles.money}`}>
            <strong>{formatMoney(totalRevenueCents)}</strong>
            <span>CA encaissé</span>
          </div>

          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{paidPayments.length}</strong>
            <span>Réussis</span>
          </div>

          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{pendingPayments.length}</strong>
            <span>En attente</span>
          </div>

          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{failedPayments.length}</strong>
            <span>Échoués</span>
          </div>

          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{activePromos.length}</strong>
            <span>Codes actifs</span>
          </div>

          <div className={`${styles.statCard} ${styles.purple}`}>
            <strong>{activeFreeAccess.length}</strong>
            <span>Accès offerts</span>
          </div>
        </section>

        <section className={styles.grid2}>
          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Créer un code promotionnel</h2>
              <span>Réduction en % ou en €</span>
            </div>

            <form action={createPromoCodeAction} className={styles.formGrid}>
              <input name="code" placeholder="SUMMER2026" required />

              <select name="discount_type" defaultValue="percent">
                <option value="percent">Pourcentage</option>
                <option value="amount">Montant fixe</option>
              </select>

              <input
                name="discount_value"
                type="number"
                min="1"
                placeholder="Valeur"
                required
              />

              <input name="starts_at" type="date" />
              <input name="ends_at" type="date" />
              <input name="max_uses" type="number" min="1" placeholder="Max utilisations" />

              <button type="submit">Créer le code</button>
            </form>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHead}>
              <h2>Offrir un accès gratuit</h2>
              <span>Accès temporaire complet ou partiel</span>
            </div>

            <form action={createFreeAccessAction} className={styles.formGrid}>
              <input
                name="email"
                type="email"
                placeholder="email@exemple.com"
                required
              />

              <select name="plan_slug" defaultValue="premium">
                <option value="individual_basic">Individual Basic</option>
                <option value="individual_pro">Individual Pro</option>
                <option value="premium">Premium</option>
                <option value="club_bronze">Club Bronze</option>
                <option value="club_silver">Club Silver</option>
                <option value="club_gold">Club Gold</option>
              </select>

              <input
                name="days"
                type="number"
                min="1"
                defaultValue={30}
                placeholder="Durée en jours"
                required
              />

              <button type="submit">Créer l’accès</button>
            </form>
          </section>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Transactions récentes</h2>
            <span>{payments.length} transactions affichées</span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Montant</th>
                  <th>Statut</th>
                  <th>Provider</th>
                  <th>Description</th>
                  <th>Utilisateur</th>
                </tr>
              </thead>

              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{formatDate(payment.created_at)}</td>
                    <td>
                      <strong>{formatMoney(getPaymentCents(payment))}</strong>
                    </td>
                    <td>
                      <span
                        className={`${styles.statusBadge} ${statusClass(
                          payment.status
                        )}`}
                      >
                        {statusLabel(payment.status)}
                      </span>
                    </td>
                    <td>{payment.provider || "—"}</td>
                    <td>{payment.description || "—"}</td>
                    <td>{payment.user_id ? payment.user_id.slice(0, 8) : "—"}</td>
                  </tr>
                ))}

                {payments.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        Aucune transaction trouvée.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.grid2}>
          <section className={styles.tableCard}>
            <div className={styles.tableHead}>
              <h2>Codes promotionnels</h2>
              <span>{promoCodes.length} codes</span>
            </div>

            <div className={styles.tableWrapper}>
              <table>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Réduction</th>
                    <th>Validité</th>
                    <th>Usage</th>
                    <th>Statut</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {promoCodes.map((promo) => {
                    const nextStatus =
                      promo.status === "active" ? "inactive" : "active";

                    return (
                      <tr key={promo.id}>
                        <td>
                          <strong>{promo.code}</strong>
                        </td>
                        <td>
                          {promo.discount_type === "amount"
                            ? `${promo.discount_value || 0} €`
                            : `${promo.discount_value || 0}%`}
                        </td>
                        <td>
                          {formatDate(promo.starts_at)} →{" "}
                          {formatDate(promo.ends_at)}
                        </td>
                        <td>
                          {promo.used_count || 0}
                          {promo.max_uses ? ` / ${promo.max_uses}` : " / ∞"}
                        </td>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${statusClass(
                              promo.status
                            )}`}
                          >
                            {statusLabel(promo.status)}
                          </span>
                        </td>
                        <td>
                          <div className={styles.actions}>
                            <form action={togglePromoCodeAction}>
                              <input type="hidden" name="id" value={promo.id} />
                              <input
                                type="hidden"
                                name="status"
                                value={nextStatus}
                              />
                              <button type="submit">
                                {promo.status === "active"
                                  ? "Désactiver"
                                  : "Activer"}
                              </button>
                            </form>

                            <form action={deletePromoCodeAction}>
                              <input type="hidden" name="id" value={promo.id} />
                              <button
                                type="submit"
                                className={styles.dangerBtn}
                              >
                                Supprimer
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {promoCodes.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className={styles.emptyState}>
                          Aucun code promotionnel.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.tableCard}>
            <div className={styles.tableHead}>
              <h2>Accès gratuits</h2>
              <span>{freeAccess.length} accès</span>
            </div>

            <div className={styles.tableWrapper}>
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Accès</th>
                    <th>Validité</th>
                    <th>Statut</th>
                    <th>Action</th>
                  </tr>
                </thead>

                <tbody>
                  {freeAccess.map((grant) => (
                    <tr key={grant.id}>
                      <td>{grant.user_email || "—"}</td>
                      <td>
                        <strong>{grant.plan_slug || "—"}</strong>
                      </td>
                      <td>
                        {formatDate(grant.starts_at)} →{" "}
                        {formatDate(grant.ends_at)}
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${statusClass(
                            grant.status
                          )}`}
                        >
                          {statusLabel(grant.status)}
                        </span>
                      </td>
                      <td>
                        {grant.status === "active" ? (
                          <form action={disableFreeAccessAction}>
                            <input type="hidden" name="id" value={grant.id} />
                            <button type="submit" className={styles.dangerBtn}>
                              Désactiver
                            </button>
                          </form>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}

                  {freeAccess.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <div className={styles.emptyState}>
                          Aucun accès gratuit.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}