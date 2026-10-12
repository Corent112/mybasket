"use client";
import { useEffect, useState } from "react";
const display = (value: unknown) => value == null ? "—" : typeof value === "number" ? value.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : String(value);
export default function LnbPlayerStats({ teamId, playerId, revision = 0, onProfilesCreated }: { teamId: string; playerId?: string; revision?: number; onProfilesCreated?: () => void | Promise<void> }) {
  const [data, setData] = useState<any>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const [success, setSuccess] = useState("");
  const [detail, setDetail] = useState<any>(null), [detailBusy, setDetailBusy] = useState(false), [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setBusy(true); setError(""); setData(null); setDetail(null); setSelected(null);
    fetch(`/api/lnb/player-stats?teamId=${encodeURIComponent(teamId)}${refresh ? "&refresh=1" : ""}`, { signal: controller.signal, cache: "no-store" }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j; }).then(setData).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [teamId, revision, refresh]);
  const rows = (data?.players || []).filter((row: any) => !playerId || row.playerId === playerId);
  useEffect(() => {
    const id = selected || (playerId ? rows[0]?.person.external_id : null);
    setDetail(null); if (!id) return;
    const controller = new AbortController(); setDetailBusy(true);
    fetch(`/api/lnb/player-stats?teamId=${encodeURIComponent(teamId)}&personId=${id}`, { signal: controller.signal }).then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error); return j.detail; }).then(setDetail).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setDetailBusy(false); });
    return () => controller.abort();
  }, [teamId, data, playerId, selected]);
  async function createProfiles() {
    setBusy(true); setError(""); setSuccess("");
    try { const r = await fetch("/api/lnb/player-stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setSuccess(`${j.created} fiches créées · ${j.reused} fiches existantes reliées. Tu peux ouvrir chaque fiche et la modifier.`); setRefresh(v => v + 1); await onProfilesCreated?.(); }
    catch (e) { setError(e instanceof Error ? e.message : "Création impossible."); }
    finally { setBusy(false); }
  }
  async function associate(personId: number, id: string) {
    setBusy(true); setError("");
    try { const r = await fetch("/api/lnb/player-stats", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ teamId, personId, playerId: id || null }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error); setRefresh(v => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : "Association impossible."); }
    finally { setBusy(false); }
  }
  if (data?.connected === false) return null;
  return <section className="lnb-stats">
    <header><div><small>SOURCE OFFICIELLE · LNB</small><h3>{playerId ? "Statistiques LNB du joueur" : "Statistiques LNB des joueurs"}</h3><p>{data ? `${data.competition} · ${data.year}/${data.year + 1}` : "Chargement du championnat…"} · Moyennes calculées par la LNB sur les matchs joués.</p></div><button type="button" disabled={busy} onClick={() => setRefresh(v => v + 1)}>Actualiser</button></header>
    {!playerId && data?.canEdit && data?.isScout && <div style={{ margin: "12px 0" }}><button disabled={busy} onClick={createProfiles}>＋ Créer les fiches joueurs LNB</button><p>Les fiches restent modifiables. Les statistiques restent reliées à cette équipe et à cette saison.</p></div>}
    {success && <p role="status">{success}</p>}
    {error && <p role="alert">{error}</p>}{busy && <p role="status">Chargement des statistiques…</p>}
    {!busy && data?.connected && !rows.length && <p>{playerId ? <>Cette fiche n’est pas encore associée à un joueur LNB. <a href={`/equipes/${teamId}`}>Associer la fiche dans les statistiques de l’équipe ↗</a></> : "Aucune statistique individuelle publiée pour cette équipe et cette saison."}</p>}
    {rows.length > 0 && <div className="lnb-scroll"><table><thead><tr>{["Joueur", "MJ", "MIN", "PTS", "2PTS %", "3PTS %", "LF %", "REB", "PD", "INT", "CTR", "BP", "ÉVAL", "+/−", ...(!playerId ? ["Fiche MyBasket"] : [])].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row: any) => <tr key={row.person.external_id}><td><button onClick={() => setSelected(row.person.external_id)}>{row.person.first_name} {row.person.family_name}</button></td>{[row.s_games, row.minutes_display, row.s_points_average, row.s_two_pointers_percentage, row.s_three_pointers_percentage, row.s_free_throws_percentage, row.s_rebounds_total_average, row.s_assists_average, row.s_steals_average, row.s_blocks_average, row.s_turnovers_average, row.s_efficiency_average, row.s_plus_minus_points].map((v, index) => <td key={index}>{display(v)}</td>)}{!playerId && <td>{data.canEdit ? <select aria-label={`Fiche de ${row.person.first_name} ${row.person.family_name}`} value={row.playerId || ""} disabled={busy} onChange={e => associate(row.person.external_id, e.target.value)}><option value="">Associer une fiche…</option>{data.localPlayers.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select> : row.playerId ? "Associée" : "Non associée"}{row.playerId && <a href={`/equipes/${teamId}/${row.playerId}`}>Ouvrir ↗</a>}</td>}</tr>)}</tbody></table></div>}
    {detailBusy && <p role="status">Chargement du détail par match…</p>}
    {detail && <><h4>Détail LNB par match · {rows.find((r: any) => r.person.external_id === (selected || rows[0]?.person.external_id))?.person.first_name}</h4><div className="lnb-scroll"><table><thead><tr>{["Date", "Adversaire", "Score", "PTS", "2PTS", "3PTS", "LF", "RO", "RD", "REB", "PD"].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{detail.general_game_log.filter((g: any) => g.match_status === "COMPLETE").map((g: any) => <tr key={g.external_id}><td>{String(g.match_time_utc || "").slice(0, 10).split("-").reverse().join("/")}</td><td>{g.is_home_game ? "vs" : "@"} {g.team?.team_name}</td><td>{g.score}</td>{[g.pts, `${display(g.two_p)}/${display(g.two_pa)}`, `${display(g.three_p)}/${display(g.three_pa)}`, `${display(g.ft)}/${display(g.fta)}`, g.or, g.dr, g.tr, g.ast].map((v, i) => <td key={i}>{display(v)}</td>)}</tr>)}</tbody></table></div><p>Le score est affiché dans l’ordre domicile – extérieur. Le détail LNB ne précise pas le temps joué pour chaque ligne ; ces lignes ne servent pas à recalculer les moyennes.</p></>}
    <style jsx>{`.lnb-stats{background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:20px;margin:16px 0;color:#452630}.lnb-stats header{display:flex;align-items:start;justify-content:space-between;gap:12px}.lnb-stats small{color:#b18c46;font-weight:800;letter-spacing:.08em}.lnb-stats h3{margin:5px 0;color:#6b1a2c;font-size:21px}.lnb-stats p{font-size:12px;color:#7c6e67}.lnb-stats [role=alert]{color:#a22}.lnb-scroll{overflow-x:auto;max-width:100%}.lnb-stats table{width:100%;border-collapse:collapse;font-size:12px}.lnb-stats th{background:#f8f3f0;color:#6b1a2c;font-size:10px;white-space:nowrap}.lnb-stats td,.lnb-stats th{padding:11px 8px;text-align:right;border-bottom:1px solid #eee4de}.lnb-stats td:first-child,.lnb-stats th:first-child{text-align:left;white-space:nowrap}.lnb-stats button{border:1px solid #dfcfc7;border-radius:8px;background:#fffaf7;padding:8px;color:#6b1a2c;font-weight:700;cursor:pointer}.lnb-stats td:first-child button{border:0;background:transparent;text-align:left;padding:0}.lnb-stats select{max-width:180px;border:1px solid #dfcfc7;border-radius:8px;padding:6px}.lnb-stats a{display:block;color:#6b1a2c;margin-top:5px}@media(max-width:600px){.lnb-stats{padding:12px}.lnb-stats header{flex-wrap:wrap}}`}</style>
  </section>;
}
