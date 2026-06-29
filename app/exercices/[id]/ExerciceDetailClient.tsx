"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getExercise } from "@/lib/exercises";
import type { Exercise } from "@/types/exercise";

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\n|,/)
      .map((x) => x.trim())
      .filter(Boolean);
  }

  return [];
}

function rawText(exercise: Exercise, key: string) {
  const value = (exercise as unknown as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function statusLabel(status?: string | null) {
  if (status === "submitted") return "Soumis à MyBasket";
  if (status === "approved") return "Validé";
  if (status === "rejected") return "Refusé";
  return "Brouillon privé";
}

export default function ExerciceDetailClient() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const supabase = createClient();

  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [ready, setReady] = useState(false);
  const [current, setCurrent] = useState(0);
  const [addingSession, setAddingSession] = useState(false);
  const [addingFavorite, setAddingFavorite] = useState(false);

  useEffect(() => {
    async function loadExercise() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/abonnements");
          return;
        }

        if (!id) {
          setReady(true);
          return;
        }

        const data = await getExercise(id);
        setExercise(data);
      } catch (error) {
        console.error("Erreur chargement exercice :", error);
        setExercise(null);
      } finally {
        setReady(true);
      }
    }

    loadExercise();
  }, [id, router, supabase]);

  const images = useMemo(() => {
    if (!exercise) return [];

    if (exercise.diagrams?.length) {
      return exercise.diagrams
        .map((diagram) => diagram.imageUrl)
        .filter(Boolean) as string[];
    }

    if (exercise.schemaImages?.length) return exercise.schemaImages;

    return exercise.images ?? [];
  }, [exercise]);

  const steps = normalizeList(
    (exercise as unknown as Record<string, unknown> | null)?.deroulement
  );

  const consignes = normalizeList(
    exercise?.instructions ??
      (exercise as unknown as Record<string, unknown> | null)?.consignes
  );

  const variantes = normalizeList(
    (exercise as unknown as Record<string, unknown> | null)?.variantes
  );

  const videos = exercise?.videos ?? [];

  async function requireUser() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      console.error("ERREUR AUTH :", error);
      alert(error.message);
      return null;
    }

    if (!user) {
      router.push("/abonnements");
      return null;
    }

    return user;
  }

  async function addToPracticeSheet() {
    if (!exercise) return;

    setAddingSession(true);

    const user = await requireUser();

    if (!user) {
      setAddingSession(false);
      return;
    }

    const raw = exercise as unknown as Record<string, unknown>;

    const description =
      exercise.description ||
      String(raw.organisation ?? raw.objectif ?? raw.consigne ?? "");

    const payload = {
      user_id: user.id,
      item_type: "exercise",
      item_id: exercise.id,
      title: exercise.title || "Exercice sans titre",
      description,
      image_url: images[0] || "",
      price: 0,
      quantity: 1,
      duration_minutes: Number(exercise.duration || raw.temps || 10),
      assigned_to: "Coach principal",
      sort_order: Math.floor(Date.now() / 1000000),
      metadata: {
        source: "exercise_detail",
        exercise_id: exercise.id,
      },
    };

    const { error } = await supabase.from("cart_items").insert(payload);

    setAddingSession(false);

    if (error) {
      console.error("ERREUR CART_ITEMS :", error);
      alert(error.message || error.details || error.hint || JSON.stringify(error));
      return;
    }

    router.push("/panier");
  }

  async function addToFavorites() {
    if (!exercise) return;

    setAddingFavorite(true);

    const user = await requireUser();

    if (!user) {
      setAddingFavorite(false);
      return;
    }

    const { error } = await supabase.from("favorites").upsert(
      {
        user_id: user.id,
        item_type: "exercise",
        item_id: exercise.id,
        title: exercise.title || "Exercice sans titre",
        image_url: images[0] || "",
      },
      {
        onConflict: "user_id,item_type,item_id",
      }
    );

    setAddingFavorite(false);

    if (error) {
      console.error("ERREUR FAVORITES :", error);
      alert(error.message || error.details || error.hint || JSON.stringify(error));
      return;
    }

    router.push("/mon-compte?tab=favoris");
  }

  function editExercise() {
    const currentExercise = exercise;

    if (!currentExercise?.id) {
      alert("Impossible de modifier : exercice introuvable.");
      return;
    }

    localStorage.removeItem(`mybasket_exo_draft_${currentExercise.id}`);

    window.location.href = `/exercices/creer?id=${encodeURIComponent(
      String(currentExercise.id)
    )}`;
  }

  function prevImage() {
    setCurrent((value) => (value <= 0 ? images.length - 1 : value - 1));
  }

  function nextImage() {
    setCurrent((value) => (value >= images.length - 1 ? 0 : value + 1));
  }

  if (!ready) {
    return <main className="exo-detail">Chargement...</main>;
  }

  if (!exercise) {
    return (
      <main className="exo-detail">
        <section className="not-found">
          <h1>Exercice introuvable</h1>
          <p>
            Cet exercice est privé, supprimé, ou tu n’as pas les droits pour le consulter.
          </p>

          <button type="button" onClick={() => router.push("/exercices")}>
            ← Retour aux exercices
          </button>
        </section>

        <style jsx>{`
          .exo-detail {
            max-width: 1180px;
            margin: 0 auto;
            padding: 28px 20px 70px;
            color: #111;
          }

          .not-found {
            border: 1px solid #eee;
            border-radius: 20px;
            padding: 34px;
            text-align: center;
          }

          .not-found h1 {
            color: #6b1a2c;
            margin: 0 0 12px;
          }

          .not-found p {
            color: #666;
            margin-bottom: 20px;
          }

          button {
            border: 0;
            cursor: pointer;
            font-weight: 900;
            border-radius: 999px;
            padding: 12px 18px;
            background: #6b1a2c;
            color: white;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="exo-detail">
      <div className="exo-top">
        <button type="button" onClick={() => router.push("/exercices")}>
          ← Retour aux exercices
        </button>
      </div>

      <section className="exo-hero">
        <div>
          <p className="kicker">EXERCICE BASKETBALL</p>
          <h1>{exercise.title || "Exercice sans titre"}</h1>
          <p>Fiche exercice MyBasket</p>

          <div className="badges">
            <span>{exercise.visibility === "public" ? "Public" : "Privé"}</span>
            <span>{statusLabel(exercise.review_status)}</span>
          </div>

          {exercise.review_status === "rejected" && exercise.rejection_reason && (
            <div className="reject-box">
              Motif du refus : {exercise.rejection_reason}
            </div>
          )}

          <div className="exerciseActions">
            <button
              type="button"
              className="primary"
              onClick={addToPracticeSheet}
              disabled={addingSession}
            >
              {addingSession ? "Ajout..." : "Ajouter à ma fiche séance"}
            </button>

            <button
              type="button"
              className="gold"
              onClick={addToFavorites}
              disabled={addingFavorite}
            >
              {addingFavorite ? "Ajout..." : "Ajouter aux favoris"}
            </button>

            <button type="button" className="dark" onClick={editExercise}>
              Modifier
            </button>
          </div>
        </div>

        <div className="hero-infos">
          <div>
            <span>THÈME</span>
            <strong>{exercise.theme || "—"}</strong>
          </div>

          <div>
            <span>TYPE</span>
            <strong>{exercise.type || "—"}</strong>
          </div>

          <div>
            <span>CATÉGORIE</span>
            <strong>{exercise.category || exercise.categorie || "—"}</strong>
          </div>
        </div>
      </section>

      <div className="exo-layout">
        <section className="main-col">
          <article className="exo-card">
            <h2>DESSIN DE L’EXERCICE</h2>

            {images.length > 0 ? (
              <>
                <div className="image-wrap">
                  {images.length > 1 && (
                    <button type="button" className="arrow left" onClick={prevImage}>
                      ‹
                    </button>
                  )}

                  <img src={images[current]} alt={exercise.title || "Exercice"} />

                  {images.length > 1 && (
                    <button type="button" className="arrow right" onClick={nextImage}>
                      ›
                    </button>
                  )}
                </div>

                {images.length > 1 && (
                  <div className="thumbs">
                    {images.map((src, index) => (
                      <button
                        key={`${src}-${index}`}
                        type="button"
                        className={index === current ? "active" : ""}
                        onClick={() => setCurrent(index)}
                      >
                        <img src={src} alt={`Phase ${index + 1}`} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="empty">Aucun schéma.</div>
            )}
          </article>

          <article className="exo-card">
            <h2>OBJECTIF</h2>
            <p>{rawText(exercise, "objectif") || exercise.description || "—"}</p>
          </article>

          <article className="exo-card">
            <h2>ORGANISATION</h2>
            <p>{exercise.organisation || exercise.description || "—"}</p>
          </article>

          <article className="exo-card">
            <h2>DÉROULEMENT</h2>
            {steps.length > 0 ? (
              <ol>
                {steps.map((step, index) => (
                  <li key={`${step}-${index}`}>{step}</li>
                ))}
              </ol>
            ) : (
              <p>—</p>
            )}
          </article>

          <article className="exo-card">
            <h2>CONSIGNES</h2>
            {consignes.length > 0 ? (
              <ul>
                {consignes.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </article>

          <article className="exo-card">
            <h2>VARIANTES</h2>
            {variantes.length > 0 ? (
              <ul>
                {variantes.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>—</p>
            )}
          </article>
        </section>

        <aside className="side-col">
          <article className="exo-card criteria">
            <h2>CRITÈRES</h2>

            <div className="crit-row">
              <span>THÈME</span>
              <strong>{exercise.theme || "—"}</strong>
            </div>

            <div className="crit-row">
              <span>CATÉGORIE</span>
              <strong>{exercise.category || exercise.categorie || "—"}</strong>
            </div>

            <div className="crit-row">
              <span>TYPE</span>
              <strong className="pill">{exercise.type || "—"}</strong>
            </div>

            <div className="crit-row">
              <span>NIVEAU</span>
              <strong>{exercise.level || exercise.niveau || "—"}</strong>
            </div>

            <div className="crit-row">
              <span>DURÉE</span>
              <strong>{exercise.duration || exercise.temps || "—"}</strong>
            </div>

            <div className="crit-row">
              <span>PHASES</span>
              <strong>{images.length}</strong>
            </div>

            <div className="crit-row">
              <span>VIDÉOS</span>
              <strong>{videos.length}</strong>
            </div>

            <div className="side-section">
              <h3>TAGS</h3>

              {exercise.tags?.length ? (
                <div className="tags">
                  {exercise.tags.map((tag) => (
                    <span key={tag}>#{tag}</span>
                  ))}
                </div>
              ) : (
                <p>Aucun tag.</p>
              )}
            </div>
          </article>
        </aside>
      </div>

      <style jsx>{`
        .exo-detail {
          max-width: 1180px;
          margin: 0 auto;
          padding: 28px 20px 70px;
          color: #111;
        }

        .exo-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        button {
          border: 0;
          cursor: pointer;
          font-weight: 900;
          border-radius: 999px;
          padding: 10px 14px;
          background: #f2f2f2;
          color: #111;
        }

        button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .badges {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .badges span {
          background: #fff4dd;
          color: #6b1a2c;
          border-radius: 999px;
          padding: 7px 11px;
          font-size: 12px;
          font-weight: 900;
        }

        .reject-box {
          margin-top: 14px;
          background: #ffe8ec;
          color: #c5283d;
          border-radius: 12px;
          padding: 10px 12px;
          font-weight: 800;
          font-size: 13px;
        }

        .exerciseActions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 22px;
        }

        .exerciseActions button {
          padding: 13px 18px;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }

        .exerciseActions button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.14);
        }

        .exerciseActions .primary {
          background: #6b1a2c;
          color: white;
        }

        .exerciseActions .gold {
          background: #d4a24c;
          color: #111;
        }

        .exerciseActions .dark {
          background: #111;
          color: white;
        }

        .exo-hero {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 28px;
          border: 1px solid #e6e6e6;
          border-radius: 20px;
          padding: 34px;
          margin-bottom: 24px;
          background: #fff;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.04);
        }

        .kicker {
          color: #f47b20;
          font-weight: 900;
          letter-spacing: 0.08em;
          font-size: 0.78rem;
          margin: 0 0 8px;
        }

        h1 {
          font-size: clamp(2.1rem, 5vw, 4rem);
          line-height: 0.95;
          margin: 0 0 16px;
          font-weight: 1000;
          text-transform: uppercase;
          font-style: italic;
        }

        .exo-hero p {
          margin: 0;
          color: #555;
        }

        .hero-infos {
          border-left: 1px solid #ddd;
          padding-left: 28px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .hero-infos span,
        .crit-row span {
          display: block;
          font-size: 0.72rem;
          color: #777;
          font-weight: 900;
          text-transform: uppercase;
        }

        .hero-infos strong,
        .crit-row strong {
          font-size: 0.9rem;
          text-transform: uppercase;
        }

        .exo-layout {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 22px;
          align-items: start;
        }

        .main-col,
        .side-col {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .exo-card {
          background: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.04);
        }

        .exo-card h2 {
          margin: 0 0 18px;
          font-size: 0.95rem;
          font-weight: 1000;
          text-transform: uppercase;
        }

        .exo-card h2::after {
          content: "";
          display: block;
          width: 42px;
          height: 3px;
          margin-top: 8px;
          background: #f47b20;
        }

        .image-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 430px;
          background: #fff;
        }

        .image-wrap img {
          max-width: 100%;
          max-height: 460px;
          object-fit: contain;
        }

        .arrow {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 36px;
          height: 36px;
          padding: 0;
          background: #f47b20;
          color: white;
          font-size: 2rem;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }

        .arrow.left {
          left: 0;
        }

        .arrow.right {
          right: 0;
        }

        .thumbs {
          display: flex;
          gap: 10px;
          justify-content: center;
          margin-top: 18px;
          flex-wrap: wrap;
        }

        .thumbs button {
          width: 70px;
          height: 58px;
          border-radius: 8px;
          padding: 0;
          overflow: hidden;
          border: 2px solid transparent;
          background: #eee;
        }

        .thumbs button.active {
          border-color: #f47b20;
        }

        .thumbs img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #6b1a2c;
        }

        .criteria {
          position: sticky;
          top: 24px;
        }

        .crit-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 13px 0;
          border-bottom: 1px solid #eee;
        }

        .pill {
          background: #f47b20;
          color: white;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 0.72rem;
        }

        .side-section {
          margin-top: 20px;
        }

        .side-section h3 {
          font-size: 0.8rem;
          text-transform: uppercase;
          margin: 0 0 8px;
        }

        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tags span {
          background: #f6eadc;
          color: #6b1a2c;
          border-radius: 999px;
          padding: 6px 9px;
          font-size: 0.75rem;
          font-weight: 900;
        }

        p,
        li {
          color: #555;
          line-height: 1.6;
          font-size: 0.95rem;
        }

        .empty {
          min-height: 260px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #888;
          background: #f6f6f6;
          border-radius: 14px;
          font-weight: 800;
        }

        @media (max-width: 900px) {
          .exo-hero,
          .exo-layout {
            grid-template-columns: 1fr;
          }

          .hero-infos {
            border-left: 0;
            border-top: 1px solid #ddd;
            padding-left: 0;
            padding-top: 20px;
          }

          .criteria {
            position: static;
          }
        }
      `}</style>
    </main>
  );
}