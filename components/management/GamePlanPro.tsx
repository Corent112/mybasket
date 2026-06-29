"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addGamePlanSystem,
  createGamePlan,
  createMatchEventForGamePlan,
  saveGamePlanScouting,
  type GamePlan,
  type GamePlanSystem,
} from "@/lib/game-plans";

export default function GamePlanPro() {
  const router = useRouter();

  const [plan, setPlan] = useState<GamePlan | null>(null);
  const [systems, setSystems] = useState<GamePlanSystem[]>([]);
  const [activeTab, setActiveTab] = useState<"systems" | "scout" | "rotations" | "keys">("systems");

  const [opponent, setOpponent] = useState("Cholet Basket");
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [competition, setCompetition] = useState("Championnat U18 Élite");

  const [keyPoints, setKeyPoints] = useState([
    "Contrôler le rebond défensif",
    "Courir après chaque stop",
    "Limiter le PNR central adverse",
  ]);

  async function ensurePlan() {
    if (plan) return plan;

    const created = await createGamePlan({
      title: `Game Plan vs ${opponent}`,
      opponent,
      match_date: matchDate || null,
      match_time: matchTime || null,
      competition,
      key_points: keyPoints,
    });

    setPlan(created);
    return created;
  }

  async function handleCreateMatch() {
    const gp = await ensurePlan();
    await createMatchEventForGamePlan(gp);
    alert("Match créé dans le calendrier et lié au Game Plan.");
  }

  async function handleLinkExistingEvent() {
    const gp = await ensurePlan();
    router.push(`/mon-compte?tab=calendrier&linkGamePlan=${gp.id}`);
  }

  async function handleAddFromPlaybook() {
    const gp = await ensurePlan();
    router.push(`/mon-compte/playbook?selectForGamePlan=${gp.id}`);
  }

  async function handleAddFromLibrary() {
    const gp = await ensurePlan();
    router.push(`/systemes?selectForGamePlan=${gp.id}`);
  }

  async function handleQuickSystem() {
    const gp = await ensurePlan();
    router.push(`/plaquette?type=systeme&return=game-plan&gamePlanId=${gp.id}`);
  }

  async function handleDrawOpponentSystem() {
    const gp = await ensurePlan();
    router.push(`/plaquette?type=scouting&return=game-plan&gamePlanId=${gp.id}`);
  }

  async function addFakeSystem(source: GamePlanSystem["source"]) {
    const gp = await ensurePlan();

    const created = await addGamePlanSystem({
      game_plan_id: gp.id,
      source,
      title: source === "scouting" ? "PNR Central adverse" : "Horns Twist",
      category: source === "scouting" ? "Système adverse" : "Demi-terrain",
      priority: systems.length + 1,
      objectif:
        source === "scouting"
          ? "Identifier leur jeu principal et préparer notre réponse défensive."
          : "Créer un avantage au poste haut et attaquer la défense sur switch.",
      schema_image: "",
    });

    setSystems((prev) => [...prev, created]);
  }

  async function handleSaveScouting() {
    const gp = await ensurePlan();

    await saveGamePlanScouting({
      game_plan_id: gp.id,
      opponent_team: opponent,
      coach: "Coach adverse",
      style_of_play: "Rythme rapide, beaucoup de PNR, transition",
      strengths: ["Tir à 3 pts", "Transition rapide", "Rebond offensif"],
      weaknesses: ["Défense sur PNR", "Perte de balle", "Faible défense écrans"],
      key_players: [
        { name: "#7 N. Diallo", role: "Meneur" },
        { name: "#12 M. Diop", role: "Ailier fort" },
      ],
      watch_player: "#10 Y. Gomis — shooteur sortie de banc",
      defensive_plan: "Montrer fort sur PNR, switch late, protéger la peinture.",
    });

    alert("Scouting sauvegardé.");
  }

  const offensiveSystems = useMemo(
    () => systems.filter((s) => s.source !== "scouting"),
    [systems]
  );

  const opponentSystems = useMemo(
    () => systems.filter((s) => s.source === "scouting"),
    [systems]
  );

  return (
    <section className="gameplan-page">
      <header className="gp-header">
        <div>
          <h1>GAME <span>PLAN</span></h1>
          <p>Prépare ton plan de match, ton scouting adverse et ton PDF staff.</p>
        </div>

        <button
          className="export-btn"
          onClick={() => window.print()}
        >
          Exporter PDF
        </button>
      </header>

      <nav className="gp-tabs">
        <button onClick={() => setActiveTab("systems")} className={activeTab === "systems" ? "active" : ""}>Systèmes</button>
        <button onClick={() => setActiveTab("scout")} className={activeTab === "scout" ? "active" : ""}>Scout adverse</button>
        <button onClick={() => setActiveTab("rotations")} className={activeTab === "rotations" ? "active" : ""}>Rotations</button>
        <button onClick={() => setActiveTab("keys")} className={activeTab === "keys" ? "active" : ""}>Points clés</button>
      </nav>

      <div className="gp-grid">
        <main className="gp-main">
          <section className="event-card">
            <h2>Lier à un événement</h2>

            <div className="match-fields">
              <input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Adversaire" />
              <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} />
              <input type="time" value={matchTime} onChange={(e) => setMatchTime(e.target.value)} />
              <input value={competition} onChange={(e) => setCompetition(e.target.value)} placeholder="Compétition" />
            </div>

            <div className="event-actions">
              <button onClick={handleLinkExistingEvent}>Lier à un événement existant</button>
              <button onClick={handleCreateMatch}>Créer un nouveau match</button>
            </div>
          </section>

          {activeTab === "systems" && (
            <>
              <section className="add-row">
                <button className="add-card red" onClick={handleAddFromPlaybook}>
                  <strong>Ajouter depuis Playbook</strong>
                  <span>Choisis un système dans tes playbooks</span>
                </button>

                <button className="add-card" onClick={handleAddFromLibrary}>
                  <strong>Ajouter depuis Bibliothèque</strong>
                  <span>Choisis un système de la bibliothèque</span>
                </button>

                <button className="add-card ghost" onClick={handleQuickSystem}>
                  <strong>Créer un système rapide</strong>
                  <span>Dessine avec la plaquette</span>
                </button>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2>Systèmes offensifs</h2>
                  <button onClick={() => addFakeSystem("playbook")}>+ Démo</button>
                </div>

                <div className="system-grid">
                  {offensiveSystems.map((s, index) => (
                    <article className="system-card" key={s.id}>
                      <div className="priority">{index + 1}</div>
                      <div className="schema-placeholder">Schéma</div>
                      <h3>{s.title}</h3>
                      <p>{s.category} • Priorité {index + 1}</p>
                      <b>Objectif</b>
                      <span>{s.objectif}</span>

                      <div className="card-actions">
                        <button onClick={() => router.push(`/plaquette?editSystem=${s.id}`)}>Modifier</button>
                        <button onClick={() => setSystems((prev) => prev.filter((x) => x.id !== s.id))}>Supprimer</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}

          {activeTab === "scout" && (
            <section className="panel scouting">
              <div className="panel-head">
                <h2>Scout adversaire</h2>
                <button onClick={handleSaveScouting}>Sauvegarder</button>
              </div>

              <div className="scout-grid">
                <div className="scout-box">
                  <h3>Identité équipe</h3>
                  <input placeholder="Équipe" defaultValue={opponent} />
                  <input placeholder="Coach" />
                  <textarea placeholder="Style de jeu" defaultValue="Rapide, beaucoup de PNR, transition" />
                </div>

                <div className="scout-box">
                  <h3>Forces</h3>
                  <textarea defaultValue={"Tir à 3 pts\nTransition rapide\nRebond offensif"} />
                </div>

                <div className="scout-box">
                  <h3>Faiblesses</h3>
                  <textarea defaultValue={"Défense sur PNR\nPerte de balle\nFaible défense sur écrans"} />
                </div>

                <div className="scout-box">
                  <h3>Joueurs clés</h3>
                  <textarea defaultValue={"#7 N. Diallo — Meneur\n#12 M. Diop — Ailier fort\n#10 Y. Gomis — Shooteur"} />
                </div>
              </div>

              <div className="panel-head">
                <h2>Systèmes adverses</h2>
                <button onClick={handleDrawOpponentSystem}>+ Dessiner avec plaquette</button>
              </div>

              <div className="system-grid small">
                {opponentSystems.map((s) => (
                  <article className="system-card" key={s.id}>
                    <div className="schema-placeholder">Schéma adverse</div>
                    <h3>{s.title}</h3>
                    <p>{s.objectif}</p>
                  </article>
                ))}

                <button className="empty-add" onClick={() => addFakeSystem("scouting")}>
                  + Ajouter système adverse
                </button>
              </div>

              <div className="scout-box full">
                <h3>Plan défensif</h3>
                <textarea defaultValue="Montrer fort sur PNR, switch late, protéger la peinture, limiter transition et tirs à 3 pts." />
              </div>
            </section>
          )}

          {activeTab === "rotations" && (
            <section className="panel">
              <h2>Rotations</h2>
              <p className="muted">À brancher avec ton module Rotation existant.</p>
              <button onClick={() => router.push("/mon-compte?tab=management&module=rotation")}>
                Ouvrir le module rotation
              </button>
            </section>
          )}

          {activeTab === "keys" && (
            <section className="panel">
              <h2>Points clés du match</h2>
              {keyPoints.map((p, i) => (
                <input
                  key={i}
                  value={p}
                  onChange={(e) =>
                    setKeyPoints((prev) =>
                      prev.map((x, idx) => (idx === i ? e.target.value : x))
                    )
                  }
                />
              ))}

              <button onClick={() => setKeyPoints((prev) => [...prev, ""])}>
                + Ajouter un point clé
              </button>
            </section>
          )}
        </main>

        <aside className="pdf-preview">
          <h2>Aperçu PDF — A4 recto verso</h2>

          <div className="a4-sheet">
            <h3>GAME PLAN</h3>
            <p>vs {opponent}</p>
            <p>{matchDate || "Date"} • {matchTime || "Heure"} • {competition}</p>

            <hr />

            <h4>1. Points clés</h4>
            <ul>{keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul>

            <h4>2. Nos systèmes offensifs</h4>
            <div className="pdf-mini-grid">
              {offensiveSystems.slice(0, 3).map((s) => (
                <div key={s.id}>
                  <div className="schema-mini" />
                  <b>{s.title}</b>
                </div>
              ))}
            </div>

            <h4>3. Scout adverse</h4>
            <p>Forces, faiblesses, joueurs clés, systèmes adverses et plan défensif.</p>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .gameplan-page {
          min-height: 100vh;
          background: radial-gradient(circle at top, #202020, #090909);
          color: white;
          padding: 28px;
        }

        .gp-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255,255,255,.12);
          padding-bottom: 24px;
        }

        h1 {
          font-size: 52px;
          margin: 0;
          letter-spacing: -2px;
        }

        h1 span, h2, h3 b {
          color: #b1122d;
        }

        .export-btn, .event-actions button, .panel button {
          background: #8f1028;
          color: white;
          border: 0;
          border-radius: 10px;
          padding: 13px 20px;
          font-weight: 800;
          cursor: pointer;
        }

        .gp-tabs {
          display: flex;
          gap: 28px;
          margin: 24px 0;
          border-bottom: 1px solid rgba(255,255,255,.12);
        }

        .gp-tabs button {
          background: transparent;
          color: white;
          border: 0;
          padding: 0 0 14px;
          cursor: pointer;
          opacity: .7;
          font-weight: 800;
        }

        .gp-tabs .active {
          opacity: 1;
          border-bottom: 3px solid #b1122d;
        }

        .gp-grid {
          display: grid;
          grid-template-columns: 1.2fr .8fr;
          gap: 28px;
        }

        .event-card, .panel, .add-card, .pdf-preview {
          background: rgba(255,255,255,.055);
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 20px 50px rgba(0,0,0,.25);
        }

        .match-fields {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin: 18px 0;
        }

        input, textarea {
          background: #111;
          color: white;
          border: 1px solid rgba(255,255,255,.15);
          border-radius: 10px;
          padding: 12px;
          width: 100%;
        }

        textarea {
          min-height: 100px;
        }

        .event-actions, .add-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }

        .add-card {
          text-align: left;
          min-height: 130px;
          cursor: pointer;
          color: white;
        }

        .add-card strong {
          display: block;
          font-size: 18px;
          margin-bottom: 10px;
        }

        .add-card span {
          opacity: .75;
        }

        .add-card.red {
          background: linear-gradient(135deg, #89142a, #4d0b18);
        }

        .add-card.ghost {
          border-style: dashed;
        }

        .panel {
          margin-top: 22px;
        }

        .panel-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 18px;
        }

        .system-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
        }

        .system-grid.small {
          grid-template-columns: repeat(2, 1fr);
        }

        .system-card {
          position: relative;
          background: #111;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 14px;
          padding: 14px;
        }

        .priority {
          position: absolute;
          top: 14px;
          left: 14px;
          background: #8f1028;
          padding: 8px 11px;
          border-radius: 8px;
          font-weight: 900;
        }

        .schema-placeholder {
          height: 120px;
          border-radius: 10px;
          background: linear-gradient(135deg, #d8ad6a, #f0cf91);
          color: #321;
          display: grid;
          place-items: center;
          font-weight: 900;
          margin-bottom: 14px;
        }

        .card-actions {
          display: flex;
          gap: 10px;
          margin-top: 14px;
        }

        .card-actions button {
          flex: 1;
          background: #222;
          border: 1px solid rgba(255,255,255,.12);
        }

        .scout-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }

        .scout-box {
          background: #111;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 14px;
          padding: 16px;
        }

        .scout-box.full {
          margin-top: 18px;
        }

        .empty-add {
          min-height: 190px;
          border: 1px dashed rgba(255,255,255,.25);
          background: transparent;
          color: white;
          border-radius: 14px;
          cursor: pointer;
        }

        .pdf-preview {
          background: #f5f5f5;
          color: #111;
        }

        .a4-sheet {
          background: white;
          min-height: 760px;
          padding: 32px;
          border: 1px solid #ddd;
          box-shadow: 0 15px 40px rgba(0,0,0,.2);
        }

        .a4-sheet h3 {
          font-size: 36px;
          color: #8f1028;
          margin-bottom: 4px;
        }

        .pdf-mini-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .schema-mini {
          height: 72px;
          background: #e6be7c;
          border-radius: 8px;
          margin-bottom: 6px;
        }

        .muted {
          opacity: .7;
        }

        @media print {
          body * {
            visibility: hidden;
          }

          .pdf-preview, .pdf-preview * {
            visibility: visible;
          }

          .pdf-preview {
            position: absolute;
            inset: 0;
            background: white;
          }

          .pdf-preview h2 {
            display: none;
          }

          .a4-sheet {
            box-shadow: none;
            border: 0;
            width: 210mm;
            min-height: 297mm;
          }
        }
      `}</style>
    </section>
  );
}