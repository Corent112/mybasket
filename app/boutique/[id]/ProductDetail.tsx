"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { Product } from "@/types/shop";
import { addProductToCart } from "@/lib/shop/cart-client";
import styles from "./ProductDetail.module.css";

function formatPrice(cents: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(cents || 0) / 100);
}

function isClothing(product: Product) {
  const category = String(product.category || "").toLowerCase();
  return category.includes("vêtement") || category.includes("vetement");
}

function cleanText(value: unknown) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, length = 250) {
  if (value.length <= length) return value;
  const cut = value.slice(0, length);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 150 ? lastSpace : length).trim()}…`;
}

function descriptionParagraphs(value: string) {
  const sentences = value.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) ?? [];
  const paragraphs: string[] = [];

  for (let index = 0; index < sentences.length; index += 3) {
    paragraphs.push(sentences.slice(index, index + 3).join(" "));
  }

  return paragraphs.length > 0 ? paragraphs : [value];
}

export default function ProductDetail({ product }: { product: Product }) {
  const metadata = (product.metadata || {}) as Record<string, unknown>;
  const taxRate = Number(metadata.tax_rate ?? 20);
  const priceHtCents = Number(
    metadata.price_ht_cents ?? Math.round(product.price_cents / (1 + taxRate / 100)),
  );

  const configuredSizes = Array.isArray(metadata.sizes)
    ? metadata.sizes.map(String).filter(Boolean)
    : [];

  const sizes = isClothing(product)
    ? configuredSizes.length > 0
      ? configuredSizes
      : ["XS", "S", "M", "L", "XL", "XXL"]
    : [];

  const name = product.name || product.title || "Produit MyBasket";
  const fullDescription = cleanText(
    product.description ||
      product.description_long ||
      product.description_short ||
      "Produit conçu pour l’univers du basketball et sélectionné par MyBasket.",
  );
  const shortDescription = cleanText(product.description_short) || truncate(fullDescription, 265);
  const paragraphs = descriptionParagraphs(fullDescription);
  const mainImage = product.image_url || product.images?.[0] || null;
  const gallery = Array.from(
    new Set([mainImage, ...(product.images || [])].filter(Boolean)),
  ) as string[];

  const [selectedImage, setSelectedImage] = useState(mainImage || "");
  const [quantity, setQuantity] = useState(1);
  const [size, setSize] = useState(sizes[0] || "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const maxQuantity = useMemo(() => {
    if (product.stock_quantity == null) return 99;
    return Math.max(1, product.stock_quantity);
  }, [product.stock_quantity]);

  const outOfStock = product.stock_quantity === 0;
  const saving = product.compare_at_price_cents
    ? Math.max(0, product.compare_at_price_cents - product.price_cents)
    : 0;

  function changeQuantity(next: number) {
    setQuantity(Math.min(maxQuantity, Math.max(1, next)));
  }

  function addToCart() {
    if (isClothing(product) && !size) {
      setMessage("Choisis une taille avant d’ajouter le produit.");
      return;
    }

    setMessage("");
    startTransition(async () => {
      try {
        const result = await addProductToCart(product, {
          quantity,
          size: size || null,
        });

        if (result.ok) {
          setMessage(
            `${quantity} article${quantity > 1 ? "s" : ""} ajouté${quantity > 1 ? "s" : ""} au panier.`,
          );
        }
      } catch (error) {
        setMessage(
          error instanceof Error ? error.message : "Ajout au panier impossible.",
        );
      }
    });
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <nav className={styles.breadcrumbs} aria-label="Fil d’Ariane">
          <Link href="/boutique">Boutique</Link>
          <span>›</span>
          <span>{product.category || "Produit"}</span>
          <span>›</span>
          <strong>{name}</strong>
        </nav>

        <section className={styles.productLayout}>
          <div className={styles.galleryColumn}>
            <div className={styles.mainMedia}>
              {selectedImage ? (
                <img src={selectedImage} alt={name} />
              ) : (
                <div className={styles.fallback}>MB</div>
              )}

              <div className={styles.mediaBadges}>
                {product.is_featured && <span>Sélection MyBasket</span>}
                {saving > 0 && (
                  <span className={styles.promoBadge}>
                    − {formatPrice(saving)}
                  </span>
                )}
              </div>
            </div>

            {gallery.length > 1 && (
              <div className={styles.thumbnails}>
                {gallery.map((image) => (
                  <button
                    type="button"
                    key={image}
                    className={selectedImage === image ? styles.thumbActive : ""}
                    onClick={() => setSelectedImage(image)}
                    aria-label="Afficher cette image"
                  >
                    <img src={image} alt="" />
                  </button>
                ))}
              </div>
            )}

            <div className={styles.deliveryStrip}>
              <div>
                <span>01</span>
                <strong>Livraison suivie</strong>
                <small>Commande préparée avec soin</small>
              </div>
              <div>
                <span>02</span>
                <strong>Paiement sécurisé</strong>
                <small>Carte, PayPal et Apple Pay</small>
              </div>
              <div>
                <span>03</span>
                <strong>Support MyBasket</strong>
                <small>Une équipe disponible</small>
              </div>
            </div>
          </div>

          <aside className={styles.infoColumn}>
            <div className={styles.topMeta}>
              <span>{product.category || "MyBasket"}</span>
              {outOfStock ? (
                <b className={styles.stockOut}>Rupture</b>
              ) : (
                <b>En stock</b>
              )}
            </div>

            <h1>{name}</h1>
            <p className={styles.subtitle}>{shortDescription}</p>
            <a className={styles.readMore} href="#description-complete">
              Lire la description complète ↓
            </a>

            <div className={styles.pricePanel}>
              <div>
                <strong>{formatPrice(product.price_cents)}</strong>
                <span>TTC</span>
              </div>
              {product.compare_at_price_cents ? (
                <s>{formatPrice(product.compare_at_price_cents)}</s>
              ) : null}
              <small>
                {formatPrice(priceHtCents)} HT · TVA {taxRate}%
              </small>
            </div>

            {sizes.length > 0 && (
              <section className={styles.optionSection}>
                <div className={styles.optionHeader}>
                  <strong>Choisir une taille</strong>
                  <span>{size || "Aucune taille sélectionnée"}</span>
                </div>
                <div className={styles.sizes}>
                  {sizes.map((currentSize) => (
                    <button
                      type="button"
                      key={currentSize}
                      className={size === currentSize ? styles.sizeActive : ""}
                      onClick={() => setSize(currentSize)}
                    >
                      {currentSize}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className={styles.purchaseSection}>
              <div className={styles.quantityLabel}>
                <strong>Quantité</strong>
                <small>
                  {product.stock_quantity == null
                    ? "Disponible"
                    : `${product.stock_quantity} unité${product.stock_quantity > 1 ? "s" : ""} disponible${product.stock_quantity > 1 ? "s" : ""}`}
                </small>
              </div>

              <div className={styles.purchaseRow}>
                <div className={styles.quantity}>
                  <button
                    type="button"
                    onClick={() => changeQuantity(quantity - 1)}
                    aria-label="Réduire la quantité"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxQuantity}
                    value={quantity}
                    onChange={(event) =>
                      changeQuantity(Number(event.target.value || 1))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => changeQuantity(quantity + 1)}
                    aria-label="Augmenter la quantité"
                  >
                    +
                  </button>
                </div>

                <button
                  type="button"
                  className={styles.addButton}
                  onClick={addToCart}
                  disabled={pending || outOfStock}
                >
                  <span>
                    {pending
                      ? "Ajout en cours…"
                      : outOfStock
                        ? "Produit indisponible"
                        : "Ajouter au panier"}
                  </span>
                  {!outOfStock && (
                    <b>{formatPrice(product.price_cents * quantity)}</b>
                  )}
                </button>
              </div>
            </section>

            {message && (
              <div className={styles.message}>
                <span>✓</span>
                <p>{message}</p>
                <Link href="/panier">Voir mon panier →</Link>
              </div>
            )}

            <div className={styles.reassurance}>
              <p><span>✓</span> Produit officiel MyBasket</p>
              <p><span>✓</span> Paiement 100 % sécurisé</p>
              <p><span>✓</span> Service client disponible</p>
            </div>
          </aside>
        </section>

        <section className={styles.featuresSection}>
          <div className={styles.sectionHeading}>
            <span>POURQUOI CE PRODUIT ?</span>
            <h2>Conçu pour être utile.<br />Pensé pour durer.</h2>
          </div>
          <div className={styles.featureGrid}>
            <article><b>01</b><strong>Prêt à l’emploi</strong><p>Une prise en main immédiate, sans configuration compliquée.</p></article>
            <article><b>02</b><strong>Pour les coachs</strong><p>Une conception adaptée aux besoins réels du terrain.</p></article>
            <article><b>03</b><strong>Qualité MyBasket</strong><p>Un produit sélectionné pour sa clarté et sa durabilité.</p></article>
            <article><b>04</b><strong>Suivi simple</strong><p>Commande et panier accessibles depuis ton espace personnel.</p></article>
          </div>
        </section>

        <section id="description-complete" className={styles.detailsSection}>
          <div className={styles.detailsIntro}>
            <span>À PROPOS DU PRODUIT</span>
            <h2>{name}</h2>
            <p>Tout ce qu’il faut savoir avant de commander.</p>
          </div>
          <div className={styles.detailsContent}>
            {paragraphs.map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
            ))}
            <ul>
              <li>Produit sélectionné par l’équipe MyBasket</li>
              <li>Adapté aux besoins des coachs, joueurs et clubs</li>
              <li>Commande suivie depuis ton espace personnel</li>
            </ul>
          </div>
        </section>

        <div className={styles.bottomActions}>
          <Link href="/boutique">← Continuer mes achats</Link>
          <Link href="/panier">Accéder au panier →</Link>
        </div>
      </div>
    </main>
  );
}
