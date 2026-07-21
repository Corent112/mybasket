"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  approveExerciseForLibrary,
  listSubmittedExercisesForCeo,
  rejectExerciseForLibrary,
} from "@/lib/exercises";
import type { Exercise } from "@/types/exercise";

export default function PropositionsExercicesPage() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const data = await listSubmittedExercisesForCeo();
    setExercises(data);
    setLoading(false);
  }

  async function approve(id: string) {
    const ok = confirm("Valider cet exercice dans la bibliothèque publique ?");
    if (!ok) return;

    setActionId(id);
    await approveExerciseForLibrary(id);
    await load();
    setActionId(null);
  }

  async function reject(id: string) {
    const reason = prompt("Motif du refus ?") || "";

    setActionId(id);
    await rejectExerciseForLibrary(id, reason);
    await load();
    setActionId(null);
  }

  if (loading) {
    return <main className="page">Chargement...</main>;
  }

  return (
    <main className="page">
      <Link href="/admin" className="back">
        ← Retour admin
      </Link>

      <section className="hero">
        <p>VALIDATION CEO</p>
        <h1>Propositions d’exercices</h1>
        <span>{exercises.length} exercice(s) en attente</span>
      </section>

      {exercises.length === 0 ? (
        <div className="empty">
          Aucun exercice proposé pour le moment.
        </div>
      ) : (
        <section className="grid">
          {exercises.map((exercise) => (
            <article key={exercise.id} className="card">
              <h2>{exercise.title || "Exercice sans titre"}</h2>

              <div className="tags">
                <span>{exercise.theme || "Sans thème"}</span>
                <span>{exercise.type || "Sans type"}</span>
                <span>{exercise.category || "Sans catégorie"}</span>
              </div>

              <p>
                Cet exercice a été proposé par un utilisateur pour intégrer la
                bibliothèque MyBasket.
              </p>

              <div className="actions">
                <Link href={`/exercices/${exercise.id}`}>
                  Voir
                </Link>

                <button
                  type="button"
                  disabled={actionId === exercise.id}
                  onClick={() => approve(exercise.id)}
                >
                  ✅ Valider
                </button>

                <button
                  type="button"
                  className="danger"
                  disabled={actionId === exercise.id}
                  onClick={() => reject(exercise.id)}
                >
                  ❌ Refuser
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #fff;
          color: #111;
          padding: 40px;
          font-family: Roboto, system-ui, sans-serif;
        }

        .back {
          color: #6b1a2c;
          font-weight: 900;
          text-decoration: none;
        }

        .hero {
          margin: 28px 0;
        }

        .hero p {
          color: #d4a24c;
          font-weight: 900;
          letter-spacing: 0.14em;
          margin: 0 0 8px;
        }

        .hero h1 {
          margin: 0;
          font-family: "Alfa Slab One", Georgia, serif;
          color: #6b1a2c;
          font-size: 34px;
          font-weight: 400;
        }

        .hero span {
          display: inline-flex;
          margin-top: 12px;
          background: #fff4dd;
          color: #6b1a2c;
          padding: 8px 12px;
          border-radius: 999px;
          font-weight: 900;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 18px;
        }

        .card {
          border: 1px solid #eee;
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.06);
        }

        .card h2 {
          margin: 0 0 12px;
          color: #6b1a2c;
        }

        .card p {
          color: #666;
          line-height: 1.5;
        }

        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 12px;
        }

        .tags span {
          background: #fff4dd;
          color: #6b1a2c;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
        }

        .actions {
          display: grid;
          grid-template-columns: 1fr;
          gap: 8px;
          margin-top: 18px;
        }

        .actions a,
        .actions button {
          min-height: 42px;
          border: none;
          border-radius: 10px;
          display: grid;
          place-items: center;
          font-weight: 900;
          text-decoration: none;
          cursor: pointer;
          font-family: inherit;
        }

        .actions a {
          background: #111;
          color: white;
        }

        .actions button {
          background: #6b1a2c;
          color: white;
        }

        .actions .danger {
          background: #ffe8ec;
          color: #c5283d;
        }

        .actions button:disabled {
          opacity: 0.6;
          cursor: default;
        }

        .empty {
          border: 1px dashed #ddd;
          border-radius: 16px;
          padding: 40px;
          color: #777;
          text-align: center;
          font-weight: 800;
        }
      `}</style>
    </main>
  );
}