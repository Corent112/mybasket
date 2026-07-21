"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GroupedFilters, Product } from "@/types/shop";
import { addProductToCart } from "@/lib/shop/cart-client";
import styles from "./ShopBrowser.module.css";

type SortMode = "recent" | "price-asc" | "price-desc";

function formatPrice(cents: number | null | undefined) {
  if (!cents) return "Prix bientôt disponible";
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function productHref(product: Product) {
  return `/boutique/${product.slug || product.id}`;
}

function isClothing(product: Product) {
  const category = String(product.category || "").toLowerCase();
  return category.includes("vêtement") || category.includes("vetement");
}

function productSizes(product: Product) {
  const metadata = product.metadata || {};
  const sizes = Array.isArray(metadata.sizes) ? metadata.sizes : [];
  return sizes.map(String).map((size) => size.trim()).filter(Boolean);
}

function stockLabel(product: Product) {
  if (product.stock_quantity === 0) return "Épuisé";
  if (product.stock_quantity != null && product.stock_quantity <= 5) {
    return `Plus que ${product.stock_quantity}`;
  }
  return "En stock";
}

function clampQuantity(value: number, product: Product) {
  const stock = Number(product.stock_quantity ?? 99);
  const max = stock > 0 ? stock : 1;
  return Math.max(1, Math.min(max, value));
}

export default function ShopBrowser({
  products = [],
}: {
  products: Product[];
  filters: GroupedFilters;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const [price, setPrice] = useState("Tous");
  const [sort, setSort] = useState<SortMode>("recent");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [sizes, setSizes] = useState<Record<string, string>>({});

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return products
      .filter((product) => {
        const name = String(product.name || product.title || "").toLowerCase();
        const description = String(
          product.description || product.description_short || "",
        ).toLowerCase();
        const productCategory = String(product.category || "");
        const productPrice = Number(product.price_cents || 0);

        return (
          (!query || name.includes(query) || description.includes(query)) &&
          (category === "Tous" || productCategory === category) &&
          (price === "Tous" ||
            (price === "under-20" && productPrice < 2000) ||
            (price === "20-50" && productPrice >= 2000 && productPrice <= 5000) ||
            (price === "over-50" && productPrice > 5000))
        );
      })
      .sort((a, b) => {
        if (sort === "price-asc") {
          return (a.price_cents || 0) - (b.price_cents || 0);
        }
        if (sort === "price-desc") {
          return (b.price_cents || 0) - (a.price_cents || 0);
        }
        return (
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
        );
      });
  }, [products, search, category, price, sort]);

  function quantityFor(product: Product) {
    return clampQuantity(quantities[product.id] || 1, product);
  }

  function updateQuantity(product: Product, next: number) {
    setQuantities((current) => ({
      ...current,
      [product.id]: clampQuantity(next, product),
    }));
  }

  async function addToCart(product: Product) {
    const clothing = isClothing(product);
    const availableSizes = productSizes(product);
    const selectedSize = sizes[product.id] || "";

    if (clothing && availableSizes.length > 0 && !selectedSize) {
      setMessage(`Choisis une taille pour « ${product.name || product.title} ».`);
      return;
    }

    setAddingId(product.id);
    setMessage("");

    try {
      const quantity = quantityFor(product);
      const result = await addProductToCart(product, {
        quantity,
        size: selectedSize || null,
      });

      if (result.ok) {
        setMessage(
          `${quantity} × « ${product.name || product.title} » ajouté${
            quantity > 1 ? "s" : ""
          } au panier.`,
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Ajout au panier impossible.",
      );
    } finally {
      setAddingId(null);
    }
  }

  function resetFilters() {
    setCategory("Tous");
    setPrice("Tous");
    setSearch("");
  }

  return (
    <main className={styles.page}>
      <section className={styles.banner} aria-label="Boutique MyBasket">
        <img src="/bandeau-boutique.jpg" alt="Boutique officielle MyBasket" />
      </section>

      <section className={styles.catalog} id="produits">
        <div className={styles.titleRow}>
          <span className={styles.titleRule} />
          <h1>BOUTIQUE</h1>
          <span className={styles.titleRule} />
        </div>

        <div className={styles.catalogHeader}>
          <div>
            <strong>
              {filteredProducts.length} produit
              {filteredProducts.length > 1 ? "s" : ""}
            </strong>
          </div>

          <div className={styles.topControls}>
            <div className={styles.searchBox}>
              <span>⌕</span>
              <input
                type="search"
                placeholder="Rechercher un produit"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>

            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              aria-label="Trier les produits"
            >
              <option value="recent">Plus récents</option>
              <option value="price-asc">Prix croissant</option>
              <option value="price-desc">Prix décroissant</option>
            </select>
          </div>
        </div>

        <div className={styles.catalogLayout}>
          <aside className={styles.filters}>
            <div className={styles.filterHeader}>
              <strong>Filtres</strong>
              <button type="button" onClick={resetFilters}>
                Réinitialiser
              </button>
            </div>

            <div className={styles.filterBlock}>
              <span>Catégories</span>
              {["Tous", "Cahiers", "Accessoires", "Vêtements"].map((value) => (
                <button
                  type="button"
                  key={value}
                  className={category === value ? styles.filterSelected : ""}
                  onClick={() => setCategory(value)}
                >
                  <i aria-hidden="true" />
                  <span>{value}</span>
                  <b>
                    {value === "Tous"
                      ? products.length
                      : products.filter((product) => product.category === value)
                          .length}
                  </b>
                </button>
              ))}
            </div>

            <div className={styles.filterBlock}>
              <span>Prix</span>
              {[
                ["Tous", "Tous les prix"],
                ["under-20", "Moins de 20 €"],
                ["20-50", "20 € à 50 €"],
                ["over-50", "Plus de 50 €"],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={price === value ? styles.filterSelected : ""}
                  onClick={() => setPrice(value)}
                >
                  <i aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </aside>

          <div className={styles.productsZone}>
            {message && (
              <div className={styles.message}>
                <span>{message}</span>
                <Link href="/panier">Voir le panier →</Link>
              </div>
            )}

            {filteredProducts.length === 0 ? (
              <div className={styles.empty}>
                <span>⌕</span>
                <h2>Aucun produit trouvé</h2>
                <p>Essaie une autre recherche ou réinitialise les filtres.</p>
              </div>
            ) : (
              <div className={styles.grid}>
                {filteredProducts.map((product) => {
                  const name = product.name || product.title || "Produit MyBasket";
                  const image = product.image_url || product.images?.[0];
                  const soldOut = product.stock_quantity === 0;
                  const quantity = quantityFor(product);
                  const availableSizes = productSizes(product);
                  const clothing = isClothing(product);

                  return (
                    <article key={product.id} className={styles.card}>
                      <Link href={productHref(product)} className={styles.image}>
                        {image ? (
                          <img src={image} alt={name} />
                        ) : (
                          <span className={styles.imageFallback}>MB</span>
                        )}

                        <div className={styles.badges}>
                          {product.is_featured && (
                            <b className={styles.featured}>Sélection</b>
                          )}
                          {product.compare_at_price_cents && (
                            <b className={styles.sale}>Promo</b>
                          )}
                        </div>
                      </Link>

                      <div className={styles.info}>
                        <div className={styles.metaLine}>
                          <span>{product.category || "MyBasket"}</span>
                          <small className={soldOut ? styles.out : ""}>
                            {stockLabel(product)}
                          </small>
                        </div>

                        <Link href={productHref(product)} className={styles.productName}>
                          <h2>{name}</h2>
                        </Link>

                        <p>
                          {product.description ||
                            product.description_short ||
                            "Produit officiel MyBasket."}
                        </p>

                        <div className={styles.priceLine}>
                          <strong>{formatPrice(product.price_cents)}</strong>
                          {product.compare_at_price_cents ? (
                            <s>{formatPrice(product.compare_at_price_cents)}</s>
                          ) : null}
                        </div>

                        {clothing && availableSizes.length > 0 && (
                          <div className={styles.sizeBlock}>
                            <label htmlFor={`size-${product.id}`}>Taille</label>
                            <select
                              id={`size-${product.id}`}
                              value={sizes[product.id] || ""}
                              onChange={(event) =>
                                setSizes((current) => ({
                                  ...current,
                                  [product.id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">Choisir</option>
                              {availableSizes.map((size) => (
                                <option key={size} value={size}>
                                  {size}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        <div className={styles.quantityBlock}>
                          <label>Quantité</label>
                          <div className={styles.quantityControl}>
                            <button
                              type="button"
                              className={styles.quantityButton}
                              onClick={() => updateQuantity(product, quantity - 1)}
                              disabled={quantity <= 1 || soldOut}
                              aria-label={`Réduire la quantité de ${name}`}
                            >
                              <span aria-hidden="true">−</span>
                            </button>

                            <output
                              className={styles.quantityValue}
                              aria-live="polite"
                              aria-label={`Quantité sélectionnée : ${quantity}`}
                            >
                              {quantity}
                            </output>

                            <button
                              type="button"
                              className={styles.quantityButton}
                              onClick={() => updateQuantity(product, quantity + 1)}
                              disabled={
                                soldOut ||
                                (product.stock_quantity != null &&
                                  quantity >= product.stock_quantity)
                              }
                              aria-label={`Augmenter la quantité de ${name}`}
                            >
                              <span aria-hidden="true">+</span>
                            </button>
                          </div>
                        </div>

                        <div className={styles.cardActions}>
                          <Link
                            href={productHref(product)}
                            className={styles.detailsButton}
                          >
                            Voir le produit
                          </Link>
                          <button
                            type="button"
                            className={styles.addButton}
                            onClick={() => addToCart(product)}
                            disabled={addingId === product.id || soldOut}
                          >
                            {soldOut
                              ? "Indisponible"
                              : addingId === product.id
                                ? "Ajout…"
                                : "Ajouter au panier"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
