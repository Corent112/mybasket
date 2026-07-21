"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  deleteExercise,
  listMyExercises,
  submitExerciseForReview,
} from "@/lib/exercises";
import type { Exercise } from "@/types/exercise";

type FilterStatus = "all" | "draft" | "submitted" | "approved" | "rejected";

const STATUS_LABELS: Record<string, string> = {
  draft: "Privé",
  submitted: "Envoyé à MyBasket",
  approved: "Validé bibliothèque",
  rejected: "Refusé",
};

const STATUS_CLASSES: Record<string, string> = {
  draft: "draft",
  submitted: "submitted",
  approved: "approved",
  rejected: "rejected",
};

export default function MesExercicesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");

  useEffect(() => {
    loadExercises();
  }, []);

  async function loadExercises() {
    setLoading(true);

    try {
      const data = await listMyExercises();
      setExercises(data || []);
    } catch (error) {
      console.error("Erreur chargement mes exercices:", error);
      alert("Impossible de charger tes exercices.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    const ok = confirm("Supprimer définitivement cet exercice personnel ?");
    if (!ok) return;

    setDeletingId(id);

    try {
      const success = await deleteExercise(id);

      if (!success) {
        alert("Suppression impossible. Vérifie que cet exercice t'appartient.");
        return;
      }

      setExercises((prev) => prev.filter((exercise) => exercise.id !== id));
    } catch (error) {
      console.error("Erreur suppression exercice:", error);
      alert("Impossible de supprimer cet exercice.");
    } finally {
      setDeletingId(null);
    }
  }

  async function submit(id: string) {
    const ok = confirm(
      "Envoyer cet exercice au CEO pour proposer son intégration dans la bibliothèque MyBasket ?"
    );

    if (!ok) return;

    setSubmittingId(id);

    try {
      const success = await submitExerciseForReview(id);

      if (!success) {
        alert("Impossible d'envoyer cet exercice en validation.");
        return;
      }

      await loadExercises();
    } catch (error) {
      console.error("Erreur proposition exercice:", error);
      alert("Impossible d'envoyer cet exercice en validation.");
    } finally {
      setSubmittingId(null);
    }
  }

  function getImage(exercise: Exercise) {
    return (
      exercise.schemaImages?.[0] ||
      exercise.images?.[0] ||
      exercise.diagrams?.[0]?.imageUrl ||
      ""
    );
  }

  function getStatus(exercise: Exercise) {
    return exercise.review_status || "draft";
  }

  const filteredExercises = useMemo(() => {
    if (filter === "all") return exercises;
    return exercises.filter((exercise) => getStatus(exercise) === filter);
  }, [exercises, filter]);

  const counts = useMemo(() => {
    return {
      all: exercises.length,
      draft: exercises.filter((exercise) => getStatus(exercise) === "draft")
        .length,
      submitted: exercises.filter(
        (exercise) => getStatus(exercise) === "submitted"
      ).length,
      approved: exercises.filter(
        (exercise) => getStatus(exercise) === "approved"
      ).length,
      rejected: exercises.filter(
        (exercise) => getStatus(exercise) === "rejected"
      ).length,
    };
  }, [exercises]);

  if (loading) {
    return (
      <main className="page">
        <div className="loading">Chargement de tes exercices...</div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: #fff;
            padding: 44px 56px 80px;
            color: #111;
            font-family: Roboto, system-ui, sans-serif;
          }

          .loading {
            border: 1px solid #eee;
            border-radius: 16px;
            padding: 30px;
            color: #7a0d24;
            font-weight: 900;
          }
        `}</style>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="pageTop">
        <Link href="/mon-compte" className="back">
          ← Retour
        </Link>
      </div>

      <section className="hero">
        <p className="eyebrow">MYBASKET PERSONNEL</p>
        <h1>MES EXERCICES</h1>

        <p>
          Retrouve ici uniquement tes exercices créés ou modifiés. Ils restent
          privés tant que tu ne proposes pas leur intégration dans la
          bibliothèque publique.
        </p>

        <div className="heroActions">
          <Link href="/exercices/creer" className="createBtn">
            + Créer un exercice
          </Link>

          <Link href="/bibliotheque" className="libraryBtn">
            Voir la bibliothèque publique
          </Link>
        </div>
      </section>

      <section className="infoBox">
        <div>
          <strong>🔒 Exercices privés</strong>
          <p>
            Toi seul peux voir tes exercices personnels. Les autres utilisateurs
            n’y ont pas accès.
          </p>
        </div>

        <div>
          <strong>📤 Proposition MyBasket</strong>
          <p>
            Tu peux proposer un exercice au CEO. Après validation, il pourra
            rejoindre la bibliothèque commune.
          </p>
        </div>
      </section>

      <section className="filters">
        <button
          type="button"
          className={filter === "all" ? "on" : ""}
          onClick={() => setFilter("all")}
        >
          Tous <span>{counts.all}</span>
        </button>

        <button
          type="button"
          className={filter === "draft" ? "on" : ""}
          onClick={() => setFilter("draft")}
        >
          Privés <span>{counts.draft}</span>
        </button>

        <button
          type="button"
          className={filter === "submitted" ? "on" : ""}
          onClick={() => setFilter("submitted")}
        >
          Envoyés <span>{counts.submitted}</span>
        </button>

        <button
          type="button"
          className={filter === "approved" ? "on" : ""}
          onClick={() => setFilter("approved")}
        >
          Validés <span>{counts.approved}</span>
        </button>

        <button
          type="button"
          className={filter === "rejected" ? "on" : ""}
          onClick={() => setFilter("rejected")}
        >
          Refusés <span>{counts.rejected}</span>
        </button>
      </section>

      {filteredExercises.length === 0 ? (
        <div className="empty">
          <div>🏀</div>
          <h2>Aucun exercice ici pour le moment</h2>
          <p>
            Crée ton premier exercice personnel, modifie un exercice existant ou
            propose ensuite ton contenu à la bibliothèque.
          </p>

          <Link href="/exercices/creer" className="emptyBtn">
            + Créer un exercice
          </Link>
        </div>
      ) : (
        <section className="grid">
          {filteredExercises.map((exercise) => {
            const image = getImage(exercise);
            const status = getStatus(exercise);
            const statusLabel = STATUS_LABELS[status] || "Privé";
            const statusClass = STATUS_CLASSES[status] || "draft";
            const canSubmit = status === "draft" || status === "rejected";

            return (
              <article key={exercise.id} className="card">
                <Link href={`/exercices/${exercise.id}`} className="image">
                  {image ? (
                    <img src={image} alt={exercise.title || "Exercice"} />
                  ) : (
                    <span>🏀</span>
                  )}
                </Link>

                <div className="content">
                  <div className="topLine">
                    <span className={`status ${statusClass}`}>
                      {statusLabel}
                    </span>

                    {exercise.visibility === "public" && (
                      <span className="publicBadge">Public</span>
                    )}
                  </div>

                  <h2>{exercise.title || "Exercice sans titre"}</h2>

                  <div className="tags">
                    <span>{exercise.theme || "Sans thème"}</span>
                    <span>{exercise.type || "Sans type"}</span>
                    <span>
                      {exercise.category ||
                        exercise.categorie ||
                        "Sans catégorie"}
                    </span>
                  </div>

                  {status === "submitted" && (
                    <p className="notice submittedText">
                      En attente de validation CEO.
                    </p>
                  )}

                  {status === "approved" && (
                    <p className="notice approvedText">
                      Validé : cet exercice est visible dans la bibliothèque.
                    </p>
                  )}

                  {status === "rejected" && (
                    <p className="notice rejectedText">
                      Refusé
                      {exercise.rejection_reason
                        ? ` : ${exercise.rejection_reason}`
                        : ". Tu peux le modifier puis le renvoyer."}
                    </p>
                  )}

                  <div className="actions">
                    <Link href={`/exercices/${exercise.id}`}>Voir</Link>

                    <Link href={`/exercices/creer?id=${exercise.id}`}>
                      Modifier
                    </Link>

                    <button
                      type="button"
                      disabled={!canSubmit || submittingId === exercise.id}
                      onClick={() => submit(exercise.id)}
                    >
                      {submittingId === exercise.id
                        ? "Envoi..."
                        : status === "submitted"
                        ? "Déjà envoyé"
                        : "Soumettre"}
                    </button>

                    <button
                      type="button"
                      className="danger"
                      disabled={deletingId === exercise.id}
                      onClick={() => remove(exercise.id)}
                    >
                      {deletingId === exercise.id ? "..." : "Supprimer"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #fff;
          padding: 34px 56px 80px;
          color: #111;
          font-family: Roboto, system-ui, sans-serif;
        }

        .pageTop {
          display: flex;
          justify-content: flex-start;
          margin-bottom: 10px;
        }

        .back {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 16px;
          border-radius: 12px;
          border: 1px solid #eadccc;
          background: #fff;
          color: #7a0d24;
          text-decoration: none;
          font-weight: 900;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.06);
        }

        .hero {
          text-align: center;
          margin-bottom: 28px;
        }

        .eyebrow {
          margin: 0 0 6px;
          color: #d4a24c;
          font-size: 12px;
          letter-spacing: 0.18em;
          font-weight: 900;
        }

        .hero h1 {
          margin: 0;
          color: #7a0d24;
          font-size: 48px;
          font-family: Oswald, Roboto, sans-serif;
          font-weight: 900;
          letter-spacing: 0.04em;
        }

        .hero p {
          color: #666;
          margin: 10px auto 22px;
          max-width: 760px;
          line-height: 1.6;
        }

        .heroActions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .createBtn,
        .libraryBtn,
        .emptyBtn {
          display: inline-flex;
          min-height: 48px;
          padding: 0 24px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          text-decoration: none;
          font-weight: 900;
        }

        .createBtn,
        .emptyBtn {
          background: #7a0d24;
          color: white;
        }

        .libraryBtn {
          border: 2px solid #7a0d24;
          color: #7a0d24;
          background: #fff;
        }

        .infoBox {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin: 0 auto 0;
          max-width: 1050px;
        }

        .infoBox > div {
          border: 1px solid #eadccc;
          background: #fffaf2;
          border-radius: 16px;
          padding: 18px;
        }

        .infoBox strong {
          color: #7a0d24;
          font-size: 15px;
        }

        .infoBox p {
          color: #666;
          margin: 6px 0 0;
          line-height: 1.5;
          font-size: 14px;
        }

        .filters {
          position: sticky;
          top: 0;
          z-index: 100;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: center;
          margin: 22px -56px 24px;
          padding: 14px 56px;
          background: rgba(255, 255, 255, 0.96);
          backdrop-filter: blur(10px);
          border-top: 1px solid #f3eadf;
          border-bottom: 1px solid #f3eadf;
        }

        .filters button {
          border: 1px solid #eee;
          background: #fff;
          color: #111;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 900;
          cursor: pointer;
        }

        .filters button.on {
          background: #7a0d24;
          border-color: #7a0d24;
          color: #fff;
        }

        .filters span {
          display: inline-flex;
          margin-left: 6px;
          opacity: 0.8;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 22px;
        }

        .card {
          border: 1px solid #eee;
          border-radius: 18px;
          overflow: hidden;
          background: white;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.07);
        }

        .image {
          height: 190px;
          background: #f6f6f6;
          display: grid;
          place-items: center;
          color: #d4a24c;
          text-decoration: none;
          font-size: 42px;
        }

        .image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 12px;
        }

        .content {
          padding: 18px;
        }

        .topLine {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .status,
        .publicBadge {
          display: inline-flex;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 11px;
          font-weight: 900;
        }

        .status.draft {
          background: #f1f1f1;
          color: #555;
        }

        .status.submitted {
          background: #fff4dd;
          color: #9a6510;
        }

        .status.approved {
          background: #e3f4ea;
          color: #1f8a4c;
        }

        .status.rejected {
          background: #ffe8ec;
          color: #c5283d;
        }

        .publicBadge {
          background: #7a0d24;
          color: #fff;
        }

        .content h2 {
          margin: 0 0 14px;
          font-size: 21px;
          color: #111;
          font-family: Oswald, Roboto, sans-serif;
          font-weight: 900;
        }

        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 14px;
        }

        .tags span {
          background: #f6eadc;
          color: #7a0d24;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
        }

        .notice {
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 800;
          margin: 0 0 14px;
          line-height: 1.4;
        }

        .submittedText {
          background: #fff4dd;
          color: #9a6510;
        }

        .approvedText {
          background: #e3f4ea;
          color: #1f8a4c;
        }

        .rejectedText {
          background: #ffe8ec;
          color: #c5283d;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .actions a,
        .actions button {
          min-height: 40px;
          border: none;
          border-radius: 9px;
          font-weight: 900;
          cursor: pointer;
          text-decoration: none;
          display: grid;
          place-items: center;
          font-size: 13px;
          text-align: center;
          font-family: inherit;
        }

        .actions a:first-child {
          background: #7a0d24;
          color: white;
        }

        .actions a:nth-child(2) {
          background: #d4a24c;
          color: #111;
        }

        .actions button {
          background: #fff4dd;
          color: #7a0d24;
        }

        .actions button:disabled {
          opacity: 0.55;
          cursor: default;
        }

        .actions .danger {
          background: #ffe8ec;
          color: #c5283d;
        }

        .empty {
          border: 1px dashed #ddd;
          border-radius: 18px;
          padding: 52px 28px;
          text-align: center;
          color: #777;
          max-width: 760px;
          margin: 0 auto;
        }

        .empty div {
          font-size: 42px;
        }

        .empty h2 {
          margin: 10px 0;
          color: #7a0d24;
          font-family: Oswald, Roboto, sans-serif;
          font-size: 28px;
        }

        .empty p {
          max-width: 520px;
          margin: 0 auto 20px;
          line-height: 1.6;
        }

        @media (max-width: 1100px) {
          .grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .infoBox {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 720px) {
          .page {
            padding: 28px 20px 80px;
          }

          .hero h1 {
            font-size: 38px;
          }

          .filters {
            top: 0;
            margin: 18px -20px 22px;
            padding: 12px 20px;
            justify-content: flex-start;
            overflow-x: auto;
            flex-wrap: nowrap;
          }

          .filters button {
            white-space: nowrap;
          }

          .grid {
            grid-template-columns: 1fr;
          }

          .actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}