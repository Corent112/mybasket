"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BASKET_PROFILE_CRITERIA,
  CHARACTER_PROFILE_CRITERIA,
  average,
  ratingLabel,
  type RatingMap,
} from "@/lib/development-profiling";

type Snapshot = {
  id: string;
  player_id: string;
  assessment_date: string;
  basket_ratings: RatingMap;
  character_ratings: RatingMap;
  development_priorities: string | null;
  current_objective: string | null;
  created_at: string;
};

type PlayerLite = { id: string; firstName?: string; lastName?: string };

export default function TeamProfilingPanel({
  teamId,
  players,
}: {
  teamId: string;
  players: PlayerLite[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("player_profile_assessments")
        .select("id, player_id, assessment_date, basket_ratings, character_ratings, development_priorities, current_objective, created_at")
        .eq("team_id", teamId)
        .order("assessment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (active) {
        setRows(error ? [] : ((data ?? []) as Snapshot[]));
        setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [supabase, teamId]);

  const latestByPlayer = useMemo(() => {
    const map = new Map<string, Snapshot>();
    rows.forEach((row) => {
      if (!map.has(row.player_id)) map.set(row.player_id, row);
    });
    return map;
  }, [rows]);

  const basketRows = useMemo(() => BASKET_PROFILE_CRITERIA.map((criterion) => {
    const values = Array.from(latestByPlayer.values())
      .map((row) => Number(row.basket_ratings?.[criterion.key] ?? 0))
      .filter((value) => value > 0);
    return { ...criterion, value: average(values), count: values.length };
  }), [latestByPlayer]);

  const characterRows = useMemo(() => CHARACTER_PROFILE_CRITERIA.map((criterion) => {
    const values = Array.from(latestByPlayer.values())
      .map((row) => Number(row.character_ratings?.[criterion.key] ?? 0))
      .filter((value) => value > 0);
    return { ...criterion, value: average(values), count: values.length };
  }), [latestByPlayer]);

  const strengths = [...basketRows].filter((row) => row.count && row.value >= 3.7).sort((a,b) => b.value-a.value).slice(0,4);
  const priorities = [...basketRows].filter((row) => row.count && row.value < 3.2).sort((a,b) => a.value-b.value).slice(0,4);
  const characterStrengths = [...characterRows].filter((row) => row.count && row.value >= 3.7).sort((a,b) => b.value-a.value).slice(0,3);
  const coverage = players.length ? Math.round((latestByPlayer.size / players.length) * 100) : 0;

  if (loading) return <div className="team-profile-empty">Chargement du profil équipe…</div>;

  return (
    <section className="tp-shell">
      <header className="tp-head">
        <div><span>PROFILAGE ÉQUIPE</span><h2>Synthèse automatique de l’effectif</h2><p>Aucune seconde saisie : ce profil est calculé uniquement depuis le dernier profilage de chaque joueur.</p></div>
        <div className="coverage"><b>{coverage}%</b><small>{latestByPlayer.size}/{players.length} joueurs profilés</small></div>
      </header>

      {latestByPlayer.size === 0 ? (
        <div className="team-profile-empty">Aucun joueur n’a encore de profilage. Renseigne les fiches joueurs pour alimenter automatiquement cette synthèse.</div>
      ) : (
        <>
          <div className="tp-grid">
            <article className="tp-card">
              <h3>Profil basket collectif</h3>
              <div className="metric-list">{basketRows.map((row) => (
                <div className="metric" key={row.key}>
                  <div><strong>{row.label}</strong><small>{row.count} joueur{row.count>1?"s":""}</small></div>
                  <div className="bar"><i style={{ width: `${(row.value / 5) * 100}%` }} /></div>
                  <b>{row.value || "—"}</b>
                </div>
              ))}</div>
            </article>

            <article className="tp-card">
              <h3>Caractère collectif</h3>
              <div className="metric-list">{characterRows.map((row) => (
                <div className="metric" key={row.key}>
                  <div><strong>{row.label}</strong><small>{row.count} joueur{row.count>1?"s":""}</small></div>
                  <div className="bar"><i style={{ width: `${(row.value / 5) * 100}%` }} /></div>
                  <b>{row.value || "—"}</b>
                </div>
              ))}</div>
            </article>
          </div>

          <article className="tp-card synthesis">
            <h3>Synthèse équipe</h3>
            <div className="syn-grid">
              <div><span>FORCES</span>{strengths.length ? strengths.map((item) => <p key={item.key}>• {item.label} — {item.value}/5 · {ratingLabel(item.value)}</p>) : <p>• Pas encore assez de données fortes.</p>}</div>
              <div><span>AXES PRIORITAIRES</span>{priorities.length ? priorities.map((item) => <p key={item.key}>• {item.label} — {item.value}/5</p>) : <p>• Aucun axe prioritaire marqué pour le moment.</p>}</div>
              <div><span>TENDANCES COMPORTEMENTALES</span>{characterStrengths.length ? characterStrengths.map((item) => <p key={item.key}>• {item.label} — {item.value}/5</p>) : <p>• À compléter via les profils joueurs.</p>}</div>
            </div>
          </article>
        </>
      )}

      <style jsx>{`
        .tp-shell{display:grid;gap:14px}.tp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:18px;border:1px solid #eaded7;border-radius:18px;background:#fff}.tp-head span,.synthesis span{color:#d4a24c;font-size:10px;font-weight:950;letter-spacing:.12em}.tp-head h2{margin:4px 0;color:#6b1a2c}.tp-head p{margin:0;color:#7c7075;font-size:12px}.coverage{min-width:135px;padding:11px;border-radius:14px;background:#6b1a2c;color:#fff;text-align:center}.coverage b,.coverage small{display:block}.coverage b{font-size:25px}.coverage small{font-size:9px}.tp-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.tp-card{padding:16px;border:1px solid #eaded7;border-radius:18px;background:#fff}.tp-card h3{margin:0 0 12px;color:#6b1a2c}.metric-list{display:grid;gap:8px}.metric{display:grid;grid-template-columns:minmax(150px,1fr) 130px 38px;gap:9px;align-items:center}.metric strong,.metric small{display:block}.metric strong{font-size:11px}.metric small{font-size:8px;color:#94878b}.metric>b{color:#6b1a2c;text-align:right}.bar{height:8px;border-radius:99px;background:#f1e9e5;overflow:hidden}.bar i{display:block;height:100%;border-radius:99px;background:#d4a24c}.syn-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.syn-grid>div{padding:12px;border-radius:14px;background:#faf7f5}.syn-grid p{margin:7px 0 0;color:#4b4145;font-size:11px;line-height:1.45}.team-profile-empty{padding:20px;border:1px dashed #d9c9c0;border-radius:18px;background:#fffaf6;color:#806f75;font-weight:800}@media(max-width:900px){.tp-head{flex-direction:column}.tp-grid,.syn-grid{grid-template-columns:1fr}.metric{grid-template-columns:1fr 100px 35px}}
      `}</style>
    </section>
  );
}
