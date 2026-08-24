"use client";

import { useEffect, useState } from "react";

type AlertRow = {
  id: string | null;
  playerId: string;
  playerName: string | null;
  severity: "watch" | "alert";
  rpeValue: number;
  targetRpe: number | null;
  groupAverage: number | null;
  targetDelta: number | null;
  groupDelta: number | null;
  acknowledgedAt: string | null;
};

type Payload = {
  responseDate: string;
  answered: number;
  totalPlayers: number;
  targetRpe: number | null;
  groupAverage: number | null;
  counts: { normal: number; watch: number; alert: number };
  alerts: AlertRow[];
};

export default function RpeAlertsPanel({
  teamId,
  canViewIndividual,
}: {
  teamId: string;
  canViewIndividual: boolean;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch(`/api/rpe/alerts?teamId=${encodeURIComponent(teamId)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Synthèse RPE indisponible.");
      setData(payload as Payload);
    } catch (error) {
      console.error(error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function acknowledge(alertId: string) {
    const response = await fetch("/api/rpe/acknowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId, alertId }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return alert(payload.error || "Impossible de prendre en compte l'alerte.");
    }
    await load();
  }

  if (loading) return <div className="rpePanel loading">Analyse RPE…</div>;
  if (!data) return null;

  const dateLabel = new Date(`${data.responseDate}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });

  return (
    <section className="rpePanel">
      <div className="head">
        <div>
          <span>CHARGE & RPE</span>
          <h2>RPE — {dateLabel}</h2>
          <p>{data.answered} / {data.totalPlayers} réponses</p>
        </div>
        <div className="averages">
          <div><small>Moyenne</small><b>{data.groupAverage ?? "—"}</b></div>
          <div><small>Attendu</small><b>{data.targetRpe ?? "—"}</b></div>
        </div>
      </div>

      <div className="counts">
        <div className="normal"><b>🟢 {data.counts.normal}</b><span>normaux</span></div>
        <div className="watch"><b>🟠 {data.counts.watch}</b><span>à surveiller</span></div>
        <div className="alert"><b>🔴 {data.counts.alert}</b><span>alertes</span></div>
      </div>

      {canViewIndividual && data.alerts.length > 0 && (
        <div className="alerts">
          {data.alerts.map((row) => (
            <article key={row.id ?? `${row.playerId}-${row.severity}`} className={row.severity}>
              <div className="alertHead">
                <strong>{row.severity === "alert" ? "🔴" : "🟠"} {row.playerName || "Joueur"}</strong>
                <b>{row.rpeValue}/10</b>
              </div>
              <div className="metrics">
                <span>Attendu <b>{row.targetRpe ?? "—"}</b></span>
                <span>Moyenne groupe <b>{row.groupAverage ?? "—"}</b></span>
                <span>Écart attendu <b>{row.targetDelta == null ? "—" : `${row.targetDelta >= 0 ? "+" : ""}${row.targetDelta}`}</b></span>
                <span>Écart groupe <b>{row.groupDelta == null ? "—" : `${row.groupDelta >= 0 ? "+" : ""}${row.groupDelta}`}</b></span>
              </div>
              <div className="actions">
                <button onClick={() => (window.location.href = `/equipes/${teamId}/${row.playerId}`)}>Fiche joueur</button>
                {row.id && !row.acknowledgedAt ? (
                  <button className="ack" onClick={() => void acknowledge(row.id!)}>✓ Alerte prise en compte</button>
                ) : row.acknowledgedAt ? (
                  <span className="done">✓ Prise en compte</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="medical">MyBasket signale uniquement les valeurs et les écarts de charge. Aucun diagnostic médical n’est produit.</p>

      <style jsx>{`
        .rpePanel{grid-column:1/-1;background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:16px}.rpePanel.loading{color:#7b6d65;font-weight:800}
        .head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.head span{font-size:.67rem;letter-spacing:.11em;color:#d4a24c;font-weight:1000}.head h2{margin:4px 0 2px}.head p{margin:0;color:#7b6d65;font-size:.75rem}
        .averages{display:flex;gap:8px}.averages>div{min-width:82px;border:1px solid #eee4df;border-radius:12px;padding:8px 10px;text-align:center}.averages small,.averages b{display:block}.averages small{font-size:.62rem;color:#877970}.averages b{font-size:1.05rem;color:#6b1a2c;margin-top:2px}
        .counts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}.counts>div{border-radius:12px;padding:11px 12px}.counts b,.counts span{display:block}.counts span{font-size:.68rem;margin-top:2px}.normal{background:#eef8f0;color:#216d37}.watch{background:#fff6e5;color:#9c5e00}.alert{background:#fff0f1;color:#a51e32}
        .alerts{display:grid;gap:9px;margin-top:12px}.alerts article{border:1px solid #eadfd8;border-left-width:4px;border-radius:12px;padding:12px}.alerts article.watch{background:#fffaf0;border-left-color:#d78b16}.alerts article.alert{background:#fff7f7;border-left-color:#b42318}
        .alertHead{display:flex;justify-content:space-between;gap:10px}.alertHead>b{font-size:1.05rem}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:9px}.metrics span{font-size:.68rem;color:#766860}.metrics b{display:block;color:#2d231f;margin-top:2px}.actions{display:flex;gap:7px;align-items:center;margin-top:10px}.actions button{border:1px solid #d9cdc6;border-radius:999px;padding:7px 10px;background:#fff;color:#6b1a2c;font-weight:900;cursor:pointer}.actions .ack{background:#6b1a2c;color:#fff;border-color:#6b1a2c}.done{font-size:.7rem;color:#397349;font-weight:900}.medical{margin:12px 0 0;color:#8b7d76;font-size:.66rem}
        @media(max-width:700px){.head{flex-direction:column}.counts{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}.actions{align-items:flex-start;flex-direction:column}}
      `}</style>
    </section>
  );
}
