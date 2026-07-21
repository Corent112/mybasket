import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type System = {
  id: string;
  title: string | null;
  objectif: string | null;
  organisation: string | null;
  type: string | null;
  categorie: string | null;
  status: string | null;
  review_status: string | null;
  created_at: string | null;
  user_id: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

function getStatus(row: System) {
  return row.review_status || row.status || "pending";
}

function statusLabel(status: string) {
  if (status === "approved" || status === "published") return "Validé";
  if (status === "rejected") return "Refusé";
  if (status === "draft") return "Brouillon";
  return "À valider";
}

function statusClass(status: string) {
  if (status === "approved" || status === "published") return styles.active;
  if (status === "rejected") return styles.danger;
  if (status === "draft") return styles.neutral;
  return styles.pending;
}

async function updateSystemStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "pending");

  if (!id) return;

  await supabase
    .from("systems")
    .update({
      status,
      review_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/admin/systemes");
  revalidatePath("/systemes");
}

async function deleteSystem(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  await supabase.from("systems").delete().eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/admin/systemes");
  revalidatePath("/systemes");
}

export default async function AdminSystemesPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("systems")
    .select("*")
    .order("created_at", { ascending: false });

  const systems = (data || []) as System[];

  const total = systems.length;
  const pending = systems.filter((s) =>
    ["pending", "submitted", "draft"].includes(getStatus(s))
  ).length;
  const approved = systems.filter((s) =>
    ["approved", "published"].includes(getStatus(s))
  ).length;
  const rejected = systems.filter((s) => getStatus(s) === "rejected").length;

  return (
    <main className={styles.adminModeration}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Modération bibliothèque</p>
            <h1>Systèmes</h1>
            <span>
              Valide ou refuse les systèmes proposés avant intégration dans le
              playbook public MyBasket.
            </span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{total}</strong>
            <span>Total</span>
          </div>
          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{pending}</strong>
            <span>À valider</span>
          </div>
          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{approved}</strong>
            <span>Validés</span>
          </div>
          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{rejected}</strong>
            <span>Refusés</span>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Systèmes proposés</h2>
            <span>{total} systèmes</span>
          </div>

          <div className={styles.grid}>
            {systems.map((system) => {
              const status = getStatus(system);

              return (
                <article key={system.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span
                      className={`${styles.statusBadge} ${statusClass(status)}`}
                    >
                      {statusLabel(status)}
                    </span>
                    <span className={styles.date}>
                      {formatDate(system.created_at)}
                    </span>
                  </div>

                  <h2>{system.title || "Système sans titre"}</h2>

                  <div className={styles.meta}>
                    <span>{system.type || "Type —"}</span>
                    <span>{system.categorie || "Catégorie —"}</span>
                    <span>{system.objectif || "Objectif —"}</span>
                  </div>

                  {system.organisation && (
                    <p className={styles.desc}>
                      {system.organisation.slice(0, 220)}
                    </p>
                  )}

                  <div className={styles.actions}>
                    <Link href={`/systemes/${system.id}`}>Voir</Link>
                    <Link href={`/admin/systemes/${system.id}`}>
                      Contrôler
                    </Link>

                    <form action={updateSystemStatus}>
                      <input type="hidden" name="id" value={system.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button type="submit">Valider</button>
                    </form>

                    <form action={updateSystemStatus}>
                      <input type="hidden" name="id" value={system.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <button type="submit">Refuser</button>
                    </form>

                    <form action={deleteSystem}>
                      <input type="hidden" name="id" value={system.id} />
                      <button type="submit" className={styles.dangerBtn}>
                        Supprimer
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}

            {systems.length === 0 && (
              <div className={styles.emptyState}>
                Aucun système trouvé.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}