import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type AdminFilter = {
  id: string;
  label: string;
  slug: string | null;
  filter_key: string | null;
  target: string | null;
  status: string | null;
  sort_order: number | null;
  created_at: string | null;
};

const FILTER_KEYS = [
  "theme",
  "type",
  "categorie",
  "niveau",
  "objectif",
  "moment",
  "format",
  "stat_category",
] as const;

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function statusLabel(status: string | null) {
  return status === "inactive" ? "Inactif" : "Actif";
}

function statusClass(status: string | null) {
  return status === "inactive" ? styles.inactive : styles.active;
}

async function createFilterAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const label = String(formData.get("label") || "").trim();
  const target = String(formData.get("target") || "exercises");
  const filterKey = String(formData.get("filter_key") || "theme");
  const sortOrder = Number(formData.get("sort_order") || 0);

  if (!label) return;

  await supabase.from("admin_filters").insert({
    label,
    slug: slugify(label),
    target,
    filter_key: filterKey,
    status: "active",
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/admin/filtres");
}

async function toggleFilterAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "inactive");

  if (!id) return;

  await supabase
    .from("admin_filters")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/filtres");
}

async function deleteFilterAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  await supabase.from("admin_filters").delete().eq("id", id);

  revalidatePath("/admin/filtres");
}

export default async function AdminFiltresPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("admin_filters")
    .select("*")
    .order("target", { ascending: true })
    .order("filter_key", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  const filters = (data || []) as AdminFilter[];

  const activeFilters = filters.filter(
    (filter) => filter.status !== "inactive"
  ).length;

  const exercises = filters.filter((filter) => filter.target === "exercises")
    .length;
  const systems = filters.filter((filter) => filter.target === "systems").length;
  const sessions = filters.filter((filter) => filter.target === "sessions").length;
  const livestat = filters.filter((filter) => filter.target === "livestat").length;

  return (
    <main className={styles.adminFilters}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Filtres</h1>
            <span>
              Contrôle les thèmes, types, catégories, niveaux et options visibles
              dans les bibliothèques et LiveStat.
            </span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{filters.length}</strong>
            <span>Total filtres</span>
          </div>
          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{activeFilters}</strong>
            <span>Actifs</span>
          </div>
          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{exercises}</strong>
            <span>Exercices</span>
          </div>
          <div className={`${styles.statCard} ${styles.purple}`}>
            <strong>{systems}</strong>
            <span>Systèmes</span>
          </div>
          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{sessions}</strong>
            <span>Séances</span>
          </div>
          <div className={`${styles.statCard} ${styles.dark}`}>
            <strong>{livestat}</strong>
            <span>LiveStat</span>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Créer un filtre</h2>
            <span>
              Exemple : thème exercice, catégorie système, niveau séance ou code
              LiveStat.
            </span>
          </div>

          <form action={createFilterAction} className={styles.form}>
            <input name="label" placeholder="Ex : U13 / Pick and Roll" required />

            <select name="target" defaultValue="exercises">
              <option value="exercises">Exercices</option>
              <option value="systems">Systèmes</option>
              <option value="sessions">Séances</option>
              <option value="livestat">LiveStat</option>
              <option value="global">Global</option>
            </select>

            <select name="filter_key" defaultValue="theme">
              {FILTER_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>

            <input
              name="sort_order"
              type="number"
              defaultValue={0}
              placeholder="Ordre"
            />

            <button type="submit">Créer le filtre</button>
          </form>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Liste des filtres</h2>
            <span>{filters.length} filtres</span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Filtre</th>
                  <th>Slug</th>
                  <th>Cible</th>
                  <th>Type</th>
                  <th>Ordre</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filters.map((filter) => {
                  const nextStatus =
                    filter.status === "inactive" ? "active" : "inactive";

                  return (
                    <tr key={filter.id}>
                      <td>
                        <strong>{filter.label}</strong>
                      </td>
                      <td>{filter.slug || "—"}</td>
                      <td>{filter.target || "global"}</td>
                      <td>{filter.filter_key || "theme"}</td>
                      <td>{filter.sort_order ?? 0}</td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${statusClass(
                            filter.status
                          )}`}
                        >
                          {statusLabel(filter.status)}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <Link href={`/admin/filtres/${filter.id}`}>
                            Modifier
                          </Link>

                          <form action={toggleFilterAction}>
                            <input type="hidden" name="id" value={filter.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={nextStatus}
                            />
                            <button type="submit">
                              {filter.status === "inactive"
                                ? "Activer"
                                : "Désactiver"}
                            </button>
                          </form>

                          <form action={deleteFilterAction}>
                            <input type="hidden" name="id" value={filter.id} />
                            <button type="submit" className={styles.dangerBtn}>
                              Supprimer
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filters.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className={styles.emptyState}>
                        Aucun filtre créé pour le moment.
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