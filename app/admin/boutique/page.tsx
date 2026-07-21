import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/guard";
import { normalizeProduct } from "@/lib/shop/queries";
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
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

function formatMoney(cents: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(cents || 0) / 100);
}

function priceHt(product: Product) {
  const metadata = product.metadata || {};
  const taxRate = Number(metadata.tax_rate ?? 20);
  return Number(
    metadata.price_ht_cents ??
      Math.round(Number(product.price_cents || 0) / (1 + taxRate / 100)),
  );
}

function taxRate(product: Product) {
  return Number(product.metadata?.tax_rate ?? 20);
}

function statusLabel(status: string | null) {
  if (status === "active") return "Publié";
  if (status === "archived") return "Archivé";
  return "Brouillon";
}

function statusClass(status: string | null) {
  if (status === "active") return styles.active;
  if (status === "archived") return styles.archived;
  return styles.draft;
}

function revalidateShop() {
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
    .update({ status, active: status === "active", updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidateShop();
}

async function archiveProductAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const { error } = await supabase
    .from("products")
    .update({ status: "archived", active: false, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
  revalidateShop();
}

async function deleteProductAction(formData: FormData) {
  "use server";

  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw error;
  revalidateShop();
}

export default async function AdminBoutiquePage() {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) console.error("ADMIN_PRODUCTS_LOAD_ERROR", error);

  const products = (data || []).map((row) => normalizeProduct(row as Record<string, unknown>)) as Product[];
  const total = products.length;
  const active = products.filter((product) => product.status === "active").length;
  const draft = products.filter(
    (product) => !product.status || product.status === "draft",
  ).length;
  const archived = products.filter(
    (product) => product.status === "archived",
  ).length;
  const featured = products.filter((product) => product.is_featured).length;
  const stock = products.reduce(
    (sum, product) => sum + Number(product.stock_quantity || 0),
    0,
  );

  return (
    <main className={styles.adminShop}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div className={styles.heroContent}>
            <div>
              <p>Administration MyBasket</p>
              <h1>Boutique</h1>
              <span>
                Crée les produits en brouillon, ajoute leur image et publie-les
                seulement lorsqu’ils sont prêts.
              </span>
            </div>

            <Link href="/admin/boutique/nouveau" className={styles.newProductBtn}>
              + Créer un produit
            </Link>
          </div>
        </section>

        <section className={styles.statsGrid}>
          <div className={styles.statCard}>
            <strong>{total}</strong>
            <span>Produits</span>
          </div>
          <div className={`${styles.statCard} ${styles.green}`}>
            <strong>{active}</strong>
            <span>Publiés</span>
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

        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <div>
              <h2>Produits boutique</h2>
              <span>
                Un produit publié apparaît automatiquement dans la boutique du
                site.
              </span>
            </div>
            <strong>{total} produit(s)</strong>
          </div>

          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Produit</th>
                  <th>Catégorie</th>
                  <th>Prix HT</th>
                  <th>Prix TTC</th>
                  <th>TVA</th>
                  <th>Stock</th>
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
                            <div className={styles.noImage}>📦</div>
                          )}

                          <div>
                            <strong>{product.name || "Produit sans nom"}</strong>
                            <span>
                              {product.is_featured ? "⭐ Produit vedette" : product.slug}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>{product.category || "—"}</td>
                      <td>{formatMoney(priceHt(product))}</td>
                      <td>
                        <strong>{formatMoney(product.price_cents)}</strong>
                        {product.compare_at_price_cents ? (
                          <span className={styles.crossed}>
                            {formatMoney(product.compare_at_price_cents)}
                          </span>
                        ) : null}
                      </td>
                      <td>{taxRate(product)} %</td>
                      <td>{product.stock_quantity ?? 0}</td>

                      <td>
                        <span
                          className={`${styles.statusBadge} ${statusClass(
                            product.status,
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
                              <button type="submit">Archiver</button>
                            </form>
                          ) : null}

                          <form action={deleteProductAction}>
                            <input type="hidden" name="id" value={product.id} />
                            <button type="submit" className={styles.dangerBtn}>
                              Supprimer
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {products.length === 0 && (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.emptyState}>
                        Aucun produit. Clique sur « Créer un produit » pour
                        commencer.
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
