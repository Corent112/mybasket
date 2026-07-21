"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TESTIMONIALS } from "@/lib/mockData";
import { listExercises } from "@/lib/exercises";
import type { Exercise } from "@/types/exercise";
import { createClient } from "@/lib/supabase/client";

type HomeSlide = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  buttonLabel: string | null;
  buttonHref: string | null;
};

const FALLBACK_SLIDES: HomeSlide[] = [
  { id: "fallback-1", title: "LA RÉFÉRENCE DES COACHS", subtitle: "Exercices, systèmes et séances prêts à l'emploi.", imageUrl: null, buttonLabel: null, buttonHref: null },
  { id: "fallback-2", title: "CRÉE TES SYSTÈMES", subtitle: "Un éditeur de schémas pensé pour le terrain.", imageUrl: null, buttonLabel: null, buttonHref: null },
  { id: "fallback-3", title: "PARTAGE TA PLAQUETTE", subtitle: "Conçois et diffuse tes plaquettes en quelques clics.", imageUrl: null, buttonLabel: null, buttonHref: null },
];

const BIG_CARDS = [
  { href: "/bibliotheque", label: "BIBLIOTHÈQUE", image: "/images/home-bibliotheque.png" },
  { href: "/plaquette", label: "PLAQUETTE", image: "/images/home-plaquette.png" },
];

const SMALL_CARDS = [
  { href: "/accompagnement", label: "ACCOMPAGNEMENT", image: "/images/home-accompagnement.png" },
  { href: "/annonces", label: "ANNONCES", image: "/images/home-annonce.png" },
  { href: "/boutique", label: "BOUTIQUE", image: "/images/home-boutique.png" },
];

const typeLabel = () => "Exercice";

