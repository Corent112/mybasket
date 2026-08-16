"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ShotChart, { SHOT_ZONES, type ShotLike } from "@/components/prise-stats-pro/ShotChart";
import type { Team } from "@/types/player";

type MatchRow = {
  id: string;
  opponent?: string | null;
  match_date?: string | null;
  us_score?: number | null;
  them_score?: number | null;
};

type ActionRow = {
  id?: string | null;
  match_id: string;
  player_id?: string | null;
  assist_player_id?: string | null;
  rebound_player_id?: string | null;
  context?: string | null;
  inbound?: string | null;
  temps_fort?: string | null;
  coverage?: string | null;
  systeme_slot?: string | null;
  systeme_id?: string | null;
  systeme_name?: string | null;
  action_type?: string | null;
  shot_type?: string | null;
  shot_result?: string | null;
  special_case?: string | null;
  rebound_type?: string | null;
  shot_zone_id?: string | null;
  court_x?: number | null;
  court_y?: number | null;
  quarter?: number | null;
  clock?: string | null;
};

type PlayerStatRow = {
  match_id: string;
  player_id: string;
  pts?: number | null;
  p2m?: number | null;
  p2a?: number | null;
  p3m?: number | null;
  p3a?: number | null;
  ftm?: number | null;
  fta?: number | null;
  off_reb?: number | null;
  def_reb?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  turnovers?: number | null;
  pf?: number | null;
  present?: boolean | null;
};

type Filters = {
  matchId: string;
  playerId: string;
  context: string;
  system: string;
  tempo: string;
  action: string;
  shotResult: string;
};

const EMPTY_FILTERS: Filters = {
  matchId: "",
  playerId: "",
  context: "",
  system: "",
  tempo: "",
  action: "",
  shotResult: "",
};

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(made: number, attempted: number) {
  if (!attempted) return "0%";
  return `${Math.round((made / attempted) * 100)}%`;
}

function uniq(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" }),
  );
}

