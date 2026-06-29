"use client";

import { useMemo, useState } from "react";
import type { GroupedFilters, Product } from "@/types/shop";
import { FILTER_GROUP_LABELS } from "@/types/shop";
import { effectivePriceCents } from "@/lib/shop/format";
import { SHOP_CSS } from "@/components/shop/shopCss";
import ShopCard from "@/components/shop/ShopCard";

type Selection = Record<string, Set<string>>;

const GROUP_ORDER = ["category", "price"];

function priceMatches(value: string, priceCents: number) {
  if (value === "under-20") return priceCents < 2000;
  if (value === "20-50") return priceCents >= 2000 && priceCents <= 5000;
  if (value === "over-50") return priceCents > 5000;
  return true;
}

export default function ShopBrowser({
  products,
  filters,
}: {
  products: Product[];
  filters: GroupedFilters;
}) {
  const [q, setQ] = useState("");
  const [selection, setSelection] = useState<Selection>({});
  const [sort, setSort] = useState<"recent" | "price_asc" | "price_desc">(
    "recent"
  );

  const toggle = (group: string, value: string) =>
    setSelection((state) => {
      const next: Selection = { ...state };
      const set = new Set(next[group] ?? []);

      if (set.has(value)) {
        set.delete(value);
      } else {
        set.add(value);
      }

      next[group] = set;
      return next;
    });

  const clearAll = () => setSelection({});

  const activeCount = Object.values(selection).reduce(
    (total, set) => total + set.size,
    0
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();

    let list = products.filter((product) => {
      if (term) {
        const haystack = [
          product.name,
          product.description,
          product.category,
          product.status,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(term)) return false;
      }

      for (const group of GROUP_ORDER) {
        const set = selection[group];

        if (!set || set.size === 0) continue;

        if (group === "price") {
          const ok = [...set].some((value) =>
            priceMatches(value, effectivePriceCents(product.price_cents))
          );

          if (!ok) return false;
        }

        if (group === "category") {
          if (!product.category || !set.has(product.category)) return false;
        }
      }

      return true;
    });

    if (sort === "price_asc") {
      list = [...list].sort(
        (a, b) =>
          effectivePriceCents(a.price_cents) -
          effectivePriceCents(b.price_cents)
      );
    }

    if (sort === "price_desc") {
      list = [...list].sort(
        (a, b) =>
          effectivePriceCents(b.price_cents) -
          effectivePriceCents(a.price_cents)
      );
    }

    if (sort === "recent") {
      list = [...list].sort(
        (a, b) =>
          new Date(b.created_at || 0).getTime() -
          new Date(a.created_at || 0).getTime()
      );
    }

    return list;
  }, [products, q, selection, sort]);

  return (
    <div className="shop">
      <style>{SHOP_CSS}</style>

      <header className="shop-hero shop-hero-image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/boutique-banner.png"
          alt="Boutique MyBasket"
          className="shop-hero-img"
        />
      </header>

      <div className="shop-layout">
        <aside className="shop-filters">
          <h3>Filtres</h3>

          {activeCount > 0 && (
            <button type="button" className="shop-clear" onClick={clearAll}>
              Effacer ({activeCount})
            </button>
          )}

          {GROUP_ORDER.filter((group) => (filters[group]?.length ?? 0) > 0).map(
            (group) => (
              <div className="shop-fgroup" key={group}>
                <b>{FILTER_GROUP_LABELS[group] ?? group}</b>

                {filters[group].map((filter) => (
                  <label className="shop-chk" key={filter.id}>
                    <input
                      type="checkbox"
                      checked={selection[group]?.has(filter.value) ?? false}
                      onChange={() => toggle(group, filter.value)}
                    />
                    {filter.label}
                  </label>
                ))}
              </div>
            )
          )}
        </aside>

        <section>
          <div className="shop-search">
            <span className="ico">🔍</span>

            <input
              placeholder="Rechercher un produit, une catégorie…"
              value={q}
              onChange={(event) => setQ(event.target.value)}
            />
          </div>

          <div className="shop-toolbar">
            <span className="shop-count">
              {filtered.length} produit{filtered.length > 1 ? "s" : ""}
            </span>

            <select
              className="shop-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as typeof sort)}
            >
              <option value="recent">Les plus récents</option>
              <option value="price_asc">Prix croissant</option>
              <option value="price_desc">Prix décroissant</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="shop-empty">
              Aucun produit ne correspond à votre recherche.
            </div>
          ) : (
            <div className="shop-grid">
              {filtered.map((product) => (
                <ShopCard key={product.id} p={product} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}