const formatDate = (value?: string | number) => {
  if (!value) return "Date inconnue";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const getLatestImage = (item: Exercise) => {
  return (
    item.schemaImages?.[0] ||
    item.diagrams?.[0]?.imageUrl ||
    item.images?.[0] ||
    "/images/home-plaquette.png"
  );
};

export default function Home() {
  const [current, setCurrent] = useState(0);
  const [slides, setSlides] = useState<HomeSlide[]>(FALLBACK_SLIDES);
  const latestSliderRef = useRef<HTMLDivElement | null>(null);
  const n = slides.length;

  const go = (i: number) => setCurrent((i + n) % n);

  const [latest, setLatest] = useState<Exercise[]>([]);

useEffect(() => {
  listExercises().then((items) => {
    setLatest(items.slice(0, 6));
  });

  const supabase = createClient();
  supabase
    .from("admin_slider")
    .select("id,title,subtitle,image_url,button_label,button_href")
    .eq("status", "active")
    .in("placement", ["home", "global"])
    .order("sort_order", { ascending: true })
    .then(({ data, error }: { data: any[] | null; error: any }) => {
      if (error || !data?.length) return;
      setSlides(data.map((slide: any) => ({
        id: String(slide.id),
        title: String(slide.title || "MYBASKET"),
        subtitle: String(slide.subtitle || ""),
        imageUrl: slide.image_url ? String(slide.image_url) : null,
        buttonLabel: slide.button_label ? String(slide.button_label) : null,
        buttonHref: slide.button_href ? String(slide.button_href) : null,
      })));
      setCurrent(0);
    });
}, []);

  const scrollLatest = (direction: "prev" | "next") => {
    const el = latestSliderRef.current;
    if (!el) return;

    const amount = el.clientWidth;
    el.scrollBy({
      left: direction === "next" ? amount : -amount,
      behavior: "smooth",
    });
  };

  return (
    <>
  

      <main>
        <section className="hero-slider">
          <div
            className="slides-wrap"
            style={{ transform: `translateX(-${current * 100}%)` }}
          >
            {slides.map((slide, index) => (
              <div
                className={`slide slide-bg-${(index % 3) + 1}`}
                key={slide.id}
                style={slide.imageUrl ? { backgroundImage: `linear-gradient(90deg, rgba(35, 5, 17, .82), rgba(107, 26, 44, .5)), url("${slide.imageUrl}")` } : undefined}
              >
                <div>
                  <h1>{slide.title}</h1>
                  <p>{slide.subtitle}</p>
                  {slide.buttonLabel && slide.buttonHref && (
                    <Link href={slide.buttonHref} className="hero-slide-button">{slide.buttonLabel}</Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="slider-arrows">
            <button
              className="slider-arrow"
              onClick={() => go(current - 1)}
              aria-label="Précédent"
            >
              ‹
            </button>

            <button
              className="slider-arrow"
              onClick={() => go(current + 1)}
              aria-label="Suivant"
            >
              ›
            </button>
          </div>

          <div className="slider-dots">
            {slides.map((_, index) => (
              <button
                key={index}
                className={`slider-dot ${index === current ? "active" : ""}`}
                onClick={() => go(index)}
                aria-label={`Slide ${index + 1}`}
              />
            ))}
          </div>
        </section>

        <div className="container">
          <div className="access-grid">
            {BIG_CARDS.map((card) => (
              <Link
                href={card.href}
                className="access-card home-photo-card"
                key={card.href}
                style={{ backgroundImage: `url("${card.image}")` }}
              >
                <div className="access-label">{card.label}</div>
              </Link>
            ))}
          </div>

          <div className="access-grid-small">
            {SMALL_CARDS.map((card) => (
              <Link
                href={card.href}
                className="access-card small home-photo-card"
                key={card.href}
                style={{ backgroundImage: `url("${card.image}")` }}
              >
                <div className="access-label">{card.label}</div>
              </Link>
            ))}
          </div>

          <section className="latest-home-section">
            <div className="section-title-bar">
              <h2>LES DERNIERS AJOUTS</h2>
            </div>

            {latest.length === 0 ? (
              <p className="empty-state">Aucun ajout pour le moment.</p>
            ) : (
              <div className="latest-slider-wrap">
                <button
                  className="latest-arrow latest-arrow-left"
                  onClick={() => scrollLatest("prev")}
                  aria-label="Voir les ajouts précédents"
                >
                  ‹
                </button>

                <div className="latest-slider" ref={latestSliderRef}>
                  <div className="latest-slider-track">
                    {latest.map((item) => (
                      <article className="latest-slide-card" key={item.id}>
                        <div className="latest-slide-img">
                          <img src={getLatestImage(item)} alt={item.title} />

                          <button
                            className="latest-heart"
                            aria-label="Ajouter aux favoris"
                          >
                            ♥
                          </button>
                        </div>

                        <div className="latest-slide-body">
                          <h3>{item.title}</h3>
                          
                            <p>{item.category || item.categorie || "Exercice"}</p>
                            <small>{formatDate(item.createdAt)}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <button
                  className="latest-arrow latest-arrow-right"
                  onClick={() => scrollLatest("next")}
                  aria-label="Voir les ajouts suivants"
                >
                  ›
                </button>
              </div>
            )}
          </section>

          <section className="testimonialsSection">
            <div className="section-title-bar">
              <h2>ILS NOUS FONT CONFIANCE</h2>
            </div>

            <div className="testimonialsList">
              {TESTIMONIALS.map((testimonial) => (
                <article className="testimonial-card" key={testimonial.id}>
                  <p className="testimonial-text">“{testimonial.text}”</p>
                  <p className="testimonial-name">{testimonial.name}</p>
                  <p className="testimonial-role">{testimonial.role}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>

      <style jsx>{`
        .slide {
          background-size: cover;
          background-position: center;
        }

        .hero-slide-button {
          display: inline-flex;
          align-items: center;
          min-height: 44px;
          margin-top: 18px;
          padding: 0 20px;
          border-radius: 8px;
          background: #d4a24c;
          color: #111;
          font-weight: 900;
          text-decoration: none;
        }

        .home-photo-card {
          background-size: cover !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
          background-color: transparent !important;
        }

        .home-photo-card::before,
        .home-photo-card::after {
          display: none !important;
          content: none !important;
          background: none !important;
        }

        .access-label {
          background: rgba(15, 15, 18, 0.78);
          color: #d4a24c;
          padding: 0.45rem 1rem;
          border-radius: 999px;
          margin-bottom: 0.8rem;
        }

        .home-photo-card:hover {
          transform: translateY(-2px);
          border-color: #d4a24c;
        }

        .latest-home-section {
          margin-top: 2.5rem;
        }

        .latest-slider-wrap {
          position: relative;
          width: 100%;
        }

        .latest-slider {
          width: 100%;
          overflow-x: auto;
          scroll-snap-type: x mandatory;
          scroll-behavior: smooth;
          padding: 0.25rem 0 1.5rem;
        }

        .latest-slider::-webkit-scrollbar {
          height: 8px;
        }

        .latest-slider::-webkit-scrollbar-thumb {
          background: #d4a24c;
          border-radius: 999px;
        }

        .latest-slider-track {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: calc((100% - 2rem) / 3);
          gap: 1rem;
        }

        .latest-slide-card {
          scroll-snap-align: start;
          border: 1px solid #c8c8c8;
          border-radius: 6px;
          overflow: hidden;
          background: #fff;
        }

        .latest-slide-img {
          position: relative;
          height: 230px;
          background: #6b1a2c;
          overflow: hidden;
        }

        .latest-slide-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .latest-heart {
          position: absolute;
          top: 14px;
          right: 14px;
          width: 46px;
          height: 46px;
          border-radius: 50%;
          background: #fff;
          color: #6b6b6b;
          font-size: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
        }

        .latest-slide-body {
          padding: 1rem 1.2rem 1.35rem;
        }

        .latest-slide-body h3 {
          font-size: 1.1rem;
          font-weight: 900;
          margin-bottom: 0.35rem;
          color: #0f0f12;
        }

        .latest-slide-body p {
          color: #6b6b6b;
          font-size: 0.95rem;
          margin-bottom: 0.4rem;
        }

        .latest-slide-body small {
          color: #6b6b6b;
          font-size: 0.78rem;
        }

        .latest-arrow {
          position: absolute;
          top: 42%;
          transform: translateY(-50%);
          z-index: 5;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: rgba(15, 15, 18, 0.9);
          color: #fff;
          font-size: 1.6rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .latest-arrow-left {
          left: -18px;
        }

        .latest-arrow-right {
          right: -18px;
        }

        @media (max-width: 900px) {
          .latest-slider-track {
            grid-auto-columns: calc((100% - 1rem) / 2);
          }
        }

        @media (max-width: 600px) {
          .latest-slider-track {
            grid-auto-columns: 85%;
          }

          .latest-slide-img {
            height: 190px;
          }

          .latest-arrow {
            display: none;
          }
        }
      `}</style>
    </>
  );
}