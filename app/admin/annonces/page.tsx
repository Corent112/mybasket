import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import styles from "./page.module.css";

type Annonce = {
  id: string;
  user_id?: string | null;
  author_user_id?: string | null;
  author_name?: string | null;
  author_email?: string | null;
  author_phone?: string | null;
  author_type?: string | null;
  category: string | null;
  title: string | null;
  city: string | null;
  description: string | null;
  price_cents: number | null;
  image_url?: string | null;
  date_start?: string | null;
  date_end?: string | null;
  status: string | null;
  created_at: string | null;
  is_featured?: boolean | null;
};

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatEuros(cents: number | null) {
  if (!cents) return "—";

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function getStatus(row: Annonce) {
  return row.status || "pending";
}

function getStatusLabel(status: string | null) {
  if (status === "published" || status === "approved") return "Publiée";
  if (status === "rejected") return "Refusée";
  if (status === "draft") return "Brouillon";
  if (status === "archived") return "Archivée";
  return "À modérer";
}

function getStatusClass(status: string | null) {
  if (status === "published" || status === "approved") return styles.active;
  if (status === "rejected" || status === "archived") return styles.suspended;
  if (status === "draft") return styles.inactive;
  return styles.pending;
}

function getAuthor(row: Annonce) {
  return row.author_name || row.author_email || row.author_type || "Utilisateur";
}

async function updateAnnonceStatus(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "pending");

  if (!id) return;

  await supabase
    .from("announcements")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/admin/annonces");
  revalidatePath("/annonces");
}

async function toggleAnnonceFeatured(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const next = String(formData.get("next") || "false") === "true";

  if (!id) return;

  await supabase
    .from("announcements")
    .update({
      is_featured: next,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/annonces");
  revalidatePath("/annonces");
}

async function deleteAnnonce(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  await supabase.from("announcements").delete().eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/admin/annonces");
  revalidatePath("/annonces");
}

export default async function AdminAnnoncesPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("announcements")
    .select("*")
    .order("created_at", { ascending: false });

  const annonces = (data || []) as Annonce[];

  const total = annonces.length;
  const pending = annonces.filter((a) =>
    ["pending", "submitted", "draft"].includes(getStatus(a))
  ).length;
  const published = annonces.filter((a) =>
    ["published", "approved"].includes(getStatus(a))
  ).length;
  const rejected = annonces.filter((a) => getStatus(a) === "rejected").length;
  const featured = annonces.filter((a) => Boolean(a.is_featured)).length;

  return (
    <main className={styles.adminAnnonces}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Modération CEO</p>
            <h1>Annonces</h1>
            <span>
              Valide, refuse, supprime ou mets en avant les annonces publiées
              par les utilisateurs.
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
            <span>À modérer</span>
          </div>

          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{published}</strong>
            <span>Publiées</span>
          </div>

          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{rejected}</strong>
            <span>Refusées</span>
          </div>

          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{featured}</strong>
            <span>Mises en avant</span>
          </div>
        </section>

        <section className={styles.filters}>
          <input placeholder="Rechercher annonce, ville, catégorie..." />

          <select defaultValue="pending">
            <option value="pending">À modérer</option>
            <option value="published">Publiées</option>
            <option value="rejected">Refusées</option>
            <option value="all">Toutes</option>
          </select>

          <select defaultValue="all">
            <option value="all">Toutes les catégories</option>
            <option value="club_recherche_joueur">Club cherche joueur</option>
            <option value="club_recherche_entraineur">Club cherche coach</option>
            <option value="entraineur_recherche_club">Coach cherche club</option>
            <option value="camp_stage">Camp / stage</option>
          </select>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Liste des annonces</h2>
            <span>{total} annonces</span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Annonce</th>
                  <th>Catégorie</th>
                  <th>Auteur</th>
                  <th>Ville</th>
                  <th>Prix</th>
                  <th>Création</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {annonces.map((annonce) => {
                  const status = getStatus(annonce);

                  return (
                    <tr key={annonce.id}>
                      <td>
                        <div className={styles.announcementCell}>
                          {annonce.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={annonce.image_url} alt="" />
                          ) : (
                            <div className={styles.imageFallback}>📣</div>
                          )}

                          <div>
                            <strong>{annonce.title || "Annonce sans titre"}</strong>
                            <span>
                              {annonce.is_featured ? "⭐ Mise en avant" : "Annonce standard"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className={styles.categoryBadge}>
                          {annonce.category || "—"}
                        </span>
                      </td>

                      <td>
                        <span className={styles.authorBadge}>
                          {getAuthor(annonce)}
                        </span>
                      </td>

                      <td>{annonce.city || "—"}</td>
                      <td>{formatEuros(annonce.price_cents)}</td>
                      <td>{formatDate(annonce.created_at)}</td>

                      <td>
                        <span
                          className={`${styles.statusBadge} ${getStatusClass(
                            status
                          )}`}
                        >
                          {getStatusLabel(status)}
                        </span>
                      </td>

                      <td>
                        <div className={styles.actions}>
                          <Link href={`/annonces/${annonce.id}`}>Voir</Link>
                          <Link href={`/admin/annonces/${annonce.id}`}>Modifier</Link>

                          <form action={updateAnnonceStatus}>
                            <input type="hidden" name="id" value={annonce.id} />
                            <input type="hidden" name="status" value="approved" />
                            <button type="submit">Valider</button>
                          </form>

                          <form action={updateAnnonceStatus}>
                            <input type="hidden" name="id" value={annonce.id} />
                            <input type="hidden" name="status" value="rejected" />
                            <button type="submit">Refuser</button>
                          </form>

                          <form action={toggleAnnonceFeatured}>
                            <input type="hidden" name="id" value={annonce.id} />
                            <input
                              type="hidden"
                              name="next"
                              value={String(!annonce.is_featured)}
                            />
                            <button type="submit">
                              {annonce.is_featured ? "Retirer une" : "Mettre une"}
                            </button>
                          </form>

                          <form action={deleteAnnonce}>
                            <input type="hidden" name="id" value={annonce.id} />
                            <button type="submit" className={styles.dangerBtn}>
                              Supprimer
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {annonces.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.emptyState}>
                        Aucune annonce trouvée.
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
