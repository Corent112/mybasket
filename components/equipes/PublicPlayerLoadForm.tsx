"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PublicPlayer = { id: string; first_name: string; last_name: string };
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
      setPlayerId(next.players?.[0]?.id || "");
      setLoading(false);
    })();
  }, [supabase, token]);

  const kind = payload?.kind || "post_session";
  const selected = payload?.players?.find((player) => player.id === playerId);

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
    return (
      <main className="publicPage">
        <section className="success">
          <div>✓</div>
          <h1>Merci {selected?.first_name || ""} !</h1>
          <p>
            Ta réponse a bien été enregistrée. Le staff la retrouve
            automatiquement dans MyBasket.
          </p>
          <button onClick={() => { setDone(false); setComment(""); }}>
            Nouvelle réponse
          </button>
        </section>
        <style jsx>{css}</style>
      </main>
    );
  }

  return (
    <main className="publicPage">
      <section className="brand">
        <small>MYBASKET · {kind === "post_session" ? "CHARGE" : "WELLNESS"}</small>
        <h1>{payload.team_name || "Mon équipe"}</h1>
        <p>{kind === "post_session" ? "Retour après séance" : "État de récupération"}</p>
      </section>

      <section className="card">
        <label className="field">
          <span>Joueur</span>
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
            {payload.players?.map((player) => (
              <option key={player.id} value={player.id}>
                {player.first_name} {player.last_name}
              </option>
            ))}
          </select>
        </label>

        {kind === "post_session" && (
          <>
            <div className="two">
              <label className="field">
                <span>Durée</span>
                <div className="number">
                  <input
                    type="number"
                    min={0}
                    max={300}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value) || 0)}
                  />
                  <b>min</b>
                </div>
              </label>

              <label className="field">
                <span>Type</span>
                <select value={loadType} onChange={(e) => setLoadType(e.target.value)}>
                  <option value="basket">Basket</option>
                  <option value="physical">Préparation physique</option>
                  <option value="game">Match</option>
                  <option value="individual">Individuel</option>
                </select>
              </label>
            </div>

            <Question
              title="RPE · difficulté ressentie"
              subtitle="1 = très facile · 10 = extrêmement difficile"
            >
              <Scale value={rpe} onChange={setRpe} low="Très facile" high="Très difficile" />
            </Question>

            <div className="loadPreview">
              <span>Charge calculée</span>
              <strong>{Math.round(duration * rpe)}</strong>
              <small>Durée × RPE</small>
            </div>
          </>
        )}

        <label className="injuryCheck"><input type="checkbox" checked={injured} onChange={(e)=>setInjured(e.target.checked)}/><span><b>Je suis blessé(e)</b><small>Ma réponse est enregistrée pour le staff, mais elle n'entre pas dans les moyennes RPE / récupération du groupe.</small></span></label>

        <Question title="Fatigue" subtitle="Comment te sens-tu physiquement ?">
          <Scale value={fatigue} onChange={setFatigue} />
        </Question>

        <Question
          title="Douleurs / courbatures"
          subtitle="Choisis 1 si tu n'as pratiquement aucune gêne."
        >
          <Scale
            value={soreness}
            onChange={setSoreness}
            low="Aucune gêne"
            high="Très douloureux"
          />
        </Question>

        <Question
          title="Qualité du sommeil"
          subtitle="Plus la note est haute, meilleure est ta récupération."
        >
          <Scale value={sleep} onChange={setSleep} low="Très mauvais" high="Excellent" />
        </Question>

        <Question
          title="Stress / charge mentale"
          subtitle="École, travail, perso, fatigue générale."
        >
          <Scale value={stress} onChange={setStress} />
        </Question>

        <label className="field">
          <span>Commentaire facultatif</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Une douleur particulière ? Quelque chose à signaler au staff ?"
          />
        </label>

        <button className="send" disabled={sending} onClick={submit}>
          {sending ? "Envoi…" : "ENVOYER"}
        </button>

        <p className="privacy">
          Ces informations servent au suivi de charge et de récupération du
          staff. Elles ne constituent pas un diagnostic médical.
        </p>
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
.card,.success{background:white;border:1px solid #eadfd8;border-radius:18px;padding:16px}
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
@media(max-width:520px){.two{grid-template-columns:1fr}.scaleButtons button{padding:9px 0;font-size:.76rem}.brand h1{font-size:1.55rem}}
`;
