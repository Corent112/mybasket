import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type PracticeSession = {
  id: string;
  title: string | null;
  theme: string | null;
  category: string | null;
  level: string | null;
  duration: number | null;
  description: string | null;
  status: string | null;
  review_status: string | null;
  created_at: string | null;
  user_id: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("fr-FR");
}

function getStatus(row: PracticeSession) {
  return row.review_status || row.status || "pending";
}

function statusLabel(status: string) {
  if (status === "approved" || status === "published") return "Validée";
  if (status === "rejected") return "Refusée";
  if (status === "draft") return "Brouillon";
  return "À valider";
}

function statusClass(status: string) {
  if (status === "approved" || status === "published") return styles.active;
  if (status === "rejected") return styles.danger;
  if (status === "draft") return styles.neutral;
  return styles.pending;
}

async function updateSessionStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "pending");

  if (!id) return;

  await supabase
    .from("practice_sessions")
    .update({
      status,
      review_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/admin/seances");
  revalidatePath("/seances");
}

async function deleteSession(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  await supabase.from("practice_sessions").delete().eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/admin/seances");
  revalidatePath("/seances");
}

export default async function AdminSeancesPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("practice_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  const sessions = (data || []) as PracticeSession[];

  const total = sessions.length;
  const pending = sessions.filter((s) =>
    ["pending", "submitted", "draft"].includes(getStatus(s))
  ).length;
  const approved = sessions.filter((s) =>
    ["approved", "published"].includes(getStatus(s))
  ).length;
  const rejected = sessions.filter((s) => getStatus(s) === "rejected").length;

  return (
    <main className={styles.adminModeration}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Modération bibliothèque</p>
            <h1>Séances</h1>
            <span>
              Valide ou refuse les séances proposées avant intégration dans la
              bibliothèque MyBasket.
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
            <span>Validées</span>
          </div>
          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{rejected}</strong>
            <span>Refusées</span>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Séances proposées</h2>
            <span>{total} séances</span>
          </div>

          <div className={styles.grid}>
            {sessions.map((session) => {
              const status = getStatus(session);

              return (
                <article key={session.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span
                      className={`${styles.statusBadge} ${statusClass(status)}`}
                    >
                      {statusLabel(status)}
                    </span>
                    <span className={styles.date}>
                      {formatDate(session.created_at)}
                    </span>
                  </div>

                  <h2>{session.title || "Séance sans titre"}</h2>

                  <div className={styles.meta}>
                    <span>{session.theme || "Thème —"}</span>
                    <span>{session.category || "Catégorie —"}</span>
                    <span>{session.level || "Niveau —"}</span>
                    <span>
                      {session.duration ? `${session.duration} min` : "Durée —"}
                    </span>
                  </div>

                  {session.description && (
                    <p className={styles.desc}>
                      {session.description.slice(0, 220)}
                    </p>
                  )}

                  <div className={styles.actions}>
                    <Link href={`/seances/${session.id}`}>Voir</Link>
                    <Link href={`/admin/seances/${session.id}`}>Contrôler</Link>

                    <form action={updateSessionStatus}>
                      <input type="hidden" name="id" value={session.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button type="submit">Valider</button>
                    </form>

                    <form action={updateSessionStatus}>
                      <input type="hidden" name="id" value={session.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <button type="submit">Refuser</button>
                    </form>

                    <form action={deleteSession}>
                      <input type="hidden" name="id" value={session.id} />
                      <button type="submit" className={styles.dangerBtn}>
                        Supprimer
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}

            {sessions.length === 0 && (
              <div className={styles.emptyState}>
                Aucune séance trouvée.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}