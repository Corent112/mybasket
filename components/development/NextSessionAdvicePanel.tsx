"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Review = {
  id: string;
  review_date: string;
  session_id: string;
  analysis: {
    priorities?: string[];
    advice?: string[];
    toWorkCount?: number;
  } | null;
};

export default function NextSessionAdvicePanel({ teamId }: { teamId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [review, setReview] = useState<Review | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!teamId) { setReview(null); return; }
      const { data } = await supabase
        .from("practice_session_reviews")
        .select("id,review_date,session_id,analysis")
        .eq("team_id", teamId)
        .order("review_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) setReview((data as Review | null) ?? null);
    }
    void load();
    return () => { active = false; };
  }, [supabase, teamId]);

  if (!teamId || !review) return null;
  const priorities = review.analysis?.priorities ?? [];
  const advice = review.analysis?.advice ?? [];
  if (!priorities.length && !advice.length) return null;

  return (
    <aside className="next-advice">
      <div className="na-head"><span>À GARDER EN TÊTE</span><strong>Depuis la dernière auto-évaluation</strong><small>{new Date(`${review.review_date}T12:00:00`).toLocaleDateString("fr-FR")}</small></div>
      <div className="na-grid">
        <div><b>Priorités</b>{priorities.slice(0,3).map((item) => <p key={item}>• {item}</p>)}</div>
        <div><b>Conseils</b>{advice.slice(0,2).map((item) => <p key={item}>• {item}</p>)}</div>
      </div>
      <style jsx>{`
        .next-advice{margin:12px 0;padding:14px;border:1px solid #e2d4ca;border-left:5px solid #d4a24c;border-radius:15px;background:#fffaf3}.na-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.na-head span{color:#d4a24c;font-size:9px;font-weight:950;letter-spacing:.1em}.na-head strong{color:#6b1a2c}.na-head small{color:#92858a}.na-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:9px}.na-grid>div{padding:9px;border-radius:11px;background:#fff}.na-grid b{color:#6b1a2c;font-size:10px;text-transform:uppercase}.na-grid p{margin:5px 0 0;color:#50464a;font-size:10px;line-height:1.4}@media(max-width:800px){.na-grid{grid-template-columns:1fr}}
      `}</style>
    </aside>
  );
}
