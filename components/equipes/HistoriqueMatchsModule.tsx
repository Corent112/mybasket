"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TeamOption = {
  id: string;
  name: string;
};

type MatchRow = {
  id: string;
  team_id: string | null;
  opponent: string | null;
  match_date: string | null;
  us_score: number | null;
  them_score: number | null;
  result: string | null;
  home?: boolean | null;
  project_status?: string | null;
  finalized_at?: string | null;
};

type PlayerLine = {
  player_id: string | null;
  pts: number | null;
  p2m: number | null;
  p2a: number | null;
  p3m: number | null;
  p3a: number | null;
  ftm: number | null;
  fta: number | null;
  off_reb: number | null;
  def_reb: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  turnovers: number | null;
  pf: number | null;
  present: boolean | null;
};

type MatchActionLine = {
  match_id: string | null;
  quarter: number | null;
  clock: string | null;
  context: string | null;
  action_type: string | null;
  shot_type: string | null;
  shot_result: string | null;
  special_case: string | null;
  ft_attempts: number | null;
  ft_made: number | null;
  rebound_type: string | null;
  assist_player_id: string | null;
  player_id: string | null;
  lineup: string[] | null;
};

const TEAMS_KEY = "mybasket_equipes";

function safeNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function pct(made: number, attempted: number) {
  return attempted ? `${round1((made / attempted) * 100)}%` : "0%";
}

function madeAttempt(made: number, attempted: number) {
  return `${round1(made)}-${round1(attempted)}`;
}

