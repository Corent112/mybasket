"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Feedback = {
  id?: string;
  rating: number | null;
  intensity: number | null;
  engagement: number | null;
  coach_notes: string | null;
  positives: string | null;
  improvements: string | null;
};

const emptyFeedback: Feedback = {
  rating: 3,
  intensity: 3,
  engagement: 3,
  coach_notes: "",
  positives: "",
  improvements: "",
};

export default function SeanceBilanPage() {
  const supabase = createClient();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;

  const [feedback, setFeedback] = useState<Feedback>(emptyFeedback);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sessionId) loadFeedback(sessionId);
  }, [sessionId]);

  async function loadFeedback(id: string) {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/connexion");
      return;
    }

    const { data, error } = await supabase
      .from("practice_session_feedback")
      .select("*")
      .eq("session_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
    }

    if (data) {
      setFeedback({
        id: data.id,
        rating: data.rating ?? 3,
        intensity: data.intensity ?? 3,
        engagement: data.engagement ?? 3,
        coach_notes: data.coach_notes ?? "",
        positives: data.positives ?? "",
        improvements: data.improvements ?? "",
      });
    }

    setLoading(false);
  }

  function update<K extends keyof Feedback>(key: K, value: Feedback[K]) {
    setFeedback((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function saveFeedback() {
    if (!sessionId) return;

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/connexion");
      return;
    }

    const payload = {
      user_id: user.id,
      session_id: sessionId,
      rating: feedback.rating,
      intensity: feedback.intensity,
      engagement: feedback.engagement,
      coach_notes: feedback.coach_notes,
      positives: feedback.positives,
      improvements: feedback.improvements,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("practice_session_feedback")
      .upsert(payload, {
        onConflict: "user_id,session_id",
      });

    setSaving(false);

    if (error) {
      console.error(error);
      alert("Erreur lors de l’enregistrement du bilan.");
      return;
    }

    alert("Bilan enregistré.");
    router.push(`/seances/${sessionId}`);
  }

  if (loading) {
    return <main className="page">Chargement...</main>;
  }

  return (
    <main className="page">
      <div className="topbar">
        <button type="button" onClick={() => router.push(`/seances/${sessionId}`)}>
          ← Retour séance
        </button>
      </div>

      <section className="hero">
        <h1>BILAN SÉANCE</h1>
        <p>Analyse ta séance pour suivre la progression de ton équipe.</p>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Évaluation</h2>

          <RatingInput
            label="Note globale"
            value={feedback.rating ?? 3}
            onChange={(value) => update("rating", value)}
          />

          <RatingInput
            label="Intensité"
            value={feedback.intensity ?? 3}
            onChange={(value) => update("intensity", value)}
          />

          <RatingInput
            label="Engagement / concentration"
            value={feedback.engagement ?? 3}
            onChange={(value) => update("engagement", value)}
          />
        </div>

        <div className="panel">
          <h2>Analyse coach</h2>

          <label>
            Points positifs
            <textarea
              value={feedback.positives ?? ""}
              onChange={(e) => update("positives", e.target.value)}
              placeholder="Ce qui a bien fonctionné..."
            />
          </label>

          <label>
            Axes d’amélioration
            <textarea
              value={feedback.improvements ?? ""}
              onChange={(e) => update("improvements", e.target.value)}
              placeholder="Ce qu’il faudra retravailler..."
            />
          </label>

          <label>
            Notes coach
            <textarea
              value={feedback.coach_notes ?? ""}
              onChange={(e) => update("coach_notes", e.target.value)}
              placeholder="Observations globales..."
            />
          </label>
        </div>
      </section>

      <div className="saveBar">
        <button type="button" onClick={saveFeedback} disabled={saving}>
          {saving ? "Enregistrement..." : "Enregistrer le bilan"}
        </button>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #fff;
          color: #111;
          padding: 36px 56px 90px;
        }

        .topbar {
          margin-bottom: 22px;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 10px 16px;
          background: #f6eadc;
          color: #7a0d24;
          font-weight: 900;
          cursor: pointer;
        }

        .hero {
          text-align: center;
          margin-bottom: 34px;
        }

        .hero h1 {
          margin: 0;
          color: #7a0d24;
          font-size: 46px;
          font-family: Oswald, Roboto, sans-serif;
        }

        .hero p {
          color: #666;
        }

        .grid {
          display: grid;
          grid-template-columns: 0.9fr 1.1fr;
          gap: 28px;
        }

        .panel {
          border: 1px solid #eee;
          border-radius: 16px;
          padding: 22px;
          background: white;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.07);
        }

        h2 {
          margin: 0 0 22px;
          color: #7a0d24;
          font-family: Oswald, Roboto, sans-serif;
        }

        label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 18px;
          color: #7a0d24;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }

        textarea {
          min-height: 120px;
          border: 1px solid #ddd;
          border-radius: 10px;
          padding: 12px;
          resize: vertical;
          font-family: inherit;
          color: #111;
        }

        .saveBar {
          position: sticky;
          bottom: 20px;
          display: flex;
          justify-content: center;
          margin-top: 28px;
        }

        .saveBar button {
          height: 58px;
          padding: 0 36px;
          border-radius: 12px;
          background: linear-gradient(90deg, #7a0d24, #a20f36);
          color: white;
          font-size: 16px;
          box-shadow: 0 10px 28px rgba(122, 13, 36, 0.28);
        }

        .saveBar button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 900px) {
          .page {
            padding: 28px 20px 90px;
          }

          .grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}

function RatingInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="ratingBlock">
      <div className="ratingLabel">{label}</div>

      <div className="ratingButtons">
        {[1, 2, 3, 4, 5].map((note) => (
          <button
            key={note}
            type="button"
            className={note <= value ? "active" : ""}
            onClick={() => onChange(note)}
          >
            ★
          </button>
        ))}
      </div>

      <style jsx>{`
        .ratingBlock {
          margin-bottom: 24px;
        }

        .ratingLabel {
          color: #7a0d24;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .ratingButtons {
          display: flex;
          gap: 8px;
        }

        .ratingButtons button {
          width: 48px;
          height: 48px;
          border: 1px solid #ddd;
          border-radius: 10px;
          background: white;
          color: #ccc;
          font-size: 24px;
          cursor: pointer;
        }

        .ratingButtons button.active {
          background: #d4a24c;
          color: #111;
          border-color: #d4a24c;
        }
      `}</style>
    </div>
  );
}