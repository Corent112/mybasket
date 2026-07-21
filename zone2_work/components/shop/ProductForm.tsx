"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GroupedFilters, Product, ProductDraft, ProductStatus } from "@/types/shop";
import { slugify } from "@/lib/shop/format";
import { upsertProduct } from "@/lib/shop/actions";
import { SHOP_CSS } from "@/components/shop/shopCss";

function centsToEuroInput(cents: number | null | undefined) {
  if (!cents) return "";
  return String(cents / 100);
}

function euroInputToCents(value: string) {
  const amount = Number(value.replace(",", "."));
  if (Number.isNaN(amount)) return 0;
  return Math.round(amount * 100);
}

const empty = (): ProductDraft => ({
  name: "",
  slug: "",
  description: "",
  category: null,
  image_url: null,
  price_cents: 0,
  compare_at_price_cents: null,
  stock_quantity: null,
  status: "draft",
  is_featured: false,
  metadata: {},
});

export default function ProductForm({ product, filters }: { product?: Product; filters: GroupedFilters }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState("");
  const [d, setD] = useState<ProductDraft>(product ? { ...empty(), ...product } : empty());
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => setD((state) => ({ ...state, [key]: value }));
  const opts = (group: string) => (filters[group] ?? []).map((filter) => filter.label);

  const submit = () => {
    if (!d.name.trim()) { setToast("Le nom du produit est obligatoire"); return; }
    start(async () => {
      await upsertProduct(product?.id ?? null, { ...d, slug: d.slug || slugify(d.name) });
      router.push("/admin/boutique");
      router.refresh();
    });
  };

  return (
    <div className="shop">
      <style>{SHOP_CSS}</style>
      <div className="pf">
        <h1>{product ? "Modifier le produit" : "Ajouter un produit"}</h1>
        <p className="sub">Renseigne les informations du produit affiché en boutique.</p>
        <div className="pf-card">
          <h2>Informations</h2>
          <label className="pf-lab">Nom *</label>
          <input type="text" value={d.name} onChange={(event) => set("name", event.target.value)} placeholder="Ex : Pack 50 exercices de tir" />
          <label className="pf-lab">Slug URL <span style={{ fontWeight: 400, textTransform: "none", color: "#999" }}>— laisse vide pour auto</span></label>
          <input type="text" value={d.slug || ""} onChange={(event) => set("slug", event.target.value)} placeholder={slugify(d.name) || "pack-50-exercices"} />
          <label className="pf-lab">Description</label>
          <textarea style={{ minHeight: 140 }} value={d.description || ""} onChange={(event) => set("description", event.target.value)} />
        </div>
        <div className="pf-card">
          <h2>Prix & stock</h2>
          <div className="pf-row">
            <div><label className="pf-lab">Prix (€)</label><input type="number" min={0} step="0.01" value={centsToEuroInput(d.price_cents)} onChange={(event) => set("price_cents", euroInputToCents(event.target.value))} /></div>
            <div><label className="pf-lab">Prix barré (€)</label><input type="number" min={0} step="0.01" value={centsToEuroInput(d.compare_at_price_cents)} onChange={(event) => set("compare_at_price_cents", event.target.value === "" ? null : euroInputToCents(event.target.value))} /></div>
            <div><label className="pf-lab">Stock</label><input type="number" min={0} value={d.stock_quantity ?? ""} onChange={(event) => set("stock_quantity", event.target.value === "" ? null : parseInt(event.target.value, 10))} /></div>
          </div>
        </div>
        <div className="pf-card">
          <h2>Classement</h2>
          <div className="pf-grid"><div><label className="pf-lab">Catégorie</label><select value={d.category ?? ""} onChange={(event) => set("category", event.target.value || null)}><option value="">— Choisir —</option>{opts("category").map((option) => <option key={option}>{option}</option>)}</select></div></div>
        </div>
        <div className="pf-card">
          <h2>Médias</h2>
          <label className="pf-lab">URL image principale</label>
          <input type="text" value={d.image_url ?? ""} onChange={(event) => set("image_url", event.target.value || null)} placeholder="https://..." />
        </div>
        <div className="pf-card">
          <h2>Options</h2>
          <div className="pf-switches">
            <label className="pf-switch"><input type="checkbox" checked={Boolean(d.is_featured)} onChange={(event) => set("is_featured", event.target.checked)} /> Mis en avant</label>
            <label className="pf-lab">Statut</label>
            <select value={d.status || "draft"} onChange={(event) => set("status", event.target.value as ProductStatus)}><option value="draft">Brouillon</option><option value="active">Actif visible</option><option value="archived">Archivé</option></select>
          </div>
        </div>
        <div className="pf-bar"><button type="button" className="adm-btn ghost" onClick={() => router.push("/admin/boutique")} disabled={pending}>Annuler</button><button type="button" className="adm-btn primary" onClick={submit} disabled={pending}>{pending ? "Enregistrement…" : "💾 Enregistrer"}</button></div>
      </div>
      {toast && <div className="adm-toast">{toast}</div>}
    </div>
  );
}
