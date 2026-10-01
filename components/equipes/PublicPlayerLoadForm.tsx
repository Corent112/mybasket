"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PublicPlayer = { id: string; first_name: string; last_name: string };
type PainZone = {
  id: string;
  label: string;
  side: "front" | "back";
  x: number;
  y: number;
};
type PainDetail = {
  intensity: number;
  type: string;
  since: string;
  comment: string;
};

const PAIN_ZONES: PainZone[] = [
  { id: "head_front", label: "Tête / visage", side: "front", x: 50, y: 9 },
  { id: "neck_front", label: "Cou", side: "front", x: 50, y: 18 },
  { id: "shoulder_left_front", label: "Épaule gauche", side: "front", x: 31, y: 24 },
  { id: "shoulder_right_front", label: "Épaule droite", side: "front", x: 69, y: 24 },
  { id: "chest_front", label: "Thorax", side: "front", x: 50, y: 27 },
  { id: "plexus_front", label: "Plexus", side: "front", x: 50, y: 34 },
  { id: "abdomen_front", label: "Abdominaux", side: "front", x: 50, y: 42 },
  { id: "elbow_left_front", label: "Coude gauche", side: "front", x: 24, y: 42 },
  { id: "elbow_right_front", label: "Coude droit", side: "front", x: 76, y: 42 },
  { id: "wrist_left_front", label: "Poignet / main gauche", side: "front", x: 18, y: 55 },
  { id: "wrist_right_front", label: "Poignet / main droite", side: "front", x: 82, y: 55 },
  { id: "hip_left_front", label: "Hanche gauche", side: "front", x: 40, y: 51 },
  { id: "hip_right_front", label: "Hanche droite", side: "front", x: 60, y: 51 },
  { id: "thigh_left_front", label: "Cuisse gauche", side: "front", x: 41, y: 63 },
  { id: "thigh_right_front", label: "Cuisse droite", side: "front", x: 59, y: 63 },
  { id: "knee_left_front", label: "Genou gauche", side: "front", x: 41, y: 75 },
  { id: "knee_right_front", label: "Genou droit", side: "front", x: 59, y: 75 },
  { id: "calf_left_front", label: "Mollet gauche", side: "front", x: 41, y: 84 },
  { id: "calf_right_front", label: "Mollet droit", side: "front", x: 59, y: 84 },
  { id: "ankle_left_front", label: "Cheville / pied gauche", side: "front", x: 42, y: 93 },
  { id: "ankle_right_front", label: "Cheville / pied droit", side: "front", x: 58, y: 93 },
  { id: "head_back", label: "Arrière de la tête", side: "back", x: 50, y: 9 },
  { id: "neck_back", label: "Nuque", side: "back", x: 50, y: 18 },
  { id: "shoulder_left_back", label: "Épaule gauche (dos)", side: "back", x: 31, y: 25 },
  { id: "shoulder_right_back", label: "Épaule droite (dos)", side: "back", x: 69, y: 25 },
  { id: "upper_back", label: "Haut du dos", side: "back", x: 50, y: 32 },
  { id: "lower_back", label: "Lombaires", side: "back", x: 50, y: 43 },
  { id: "elbow_left_back", label: "Coude gauche (dos)", side: "back", x: 24, y: 42 },
  { id: "elbow_right_back", label: "Coude droit (dos)", side: "back", x: 76, y: 42 },
  { id: "wrist_left_back", label: "Poignet / main gauche (dos)", side: "back", x: 18, y: 55 },
  { id: "wrist_right_back", label: "Poignet / main droit (dos)", side: "back", x: 82, y: 55 },
  { id: "glute_left", label: "Fessier gauche", side: "back", x: 41, y: 52 },
  { id: "glute_right", label: "Fessier droit", side: "back", x: 59, y: 52 },
  { id: "hamstring_left", label: "Ischio gauche", side: "back", x: 41, y: 64 },
  { id: "hamstring_right", label: "Ischio droit", side: "back", x: 59, y: 64 },
  { id: "knee_left_back", label: "Genou gauche (arrière)", side: "back", x: 41, y: 75 },
  { id: "knee_right_back", label: "Genou droit (arrière)", side: "back", x: 59, y: 75 },
  { id: "calf_left", label: "Mollet gauche", side: "back", x: 42, y: 84 },
  { id: "calf_right", label: "Mollet droit", side: "back", x: 58, y: 84 },
  { id: "ankle_left_back", label: "Cheville / pied gauche (dos)", side: "back", x: 42, y: 93 },
  { id: "ankle_right_back", label: "Cheville / pied droit (dos)", side: "back", x: 58, y: 93 },
];
type FormPayload = {
  valid: boolean;
  team_name?: string;
  kind?: "post_session" | "wellness";
  players?: PublicPlayer[];
  message?: string;
};

const SCALE = [1,2,3,4,5,6,7,8,9,10];

