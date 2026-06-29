"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GroupedFilters, Product } from "@/types/shop";
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

export default function ShopBrowser({
  products = [],
  filters = {},
}: {
  products: Product[];
  filters: GroupedFilters;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Tous");
  const [price, setPrice] = useState("Tous");
  const [sort, setSort] = useState<SortMode>("recent");

  const categories = useMemo(() => {
    const fromFilters = filters.category?.map((filter) => filter.label) || [];

    const fromProducts = products
      .map((product) => product.category)
      .filter((value): value is string => Boolean(value));

    return ["Tous", ...Array.from(new Set([...fromFilters, ...fromProducts]))];
  }, [products, filters]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    const result = products.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const description = String(product.description || "").toLowerCase();

      const productCategory = product.category || "";
      const productPrice = product.price_cents || 0;

      const matchSearch =
        !query || name.includes(query) || description.includes(query);

      const matchCategory =
        category === "Tous" || productCategory === category;

      const matchPrice =
        price === "Tous" ||
        (price === "under-20" && productPrice < 2000) ||
        (price === "20-50" && productPrice >= 2000 && productPrice <= 5000) ||
        (price === "over-50" && productPrice > 5000);

      return matchSearch && matchCategory && matchPrice;
    });

    return result.sort((a, b) => {
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

  return (
    <main className={styles.shopPage}>
      <section className={styles.hero}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bandeau-boutique.jpg" alt="Boutique MyBasket" />
      </section>

      <section className={styles.section}>
        <div className={styles.title}>
          <div className={styles.titleLines}>
            <span />
            <span />
          </div>

          <h2>BOUTIQUE</h2>

          <div className={styles.titleLines}>
            <span />
            <span />
          </div>
        </div>

        <div className={styles.layout}>
          <aside className={styles.filters}>
            <input
              type="text"
              placeholder="Rechercher un produit..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />

            <div className={styles.filterBlock}>
              <div className={styles.filterTitle}>CATÉGORIE</div>

              {categories.map((currentCategory) => (
                <label key={currentCategory} className={styles.filterLine}>
                  <input
                    type="radio"
                    name="category"
                    checked={category === currentCategory}
                    onChange={() => setCategory(currentCategory)}
                  />
                  {currentCategory}
                </label>
              ))}
            </div>

            <div className={styles.filterBlock}>
              <div className={styles.filterTitle}>PRIX</div>

              {[
                ["Tous", "Tous"],
                ["under-20", "Moins de 20 €"],
                ["20-50", "20 € - 50 €"],
                ["over-50", "Plus de 50 €"],
              ].map(([value, label]) => (
                <label key={value} className={styles.filterLine}>
                  <input
                    type="radio"
                    name="price"
                    checked={price === value}
                    onChange={() => setPrice(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </aside>

          <div className={styles.productsZone}>
            <div className={styles.toolbar}>
              <p>{filteredProducts.length} produit(s)</p>

              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
              >
                <option value="recent">Plus récents</option>
                <option value="price-asc">Prix croissant</option>
                <option value="price-desc">Prix décroissant</option>
              </select>
            </div>

            {filteredProducts.length === 0 ? (
              <div className={styles.empty}>Aucun produit trouvé.</div>
            ) : (
              <div className={styles.grid}>
                {filteredProducts.map((product) => (
                  <article key={product.id} className={styles.card}>
                    <Link href={productHref(product)} className={styles.image}>
                      {product.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.image_url} alt={product.name} />
                      ) : (
                        <span>🏀</span>
                      )}

                      {product.is_featured && (
                        <b className={styles.featured}>Vedette</b>
                      )}
                    </Link>

                    <div className={styles.info}>
                      <h3>{product.name || "Produit MyBasket"}</h3>

                      <p>
                        {product.description ||
                          "Produit disponible dans la boutique MyBasket."}
                      </p>

                      <div className={styles.bottom}>
                        <div>
                          <strong>{formatPrice(product.price_cents)}</strong>

                          {product.compare_at_price_cents ? (
                            <span>
                              {formatPrice(product.compare_at_price_cents)}
                            </span>
                          ) : null}
                        </div>

                        <Link href={productHref(product)} className={styles.viewLink}>
                          Voir
                        </Link>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
