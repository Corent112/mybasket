"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type ScoutImportItem = {
  id: string;
  kind: "team" | "player" | "system" | "shot" | "clip";
  title: string;
  subtitle?: string;
  lines?: string[];
  sourceTeamId?: string;
  matchIds?: string[];
  playerId?: string;
  systemName?: string;
  imageUrl?: string;
  videoUrl?: string;
  clipStart?: number;
  clipEnd?: number;
};

type MatchRow = {
  id: string;
  team_id: string;
  opponent: string;
  match_date: string;
  us_score: number;
  them_score: number;
  result?: string | null;
  project_state?: Record<string, any> | null;
};

type PlayerAgg = {
  id: string;
  name: string;
  games: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  p3m: number;
  p3a: number;
};

type SystemAgg = {
  name: string;
  uses: number;
  made: number;
  shots: number;
  turnovers: number;
};

type ZoneAgg = { zone: string; made: number; attempts: number };

type ClipRow = {
  id: string;
  match_id: string;
  action_type?: string | null;
  player_id?: string | null;
  systeme_name?: string | null;
  temps_fort?: string | null;
  shot_type?: string | null;
  shot_result?: string | null;
  clip_start?: number | null;
  clip_end?: number | null;
  video_time?: number | null;
};

const avg = (value: number, count: number) => (count ? Math.round((value / count) * 10) / 10 : 0);
const pct = (made: number, attempts: number) => (attempts ? `${Math.round((made / attempts) * 100)}%` : "—");

function itemKey(item: ScoutImportItem): string {
  const source = String(item.sourceTeamId || "");
  if (item.kind === "player") return `player:${source}:${String(item.playerId || item.title).toLowerCase()}`;
  if (item.kind === "system") return `system:${source}:${String(item.systemName || item.title).toLowerCase()}`;
  if (item.kind === "clip") return `clip:${source}:${(item.matchIds || []).join(",")}:${item.clipStart ?? ""}:${item.clipEnd ?? ""}`;
  return `${item.kind}:${source}:${String(item.title).toLowerCase()}`;
}

function playerNameFromState(matches: MatchRow[], id: string) {
  for (const match of matches) {
    const state = match.project_state || {};
    const roster = Array.isArray(state.roster) ? state.roster : Array.isArray(state.players) ? state.players : [];
    const player = roster.find((p: any) => String(p?.id) === id);
    if (player) return String(player.name || [player.firstName, player.lastName].filter(Boolean).join(" ") || `Joueur ${id.slice(0, 4)}`);
  }
  return `Joueur ${id.slice(0, 4)}`;
}