function Scale({
  value,
  onChange,
  low = "Faible",
  high = "Élevé",
}: {
  value: number;
  onChange: (value: number) => void;
  low?: string;
  high?: string;
}) {
  return (
    <div className="scale">
      <div className="scaleButtons">
        {SCALE.map((n) => (
          <button
            type="button"
            key={n}
            className={value === n ? "active" : ""}
            onClick={() => onChange(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="scaleLegend">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

function Question({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="question">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      {children}
    </section>
  );
}

function BodyFigure({
  side, selected, onToggle,
}: {
  side: "front" | "back";
  selected: string[];
  onToggle: (zone: PainZone) => void;
}) {
  const visibleIds = side === "front"
    ? new Set(["head_front","shoulder_left_front","shoulder_right_front","chest_front","abdomen_front","elbow_left_front","elbow_right_front","wrist_left_front","wrist_right_front","hip_left_front","hip_right_front","thigh_left_front","thigh_right_front","knee_left_front","knee_right_front","ankle_left_front","ankle_right_front"])
    : new Set(["head_back","shoulder_left_back","shoulder_right_back","upper_back","lower_back","elbow_left_back","elbow_right_back","wrist_left_back","wrist_right_back","glute_left","glute_right","hamstring_left","hamstring_right","knee_left_back","knee_right_back","ankle_left_back","ankle_right_back"]);
  const zones = PAIN_ZONES.filter((zone) => zone.side === side && visibleIds.has(zone.id));
  const front = side === "front";
  const anatomySource =
    "https://media.istockphoto.com/id/1479094313/fr/vectoriel/syst%C3%A8me-musculaire-corps-humain-anatomie-masculine-athletyc-fitness-trainig-gym-workout.jpg?s=612x612&w=0&k=20&c=wWpSyCpOKr-K1pHfoq9XX4zPlETaf1qylvhlBbQgk-s%3D";

  return <div className="bodyFigure">
    <div className="bodyLabel">{front ? "Face" : "Dos"}</div>
    <div className={`human medicalBody anatomyPhoto ${front ? "front" : "back"}`}>
      <div className="anatomyCrop" aria-label={front ? "Corps anatomique de face" : "Corps anatomique de dos"}>
        <img src={anatomySource} alt="" draggable={false} />
      </div>
      {zones.map((zone) => (
        <button
          key={zone.id}
          type="button"
          className={`painPoint ${selected.includes(zone.id) ? "selected" : ""}`}
          style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
          aria-label={zone.label}
          title={zone.label}
          onClick={() => onToggle(zone)}
        />
      ))}
    </div>
  </div>;
}

export default function PublicPlayerLoadForm({ token }: { token: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [payload, setPayload] = useState<FormPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const [playerId, setPlayerId] = useState("");
  const [duration, setDuration] = useState(90);
  const [rpe, setRpe] = useState(5);
  const [fatigue, setFatigue] = useState(5);
  const [soreness, setSoreness] = useState(1);
  const [sleep, setSleep] = useState(7);
  const [stress, setStress] = useState(3);
  const [comment, setComment] = useState("");
  const [loadType, setLoadType] = useState("basket");
  const [injured, setInjured] = useState(false);
  const [hasPain, setHasPain] = useState(false);
  const [painZones, setPainZones] = useState<string[]>([]);
  const [painDetails, setPainDetails] = useState<Record<string, PainDetail>>({});
  const [wellnessStep, setWellnessStep] = useState(1);
  const [rpeStep, setRpeStep] = useState(1);
  const [mood, setMood] = useState(8);
  const [hitReceived, setHitReceived] = useState(false);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc("get_team_wellness_form", {
        p_token: token,
      });

      if (error) {
        setPayload({ valid: false, message: error.message });
        setLoading(false);
        return;
      }

      const next = (data || {}) as FormPayload;
      setPayload(next);
      // Le questionnaire est commun à l'équipe : le joueur s'identifie lui-même.
      setPlayerId("");
      setLoading(false);
    })();
  }, [supabase, token]);

  const kind = payload?.kind || "post_session";
  const selected = payload?.players?.find((player) => player.id === playerId);

  function togglePainZone(zone: PainZone) {
    setPainZones((current) => {
      if (current.includes(zone.id)) {
        const next = current.filter((id) => id !== zone.id);
        setPainDetails((details) => {
          const copy = { ...details };
          delete copy[zone.id];
          return copy;
        });
        return next;
      }
      setPainDetails((details) => ({
        ...details,
        [zone.id]: details[zone.id] || { intensity: 5, type: "Douleur", since: "Aujourd’hui", comment: "" },
      }));
      return [...current, zone.id];
    });
  }

  function updatePainDetail(zoneId: string, patch: Partial<PainDetail>) {
    setPainDetails((current) => ({
      ...current,
      [zoneId]: { ...(current[zoneId] || { intensity: 5, type: "Douleur", since: "Aujourd’hui", comment: "" }), ...patch },
    }));
  }

  async function submit() {
    if (!playerId) return alert("Choisis ton nom.");

    setSending(true);
    try {
      const response = await fetch("/api/rpe/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          playerId,
          duration: kind === "post_session" ? duration : null,
          rpe: kind === "post_session" ? rpe : null,
          fatigue,
          soreness,
          sleep,
          stress,
          comment: comment.trim() || null,
          loadType: kind === "post_session" ? loadType : null,
          injured,
          painZones: hasPain ? painZones : [],
          painDetails: hasPain ? { ...painDetails, _wellness: { mood, hitReceived } } : { _wellness: { mood, hitReceived } },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        return alert(result.error || result.message || "Impossible d'enregistrer la réponse.");
      }
      setDone(true);
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <main className="publicPage">
        <div className="loading">Chargement…</div>
        <style jsx>{css}</style>
      </main>
    );
  }

  if (!payload?.valid) {
    return (
      <main className="publicPage">
        <section className="card">
          <h1>Lien indisponible</h1>
          <p>{payload?.message || "Ce questionnaire n'est plus actif."}</p>
        </section>
        <style jsx>{css}</style>
      </main>
    );
  }

  if (done) {
    if (kind === "wellness") {
      const zones = painZones.map((id) => PAIN_ZONES.find((z) => z.id === id)).filter((z): z is PainZone => Boolean(z));
      return <main className="wellnessPage"><section className="wellnessPhone wDone">
        <div className="check">✓</div><h1>Merci !</h1><p>Ton questionnaire a bien été enregistré.</p>
        <div className="wRecap"><h2>Récapitulatif</h2><div><span>Sommeil</span><b>{sleep}/10</b></div><div><span>Fatigue</span><b>{fatigue}/10</b></div><div><span>Stress</span><b>{stress}/10</b></div><div><span>Humeur</span><b>{mood}/10</b></div><div><span>Coup reçu</span><b>{hitReceived ? "Oui" : "Non"}</b></div></div>
        {zones.length > 0 && <div className="wRecap pain"><h2>Douleurs signalées</h2>{zones.map((z) => <div key={z.id}><span>{z.label}</span><b>{painDetails[z.id]?.intensity || 5}/10</b></div>)}</div>}
        <button className="finish" onClick={() => { setDone(false); setWellnessStep(1); setPlayerId(""); setPainZones([]); setPainDetails({}); setHasPain(false); setHitReceived(false); }}>Terminer</button>
      </section><style jsx>{css}</style></main>;
    }
    return (
      <main className="publicPage"><section className="success"><div>✓</div><h1>Merci {selected?.first_name || ""} !</h1><p>Ta réponse a bien été enregistrée. Le staff la retrouve automatiquement dans MyBasket.</p><button onClick={() => { setDone(false); setComment(""); }}>Nouvelle réponse</button></section><style jsx>{css}</style></main>
    );
  }

  if (kind === "wellness") {
    const progress = wellnessStep === 1 ? 33 : wellnessStep === 2 ? 66 : 100;
    const selectedZones = painZones
      .map((id) => PAIN_ZONES.find((zone) => zone.id === id))
      .filter((zone): zone is PainZone => Boolean(zone));

    return (
      <main className="wellnessPage">
        <section className="wellnessPhone">
          <header className="wHeader">
            <div className="qTop"><div className="wLogo"><span>◉</span> MYBASKET</div><b>☀️ WELLNESS · MATIN</b></div>
            <div className="wProgress"><i style={{ width: `${progress}%` }} /></div>
            <div className="wProgressText">{wellnessStep}/3</div>
          </header>

          {wellnessStep === 1 && (
            <section className="wStep">
              <h1>{selected ? `Bonjour ${selected.first_name} 👋` : "Mon check-up quotidien"}</h1>
              <p className="wDate">{new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>

              <label className="wPlayer">
                <span>Qui es-tu ?</span>
                <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                  <option value="">Choisis ton prénom</option>
                  {payload.players?.map((player) => {
                    const duplicate = (payload.players || []).filter((p) => p.first_name.trim().toLowerCase() === player.first_name.trim().toLowerCase()).length > 1;
                    const initial = player.last_name?.trim()?.[0]?.toUpperCase();
                    return <option key={player.id} value={player.id}>{player.first_name}{duplicate && initial ? ` ${initial}.` : ""}</option>;
                  })}
                </select>
              </label>

              <div className="wPanel">
                <h2>Comment te sens-tu aujourd’hui ?</h2>
                <Question title="Qualité du sommeil" subtitle=""><Scale value={sleep} onChange={setSleep} low="Très mauvais" high="Excellent" /></Question>
                <Question title="Niveau de fatigue" subtitle=""><Scale value={fatigue} onChange={setFatigue} low="Faible" high="Élevé" /></Question>
                <Question title="Niveau de stress" subtitle=""><Scale value={stress} onChange={setStress} low="Faible" high="Élevé" /></Question>
                <Question title="Humeur générale" subtitle=""><Scale value={mood} onChange={setMood} low="Mauvaise" high="Excellente" /></Question>
              </div>
              <div className="wNav single"><button className="next" onClick={() => { if (!playerId) return alert("Choisis ton prénom."); setWellnessStep(2); }}>Suivant →</button></div>
            </section>
          )}

          {wellnessStep === 2 && (
            <section className="wStep">
              <h1>As-tu des douleurs ou une gêne ?</h1>
              <div className="wYesNo">
                <button className={hasPain ? "active" : ""} onClick={() => setHasPain(true)}>Oui</button>
                <button className={!hasPain ? "active" : ""} onClick={() => { setHasPain(false); setPainZones([]); setPainDetails({}); }}>Non</button>
              </div>

              {hasPain ? (
                <>
                  <div className="wBodyTabs"><b>Face</b><b>Dos</b></div>
                  <div className="wBodies">
                    <BodyFigure side="front" selected={painZones} onToggle={togglePainZone} />
                    <BodyFigure side="back" selected={painZones} onToggle={togglePainZone} />
                  </div>
                  <p className="wHint">Appuie directement sur la ou les zones concernées.</p>
                  {selectedZones.length > 0 && <div className="wSelected">{selectedZones.map((z) => <span key={z.id}>● {z.label}</span>)}</div>}
                </>
              ) : <div className="wNoPain">Aucune douleur signalée aujourd’hui.</div>}

              <div className="wNav"><button onClick={() => setWellnessStep(1)}>← Précédent</button><button className="next" onClick={() => setWellnessStep(3)}>Suivant →</button></div>
            </section>
          )}

          {wellnessStep === 3 && (
            <section className="wStep">
              <h1>{hasPain && selectedZones.length ? "Détail de la douleur" : "Derniers détails"}</h1>

              {hasPain && selectedZones.length > 0 ? (
                <div className="wPainList">
                  {selectedZones.map((zone) => {
                    const detail = painDetails[zone.id] || { intensity: 5, type: "Douleur", since: "Aujourd’hui", comment: "" };
                    return <article className="wPainCard" key={zone.id}>
                      <div className="wPainTitle"><strong>{zone.label}</strong><button onClick={() => togglePainZone(zone)}>×</button></div>
                      <label>Intensité de la douleur <b>{detail.intensity}/10</b></label>
                      <input className="wRange" type="range" min="1" max="10" value={detail.intensity} onChange={(e) => updatePainDetail(zone.id, { intensity: Number(e.target.value) })} />
                      <label>Type de gêne</label>
                      <div className="wTypes">{["Douleur","Gêne","Raideur","Inflammation","Courbatures","Autre"].map((type) => <button key={type} className={detail.type === type ? "active" : ""} onClick={() => updatePainDetail(zone.id, { type })}>{type}</button>)}</div>
                      <label>Depuis quand ?</label>
                      <select value={detail.since} onChange={(e) => updatePainDetail(zone.id, { since: e.target.value })}><option>Aujourd’hui</option><option>Hier</option><option>2-3 jours</option><option>Plus d’une semaine</option><option>Chronique</option></select>
                      <label>Commentaire (facultatif)</label>
                      <textarea value={detail.comment} onChange={(e) => updatePainDetail(zone.id, { comment: e.target.value })} placeholder="Précise ta douleur si besoin…" />
                    </article>;
                  })}
                </div>
              ) : <div className="wNoPain">Tu n’as signalé aucune douleur.</div>}

              <label className="wComment">Commentaire général (facultatif)<textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Quelque chose à signaler au staff ?" /></label>
              <div className="wNav"><button onClick={() => setWellnessStep(2)}>← Précédent</button><button className="next" disabled={sending} onClick={submit}>{sending ? "Envoi…" : "Valider →"}</button></div>
            </section>
          )}
        </section>
        <style jsx>{css}</style>
      </main>
    );
  }

  const rpeProgress = rpeStep === 1 ? 33 : rpeStep === 2 ? 66 : 100;
  const rpeZones = painZones.map((id) => PAIN_ZONES.find((z) => z.id === id)).filter((z): z is PainZone => Boolean(z));
  return (
    <main className="wellnessPage eveningPage">
      <section className="wellnessPhone questionnaireWide">
        <header className="wHeader">
          <div className="qTop"><div className="wLogo"><span>◉</span> MYBASKET</div><b>🌙 RPE · SOIR</b></div>
          <div className="wProgress"><i style={{width:`${rpeProgress}%`}} /></div>
          <div className="wProgressText">{rpeStep}/3</div>
        </header>

        {rpeStep === 1 && <section className="wStep">
          <h1>Retour après séance</h1>
          <p className="wDate">{payload.team_name || "Mon équipe"} · RPE du soir</p>
          <label className="wPlayer"><span>Qui es-tu ?</span><select value={playerId} onChange={(e)=>setPlayerId(e.target.value)}><option value="">Choisis ton prénom</option>{payload.players?.map((player)=><option key={player.id} value={player.id}>{player.first_name} {player.last_name?.[0] || ""}.</option>)}</select></label>
          <div className="qGrid">
            <Question title="1. RPE" subtitle="Quel est ton ressenti d'effort global sur cette séance ?"><Scale value={rpe} onChange={setRpe} low="Très facile" high="Effort maximal" /></Question>
            <label className="qBox"><strong>2. Durée de la séance</strong><div className="number"><input type="number" min={0} max={300} value={duration} onChange={(e)=>setDuration(Number(e.target.value)||0)}/><b>min</b></div><small>Charge calculée : <b>{duration*rpe}</b></small></label>
            <Question title="3. Fatigue après séance" subtitle="Quel est ton niveau de fatigue maintenant ?"><Scale value={fatigue} onChange={setFatigue} low="Pas du tout fatigué" high="Extrêmement fatigué" /></Question>
            <label className="injuryCheck"><input type="checkbox" checked={injured} onChange={(e)=>setInjured(e.target.checked)}/><span><b>Je suis blessé(e)</b><small>Le staff verra cette information.</small></span></label>
          </div>
          <div className="wNav single"><button className="next" onClick={()=>{if(!playerId)return alert("Choisis ton prénom.");setRpeStep(2)}}>Suivant →</button></div>
        </section>}

        {rpeStep === 2 && <section className="wStep painLayout">
          <div className="painMain">
            <h1>4. Douleurs ou gêne ?</h1>
            <p className="wDate">As-tu une douleur ou une gêne après cette séance ? Tu peux sélectionner plusieurs zones.</p>
            <div className="wYesNo"><button className={hasPain?"active":""} onClick={()=>setHasPain(true)}>Oui</button><button className={!hasPain?"active":""} onClick={()=>{setHasPain(false);setPainZones([]);setPainDetails({})}}>Non</button></div>
            {hasPain && <><div className="wBodyTabs"><b>Face</b><b>Dos</b></div><div className="wBodies largeBodies"><BodyFigure side="front" selected={painZones} onToggle={togglePainZone}/><BodyFigure side="back" selected={painZones} onToggle={togglePainZone}/></div><p className="wHint">☝ Clique directement sur la ou les zones concernées</p></>}
          </div>
          <aside className="painAside">
            {hasPain && rpeZones.length ? <><h2>Zones sélectionnées</h2>{rpeZones.map(zone=>{const d=painDetails[zone.id]||{intensity:5,type:"Douleur",since:"Aujourd’hui",comment:""};return <article className="wPainCard" key={zone.id}><div className="wPainTitle"><strong>{zone.label}</strong><button onClick={()=>togglePainZone(zone)}>×</button></div><label>Intensité <b>{d.intensity}/10</b></label><input className="wRange" type="range" min="1" max="10" value={d.intensity} onChange={(e)=>updatePainDetail(zone.id,{intensity:Number(e.target.value)})}/><textarea value={d.comment} maxLength={200} onChange={(e)=>updatePainDetail(zone.id,{comment:e.target.value})} placeholder="Commentaire facultatif…"/></article>})}</> : <div className="wNoPain">{hasPain ? "Clique sur le bonhomme pour sélectionner une ou plusieurs zones." : "Aucune douleur signalée."}</div>}
          </aside>
          <div className="wNav painNav"><button onClick={()=>setRpeStep(1)}>← Précédent</button><button className="next" onClick={()=>setRpeStep(3)}>Suivant →</button></div>
        </section>}

        {rpeStep === 3 && <section className="wStep">
          <h1>Récapitulatif du soir</h1>
          <div className="wRecap"><div><span>RPE</span><b>{rpe}/10</b></div><div><span>Durée</span><b>{duration} min</b></div><div><span>Charge</span><b>{duration*rpe}</b></div><div><span>Fatigue</span><b>{fatigue}/10</b></div><div><span>Douleurs</span><b>{rpeZones.length ? `${rpeZones.length} zone(s)` : "Non"}</b></div></div>
          {rpeZones.length>0 && <div className="wRecap pain">{rpeZones.map(z=><div key={z.id}><span>{z.label}</span><b>{painDetails[z.id]?.intensity||5}/10</b></div>)}</div>}
          <label className="wComment">Commentaire facultatif<textarea value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="Quelque chose à signaler au staff ?"/></label>
          <div className="wNav"><button onClick={()=>setRpeStep(2)}>← Précédent</button><button className="next" disabled={sending} onClick={submit}>{sending?"Envoi…":"Valider →"}</button></div>
        </section>}
      </section>
      <style jsx>{css}</style>
    </main>
  );
}

const css = `
:global(body){margin:0;background:#f4f1ed;color:#211a18}
.publicPage{min-height:100vh;max-width:680px;margin:auto;padding:18px 14px 45px;font-family:Arial,sans-serif}
.brand{background:linear-gradient(135deg,#6b1a2c,#341017);color:white;border-radius:22px;padding:22px;margin-bottom:10px}
.brand small{color:#d4a24c;font-weight:1000;letter-spacing:.12em}
.brand h1{margin:5px 0;font-size:2rem}.brand p{margin:0;color:#eadfe2}
.wellnessBrand{padding:24px;background:linear-gradient(145deg,#71192d 0%,#4b1320 72%,#2d0d14 100%);box-shadow:0 12px 30px rgba(76,18,32,.16)}
.wellnessSteps{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:18px}.wellnessSteps span{display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:8px;font-size:.72rem;font-weight:800}.wellnessSteps b{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#d4a24c;color:#341017}
.card,.success{background:white;border:1px solid #eadfd8;border-radius:18px;padding:16px}.wellnessCard{padding:20px;box-shadow:0 10px 32px rgba(44,30,24,.06)}.playerChoice{background:#faf7f5;border:1px solid #eadfd8;border-radius:14px;padding:12px;margin-bottom:16px}.playerChoice>span{color:#6b1a2c;font-size:.76rem}.playerChoice select{font-weight:850;color:#2b2020}
.sectionTitle{display:flex;gap:10px;align-items:center;margin:7px 0 4px}.sectionTitle>b{width:31px;height:31px;border-radius:50%;display:grid;place-items:center;background:#6b1a2c;color:#fff;flex:0 0 auto}.sectionTitle>span{display:grid;gap:2px}.sectionTitle strong{font-size:.94rem;color:#2b2020}.sectionTitle small{font-size:.7rem;color:#887a73;font-weight:500}
.field{display:grid;gap:5px;margin-bottom:12px}.field>span{font-size:.7rem;text-transform:uppercase;font-weight:1000;color:#786a63}
.field select,.field input,.field textarea{width:100%;box-sizing:border-box;border:1px solid #d9cec7;border-radius:12px;padding:12px;font-size:1rem;background:#fff}
.field textarea{min-height:92px;resize:vertical}.two{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.number{display:grid;grid-template-columns:1fr auto;align-items:center;border:1px solid #d9cec7;border-radius:12px;overflow:hidden}.number input{border:0!important}.number b{padding-right:12px;color:#7b6d65}
.question{border-top:1px solid #eee4df;padding:15px 0}.question h2{font-size:1rem;margin:0}.question p{font-size:.78rem;color:#80726b;margin:4px 0 10px}
.scaleButtons{display:grid;grid-template-columns:repeat(10,1fr);gap:4px}.scaleButtons button{border:1px solid #e1d6cf;border-radius:10px;background:#fff;padding:10px 0;font-weight:950;color:#6b1a2c}
.scaleButtons button.active{background:#6b1a2c;color:#fff;border-color:#6b1a2c;transform:translateY(-1px)}
.scaleLegend{display:flex;justify-content:space-between;margin-top:5px;color:#93857d;font-size:.68rem}
.loadPreview{display:grid;grid-template-columns:1fr auto;align-items:center;background:#fff7e8;border:1px solid #ebd2a7;border-radius:12px;padding:11px;margin-bottom:4px}
.loadPreview strong{font-size:1.5rem;color:#6b1a2c}.loadPreview small{grid-column:1/-1;font-size:.7rem;color:#897a71}
.send{width:100%;border:0;border-radius:12px;background:#6b1a2c;color:#fff;padding:14px;font-size:1rem;font-weight:1000}.send:disabled{opacity:.55}
.injuryCheck{display:flex;gap:10px;align-items:flex-start;background:#fff3f3;border:1px solid #e6c4c8;border-radius:12px;padding:12px;margin:12px 0}.injuryCheck input{margin-top:3px}.injuryCheck span{display:grid;gap:3px}.injuryCheck b{color:#8b2638}.injuryCheck small{color:#7c696d;line-height:1.4}.privacy{font-size:.68rem;color:#8c7f78;line-height:1.45;margin:10px 2px 0}
.success{text-align:center;margin-top:50px}.success>div{width:60px;height:60px;border-radius:50%;display:grid;place-items:center;margin:auto;background:#eaf8ee;color:#13803d;font-size:2rem}
.success h1{color:#6b1a2c}.success button{border:0;border-radius:10px;background:#6b1a2c;color:white;padding:10px 14px;font-weight:900}
.loading{text-align:center;padding:60px;color:#6b1a2c;font-weight:900}

.painQuestion{border-top:1px solid #eee4df;padding:15px 0}.painHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.painHead h2{font-size:1rem;margin:0}.painHead p{font-size:.78rem;color:#80726b;margin:4px 0 10px}.yesNo{display:flex;gap:5px}.yesNo button{border:1px solid #decfd1;background:#fff;color:#6b1a2c;border-radius:9px;padding:7px 16px;font-weight:900}.yesNo button.active{background:#6b1a2c;color:#fff;border-color:#6b1a2c}
.wellnessPain{margin-top:6px;border:1px solid #eadfd8;background:#fffaf8;border-radius:17px;padding:14px}.painSectionTitle{margin:0 0 13px}.bodyPicker{display:grid;grid-template-columns:1fr 1fr;gap:12px;background:linear-gradient(180deg,#fbf8f6,#f5efec);border:1px solid #e6d9d3;border-radius:18px;padding:14px 10px;margin-top:8px}.bodyFigure{text-align:center}.bodyLabel{font-size:.7rem;font-weight:1000;color:#6b1a2c;letter-spacing:.12em;margin-bottom:7px}.human{position:relative;width:180px;max-width:100%;margin:auto}.bodyHelp{text-align:center;color:#887a73;font-size:.7rem;margin:8px 8px 2px;line-height:1.4}.human svg{display:block;width:100%;height:auto}.bodyShape{stroke:#8f8783;stroke-width:1.25;stroke-linejoin:round}.bodyDetail{fill:none;stroke:#b9afaa;stroke-width:.9;stroke-linecap:round}
.painPoint{position:absolute;width:24px;height:24px;transform:translate(-50%,-50%);border-radius:50%;border:2px solid rgba(180,35,24,.65);background:rgba(225,57,46,.24);box-shadow:0 0 0 5px rgba(225,57,46,.08);cursor:pointer}.painPoint:hover,.painPoint:hover{background:rgba(190,17,59,.16);transform:translate(-50%,-50%) scale(1.12)}.painPoint.selected{background:#d92d20;border-color:#fff;box-shadow:0 0 0 5px rgba(217,45,32,.22)}
.selectedZones{display:grid;gap:8px;margin-top:10px}.selectHint{text-align:center;color:#8b7d75;font-size:.78rem}.painDetail{border:1px solid #eadfd8;border-radius:13px;padding:11px;background:#fff}.painDetailHead{display:flex;justify-content:space-between;align-items:center;color:#6b1a2c;margin-bottom:8px}.painDetailHead button{border:0;background:#f6ecee;color:#6b1a2c;width:27px;height:27px;border-radius:50%;font-size:1.1rem}.painDetail>label{display:flex;justify-content:space-between;font-size:.75rem;font-weight:800}.painDetail>input[type=range]{width:100%;accent-color:#6b1a2c}.painDetailGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:7px}.painDetailGrid label{display:grid;gap:4px;font-size:.7rem;font-weight:800;color:#786a63}.painDetailGrid select,.painDetail textarea{border:1px solid #d9cec7;border-radius:9px;padding:9px;background:#fff}.painDetail textarea{width:100%;box-sizing:border-box;min-height:58px;margin-top:8px;resize:vertical}
@media(max-width:520px){.two{grid-template-columns:1fr}.scaleButtons button{padding:9px 0;font-size:.76rem}.brand h1{font-size:1.55rem}.wellnessSteps{grid-template-columns:1fr}.wellnessSteps span{padding:6px 8px}.wellnessCard{padding:14px}.human{width:145px}.bodyPicker{gap:4px;padding:10px 4px}.painPoint{width:22px;height:22px}.painHead{display:grid}.yesNo{justify-content:flex-start}}

.wellnessPage{min-height:100vh;background:#f4f1ed;padding:18px 10px 40px;font-family:Arial,sans-serif;color:#171315}.wellnessPhone{width:min(430px,100%);margin:0 auto;background:#fff;border:1px solid #e7dfdb;border-radius:24px;box-shadow:0 18px 50px rgba(45,25,30,.12);overflow:hidden}.wHeader{position:relative;padding:20px 22px 12px}.wLogo{color:#9f1733;font-weight:1000;letter-spacing:.02em;text-align:center}.wLogo span{font-size:1.25rem}.wProgress{height:6px;background:#e9e9e9;border-radius:99px;margin-top:18px;overflow:hidden}.wProgress i{display:block;height:100%;background:#a80e35;border-radius:99px;transition:width .2s}.wProgressText{text-align:right;font-size:.72rem;font-weight:900;margin-top:5px;color:#6d6265}.wStep{padding:2px 22px 20px}.wStep h1{font-size:1.08rem;margin:7px 0 2px}.wDate{margin:0 0 12px;font-size:.75rem;color:#62585b;text-transform:capitalize}.wPlayer{display:grid;gap:5px;margin:10px 0 14px;font-size:.76rem;font-weight:900}.wPlayer select,.wPainCard select,.wPainCard textarea,.wComment textarea{width:100%;box-sizing:border-box;border:1px solid #d7d7d7;border-radius:8px;background:#fff;padding:10px;font:inherit}.wPanel{border:1px solid #e5e1df;border-radius:10px;padding:0 10px}.wPanel h2{font-size:.9rem;margin:12px 0 4px}.wPanel .question{padding:12px 0}.wPanel .question h2{font-size:.78rem}.wPanel .question p{display:none}.wPanel .scaleButtons button{border:0;border-radius:50%;padding:0;width:25px;height:25px;font-size:.67rem;background:transparent;color:#342c2e}.wPanel .scaleButtons button.active{background:#a80e35;color:#fff;transform:none}.wPanel .scaleButtons{position:relative}.wPanel .scaleButtons:before{content:"";position:absolute;left:10px;right:10px;top:12px;height:4px;background:#ddd;z-index:0}.wPanel .scaleButtons button{position:relative;z-index:1}.wYesNo{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:10px 0}.wYesNo button,.wTypes button{border:1px solid #d8d8d8;background:#fff;border-radius:7px;padding:9px;font-weight:800}.wYesNo button.active,.wTypes button.active{background:#a80e35;color:#fff;border-color:#a80e35}.wBodyTabs{display:grid;grid-template-columns:1fr 1fr;text-align:center;color:#a80e35;border-bottom:2px solid #eee}.wBodyTabs b{padding:8px;border-bottom:2px solid #a80e35;margin-bottom:-2px}.wBodies{display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:8px 0}.wBodies .human{width:155px}.wBodies .bodyLabel{display:none}.wBodies .bodyShape{stroke:#8f8783}.wBodies .human svg{filter:drop-shadow(0 5px 5px rgba(55,38,33,.08))}.wBodies .painPoint{width:27px;height:27px;background:rgba(220,35,45,.18);border-color:rgba(220,35,45,.45)}.wBodies .painPoint.selected{background:#e32636;border-color:#fff;box-shadow:0 0 0 8px rgba(227,38,54,.18)}.wHint{text-align:center;font-size:.7rem;color:#776b6e}.wSelected{display:flex;gap:5px;flex-wrap:wrap}.wSelected span{background:#fff0f2;color:#a80e35;border-radius:99px;padding:5px 8px;font-size:.68rem;font-weight:800}.wNoPain{background:#f7f7f7;border-radius:10px;padding:25px;text-align:center;color:#777;margin:15px 0}.wNav{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.wNav.single{grid-template-columns:1fr}.wNav button{border:1px solid #ddd;background:#fff;border-radius:8px;padding:11px;font-weight:900}.wNav .next,.finish{background:#a80e35;color:#fff;border-color:#a80e35}.wPainList{display:grid;gap:10px}.wPainCard{border:1px solid #e2dfe0;border-radius:10px;padding:12px}.wPainTitle{display:flex;justify-content:space-between;align-items:center;background:#f7f5f5;padding:9px;border-radius:8px;margin-bottom:12px}.wPainTitle button{border:0;background:none;font-size:1.2rem}.wPainCard>label,.wComment{display:grid;gap:5px;font-size:.74rem;font-weight:900;margin:10px 0 5px}.wPainCard>label:first-of-type{display:flex;justify-content:space-between}.wRange{width:100%;accent-color:#a80e35}.wTypes{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.wTypes button{font-size:.68rem;padding:8px 4px}.wPainCard textarea,.wComment textarea{min-height:70px;resize:vertical}.wDone{padding:45px 22px 24px;box-sizing:border-box;text-align:center}.check{width:64px;height:64px;border-radius:50%;background:#0a9b4c;color:#fff;display:grid;place-items:center;margin:0 auto 10px;font-size:2.4rem;font-weight:900}.wDone h1{margin:0;font-size:1.4rem}.wDone>p{font-size:.8rem;color:#5f5659}.wRecap{text-align:left;border:1px solid #e3dfe0;border-radius:10px;padding:10px;margin:18px 0}.wRecap h2{font-size:.8rem;margin:0 0 7px}.wRecap div{display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid #eee;font-size:.75rem}.wRecap b{color:#0a9b4c}.wRecap.pain b{color:#d82030}.finish{width:100%;border:0;border-radius:8px;padding:12px;font-weight:900}
@media(max-width:430px){.wellnessPage{padding:0;background:#fff}.wellnessPhone{border:0;border-radius:0;box-shadow:none;min-height:100vh}.wBodies .human{width:140px}.wStep{padding-left:16px;padding-right:16px}.wHeader{padding-left:16px;padding-right:16px}}

.qTop{display:flex;align-items:center;justify-content:space-between;gap:16px}.qTop .wLogo{text-align:left}.qTop>b{font-size:.78rem;color:#171315;letter-spacing:.04em}
.questionnaireWide{width:min(980px,calc(100vw - 28px))}.questionnaireWide .wStep{padding:8px 30px 26px}.questionnaireWide .wHeader{padding-left:30px;padding-right:30px}
.qGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.qGrid .question,.qBox{border:1px solid #e7e1de;border-radius:14px;padding:16px;background:#fff;margin:0}.qGrid .injuryCheck{margin:0}.qBox{display:grid;gap:12px}.qBox strong{font-size:1rem}.qBox small{color:#756a66}.qBox .number{max-width:280px}
.painLayout{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:20px}.painMain{min-width:0}.painAside{border:1px solid #e7e1de;border-radius:16px;padding:14px;background:#fcfbfa;align-self:start;max-height:650px;overflow:auto}.painAside h2{font-size:.9rem;margin:0 0 10px}.painNav{grid-column:1/-1}.largeBodies{padding:12px 20px}.largeBodies .human{width:230px}.anSkin{stroke:#8f8b88;stroke-width:1;stroke-linejoin:round}.muscleLine{fill:none;stroke:#b9b4b1;stroke-width:1;stroke-linecap:round}.anatomical .painPoint{width:30px;height:30px;background:rgba(215,35,55,.14);border:1.5px solid rgba(215,35,55,.32);box-shadow:none}.anatomical .painPoint.selected{background:#c8103d;border:3px solid #fff;box-shadow:0 0 0 8px rgba(200,16,61,.18)}.largeBodies .anatomical .painPoint{width:32px;height:32px}
@media(max-width:760px){.questionnaireWide{width:100%}.qGrid,.painLayout{grid-template-columns:1fr}.painAside{max-height:none}.painNav{grid-column:auto}.largeBodies{padding:8px 0}.largeBodies .human{width:150px}.questionnaireWide .wStep{padding-left:16px;padding-right:16px}.questionnaireWide .wHeader{padding-left:16px;padding-right:16px}.qTop>b{font-size:.66rem}.qGrid .question,.qBox{padding:12px}}

.medicalBody{width:280px;aspect-ratio:306/612;position:relative}.anatomyCrop{position:absolute;inset:0;overflow:hidden;background:#fff}.anatomyCrop img{position:absolute;top:0;width:200%;height:100%;max-width:none;object-fit:fill;user-select:none;pointer-events:none}.anatomyPhoto.front .anatomyCrop img{left:0}.anatomyPhoto.back .anatomyCrop img{left:-100%}.medicalBody .painPoint{position:absolute;z-index:2;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:999px;background:rgba(200,16,61,.12);border:1.5px solid rgba(200,16,61,.42);box-shadow:0 0 0 3px rgba(200,16,61,.025);cursor:pointer}.medicalBody .painPoint:hover{background:rgba(200,16,61,.24);border-color:rgba(200,16,61,.65)}.medicalBody .painPoint.selected{background:#8f1731;border:3px solid #fff;box-shadow:0 0 0 6px rgba(143,23,49,.2)}.largeBodies{gap:3.2rem}.largeBodies .medicalBody{width:300px}
@media(max-width:760px){.largeBodies{gap:1.5rem}.medicalBody,.largeBodies .medicalBody{width:175px}.medicalBody .painPoint{width:19px;height:19px}}
`;
