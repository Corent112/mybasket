import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import styles from "./page.module.css";

type Product = {
  id: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  category: string | null;
  image_url: string | null;
  price_cents: number | null;
  compare_at_price_cents: number | null;
  stock_quantity: number | null;
  status: string | null;
  is_featured: boolean | null;
  created_at: string | null;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function eurosToCents(value: FormDataEntryValue | null) {
  const raw = String(value || "").replace(",", ".").trim();
  const number = Number(raw);
  if (Number.isNaN(number)) return 0;
  return Math.round(number * 100);
}

function formatMoney(cents: number | null) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format((cents || 0) / 100);
}

function statusLabel(status: string | null) {
  if (status === "active") return "En vente";
  if (status === "draft") return "Brouillon";
  if (status === "archived") return "Archivé";
  return "Brouillon";
}

function statusClass(status: string | null) {
  if (status === "active") return styles.active;
  if (status === "archived") return styles.archived;
  return styles.draft;
}

async function createProductAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const category = String(formData.get("category") || "").trim();
  const imageUrl = String(formData.get("image_url") || "").trim();
  const priceCents = eurosToCents(formData.get("price"));
  const compareAtPriceCents = eurosToCents(formData.get("compare_at_price"));
  const stockQuantity = Number(formData.get("stock_quantity") || 0);
  const status = String(formData.get("status") || "draft");
  const isFeatured = formData.get("is_featured") === "on";

  if (!name) return;

  const { error } = await supabase.from("products").insert({
    name,
    slug: `${slugify(name)}-${Date.now()}`,
    description: description || null,
    category: category || null,
    image_url: imageUrl || null,
    price_cents: priceCents,
    compare_at_price_cents: compareAtPriceCents || null,
    stock_quantity: stockQuantity,
    status,
    is_featured: isFeatured,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) throw error;

  revalidatePath("/admin");
  revalidatePath("/admin/boutique");
  revalidatePath("/boutique");
}

async function toggleProductStatusAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "draft");

  if (!id) return;

  const { error } = await supabase
    .from("products")
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;

  revalidatePath("/admin");
  revalidatePath("/admin/boutique");
  revalidatePath("/boutique");
}

async function archiveProductAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") || "");
  if (!id) return;

  const { error } = await supabase
    .from("products")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;

  revalidatePath("/admin");
  revalidatePath("/admin/boutique");
  revalidatePath("/boutique");
}

export default async function AdminBoutiquePage() {
  const { supabase } = await requireAdmin();

  const { data } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  const products = (data || []) as Product[];

  const total = products.length;
  const active = products.filter((p) => p.status === "active").length;
  const draft = products.filter((p) => !p.status || p.status === "draft").length;
  const archived = products.filter((p) => p.status === "archived").length;
  const featured = products.filter((p) => p.is_featured).length;
  const stock = products.reduce((sum, p) => sum + (p.stock_quantity || 0), 0);

  return (
    <main className={styles.adminShop}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Boutique</h1>
            <span>
              Crée, publie, masque et archive les produits visibles dans la
              boutique du site.
            </span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{total}</strong>
            <span>Produits</span>
          </div>
          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{active}</strong>
            <span>En vente</span>
          </div>
          <div className={`${styles.statCard} ${styles.orange}`}>
            <strong>{draft}</strong>
            <span>Brouillons</span>
          </div>
          <div className={`${styles.statCard} ${styles.red}`}>
            <strong>{archived}</strong>
            <span>Archivés</span>
          </div>
          <div className={`${styles.statCard} ${styles.gold}`}>
            <strong>{featured}</strong>
            <span>Vedettes</span>
          </div>
          <div className={`${styles.statCard} ${styles.dark}`}>
            <strong>{stock}</strong>
            <span>Stock total</span>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h2>Créer un produit</h2>
            <span>Le produit peut être créé en brouillon ou publié directement.</span>
          </div>

          <form action={createProductAction} className={styles.form}>
            <input name="name" placeholder="Nom du produit" required />
            <input name="category" placeholder="Catégorie" />
            <input name="price" placeholder="Prix €" inputMode="decimal" />
            <input
              name="compare_at_price"
              placeholder="Prix barré €"
              inputMode="decimal"
            />
            <input
              name="stock_quantity"
              placeholder="Stock"
              type="number"
              defaultValue={0}
            />
            <input name="image_url" placeholder="URL image" />
            <textarea
              name="description"
              placeholder="Description du produit"
              rows={3}
            />

            <select name="status" defaultValue="draft">
              <option value="draft">Brouillon</option>
              <option value="active">En vente</option>
              <option value="archived">Archivé</option>
            </select>

            <label className={styles.check}>
              <input type="checkbox" name="is_featured" />
              Produit vedette
            </label>

            <button type="submit">Créer le produit</button>
          </form>
        </section>

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <h2>Produits boutique</h2>
            <span>{total} produits</span>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Catégorie</th>
                  <th>Prix</th>
                  <th>Stock</th>
                  <th>Vedette</th>
                  <th>Statut</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {products.map((product) => {
                  const nextStatus =
                    product.status === "active" ? "draft" : "active";

                  return (
                    <tr key={product.id}>
                      <td>
                        <div className={styles.productCell}>
                          {product.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.image_url} alt="" />
                          ) : (
                            <div className={styles.noImage}>🏀</div>
                          )}

                          <div>
                            <strong>{product.name || "Produit sans nom"}</strong>
                            <span>{product.slug || "slug-auto"}</span>
                          </div>
                        </div>
                      </td>

                      <td>{product.category || "—"}</td>

                      <td>
                        <strong>{formatMoney(product.price_cents)}</strong>
                        {product.compare_at_price_cents ? (
                          <span className={styles.crossed}>
                            {formatMoney(product.compare_at_price_cents)}
                          </span>
                        ) : null}
                      </td>

                      <td>{product.stock_quantity ?? 0}</td>
                      <td>{product.is_featured ? "Oui" : "Non"}</td>

                      <td>
                        <span
                          className={`${styles.statusBadge} ${statusClass(
                            product.status
                          )}`}
                        >
                          {statusLabel(product.status)}
                        </span>
                      </td>

                      <td>
                        <div className={styles.actions}>
                          <Link href={`/admin/boutique/${product.id}`}>
                            Modifier
                          </Link>

                          <form action={toggleProductStatusAction}>
                            <input type="hidden" name="id" value={product.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={nextStatus}
                            />
                            <button type="submit">
                              {product.status === "active"
                                ? "Masquer"
                                : "Publier"}
                            </button>
                          </form>

                          {product.status !== "archived" ? (
                            <form action={archiveProductAction}>
                              <input type="hidden" name="id" value={product.id} />
                              <button type="submit" className={styles.dangerBtn}>
                                Archiver
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {products.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className={styles.emptyState}>
                        Aucun produit créé pour le moment.
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
