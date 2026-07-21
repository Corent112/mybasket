import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type Exercise = {
  id: string;
  title: string | null;
  theme: string | null;
  type: string | null;
  category: string | null;
  level: string | null;
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

function getStatus(row: Exercise) {
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

async function updateExerciseStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "pending");

  if (!id) return;

  await supabase
    .from("exercises")
    .update({
      status,
      review_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/admin/exercices");
  revalidatePath("/exercices");
}

async function deleteExercise(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  await supabase.from("exercises").delete().eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/admin/exercices");
  revalidatePath("/exercices");
}

export default async function AdminExercicesPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("exercises")
    .select("*")
    .order("created_at", { ascending: false });

  const exercises = (data || []) as Exercise[];

  const total = exercises.length;
  const pending = exercises.filter((e) =>
    ["pending", "submitted", "draft"].includes(getStatus(e))
  ).length;
  const approved = exercises.filter((e) =>
    ["approved", "published"].includes(getStatus(e))
  ).length;
  const rejected = exercises.filter((e) => getStatus(e) === "rejected").length;

  return (
    <main className={styles.adminModeration}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Modération bibliothèque</p>
            <h1>Exercices</h1>
            <span>
              Valide ou refuse les exercices proposés avant intégration dans la
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
            <span>Validés</span>
          </div>
          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{rejected}</strong>
            <span>Refusés</span>
          </div>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Exercices proposés</h2>
            <span>{total} exercices</span>
          </div>

          <div className={styles.grid}>
            {exercises.map((exercise) => {
              const status = getStatus(exercise);

              return (
                <article key={exercise.id} className={styles.card}>
                  <div className={styles.cardTop}>
                    <span
                      className={`${styles.statusBadge} ${statusClass(status)}`}
                    >
                      {statusLabel(status)}
                    </span>
                    <span className={styles.date}>
                      {formatDate(exercise.created_at)}
                    </span>
                  </div>

                  <h2>{exercise.title || "Exercice sans titre"}</h2>

                  <div className={styles.meta}>
                    <span>{exercise.theme || "Thème —"}</span>
                    <span>{exercise.type || "Type —"}</span>
                    <span>{exercise.category || "Catégorie —"}</span>
                    <span>{exercise.level || "Niveau —"}</span>
                  </div>

                  {exercise.description && (
                    <p className={styles.desc}>
                      {exercise.description.slice(0, 220)}
                    </p>
                  )}

                  <div className={styles.actions}>
                    <Link href={`/exercices/${exercise.id}`}>Voir</Link>
                    <Link href={`/admin/exercices/${exercise.id}`}>
                      Contrôler
                    </Link>

                    <form action={updateExerciseStatus}>
                      <input type="hidden" name="id" value={exercise.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button type="submit">Valider</button>
                    </form>

                    <form action={updateExerciseStatus}>
                      <input type="hidden" name="id" value={exercise.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <button type="submit">Refuser</button>
                    </form>

                    <form action={deleteExercise}>
                      <input type="hidden" name="id" value={exercise.id} />
                      <button type="submit" className={styles.dangerBtn}>
                        Supprimer
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}

            {exercises.length === 0 && (
              <div className={styles.emptyState}>
                Aucun exercice trouvé.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}