function uniq(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean).map(String)));
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function readLocalTeamNames(): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(TEAMS_KEY);
    if (!raw) return {};

    const data = JSON.parse(raw);
    const teams = Array.isArray(data) ? data : data?.teams || data?.equipes || [];

    return teams.reduce((acc: Record<string, string>, team: any) => {
      const id = String(team.id ?? "");
      if (id) acc[id] = String(team.name ?? team.nom ?? "Équipe");
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function readLocalPlayerNames(): Record<string, string> {
  if (typeof window === "undefined") return {};

  try {
    const raw = localStorage.getItem(TEAMS_KEY);
    if (!raw) return {};

    const data = JSON.parse(raw);
    const teams = Array.isArray(data) ? data : data?.teams || data?.equipes || [];
    const names: Record<string, string> = {};

    teams.forEach((team: any) => {
      const players = team.players || team.joueurs || [];

      players.forEach((player: any) => {
        const id = String(player.id ?? "");
        if (!id) return;

        const firstName = player.firstName ?? player.prenom ?? "";
        const lastName = player.lastName ?? player.nom ?? "";
        const num = player.num ?? player.numero ?? "";
        names[id] = `${num ? `#${num} ` : ""}${firstName} ${lastName}`.trim() || "Joueur";
      });
    });

    return names;
  } catch {
    return {};
  }
}

function getTeamName(row: any) {
  return String(row?.name ?? row?.nom ?? row?.team_name ?? row?.title ?? row?.label ?? "Équipe");
}

function getPlayerName(row: any) {
  const num = row?.num ?? row?.numero ?? row?.number ?? "";
  const firstName = row?.first_name ?? row?.firstName ?? row?.prenom ?? "";
  const lastName = row?.last_name ?? row?.lastName ?? row?.nom ?? "";
  const fullName = row?.name ?? row?.full_name ?? row?.fullName ?? "";
  const name = fullName || `${firstName} ${lastName}`.trim() || row?.display_name || "Joueur";

  return `${num ? `#${num} ` : ""}${name}`.trim();
}

function getLineNumbers(line: PlayerLine) {
  const p2m = safeNumber(line.p2m);
  const p2a = safeNumber(line.p2a);
  const p3m = safeNumber(line.p3m);
  const p3a = safeNumber(line.p3a);
  const ftm = safeNumber(line.ftm);
  const fta = safeNumber(line.fta);

  const fgm = p2m + p3m;
  const fga = p2a + p3a;

  const off = safeNumber(line.off_reb);
  const def = safeNumber(line.def_reb);
  const reb = safeNumber(line.reb) || off + def;

  const ast = safeNumber(line.ast);
  const st = safeNumber(line.stl);
  const to = safeNumber(line.turnovers);
  const bs = safeNumber(line.blk);
  const pf = safeNumber(line.pf);
  const pts = safeNumber(line.pts);

  const poss = fga + 0.44 * fta + to - off;

  const eff =
    pts +
    reb +
    ast +
    st +
    bs -
    (fga - fgm) -
    (fta - ftm) -
    to -
    pf;

  const efg = fga ? ((fgm + 0.5 * p3m) / fga) * 100 : 0;

  const ts =
    fga + 0.44 * fta
      ? (pts / (2 * (fga + 0.44 * fta))) * 100
      : 0;

  const astPct = fgm ? (ast / fgm) * 100 : 0;
  const tovPct = poss ? (to / poss) * 100 : 0;
  const ftRate = fga ? fta / fga : 0;
  const shot2Rep = fga ? (p2a / fga) * 100 : 0;
  const shot3Rep = fga ? (p3a / fga) * 100 : 0;

  return {
    p2m,
    p2a,
    p3m,
    p3a,
    ftm,
    fta,
    fgm,
    fga,
    off,
    def,
    reb,
    ast,
    st,
    to,
    bs,
    pf,
    pts,
    poss,
    eff,
    efg,
    ts,
    astPct,
    tovPct,
    ftRate,
    shot2Rep,
    shot3Rep,
  };
}

function getTotals(lines: PlayerLine[]) {
  return lines.reduce(
    (acc, line) => {
      const s = getLineNumbers(line);

      acc.p2m += s.p2m;
      acc.p2a += s.p2a;
      acc.p3m += s.p3m;
      acc.p3a += s.p3a;
      acc.ftm += s.ftm;
      acc.fta += s.fta;
      acc.fgm += s.fgm;
      acc.fga += s.fga;
      acc.off += s.off;
      acc.def += s.def;
      acc.reb += s.reb;
      acc.ast += s.ast;
      acc.st += s.st;
      acc.to += s.to;
      acc.bs += s.bs;
      acc.pf += s.pf;
      acc.pts += s.pts;

      return acc;
    },
    {
      p2m: 0,
      p2a: 0,
      p3m: 0,
      p3a: 0,
      ftm: 0,
      fta: 0,
      fgm: 0,
      fga: 0,
      off: 0,
      def: 0,
      reb: 0,
      ast: 0,
      st: 0,
      to: 0,
      bs: 0,
      pf: 0,
      pts: 0,
    }
  );
}

function getTotalsAdvanced(totals: ReturnType<typeof getTotals>) {
  const poss = totals.fga + 0.44 * totals.fta + totals.to - totals.off;

  const eff =
    totals.pts +
    totals.reb +
    totals.ast +
    totals.st +
    totals.bs -
    (totals.fga - totals.fgm) -
    (totals.fta - totals.ftm) -
    totals.to -
    totals.pf;

  const efg =
    totals.fga > 0
      ? ((totals.fgm + 0.5 * totals.p3m) / totals.fga) * 100
      : 0;

  const ts =
    totals.fga + 0.44 * totals.fta > 0
      ? (totals.pts / (2 * (totals.fga + 0.44 * totals.fta))) * 100
      : 0;

  const orbPct = totals.reb > 0 ? (totals.off / totals.reb) * 100 : 0;
  const drbPct = totals.reb > 0 ? (totals.def / totals.reb) * 100 : 0;
  const astPct = totals.fgm > 0 ? (totals.ast / totals.fgm) * 100 : 0;
  const tovPct = poss > 0 ? (totals.to / poss) * 100 : 0;
  const ftRate = totals.fga > 0 ? totals.fta / totals.fga : 0;
  const shot2Rep = totals.fga > 0 ? (totals.p2a / totals.fga) * 100 : 0;
  const shot3Rep = totals.fga > 0 ? (totals.p3a / totals.fga) * 100 : 0;

  return {
    poss,
    eff,
    efg,
    ts,
    orbPct,
    drbPct,
    astPct,
    tovPct,
    ftRate,
    shot2Rep,
    shot3Rep,
  };
}

function pointsFromAction(action: MatchActionLine) {
  const context = String(action.context || "");
  const actionType = String(action.action_type || "");
  const shotType = String(action.shot_type || "");
  const shotResult = String(action.shot_result || "");
  const specialCase = String(action.special_case || "");

  if (context === "attaque") {
    if (actionType === "tir") {
      if (shotType === "LF") return safeNumber(action.ft_made);

      let pts = 0;

      if (shotResult === "made") {
        if (shotType === "2PTS") pts += 2;
        if (shotType === "3PTS") pts += 3;
      }

      if (shotResult === "made" && specialCase !== "aucun") {
        pts += safeNumber(action.ft_made);
      }

      return pts;
    }

    if (actionType === "faute-provoquee") return safeNumber(action.ft_made);
  }

  if (context === "defense" && actionType === "tir" && shotResult === "made") {
    if (shotType === "3PTS") return -3;
    if (shotType === "2PTS") return -2;
    if (shotType === "LF") return -safeNumber(action.ft_made);
  }

  if (context === "defense" && actionType === "faute-commise") {
    return -safeNumber(action.ft_made);
  }

  return 0;
}

function getActionPossession(action: MatchActionLine) {
  const context = String(action.context || "");
  const actionType = String(action.action_type || "");
  const shotType = String(action.shot_type || "");
  const reboundType = String(action.rebound_type || "");

  if (context !== "attaque") return 0;

  if (actionType === "tir" && (shotType === "2PTS" || shotType === "3PTS")) return 1;
  if (actionType === "tir" && shotType === "LF") return 0.44 * safeNumber(action.ft_attempts);
  if (actionType === "faute-provoquee") return 0.44 * safeNumber(action.ft_attempts);
  if (actionType === "perte") return 1;
  if (reboundType === "off") return -1;

  return 0;
}

function lineupLabel(ids: string[], playerNames: Record<string, string>) {
  return ids
    .map((id) => {
      const name = playerNames[id] || `Joueur ${id.slice(0, 4)}`;
      return name.replace(/^#/, "");
    })
    .join(" · ");
}

function computeLineupRows(actions: MatchActionLine[], playerNames: Record<string, string>) {
  const map: Record<
    string,
    {
      ids: string[];
      label: string;
      actions: number;
      poss: number;
      ptsFor: number;
      ptsAgainst: number;
      plusMinus: number;
      p2m: number;
      p2a: number;
      p3m: number;
      p3a: number;
      ftm: number;
      fta: number;
      ast: number;
      to: number;
      stops: number;
    }
  > = {};

  actions.forEach((action) => {
    const ids = Array.isArray(action.lineup) ? action.lineup.filter(Boolean).map(String) : [];
    if (ids.length === 0) return;

    const key = ids.slice().sort().join("|");

    if (!map[key]) {
      map[key] = {
        ids,
        label: lineupLabel(ids, playerNames),
        actions: 0,
        poss: 0,
        ptsFor: 0,
        ptsAgainst: 0,
        plusMinus: 0,
        p2m: 0,
        p2a: 0,
        p3m: 0,
        p3a: 0,
        ftm: 0,
        fta: 0,
        ast: 0,
        to: 0,
        stops: 0,
      };
    }

    const row = map[key];
    const context = String(action.context || "");
    const actionType = String(action.action_type || "");
    const shotType = String(action.shot_type || "");
    const shotResult = String(action.shot_result || "");

    row.actions += 1;

    const ptsDelta = pointsFromAction(action);
    if (ptsDelta > 0) row.ptsFor += ptsDelta;
    if (ptsDelta < 0) row.ptsAgainst += Math.abs(ptsDelta);
    row.plusMinus += ptsDelta;

    row.poss += getActionPossession(action);

    if (context === "attaque" && actionType === "tir") {
      if (shotType === "2PTS") {
        row.p2a += 1;
        if (shotResult === "made") row.p2m += 1;
      }

      if (shotType === "3PTS") {
        row.p3a += 1;
        if (shotResult === "made") row.p3m += 1;
      }

      if (shotType === "LF") {
        row.fta += safeNumber(action.ft_attempts);
        row.ftm += safeNumber(action.ft_made);
      }

      if (shotType !== "LF" && shotResult === "made" && action.special_case !== "aucun") {
        row.fta += safeNumber(action.ft_attempts);
        row.ftm += safeNumber(action.ft_made);
      }
    }

    if (context === "attaque" && action.assist_player_id) row.ast += 1;
    if (context === "attaque" && actionType === "perte") row.to += 1;

    if (context === "defense") {
      const conceded = ptsDelta < 0;
      if (!conceded) row.stops += 1;
    }
  });

  return Object.values(map)
    .map((row) => {
      const fgm = row.p2m + row.p3m;
      const fga = row.p2a + row.p3a;
      const offRtg = row.poss ? (100 * row.ptsFor) / row.poss : 0;
      const efg = fga ? ((fgm + 0.5 * row.p3m) / fga) * 100 : 0;
      const ts = fga + 0.44 * row.fta ? (row.ptsFor / (2 * (fga + 0.44 * row.fta))) * 100 : 0;
      const astPct = fgm ? (row.ast / fgm) * 100 : 0;
      const tovPct = row.poss ? (row.to / row.poss) * 100 : 0;
      const stopPct = row.actions ? (row.stops / row.actions) * 100 : 0;

      return {
        ...row,
        fgm,
        fga,
        offRtg,
        efg,
        ts,
        astPct,
        tovPct,
        stopPct,
      };
    })
    .sort((a, b) => b.plusMinus - a.plusMinus);
}


export default function HistoriqueMatchsModule() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [teamId, setTeamId] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<MatchRow | null>(null);
  const [sheetTab, setSheetTab] = useState<"players" | "analysis" | "lineups">("players");
  const [sheetLines, setSheetLines] = useState<PlayerLine[]>([]);
  const [sheetActions, setSheetActions] = useState<MatchActionLine[]>([]);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [playerNames, setPlayerNames] = useState<Record<string, string>>({});

  const localTeamNames = useMemo(() => readLocalTeamNames(), []);
  const localPlayerNames = useMemo(() => readLocalPlayerNames(), []);

  const load = async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    // IMPORTANT : l'historique appartient à l'ÉQUIPE, pas à l'utilisateur qui a codé.
    // Les RLS Supabase vérifient que le compte connecté est propriétaire de l'équipe
    // ou collaborateur autorisé LiveStats. Le coach principal voit donc aussi les
    // matchs codés par ses assistants.
    const { data: matchData, error: matchError } = await supabase
      .from("match_stats")
      .select("id, team_id, opponent, match_date, us_score, them_score, result, home, project_status, finalized_at")
      .order("match_date", { ascending: false });

    if (matchError) {
      console.error("Erreur chargement historique matchs:", matchError);
      setLoading(false);
      return;
    }

    const rows = (matchData ?? []) as MatchRow[];
    setMatches(rows);

    const teamIds = uniq(rows.map((match) => match.team_id));
    let names: Record<string, string> = {};

    if (teamIds.length > 0) {
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("*")
        .in("id", teamIds);

      if (!teamError && teamData) {
        names = teamData.reduce((acc: Record<string, string>, team: any) => {
          acc[String(team.id)] = getTeamName(team);
          return acc;
        }, {});
      }
    }

    const mergedTeamNames = { ...localTeamNames, ...names };
    setTeamNames(mergedTeamNames);

    const teamOptions = teamIds.map((id) => ({
      id,
      name: mergedTeamNames[id] || "Équipe sans nom",
    }));

    setTeams(teamOptions);

    if (teamOptions.length > 0) {
      setTeamId((prev) => prev || teamOptions[0].id);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleMatches = useMemo(() => {
    if (!teamId) return [];

    const rows = matches.filter((match) => match.team_id === teamId);

    // Protection visuelle contre les anciens doublons : si une rencontre possède
    // à la fois un brouillon 0-0 et un match terminé, on affiche le match terminé.
    // Les nouveaux matchs sont aussi protégés à la création dans ensureLiveMatch().
    const byFixture = new Map<string, MatchRow>();
    for (const match of rows) {
      const key = [
        String(match.team_id || ""),
        String(match.match_date || ""),
        String(match.opponent || "").trim().toLocaleLowerCase("fr"),
        match.home === false ? "away" : "home",
      ].join("|");
      const previous = byFixture.get(key);
      if (!previous) {
        byFixture.set(key, match);
        continue;
      }

      const score = (m: MatchRow) =>
        (m.project_status === "completed" ? 1000 : 0) +
        (m.finalized_at ? 100 : 0) +
        (safeNumber(m.us_score) !== 0 || safeNumber(m.them_score) !== 0 ? 10 : 0);

      if (score(match) > score(previous)) byFixture.set(key, match);
    }

    return Array.from(byFixture.values()).sort((a, b) =>
      String(b.match_date || "").localeCompare(String(a.match_date || "")),
    );
  }, [matches, teamId]);

  const openSheet = async (match: MatchRow) => {
    setSelectedMatch(match);
    setSheetTab("players");
    setSheetLoading(true);
    setSheetLines([]);
    setSheetActions([]);

    const { data, error } = await supabase
      .from("match_player_stats")
      .select(
        "player_id, pts, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, reb, ast, stl, blk, turnovers, pf, present"
      )
      .eq("match_id", match.id)
      .order("pts", { ascending: false });

    if (error) {
      console.error("Erreur chargement boxscore complet:", error);
      setSheetLines([]);
      setSheetLoading(false);
      return;
    }

    const lines = ((data ?? []) as PlayerLine[]).filter((line) => line.present !== false);
    setSheetLines(lines);

    const playerIds = uniq(lines.map((line) => line.player_id));
    let names: Record<string, string> = {};

    if (playerIds.length > 0) {
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select("*")
        .in("id", playerIds);

      if (!playersError && playersData) {
        names = playersData.reduce((acc: Record<string, string>, player: any) => {
          acc[String(player.id)] = getPlayerName(player);
          return acc;
        }, {});
      }
    }

    const mergedPlayerNames = { ...localPlayerNames, ...names };
    setPlayerNames(mergedPlayerNames);

    const { data: actionsData, error: actionsError } = await supabase
      .from("match_actions")
      .select(
        "match_id, quarter, clock, context, action_type, shot_type, shot_result, special_case, ft_attempts, ft_made, rebound_type, assist_player_id, player_id, lineup"
      )
      .eq("match_id", match.id);

    if (actionsError) {
      console.warn("Actions non disponibles pour analyse lineups :", actionsError);
      setSheetActions([]);
    } else {
      setSheetActions((actionsData ?? []) as MatchActionLine[]);
    }

    setSheetLoading(false);
  };

  const deleteMatch = async (match: MatchRow) => {
    const ok = window.confirm(
      `Supprimer ce match contre ${match.opponent || "Adversaire"} ?\nCette action supprimera la feuille, les stats joueurs et les actions.`
    );

    if (!ok) return;

    setDeletingId(match.id);

    try {
      await supabase.from("match_actions").delete().eq("match_id", match.id);
      await supabase.from("match_player_stats").delete().eq("match_id", match.id);

      const { error } = await supabase.from("match_stats").delete().eq("id", match.id);

      if (error) throw error;

      if (selectedMatch?.id === match.id) {
        setSelectedMatch(null);
        setSheetLines([]);
      }

      setMatches((prev) => prev.filter((m) => m.id !== match.id));
    } catch (error) {
      console.error("Erreur suppression match:", error);
      window.alert("Impossible de supprimer ce match. Vérifie les droits RLS Supabase.");
    } finally {
      setDeletingId(null);
    }
  };

  const downloadSheetCSV = () => {
    if (!selectedMatch || sheetLines.length === 0) return;

    const headers = [
      "Joueur",
      "PTS",
      "FGM",
      "FGA",
      "FG%",
      "2PA",
      "2PM",
      "2P%",
      "3PA",
      "3PM",
      "3P%",
      "FTA",
      "FTM",
      "FT%",
      "RO",
      "RD",
      "REB",
      "PD",
      "INT",
      "BP",
      "CTRE",
      "FP",
      "Eval",
      "Poss",
      "eFG%",
      "TS%",
      "%PD",
      "%BP",
      "FTr",
      "2PTS Rep",
      "3PTS Rep",
    ];

    const rows = sheetLines.map((line) => {
      const id = String(line.player_id || "");
      const s = getLineNumbers(line);

      return [
        playerNames[id] || `Joueur ${id.slice(0, 8)}`,
        s.pts,
        s.fgm,
        s.fga,
        pct(s.fgm, s.fga),
        s.p2a,
        s.p2m,
        pct(s.p2m, s.p2a),
        s.p3a,
        s.p3m,
        pct(s.p3m, s.p3a),
        s.fta,
        s.ftm,
        pct(s.ftm, s.fta),
        s.off,
        s.def,
        s.reb,
        s.ast,
        s.st,
        s.to,
        s.bs,
        s.pf,
        s.eff,
        round1(s.poss),
        `${round1(s.efg)}%`,
        `${round1(s.ts)}%`,
        `${round1(s.astPct)}%`,
        `${round1(s.tovPct)}%`,
        round2(s.ftRate),
        `${round1(s.shot2Rep)}%`,
        `${round1(s.shot3Rep)}%`,
      ];
    });

    const totals = getTotals(sheetLines);
    const adv = getTotalsAdvanced(totals);

    rows.push([
      "Totals",
      totals.pts,
      totals.fgm,
      totals.fga,
      pct(totals.fgm, totals.fga),
      totals.p2a,
      totals.p2m,
      pct(totals.p2m, totals.p2a),
      totals.p3a,
      totals.p3m,
      pct(totals.p3m, totals.p3a),
      totals.fta,
      totals.ftm,
      pct(totals.ftm, totals.fta),
      totals.off,
      totals.def,
      totals.reb,
      totals.ast,
      totals.st,
      totals.to,
      totals.bs,
      totals.pf,
      adv.eff,
      round1(adv.poss),
      `${round1(adv.efg)}%`,
      `${round1(adv.ts)}%`,
      `${round1(adv.astPct)}%`,
      `${round1(adv.tovPct)}%`,
      round2(adv.ftRate),
      `${round1(adv.shot2Rep)}%`,
      `${round1(adv.shot3Rep)}%`,
    ]);

    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(";")
      )
      .join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const opponent = (selectedMatch.opponent || "adversaire").replace(/[^a-z0-9_-]+/gi, "_");
    const date = (selectedMatch.match_date || "match").replace(/[^a-z0-9_-]+/gi, "_");

    a.href = url;
    a.download = `feuille_match_${opponent}_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadSheetPDF = async () => {
    if (!selectedMatch || sheetLines.length === 0) return;

    const table = document.querySelector(".players-table table") as HTMLTableElement | null;
    if (!table) {
      window.alert("Ouvre l'onglet Joueurs avant d'exporter le PDF.");
      return;
    }

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      // On construit une feuille indépendante de la modale :
      // aucun bouton / aucune barre de navigation n'apparaît dans le PDF.
      const exportRoot = document.createElement("div");
      exportRoot.style.position = "fixed";
      exportRoot.style.left = "-100000px";
      exportRoot.style.top = "0";
      exportRoot.style.width = "1500px";
      exportRoot.style.background = "#ffffff";
      exportRoot.style.padding = "24px";
      exportRoot.style.fontFamily = "Arial, Helvetica, sans-serif";
      exportRoot.style.color = "#191919";
      exportRoot.setAttribute("aria-hidden", "true");

      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "flex-start";
      header.style.justifyContent = "space-between";
      header.style.gap = "24px";
      header.style.marginBottom = "16px";
      header.style.padding = "14px 16px";
      header.style.borderRadius = "10px";
      header.style.background = "#101014";
      header.style.color = "#ffffff";

      const titleWrap = document.createElement("div");

      const date = document.createElement("div");
      date.textContent = formatDate(selectedMatch.match_date);
      date.style.fontSize = "12px";
      date.style.fontWeight = "800";
      date.style.color = "#d4a24c";
      date.style.marginBottom = "5px";

      const title = document.createElement("div");
      title.textContent = `Boxscore complet — ${selectedTeamName} vs ${selectedMatch.opponent || "Adversaire"}`;
      title.style.fontSize = "19px";
      title.style.fontWeight = "900";
      title.style.color = "#ffffff";

      const meta = document.createElement("div");
      meta.textContent =
        `Score : ${safeNumber(selectedMatch.us_score)} - ${safeNumber(selectedMatch.them_score)} · ` +
        `${selectedMatch.home === false ? "Extérieur" : "Domicile"}`;
      meta.style.marginTop = "6px";
      meta.style.fontSize = "12px";
      meta.style.color = "#d2d2d7";

      titleWrap.appendChild(date);
      titleWrap.appendChild(title);
      titleWrap.appendChild(meta);
      header.appendChild(titleWrap);

      const brand = document.createElement("div");
      brand.textContent = "MyBasket";
      brand.style.color = "#d4a24c";
      brand.style.fontWeight = "900";
      brand.style.fontSize = "16px";
      header.appendChild(brand);

      const clonedTable = table.cloneNode(true) as HTMLTableElement;
      clonedTable.style.width = "100%";
      clonedTable.style.tableLayout = "fixed";
      clonedTable.style.borderCollapse = "collapse";
      clonedTable.style.fontSize = "10px";

      clonedTable.querySelectorAll("th, td").forEach((cell) => {
        const el = cell as HTMLElement;
        el.style.position = "static";
        el.style.left = "auto";
        el.style.minWidth = "0";
        el.style.maxWidth = "none";
        el.style.height = "28px";
        el.style.padding = "4px 3px";
        el.style.border = "1px solid #dddddd";
        el.style.textAlign = cell === clonedTable.rows[0]?.cells[0] ? "left" : "center";
        el.style.whiteSpace = "nowrap";
        el.style.overflow = "hidden";
        el.style.textOverflow = "ellipsis";
      });

      clonedTable.querySelectorAll("thead th").forEach((cell) => {
        const el = cell as HTMLElement;
        el.style.background = "#6b1a2c";
        el.style.color = "#ffffff";
        el.style.fontWeight = "900";
      });

      // Sous-entête TR / TT / % plus clair, comme à l'écran.
      const secondHeader = clonedTable.tHead?.rows?.[1];
      if (secondHeader) {
        Array.from(secondHeader.cells).forEach((cell) => {
          const el = cell as HTMLElement;
          el.style.background = "#f3dfe4";
          el.style.color = "#4c1723";
        });
      }

      clonedTable.querySelectorAll("tbody tr").forEach((row, index) => {
        Array.from(row.children).forEach((cell) => {
          (cell as HTMLElement).style.background =
            index === clonedTable.tBodies[0].rows.length - 1
              ? "#fff7e9"
              : index % 2 === 0
                ? "#ffffff"
                : "#f7f7f7";
        });
      });

      // La colonne Joueur garde un peu plus de place ; les autres restent compactes.
      clonedTable.querySelectorAll("tr").forEach((row) => {
        const first = row.children[0] as HTMLElement | undefined;
        if (first) {
          first.style.width = "180px";
          first.style.textAlign = "left";
          first.style.fontWeight = "800";
        }
      });

      exportRoot.appendChild(header);
      exportRoot.appendChild(clonedTable);
      document.body.appendChild(exportRoot);

      const canvas = await html2canvas(exportRoot, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
      });

      exportRoot.remove();

      // A4 paysage. Le tableau est mis à l'échelle pour tenir sur UNE page.
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 6;
      const maxWidth = pageWidth - margin * 2;
      const maxHeight = pageHeight - margin * 2;

      const ratio = Math.min(maxWidth / canvas.width, maxHeight / canvas.height);
      const drawWidth = canvas.width * ratio;
      const drawHeight = canvas.height * ratio;
      const x = (pageWidth - drawWidth) / 2;
      const y = (pageHeight - drawHeight) / 2;

      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.95),
        "JPEG",
        x,
        y,
        drawWidth,
        drawHeight,
        undefined,
        "FAST"
      );

      const opponent = (selectedMatch.opponent || "adversaire")
        .replace(/[^a-z0-9_-]+/gi, "_");
      const matchDate = (selectedMatch.match_date || "match")
        .replace(/[^a-z0-9_-]+/gi, "_");

      pdf.save(`boxscore_${opponent}_${matchDate}.pdf`);
    } catch (error) {
      console.error("Erreur export PDF boxscore :", error);
      window.alert("Impossible de générer le PDF.");
    }
  };


  const playerPlusMinus = useMemo(() => {
    const result: Record<string, number> = {};
    sheetActions.forEach((action) => {
      const lineup = Array.isArray(action.lineup) ? action.lineup.map(String) : [];
      if (!lineup.length) return;
      const delta = pointsFromAction(action);
      if (!delta) return;
      lineup.forEach((playerId) => {
        result[playerId] = (result[playerId] || 0) + delta;
      });
    });
    return result;
  }, [sheetActions]);

  const selectedTeamName = selectedMatch?.team_id ? teamNames[selectedMatch.team_id] || "Équipe" : "Équipe";
  const totals = getTotals(sheetLines);
  const totalsAdvanced = getTotalsAdvanced(totals);
  const teamOnlyStl = sheetActions.filter(
    (action) =>
      String(action.context || "") === "defense" &&
      String(action.action_type || "") === "perte-adverse" &&
      !action.player_id
  ).length;
  const lineupRows = useMemo(
    () => computeLineupRows(sheetActions, playerNames),
    [sheetActions, playerNames]
  );

  return (
    <div className="hist">
      <div className="hist-head">
        <div>
          <h3>Historique des matchs</h3>
          <p>Choisis ton équipe, ouvre la boxscore complet ou supprime un match.</p>
        </div>

        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.length === 0 && <option value="">Aucune équipe</option>}

          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="empty">Chargement de l’historique...</div>}

      {!loading && visibleMatches.length === 0 && (
        <div className="empty">Aucun match enregistré pour cette équipe.</div>
      )}

      {!loading && visibleMatches.length > 0 && (
        <div className="cards">
          {visibleMatches.map((match) => {
            const us = safeNumber(match.us_score);
            const them = safeNumber(match.them_score);
            const matchTeamName = match.team_id ? teamNames[match.team_id] || "Équipe" : "Équipe";

            return (
              <article key={match.id} className="card">
                <div>
                  <p className="date">{formatDate(match.match_date)}</p>
                  <h4>
                    {matchTeamName} vs {match.opponent || "Adversaire"}
                  </h4>
                  <p className="team">{match.home === false ? "Extérieur" : "Domicile"}</p>
                </div>

                <div className="score">
                  <strong>
                    {us} - {them}
                  </strong>
                  <span>{match.result || "—"}</span>
                </div>

                <div className="card-actions">
                  <button
                    type="button"
                    className="resume"
                    onClick={() => {
                      const params = new URLSearchParams({
                        project: match.id,
                        mode: "resume",
                      });
                      window.location.assign(`/management/live?${params.toString()}`);
                    }}
                  >
                    ▶ Reprendre
                  </button>

                  <button type="button" onClick={() => openSheet(match)}>
                    Boxscore complet
                  </button>

                  <button
                    type="button"
                    className="danger"
                    disabled={deletingId === match.id}
                    onClick={() => deleteMatch(match)}
                  >
                    {deletingId === match.id ? "..." : "🗑️"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedMatch && (
        <div className="modal-bg" onClick={() => setSelectedMatch(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="date">{formatDate(selectedMatch.match_date)}</p>
                <h3>
                  Boxscore complet — {selectedTeamName} vs {selectedMatch.opponent || "Adversaire"}
                </h3>
                <p className="modal-score">
                  Score : {safeNumber(selectedMatch.us_score)} - {safeNumber(selectedMatch.them_score)}
                  {" · "}
                  {selectedMatch.home === false ? "Extérieur" : "Domicile"}
                </p>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="download-btn pdf-btn"
                  onClick={downloadSheetPDF}
                  disabled={sheetLoading || sheetLines.length === 0}
                  title="Télécharger le boxscore en PDF A4 paysage"
                >
                  ↓ PDF
                </button>

                <button type="button" className="download-btn" onClick={downloadSheetCSV}>
                  ↓ CSV
                </button>

                <button type="button" className="close-btn" onClick={() => setSelectedMatch(null)}>
                  ✕
                </button>
              </div>
            </div>

            <div className="sheet-tabs">
              <button
                type="button"
                className={sheetTab === "players" ? "on" : ""}
                onClick={() => setSheetTab("players")}
              >
                Joueurs
              </button>

              <button
                type="button"
                className={sheetTab === "analysis" ? "on" : ""}
                onClick={() => setSheetTab("analysis")}
              >
                Analyse
              </button>

              <button
                type="button"
                className={sheetTab === "lineups" ? "on" : ""}
                onClick={() => setSheetTab("lineups")}
              >
                5 sur le terrain
              </button>
            </div>

            {sheetLoading && <div className="empty">Chargement...</div>}

            {!sheetLoading && sheetLines.length === 0 && (
              <div className="empty">Aucune ligne joueur trouvée.</div>
            )}

            {!sheetLoading && sheetLines.length > 0 && sheetTab === "players" && (
              <div className="sheet-table players-table">
                <table>
                  <thead>
                    <tr>
                      <th rowSpan={2}>Joueur</th>
                      <th rowSpan={2}>PTS</th>
                      <th colSpan={3}>Total</th>
                      <th colSpan={3}>2 points</th>
                      <th colSpan={3}>3 points</th>
                      <th colSpan={3}>L-F</th>
                      <th colSpan={3}>Rebonds</th>
                      <th rowSpan={2}>PD</th>
                      <th rowSpan={2}>INT</th>
                      <th rowSpan={2}>BP</th>
                      <th rowSpan={2}>CTRE</th>
                      <th rowSpan={2}>FP</th>
                      <th rowSpan={2}>+/-</th>
                      <th rowSpan={2}>Éval</th>
                    </tr>

                    <tr>
                      <th>TR</th>
                      <th>TT</th>
                      <th>%</th>
                      <th>TR</th>
                      <th>TT</th>
                      <th>%</th>
                      <th>TR</th>
                      <th>TT</th>
                      <th>%</th>
                      <th>TR</th>
                      <th>TT</th>
                      <th>%</th>
                      <th>RO</th>
                      <th>RD</th>
                      <th>TT</th>

                    </tr>
                  </thead>

                  <tbody>
                    {sheetLines.map((line) => {
                      const id = String(line.player_id || "");
                      const s = getLineNumbers(line);

                      return (
                        <tr key={id}>
                          <td className="player">{playerNames[id] || `Joueur ${id.slice(0, 8)}`}</td>
                          <td className="pts">{s.pts}</td>
                          <td>{s.fgm}</td>
                          <td>{s.fga}</td>
                          <td>{pct(s.fgm, s.fga)}</td>
                          <td>{s.p2m}</td>
                          <td>{s.p2a}</td>
                          <td>{pct(s.p2m, s.p2a)}</td>
                          <td>{s.p3m}</td>
                          <td>{s.p3a}</td>
                          <td>{pct(s.p3m, s.p3a)}</td>
                          <td>{s.ftm}</td>
                          <td>{s.fta}</td>
                          <td>{pct(s.ftm, s.fta)}</td>
                          <td>{s.off}</td>
                          <td>{s.def}</td>
                          <td>{s.reb}</td>
                          <td>{s.ast}</td>
                          <td>{s.st}</td>
                          <td>{s.to}</td>
                          <td>{s.bs}</td>
                          <td>{s.pf}</td>
                          <td className={(playerPlusMinus[id] || 0) >= 0 ? "positive" : "negative"}>
                            {(playerPlusMinus[id] || 0) > 0 ? "+" : ""}{playerPlusMinus[id] || 0}
                          </td>
                          <td>{s.eff}</td>
                        </tr>
                      );
                    })}

                    <tr className="team-stat-row">
                      <td className="player"><b>ÉQUIPE</b></td>
                      <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                      <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>
                      <td>—</td><td>—</td><td>—</td><td>—</td>
                      <td><b>{teamOnlyStl}</b></td>
                      <td>—</td><td>—</td><td>—</td><td>—</td><td>{teamOnlyStl}</td>
                    </tr>

                    <tr className="totals">
                      <td>Totals</td>
                      <td className="pts">{totals.pts}</td>
                      <td>{totals.fgm}</td>
                      <td>{totals.fga}</td>
                      <td>{pct(totals.fgm, totals.fga)}</td>
                      <td>{totals.p2m}</td>
                      <td>{totals.p2a}</td>
                      <td>{pct(totals.p2m, totals.p2a)}</td>
                      <td>{totals.p3m}</td>
                      <td>{totals.p3a}</td>
                      <td>{pct(totals.p3m, totals.p3a)}</td>
                      <td>{totals.ftm}</td>
                      <td>{totals.fta}</td>
                      <td>{pct(totals.ftm, totals.fta)}</td>
                      <td>{totals.off}</td>
                      <td>{totals.def}</td>
                      <td>{totals.reb}</td>
                      <td>{totals.ast}</td>
                      <td>{totals.st + teamOnlyStl}</td>
                      <td>{totals.to}</td>
                      <td>{totals.bs}</td>
                      <td>{totals.pf}</td>
                      <td className={(safeNumber(selectedMatch?.us_score) - safeNumber(selectedMatch?.them_score)) >= 0 ? "positive" : "negative"}>
                        {(safeNumber(selectedMatch?.us_score) - safeNumber(selectedMatch?.them_score)) > 0 ? "+" : ""}
                        {safeNumber(selectedMatch?.us_score) - safeNumber(selectedMatch?.them_score)}
                      </td>
                      <td>{totalsAdvanced.eff + teamOnlyStl}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {!sheetLoading && sheetLines.length > 0 && sheetTab === "analysis" && (
              <div className="sheet-table analysis-table">
                <table>
                  <thead>
                    <tr>
                      <th>Analyse</th>
                      <th>Poss</th>
                      <th>eFG%</th>
                      <th>TS%</th>
                      <th>% Reb Off</th>
                      <th>% Reb Def</th>
                      <th>%PD</th>
                      <th>%BP</th>
                      <th>FTr</th>
                      <th>2PTS Rep</th>
                      <th>3PTS Rep</th>
                    </tr>
                  </thead>

                  <tbody>
                    <tr className="totals">
                      <td>Équipe</td>
                      <td>{round1(totalsAdvanced.poss)}</td>
                      <td>{round1(totalsAdvanced.efg)}%</td>
                      <td>{round1(totalsAdvanced.ts)}%</td>
                      <td>{round1(totalsAdvanced.orbPct)}%</td>
                      <td>{round1(totalsAdvanced.drbPct)}%</td>
                      <td>{round1(totalsAdvanced.astPct)}%</td>
                      <td>{round1(totalsAdvanced.tovPct)}%</td>
                      <td>{round2(totalsAdvanced.ftRate)}</td>
                      <td>{round1(totalsAdvanced.shot2Rep)}%</td>
                      <td>{round1(totalsAdvanced.shot3Rep)}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {!sheetLoading && sheetLines.length > 0 && sheetTab === "lineups" && (
              <div className="sheet-table lineups-table">
                <table>
                  <thead>
                    <tr>
                      <th>5 sur le terrain</th>
                      <th>Actions</th>
                      <th>Poss</th>
                      <th>PTS +</th>
                      <th>PTS -</th>
                      <th>+/-</th>
                      <th>OffRtg</th>
                      <th>FGM-A</th>
                      <th>2PM-A</th>
                      <th>3PM-A</th>
                      <th>LF</th>
                      <th>eFG%</th>
                      <th>TS%</th>
                      <th>%PD</th>
                      <th>%BP</th>
                      <th>Stops</th>
                      <th>Stop%</th>
                    </tr>
                  </thead>

                  <tbody>
                    {lineupRows.length === 0 && (
                      <tr>
                        <td colSpan={17} className="empty-line">
                          Pas assez d’actions avec lineup enregistré pour analyser les 5.
                        </td>
                      </tr>
                    )}

                    {lineupRows.map((row) => (
                      <tr key={row.ids.join("|")}>
                        <td className="player">{row.label}</td>
                        <td>{row.actions}</td>
                        <td>{round1(row.poss)}</td>
                        <td>{row.ptsFor}</td>
                        <td>{row.ptsAgainst}</td>
                        <td className={row.plusMinus >= 0 ? "positive" : "negative"}>
                          {row.plusMinus > 0 ? "+" : ""}
                          {row.plusMinus}
                        </td>
                        <td>{round2(row.offRtg)}</td>
                        <td>{madeAttempt(row.fgm, row.fga)}</td>
                        <td>{madeAttempt(row.p2m, row.p2a)}</td>
                        <td>{madeAttempt(row.p3m, row.p3a)}</td>
                        <td>{madeAttempt(row.ftm, row.fta)}</td>
                        <td>{round1(row.efg)}%</td>
                        <td>{round1(row.ts)}%</td>
                        <td>{round1(row.astPct)}%</td>
                        <td>{round1(row.tovPct)}%</td>
                        <td>{row.stops}</td>
                        <td>{round1(row.stopPct)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <style jsx>{`
        .hist {
          background: #fff;
          border: 1px solid #efe6db;
          border-radius: 18px;
          padding: 1.2rem;
          box-shadow: 0 12px 34px rgba(60, 30, 20, 0.06);
        }

        .hist-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        h3,
        h4,
        p {
          margin: 0;
        }

        .hist-head h3 {
          color: #6b1a2c;
          font-size: 1.5rem;
          font-weight: 900;
        }

        .hist-head p {
          color: #7c7470;
          margin-top: 0.25rem;
        }

        select {
          min-width: 260px;
          border: 1px solid #eadccc;
          border-radius: 12px;
          padding: 0.75rem 1rem;
          background: #fff;
          color: #6b1a2c;
          font-weight: 900;
        }

        .empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 14px;
          padding: 1.2rem;
          color: #6b1a2c;
          font-weight: 900;
        }

        .cards {
          display: grid;
          gap: 0.9rem;
        }

        .card {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 1rem;
          align-items: center;
          border: 1px solid #eee2d6;
          border-radius: 16px;
          padding: 1rem;
          background: #fffdf9;
        }

        .date {
          color: #d4a24c;
          font-weight: 900;
          font-size: 0.8rem;
          text-transform: uppercase;
        }

        h4 {
          color: #6b1a2c;
          font-size: 1.05rem;
          font-weight: 900;
          margin-top: 0.2rem;
        }

        .team {
          color: #7c7470;
          font-size: 0.85rem;
          margin-top: 0.2rem;
        }

        .score {
          text-align: center;
        }

        .score strong {
          display: block;
          color: #6b1a2c;
          font-size: 1.3rem;
          font-weight: 900;
        }

        .score span {
          display: inline-flex;
          margin-top: 0.25rem;
          background: #f5efe6;
          color: #6b1a2c;
          border-radius: 999px;
          padding: 0.2rem 0.55rem;
          font-weight: 900;
          font-size: 0.8rem;
        }

        .card-actions {
          display: flex;
          align-items: center;
          gap: 0.45rem;
        }

        button {
          border: none;
          border-radius: 12px;
          background: #6b1a2c;
          color: white;
          padding: 0.75rem 1rem;
          font-weight: 900;
          cursor: pointer;
        }

        button:hover {
          background: #501020;
        }

        button.resume {
          background: #d4a24c;
          color: #321;
        }

        button.resume:hover {
          background: #c49340;
        }

        button.danger {
          background: #b3261e;
          width: 46px;
          padding-left: 0;
          padding-right: 0;
        }

        button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .modal-bg {
          position: fixed;
          inset: 0;
          z-index: 99999;
          background: rgba(0, 0, 0, 0.62);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0.75rem;
        }

        .modal {
          width: 98vw;
          height: 96vh;
          max-width: none;
          max-height: none;
          background: #fff;
          border-radius: 16px;
          padding: 1rem;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.25);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .modal-head {
          flex: 0 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .modal-head h3 {
          color: #6b1a2c;
          font-size: 1.25rem;
          font-weight: 900;
        }

        .modal-score {
          margin-top: 0.25rem;
          color: #7c7470;
          font-weight: 800;
        }

        .modal-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex: 0 0 auto;
        }

        .modal-actions button {
          height: 40px;
          padding: 0 0.85rem;
          border-radius: 999px;
          flex: 0 0 auto;
        }

        .modal-actions .close-btn {
          width: 40px;
          padding: 0;
          border-radius: 50%;
        }

        .modal-actions .download-btn {
          background: #d4a24c;
          color: #321;
        }

        .modal-actions .download-btn:hover {
          background: #c49340;
        }


        .sheet-tabs {
          display: inline-flex;
          gap: 0.35rem;
          background: #fff8ef;
          border: 1px solid #eadccc;
          border-radius: 999px;
          padding: 0.25rem;
          margin-bottom: 0.85rem;
          width: fit-content;
        }

        .sheet-tabs button {
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: #6b1a2c;
          padding: 0.55rem 1rem;
          font-weight: 900;
          cursor: pointer;
        }

        .sheet-tabs button.on {
          background: #6b1a2c;
          color: white;
        }

        .sheet-table {
          flex: 1 1 auto;
          width: 100%;
          height: calc(96vh - 130px);
          overflow: auto;
          border: 1px solid #e6e1dc;
          border-radius: 14px;
          background: #fff;
        }

        .sheet-table table {
          width: max-content;
          min-width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.74rem;
        }

        .sheet-table th {
          background: linear-gradient(#6b1a2c, #49101d);
          color: white;
          padding: 0.6rem 0.45rem;
          text-align: center;
          font-weight: 900;
          white-space: nowrap;
          border-right: 1px solid rgba(255, 255, 255, 0.18);
          position: sticky;
          top: 0;
          z-index: 2;
        }

        .sheet-table thead tr:nth-child(2) th {
          top: 36px;
          background: #f5dfe3;
          color: #4b0f1d;
          border-right: 1px solid #e4c9d0;
        }

        .sheet-table thead tr:first-child th:first-child,
        .sheet-table tbody td:first-child {
          position: sticky;
          left: 0;
          z-index: 3;
          width: 170px;
          min-width: 170px;
          max-width: 170px;
          text-align: left;
        }

        .sheet-table thead tr:first-child th:first-child {
          background: #6b1a2c;
        }

        .sheet-table th:not(:first-child),
        .sheet-table td:not(:first-child) {
          min-width: 54px;
        }

        .sheet-table th:nth-child(2),
        .sheet-table td:nth-child(2) {
          min-width: 48px;
        }

        .sheet-table tbody td:first-child {
          background: #f4f4f4;
        }

        .sheet-table td {
          padding: 0.56rem 0.45rem;
          border-right: 1px solid #e5e5e5;
          border-bottom: 1px solid #eee;
          text-align: center;
          white-space: nowrap;
        }

        .sheet-table tbody tr:nth-child(even) td {
          background: #fafafa;
        }

        .sheet-table tbody tr:nth-child(even) td:first-child {
          background: #efefef;
        }

        .sheet-table .player {
          color: #333;
          font-weight: 900;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sheet-table .pts {
          color: #d4a24c;
          font-weight: 900;
        }

        .sheet-table .totals td {
          background: #fff7ec !important;
          font-weight: 900;
        }

        .lineups-table th:first-child,
        .lineups-table td:first-child {
          width: 420px;
          min-width: 420px;
          max-width: 420px;
        }

        .players-table th:not(:first-child),
        .players-table td:not(:first-child) {
          min-width: 48px;
        }

        .players-table th:nth-child(3),
        .players-table td:nth-child(3) {
          min-width: 48px;
        }

        .positive {
          color: #177245;
          font-weight: 900;
        }

        .negative {
          color: #a82018;
          font-weight: 900;
        }

        .empty-line {
          text-align: center !important;
          color: #6b1a2c;
          font-weight: 900;
          padding: 1.2rem;
        }

        @media (max-width: 900px) {
          .hist-head,
          .card {
            display: flex;
            flex-direction: column;
            align-items: stretch;
          }

          .card-actions {
            width: 100%;
          }

          .card-actions button:not(.danger) {
            flex: 1;
          }

          select {
            width: 100%;
            min-width: 0;
          }

          .modal-bg {
            padding: 0.35rem;
          }

          .modal {
            width: 99vw;
            height: 98vh;
            padding: 0.65rem;
          }
        }
      `}</style>
    </div>
  );
}
