"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/types/shop";
import { eur } from "@/lib/shop/format";
import {
  deleteProduct,
  duplicateProduct,
  toggleProductActive,
} from "@/lib/shop/actions";
import { SHOP_CSS } from "@/components/shop/shopCss";

type SortKey = "name" | "price_cents" | "category" | "created_at";

const PAGE = 10;

function isActive(product: Product) {
  return product.status === "active";
}

export default function AdminProducts({ products }: { products: Product[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [pending, start] = useTransition();
  const [toast, setToast] = useState("");

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  };

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();

    let list = products.filter((product) => {
      const haystack = [
        product.name,
        product.category,
        product.description,
        product.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return !term || haystack.includes(term);
    });

    list = [...list].sort((a, b) => {
      const av =
        sortKey === "created_at"
          ? new Date(a.created_at || 0).getTime()
          : sortKey === "price_cents"
            ? a.price_cents || 0
            : String(a[sortKey] || "");

      const bv =
        sortKey === "created_at"
          ? new Date(b.created_at || 0).getTime()
          : sortKey === "price_cents"
            ? b.price_cents || 0
            : String(b[sortKey] || "");

      if (av < bv) return asc ? -1 : 1;
      if (av > bv) return asc ? 1 : -1;
      return 0;
    });

    return list;
  }, [products, q, sortKey, asc]);

  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice((page - 1) * PAGE, page * PAGE);

  const sortBy = (key: SortKey) => {
    if (key === sortKey) {
      setAsc(!asc);
    } else {
      setSortKey(key);
      setAsc(true);
    }
  };

  const onToggle = (product: Product) =>
    start(async () => {
      await toggleProductActive(product.id, !isActive(product));
      flash(isActive(product) ? "Produit désactivé" : "Produit activé");
      router.refresh();
    });

  const onDup = (product: Product) =>
    start(async () => {
      await duplicateProduct(product.id);
      flash("Produit dupliqué");
      router.refresh();
    });

  const onDel = (product: Product) => {
    if (confirm(`Supprimer « ${product.name} » ?`)) {
      start(async () => {
        await deleteProduct(product.id);
        flash("Produit supprimé");
        router.refresh();
      });
    }
  };

  return (
    <div className="adm">
      <style>{SHOP_CSS}</style>

      <div className="adm-head">
        <div>
          <h1>BOUTIQUE — PRODUITS</h1>
          <p>{products.length} produit(s) · gère ton catalogue.</p>
        </div>

        <div style={{ display: "flex", gap: ".6rem" }}>
          <button
            type="button"
            className="adm-btn ghost"
            onClick={() => router.push("/admin/boutique/filtres")}
          >
            ⚙ Filtres
          </button>

          <button
            type="button"
            className="adm-btn primary"
            onClick={() => router.push("/admin/boutique/nouveau")}
          >
            + Ajouter un produit
          </button>
        </div>
      </div>

      <div className="adm-tools">
        <input
          placeholder="Rechercher…"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
        />

        <span className="shop-count">{rows.length} résultat(s)</span>
      </div>

      <table className="adm-table">
        <thead>
          <tr>
            <th />
            <th onClick={() => sortBy("name")}>Produit</th>
            <th onClick={() => sortBy("category")}>Catégorie</th>
            <th onClick={() => sortBy("price_cents")}>Prix</th>
            <th>Statut</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {view.map((product) => (
            <tr key={product.id}>
              <td>
                {product.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="adm-thumb" src={product.image_url} alt="" />
                ) : (
                  <div className="adm-thumb" />
                )}
              </td>

              <td>
                <b>{product.name}</b>
                {product.is_featured ? " ⭐" : ""}
              </td>

              <td>{product.category ?? "—"}</td>

              <td>
                <b>{eur(product.price_cents)}</b>
                {product.compare_at_price_cents ? (
                  <>
                    {" "}
                    <s style={{ color: "#aaa" }}>
                      {eur(product.compare_at_price_cents)}
                    </s>
                  </>
                ) : null}
              </td>

              <td>
                <span className={`adm-pill ${isActive(product) ? "on" : "off"}`}>
                  {isActive(product) ? "Actif" : "Inactif"}
                </span>
              </td>

              <td>
                <div className="adm-rowacts">
                  <button
                    type="button"
                    onClick={() => router.push(`/admin/boutique/${product.id}`)}
                  >
                    Modifier
                  </button>

                  <button
                    type="button"
                    onClick={() => onToggle(product)}
                    disabled={pending}
                  >
                    {isActive(product) ? "Désactiver" : "Activer"}
                  </button>

                  <button
                    type="button"
                    onClick={() => onDup(product)}
                    disabled={pending}
                  >
                    Dupliquer
                  </button>

                  <button
                    type="button"
                    className="del"
                    onClick={() => onDel(product)}
                    disabled={pending}
                  >
                    Supprimer
                  </button>
                </div>
              </td>
            </tr>
          ))}

          {view.length === 0 && (
            <tr>
              <td
                colSpan={6}
                style={{ textAlign: "center", color: "#888", padding: "2rem" }}
              >
                Aucun produit.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {pages > 1 && (
        <div className="adm-pager">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
          >
            ←
          </button>

          <span>
            Page {page} / {pages}
          </span>

          <button
            type="button"
            onClick={() => setPage((current) => Math.min(pages, current + 1))}
            disabled={page === pages}
          >
            →
          </button>
        </div>
      )}

      {toast && <div className="adm-toast">{toast}</div>}
    </div>
  );
}