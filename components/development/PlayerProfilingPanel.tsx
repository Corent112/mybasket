"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import RatingButtons from "@/components/development/RatingButtons";
import {
  BASKET_PROFILE_CRITERIA,
  CHARACTER_PROFILE_CRITERIA,
  average,
  type RatingMap,
} from "@/lib/development-profiling";

type Snapshot = {
  id: string;
  assessment_date: string;
  basket_ratings: RatingMap;
  character_ratings: RatingMap;
  strengths: string | null;
  development_priorities: string | null;
  current_objective: string | null;
  staff_note: string | null;
  created_at: string;
};

const initialRatings = (criteria: readonly { key: string }[]) =>
  Object.fromEntries(criteria.map((item) => [item.key, 3])) as RatingMap;

export default function PlayerProfilingPanel({
  teamId,
  playerId,
  playerName,
}: {
  teamId: string;
  playerId: string;
  playerName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [basket, setBasket] = useState<RatingMap>(() => initialRatings(BASKET_PROFILE_CRITERIA));
  const [character, setCharacter] = useState<RatingMap>(() => initialRatings(CHARACTER_PROFILE_CRITERIA));
  const [strengths, setStrengths] = useState("");
  const [priorities, setPriorities] = useState("");
  const [objective, setObjective] = useState("");
  const [note, setNote] = useState("");
  const [history, setHistory] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const basketAvg = average(Object.values(basket));
  const characterAvg = average(Object.values(character));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, playerId]);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("player_profile_assessments")
      .select("*")
      .eq("team_id", teamId)
      .eq("player_id", playerId)
      .order("assessment_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (!error) {
      const rows = (data ?? []) as Snapshot[];
      setHistory(rows);
      const latest = rows[0];
      if (latest) {
        setBasket({ ...initialRatings(BASKET_PROFILE_CRITERIA), ...(latest.basket_ratings || {}) });
        setCharacter({ ...initialRatings(CHARACTER_PROFILE_CRITERIA), ...(latest.character_ratings || {}) });
        setStrengths(latest.strengths || "");
        setPriorities(latest.development_priorities || "");
        setObjective(latest.current_objective || "");
        setNote(latest.staff_note || "");
      }
    }
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setMessage("Connexion nécessaire.");
      setSaving(false);
      return;
    }

    const { error } = await supabase.from("player_profile_assessments").insert({
      user_id: auth.user.id,
      team_id: teamId,
      player_id: playerId,
      assessment_date: new Date().toISOString().slice(0, 10),
      basket_ratings: basket,
      character_ratings: character,
      strengths: strengths.trim() || null,
      development_priorities: priorities.trim() || null,
      current_objective: objective.trim() || null,
      staff_note: note.trim() || null,
    });

    setSaving(false);
    if (error) {
      console.error(error);
      setMessage(`Enregistrement impossible : ${error.message}`);
      return;
    }
    setMessage("Profilage enregistré ✓");
    await load();
  }

  if (loading) return <div className="profile-empty">Chargement du profilage…</div>;

  return (
    <section className="profile-shell">
      <div className="profile-head">
        <div><span>PROFILAGE JOUEUR</span><h2>{playerName}</h2><p>Évaluation sportive et comportements observés. Les informations physiques existantes ne sont pas modifiées.</p></div>
        <div className="scores"><div><b>{basketAvg}</b><small>Basket / 5</small></div><div><b>{characterAvg}</b><small>Caractère / 5</small></div></div>
      </div>

      <div className="profile-grid">
        <article className="profile-card">
          <div className="card-head"><h3>Profil basket</h3><span>{basketAvg}/5</span></div>
          <div className="ratings-list">
            {BASKET_PROFILE_CRITERIA.map((item) => (
              <div className="rating-line" key={item.key}>
                <strong>{item.label}</strong>
                <RatingButtons compact value={basket[item.key] || 3} onChange={(value) => setBasket((prev) => ({ ...prev, [item.key]: value }))} />
              </div>
            ))}
          </div>
        </article>

        <article className="profile-card">
          <div className="card-head"><h3>Caractère & comportements observés</h3><span>{characterAvg}/5</span></div>
          <p className="note-help">Observation sportive du staff, pas un diagnostic psychologique.</p>
          <div className="ratings-list">
            {CHARACTER_PROFILE_CRITERIA.map((item) => (
              <div className="rating-line" key={item.key}>
                <strong>{item.label}</strong>
                <RatingButtons compact value={character[item.key] || 3} onChange={(value) => setCharacter((prev) => ({ ...prev, [item.key]: value }))} />
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="profile-notes">
        <label>Forces principales<textarea value={strengths} onChange={(e) => setStrengths(e.target.value)} placeholder="Ex : création, agressivité vers le cercle…" /></label>
        <label>Axes de progression<textarea value={priorities} onChange={(e) => setPriorities(e.target.value)} placeholder="Ex : défense non-porteur, rebond…" /></label>
        <label>Objectif actuel<textarea value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Objectif à court terme" /></label>
        <label>Note staff<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observation complémentaire" /></label>
      </div>

      <div className="profile-actions"><span>{message}</span><button type="button" disabled={saving} onClick={save}>{saving ? "Enregistrement…" : "Enregistrer une nouvelle évaluation"}</button></div>

      <article className="profile-card history-card">
        <div className="card-head"><h3>Évolution</h3><span>{history.length} évaluation{history.length > 1 ? "s" : ""}</span></div>
        {history.length === 0 ? <p className="profile-empty">Aucune évaluation enregistrée.</p> : (
          <div className="history-list">{history.slice(0, 8).map((row) => (
            <div key={row.id} className="history-row">
              <b>{new Date(`${row.assessment_date}T12:00:00`).toLocaleDateString("fr-FR")}</b>
              <span>Basket {average(Object.values(row.basket_ratings || {}))}/5</span>
              <span>Caractère {average(Object.values(row.character_ratings || {}))}/5</span>
              <em>{row.development_priorities || row.current_objective || "—"}</em>
            </div>
          ))}</div>
        )}
      </article>

      <style jsx>{`
        .profile-shell{display:grid;gap:14px}.profile-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:18px;border:1px solid #eaded7;border-radius:18px;background:#fff}.profile-head span{color:#d4a24c;font-size:10px;font-weight:950;letter-spacing:.12em}.profile-head h2{margin:4px 0;color:#6b1a2c}.profile-head p{margin:0;color:#7b7074;font-size:12px}.scores{display:flex;gap:8px}.scores div{min-width:95px;padding:10px;border-radius:14px;background:#fff8ef;text-align:center}.scores b,.scores small{display:block}.scores b{color:#6b1a2c;font-size:22px}.scores small{color:#8d7f78;font-size:9px;font-weight:900}.profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.profile-card{padding:16px;border:1px solid #eaded7;border-radius:18px;background:#fff}.card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}.card-head h3{margin:0;color:#6b1a2c}.card-head span{color:#d4a24c;font-weight:950}.note-help{margin:-4px 0 10px;color:#8b7d82;font-size:10px}.ratings-list{display:grid;gap:7px}.rating-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #f2ece8}.rating-line strong{font-size:11px;color:#40363a}.profile-notes{display:grid;grid-template-columns:1fr 1fr;gap:10px}.profile-notes label{display:grid;gap:5px;color:#6b1a2c;font-size:11px;font-weight:900}.profile-notes textarea{min-height:82px;border:1px solid #e5d8d0;border-radius:12px;padding:10px;resize:vertical;font:inherit;color:#30272b}.profile-actions{display:flex;justify-content:flex-end;align-items:center;gap:12px}.profile-actions span{color:#6b1a2c;font-size:11px;font-weight:900}.profile-actions button{border:0;border-radius:999px;background:#6b1a2c;color:#fff;padding:11px 16px;font-weight:950;cursor:pointer}.history-list{display:grid;gap:7px}.history-row{display:grid;grid-template-columns:110px 110px 130px 1fr;gap:8px;align-items:center;padding:9px;border-radius:12px;background:#faf7f5;font-size:10px}.history-row em{color:#7a6d72;font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.profile-empty{padding:14px;color:#8a7d82;font-weight:800}@media(max-width:900px){.profile-head{flex-direction:column}.profile-grid,.profile-notes{grid-template-columns:1fr}.history-row{grid-template-columns:1fr 1fr}.history-row em{grid-column:1/-1}}
      `}</style>
    </section>
  );
}
