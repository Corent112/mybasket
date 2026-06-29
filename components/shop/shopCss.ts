// components/shop/shopCss.ts
export const SHOP_CSS = `
.shop{
  --bdx:#6B1A2C;
  --bdx-d:#561321;
  --or:#D4A24C;
  --noir:#0F0F12;
  --gris:#f7f7f8;
  --bord:#e4e4e7;

  font-family:'Roboto',system-ui,sans-serif;
  color:var(--noir);
  max-width:1420px;
  margin:0 auto;
  padding:0 2rem 4rem;
}

.shop *{box-sizing:border-box}
.shop button{font-family:inherit;cursor:pointer}
.shop img{display:block;max-width:100%}
.shop a{color:inherit;text-decoration:none}

/* ----- Bandeau image boutique ----- */

.shop-hero{
  position:relative;
  width:100%;
  height:330px;
  border-radius:22px;
  overflow:hidden;
  margin:1.6rem 0 3rem;
  background:#fff;
  box-shadow:0 16px 42px rgba(0,0,0,.08);
}

.shop-hero-image{
  display:block;
}

.shop-hero-img{
  width:100%;
  height:100%;
  object-fit:cover;
  object-position:center;
}

/* ----- Layout boutique aéré ----- */

.shop-layout{
  display:grid;
  grid-template-columns:300px minmax(0,1fr);
  gap:56px;
  align-items:start;
}

/* ----- Recherche ----- */

.shop-search{
  display:flex;
  align-items:center;
  gap:.7rem;
  border:1px solid var(--bord);
  border-radius:999px;
  padding:.85rem 1.2rem;
  margin-bottom:1.4rem;
  background:#fff;
  box-shadow:0 8px 22px rgba(0,0,0,.035);
}

.shop-search input{
  border:none;
  outline:none;
  flex:1;
  font-size:1rem;
  background:transparent;
}

.shop-search .ico{color:#999}

/* ----- Filtres ----- */

.shop-filters{
  border:1px solid var(--bord);
  border-radius:20px;
  padding:1.4rem;
  position:sticky;
  top:1.2rem;
  background:#fff;
  box-shadow:0 12px 32px rgba(0,0,0,.05);
}

.shop-filters h3{
  font-family:'Alfa Slab One',serif;
  font-size:1.05rem;
  margin:0 0 .8rem;
  color:var(--noir);
}

.shop-fgroup{
  border-top:1px solid #f0f0f0;
  padding:1rem 0;
}

.shop-fgroup:first-of-type{
  border-top:none;
}

.shop-fgroup b{
  display:block;
  font-weight:900;
  text-transform:uppercase;
  font-size:.74rem;
  letter-spacing:.06em;
  color:var(--bdx);
  margin-bottom:.65rem;
}

.shop-chk{
  display:flex;
  align-items:center;
  gap:.6rem;
  font-size:.92rem;
  padding:.26rem 0;
  cursor:pointer;
  color:#222;
}

.shop-chk input{
  width:16px;
  height:16px;
  accent-color:var(--bdx);
}

.shop-clear{
  width:100%;
  margin:.3rem 0 .8rem;
  border:1px solid var(--or);
  background:#fff8ec;
  color:var(--bdx);
  border-radius:999px;
  font-weight:800;
  font-size:.84rem;
  padding:.55rem .8rem;
}

/* ----- Toolbar ----- */

.shop-toolbar{
  display:flex;
  justify-content:space-between;
  align-items:center;
  margin-bottom:1.4rem;
  gap:1rem;
  flex-wrap:wrap;
}

.shop-count{
  color:#777;
  font-size:.92rem;
}

.shop-sort{
  border:1px solid var(--bord);
  background:#fff;
  border-radius:12px;
  padding:.62rem .85rem;
  font-size:.92rem;
}

/* ----- Grille produits ----- */

.shop-grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(270px,1fr));
  gap:1.7rem;
}

.shop-empty{
  padding:4rem;
  text-align:center;
  color:#888;
  border:2px dashed var(--bord);
  border-radius:18px;
  background:#fff;
}

/* ----- Carte produit ----- */

.sc{
  border:1px solid var(--bord);
  border-radius:18px;
  overflow:hidden;
  background:#fff;
  display:flex;
  flex-direction:column;
  transition:transform .18s ease,box-shadow .18s ease;
}

.sc:hover{
  transform:translateY(-5px);
  box-shadow:0 16px 34px rgba(0,0,0,.11);
}

.sc-media{
  position:relative;
  aspect-ratio:4/3;
  background:#f0f0f0;
  overflow:hidden;
}

.sc-media img{
  width:100%;
  height:100%;
  object-fit:cover;
}

.sc-noimg{
  width:100%;
  height:100%;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:2.4rem;
  color:#cfcfcf;
}

.sc-badges{
  position:absolute;
  top:.6rem;
  left:.6rem;
  display:flex;
  gap:.35rem;
  flex-wrap:wrap;
}

.sc-badge{
  font-size:.7rem;
  font-weight:800;
  padding:.18rem .5rem;
  border-radius:6px;
  color:#fff;
  letter-spacing:.02em;
}

.sc-badge.promo{background:var(--bdx)}
.sc-badge.premium{background:var(--or);color:#1a1208}
.sc-badge.new{background:var(--noir)}

.sc-body{
  padding:1rem 1.05rem 1.15rem;
  display:flex;
  flex-direction:column;
  gap:.55rem;
  flex:1;
}

.sc-meta{
  display:flex;
  gap:.4rem;
  flex-wrap:wrap;
}

.sc-tag{
  font-size:.68rem;
  font-weight:700;
  text-transform:uppercase;
  letter-spacing:.03em;
  color:#666;
  background:var(--gris);
  border-radius:6px;
  padding:.18rem .48rem;
}

.sc-title{
  font-weight:900;
  font-size:1.04rem;
  line-height:1.25;
  margin:0;
  color:var(--noir);
}

.sc-foot{
  margin-top:auto;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:.7rem;
}

.sc-price{
  display:flex;
  align-items:baseline;
  gap:.45rem;
}

.sc-price .now{
  font-family:'Alfa Slab One',serif;
  font-size:1.25rem;
  color:var(--bdx);
}

.sc-price .old{
  font-size:.85rem;
  color:#aaa;
  text-decoration:line-through;
}

.sc-price .free{
  font-family:'Alfa Slab One',serif;
  font-size:1.1rem;
  color:#1f8a4c;
}

.sc-cta{
  border:2px solid var(--noir);
  background:var(--noir);
  color:#fff;
  border-radius:999px;
  padding:.48rem .95rem;
  font-weight:900;
  font-size:.82rem;
  white-space:nowrap;
}

.sc-cta:hover{
  background:#000;
}

/* ----- Responsive ----- */

@media (max-width:980px){
  .shop{
    padding:0 1rem 3rem;
  }

  .shop-hero{
    height:190px;
    border-radius:16px;
    margin-bottom:2rem;
  }

  .shop-layout{
    grid-template-columns:1fr;
    gap:2rem;
  }

  .shop-filters{
    position:static;
  }

  .shop-grid{
    grid-template-columns:repeat(auto-fill,minmax(220px,1fr));
  }
}
`;