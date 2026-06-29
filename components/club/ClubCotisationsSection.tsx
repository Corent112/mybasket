"use client";

// components/club/ClubCotisationsSection.tsx
import { useEffect, useMemo, useState } from "react";
import type { ClubPlayer, ClubTeam } from "@/lib/club-core";
import {
  assignPlanToTeam,
  createCotisationPlan,
  getCotisationsWorkspace,
  recordCotisationPayment,
  type CotisationPlan,
  type PlayerCotisation,
} from "@/lib/club-cotisations";

function euros(cents: number) {
  return `${(cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

export default function ClubCotisationsSection({ clubId }: { clubId: string }) {
  const [plans, setPlans] = useState<CotisationPlan[]>([]);
  const [cotisations, setCotisations] = useState<PlayerCotisation[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [teamId, setTeamId] = useState("");
  const [planId, setPlanId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [planName, setPlanName] = useState("Cotisation saison");
  const [season, setSeason] = useState("2026-2027");
  const [amount, setAmount] = useState("250");
  const [dueDate, setDueDate] = useState("");

  async function load() {
    setError("");
    try {
      const data = await getCotisationsWorkspace(clubId);
      setPlans(data.plans);
      setCotisations(data.cotisations);
      setPlayers(data.players);
      setTeams(data.teams);
      if (!planId && data.plans[0]) setPlanId(data.plans[0].id);
    } catch (e: any) {
      setError(e?.message || "Cotisations impossibles à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cotisations.filter((cot) => {
      const player = players.find((p) => p.id === cot.playerId);
      const byTeam = !teamId || cot.teamId === teamId;
      const byQuery = !q || `${player?.firstName} ${player?.lastName}`.toLowerCase().includes(q);
      return byTeam && byQuery;
    });
  }, [cotisations, players, teamId, query]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, cot) => {
        acc.expected += cot.amountCents;
        acc.paid += cot.paidCents;
        acc.remaining += cot.remainingCents;
        return acc;
      },
      { expected: 0, paid: 0, remaining: 0 }
    );
  }, [filtered]);

  async function savePlan() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const created = await createCotisationPlan({
        clubId,
        name: planName,
        season,
        amountCents: Math.round(Number(amount || 0) * 100),
        dueDate: dueDate || null,
      });

      setPlans((prev) => [created, ...prev]);
      setPlanId(created.id);
      setMessage("Plan de cotisation créé.");
    } catch (e: any) {
      setError(e?.message || "Plan non créé.");
    } finally {
      setSaving(false);
    }
  }

  async function assign() {
    if (!teamId || !planId) {
      setError("Choisis une équipe et un plan.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const rows = await assignPlanToTeam({ clubId, teamId, planId });
      setCotisations((prev) => [
        ...rows,
        ...prev.filter((old) => !rows.some((row) => row.id === old.id)),
      ]);
      setMessage(`${rows.length} cotisations générées.`);
      await load();
    } catch (e: any) {
      setError(e?.message || "Affectation impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function pay(cot: PlayerCotisation) {
    const value = prompt("Montant reçu en € ?", String(cot.remainingCents / 100));
    if (!value) return;

    try {
      await recordCotisationPayment({
        clubId,
        cotisationId: cot.id,
        playerId: cot.playerId,
        amountCents: Math.round(Number(value) * 100),
        paymentMethod: "manual",
      });
      await load();
    } catch (e: any) {
      setError(e?.message || "Paiement non enregistré.");
    }
  }

  return (
    <section className="cotis">
      <div className="top">
        <div>
          <p>COTISATIONS</p>
          <h2>Paiements joueurs</h2>
          <span>Plans, affectation par équipe, suivi payé / restant et relances.</span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <aside className="side">
          <h3>Nouveau plan</h3>
          <label>Nom<input value={planName} onChange={(e) => setPlanName(e.target.value)} /></label>
          <label>Saison<input value={season} onChange={(e) => setSeason(e.target.value)} /></label>
          <label>Montant (€)<input value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label>Échéance<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
          <button disabled={saving} onClick={savePlan}>Créer plan</button>

          <hr />

          <h3>Affecter à une équipe</h3>
          <label>Plan
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Choisir</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {euros(plan.amountCents)}</option>)}
            </select>
          </label>
          <label>Équipe
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Choisir</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <button disabled={saving} onClick={assign}>Générer cotisations</button>
        </aside>

        <main className="main">
          <div className="kpis">
            <b>{euros(totals.expected)}<small>attendu</small></b>
            <b>{euros(totals.paid)}<small>encaissé</small></b>
            <b>{euros(totals.remaining)}<small>restant</small></b>
            <b>{filtered.filter((c) => c.status === "paid").length}<small>payés</small></b>
          </div>

          <div className="tools">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher joueur..." />
          </div>

          <div className="table">
            <div className="row head">
              <span>Joueur</span><span>Équipe</span><span>Montant</span><span>Payé</span><span>Reste</span><span>Statut</span><span>Action</span>
            </div>
            {filtered.map((cot) => {
              const player = players.find((p) => p.id === cot.playerId);
              const team = teams.find((t) => t.id === cot.teamId);
              return (
                <div className="row" key={cot.id}>
                  <span>{player ? `${player.lastName} ${player.firstName}` : "—"}</span>
                  <span>{team?.name || "—"}</span>
                  <span>{euros(cot.amountCents)}</span>
                  <span>{euros(cot.paidCents)}</span>
                  <span>{euros(cot.remainingCents)}</span>
                  <span>{cot.status}</span>
                  <span><button onClick={() => pay(cot)}>Paiement</button></span>
                </div>
              );
            })}
          </div>
        </main>
      </div>

      <style jsx>{`
        .cotis{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .layout{display:grid;grid-template-columns:330px 1fr;gap:18px;padding:18px}.side,.main{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.side{background:#fffdf8}.side h3{margin:0 0 14px;color:#6b1a2c}
        label{display:grid;gap:6px;margin-bottom:12px;color:#6b7280;font-weight:900;font-size:.78rem}input,select{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer}hr{border:0;border-top:1px solid #eadfd5;margin:18px 0}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}.kpis b{border:1px solid #eadfd5;background:#fff8ee;border-radius:20px;padding:16px;text-align:center;color:#6b1a2c;font-size:1.2rem}.kpis small{display:block;color:#6b7280;font-size:.72rem}
        .tools{margin-bottom:14px}.tools input{width:100%}.table{border:1px solid #eef2f7;border-radius:18px;overflow:hidden}.row{display:grid;grid-template-columns:1.3fr 1fr .8fr .8fr .8fr .7fr .8fr;border-bottom:1px solid #eef2f7}.row span{padding:12px;font-weight:800}.row.head{background:#f8fafc;color:#6b7280}
        @media(max-width:1050px){.layout,.kpis,.row{grid-template-columns:1fr}.row.head{display:none}}
      `}</style>
    </section>
  );
}
