"use client";
import { useEffect, useRef, useState } from "react";
export default function OfficialScoutingImport({ onImport, initialUrl }: { initialUrl?: string; onImport: (calendar: any, players: any[]) => void }) {
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const [source, setSource] = useState(initialUrl?.includes("competitions.ffbb.com") ? "ffbb" : "lnb"), [url, setUrl] = useState(initialUrl || ""), [data, setData] = useState<any>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const [league, setLeague] = useState("ESPA"), [year, setYear] = useState(() => new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0));
  async function read(target: string) {
    setBusy(true); setError(""); setSuccess(""); setData(null);
    try {
      const official = new URL(target);
      if (!(source === "lnb" ? ["lnb.fr", "www.lnb.fr"] : ["competitions.ffbb.com"]).includes(official.hostname)) throw new Error("Le lien doit correspondre à la source choisie.");
      const r = await fetch(`/api/ffbb/competition?url=${encodeURIComponent(target)}`); const j = await r.json(); if (!r.ok) throw new Error(j.error); setData(j); setUrl(target);
    } catch (e) { setError(e instanceof Error ? e.message : "Lecture impossible."); } finally { setBusy(false); }
  }
  async function apply() {
    if (data?.mode !== "team") return;
    setBusy(true); setError("");
    try {
      let players: any[] = [];
      if (source === "lnb") { const r = await fetch(`/api/lnb/player-stats?sourceUrl=${encodeURIComponent(data.sourceUrl)}`); const j = await r.json(); if (!r.ok) throw new Error(j.error); players = j.players; }
      if (!active.current) return;
      onImport(data, players); setSuccess(source === "lnb" ? `${data.team} : informations équipe et ${players.length} joueurs importés.` : `${data.team} : informations équipe importées.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Import impossible."); } finally { setBusy(false); }
  }
  return <section className="official-import"><h4>Récupérer les données officielles de l’adversaire</h4><div><select aria-label="Source du scouting" value={source} disabled={busy} onChange={e => { setSource(e.target.value); setData(null); setSuccess(""); }}><option value="lnb">LNB · équipe et joueurs</option><option value="ffbb">FFBB · équipe</option></select>{source === "lnb" && <><select aria-label="Championnat adverse" value={league} onChange={e => { setLeague(e.target.value); setData(null); }} disabled={busy}><option value="ESPA">Espoirs Élite</option><option value="ESPB">Espoirs Élite 2</option><option value="PROA">Betclic Élite</option><option value="PROB">Élite 2</option></select><select aria-label="Saison scouting" value={year} onChange={e => { setYear(Number(e.target.value)); setData(null); }} disabled={busy}>{Array.from({ length: 6 }, (_, i) => new Date().getFullYear() + 1 - i).map(y => <option key={y} value={y}>{y}/{y + 1}</option>)}</select><button disabled={busy} onClick={() => read(`https://lnb.fr/fr/calendar?abbrev=${league}&did=${({ PROA: 1, PROB: 2, ESPA: 3, ESPB: 4 } as Record<string, number>)[league]}&yid=${year}`)}>Choisir l’équipe LNB</button></>}</div><div><input aria-label="Lien officiel adversaire" value={url} onChange={e => setUrl(e.target.value)} placeholder={source === "lnb" ? "Lien calendrier LNB (facultatif)" : "Lien équipe competitions.ffbb.com"} /><button disabled={busy || !url} onClick={() => read(url)}>Analyser</button></div>
    {busy && <p role="status">Récupération en cours…</p>}{error && <p role="alert">{error}</p>}{success && <p role="status">{success}</p>}
    {data?.mode === "choose-team" && <select aria-label="Équipe à scouter" defaultValue="" disabled={busy} onChange={e => { if (e.target.value) read(e.target.value); }}><option value="">Choisir le club…</option>{data.teams.map((t: any) => <option key={t.url} value={t.url}>{t.name}</option>)}</select>}
    {data?.mode === "team" && <div><strong>{data.team} · {data.competition}</strong><button disabled={busy} onClick={apply}>Importer {source === "lnb" ? "équipe et statistiques joueurs" : "les informations équipe"}</button></div>}
    <p>Les notes tactiques et les schémas restent conservés. Les chiffres indisponibles restent vides.</p>
    <style jsx>{`.official-import{padding:16px;border:1px solid #e5d7ce;background:#fffaf7;border-radius:12px;margin:12px 0}.official-import h4{margin:0 0 10px;color:#6b1a2c}.official-import div{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;align-items:center}.official-import select,.official-import input,.official-import button{padding:9px;border:1px solid #dccdc5;border-radius:8px;max-width:100%;font-size:12px}.official-import input{flex:1;min-width:180px}.official-import button{background:#6b1a2c;color:white;cursor:pointer;font-weight:700}.official-import p{font-size:12px;color:#77675e}.official-import [role=alert]{color:#a22}`}</style>
  </section>;
}
