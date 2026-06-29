"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { Exercise, Diagram } from "@/types/exercise";
import { getExercise, updateExercise, consumeHandoff } from "@/lib/exercises";

export default function ModifierExercicePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id as string;

  const draftKey = `mb_exercise_draft_edit_${id}`;

  const [ex, setEx] = useState<Exercise | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const saveDraft = (d: Exercise) => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(d));
    } catch {}
  };

  const clearDraft = () => {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {}
  };

  useEffect(() => {
    const load = async () => {
      let base: Exercise | null = null;

      try {
        const raw = sessionStorage.getItem(draftKey);
        if (raw) base = JSON.parse(raw) as Exercise;
      } catch {}

      if (!base && id) {
        base = await getExercise(id);
      }

      if (base) {
        const dg = consumeHandoff();

        if (dg) {
          base = {
            ...base,
            diagrams: [
              ...(base.diagrams ?? []),
              {
                ...dg,
                order: base.diagrams?.length ?? 0,
              },
            ],
          };

          saveDraft(base);
        }
      }

      setEx(base);
      setReady(true);
    };

    load();
  }, [id]);

  useEffect(() => {
    if (ready && ex) saveDraft(ex);
  }, [ex, ready]);

  if (!ready) return null;

  if (!ex) {
    return (
      <div className="exo-form-page">
        <p>Exercice introuvable.</p>
        <button
          className="exo-btn ghost"
          onClick={() => router.push("/exercices")}
        >
          ← Retour
        </button>
      </div>
    );
  }

  const set = <K extends keyof Exercise>(key: K, value: Exercise[K]) => {
    setEx((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const renumber = (list: Diagram[]): Diagram[] =>
    list.map((d, index) => ({ ...d, order: index }));

  const tags = ex.tags ?? [];
  const diagrams = ex.diagrams ?? [];

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      set("tags", [...tags, t]);
    }
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    set("tags", tags.filter((t) => t !== tag));
  };

  const moveDiagram = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= diagrams.length) return;

    const list = [...diagrams];
    [list[index], list[target]] = [list[target], list[index]];
    set("diagrams", renumber(list));
  };

  const deleteDiagram = (diagramId: string) => {
    set(
      "diagrams",
      renumber(diagrams.filter((d) => d.id !== diagramId))
    );
  };

  const duplicateDiagram = (diagramId: string) => {
    const src = diagrams.find((d) => d.id === diagramId);
    if (!src) return;

    const copy: Diagram = {
      ...src,
      id:
        "dg_" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 6),
      title: src.title + " (copie)",
      createdAt: Date.now(),
    };

    const index = diagrams.findIndex((d) => d.id === diagramId);
    const list = [...diagrams];
    list.splice(index + 1, 0, copy);

    set("diagrams", renumber(list));
  };

  const renameDiagram = (diagramId: string, title: string) => {
    set(
      "diagrams",
      diagrams.map((d) => (d.id === diagramId ? { ...d, title } : d))
    );
  };

  const createWithPlaquette = () => {
    saveDraft(ex);

    try {
      sessionStorage.setItem(
        "mb_plaquette_return_to",
        `/exercices/${id}/modifier`
      );
    } catch {}

    window.location.assign("/plaquette?mode=exercise");
  };

  const save = async () => {
    if (!ex.title.trim()) {
      alert("Donne un titre à l’exercice.");
      return;
    }

    setSaving(true);

    const saved = await updateExercise(id, {
      ...ex,
      diagrams: renumber(diagrams),
    });

    setSaving(false);

    if (!saved) {
      alert("Erreur pendant l’enregistrement.");
      return;
    }

    clearDraft();
    router.push(`/exercices/${id}`);
  };

  const cancel = () => {
    clearDraft();
    router.push(`/exercices/${id}`);
  };

  return (
    <div className="exo-form-page">
      <div className="exo-form-head">
        <h1>Modifier l’exercice</h1>

        <div className="exo-form-actions">
          <button className="exo-btn ghost" onClick={cancel}>
            Annuler
          </button>

          <button className="exo-btn primary" onClick={save} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>

      <div className="exo-form-grid">
        <label className="exo-field exo-col-2">
          <span>Titre</span>
          <input
            value={ex.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>

        <label className="exo-field">
          <span>Thème</span>
          <input
            value={ex.theme || ""}
            onChange={(e) => set("theme", e.target.value)}
          />
        </label>

        <label className="exo-field">
          <span>Type</span>
          <input
            value={ex.type || ""}
            onChange={(e) => set("type", e.target.value)}
          />
        </label>

        <label className="exo-field">
          <span>Catégorie</span>
          <input
            value={ex.category || ""}
            onChange={(e) => set("category", e.target.value)}
          />
        </label>

        <label className="exo-field">
          <span>Niveau</span>
          <select
            value={ex.level || ""}
            onChange={(e) => set("level", e.target.value)}
          >
            <option value="">Choisir</option>
            <option>Débutant</option>
            <option>Intermédiaire</option>
            <option>Confirmé</option>
          </select>
        </label>

        <label className="exo-field">
          <span>Durée min</span>
          <input
            type="number"
            min={1}
            value={ex.duration || ""}
            onChange={(e) => set("duration", e.target.value)}
          />
        </label>

        <label className="exo-field">
          <span>Matériel</span>
          <input
            value={ex.equipment || ex.material || ""}
            onChange={(e) => {
              set("equipment", e.target.value);
              set("material", e.target.value);
            }}
          />
        </label>

        <label className="exo-field exo-col-2">
          <span>Description</span>
          <textarea
            rows={3}
            value={ex.description || ""}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>

        <label className="exo-field exo-col-2">
          <span>Consignes</span>
          <textarea
            rows={4}
            value={ex.instructions || ""}
            onChange={(e) => set("instructions", e.target.value)}
          />
        </label>

        <div className="exo-field exo-col-2">
          <span>Tags</span>

          <div className="exo-tags">
            {tags.map((tag) => (
              <span key={tag} className="exo-tag">
                {tag}
                <button onClick={() => removeTag(tag)}>×</button>
              </span>
            ))}

            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                }
              }}
              placeholder="Ajouter un tag + Entrée"
            />
          </div>
        </div>
      </div>

      <div className="exo-schemas">
        <div className="exo-schemas-head">
          <h2>
            Schémas <span>({diagrams.length})</span>
          </h2>

          <button className="exo-btn plaquette" onClick={createWithPlaquette}>
            🏀 Créer avec la Plaquette
          </button>
        </div>

        {diagrams.length === 0 ? (
          <div className="exo-schemas-empty">Aucun schéma.</div>
        ) : (
          <div className="exo-schemas-list">
            {diagrams.map((diagram, index) => (
              <div key={diagram.id} className="exo-schema-card">
                <div className="exo-schema-thumb">
                  {diagram.imageUrl ? (
                    <img src={diagram.imageUrl} alt={diagram.title} />
                  ) : (
                    <span>Pas d’aperçu</span>
                  )}
                </div>

                <div className="exo-schema-body">
                  <input
                    className="exo-schema-title"
                    value={diagram.title}
                    onChange={(e) => renameDiagram(diagram.id, e.target.value)}
                  />

                  <div className="exo-schema-meta">
                    {Array.isArray(diagram.phases)
                      ? diagram.phases.length
                      : 0}{" "}
                    phase(s) · #{index + 1}
                  </div>

                  <div className="exo-schema-actions">
                    <button
                      onClick={() => moveDiagram(index, -1)}
                      disabled={index === 0}
                    >
                      ↑
                    </button>

                    <button
                      onClick={() => moveDiagram(index, 1)}
                      disabled={index === diagrams.length - 1}
                    >
                      ↓
                    </button>

                    <button onClick={() => duplicateDiagram(diagram.id)}>
                      ⎘
                    </button>

                    <button
                      className="danger"
                      onClick={() => deleteDiagram(diagram.id)}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .exo-form-page {
          padding: 32px;
        }

        .exo-form-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .exo-form-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .exo-col-2 {
          grid-column: span 2;
        }

        .exo-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-weight: 700;
        }

        .exo-field input,
        .exo-field select,
        .exo-field textarea {
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #ccc;
        }

        .exo-form-actions,
        .exo-schema-actions {
          display: flex;
          gap: 8px;
        }

        .exo-btn {
          padding: 10px 14px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          font-weight: 700;
        }

        .exo-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .exo-btn.primary {
          background: #0f0f12;
          color: white;
        }

        .exo-btn.ghost {
          background: #eee;
        }

        .exo-btn.plaquette {
          background: #d4a24c;
          color: #0f0f12;
        }

        .exo-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          border: 1px solid #ccc;
          border-radius: 8px;
          padding: 8px;
        }

        .exo-tag {
          background: #eee;
          border-radius: 999px;
          padding: 4px 8px;
        }

        .exo-tag button {
          margin-left: 6px;
          border: none;
          background: transparent;
          cursor: pointer;
        }

        .exo-schemas {
          margin-top: 32px;
        }

        .exo-schemas-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .exo-schema-card {
          display: grid;
          grid-template-columns: 160px 1fr;
          gap: 16px;
          border: 1px solid #ddd;
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 12px;
          background: white;
        }

        .exo-schema-thumb {
          height: 110px;
          background: #f5f5f5;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        .exo-schema-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .exo-schema-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .exo-schema-title {
          font-weight: 700;
          border: 1px solid #ccc;
          border-radius: 8px;
          padding: 8px;
        }

        .danger {
          color: red;
        }

        @media (max-width: 700px) {
          .exo-form-grid,
          .exo-schema-card {
            grid-template-columns: 1fr;
          }

          .exo-col-2 {
            grid-column: span 1;
          }
        }
      `}</style>
    </div>
  );
}