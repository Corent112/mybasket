"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteTeam, saveTeam, upsertPlayer } from "@/lib/equipes-store";
import PlayerForm from "@/components/equipes/PlayerForm";
import { emptyTeam, type Player, type Team } from "@/types/player";

type Props = {
  teams: Team[];
  onReload: () => Promise<void> | void;
};

type Draft = { name: string; category: string; level: string; logo: string };

const EMPTY: Draft = { name: "", category: "", level: "", logo: "" };

function isScoutTeam(team: Team) {
  const t = String((team as any).teamType ?? (team as any).team_type ?? "").toLowerCase();
  return (team as any).isScoutTeam === true || (team as any).scout === true || t === "scout" || t === "scouting" || t === "scouted";
}

function playerName(player: Player) {
  return [player.firstName, player.lastName].filter(Boolean).join(" ").trim() || `Joueur #${player.num ?? "—"}`;
}

export default function ScoutTeamsManager({ teams, onReload }: Props) {
  const router = useRouter();
  const scoutTeams = useMemo(() => teams.filter(isScoutTeam), [teams]);
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [playerFor, setPlayerFor] = useState<string | null>(null);

  const createScoutTeam = async () => {
    if (!draft.name.trim() || busy) return;
    setBusy(true);
    try {
      const base = emptyTeam();
      await saveTeam({
        ...base,
        id: "",
        name: draft.name.trim(),
        cat: draft.category.trim() || "SCOUT",
        categorieLabel: draft.category.trim() || "Équipe scoutée",
        niveau: draft.level.trim() || "",
        logo: draft.logo.trim() || null,
        coach: "",
        entraineurPrincipal: "",
        players: [],
        teamType: "scout",
        isScoutTeam: true,
        scout: true,
      } as Team);
      setDraft(EMPTY);
      setShowCreate(false);
      await onReload();
    } catch (error) {
      console.error("Création équipe scoutée :", error);
      alert("Impossible de créer l'équipe scoutée.");
    } finally {
      setBusy(false);
    }
  };

  const addPlayer = async (teamId: string, player: Player) => {
    try {
      await upsertPlayer(teamId, player);
      setPlayerFor(null);
      await onReload();
    } catch (error) {
      console.error("Ajout joueur scout :", error);
      alert("Impossible d'ajouter ce joueur.");
    }
  };

  return (
    <div className="stm-root">
      <div className="stm-head">
        <div>
          <h3>Équipes scoutées</h3>
          <p>Construis ta base d'adversaires. Ces équipes ne consomment pas ton quota d'équipes coachées.</p>
        </div>
        <button className="stm-primary" type="button" onClick={() => setShowCreate(true)}>＋ Nouvelle équipe scoutée</button>
      </div>

      {!scoutTeams.length ? (
        <button className="stm-empty" type="button" onClick={() => setShowCreate(true)}>
          <span>👁️</span>
          <div><b>Crée ton premier adversaire</b><small>Ajoute le club et son effectif, puis code ses matchs dans LiveStats.</small></div>
        </button>
      ) : (
        <div className="stm-list">
          {scoutTeams.map((team) => {
            const open = openTeamId === team.id;
            const matchCount = team.statsHistory?.length ?? team.matchs?.length ?? 0;
            return (
              <article key={team.id} className="stm-card">
                <div className="stm-logo">{team.logo ? <img src={team.logo} alt="" /> : <span>🏀</span>}</div>
                <div className="stm-info">
                  <small>ÉQUIPE SCOUTÉE</small>
                  <h4>{team.name}</h4>
                  <span>{[team.cat || team.categorieLabel, team.niveau].filter(Boolean).join(" · ") || "Adversaire"}</span>
                </div>
                <div className="stm-kpis">
                  <div><b>{team.players?.length ?? 0}</b><span>Joueurs</span></div>
                  <div><b>{matchCount}</b><span>Matchs codés</span></div>
                </div>
                <div className="stm-actions">
                  <button type="button" onClick={() => router.push(`/prise-stats-pro?scoutTeamId=${encodeURIComponent(team.id)}`)}>▶ Coder un match</button>
                  <button type="button" onClick={() => setOpenTeamId(open ? null : team.id)}>{open ? "Fermer" : "Effectif"}</button>
                  <button type="button" className="danger" onClick={async () => {
                    if (!confirm(`Supprimer l'équipe scoutée « ${team.name} » et ses données liées ?`)) return;
                    await deleteTeam(team.id); await onReload();
                  }}>🗑</button>
                </div>
                {open && (
                  <div className="stm-roster">
                    <div className="stm-roster-head"><b>Effectif scouting</b><button type="button" onClick={() => setPlayerFor(team.id)}>＋ Ajouter un joueur</button></div>
                    <div className="stm-players">
                      {(team.players || []).map((player) => (
                        <div key={player.id} className="stm-player">
                          <div className="stm-avatar">{player.photo ? <img src={player.photo} alt="" /> : <span>{player.firstName?.[0]}{player.lastName?.[0]}</span>}</div>
                          <div><b>#{player.num ?? "—"} {playerName(player)}</b><span>Poste {player.postePrincipal || "—"} · {player.taille || "—"} · {player.mainDominante || "Main à renseigner"}</span></div>
                        </div>
                      ))}
                      {!team.players?.length && <p>Aucun joueur. Ajoute l'effectif avant le premier scouting.</p>}
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="stm-overlay" onMouseDown={() => setShowCreate(false)}>
          <div className="stm-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="stm-modal-head"><div><small>NOUVEL ADVERSAIRE</small><h3>Créer une équipe scoutée</h3></div><button type="button" onClick={() => setShowCreate(false)}>×</button></div>
            <div className="stm-grid">
              <label>Nom du club<input autoFocus value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="AS Monaco" /></label>
              <label>Catégorie<input value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} placeholder="Senior / U18…" /></label>
              <label>Championnat / niveau<input value={draft.level} onChange={(e) => setDraft((d) => ({ ...d, level: e.target.value }))} placeholder="Betclic Elite" /></label>
              <label>Logo (URL)<input value={draft.logo} onChange={(e) => setDraft((d) => ({ ...d, logo: e.target.value }))} placeholder="https://…" /></label>
            </div>
            <div className="stm-modal-actions"><button type="button" onClick={() => setShowCreate(false)}>Annuler</button><button type="button" className="stm-primary" disabled={!draft.name.trim() || busy} onClick={createScoutTeam}>{busy ? "Création…" : "Créer l'équipe"}</button></div>
          </div>
        </div>
      )}

      {playerFor && <PlayerForm onSave={(player) => addPlayer(playerFor, player)} onClose={() => setPlayerFor(null)} />}

      <style jsx>{`
        .stm-root{display:grid;gap:16px}.stm-head{display:flex;align-items:center;justify-content:space-between;gap:18px}.stm-head h3{margin:0;color:#171318;font-size:1.35rem}.stm-head p{margin:3px 0 0;color:#83766e;font-size:.78rem}.stm-primary{border:0;background:#6B1A2C;color:#fff;border-radius:10px;padding:10px 14px;font-weight:900;cursor:pointer}.stm-empty{width:100%;display:flex;align-items:center;gap:14px;text-align:left;border:1px dashed #d8c7b8;background:#fffaf2;border-radius:16px;padding:22px;cursor:pointer;color:#6B1A2C}.stm-empty>span{font-size:2rem}.stm-empty b,.stm-empty small{display:block}.stm-empty small{color:#897b73;margin-top:3px}.stm-list{display:grid;gap:11px}.stm-card{display:grid;grid-template-columns:78px minmax(220px,1.2fr) minmax(220px,.8fr) auto;align-items:center;gap:14px;border:1px solid #e8ddd2;background:#fff;border-radius:16px;padding:14px 16px;box-shadow:0 8px 24px rgba(60,30,20,.04)}.stm-logo{width:64px;height:64px;border-radius:50%;background:#f5eee6;display:grid;place-items:center;overflow:hidden}.stm-logo img,.stm-avatar img{width:100%;height:100%;object-fit:cover}.stm-info small{font-size:.57rem;color:#D4A24C;font-weight:950;letter-spacing:.08em}.stm-info h4{margin:2px 0;font-size:1.1rem;color:#6B1A2C}.stm-info span{font-size:.72rem;color:#887a72}.stm-kpis{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.stm-kpis div{background:#faf6f0;border-radius:10px;padding:9px;text-align:center}.stm-kpis b,.stm-kpis span{display:block}.stm-kpis b{color:#6B1A2C;font-size:1rem}.stm-kpis span{font-size:.59rem;text-transform:uppercase;color:#8d8179;font-weight:850}.stm-actions{display:flex;gap:6px}.stm-actions button,.stm-roster-head button{border:1px solid #dfd3c8;background:#fff;color:#6B1A2C;border-radius:8px;padding:8px 10px;font-weight:850;font-size:.68rem;cursor:pointer;white-space:nowrap}.stm-actions button:first-child{background:#6B1A2C;color:#fff;border-color:#6B1A2C}.stm-actions .danger{color:#c62a38}.stm-roster{grid-column:1/-1;border-top:1px solid #eee4db;padding-top:12px}.stm-roster-head{display:flex;align-items:center;justify-content:space-between;color:#6B1A2C}.stm-players{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:9px}.stm-player{display:flex;align-items:center;gap:8px;border:1px solid #eee4db;border-radius:10px;padding:8px}.stm-avatar{width:38px;height:38px;border-radius:50%;overflow:hidden;background:#f2ece6;display:grid;place-items:center;font-weight:900}.stm-player b,.stm-player span{display:block}.stm-player b{font-size:.72rem}.stm-player span{font-size:.59rem;color:#897c74;margin-top:2px}.stm-players p{color:#8b7d75;font-size:.72rem}.stm-overlay{position:fixed;inset:0;z-index:10000;background:rgba(20,12,16,.62);display:grid;place-items:center;padding:20px}.stm-modal{width:min(680px,96vw);background:#fff;border-radius:17px;padding:18px;box-shadow:0 30px 90px rgba(0,0,0,.3)}.stm-modal-head{display:flex;justify-content:space-between;align-items:flex-start}.stm-modal-head small{font-size:.58rem;color:#D4A24C;font-weight:950}.stm-modal-head h3{margin:2px 0;color:#6B1A2C}.stm-modal-head>button{border:0;background:#f5efe9;width:32px;height:32px;border-radius:8px;cursor:pointer}.stm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px 0}.stm-grid label{font-size:.65rem;font-weight:900;color:#6B1A2C}.stm-grid input{display:block;width:100%;margin-top:4px;border:1px solid #d9cec5;border-radius:9px;padding:10px;box-sizing:border-box}.stm-modal-actions{display:flex;justify-content:flex-end;gap:8px}.stm-modal-actions>button:not(.stm-primary){border:1px solid #ddd1c7;background:#fff;border-radius:9px;padding:9px 12px;cursor:pointer}@media(max-width:900px){.stm-card{grid-template-columns:64px 1fr}.stm-kpis,.stm-actions{grid-column:1/-1}.stm-players{grid-template-columns:1fr 1fr}}@media(max-width:620px){.stm-head{align-items:flex-start;flex-direction:column}.stm-grid,.stm-players{grid-template-columns:1fr}.stm-actions{flex-wrap:wrap}}
      `}</style>
    </div>
  );
}
