"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { average } from "@/lib/development-profiling";

type Review = {
  id: string;
  session_id: string;
  calendar_event_id: string | null;
  review_date: string;
  objectives_rating: number;
  clarity_rating: number;
  adaptation_rating: number;
  rhythm_rating: number;
  relevance_rating: number;
  analysis: any;
};

type SessionRow = { id: string; title: string; theme: string | null; session_date: string | null; start_time: string | null };

export default function TeamSelfEvaluationsPanel({ teamId }: { teamId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionRow>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("practice_session_reviews")
        .select("*")
        .eq("team_id", teamId)
        .order("review_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (!active) return;
      const rs = error ? [] : ((data ?? []) as Review[]);
      setReviews(rs);
      const ids = Array.from(new Set(rs.map((r) => r.session_id).filter(Boolean)));
      if (ids.length) {
        const { data: sessionRows } = await supabase.from("practice_sessions").select("id,title,theme,session_date,start_time").in("id", ids);
        setSessions(Object.fromEntries(((sessionRows ?? []) as SessionRow[]).map((row) => [row.id, row])));
      } else setSessions({});
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [supabase, teamId]);

  const globalAverage = average(reviews.flatMap((r) => [r.objectives_rating,r.clarity_rating,r.adaptation_rating,r.rhythm_rating,r.relevance_rating]));
  const mastered = reviews.reduce((sum, r) => sum + Number(r.analysis?.masteredCount || 0), 0);
  const toWork = reviews.reduce((sum, r) => sum + Number(r.analysis?.toWorkCount || 0), 0);

  if (loading) return <div className="te-empty">Chargement des auto-évaluations…</div>;

  return (
    <section className="te-shell">
      <header className="te-head"><div><span>AUTO-ÉVALUATIONS</span><h2>Mémoire des séances</h2><p>Chaque bilan est daté et relié à la séance correspondante du calendrier.</p></div><div className="te-score"><b>{globalAverage || "—"}</b><small>moyenne / 5</small></div></header>
      <div className="te-kpis"><div><span>Séances évaluées</span><b>{reviews.length}</b></div><div><span>Exercices maîtrisés</span><b>{mastered}</b></div><div><span>À retravailler</span><b>{toWork}</b></div></div>
      {reviews.length === 0 ? <div className="te-empty">Aucune auto-évaluation pour cette équipe. Termine une séance ou ouvre-la depuis le calendrier pour commencer.</div> : (
        <div className="te-list">{reviews.map((review) => {
          const session = sessions[review.session_id];
          const avg = average([review.objectives_rating,review.clarity_rating,review.adaptation_rating,review.rhythm_rating,review.relevance_rating]);
          return <article className="te-row" key={review.id}>
            <div><span>{new Date(`${review.review_date}T12:00:00`).toLocaleDateString("fr-FR")}</span><strong>{session?.theme || session?.title || "Séance"}</strong><small>{session?.start_time ? session.start_time.slice(0,5) : ""}</small></div>
            <div className="mini"><b>{avg}/5</b><small>Auto-évaluation</small></div>
            <div className="mini"><b>{review.analysis?.masteredCount ?? 0}</b><small>Maîtrisés</small></div>
            <div className="mini warn"><b>{review.analysis?.toWorkCount ?? 0}</b><small>À retravailler</small></div>
            <button type="button" onClick={() => window.location.assign(`/seances/${review.session_id}/evaluation${review.calendar_event_id ? `?calendarEventId=${review.calendar_event_id}` : ""}`)}>Voir le bilan →</button>
          </article>;
        })}</div>
      )}
      <style jsx>{`
        .te-shell{display:grid;gap:14px}.te-head{display:flex;justify-content:space-between;gap:15px;padding:18px;border:1px solid #eaded7;border-radius:18px;background:#fff}.te-head span{color:#d4a24c;font-size:10px;font-weight:950;letter-spacing:.12em}.te-head h2{margin:4px 0;color:#6b1a2c}.te-head p{margin:0;color:#7e7277;font-size:12px}.te-score{min-width:105px;padding:10px;border-radius:14px;background:#6b1a2c;color:#fff;text-align:center}.te-score b,.te-score small{display:block}.te-score b{font-size:24px}.te-score small{font-size:9px}.te-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.te-kpis div{padding:13px;border:1px solid #eaded7;border-radius:15px;background:#fff}.te-kpis span,.te-kpis b{display:block}.te-kpis span{font-size:9px;color:#8b7e83;font-weight:900;text-transform:uppercase}.te-kpis b{margin-top:3px;color:#6b1a2c;font-size:21px}.te-list{display:grid;gap:8px}.te-row{display:grid;grid-template-columns:minmax(220px,1.5fr) repeat(3,100px) auto;gap:10px;align-items:center;padding:12px;border:1px solid #eaded7;border-radius:15px;background:#fff}.te-row>div:first-child span,.te-row>div:first-child strong,.te-row>div:first-child small{display:block}.te-row>div:first-child span{color:#d4a24c;font-size:9px;font-weight:950}.te-row>div:first-child strong{color:#34292d}.te-row>div:first-child small{color:#94878c}.mini{text-align:center;padding:7px;border-radius:10px;background:#faf7f5}.mini b,.mini small{display:block}.mini b{color:#6b1a2c}.mini small{font-size:8px;color:#8a7d82}.mini.warn{background:#fff5e8}.te-row button{border:0;border-radius:999px;background:#6b1a2c;color:#fff;padding:9px 12px;font-weight:900;cursor:pointer}.te-empty{padding:20px;border:1px dashed #d8c8bf;border-radius:16px;background:#fffaf6;color:#817177;font-weight:800}@media(max-width:900px){.te-head{flex-direction:column}.te-kpis{grid-template-columns:1fr}.te-row{grid-template-columns:1fr 1fr}.te-row>div:first-child,.te-row button{grid-column:1/-1}}
      `}</style>
    </section>
  );
}
