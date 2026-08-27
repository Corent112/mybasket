"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RatingButtons from "@/components/development/RatingButtons";
import {
  SESSION_REVIEW_QUESTIONS,
  buildSessionAnalysis,
  masteryLabel,
  masteryStatus,
  type ExerciseReviewInput,
  type SessionReviewInput,
} from "@/lib/development-profiling";

type SessionRow = {
  id: string;
  team_id: string | null;
  team_reference_id?: string | null;
  team_name?: string | null;
  title: string;
  theme: string | null;
  session_date: string | null;
  start_time: string | null;
};

type ExerciseRow = {
  id: string;
  title: string;
  sort_order: number | null;
};

const initialReview: SessionReviewInput = {
  objectives_rating: 3,
  clarity_rating: 3,
  adaptation_rating: 3,
  rhythm_rating: 3,
  relevance_rating: 3,
  takeaway: "",
  next_time_change: "",
};

export default function SessionEvaluationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = String(params?.id || "");
  const requestedCalendarEventId = searchParams.get("calendarEventId") || "";
  const supabase = useMemo(() => createClient(), []);

  const [session, setSession] = useState<SessionRow | null>(null);
  const [calendarEventId, setCalendarEventId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [review, setReview] = useState<SessionReviewInput>(initialReview);
  const [exerciseReviews, setExerciseReviews] = useState<ExerciseReviewInput[]>([]);
  const [analysis, setAnalysis] = useState<ReturnType<typeof buildSessionAnalysis> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [existingReviewId, setExistingReviewId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function load() {
    setLoading(true);
    const { data: sessionData, error: sessionError } = await supabase
      .from("practice_sessions")
      .select("id,team_id,team_reference_id,team_name,title,theme,session_date,start_time")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !sessionData) {
      setMessage("Séance introuvable.");
      setLoading(false);
      return;
    }

    const s = sessionData as SessionRow;
    setSession(s);

    let event: any = null;
    if (requestedCalendarEventId) {
      const { data } = await supabase.from("calendar_events").select("id,team_id,session_id").eq("id", requestedCalendarEventId).maybeSingle();
      event = data;
    }
    if (!event) {
      const { data } = await supabase.from("calendar_events").select("id,team_id,session_id").eq("session_id", sessionId).order("event_date", { ascending: false }).limit(1).maybeSingle();
      event = data;
    }

    const resolvedTeamId = String(event?.team_id || s.team_reference_id || s.team_id || "");
    setCalendarEventId(String(event?.id || ""));
    setTeamId(resolvedTeamId);

    const { data: exercises } = await supabase
      .from("practice_session_exercises")
      .select("id,title,sort_order")
      .eq("session_id", sessionId)
      .order("sort_order", { ascending: true });

    const exerciseRows = (exercises ?? []) as ExerciseRow[];

    const { data: existing } = await supabase
      .from("practice_session_reviews")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();

    if (existing) {
      setExistingReviewId(String(existing.id));
      const existingReview: SessionReviewInput = {
        objectives_rating: Number(existing.objectives_rating || 3),
        clarity_rating: Number(existing.clarity_rating || 3),
        adaptation_rating: Number(existing.adaptation_rating || 3),
        rhythm_rating: Number(existing.rhythm_rating || 3),
        relevance_rating: Number(existing.relevance_rating || 3),
        takeaway: String(existing.takeaway || ""),
        next_time_change: String(existing.next_time_change || ""),
      };
      setReview(existingReview);
      setAnalysis(existing.analysis || null);

      const { data: exReviews } = await supabase
        .from("practice_exercise_reviews")
        .select("exercise_id,exercise_title,mastery_rating,comment")
        .eq("review_id", existing.id);
      const byId = new Map<string, { exercise_id: string; exercise_title: string | null; mastery_rating: number | null; comment: string | null }>((exReviews ?? []).map((row: any) => [String(row.exercise_id), row]));
      setExerciseReviews(exerciseRows.map((exercise) => {
        const found = byId.get(String(exercise.id));
        return {
          exercise_id: String(exercise.id),
          exercise_title: exercise.title,
          mastery_rating: Number(found?.mastery_rating || 3),
          comment: String(found?.comment || ""),
        };
      }));
    } else {
      setExerciseReviews(exerciseRows.map((exercise) => ({
        exercise_id: String(exercise.id),
        exercise_title: exercise.title,
        mastery_rating: 3,
        comment: "",
      })));
    }

    setLoading(false);
  }

  const liveAnalysis = useMemo(() => buildSessionAnalysis(review, exerciseReviews), [review, exerciseReviews]);

  async function save() {
    if (!teamId) {
      setMessage("Impossible de relier cette séance à une équipe.");
      return;
    }
    setSaving(true);
    setMessage("");

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setSaving(false);
      setMessage("Connexion nécessaire.");
      return;
    }

    const computed = buildSessionAnalysis(review, exerciseReviews);
    const payload = {
      user_id: auth.user.id,
      session_id: sessionId,
      calendar_event_id: calendarEventId || null,
      team_id: teamId,
      review_date: new Date().toISOString().slice(0, 10),
      objectives_rating: review.objectives_rating,
      clarity_rating: review.clarity_rating,
      adaptation_rating: review.adaptation_rating,
      rhythm_rating: review.rhythm_rating,
      relevance_rating: review.relevance_rating,
      takeaway: review.takeaway?.trim() || null,
      next_time_change: review.next_time_change?.trim() || null,
      analysis: computed,
      updated_at: new Date().toISOString(),
    };

    let reviewId = existingReviewId;
    if (reviewId) {
      const { error } = await supabase.from("practice_session_reviews").update(payload).eq("id", reviewId);
      if (error) {
        setSaving(false); setMessage(error.message); return;
      }
    } else {
      const { data, error } = await supabase.from("practice_session_reviews").insert(payload).select("id").single();
      if (error || !data) {
        setSaving(false); setMessage(error?.message || "Enregistrement impossible."); return;
      }
      reviewId = String(data.id);
      setExistingReviewId(reviewId);
    }

    if (reviewId) {
      await supabase.from("practice_exercise_reviews").delete().eq("review_id", reviewId);
      if (exerciseReviews.length) {
        const { error } = await supabase.from("practice_exercise_reviews").insert(exerciseReviews.map((exercise) => ({
          review_id: reviewId,
          session_id: sessionId,
          exercise_id: exercise.exercise_id,
          exercise_title: exercise.exercise_title,
          mastery_rating: exercise.mastery_rating,
          mastery_status: masteryStatus(exercise.mastery_rating),
          comment: exercise.comment?.trim() || null,
        })));
        if (error) {
          setSaving(false); setMessage(error.message); return;
        }
      }
    }

    setAnalysis(computed);
    setMessage("Auto-évaluation enregistrée ✓");
    setSaving(false);
  }

  if (loading) return <main className="review-page"><div className="empty">Chargement de l’auto-évaluation…</div></main>;

  return (
    <main className="review-page">
      <header className="review-head">
        <button type="button" onClick={() => router.push(`/seances/${sessionId}`)}>← Séance</button>
        <div><span>AUTO-ÉVALUATION</span><h1>{session?.theme || session?.title || "Séance"}</h1><p>{new Date().toLocaleDateString("fr-FR")} · reliée automatiquement à la séance et au calendrier</p></div>
        <div className="global-score"><b>{liveAnalysis.coachAverage}</b><small>/ 5</small></div>
      </header>

      <section className="review-card">
        <div className="section-title"><div><span>01</span><h2>Mon auto-évaluation</h2></div><p>5 questions rapides sur ta conduite de séance.</p></div>
        <div className="questions">{SESSION_REVIEW_QUESTIONS.map((question) => (
          <div className="question" key={question.key}>
            <strong>{question.label}</strong>
            <RatingButtons value={review[question.key]} onChange={(value) => setReview((prev) => ({ ...prev, [question.key]: value }))} />
          </div>
        ))}</div>
        <div className="notes-grid">
          <label>Ce que je retiens<textarea value={review.takeaway || ""} onChange={(e) => setReview((prev) => ({ ...prev, takeaway: e.target.value }))} /></label>
          <label>À modifier la prochaine fois<textarea value={review.next_time_change || ""} onChange={(e) => setReview((prev) => ({ ...prev, next_time_change: e.target.value }))} /></label>
        </div>
      </section>

      <section className="review-card">
        <div className="section-title"><div><span>02</span><h2>Maîtrise des exercices</h2></div><p>1–2 non maîtrisé · 3 en cours · 4–5 maîtrisé</p></div>
        {exerciseReviews.length === 0 ? <div className="empty">Aucun exercice rattaché à cette séance.</div> : (
          <div className="exercise-list">{exerciseReviews.map((exercise, index) => (
            <article className="exercise" key={exercise.exercise_id}>
              <div><span>EXERCICE {index + 1}</span><h3>{exercise.exercise_title}</h3></div>
              <div className={`status ${masteryStatus(exercise.mastery_rating)}`}>{masteryLabel(exercise.mastery_rating)}</div>
              <RatingButtons value={exercise.mastery_rating} onChange={(value) => setExerciseReviews((prev) => prev.map((item) => item.exercise_id === exercise.exercise_id ? { ...item, mastery_rating: value } : item))} />
              <input value={exercise.comment || ""} onChange={(e) => setExerciseReviews((prev) => prev.map((item) => item.exercise_id === exercise.exercise_id ? { ...item, comment: e.target.value } : item))} placeholder="Commentaire facultatif" />
            </article>
          ))}</div>
        )}
      </section>

      <section className="review-card analysis-card">
        <div className="section-title"><div><span>03</span><h2>Analyse & prochaine séance</h2></div><p>Générée depuis les notes renseignées, sans inventer de données.</p></div>
        <div className="analysis-kpis"><div><span>Conduite séance</span><b>{liveAnalysis.coachAverage}/5</b></div><div><span>Maîtrise exercices</span><b>{liveAnalysis.exerciseAverage || "—"}/5</b></div><div><span>Maîtrisés</span><b>{liveAnalysis.masteredCount}</b></div><div><span>À retravailler</span><b>{liveAnalysis.toWorkCount}</b></div></div>
        <div className="analysis-grid"><div><span>POINTS POSITIFS</span>{liveAnalysis.positives.map((item) => <p key={item}>• {item}</p>)}</div><div><span>PRIORITÉS</span>{liveAnalysis.priorities.length ? liveAnalysis.priorities.map((item) => <p key={item}>• {item}</p>) : <p>• Aucun point prioritaire marqué.</p>}</div><div><span>CONSEILS PROCHAINE SÉANCE</span>{liveAnalysis.advice.map((item) => <p key={item}>• {item}</p>)}</div></div>
      </section>

      <div className="save-row"><span>{message}</span><button type="button" disabled={saving} onClick={save}>{saving ? "Enregistrement…" : existingReviewId ? "Mettre à jour le bilan" : "Terminer et enregistrer"}</button></div>

      <style jsx>{`
        .review-page{max-width:1180px;margin:0 auto;padding:28px 18px 70px;background:#f8f6f5;min-height:100vh}.review-head{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:center;margin-bottom:14px;padding:18px;border-radius:20px;background:#111;color:#fff}.review-head>button{border:1px solid #564b50;background:transparent;color:#fff;border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer}.review-head span,.section-title span,.analysis-grid span{color:#d4a24c;font-size:10px;font-weight:950;letter-spacing:.12em}.review-head h1{margin:3px 0;font-size:23px}.review-head p{margin:0;color:#bdb4b8;font-size:11px}.global-score{min-width:90px;padding:10px;border-radius:15px;background:#6b1a2c;text-align:center}.global-score b{font-size:28px}.global-score small{font-weight:900}.review-card{margin-top:12px;padding:18px;border:1px solid #e7dcd6;border-radius:19px;background:#fff}.section-title{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}.section-title h2{margin:2px 0;color:#6b1a2c}.section-title p{margin:4px 0;color:#8a7c82;font-size:10px}.questions{display:grid;gap:8px}.question{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;padding:10px;border-radius:13px;background:#faf7f5}.question strong{font-size:12px}.notes-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.notes-grid label{display:grid;gap:5px;color:#6b1a2c;font-size:10px;font-weight:900}.notes-grid textarea{min-height:80px;border:1px solid #e3d7d0;border-radius:12px;padding:10px;resize:vertical}.exercise-list{display:grid;gap:8px}.exercise{display:grid;grid-template-columns:minmax(220px,1fr) 120px auto minmax(180px,.8fr);gap:12px;align-items:center;padding:11px;border:1px solid #eee4de;border-radius:14px}.exercise span{color:#d4a24c;font-size:8px;font-weight:950}.exercise h3{margin:2px 0;color:#352b2f}.exercise input{height:38px;border:1px solid #e3d7d0;border-radius:10px;padding:0 10px}.status{padding:7px;border-radius:999px;text-align:center;font-size:9px;font-weight:950}.status.mastered{background:#e8f7ed;color:#177245}.status.progress{background:#fff6df;color:#9a6a00}.status.not_mastered{background:#fff0f1;color:#a82018}.analysis-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.analysis-kpis div{padding:11px;border-radius:13px;background:#faf7f5}.analysis-kpis span,.analysis-kpis b{display:block}.analysis-kpis span{font-size:8px;color:#887a80;font-weight:900;text-transform:uppercase}.analysis-kpis b{margin-top:4px;color:#6b1a2c;font-size:19px}.analysis-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}.analysis-grid>div{padding:12px;border-radius:14px;background:#fff8ef}.analysis-grid p{margin:7px 0 0;color:#4b4145;font-size:11px;line-height:1.45}.save-row{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin-top:14px}.save-row span{color:#6b1a2c;font-weight:900;font-size:11px}.save-row button{border:0;border-radius:999px;background:#6b1a2c;color:#fff;padding:12px 18px;font-weight:950;cursor:pointer}.empty{padding:18px;border:1px dashed #d8c8bf;border-radius:14px;background:#fffaf7;color:#817177;font-weight:800}@media(max-width:850px){.review-head{grid-template-columns:1fr}.global-score{width:100px}.section-title{flex-direction:column}.notes-grid,.analysis-grid,.analysis-kpis{grid-template-columns:1fr}.exercise{grid-template-columns:1fr}.question{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}