export default function GamePlanScoutingDataPicker({
  open,
  onClose,
  onAdd,
  allowedTeams,
  existingItems,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: ScoutImportItem) => void;
  allowedTeams: Array<{ id: string; name: string }>;
  existingItems: ScoutImportItem[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [teamId, setTeamId] = useState("");
  const [selectedMatches, setSelectedMatches] = useState<string[]>([]);
  const [tab, setTab] = useState<"team" | "players" | "systems" | "shots" | "clips">("team");
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [players, setPlayers] = useState<PlayerAgg[]>([]);
  const [systems, setSystems] = useState<SystemAgg[]>([]);
  const [zones, setZones] = useState<ZoneAgg[]>([]);
  const [clips, setClips] = useState<ClipRow[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const loadMatches = async () => {
      try {
        const allowedIds = allowedTeams.map((team) => team.id).filter(Boolean);
        if (!allowedIds.length) {
          if (alive) {
            setMatches([]);
            setTeamId("");
            setSelectedMatches([]);
          }
          return;
        }

        const { data, error } = await supabase
          .from("match_stats")
          .select("id,team_id,opponent,match_date,us_score,them_score,result,project_state")
          .in("team_id", allowedIds)
          .order("match_date", { ascending: false })
          .limit(250);

        if (!alive) return;
        if (error) console.error("GamePlan scouting data:", error);

        const rows = (data || []) as MatchRow[];
        setMatches(rows);
        const first = rows[0]?.team_id || "";
        setTeamId(first);
        setSelectedMatches(
          rows
            .filter((m) => m.team_id === first)
            .slice(0, 4)
            .map((m) => m.id),
        );
      } finally {
        if (alive) setLoading(false);
      }
    };

    void loadMatches();
    return () => {
      alive = false;
    };
  }, [open, supabase, allowedTeams]);

  const teamGroups = useMemo(() => {
    return allowedTeams
      .map((team) => ({
        id: team.id,
        name: team.name,
        count: matches.filter((match) => match.team_id === team.id).length,
      }))
      .filter((team) => team.count > 0);
  }, [matches, allowedTeams]);

  const teamMatches = useMemo(() => matches.filter((m) => m.team_id === teamId), [matches, teamId]);
  const picked = useMemo(() => teamMatches.filter((m) => selectedMatches.includes(m.id)), [teamMatches, selectedMatches]);
  const selectedTeam = teamGroups.find((t) => t.id === teamId);

  useEffect(() => {
    if (!open || !selectedMatches.length) {
      setPlayers([]); setSystems([]); setZones([]); setClips([]);
      return;
    }
    let alive = true;
    setDetailLoading(true);
    Promise.all([
      supabase.from("match_player_stats").select("match_id,player_id,pts,reb,off_reb,def_reb,ast,stl,p3m,p3a").in("match_id", selectedMatches),
      supabase.from("match_actions").select("id,match_id,player_id,action_type,systeme_name,systeme_slot,temps_fort,shot_type,shot_result,shot_zone_id,clip_start,clip_end,video_time").in("match_id", selectedMatches),
    ]).then(([playerRes, actionRes]) => {
      if (!alive) return;
      const playerMap = new Map<string, PlayerAgg>();
      for (const row of playerRes.data || []) {
        const id = String((row as any).player_id || "");
        if (!id) continue;
        const curr = playerMap.get(id) || { id, name: playerNameFromState(picked, id), games: 0, pts: 0, reb: 0, ast: 0, stl: 0, p3m: 0, p3a: 0 };
        curr.games += 1;
        curr.pts += Number((row as any).pts || 0);
        curr.reb += Number((row as any).reb ?? Number((row as any).off_reb || 0) + Number((row as any).def_reb || 0));
        curr.ast += Number((row as any).ast || 0);
        curr.stl += Number((row as any).stl || 0);
        curr.p3m += Number((row as any).p3m || 0);
        curr.p3a += Number((row as any).p3a || 0);
        playerMap.set(id, curr);
      }
      setPlayers([...playerMap.values()].sort((a, b) => b.pts - a.pts));

      const sysMap = new Map<string, SystemAgg>();
      const zoneMap = new Map<string, ZoneAgg>();
      const clipRows: ClipRow[] = [];
      for (const raw of actionRes.data || []) {
        const row = raw as any;
        const name = String(row.systeme_name || row.systeme_slot || "").trim();
        if (name) {
          const s = sysMap.get(name) || { name, uses: 0, made: 0, shots: 0, turnovers: 0 };
          s.uses += 1;
          if (row.shot_type) s.shots += 1;
          if (String(row.shot_result || "").toLowerCase().includes("marq")) s.made += 1;
          if (/perte|bp|turnover/i.test(String(row.action_type || ""))) s.turnovers += 1;
          sysMap.set(name, s);
        }
        const zone = String(row.shot_zone_id || "").trim();
        if (zone) {
          const z = zoneMap.get(zone) || { zone, made: 0, attempts: 0 };
          z.attempts += 1;
          if (String(row.shot_result || "").toLowerCase().includes("marq")) z.made += 1;
          zoneMap.set(zone, z);
        }
        if (row.clip_start != null && row.clip_end != null) clipRows.push(row as ClipRow);
      }
      setSystems([...sysMap.values()].sort((a, b) => b.uses - a.uses));
      setZones([...zoneMap.values()].sort((a, b) => b.attempts - a.attempts));
      setClips(clipRows.slice(0, 100));
    }).finally(() => alive && setDetailLoading(false));
    return () => { alive = false; };
  }, [open, selectedMatches, supabase, picked]);

  if (!open) return null;

  const games = picked.length;
  const us = picked.reduce((n, m) => n + Number(m.us_score || 0), 0);
  const them = picked.reduce((n, m) => n + Number(m.them_score || 0), 0);
  const wins = picked.filter((m) => Number(m.us_score || 0) > Number(m.them_score || 0)).length;
  const selectedState = picked[0]?.project_state || {};
  const videoUrlForMatch = (matchId: string) => {
    const state = picked.find((m) => m.id === matchId)?.project_state || {};
    return String(state.videoUrl || state.video_url || "");
  };
  const filteredPlayers = players.filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()));
  const filteredSystems = systems.filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase()));
  const isAdded = (candidate: ScoutImportItem) => existingItems.some((item) => itemKey(item) === itemKey(candidate));
  const addOnce = (candidate: ScoutImportItem) => {
    if (isAdded(candidate)) return;
    onAdd(candidate);
  };

  return (
    <div className="gpd-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gpd-card">
        <header>
          <div><small>SCOUTING ADVERSE</small><h3>Ajouter depuis mes données</h3><p>Choisis uniquement parmi tes équipes scoutées, puis ajoute les données utiles à ce match.</p></div>
          <button onClick={onClose}>×</button>
        </header>

        {loading ? <div className="gpd-empty">Chargement de tes matchs codés…</div> : !allowedTeams.length ? (
          <div className="gpd-empty"><b>Aucune équipe scoutée</b><br />Crée l’adversaire dans « Mes équipes → Équipes scoutées » avant d’importer ses données.</div>
        ) : !teamGroups.length ? (
          <div className="gpd-empty"><b>Aucun match codé pour tes équipes scoutées.</b><br />Code au moins un match de l’adversaire pour faire apparaître ses statistiques ici.</div>
        ) : (
          <div className="gpd-body">
            <aside>
              <b>Équipe observée</b>
              <select value={teamId} onChange={(e) => {
                const id = e.target.value; setTeamId(id);
                setSelectedMatches(matches.filter((m) => m.team_id === id).slice(0, 4).map((m) => m.id));
              }}>
                {teamGroups.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.count} match{t.count > 1 ? "s" : ""}</option>)}
              </select>
              <b>Matchs utilisés</b>
              <div className="gpd-matches">
                {teamMatches.map((m) => <label key={m.id} className={selectedMatches.includes(m.id) ? "on" : ""}>
                  <input type="checkbox" checked={selectedMatches.includes(m.id)} onChange={() => setSelectedMatches((ids) => ids.includes(m.id) ? ids.filter((x) => x !== m.id) : [...ids, m.id])} />
                  <span><strong>vs {m.opponent || "Adversaire"}</strong><small>{m.match_date || "—"} · {m.us_score ?? 0}-{m.them_score ?? 0}</small></span>
                </label>)}
              </div>
            </aside>

            <main>
              <div className="gpd-topline">
                <div><b>{selectedTeam?.name || "Équipe"}</b><span>{games} match{games > 1 ? "s" : ""} sélectionné{games > 1 ? "s" : ""}</span></div>
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" />
              </div>
              <nav>
                {(["team","players","systems","shots","clips"] as const).map((key) => <button key={key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}>{key === "team" ? "ÉQUIPE" : key === "players" ? "JOUEURS" : key === "systems" ? "SYSTÈMES" : key === "shots" ? "TIRS" : "CLIPS"}</button>)}
              </nav>

              {detailLoading ? <div className="gpd-empty">Calcul des données…</div> : null}

              {!detailLoading && tab === "team" && <div className="gpd-grid">
                <DataCard title="Vue générale" big={`${wins}-${Math.max(0, games - wins)}`} subtitle={`${avg(us, games)} pts marqués · ${avg(them, games)} encaissés`} onAdd={() => addOnce({ id: crypto.randomUUID(), kind:"team", title:`${selectedTeam?.name || "Équipe"} · Vue générale`, subtitle:`${games} matchs`, lines:[`Bilan ${wins}-${Math.max(0,games-wins)}`, `${avg(us,games)} pts marqués`, `${avg(them,games)} pts encaissés`], sourceTeamId:teamId, matchIds:selectedMatches })} />
                <DataCard title="Attaque" big={`${avg(us, games)}`} subtitle="points / match" onAdd={() => addOnce({ id:crypto.randomUUID(), kind:"team", title:"Production offensive", subtitle:selectedTeam?.name, lines:[`${avg(us,games)} points / match`, `${games} matchs analysés`], sourceTeamId:teamId, matchIds:selectedMatches })} />
                <DataCard title="Défense" big={`${avg(them, games)}`} subtitle="points encaissés / match" onAdd={() => addOnce({ id:crypto.randomUUID(), kind:"team", title:"Production adverse", subtitle:selectedTeam?.name, lines:[`${avg(them,games)} points encaissés / match`, `${games} matchs analysés`], sourceTeamId:teamId, matchIds:selectedMatches })} />
              </div>}

              {!detailLoading && tab === "players" && <div className="gpd-list">
                {filteredPlayers.map((p) => <div className="gpd-row" key={p.id}><div><b>{p.name}</b><span>{p.games} match{p.games>1?"s":""}</span></div><div className="gpd-stats"><strong>{avg(p.pts,p.games)} PTS</strong><span>{avg(p.reb,p.games)} REB</span><span>{avg(p.ast,p.games)} PD</span><span>{pct(p.p3m,p.p3a)} 3PTS</span></div>{(() => { const candidate: ScoutImportItem = { id:`player-${teamId}-${p.id}`, kind:"player", title:p.name, subtitle:"Profil statistique", lines:[`${avg(p.pts,p.games)} pts`, `${avg(p.reb,p.games)} reb`, `${avg(p.ast,p.games)} pd`, `${pct(p.p3m,p.p3a)} à 3pts`], playerId:p.id, sourceTeamId:teamId, matchIds:selectedMatches }; const added = isAdded(candidate); return <button disabled={added} onClick={() => addOnce(candidate)}>{added ? "✓ Ajouté" : "＋ Ajouter"}</button>; })()}</div>)}
                {!filteredPlayers.length && <div className="gpd-empty">Aucune statistique joueur sur ces matchs.</div>}
              </div>}

              {!detailLoading && tab === "systems" && <div className="gpd-list">
                {filteredSystems.map((s) => <div className="gpd-row" key={s.name}><div><b>{s.name}</b><span>{s.uses} actions codées</span></div><div className="gpd-stats"><strong>{s.uses} UTIL.</strong><span>{pct(s.made,s.shots)} tirs</span><span>{s.turnovers} BP</span></div>{(() => { const candidate: ScoutImportItem = { id:`system-${teamId}-${s.name}`, kind:"system", title:s.name, subtitle:"Système adverse", lines:[`${s.uses} actions codées`, `${pct(s.made,s.shots)} réussite sur tirs`, `${s.turnovers} pertes de balle`], systemName:s.name, sourceTeamId:teamId, matchIds:selectedMatches }; const added = isAdded(candidate); return <button disabled={added} onClick={() => addOnce(candidate)}>{added ? "✓ Ajouté" : "＋ Ajouter"}</button>; })()}</div>)}
                {!filteredSystems.length && <div className="gpd-empty">Aucun système identifié dans ces matchs.</div>}
              </div>}

              {!detailLoading && tab === "shots" && <div className="gpd-grid zones">
                {zones.map((z) => <DataCard key={z.zone} title={z.zone} big={pct(z.made,z.attempts)} subtitle={`${z.made}/${z.attempts} tirs`} onAdd={() => addOnce({ id:crypto.randomUUID(), kind:"shot", title:`Zone · ${z.zone}`, subtitle:selectedTeam?.name, lines:[`${z.made}/${z.attempts} tirs`, `${pct(z.made,z.attempts)} de réussite`], sourceTeamId:teamId, matchIds:selectedMatches })} />)}
                {!zones.length && <div className="gpd-empty">Aucune Shot Chart codée sur ces matchs.</div>}
              </div>}

              {!detailLoading && tab === "clips" && <div className="gpd-list">
                {clips.map((c, index) => {
                  const url = videoUrlForMatch(c.match_id) || String(selectedState.videoUrl || "");
                  const label = [c.systeme_name, c.temps_fort, c.action_type, c.shot_type, c.shot_result].filter(Boolean).join(" · ") || `Clip ${index + 1}`;
                  return <div className="gpd-row" key={c.id}><div><b>{label}</b><span>{Number(c.clip_start || 0).toFixed(1)}s → {Number(c.clip_end || 0).toFixed(1)}s</span></div><button disabled={!url} onClick={() => addOnce({ id:crypto.randomUUID(), kind:"clip", title:label, subtitle:"Clip scouting", sourceTeamId:teamId, matchIds:[c.match_id], videoUrl:url, clipStart:Number(c.clip_start || 0), clipEnd:Number(c.clip_end || 0) })}>{url ? "＋ Ajouter" : "Vidéo absente"}</button></div>;
                })}
                {!clips.length && <div className="gpd-empty">Aucun clip déjà découpé sur ces matchs.</div>}
              </div>}
            </main>
          </div>
        )}
        <footer><span>Les données restent liées aux matchs sélectionnés.</span><button onClick={onClose}>Terminé</button></footer>
      </div>
      <style jsx>{`
        .gpd-bg{position:fixed;inset:0;z-index:7500;background:rgba(18,8,12,.72);display:grid;place-items:center;padding:18px;backdrop-filter:blur(6px)}
        .gpd-card{width:min(1120px,96vw);max-height:92vh;background:#fff;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 30px 100px rgba(0,0,0,.35)}
        header{display:flex;justify-content:space-between;gap:20px;padding:18px 20px;border-bottom:1px solid #eee3d6} header small{color:#d4a24c;font-weight:950;letter-spacing:.08em} header h3{margin:2px 0;color:#6b1a2c;font-size:1.4rem} header p{margin:0;color:#867a74;font-size:.82rem} header>button{border:0;background:#f6f1eb;width:36px;height:36px;border-radius:10px;font-size:20px;cursor:pointer}
        .gpd-body{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:570px;overflow:hidden} aside{padding:16px;border-right:1px solid #eee3d6;background:#fffaf4;overflow:auto} aside>b{display:block;color:#6b1a2c;font-size:.72rem;text-transform:uppercase;margin:0 0 7px} aside select{width:100%;padding:9px;border:1px solid #dfd4c6;border-radius:9px;margin-bottom:18px;background:#fff}.gpd-matches{display:grid;gap:7px}.gpd-matches label{display:flex;gap:8px;align-items:flex-start;border:1px solid #e7ded3;border-radius:11px;padding:9px;background:#fff;cursor:pointer}.gpd-matches label.on{border-color:#d4a24c;background:#fff5dd}.gpd-matches input{margin-top:3px;width:auto}.gpd-matches strong,.gpd-matches small{display:block}.gpd-matches strong{font-size:.79rem}.gpd-matches small{color:#8a7b73;font-size:.68rem;margin-top:2px}
        main{min-width:0;padding:15px;overflow:auto}.gpd-topline{display:flex;justify-content:space-between;gap:12px;align-items:center}.gpd-topline b,.gpd-topline span{display:block}.gpd-topline b{color:#6b1a2c}.gpd-topline span{font-size:.72rem;color:#8a7b73}.gpd-topline input{width:230px;padding:8px 10px;border:1px solid #e1d8cc;border-radius:9px}nav{display:flex;gap:5px;margin:13px 0;border-bottom:1px solid #eee3d6}nav button{border:0;background:transparent;padding:9px 11px;font-size:.72rem;font-weight:900;color:#8a7b73;cursor:pointer;border-bottom:2px solid transparent}nav button.on{color:#6b1a2c;border-bottom-color:#d4a24c}
        .gpd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.gpd-grid.zones{grid-template-columns:repeat(4,minmax(0,1fr))}.gpd-list{display:grid;gap:7px}.gpd-row{display:flex;align-items:center;gap:12px;border:1px solid #eee3d6;border-radius:12px;padding:10px 11px}.gpd-row>div:first-child{flex:1;min-width:0}.gpd-row b,.gpd-row span{display:block}.gpd-row b{font-size:.84rem}.gpd-row span{font-size:.68rem;color:#8a7b73}.gpd-row>button{border:1px solid #6b1a2c;background:#fff;color:#6b1a2c;border-radius:9px;padding:7px 9px;font-weight:900;cursor:pointer}.gpd-row>button:disabled{opacity:.45}.gpd-stats{display:flex;gap:10px;align-items:center}.gpd-stats strong,.gpd-stats span{font-size:.68rem!important;color:#494144!important;white-space:nowrap}.gpd-stats strong{color:#6b1a2c!important}.gpd-empty{padding:45px;text-align:center;color:#8a7b73}
        footer{display:flex;justify-content:space-between;align-items:center;padding:12px 17px;border-top:1px solid #eee3d6;font-size:.72rem;color:#8a7b73}footer button{border:0;background:#6b1a2c;color:#fff;border-radius:9px;padding:8px 13px;font-weight:900;cursor:pointer}
        @media(max-width:800px){.gpd-body{grid-template-columns:1fr}.gpd-body aside{border-right:0;border-bottom:1px solid #eee3d6;max-height:230px}.gpd-grid,.gpd-grid.zones{grid-template-columns:1fr 1fr}.gpd-stats{display:none}}
      `}</style>
    </div>
  );
}

function DataCard({ title, big, subtitle, onAdd }: { title:string; big:string; subtitle:string; onAdd:()=>void }) {
  return <article className="gpd-data"><small>{title}</small><strong>{big}</strong><span>{subtitle}</span><button onClick={onAdd}>＋ Ajouter au scouting</button><style jsx>{`.gpd-data{border:1px solid #eadfce;border-radius:15px;padding:14px;background:linear-gradient(180deg,#fff,#fffaf4)}small,strong,span{display:block}small{font-size:.7rem;color:#8a7b73;font-weight:900;text-transform:uppercase}strong{font-size:1.7rem;color:#6b1a2c;margin:5px 0 1px}span{font-size:.72rem;color:#746b67}button{margin-top:12px;width:100%;border:1px solid #d4a24c;background:#fff8e9;color:#6b1a2c;border-radius:9px;padding:7px;font-size:.7rem;font-weight:900;cursor:pointer}`}</style></article>
}
