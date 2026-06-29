import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type AdminTag = {
  id: string;
  label: string;
  slug: string | null;
  target: string | null;
  status: string | null;
  sort_order: number | null;
  created_at: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function statusLabel(status: string | null) {
  if (status === "active") return "Actif";
  if (status === "inactive") return "Inactif";
  return "Actif";
}

function statusClass(status: string | null) {
  if (status === "inactive") return styles.inactive;
  return styles.active;
}

async function createTagAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const label = String(formData.get("label") || "").trim();
  const target = String(formData.get("target") || "exercises");
  const sortOrder = Number(formData.get("sort_order") || 0);

  if (!label) return;

  await supabase.from("admin_tags").insert({
    label,
    slug: slugify(label),
    target,
    status: "active",
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/admin/tags");
}

async function toggleTagAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "inactive");

  if (!id) return;

  await supabase
    .from("admin_tags")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/tags");
}

async function deleteTagAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  await supabase.from("admin_tags").delete().eq("id", id);

  revalidatePath("/admin/tags");
}

export default async function AdminTagsPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("admin_tags")
    .select("*")
    .order("target", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  const tags = (data || []) as AdminTag[];

  const activeTags = tags.filter((tag) => tag.status !== "inactive").length;
  const exerciseTags = tags.filter((tag) => tag.target === "exercises").length;
  const systemTags = tags.filter((tag) => tag.target === "systems").length;
  const sessionTags = tags.filter((tag) => tag.target === "sessions").length;
  const livestatTags = tags.filter((tag) => tag.target === "livestat").length;

  return (
    <main className={styles.adminTags}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Tags</h1>
            <span>
              Gère les tags utilisés dans les bibliothèques exercices, systèmes,
              séances et LiveStat.
            </span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{tags.length}</strong>
            <span>Total tags</span>
          </div>
          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{activeTags}</strong>
            <span>Actifs</span>
          </div>
          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{exerciseTags}</strong>
            <span>Exercices</span>
          </div>
          <div className={`${styles.statCard} ${styles.purple}`}>
            <strong>{systemTags}</strong>
            <span>Systèmes</span>
          </div>
          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{sessionTags}</strong>
            <span>Séances</span>
          </div>
          <div className={`${styles.statCard} ${styles.dark}`}>
            <strong>{livestatTags}</strong>
            <span>LiveStat</span>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Créer un tag</h2>
            <span>Visible ensuite dans les filtres et formulaires</span>
          </div>

          <form action={createTagAction} className={styles.form}>
            <input name="label" placeholder="Ex : Pick and Roll" required />

            <select name="target" defaultValue="exercises">
              <option value="exercises">Exercices</option>
              <option value="systems">Systèmes</option>
              <option value="sessions">Séances</option>
              <option value="livestat">LiveStat</option>
              <option value="global">Global</option>
            </select>

            <input
              name="sort_order"
              type="number"
              defaultValue={0}
              placeholder="Ordre"
            />

            <button type="submit">Créer le tag</button>
          </form>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Liste des tags</h2>
            <span>{tags.length} tags</span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Tag</th>
                  <th>Slug</th>
                  <th>Cible</th>
                  <th>Ordre</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {tags.map((tag) => {
                  const nextStatus =
                    tag.status === "inactive" ? "active" : "inactive";

                  return (
                    <tr key={tag.id}>
                      <td>
                        <strong>{tag.label}</strong>
                      </td>
                      <td>{tag.slug || "—"}</td>
                      <td>{tag.target || "global"}</td>
                      <td>{tag.sort_order ?? 0}</td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${statusClass(
                            tag.status
                          )}`}
                        >
                          {statusLabel(tag.status)}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <Link href={`/admin/tags/${tag.id}`}>Modifier</Link>

                          <form action={toggleTagAction}>
                            <input type="hidden" name="id" value={tag.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={nextStatus}
                            />
                            <button type="submit">
                              {tag.status === "inactive"
                                ? "Activer"
                                : "Désactiver"}
                            </button>
                          </form>

                          <form action={deleteTagAction}>
                            <input type="hidden" name="id" value={tag.id} />
                            <button type="submit" className={styles.dangerBtn}>
                              Supprimer
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {tags.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        Aucun tag créé pour le moment.
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