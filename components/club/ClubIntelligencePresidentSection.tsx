"use client";

// components/club/ClubIntelligencePresidentSection.tsx
import { useEffect, useState } from "react";
import { getIntelligenceWorkspace, type ClubIntelligence360, type TeamHealth360 } from "@/lib/club-intelligence-360";

export default function ClubIntelligencePresidentSection({ clubId }: { clubId: string }) {
  const [data, setData] = useState<ClubIntelligence360 | null>(null);
  const [teams, setTeams] = useState<TeamHealth360[]>([]);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const workspace = await getIntelligenceWorkspace(clubId);
      setData(workspace.intelligence);
      setTeams(workspace.teamHealth);
    } catch (e: any) {
      setError(e?.message || "Dashboard impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  return (
    <section className="president">
      <header className="top">
        <div>
          <p>DASHBOARD PRÉSIDENT</p>
          <h2>{data?.clubName || "Mon club"}</h2>
          <span>Vue simple : effectifs, équipes, paiements, calendrier et prévisionnel.</span>
        </div>
        <button onClick={load}>Actualiser</button>
      </header>

      {error && <div className="alert">{error}</div>}

      <div className="kpis">
        <b>{data?.playersCount ?? 0}<small>joueurs</small></b>
        <b>{data?.coachesCount ?? 0}<small>coachs</small></b>
        <b>{data?.teamsCount ?? 0}<small>équipes</small></b>
        <b>{data?.paymentRate ?? 0}%<small>paiements OK</small></b>
        <b>{data?.licenseRate ?? 0}%<small>licences OK</small></b>
        <b>{data?.eventsCount ?? 0}<small>événements</small></b>
      </div>

      <div className="layout">
        <article className="panel">
          <h3>Équipes</h3>
          <p>Les équipes affichées ici sont celles du club : créées par l’admin ou par les coachs rattachés au club.</p>
          <div className="teams">
            {teams.map((team) => (
              <div className="team" key={team.teamId}>
                <strong>{team.teamName}</strong>
                <span>{team.playersCount} joueurs · Licence {team.licenseRate}% · Paiement {team.paymentRate}%</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <h3>Prévisionnel</h3>
          <div className="money">
            <strong>{(((data?.cotisationsPaidCents || 0) + (data?.cotisationsRemainingCents || 0) + (data?.incomeCents || 0)) / 100).toLocaleString("fr-FR")} €</strong>
            <span>Recettes suivies si tout est encaissé</span>
          </div>
          <div className="money light">
            <strong>{((data?.cotisationsRemainingCents || 0) / 100).toLocaleString("fr-FR")} €</strong>
            <span>Encore en attente</span>
          </div>
        </article>
      </div>

      <style jsx>{`
        .president{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.alert{margin:16px;padding:12px;border-radius:14px;background:#fff0f0;color:#b91c1c;font-weight:900}
        .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:18px}.kpis b{border:1px solid #eadfd5;background:#fff8ee;border-radius:20px;padding:16px;text-align:center;color:#6b1a2c;font-size:1.35rem}.kpis small{display:block;color:#6b7280;font-size:.72rem}
        .layout{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;padding:0 18px 18px}.panel{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.panel h3{margin:0 0 8px;color:#6b1a2c}.panel p{margin:0 0 14px;color:#6b7280;font-weight:800}.teams{display:grid;gap:10px}.team{border:1px solid #eef2f7;border-radius:16px;padding:12px}.team strong{color:#6b1a2c}.team span{display:block;color:#6b7280;font-weight:800}.money{border-radius:20px;background:#6b1a2c;color:white;padding:20px;margin-bottom:12px}.money.light{background:#fff8ee;color:#6b1a2c;border:1px solid #eadfd5}.money strong{font-size:2rem;font-family:"Alfa Slab One",serif}.money span{display:block;font-weight:800}
        @media(max-width:1000px){.kpis,.layout{grid-template-columns:1fr}}
      `}</style>
    </section>
  );
}