function human(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function TeamAdvancedStats({
  teamId,
  team,
}: {
  teamId: string;
  team: Team;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStatRow[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const { data: matchData, error: matchError } = await supabase
          .from("match_stats")
          .select("id,opponent,match_date,us_score,them_score")
          .eq("team_id", teamId)
          .order("match_date", { ascending: false });

        if (matchError) throw matchError;
        const loadedMatches = (matchData || []) as MatchRow[];
        const matchIds = loadedMatches.map((m) => m.id).filter(Boolean);

        let loadedActions: ActionRow[] = [];
        let loadedPlayerStats: PlayerStatRow[] = [];

        if (matchIds.length) {
          const [{ data: actionData, error: actionError }, { data: statData, error: statError }] =
            await Promise.all([
              supabase
                .from("match_actions")
                .select(
                  "id,match_id,player_id,assist_player_id,rebound_player_id,context,inbound,temps_fort,coverage,systeme_slot,systeme_id,systeme_name,action_type,shot_type,shot_result,special_case,rebound_type,shot_zone_id,court_x,court_y,quarter,clock",
                )
                .in("match_id", matchIds),
              supabase
                .from("match_player_stats")
                .select(
                  "match_id,player_id,pts,p2m,p2a,p3m,p3a,ftm,fta,off_reb,def_reb,reb,ast,stl,blk,turnovers,pf,present",
                )
                .in("match_id", matchIds),
            ]);

          if (actionError) throw actionError;
          if (statError) throw statError;
          loadedActions = (actionData || []) as ActionRow[];
          loadedPlayerStats = (statData || []) as PlayerStatRow[];
        }

        if (!active) return;
        setMatches(loadedMatches);
        setActions(loadedActions);
        setPlayerStats(loadedPlayerStats);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Impossible de charger les statistiques avancées.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, teamId]);

  const playerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of team.players || []) {
      const name = `${player.firstName || ""} ${player.lastName || ""}`.trim() || "Joueur";
      map.set(String(player.id), name);
      if (player.supabasePlayerId) map.set(String(player.supabasePlayerId), name);
    }
    return map;
  }, [team.players]);

  const selectedMatchIds = useMemo(() => {
    if (filters.matchId) return new Set([filters.matchId]);
    return new Set(matches.map((m) => m.id));
  }, [filters.matchId, matches]);

  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      if (!selectedMatchIds.has(a.match_id)) return false;
      if (filters.playerId && a.player_id !== filters.playerId) return false;
      if (filters.context && a.context !== filters.context) return false;
      const system = a.systeme_name || a.systeme_slot || "";
      if (filters.system && system !== filters.system) return false;
      if (filters.tempo && a.temps_fort !== filters.tempo) return false;
      if (filters.action && a.action_type !== filters.action) return false;
      if (filters.shotResult && a.shot_result !== filters.shotResult) return false;
      return true;
    });
  }, [actions, filters, selectedMatchIds]);

  const filteredPlayerStats = useMemo(() => {
    return playerStats.filter((row) => {
      if (!selectedMatchIds.has(row.match_id)) return false;
      if (filters.playerId && row.player_id !== filters.playerId) return false;
      return row.present !== false;
    });
  }, [filters.playerId, playerStats, selectedMatchIds]);

  const systems = useMemo(() => uniq(actions.map((a) => a.systeme_name || a.systeme_slot)), [actions]);
  const tempos = useMemo(() => uniq(actions.map((a) => a.temps_fort)), [actions]);
  const actionTypes = useMemo(() => uniq(actions.map((a) => a.action_type)), [actions]);
  const contexts = useMemo(() => uniq(actions.map((a) => a.context)), [actions]);
  const shotResults = useMemo(() => uniq(actions.map((a) => a.shot_result)), [actions]);

  const systemStats = useMemo(() => {
    const map = new Map<string, { total: number; made: number; shots: number; turnovers: number; points: number }>();
    for (const a of filteredActions) {
      const key = a.systeme_name || a.systeme_slot || "Sans système";
      const current = map.get(key) || { total: 0, made: 0, shots: 0, turnovers: 0, points: 0 };
      current.total += 1;
      if (a.action_type === "tir") {
        current.shots += 1;
        const made = /made|marqu|réussi|reussi|in/i.test(String(a.shot_result || ""));
        if (made) {
          current.made += 1;
          current.points += /3/i.test(String(a.shot_type || "")) ? 3 : 2;
        }
      }
      if (/perte|turnover/i.test(String(a.action_type || ""))) current.turnovers += 1;
      map.set(key, current);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, ...value }))
      .sort((a, b) => b.total - a.total);
  }, [filteredActions]);

  const tempoStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of filteredActions) {
      const key = a.temps_fort || "Sans temps fort";
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredActions]);

  const playerRows = useMemo(() => {
    const map = new Map<
      string,
      {
        playerId: string;
        name: string;
        games: Set<string>;
        pts: number;
        p2m: number;
        p2a: number;
        p3m: number;
        p3a: number;
        ftm: number;
        fta: number;
        reb: number;
        ast: number;
        stl: number;
        blk: number;
        turnovers: number;
      }
    >();

    for (const row of filteredPlayerStats) {
      const key = String(row.player_id);
      const current = map.get(key) || {
        playerId: key,
        name: playerMap.get(key) || "Joueur",
        games: new Set<string>(),
        pts: 0,
        p2m: 0,
        p2a: 0,
        p3m: 0,
        p3a: 0,
        ftm: 0,
        fta: 0,
        reb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        turnovers: 0,
      };
      current.games.add(row.match_id);
      current.pts += num(row.pts);
      current.p2m += num(row.p2m);
      current.p2a += num(row.p2a);
      current.p3m += num(row.p3m);
      current.p3a += num(row.p3a);
      current.ftm += num(row.ftm);
      current.fta += num(row.fta);
      current.reb += num(row.reb);
      current.ast += num(row.ast);
      current.stl += num(row.stl);
      current.blk += num(row.blk);
      current.turnovers += num(row.turnovers);
      map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => b.pts - a.pts);
  }, [filteredPlayerStats, playerMap]);

  const shots = useMemo<ShotLike[]>(() => {
    return filteredActions
      .filter((a) => a.action_type === "tir" || a.shot_type)
      .map((a) => ({
        shot_type: a.shot_type,
        shot_result: a.shot_result,
        shot_zone_id: a.shot_zone_id,
        court_x: a.court_x,
        court_y: a.court_y,
      }));
  }, [filteredActions]);

  const madeShots = useMemo(
    () =>
      filteredActions.filter(
        (a) =>
          (a.action_type === "tir" || a.shot_type) &&
          /made|marqu|réussi|reussi|in/i.test(String(a.shot_result || "")),
      ).length,
    [filteredActions],
  );

  const shotZoneRows = useMemo(() => {
    return SHOT_ZONES.map((zone) => {
      const zoneShots = filteredActions.filter((a) => a.shot_zone_id === zone.id);
      const made = zoneShots.filter((a) =>
        /made|marqu|réussi|reussi|in/i.test(String(a.shot_result || "")),
      ).length;
      return { zone, attempts: zoneShots.length, made };
    }).filter((row) => row.attempts > 0);
  }, [filteredActions]);

  const reset = () => setFilters(EMPTY_FILTERS);

  if (loading) {
    return <div className="advanced-loading">Chargement des statistiques avancées…</div>;
  }

  return (
    <section className="advanced-stats">
      <div className="advanced-head">
        <div>
          <span className="advanced-kicker">ANALYSE LIVE & SAISON</span>
          <h2>Statistiques avancées</h2>
          <p>
            Systèmes, temps forts, joueurs, actions et shot chart. Tous les blocs
            réagissent aux filtres.
          </p>
        </div>
        <button type="button" className="reset" onClick={reset}>
          Réinitialiser les filtres
        </button>
      </div>

      {error ? <div className="advanced-error">{error}</div> : null}

      <div className="filters">
        <Filter label="Match" value={filters.matchId} onChange={(v) => setFilters((p) => ({ ...p, matchId: v }))}>
          <option value="">Tous les matchs</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {m.match_date ? new Date(m.match_date).toLocaleDateString("fr-FR") : "Match"} · {m.opponent || "Adversaire"}
            </option>
          ))}
        </Filter>

        <Filter label="Joueur" value={filters.playerId} onChange={(v) => setFilters((p) => ({ ...p, playerId: v }))}>
          <option value="">Tous les joueurs</option>
          {(team.players || []).map((p) => {
            const id = String(p.supabasePlayerId || p.id);
            return (
              <option key={id} value={id}>
                {p.num != null ? `#${p.num} · ` : ""}{p.firstName} {p.lastName}
              </option>
            );
          })}
        </Filter>

        <Filter label="Contexte" value={filters.context} onChange={(v) => setFilters((p) => ({ ...p, context: v }))}>
          <option value="">Attaque + défense</option>
          {contexts.map((v) => <option key={v} value={v}>{human(v)}</option>)}
        </Filter>

        <Filter label="Système" value={filters.system} onChange={(v) => setFilters((p) => ({ ...p, system: v }))}>
          <option value="">Tous les systèmes</option>
          {systems.map((v) => <option key={v} value={v}>{v}</option>)}
        </Filter>

        <Filter label="Temps fort" value={filters.tempo} onChange={(v) => setFilters((p) => ({ ...p, tempo: v }))}>
          <option value="">Tous les temps forts</option>
          {tempos.map((v) => <option key={v} value={v}>{human(v)}</option>)}
        </Filter>

        <Filter label="Action" value={filters.action} onChange={(v) => setFilters((p) => ({ ...p, action: v }))}>
          <option value="">Toutes les actions</option>
          {actionTypes.map((v) => <option key={v} value={v}>{human(v)}</option>)}
        </Filter>

        <Filter label="Résultat tir" value={filters.shotResult} onChange={(v) => setFilters((p) => ({ ...p, shotResult: v }))}>
          <option value="">Tous les résultats</option>
          {shotResults.map((v) => <option key={v} value={v}>{human(v)}</option>)}
        </Filter>
      </div>

      <div className="summary-grid">
        <MiniStat label="Matchs" value={selectedMatchIds.size} />
        <MiniStat label="Actions" value={filteredActions.length} />
        <MiniStat label="Tirs" value={shots.length} />
        <MiniStat label="% tirs" value={pct(madeShots, shots.length)} />
        <MiniStat label="Joueurs" value={playerRows.length} />
      </div>

      <div className="two-cols">
        <Panel title="Systèmes de jeu" subtitle="Volume, tirs, réussite et pertes de balle">
          {systemStats.length ? (
            <div className="simple-table">
              <div className="tr th"><span>Système</span><span>Actions</span><span>Tirs</span><span>%</span><span>BP</span></div>
              {systemStats.map((row) => (
                <div className="tr" key={row.name}>
                  <strong>{row.name}</strong>
                  <span>{row.total}</span>
                  <span>{row.made}/{row.shots}</span>
                  <span>{pct(row.made, row.shots)}</span>
                  <span>{row.turnovers}</span>
                </div>
              ))}
            </div>
          ) : <Empty />}
        </Panel>

        <Panel title="Temps forts" subtitle="Répartition des séquences codées">
          {tempoStats.length ? (
            <div className="tempo-list">
              {tempoStats.map((row) => {
                const max = Math.max(...tempoStats.map((r) => r.total), 1);
                return (
                  <div className="tempo-row" key={row.name}>
                    <div><strong>{human(row.name)}</strong><span>{row.total} action{row.total > 1 ? "s" : ""}</span></div>
                    <div className="tempo-bar"><i style={{ width: `${(row.total / max) * 100}%` }} /></div>
                  </div>
                );
              })}
            </div>
          ) : <Empty />}
        </Panel>
      </div>

      <Panel title="Joueurs & actions" subtitle="Box-score consolidée selon les filtres actifs">
        {playerRows.length ? (
          <div className="player-table-wrap">
            <table className="player-table">
              <thead>
                <tr>
                  <th>Joueur</th><th>MJ</th><th>PTS</th><th>2PTS</th><th>3PTS</th><th>LF</th>
                  <th>REB</th><th>PD</th><th>INT</th><th>CTR</th><th>BP</th>
                </tr>
              </thead>
              <tbody>
                {playerRows.map((row) => (
                  <tr key={row.playerId}>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.games.size}</td>
                    <td>{row.pts}</td>
                    <td>{row.p2m}/{row.p2a} <small>{pct(row.p2m, row.p2a)}</small></td>
                    <td>{row.p3m}/{row.p3a} <small>{pct(row.p3m, row.p3a)}</small></td>
                    <td>{row.ftm}/{row.fta} <small>{pct(row.ftm, row.fta)}</small></td>
                    <td>{row.reb}</td>
                    <td>{row.ast}</td>
                    <td>{row.stl}</td>
                    <td>{row.blk}</td>
                    <td>{row.turnovers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty />}
      </Panel>

      <div className="shot-layout">
        <Panel title="Shot chart" subtitle={`${madeShots}/${shots.length} tirs réussis · ${pct(madeShots, shots.length)}`}>
          <div className="shot-chart-wrap">
            <ShotChart mode="analysis" shots={shots} showPoints showStats size="lg" />
          </div>
        </Panel>

        <Panel title="Détail par zone" subtitle="Réussite sur les zones réellement utilisées">
          {shotZoneRows.length ? (
            <div className="zone-list">
              {shotZoneRows.map(({ zone, attempts, made }) => (
                <div className="zone-row" key={zone.id}>
                  <span className="zone-number">{zone.num}</span>
                  <div><strong>{zone.label}</strong><small>{zone.type}</small></div>
                  <b>{made}/{attempts}</b>
                  <em>{pct(made, attempts)}</em>
                </div>
              ))}
            </div>
          ) : <Empty />}
        </Panel>
      </div>

      <style jsx>{`
        .advanced-stats { display:grid; gap:18px; }
        .advanced-head { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; padding:20px; border:1px solid #eadfd5; border-radius:20px; background:#fff; }
        .advanced-kicker { color:#d4a24c; font-size:.66rem; font-weight:950; letter-spacing:.12em; }
        .advanced-head h2 { margin:5px 0 4px; color:#6b1a2c; font-size:1.55rem; }
        .advanced-head p { margin:0; color:#7d6f68; font-size:.82rem; }
        .reset { min-height:38px; padding:0 14px; border:1px solid #e1d4cc; border-radius:999px; background:#fff; color:#6b1a2c; font-weight:900; cursor:pointer; white-space:nowrap; }
        .advanced-error { padding:12px 14px; border-radius:12px; background:#fff1f2; color:#a3283d; font-weight:800; }
        .filters { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; padding:14px; border:1px solid #eadfd5; border-radius:18px; background:#fffaf5; }
        .summary-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; }
        .two-cols, .shot-layout { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr); gap:18px; }
        .simple-table { display:grid; }
        .tr { display:grid; grid-template-columns:minmax(150px,1.5fr) repeat(4,minmax(55px,.55fr)); gap:8px; align-items:center; min-height:44px; padding:0 8px; border-bottom:1px solid #f1e7e0; font-size:.76rem; }
        .tr.th { color:#9a887f; font-size:.65rem; font-weight:950; text-transform:uppercase; }
        .tr strong { color:#352720; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tempo-list { display:grid; gap:12px; }
        .tempo-row > div:first-child { display:flex; justify-content:space-between; gap:12px; margin-bottom:5px; }
        .tempo-row strong { color:#382a24; font-size:.78rem; }
        .tempo-row span { color:#9b8c84; font-size:.7rem; }
        .tempo-bar { height:7px; border-radius:999px; overflow:hidden; background:#f0e7e1; }
        .tempo-bar i { display:block; height:100%; border-radius:999px; background:#6b1a2c; }
        .player-table-wrap { overflow:auto; }
        .player-table { width:100%; min-width:900px; border-collapse:collapse; font-size:.75rem; }
        .player-table th { padding:9px 10px; border-bottom:1px solid #e9ddd5; color:#9a887f; font-size:.63rem; text-transform:uppercase; text-align:center; }
        .player-table th:first-child, .player-table td:first-child { text-align:left; }
        .player-table td { padding:10px; border-bottom:1px solid #f2e9e3; text-align:center; }
        .player-table td strong { color:#362820; }
        .player-table small { display:block; margin-top:2px; color:#a39086; }
        .shot-chart-wrap { width:100%; max-width:900px; margin:0 auto; }
        .zone-list { display:grid; gap:7px; }
        .zone-row { display:grid; grid-template-columns:34px minmax(0,1fr) 48px 48px; gap:9px; align-items:center; min-height:48px; padding:7px 9px; border:1px solid #eee4dc; border-radius:11px; background:#fff; }
        .zone-number { width:30px; height:30px; display:grid; place-items:center; border-radius:50%; background:#fff3df; color:#6b1a2c; font-weight:950; }
        .zone-row div { display:grid; }
        .zone-row strong { color:#3a2c25; font-size:.75rem; }
        .zone-row small { color:#a19087; font-size:.62rem; }
        .zone-row b { color:#392a24; text-align:right; }
        .zone-row em { color:#6b1a2c; font-style:normal; font-weight:950; text-align:right; }
        .advanced-loading { padding:26px; border:1px solid #eadfd5; border-radius:18px; background:#fff; color:#7c6c64; font-weight:850; }
        @media (max-width: 1050px) {
          .filters { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .summary-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
          .two-cols, .shot-layout { grid-template-columns:1fr; }
        }
        @media (max-width: 650px) {
          .advanced-head { flex-direction:column; }
          .filters, .summary-grid { grid-template-columns:1fr; }
          .reset { width:100%; }
        }
      `}</style>
    </section>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <style jsx>{`
        .filter-field { display:grid; gap:5px; min-width:0; }
        .filter-field > span { color:#8e7d74; font-size:.62rem; font-weight:950; text-transform:uppercase; letter-spacing:.055em; }
        select { width:100%; min-height:40px; border:1px solid #e7dbd3; border-radius:10px; background:#fff; color:#3b2c25; padding:0 10px; font-size:.76rem; font-weight:750; outline:none; }
      `}</style>
    </label>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="advanced-panel">
      <header>
        <div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
      </header>
      <div className="body">{children}</div>
      <style jsx>{`
        .advanced-panel { min-width:0; overflow:hidden; border:1px solid #eadfd5; border-radius:18px; background:#fff; box-shadow:0 8px 24px rgba(48,30,20,.035); }
        header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:15px 17px; border-bottom:1px solid #f0e6df; background:#fffaf6; }
        h3 { margin:0; color:#6b1a2c; font-size:.96rem; }
        p { margin:3px 0 0; color:#9a8a82; font-size:.68rem; }
        .body { min-width:0; padding:14px; }
      `}</style>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="mini">
      <strong>{value}</strong>
      <span>{label}</span>
      <style jsx>{`
        .mini { min-height:78px; display:grid; place-items:center; align-content:center; gap:3px; border:1px solid #eadfd5; border-radius:15px; background:#fff; }
        strong { color:#6b1a2c; font-size:1.3rem; }
        span { color:#96857c; font-size:.62rem; font-weight:950; text-transform:uppercase; letter-spacing:.05em; }
      `}</style>
    </div>
  );
}

function Empty() {
  return <div style={{ padding: "22px 8px", color: "#9b8b82", textAlign: "center", fontSize: ".78rem" }}>Aucune donnée avec ces filtres.</div>;
}
