"use client";

// components/club/ClubIntelligence360Section.tsx
import { useEffect, useMemo, useState } from "react";
import {
  getIntelligenceWorkspace,
  type ClubIntelligence360,
  type IntelligenceInsight,
  type TeamHealth360,
} from "@/lib/club-intelligence-360";

const TABS = ["Synthèse", "Santé club", "Équipes", "Prévisions"] as const;

function euros(cents: number) {
  return `${(cents / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
}

function scoreLabel(score: number) {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Solide";
  if (score >= 55) return "À surveiller";
  return "Prioritaire";
}

export default function ClubIntelligence360Section({ clubId }: { clubId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Synthèse");
  const [intelligence, setIntelligence] = useState<ClubIntelligence360 | null>(null);
  const [teamHealth, setTeamHealth] = useState<TeamHealth360[]>([]);
  const [score, setScore] = useState(0);
  const [insights, setInsights] = useState<IntelligenceInsight[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const data = await getIntelligenceWorkspace(clubId);
      setIntelligence(data.intelligence);
      setTeamHealth(data.teamHealth);
      setScore(data.score);
      setInsights(data.insights);
    } catch (e: any) {
      setError(e?.message || "Dashboard intelligence impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const topTeams = useMemo(() => {
    return [...teamHealth].sort((a, b) => {
      const scoreA = (a.licenseRate + a.paymentRate) / 2 + Math.min(a.playersCount, 15);
      const scoreB = (b.licenseRate + b.paymentRate) / 2 + Math.min(b.playersCount, 15);
      return scoreB - scoreA;
    });
  }, [teamHealth]);

  const forecast = useMemo(() => {
    const paid = intelligence?.cotisationsPaidCents || 0;
    const remaining = intelligence?.cotisationsRemainingCents || 0;
    const income = intelligence?.incomeCents || 0;
    const expenses = intelligence?.expenseCents || 0;
    return {
      seasonRevenue: paid + remaining + income,
      expectedBalance: paid + remaining + income - expenses,
      collectionRate: paid + remaining > 0 ? Math.round((paid / (paid + remaining)) * 100) : 0,
    };
  }, [intelligence]);

  return (
    <section className="intel">
      <div className="top">
        <div>
          <p>INTELLIGENCE 360</p>
          <h2>Dashboard président</h2>
          <span>Score de santé, synthèse automatique, alertes et prévisions.</span>
        </div>
        <button onClick={load}>Actualiser</button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <nav>
        {TABS.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>

      {tab === "Synthèse" && (
        <div className="dashboard">
          <div className="hero">
            <div>
              <p>Santé du club</p>
              <strong>{score}/100</strong>
              <span>{scoreLabel(score)}</span>
            </div>
            <div className="heroText">
              <b>{intelligence?.clubName || "Club"}</b>
              <span>{intelligence?.city || "Ville non renseignée"}</span>
            </div>
          </div>

          <div className="kpis">
            <b>{euros((intelligence?.cotisationsPaidCents || 0) + (intelligence?.incomeCents || 0))}<small>CA encaissé</small></b>
            <b>{intelligence?.playersCount ?? 0}<small>joueurs</small></b>
            <b>{intelligence?.coachesCount ?? 0}<small>coachs</small></b>
            <b>{intelligence?.teamsCount ?? 0}<small>équipes</small></b>
            <b>{intelligence?.licenseRate ?? 0}%<small>licences</small></b>
            <b>{intelligence?.paymentRate ?? 0}%<small>paiements</small></b>
            <b>{intelligence?.documentsCount ?? 0}<small>documents</small></b>
            <b>{(intelligence?.unreadNotificationsCount || 0) + (intelligence?.openTasksCount || 0)}<small>alertes/tâches</small></b>
          </div>

          <div className="panel">
            <h3>Synthèse automatique</h3>
            <div className="insights">
              {insights.map((insight) => (
                <article className={`insight ${insight.type}`} key={insight.id}>
                  <strong>{insight.title}</strong>
                  <p>{insight.description}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === "Santé club" && (
        <div className="health">
          <div className="scoreCard">
            <strong>{score}</strong>
            <span>{scoreLabel(score)}</span>
            <p>Score calculé avec les licences, paiements, coachs, équipes, notifications, tâches et calendrier.</p>
          </div>

          <div className="panel">
            <h3>Points de contrôle</h3>
            <div className="checks">
              <div><span>Licences</span><b>{intelligence?.licenseRate ?? 0}%</b></div>
              <div><span>Paiements</span><b>{intelligence?.paymentRate ?? 0}%</b></div>
              <div><span>Cotisations restantes</span><b>{euros(intelligence?.cotisationsRemainingCents ?? 0)}</b></div>
              <div><span>Tâches ouvertes</span><b>{intelligence?.openTasksCount ?? 0}</b></div>
              <div><span>Notifications</span><b>{intelligence?.unreadNotificationsCount ?? 0}</b></div>
              <div><span>Infos médicales</span><b>{intelligence?.medicalAlertsCount ?? 0}</b></div>
            </div>
          </div>
        </div>
      )}

      {tab === "Équipes" && (
        <div className="table">
          <div className="row head">
            <span>Équipe</span><span>Joueurs</span><span>Licences</span><span>Paiements</span><span>Créneaux</span><span>Événements</span>
          </div>
          {topTeams.map((team) => (
            <div className="row" key={team.teamId}>
              <span>{team.teamName}</span>
              <span>{team.playersCount}</span>
              <span>{team.licenseRate}%</span>
              <span>{team.paymentRate}%</span>
              <span>{team.slotsCount}</span>
              <span>{team.eventsCount}</span>
            </div>
          ))}
        </div>
      )}

      {tab === "Prévisions" && (
        <div className="forecast">
          <article className="forecastCard">
            <strong>{euros(forecast.seasonRevenue)}</strong>
            <span>CA saison prévisionnel</span>
          </article>
          <article className="forecastCard">
            <strong>{euros(forecast.expectedBalance)}</strong>
            <span>Solde prévisionnel</span>
          </article>
          <article className="forecastCard">
            <strong>{forecast.collectionRate}%</strong>
            <span>Taux d’encaissement</span>
          </article>
          <article className="panel">
            <h3>Lecture rapide</h3>
            <p>
              Si toutes les cotisations restantes sont encaissées, le club peut atteindre
              {" "}<b>{euros(forecast.seasonRevenue)}</b> de recettes suivies dans MyBasket.
            </p>
          </article>
        </div>
      )}

      <style jsx>{`
        .intel{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}
        .top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}
        nav{display:flex;gap:8px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid #eef2f7}nav button{background:#fffaf2;color:#6b1a2c}nav button.active{background:#6b1a2c;color:white}
        .alert.error{margin:16px;padding:12px 14px;border-radius:14px;background:#fff0f0;color:#b91c1c;font-weight:900}
        .dashboard,.health,.forecast{padding:18px}.hero{display:flex;justify-content:space-between;gap:18px;align-items:end;border-radius:28px;background:linear-gradient(135deg,#6b1a2c,#35101a);color:white;padding:30px;margin-bottom:18px}.hero p{margin:0;color:#d4a24c;font-weight:900;letter-spacing:.12em}.hero strong{display:block;font-size:3.4rem;font-family:"Alfa Slab One",serif}.heroText{text-align:right}.heroText b{font-size:1.6rem}.heroText span{display:block;color:#f8e8c8;font-weight:900}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px}.kpis b{border:1px solid #eadfd5;background:#fff8ee;border-radius:20px;padding:16px;text-align:center;color:#6b1a2c;font-size:1.35rem}.kpis small{display:block;color:#6b7280;font-size:.72rem}
        .panel,.scoreCard,.forecastCard{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.panel h3{margin:0 0 14px;color:#6b1a2c}.insights{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.insight{border:1px solid #eadfd5;border-radius:18px;padding:14px}.insight strong{color:#6b1a2c}.insight p{color:#374151;font-weight:800}.insight.success{background:#f0fff4}.insight.warning{background:#fff8ee}.insight.danger{background:#fff0f0}.insight.info{background:#f8fafc}
        .health{display:grid;grid-template-columns:280px 1fr;gap:18px}.scoreCard{text-align:center;background:#fff8ee}.scoreCard strong{display:block;font-size:4rem;color:#6b1a2c;font-family:"Alfa Slab One",serif}.scoreCard span{font-weight:900;color:#d4a24c}.scoreCard p{color:#374151;font-weight:800}.checks{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.checks div{border:1px solid #eef2f7;border-radius:18px;padding:14px}.checks span{color:#6b7280;font-weight:900}.checks b{display:block;color:#6b1a2c;font-size:1.4rem}
        .table{border:1px solid #eef2f7;border-radius:18px;margin:18px;overflow:hidden}.row{display:grid;grid-template-columns:1.4fr .8fr .8fr .8fr .8fr .8fr;border-bottom:1px solid #eef2f7}.row span{padding:12px;font-weight:800}.row.head{background:#f8fafc;color:#6b7280}
        .forecast{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.forecast .panel{grid-column:1/-1}.forecastCard strong{display:block;color:#6b1a2c;font-size:2rem;font-family:"Alfa Slab One",serif}.forecastCard span{color:#6b7280;font-weight:900}.panel p{color:#374151;font-weight:800}
        @media(max-width:1000px){.kpis,.health,.forecast,.checks,.row{grid-template-columns:1fr}.row.head{display:none}.hero{display:grid}.heroText{text-align:left}}
      `}</style>
    </section>
  );
}
