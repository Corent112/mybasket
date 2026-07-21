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
  players_count: number | null;
  material: string | null;
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

async function createSessionTemplate(formData: FormData) {
  "use server";

  const { supabase, user } = await requireAdmin();

  const title = String(formData.get("title") || "").trim();
  const theme = String(formData.get("theme") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const level = String(formData.get("level") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const material = String(formData.get("material") || "").trim();
  const duration = Number(formData.get("duration") || 0) || null;
  const playersCount = Number(formData.get("players_count") || 0) || null;

  if (!title || !theme || !category) return;

  await supabase.from("practice_sessions").insert({
    user_id: user.id,
    title,
    theme,
    category,
    level: level || null,
    duration,
    players_count: playersCount,
    material: material || null,
    description: description || null,
    visibility: "public",
    status: "published",
    review_status: "published",
    session_date: null,
    start_time: null,
    end_time: null,
    location: null,
  });

  revalidatePath("/admin/seances");
  revalidatePath("/seances");
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
    .eq("visibility", "public")
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
              Gère uniquement les séances modèles publiées dans la bibliothèque MyBasket. Les séances privées créées par les utilisateurs sont générées automatiquement et ne nécessitent aucune validation CEO.
            </span>
          </div>
        </section>

        <section className={styles.createCard}>
          <div className={styles.tableHead}>
            <div>
              <h2>Créer une séance modèle</h2>
              <span>Publiée immédiatement dans la bibliothèque MyBasket</span>
            </div>
          </div>

          <form action={createSessionTemplate} className={styles.createForm}>
            <label>
              Nom de la séance *
              <input name="title" required placeholder="Ex : Développer le jeu de transition" />
            </label>
            <label>
              Catégorie *
              <select name="category" required defaultValue="U13">
                {['U13','U15','U18','U21','Seniors'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Niveau
              <select name="level" defaultValue="Intermédiaire">
                {['Débutant','Intermédiaire','Confirmé'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Thème *
              <select name="theme" required defaultValue="Passe">
                {['Échauffement','Dribble','Passe','Défense','Tir','Pré-co','Surnombre','Ludique','Rebonds','Physique'].map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              Durée (min)
              <input name="duration" type="number" min="5" step="5" defaultValue="90" />
            </label>
            <label>
              Nombre de joueurs
              <input name="players_count" type="number" min="1" max="30" defaultValue="12" />
            </label>
            <label className={styles.fullField}>
              Matériel
              <input name="material" placeholder="Ballons, plots, chasubles..." />
            </label>
            <label className={styles.fullField}>
              Description
              <textarea name="description" rows={5} placeholder="Objectifs, déroulé et points de vigilance..." />
            </label>
            <div className={styles.fullField}>
              <button type="submit" className={styles.publishBtn}>Publier la séance modèle</button>
            </div>
          </form>
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
                    {session.players_count ? <span>{session.players_count} joueurs</span> : null}
                    {session.material ? <span>{session.material}</span> : null}
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