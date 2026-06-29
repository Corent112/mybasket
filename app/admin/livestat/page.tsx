import Link from "next/link";
import { revalidatePath } from "next/cache";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

type LiveStatCode = {
  id: string;
  label: string;
  slug: string | null;
  category: string | null;
  code_type: string | null;
  points_value: number | null;
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
  return status === "inactive" ? "Inactif" : "Actif";
}

function statusClass(status: string | null) {
  return status === "inactive" ? styles.inactive : styles.active;
}

async function createCodeAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const label = String(formData.get("label") || "").trim();
  const category = String(formData.get("category") || "attaque");
  const codeType = String(formData.get("code_type") || "event");
  const pointsValue = Number(formData.get("points_value") || 0);
  const sortOrder = Number(formData.get("sort_order") || 0);

  if (!label) return;

  await supabase.from("livestat_codes").insert({
    label,
    slug: slugify(label),
    category,
    code_type: codeType,
    points_value: pointsValue,
    status: "active",
    sort_order: sortOrder,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  revalidatePath("/admin/livestat");
}

async function toggleCodeAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "inactive");

  if (!id) return;

  await supabase
    .from("livestat_codes")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin/livestat");
}

async function deleteCodeAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  await supabase.from("livestat_codes").delete().eq("id", id);

  revalidatePath("/admin/livestat");
}

export default async function AdminLiveStatPage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("livestat_codes")
    .select("*")
    .order("category", { ascending: true })
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  const codes = (data || []) as LiveStatCode[];

  const active = codes.filter((code) => code.status !== "inactive").length;
  const attaque = codes.filter((code) => code.category === "attaque").length;
  const defense = codes.filter((code) => code.category === "defense").length;
  const tir = codes.filter((code) => code.category === "tir").length;
  const pertes = codes.filter((code) => code.category === "perte_balle").length;

  return (
    <main className={styles.adminLiveStat}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>LiveStat</h1>
            <span>
              Gère les catégories de codage, boutons statistiques et actions qui
              alimenteront la prise de stats live.
            </span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{codes.length}</strong>
            <span>Codes</span>
          </div>
          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{active}</strong>
            <span>Actifs</span>
          </div>
          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{attaque}</strong>
            <span>Attaque</span>
          </div>
          <div className={`${styles.statCard} ${styles.purple}`}>
            <strong>{defense}</strong>
            <span>Défense</span>
          </div>
          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{tir}</strong>
            <span>Tirs</span>
          </div>
          <div className={`${styles.statCard} ${styles.dark}`}>
            <strong>{pertes}</strong>
            <span>Pertes</span>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Créer une action LiveStat</h2>
            <span>
              Exemple : Pick and Roll, Transition, Tir ouvert, Perte de balle,
              Rebond offensif.
            </span>
          </div>

          <form action={createCodeAction} className={styles.form}>
            <input name="label" placeholder="Ex : Pick and Roll" required />

            <select name="category" defaultValue="attaque">
              <option value="attaque">Attaque</option>
              <option value="defense">Défense</option>
              <option value="tir">Tir</option>
              <option value="rebond">Rebond</option>
              <option value="passe">Passe</option>
              <option value="perte_balle">Perte de balle</option>
              <option value="faute">Faute</option>
              <option value="special">Spécial</option>
            </select>

            <select name="code_type" defaultValue="event">
              <option value="event">Événement</option>
              <option value="shot">Tir</option>
              <option value="stat">Stat simple</option>
              <option value="tag">Tag vidéo/jeu</option>
            </select>

            <input
              name="points_value"
              type="number"
              defaultValue={0}
              placeholder="Points"
            />

            <input
              name="sort_order"
              type="number"
              defaultValue={0}
              placeholder="Ordre"
            />

            <button type="submit">Créer l’action</button>
          </form>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Actions de codage</h2>
            <span>{codes.length} actions</span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Slug</th>
                  <th>Catégorie</th>
                  <th>Type</th>
                  <th>Points</th>
                  <th>Ordre</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {codes.map((code) => {
                  const nextStatus =
                    code.status === "inactive" ? "active" : "inactive";

                  return (
                    <tr key={code.id}>
                      <td>
                        <strong>{code.label}</strong>
                      </td>
                      <td>{code.slug || "—"}</td>
                      <td>{code.category || "—"}</td>
                      <td>{code.code_type || "event"}</td>
                      <td>{code.points_value ?? 0}</td>
                      <td>{code.sort_order ?? 0}</td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${statusClass(
                            code.status
                          )}`}
                        >
                          {statusLabel(code.status)}
                        </span>
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <Link href={`/admin/livestat/${code.id}`}>
                            Modifier
                          </Link>

                          <form action={toggleCodeAction}>
                            <input type="hidden" name="id" value={code.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={nextStatus}
                            />
                            <button type="submit">
                              {code.status === "inactive"
                                ? "Activer"
                                : "Désactiver"}
                            </button>
                          </form>

                          <form action={deleteCodeAction}>
                            <input type="hidden" name="id" value={code.id} />
                            <button type="submit" className={styles.dangerBtn}>
                              Supprimer
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {codes.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.emptyState}>
                        Aucune action LiveStat créée.
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