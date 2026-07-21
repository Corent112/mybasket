"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSeance, newSeanceId, saveSeance } from "@/lib/seances";
import type { SeanceItem } from "@/types/seance";

const LEVELS = ["Débutant", "Intermédiaire", "Confirmé"] as const;

const CATEGORIES = [
  "U9",
  "U11",
  "U13",
  "U15",
  "U18",
  "U21",
  "Seniors",
] as const;

function emptySeance(): SeanceItem {
  const now = Date.now();

  return {
    id: newSeanceId(),
    title: "",
    category: "",
    level: "",
    duration: "",
    description: "",
    objectifs: "",
    contenu: "",
    image: "",
    images: [],
    createdAt: now,
    updatedAt: now,
  };
}

export default function CreerSeanceClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const id = searchParams.get("id");

  const [form, setForm] = useState<SeanceItem>(() => emptySeance());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (id) {
      const existing = getSeance(id);

      if (existing) {
        setForm(existing);
      }
    }

    setReady(true);
  }, [id]);

  function set<K extends keyof SeanceItem>(
    key: K,
    value: SeanceItem[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function save() {
    if (!form.title.trim()) {
      alert("Donne un titre à ta séance.");
      return;
    }

    saveSeance({
      ...form,
      updatedAt: Date.now(),
    });

    router.push("/seances");
  }

  if (!ready) return null;

  return (
    <main className="seance-form-page">
      <div className="seance-form-head">
        <h1>{id ? "Modifier la séance" : "Créer une séance"}</h1>

        <div>
          <button
            type="button"
            onClick={() => router.push("/seances")}
          >
            Annuler
          </button>

          <button
            type="button"
            className="primary"
            onClick={save}
          >
            Enregistrer
          </button>
        </div>
      </div>

      <div className="seance-form-grid">
        <label>
          Titre

          <input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>

        <label>
          Catégorie

          <select
            value={form.category}
            onChange={(e) =>
              set(
                "category",
                e.target.value as SeanceItem["category"]
              )
            }
          >
            <option value="">Choisir</option>

            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label>
          Niveau

          <select
            value={form.level}
            onChange={(e) =>
              set(
                "level",
                e.target.value as SeanceItem["level"]
              )
            }
          >
            <option value="">Choisir</option>

            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label>
          Durée

          <input
            value={form.duration}
            onChange={(e) => set("duration", e.target.value)}
          />
        </label>

        <label className="wide">
          Image

          <input
            value={form.image ?? ""}
            onChange={(e) => set("image", e.target.value)}
          />
        </label>

        <label className="wide">
          Description

          <textarea
            rows={4}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>

        <label className="wide">
          Objectifs

          <textarea
            rows={4}
            value={form.objectifs}
            onChange={(e) => set("objectifs", e.target.value)}
          />
        </label>

        <label className="wide">
          Contenu

          <textarea
            rows={6}
            value={form.contenu}
            onChange={(e) => set("contenu", e.target.value)}
          />
        </label>
      </div>

      <style jsx>{`
        .seance-form-page {
          max-width: 1000px;
          margin: 0 auto;
          padding: 32px 20px;
        }

        .seance-form-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .seance-form-head h1 {
          margin: 0;
          text-transform: uppercase;
        }

        .seance-form-head div {
          display: flex;
          gap: 10px;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 10px 18px;
          cursor: pointer;
          font-weight: 700;
        }

        button.primary {
          background: #111;
          color: white;
        }

        .seance-form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 18px;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-weight: 700;
        }

        input,
        select,
        textarea {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid #ccc;
          font: inherit;
        }

        .wide {
          grid-column: span 2;
        }

        @media (max-width: 700px) {
          .seance-form-grid {
            grid-template-columns: 1fr;
          }

          .wide {
            grid-column: span 1;
          }
        }
      `}</style>
    </main>
  );
}