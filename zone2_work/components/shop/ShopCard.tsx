import Link from "next/link";
import type { Product } from "@/types/shop";
import { discountPct, eur } from "@/lib/shop/format";

export default function ShopCard({ p }: { p: Product }) {
  const hasDiscount = Boolean(p.compare_at_price_cents && p.compare_at_price_cents > p.price_cents);
  const percent = hasDiscount ? discountPct(p.compare_at_price_cents, p.price_cents) : 0;
  const isNew = Boolean(p.created_at && Date.now() - new Date(p.created_at).getTime() < 1000 * 60 * 60 * 24 * 21);
  const free = (p.price_cents || 0) === 0;

  return (
    <Link href={`/boutique/${p.slug || p.id}`} className="sc">
      <div className="sc-media">
        {p.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.image_url} alt={p.name} />
        ) : (
          <div className="sc-noimg">🏀</div>
        )}
        <div className="sc-badges">
          {hasDiscount && percent ? <span className="sc-badge promo">-{percent}%</span> : null}
          {p.is_featured ? <span className="sc-badge premium">VEDETTE</span> : null}
          {isNew ? <span className="sc-badge new">NOUVEAU</span> : null}
        </div>
      </div>
      <div className="sc-body">
        <div className="sc-meta">{p.category ? <span className="sc-tag">{p.category}</span> : null}</div>
        <h3 className="sc-title">{p.name}</h3>
        <div className="sc-foot">
          <div className="sc-price">
            {free ? <span className="free">Gratuit</span> : <>
              <span className="now">{eur(p.price_cents)}</span>
              {hasDiscount ? <span className="old">{eur(p.compare_at_price_cents)}</span> : null}
            </>}
          </div>
          <span className="sc-cta">Voir le produit</span>
        </div>
      </div>
    </Link>
  );
}
