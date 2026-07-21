"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  GroupedFilters,
  Product,
  ProductDraft,
  ProductStatus,
} from "@/types/shop";
import { slugify } from "@/lib/shop/format";
import { upsertProduct } from "@/lib/shop/actions";
import styles from "./ProductForm.module.css";

function centsToEuro(cents: number | null | undefined) {
  return Number(cents || 0) / 100;
}

function euroToCents(value: string | number) {
  const amount = Number(String(value).replace(",", "."));
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function fixedMoney(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function formatEuro(value: string | number) {
  const parsed = Number(String(value).replace(",", "."));
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number.isFinite(parsed) ? parsed : 0);
}

const empty = (): ProductDraft => ({
  name: "",
  slug: "",
  description: "",
  category: null,
  image_url: null,
  price_cents: 0,
  compare_at_price_cents: null,
  stock_quantity: 0,
  status: "draft",
  is_featured: false,
  metadata: {
    price_ht_cents: 0,
    tax_rate: 20,
  },
});

export default function ProductForm({
  product,
  filters,
}: {
  product?: Product;
  filters: GroupedFilters;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<ProductDraft>(
    product ? { ...empty(), ...product } : empty(),
  );

  const productMetadata = (draft.metadata || {}) as Record<string, unknown>;
  const initialTaxRate = Number(productMetadata.tax_rate ?? 20);
  const initialHtCents = Number(
    productMetadata.price_ht_cents ??
      Math.round((draft.price_cents || 0) / (1 + initialTaxRate / 100)),
  );

  const [taxRate, setTaxRate] = useState(
    Number.isFinite(initialTaxRate) ? initialTaxRate : 20,
  );
  const [priceHt, setPriceHt] = useState(fixedMoney(centsToEuro(initialHtCents)));
  const [priceTtc, setPriceTtc] = useState(
    fixedMoney(centsToEuro(draft.price_cents)),
  );

  const categories = useMemo(() => {
    const configured = (filters.category ?? []).map((filter) => filter.label);
    return Array.from(
      new Set(["Cahiers", "Accessoires", "Vêtements", ...configured]),
    );
  }, [filters]);

  const clothingCategory = String(draft.category || "").toLowerCase();
  const isClothing =
    clothingCategory.includes("vêtement") ||
    clothingCategory.includes("vetement");
  const sizesValue = Array.isArray(productMetadata.sizes)
    ? productMetadata.sizes.map(String).join(", ")
    : "XS, S, M, L, XL, XXL";

  const set = <K extends keyof ProductDraft>(
    key: K,
    value: ProductDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateFromHt = (value: string, rate = taxRate) => {
    setPriceHt(value);
    const ht = Number(value.replace(",", "."));
    if (!Number.isFinite(ht)) return;
    setPriceTtc(fixedMoney(ht * (1 + rate / 100)));
  };

  const updateFromTtc = (value: string, rate = taxRate) => {
    setPriceTtc(value);
    const ttc = Number(value.replace(",", "."));
    if (!Number.isFinite(ttc)) return;
    setPriceHt(fixedMoney(ttc / (1 + rate / 100)));
  };

  const changeTaxRate = (value: string) => {
    const rate = Number(value);
    const safeRate = Number.isFinite(rate) ? rate : 20;
    setTaxRate(safeRate);
    updateFromHt(priceHt, safeRate);
  };

  const uploadImage = async (file: File) => {
    setMessage("");
    setUploading(true);

    try {
      const body = new FormData();
      body.set("file", file);

      const response = await fetch("/api/admin/boutique/image", {
        method: "POST",
        body,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Upload impossible.");
      }

      set("image_url", String(payload.publicUrl || "") || null);
      setMessage("Image chargée avec succès.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload impossible.");
    } finally {
      setUploading(false);
    }
  };

  const submit = (status: ProductStatus) => {
    if (!draft.name.trim()) {
      setMessage("Le nom du produit est obligatoire.");
      return;
    }

    if (status === "active" && euroToCents(priceTtc) <= 0) {
      setMessage("Renseigne un prix TTC supérieur à 0 avant publication.");
      return;
    }

    const priceHtCents = euroToCents(priceHt);
    const priceTtcCents = euroToCents(priceTtc);

    startTransition(async () => {
      try {
        await upsertProduct(product?.id ?? null, {
          ...draft,
          slug: draft.slug || slugify(draft.name),
          status,
          price_cents: priceTtcCents,
          metadata: {
            ...(draft.metadata || {}),
            price_ht_cents: priceHtCents,
            tax_rate: taxRate,
            published_at:
              status === "active"
                ? new Date().toISOString()
                : productMetadata.published_at || null,
          },
        });

        router.push(
          status === "active"
            ? "/admin/boutique?published=1"
            : "/admin/boutique?saved=1",
        );
        router.refresh();
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Enregistrement impossible.",
        );
      }
    });
  };

  const currentStatus =
    draft.status === "active"
      ? "Publié"
      : draft.status === "archived"
        ? "Archivé"
        : "Brouillon";

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.kicker}>Back-office boutique</p>
            <h1 className={styles.title}>
              {product ? "Modifier le produit" : "Créer un produit"}
            </h1>
            <p className={styles.subtitle}>
              Prépare ton produit, vérifie son rendu puis publie-le. Un produit
              publié apparaît automatiquement dans la boutique du site.
            </p>
          </div>

          <button
            type="button"
            className={styles.backButton}
            onClick={() => router.push("/admin/boutique")}
          >
            ← Retour à la boutique
          </button>
        </header>

        <div className={styles.layout}>
          <div className={styles.mainColumn}>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Informations produit</h2>
                <span>Les informations visibles par le client</span>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.gridTwo}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="product-name">
                      Nom du produit *
                    </label>
                    <input
                      id="product-name"
                      className={styles.input}
                      type="text"
                      value={draft.name}
                      onChange={(event) => set("name", event.target.value)}
                      placeholder="Ex : Cahier d’entraînement MyBasket"
                    />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="product-slug">
                      Adresse URL
                    </label>
                    <input
                      id="product-slug"
                      className={styles.input}
                      type="text"
                      value={draft.slug || ""}
                      onChange={(event) => set("slug", event.target.value)}
                      placeholder={slugify(draft.name) || "cahier-entrainement"}
                    />
                    <span className={styles.help}>
                      Laisse vide pour la créer automatiquement.
                    </span>
                  </div>

                  <div className={`${styles.field} ${styles.fieldFull}`}>
                    <label className={styles.label} htmlFor="product-description">
                      Description
                    </label>
                    <textarea
                      id="product-description"
                      className={styles.textarea}
                      value={draft.description || ""}
                      onChange={(event) =>
                        set("description", event.target.value)
                      }
                      placeholder="Décris le produit, son contenu, son usage et ses points forts…"
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Prix et stock</h2>
                <span>Le prix TTC est calculé automatiquement</span>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.gridThree}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="price-ht">
                      Prix HT
                    </label>
                    <div className={styles.moneyInput}>
                      <input
                        id="price-ht"
                        className={styles.input}
                        type="number"
                        min={0}
                        step="0.01"
                        value={priceHt}
                        onChange={(event) => updateFromHt(event.target.value)}
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="tax-rate">
                      TVA
                    </label>
                    <select
                      id="tax-rate"
                      className={styles.select}
                      value={taxRate}
                      onChange={(event) => changeTaxRate(event.target.value)}
                    >
                      <option value={0}>0 %</option>
                      <option value={5.5}>5,5 %</option>
                      <option value={10}>10 %</option>
                      <option value={20}>20 %</option>
                    </select>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="price-ttc">
                      Prix TTC
                    </label>
                    <div className={styles.moneyInput}>
                      <input
                        id="price-ttc"
                        className={styles.input}
                        type="number"
                        min={0}
                        step="0.01"
                        value={priceTtc}
                        onChange={(event) => updateFromTtc(event.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className={styles.gridTwo} style={{ marginTop: 15 }}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="compare-price">
                      Prix barré TTC
                    </label>
                    <div className={styles.moneyInput}>
                      <input
                        id="compare-price"
                        className={styles.input}
                        type="number"
                        min={0}
                        step="0.01"
                        value={
                          draft.compare_at_price_cents
                            ? centsToEuro(draft.compare_at_price_cents)
                            : ""
                        }
                        onChange={(event) =>
                          set(
                            "compare_at_price_cents",
                            event.target.value === ""
                              ? null
                              : euroToCents(event.target.value),
                          )
                        }
                        placeholder="Optionnel"
                      />
                    </div>
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="stock">
                      Stock disponible
                    </label>
                    <input
                      id="stock"
                      className={styles.input}
                      type="number"
                      min={0}
                      value={draft.stock_quantity ?? ""}
                      onChange={(event) =>
                        set(
                          "stock_quantity",
                          event.target.value === ""
                            ? null
                            : Number.parseInt(event.target.value, 10),
                        )
                      }
                    />
                  </div>
                </div>

                <div className={styles.priceSummary}>
                  <div className={styles.priceStat}>
                    <span>Prix hors taxes</span>
                    <strong>{formatEuro(priceHt)}</strong>
                  </div>
                  <div className={styles.priceStat}>
                    <span>TVA appliquée</span>
                    <strong>{taxRate} %</strong>
                  </div>
                  <div className={styles.priceStat}>
                    <span>Prix public TTC</span>
                    <strong>{formatEuro(priceTtc)}</strong>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Classement</h2>
                <span>Organise le catalogue public</span>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.gridTwo}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="category">
                      Catégorie
                    </label>
                    <select
                      id="category"
                      className={styles.select}
                      value={draft.category ?? ""}
                      onChange={(event) =>
                        set("category", event.target.value || null)
                      }
                    >
                      <option value="">Choisir une catégorie</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isClothing ? (
                    <div className={styles.field}>
                      <label className={styles.label} htmlFor="sizes">
                        Tailles disponibles
                      </label>
                      <input
                        id="sizes"
                        className={styles.input}
                        type="text"
                        value={sizesValue}
                        onChange={(event) =>
                          set("metadata", {
                            ...(draft.metadata || {}),
                            sizes: event.target.value
                              .split(",")
                              .map((size) => size.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="XS, S, M, L, XL, XXL"
                      />
                      <span className={styles.help}>
                        Sépare les tailles par une virgule.
                      </span>
                    </div>
                  ) : (
                    <div className={styles.featureRow}>
                    <div>
                      <strong>Produit mis en avant</strong>
                      <small>Affiché en priorité dans la boutique.</small>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.is_featured)}
                        onChange={(event) =>
                          set("is_featured", event.target.checked)
                        }
                      />
                      <span className={styles.slider} />
                    </label>
                  </div>
                  )}
                </div>

                {isClothing && (
                  <div className={styles.featureRow} style={{ marginTop: 14 }}>
                    <div>
                      <strong>Produit mis en avant</strong>
                      <small>Affiché en priorité dans la boutique.</small>
                    </div>
                    <label className={styles.switch}>
                      <input
                        type="checkbox"
                        checked={Boolean(draft.is_featured)}
                        onChange={(event) =>
                          set("is_featured", event.target.checked)
                        }
                      />
                      <span className={styles.slider} />
                    </label>
                  </div>
                )}
              </div>
            </section>
          </div>

          <aside className={`${styles.sideColumn} ${styles.sticky}`}>
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Image principale</h2>
                <span>PNG, JPG ou WEBP</span>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.preview}>
                  {draft.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={draft.image_url} alt="Aperçu du produit" />
                  ) : (
                    <div className={styles.previewEmpty}>
                      <b>📦</b>
                      <span>Aucune image sélectionnée</span>
                    </div>
                  )}
                </div>

                <label className={styles.upload}>
                  {uploading ? "Chargement de l’image…" : "Choisir une image"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={uploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadImage(file);
                    }}
                  />
                </label>

                <div className={styles.field} style={{ marginTop: 13 }}>
                  <label className={styles.label} htmlFor="image-url">
                    Ou coller une URL d’image
                  </label>
                  <input
                    id="image-url"
                    className={styles.input}
                    type="url"
                    value={draft.image_url ?? ""}
                    onChange={(event) =>
                      set("image_url", event.target.value || null)
                    }
                    placeholder="https://…"
                  />
                </div>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <h2>Publication</h2>
                <span>Contrôle la visibilité du produit</span>
              </div>

              <div className={styles.cardBody}>
                <div className={styles.statusBox}>
                  <span>Statut actuel</span>
                  <strong className={styles.statusBadge}>{currentStatus}</strong>
                </div>

                <p className={styles.publishHint}>
                  En brouillon, le produit reste invisible. Après publication,
                  il est enregistré avec le statut <b>active</b> et apparaît
                  automatiquement dans <b>/boutique</b>.
                </p>

                <div className={styles.publicPreview}>
                  <small>Aperçu boutique</small>
                  <strong>{draft.name || "Nom du produit"}</strong>
                  <span>{formatEuro(priceTtc)} TTC</span>
                </div>

                <div className={styles.actions}>
                  <button
                    type="button"
                    className={`${styles.button} ${styles.secondaryButton}`}
                    onClick={() => submit("draft")}
                    disabled={pending || uploading}
                  >
                    Enregistrer en brouillon
                  </button>

                  <button
                    type="button"
                    className={`${styles.button} ${styles.primaryButton}`}
                    onClick={() => submit("active")}
                    disabled={pending || uploading}
                  >
                    {pending
                      ? "Publication en cours…"
                      : "Publier dans la boutique"}
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {message && <div className={styles.message}>{message}</div>}
    </main>
  );
}
