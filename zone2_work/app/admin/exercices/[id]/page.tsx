"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ExerciseDraft = {
  id: string;
  title: string;
  theme: string;
  type: string;
  category: string;
  level: string;
  description: string;
  organisation: string;
  consignes: string;
  variantes: string;
  status: string;
  review_status: string;
};

const emptyExercise: ExerciseDraft = {
  id: "",
  title: "",
  theme: "",
  type: "",
  category: "",
  level: "",
  description: "",
  organisation: "",
  consignes: "",
  variantes: "",
  status: "pending",
  review_status: "pending",
};

export default function AdminExerciseEditPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClient();

  const id = String(params.id || "");

  const [exercise, setExercise] = useState<ExerciseDraft>(emptyExercise);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExercise();
  }, [id]);

  async function loadExercise() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        alert("Exercice introuvable.");
        router.push("/admin/exercices");
        return;
      }

      setExercise({
        id: data.id,
        title: data.title ?? "",
        theme: data.theme ?? data.themes?.[0] ?? "",
        type: data.type ?? "",
        category: data.category ?? data.categorie ?? "",
        level: data.level ?? data.niveau ?? "",
        description: data.description ?? "",
        organisation: data.organisation ?? "",
        consignes: Array.isArray(data.consignes)
          ? data.consignes.join("\n")
          : data.consignes ?? "",
        variantes: Array.isArray(data.variantes)
          ? data.variantes.join("\n")
          : data.variantes ?? "",
        status: data.status ?? "pending",
        review_status: data.review_status ?? "pending",
      });
    } catch (error) {
      console.error("Erreur chargement exercice :", error);
      alert("Impossible de charger l’exercice.");
    } finally {
      setLoading(false);
    }
  }

  function setField(key: keyof ExerciseDraft, value: string) {
    setExercise((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function save(status?: "approved" | "rejected" | "pending") {
    try {
      setSaving(true);

      const nextStatus = status ?? exercise.status;
      const nextReviewStatus =
        status === "approved"
          ? "approved"
          : status === "rejected"
            ? "rejected"
            : exercise.review_status || "pending";

      const { error } = await supabase
        .from("exercises")
        .update({
          title: exercise.title.trim(),
          theme: exercise.theme.trim() || null,
          type: exercise.type.trim() || null,
          category: exercise.category.trim() || null,
          categorie: exercise.category.trim() || null,
          level: exercise.level.trim() || null,
          niveau: exercise.level.trim() || null,
          description: exercise.description.trim() || null,
          organisation: exercise.organisation.trim() || null,
          consignes: exercise.consignes
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          variantes: exercise.variantes
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          status: nextStatus,
          review_status: nextReviewStatus,
          visibility: status === "approved" ? "public" : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;

      router.push("/admin/exercices");
    } catch (error) {
      console.error("Erreur sauvegarde exercice :", error);
      alert("Impossible d’enregistrer l’exercice.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="page">
        <style>{CSS}</style>
        <div className="card">Chargement de l’exercice...</div>
      </main>
    );
  }

  return (
    <main className="page">
      <style>{CSS}</style>

      <Link href="/admin/exercices" className="back">
        ← Retour aux exercices
      </Link>

      <section className="hero">
        <div>
          <p>CONTRÔLE CEO</p>
          <h1>Modifier / contrôler</h1>
          <span>
            Corrige l’exercice avant validation ou refuse-le si le contenu n’est
            pas publiable.
          </span>
        </div>
      </section>

      <section className="card">
        <div className="grid">
          <label>
            Titre
            <input
              value={exercise.title}
              onChange={(e) => setField("title", e.target.value)}
            />
          </label>

          <label>
            Thème
            <input
              value={exercise.theme}
              onChange={(e) => setField("theme", e.target.value)}
            />
          </label>

          <label>
            Type
            <input
              value={exercise.type}
              onChange={(e) => setField("type", e.target.value)}
            />
          </label>

          <label>
            Catégorie
            <input
              value={exercise.category}
              onChange={(e) => setField("category", e.target.value)}
            />
          </label>

          <label>
            Niveau
            <input
              value={exercise.level}
              onChange={(e) => setField("level", e.target.value)}
            />
          </label>

          <label>
            Statut
            <input value={exercise.review_status || exercise.status} disabled />
          </label>
        </div>

        <label>
          Description
          <textarea
            rows={5}
            value={exercise.description}
            onChange={(e) => setField("description", e.target.value)}
          />
        </label>

        <label>
          Organisation
          <textarea
            rows={5}
            value={exercise.organisation}
            onChange={(e) => setField("organisation", e.target.value)}
          />
        </label>

        <label>
          Consignes
          <textarea
            rows={5}
            value={exercise.consignes}
            onChange={(e) => setField("consignes", e.target.value)}
          />
        </label>

        <label>
          Variantes
          <textarea
            rows={5}
            value={exercise.variantes}
            onChange={(e) => setField("variantes", e.target.value)}
          />
        </label>

        <div className="actions">
          <button type="button" disabled={saving} onClick={() => save()}>
            Enregistrer
          </button>

          <button
            type="button"
            className="valid"
            disabled={saving}
            onClick={() => save("approved")}
          >
            ✅ Valider & publier
          </button>

          <button
            type="button"
            className="danger"
            disabled={saving}
            onClick={() => save("rejected")}
          >
            ❌ Refuser
          </button>
        </div>
      </section>
    </main>
  );
}

const CSS = `
.page {
  min-height: 100vh;
  background: #f7f3ed;
  padding: 32px;
  color: #111;
  font-family: Roboto, system-ui, sans-serif;
}

.back {
  display: inline-flex;
  margin-bottom: 22px;
  color: #6b1a2c;
  font-weight: 900;
  text-decoration: none;
}

.hero {
  background: linear-gradient(135deg, #6b1a2c, #2a1018);
  color: white;
  border-radius: 28px;
  padding: 34px;
  margin-bottom: 22px;
}

.hero p {
  margin: 0 0 8px;
  color: #d4a24c;
  font-weight: 900;
  letter-spacing: .14em;
  font-size: 12px;
}

.hero h1 {
  margin: 0;
  font-family: "Alfa Slab One", Georgia, serif;
  font-size: clamp(2.2rem, 5vw, 4rem);
  font-weight: 400;
}

.hero span {
  display: block;
  margin-top: 12px;
  color: rgba(255,255,255,.82);
  font-weight: 700;
}

.card {
  max-width: 1100px;
  background: white;
  border: 1px solid rgba(107,26,44,.12);
  border-radius: 24px;
  padding: 26px;
  box-shadow: 0 12px 30px rgba(0,0,0,.05);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
}

label {
  display: grid;
  gap: 7px;
  font-size: 12px;
  font-weight: 900;
  color: #6b1a2c;
  text-transform: uppercase;
  margin-bottom: 14px;
}

input,
textarea {
  width: 100%;
  border: 1px solid #ddd;
  border-radius: 14px;
  padding: 13px 14px;
  font-family: inherit;
  font-size: 15px;
  color: #111;
  text-transform: none;
}

textarea {
  resize: vertical;
  line-height: 1.5;
}

input:focus,
textarea:focus {
  outline: none;
  border-color: #6b1a2c;
  box-shadow: 0 0 0 3px rgba(107,26,44,.1);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 18px;
}

.actions button {
  border: none;
  border-radius: 999px;
  padding: 13px 18px;
  font-weight: 900;
  cursor: pointer;
  background: #111;
  color: white;
}

.actions .valid {
  background: #6b1a2c;
}

.actions .danger {
  background: #ffe8ec;
  color: #c5283d;
}

.actions button:disabled {
  opacity: .6;
  cursor: default;
}

@media (max-width: 700px) {
  .page {
    padding: 18px;
  }

  .grid {
    grid-template-columns: 1fr;
  }
}
`;