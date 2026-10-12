"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { attachExistingPlayer, getTeams } from "@/lib/equipes-store";
import type { Team } from "@/types/player";

/** Either choose an existing player for a team, or another team for a player. */
export default function PlayerTeamAttachment({ teamId, playerId, onDone }: { teamId: string; playerId?: string; onDone: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setError(""); setSelected("");
    getTeams().then(rows => { if (active) setTeams(rows.filter(team => !team.isShared)); }).catch(err => { if (active) setError(err.message || "Impossible de charger les équipes."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]);
  const target = teams.find(team => team.id === teamId);
  const candidates = Array.from(new Map(teams.flatMap(team => team.players.map(player => [player.id, { player, team }] as const))).values()).filter(({ player }) => !target?.players.some(existing => existing.id === player.id));
  const options = playerId ? teams.filter(team => !team.players.some(player => player.id === playerId)).map(team => ({ id: team.id, label: `${team.name} · ${team.cat}` })) : candidates.map(({ player, team }) => ({ id: player.id, label: `${player.firstName} ${player.lastName} — ${team.name} · ${team.cat}` }));
  async function save() {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      await attachExistingPlayer(playerId || selected, playerId ? selected : teamId);
      await onDone(); setOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Rattachement impossible."); }
    finally { setBusy(false); }
  }
  return <>
    <button type="button" onClick={() => setOpen(true)} style={{ border: "1px solid #ded3d7", background: "#fff", color: "#6b1a2c", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700 }}>{playerId ? "＋ Rattacher à une autre équipe" : "＋ Ajouter un joueur existant"}</button>
    {open && createPortal(<div onClick={() => !busy && setOpen(false)} style={{ position: "fixed", inset: 0, background: "#16101a99", zIndex: 100000, display: "grid", placeItems: "center", padding: 16 }}><section role="dialog" aria-modal="true" aria-labelledby="player-attachment-title" onClick={event => event.stopPropagation()} style={{ width: "min(100%, 520px)", background: "white", borderRadius: 18, padding: 24, boxShadow: "0 20px 70px #0003" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><h2 id="player-attachment-title" style={{ margin: 0, fontSize: 20 }}>{playerId ? "Une fiche, plusieurs équipes" : "Ajouter un joueur existant"}</h2><button type="button" aria-label="Fermer" disabled={busy} onClick={() => setOpen(false)} style={{ border: 0, background: "#f4f0f2", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>×</button></div>
      <p style={{ color: "#65616a", fontSize: 14 }}>La fiche et l’identifiant du joueur sont conservés. Ses statistiques restent liées à chaque match.</p>
      {loading ? <p>Chargement…</p> : <label style={{ display: "grid", gap: 8 }}>{playerId ? "Équipe supplémentaire" : "Joueur"}<select value={selected} onChange={event => setSelected(event.target.value)} disabled={busy || !options.length} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #dad5d8", color: "#29202a", background: "white" }}><option value="">{options.length ? "Choisir…" : "Aucun rattachement disponible"}</option>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
      <p style={{ fontSize: 12, color: "#817a82" }}>Équipes de votre espace personnel · 15 joueurs actifs maximum par équipe.</p>
      {error && <p role="alert" style={{ color: "#ae233f" }}>{error}</p>}
      <button type="button" onClick={save} disabled={busy || loading || !selected} style={{ width: "100%", padding: 12, border: 0, borderRadius: 10, background: "#6b1a2c", color: "white", fontWeight: 800, opacity: busy || !selected ? .5 : 1, cursor: "pointer" }}>{busy ? "Enregistrement…" : "Rattacher le joueur"}</button>
    </section></div>, document.body)}
  </>;
}
