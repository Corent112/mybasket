"use client";

// app/equipes/[teamId]/page.tsx
import TeamMatchHistoryBlock from "@/components/equipes/TeamMatchHistoryBlock";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getTeam,
  saveTeam,
  upsertPlayer,
  deletePlayer,
  computeTeamKpis,
} from "../../../lib/equipes-store";
import PlayerForm from "@/components/equipes/PlayerForm";
import TeamForm from "@/components/equipes/TeamForm";
import type { Player, Team, TeamEvent } from "../../../types/player";

/* ---------- Icônes (SVG inline, trait) ---------- */
function Ic({ d, size = 18 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d.split("|").map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}
const ICONS = {
  users:
    "M17 20v-2a4 4 0 0 0-3-3.87|M7 20v-2a4 4 0 0 1 3-3.87|M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  bars: "M4 20V10|M10 20V4|M16 20v-7|M22 20H2",
  shirt: "M8 3l4 2 4-2 4 3-3 3v10H7V9L4 6z",
  trophy:
    "M8 4h8v4a4 4 0 0 1-8 0V4Z|M8 6H5a2 2 0 0 0 2 3|M16 6h3a2 2 0 0 1-2 3|M10 14h4M9 20h6M12 14v6",
  star: "M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19l1-5.8L3.5 9.1l5.9-.9L12 3Z",
  trend: "M3 17l6-6 4 4 8-8|M21 7h-4M21 7v4",
  cal: "M4 5h16v15H4zM4 9h16M8 3v4M16 3v4",
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z|M12 11v5M12 8h.01",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z|M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  building: "M4 21V5l8-3 8 3v16|M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h6",
  palette: "M12 21a9 9 0 1 1 9-9c0 2-2 3-4 3h-1a2 2 0 0 0-1 4 1 1 0 0 1-2 2Z",
  chev: "M9 6l6 6-6 6",
  filter: "M3 5h18M6 12h12M10 19h4",
  cam: "M4 7h3l2-2h6l2 2h3v12H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  pencil: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17z",
  manage:
    "M17 20v-2a4 4 0 0 0-3-3.87|M7 20v-2a4 4 0 0 1 3-3.87|M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
};

const EVENT_EMOJI: Record<string, keyof typeof ICONS> = {
  Entraînement: "bars",
  Championnat: "trophy",
  Réunion: "users",
  Tournoi: "trophy",
  "Match amical": "trophy",
  Autre: "cal",
};

type TeamMainTab = "presentation" | "training" | "stats";

type TeamDashboardData = {
  loading: boolean;
  resolvedTeamId: string;
  matches: SupaMatchRow[];
  statRows: SupaStatRow[];
  actionRows: GameActionRow[];
  attendanceRows: Array<Record<string, unknown>>;
};

function compactStrings(values: unknown[]) {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

function getTeamIdCandidates(teamId: string, team: Team | undefined) {
  const t = (team || {}) as Record<string, unknown>;

  return compactStrings([
    teamId,
    t.id,
    t.team_id,
    t.supabase_team_id,
    t.supabaseTeamId,
    t.supabase_id,
    t.supabaseId,
    t.db_id,
    t.dbId,
  ]);
}

function mostCommon(values: string[]) {
  const counts = values.reduce((acc: Record<string, number>, value) => {
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function useTeamDashboardData(
  teamId: string,
  team: Team | undefined,
): TeamDashboardData {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [resolvedTeamId, setResolvedTeamId] = useState(teamId);
  const [matches, setMatches] = useState<SupaMatchRow[]>([]);
  const [statRows, setStatRows] = useState<SupaStatRow[]>([]);
  const [actionRows, setActionRows] = useState<GameActionRow[]>([]);
  const [attendanceRows, setAttendanceRows] = useState<
    Array<Record<string, unknown>>
  >([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const candidateTeamIds = getTeamIdCandidates(teamId, team);
      const playerIds = compactStrings((team?.players || []).map((p) => p.id));

      try {
        let matchRows: SupaMatchRow[] = [];
        let playerRows: SupaStatRow[] = [];
        let linkedTeamId = candidateTeamIds[0] || teamId;

        if (candidateTeamIds.length > 0) {
          const { data: matchData, error: matchError } = await supabase
            .from("match_stats")
            .select(
              "id, team_id, opponent, match_date, us_score, them_score, result, home",
            )
            .in("team_id", candidateTeamIds)
            .order("match_date", { ascending: true });

          if (!matchError && matchData && matchData.length > 0) {
            matchRows = matchData as SupaMatchRow[];
            linkedTeamId = String(matchRows[0].team_id || linkedTeamId);
          }
        }

        const matchIdsFromMatches = matchRows
          .map((match) => match.id)
          .filter(Boolean);

        if (matchIdsFromMatches.length > 0) {
          const { data: playerDataByMatch, error: playerErrorByMatch } =
            await supabase
              .from("match_player_stats")
              .select(
                "team_id, player_id, match_id, pts, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, reb, ast, stl, blk, turnovers, pf, present",
              )
              .in("match_id", matchIdsFromMatches);

          if (!playerErrorByMatch && playerDataByMatch) {
            playerRows = playerDataByMatch as SupaStatRow[];
          }
        }

        // Fallback important : si match_stats n'utilise pas le même team_id que la fiche,
        // on repart des joueurs de l'effectif. C'est souvent le cas après une migration localStorage -> Supabase.
        if (playerRows.length === 0 && playerIds.length > 0) {
          const { data: playerDataByPlayers, error: playerErrorByPlayers } =
            await supabase
              .from("match_player_stats")
              .select(
                "team_id, player_id, match_id, pts, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, reb, ast, stl, blk, turnovers, pf, present",
              )
              .in("player_id", playerIds);

          if (
            !playerErrorByPlayers &&
            playerDataByPlayers &&
            playerDataByPlayers.length > 0
          ) {
            playerRows = playerDataByPlayers as SupaStatRow[];
            const foundTeamId = mostCommon(
              playerRows
                .map((row) => String(row.team_id || ""))
                .filter(Boolean),
            );
            if (foundTeamId) linkedTeamId = foundTeamId;
          }
        }

        // Dernier fallback : si on a trouvé un vrai team_id via les joueurs, on recharge les matchs avec cet id.
        if (matchRows.length === 0 && linkedTeamId) {
          const { data: matchDataByResolved, error: matchErrorByResolved } =
            await supabase
              .from("match_stats")
              .select(
                "id, team_id, opponent, match_date, us_score, them_score, result, home",
              )
              .eq("team_id", linkedTeamId)
              .order("match_date", { ascending: true });

          if (!matchErrorByResolved && matchDataByResolved) {
            matchRows = matchDataByResolved as SupaMatchRow[];
          }
        }


        // Fallback local : les stats live sont aussi copiées dans team.statsHistory.
        // Cela alimente la fiche même si Supabase bloque les IDs UUID ou les RLS.
        if (playerRows.length === 0 && team?.statsHistory?.length) {
          linkedTeamId = teamId;
          matchRows = team.statsHistory.map((match, index) => ({
            id: String(match.id || `local_match_${index}`),
            team_id: teamId,
            opponent: match.opponent || "Adversaire",
            match_date: match.date || null,
            us_score: safeNum(match.scoreUs),
            them_score: safeNum(match.scoreThem),
            result:
              safeNum(match.scoreUs) > safeNum(match.scoreThem)
                ? "V"
                : safeNum(match.scoreUs) < safeNum(match.scoreThem)
                  ? "D"
                  : "N",
            home: true,
          }));

          playerRows = team.statsHistory.flatMap((match, index) =>
            (match.players || []).map((line) => {
              const p2m = safeNum(line.pts2made ?? line.fg2m);
              const p2a = safeNum(line.fg2a ?? p2m + safeNum(line.pts2miss));
              const p3m = safeNum(line.pts3made ?? line.fg3m);
              const p3a = safeNum(line.fg3a ?? p3m + safeNum(line.pts3miss));
              const ftm = safeNum(line.ftMade ?? line.ftm);
              const fta = safeNum(line.fta ?? ftm + safeNum(line.ftMiss));
              const off = safeNum(line.rebOff);
              const def = safeNum(line.rebDef);
              return {
                team_id: teamId,
                player_id: String(line.playerId),
                match_id: String(match.id || `local_match_${index}`),
                pts: safeNum(line.pts) || p2m * 2 + p3m * 3 + ftm,
                p2m,
                p2a,
                p3m,
                p3a,
                ftm,
                fta,
                off_reb: off,
                def_reb: def,
                reb: safeNum(line.reb) || off + def,
                ast: safeNum(line.ast),
                stl: safeNum(line.stl),
                blk: safeNum(line.blk),
                turnovers: safeNum(line.to),
                pf: 0,
                present: line.played !== false,
              } as SupaStatRow;
            }),
          );
        }

        const matchIds = compactStrings([
          ...matchRows.map((match) => match.id),
          ...playerRows.map((row) => row.match_id),
        ]);

        // Si on a des matchs mais pas encore les lignes joueurs, recharge par match_id.
        if (playerRows.length === 0 && matchIds.length > 0) {
          const { data: playerDataByMatch, error: playerErrorByMatch } =
            await supabase
              .from("match_player_stats")
              .select(
                "team_id, player_id, match_id, pts, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, reb, ast, stl, blk, turnovers, pf, present",
              )
              .in("match_id", matchIds);

          if (!playerErrorByMatch && playerDataByMatch) {
            playerRows = playerDataByMatch as SupaStatRow[];
          }
        }

        if (!active) return;
        setResolvedTeamId(linkedTeamId || teamId);
        setMatches(matchRows);
        setStatRows(playerRows.filter((row) => row.present !== false));

        if (matchIds.length > 0) {
          const { data: actionData, error: actionError } = await supabase
            .from("match_actions")
            .select(
              "match_id, context, inbound, temps_fort, action_type, shot_type, shot_result, special_case, ft_attempts, ft_made, assist_player_id",
            )
            .in("match_id", matchIds);

          if (!active) return;
          setActionRows(
            actionError ? [] : ((actionData ?? []) as GameActionRow[]),
          );
        } else {
          setActionRows([]);
        }

        const attendanceSources = [
          "training_attendance",
          "practice_attendance",
          "event_attendance",
        ];
        let attendance: Array<Record<string, unknown>> = [];

        for (const source of attendanceSources) {
          const { data, error } = await supabase
            .from(source)
            .select("*")
            .in("team_id", compactStrings([linkedTeamId, ...candidateTeamIds]));

          if (!error && data && data.length > 0) {
            attendance = data as Array<Record<string, unknown>>;
            break;
          }
        }

        if (attendance.length === 0 && typeof window !== "undefined") {
          try {
            const adminMap = JSON.parse(window.localStorage.getItem("mybasket_management_admin") || "{}");
            const admin = adminMap?.[teamId] || adminMap?.[linkedTeamId];
            const presence = admin?.presence || {};
            attendance = Object.entries(presence).flatMap(([eventId, rows]) =>
              Object.entries((rows || {}) as Record<string, unknown>).map(([playerId, status]) => ({
                event_id: eventId,
                player_id: playerId,
                team_id: teamId,
                status,
              })),
            );
          } catch {
            attendance = [];
          }
        }

        if (!active) return;
        setAttendanceRows(attendance);
      } catch (error) {
        console.error("Erreur dashboard équipe :", error);
        if (!active) return;
        setResolvedTeamId(teamId);
        setMatches([]);
        setStatRows([]);
        setActionRows([]);
        setAttendanceRows([]);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [supabase, teamId, team?.id, team?.players]);

  return {
    loading,
    resolvedTeamId,
    matches,
    statRows,
    actionRows,
    attendanceRows,
  };
}

function getAttendancePct(
  team: Team,
  attendanceRows: Array<Record<string, unknown>>,
) {
  if (attendanceRows.length > 0) {
    const total = attendanceRows.length;
    const present = attendanceRows.filter((row) => {
      const status = String(row.status ?? row.presence ?? "").toLowerCase();
      const isPresentBoolean = row.present === true;
      return (
        isPresentBoolean ||
        status === "present" ||
        status === "présent" ||
        status === "p"
      );
    }).length;

    return total ? Math.round((present / total) * 100) : 0;
  }

  if (team.players.length > 0) {
    const total = team.players.reduce(
      (sum, player) => sum + safeNum(player.presencePct),
      0,
    );
    return Math.round(total / team.players.length);
  }

  return 0;
}

function computeLinkedKpis(team: Team, dashboard: TeamDashboardData) {
  const local = computeTeamKpis(team);
  const matches = dashboard.matches;
  const statRows = dashboard.statRows;
  const games = matches.length || local.matchsJoues;
  const wins = matches.length ? matches.filter(isWin).length : local.victoires;
  const losses = matches.length
    ? matches.filter(isLoss).length
    : local.defaites;
  const pointsAverage = matches.length
    ? Math.round(
        matches.reduce((sum, match) => sum + safeNum(match.us_score), 0) /
          matches.length,
      )
    : local.pointsMoyenne;

  let progression = local.progressionPct;

  if (matches.length >= 2) {
    const middle = Math.max(1, Math.floor(matches.length / 2));
    const first = matches.slice(0, middle);
    const last = matches.slice(middle);
    const avg = (rows: SupaMatchRow[]) =>
      rows.length
        ? rows.reduce(
            (sum, match) =>
              sum + safeNum(match.us_score) - safeNum(match.them_score),
            0,
          ) / rows.length
        : 0;
    progression = Math.round(avg(last) - avg(first));
  }

  return [
    {
      ic: "users",
      val: String(team.players.length),
      lbl: "Joueurs",
      hint: "Effectif",
    },
    {
      ic: "bars",
      val: `${getAttendancePct(team, dashboard.attendanceRows)}%`,
      lbl: "Présence moy.",
      hint: "Entraînements",
    },
    {
      ic: "shirt",
      val: String(games),
      lbl: "Matchs joués",
      hint: dashboard.matches.length ? "Supabase" : "Local",
    },
    {
      ic: "trophy",
      val: `${wins} / ${losses}`,
      lbl: "V / D",
      hint: "Résultats",
    },
    {
      ic: "star",
      val: String(pointsAverage),
      lbl: "Points moy.",
      hint: statRows.length ? "Live stats" : "Score",
    },
    {
      ic: "trend",
      val: `${progression >= 0 ? "+" : ""}${progression}`,
      lbl: "Progression",
      hint: "Diff. points",
    },
  ] as const;
}

type LivePlayerAverage = {
  games: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
};

function buildPlayerLiveAverages(statRows: SupaStatRow[]) {
  const grouped: Record<string, LivePlayerAverage> = {};

  statRows.forEach((row) => {
    const playerId = String(row.player_id || "");
    if (!playerId || row.present === false) return;

    if (!grouped[playerId]) {
      grouped[playerId] = { games: 0, pts: 0, reb: 0, ast: 0, stl: 0 };
    }

    grouped[playerId].games += 1;
    grouped[playerId].pts += safeNum(row.pts);
    grouped[playerId].reb +=
      safeNum(row.reb) || safeNum(row.off_reb) + safeNum(row.def_reb);
    grouped[playerId].ast += safeNum(row.ast);
    grouped[playerId].stl += safeNum(row.stl);
  });

  Object.keys(grouped).forEach((playerId) => {
    const line = grouped[playerId];
    if (!line.games) return;

    line.pts = r1(line.pts / line.games);
    line.reb = r1(line.reb / line.games);
    line.ast = r1(line.ast / line.games);
    line.stl = r1(line.stl / line.games);
  });

  return grouped;
}

function getLivePlayerLabel(
  player: Player,
  averages: Record<string, LivePlayerAverage>,
) {
  const live = averages[String(player.id)];

  if (live) {
    return `${live.pts} pts · ${live.reb} reb · ${live.ast} pd`;
  }

  return `${player.presencePct}% · ${player.stats.pts} pts`;
}

export default function EquipeDetailPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = use(params);
  const router = useRouter();
  const [team, setTeam] = useState<Team | undefined>();
  const [editingTeam, setEditingTeam] = useState(false);
  const [managing, setManaging] = useState(false);
  const [activeTab, setActiveTab] = useState<TeamMainTab>("presentation");
  const [playerForm, setPlayerForm] = useState<{
    open: boolean;
    player?: Player;
  }>({ open: false });
  const [toast, setToast] = useState("");
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  const dashboard = useTeamDashboardData(teamId, team);
  const livePlayerAverages = useMemo(
    () => buildPlayerLiveAverages(dashboard.statRows),
    [dashboard.statRows],
  );

  async function reload() {
    try {
      const data = await getTeam(teamId);
      setTeam(data);
    } catch (error) {
      console.error("Erreur chargement équipe:", error);
      setTeam(undefined);
    }
  }

  useEffect(() => {
    reload();
  }, [teamId]);

  function flash(m: string) {
    setToast(m);
    setTimeout(() => setToast(""), 2200);
  }

  function compress(file: File, max: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * s);
          c.height = Math.round(img.height * s);
          c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = reject;
        img.src = r.result as string;
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function changeLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !team) return;
    const logo = await compress(f, 400);
    await saveTeam({ ...team, logo });
    await reload();
    flash("Logo mis à jour ✓");
  }

  async function changeBanner(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !team) return;
    const banniere = await compress(f, 1400);
    await saveTeam({ ...team, banniere });
    await reload();
    flash("Photo d'équipe mise à jour ✓");
  }

  async function handleSaveTeam(t: Team) {
    try {
      await saveTeam(t);
      setEditingTeam(false);
      await reload();
      flash("Équipe mise à jour ✓");
    } catch (error) {
      console.error("Erreur mise à jour équipe:", error);
      alert("Erreur pendant la mise à jour de l'équipe.");
    }
  }

  async function handleSavePlayer(p: Player) {
    try {
      await upsertPlayer(teamId, p);
      setPlayerForm({ open: false });
      await reload();
      flash(p.id ? "Joueur enregistré ✓" : "Joueur ajouté ✓");
    } catch (error) {
      console.error("Erreur enregistrement joueur:", error);
      alert("Erreur pendant l'enregistrement du joueur.");
    }
  }

  async function handleDelete(p: Player, e: React.MouseEvent) {
    e.stopPropagation();

    if (!confirm(`Retirer ${p.firstName} ${p.lastName} de l'effectif ?`)) {
      return;
    }

    try {
      await deletePlayer(teamId, p.id);
      await reload();
      flash("Joueur retiré");
    } catch (error) {
      console.error("Erreur suppression joueur:", error);
      alert("Erreur pendant la suppression du joueur.");
    }
  }

  function openPlayer(p: Player) {
    if (managing) setPlayerForm({ open: true, player: p });
    else router.push(`/equipes/${teamId}/${p.id}`);
  }

  if (!team) {
    return (
      <div className="tl-wrap">
        <div className="tl-container" style={{ color: "#9a8a82" }}>
          Chargement…
        </div>
      </div>
    );
  }

  const couleurs = team.couleurs?.length
    ? team.couleurs
    : ["#7a1228", "#e0a82e"];
  const KPIS = computeLinkedKpis(team, dashboard);
  const linkedStatsTeamId = dashboard.resolvedTeamId || teamId;

  return (
    <div className="tl-wrap">
      <div className="tl-container">
        {/* ---------- HEADER ---------- */}
        <header className="tl-appbar">
          <div className="tl-logo">
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#e0a82e"
              strokeWidth="1.7"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M2 12h20M12 2c3.5 3 3.5 17 0 20M12 2c-3.5 3-3.5 17 0 20" />
            </svg>
            <span>
              <span className="my">My</span>
              <span className="basket">Basket</span>
            </span>
          </div>

          <div className="tl-appbar-right only-season">
            <span className="tl-season">
              <Ic d={ICONS.cal} size={16} /> Saison 2025/2026
            </span>
          </div>
        </header>

        {/* ---------- HERO ---------- */}
        <section className="tl-hero team-hero-linked">
          <div className="tl-floating-actions">
            <button
              className="tl-btn tl-btn-bx"
              onClick={() => setEditingTeam(true)}
            >
              <Ic d={ICONS.pencil} size={16} /> Modifier l'équipe
            </button>
            <button
              className={`tl-btn ${managing ? "tl-btn-or" : "tl-btn-ghost"}`}
              onClick={() => setManaging((v) => !v)}
            >
              <Ic d={ICONS.manage} size={16} />{" "}
              {managing ? "Terminer" : "Gérer les joueurs"}
            </button>
          </div>

          <div className="tl-hero-logo">
            {team.logo ? (
              <img src={team.logo} alt="" />
            ) : (
              <svg
                className="ball"
                width="56"
                height="56"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2c3.5 3 3.5 17 0 20M12 2c-3.5 3-3.5 17 0 20" />
              </svg>
            )}
            <button
              className="tl-cam"
              title="Changer le logo"
              onClick={() => logoRef.current?.click()}
            >
              <Ic d={ICONS.cam} size={13} />
            </button>
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              hidden
              onChange={changeLogo}
            />
          </div>

          <div className="tl-hero-content">
            <h1 className="tl-hero-name">{team.name}</h1>
            <div className="tl-hero-sub">
              {team.categorieLabel || `${team.cat}`}
              <span className="dot" style={{ background: couleurs[1] }} />
              {team.players.length} joueur{team.players.length > 1 ? "s" : ""}
              {dashboard.loading && (
                <span className="dash-loading">Synchronisation...</span>
              )}
            </div>
            <div className="tl-tags">
              {(team.tags || []).map((tg) => (
                <span key={tg} className="tl-tag">
                  {tg}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- KPI ROW : toujours visible sur tous les onglets ---------- */}
        <section className="tl-kpi-row linked-kpis">
          {KPIS.map((kpi) => (
            <div key={kpi.lbl} className="tl-kpi">
              <div className="ic">
                <Ic d={ICONS[kpi.ic]} size={22} />
              </div>
              <div className="val">{kpi.val}</div>
              <div className="lbl">{kpi.lbl}</div>
              <small>{kpi.hint}</small>
            </div>
          ))}
        </section>

        {/* ---------- ONGLETS ---------- */}
        <section className="team-tabs" aria-label="Navigation fiche équipe">
          <button
            type="button"
            className={activeTab === "presentation" ? "active" : ""}
            onClick={() => setActiveTab("presentation")}
          >
            <Ic d={ICONS.users} size={16} />
            Présentation équipe
          </button>

          <button
            type="button"
            className={activeTab === "training" ? "active" : ""}
            onClick={() => setActiveTab("training")}
          >
            <Ic d={ICONS.cal} size={16} />
            Entraînements
          </button>

          <button
            type="button"
            className={activeTab === "stats" ? "active" : ""}
            onClick={() => setActiveTab("stats")}
          >
            <Ic d={ICONS.bars} size={16} />
            Toutes les stats
          </button>
        </section>

        {activeTab === "presentation" && (
          <div className="team-tab-panel">
            {/* ---------- TEAM BANNER ---------- */}
            <section className="tl-banner">
              {team.banniere ? (
                <img src={team.banniere} alt="Photo de l'équipe" />
              ) : (
                <div className="tl-banner-empty">
                  <div className="big">📸</div>
                  <div>Ajoute une photo de ton équipe</div>
                </div>
              )}
              <button
                className="tl-cam"
                title="Changer la photo d'équipe"
                onClick={() => bannerRef.current?.click()}
              >
                <Ic d={ICONS.cam} size={13} />
              </button>
              <input
                ref={bannerRef}
                type="file"
                accept="image/*"
                hidden
                onChange={changeBanner}
              />
            </section>

            {/* ---------- EFFECTIF ---------- */}
            <section className={`tl-card ${managing ? "tl-managing" : ""}`}>
              <div className="tl-card-h">
                <span className="ic">
                  <Ic d={ICONS.users} />
                </span>
                <h2>Effectif</h2>
                <span className="right">
                  {team.players.length} joueur
                  {team.players.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="tl-roster">
                {team.players.map((p) => (
                  <div
                    key={p.id}
                    className="tl-pcard"
                    onClick={() => openPlayer(p)}
                  >
                    {managing && (
                      <button
                        className="tl-del"
                        title="Retirer"
                        onClick={(e) => handleDelete(p, e)}
                      >
                        ×
                      </button>
                    )}
                    {p.num != null && <div className="tl-pnum">#{p.num}</div>}
                    <div className="tl-pphoto">
                      {p.photo ? (
                        <img src={p.photo} alt="" />
                      ) : (
                        (p.firstName || "?").charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="tl-pname">
                      {p.firstName}
                      <br />
                      {p.lastName}
                    </div>
                    <div className="tl-pposte">{p.postePrincipal}</div>
                    <div className="tl-pstat">
                      {getLivePlayerLabel(p, livePlayerAverages)}
                    </div>
                  </div>
                ))}
                {managing && (
                  <div
                    className="tl-addtile"
                    onClick={() => setPlayerForm({ open: true })}
                  >
                    <span className="plus">+</span>
                    Ajouter un joueur
                  </div>
                )}
              </div>
            </section>

            {/* ---------- ÉVÉNEMENTS + INFOS ---------- */}
            <section className="tl-2col">
              <div className="tl-card">
                <div className="tl-card-h">
                  <span className="ic">
                    <Ic d={ICONS.cal} />
                  </span>
                  <h2>Prochains événements</h2>
                </div>
                {team.evenements?.length ? (
                  team.evenements.map((ev: TeamEvent) => (
                    <div key={ev.id} className="tl-event">
                      <div className="tl-evic">
                        <Ic
                          d={ICONS[EVENT_EMOJI[ev.type] || "cal"]}
                          size={20}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div className="ttl">{ev.titre}</div>
                        <div className="meta">
                          {ev.date}
                          {ev.heure ? ` • ${ev.heure}` : ""}
                        </div>
                        {ev.lieu && <div className="lieu">{ev.lieu}</div>}
                      </div>
                      <span className="tl-chev">
                        <Ic d={ICONS.chev} />
                      </span>
                    </div>
                  ))
                ) : (
                  <p style={{ color: "#9a8a82" }}>Aucun événement à venir.</p>
                )}
                <button className="tl-linkbtn">
                  <Ic d={ICONS.filter} size={16} /> Voir tous les événements
                </button>
              </div>

              <div className="tl-card">
                <div className="tl-card-h">
                  <span className="ic">
                    <Ic d={ICONS.info} />
                  </span>
                  <h2>Informations équipe</h2>
                </div>
                <InfoRow
                  icon={ICONS.shirt}
                  label="Catégorie"
                  value={team.categorieLabel || team.cat || ""}
                />
                <InfoRow
                  icon={ICONS.bars}
                  label="Niveau"
                  value={team.niveau || ""}
                />
                <InfoRow
                  icon={ICONS.user}
                  label="Entraîneur principal"
                  value={team.entraineurPrincipal || ""}
                />
                <InfoRow
                  icon={ICONS.users}
                  label="Assistant"
                  value={team.assistant || ""}
                />
                <InfoRow
                  icon={ICONS.building}
                  label="Salle principale"
                  value={team.sallePrincipale || ""}
                />
                <InfoRow
                  icon={ICONS.cal}
                  label="Création de l'équipe"
                  value={team.dateCreation || ""}
                />
                <div className="tl-info-row">
                  <span className="ic">
                    <Ic d={ICONS.palette} />
                  </span>
                  <span className="lbl">Couleurs</span>
                  <span className="tl-colordots">
                    {couleurs.map((c, i) => (
                      <span key={i} style={{ background: c }} />
                    ))}
                  </span>
                </div>
              </div>
            </section>

            {/* ---------- STAFF ---------- */}
            <section className="tl-card">
              <div className="tl-card-h">
                <span className="ic">
                  <Ic d={ICONS.users} />
                </span>
                <h2>Staff</h2>
              </div>
              {team.staff?.length ? (
                team.staff.map((s) => (
                  <div key={s.id} className="tl-staff-item">
                    <div className="tl-ini">
                      {s.photo ? (
                        <img
                          src={s.photo}
                          alt=""
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        `${s.prenom[0] || ""}${s.nom[0] || ""}`
                      )}
                    </div>
                    <div>
                      <div className="nm">
                        {s.prenom} {s.nom}
                      </div>
                      <span className="tl-rolepill">{s.role}</span>
                    </div>
                    <span className="tl-chev">
                      <Ic d={ICONS.chev} />
                    </span>
                  </div>
                ))
              ) : (
                <p style={{ color: "#9a8a82" }}>Aucun membre du staff.</p>
              )}
              <button className="tl-linkbtn">Voir tout le staff</button>
            </section>
          </div>
        )}

        {activeTab === "training" && (
          <div className="team-tab-panel training-panel">
            <TrainingAnalysisBlock teamId={linkedStatsTeamId} fallbackTeamId={teamId} team={team} />
          </div>
        )}

        {activeTab === "stats" && (
          <div className="team-tab-panel stats-panel">
            <LiveStatsSourceBanner dashboard={dashboard} />
            {dashboard.statRows.length === 0 && (team.statsHistory || []).length > 0 && (
              <LocalStatsFallbackPanel team={team} />
            )}
            <TeamLeadersBlock
              teamId={linkedStatsTeamId}
              players={team.players}
            />
            <TeamMatchStatsBlock teamId={linkedStatsTeamId} />
            <TeamGameStatsBlock teamId={linkedStatsTeamId} />
            <TeamLineupsBlock teamId={linkedStatsTeamId} />
            <TeamMatchHistoryBlock teamId={linkedStatsTeamId} />
            <TeamSeasonRecordsBlock teamId={linkedStatsTeamId} />
          </div>
        )}

        <div className="tl-foot">
          <hr />
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M2 12h20M12 2c3.5 3 3.5 17 0 20M12 2c-3.5 3-3.5 17 0 20" />
          </svg>
          <hr />
        </div>
      </div>

      {editingTeam && (
        <TeamForm
          team={team}
          onSave={handleSaveTeam}
          onClose={() => setEditingTeam(false)}
        />
      )}
      {playerForm.open && (
        <PlayerForm
          initial={playerForm.player}
          onSave={handleSavePlayer}
          onClose={() => setPlayerForm({ open: false })}
        />
      )}
      {toast && <div className="tl-toast">{toast}</div>}


      <style jsx>{`
        .team-hero-linked {
          position: relative;
          padding-right: 470px;
          overflow: visible;
        }

        .tl-floating-actions {
          position: absolute;
          top: 20px;
          right: 20px;
          z-index: 30;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 12px;
          flex-wrap: nowrap;
          width: 450px;
          max-width: calc(100% - 40px);
        }

        .tl-floating-actions :global(.tl-btn),
        .tl-btn {
          min-width: 205px;
          min-height: 54px;
          padding: 0 24px;
          border-radius: 999px;
          font-size: 0.92rem;
          font-weight: 950;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          cursor: pointer;
          transition:
            transform 0.18s ease,
            box-shadow 0.18s ease;
        }

        .tl-floating-actions .tl-btn:hover {
          transform: translateY(-1px);
        }

        .tl-btn-bx {
          border: 1px solid rgba(107, 26, 44, 0.18);
          background: #6b1a2c;
          color: #fff;
          box-shadow: 0 12px 28px rgba(107, 26, 44, 0.24);
        }

        .tl-btn-ghost {
          border: 1px solid rgba(107, 26, 44, 0.18);
          background: rgba(255, 255, 255, 0.94);
          color: #6b1a2c;
          box-shadow: 0 12px 28px rgba(60, 30, 20, 0.12);
          backdrop-filter: blur(10px);
        }

        .tl-btn-or {
          border: 1px solid rgba(212, 162, 76, 0.35);
          background: #d4a24c;
          color: #fff;
          box-shadow: 0 12px 28px rgba(212, 162, 76, 0.24);
        }

        .only-season {
          margin-left: auto;
        }

        .dash-loading {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.25rem 0.55rem;
          background: #fff8ef;
          color: #6b1a2c;
          font-size: 0.72rem;
          font-weight: 900;
        }

        .linked-kpis {
          position: sticky;
          top: 0;
          z-index: 15;
          background: rgba(255, 255, 255, 0.86);
          backdrop-filter: blur(12px);
          padding-top: 0.8rem;
          padding-bottom: 0.8rem;
          border-radius: 0 0 24px 24px;
        }

        .linked-kpis .tl-kpi small {
          display: block;
          margin-top: 0.25rem;
          color: #b3a49c;
          font-size: 0.68rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .team-tabs {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 22px 0 18px;
          padding: 8px;
          border: 1px solid #efe6db;
          border-radius: 999px;
          background: #fff8ef;
          width: fit-content;
          max-width: 100%;
          box-shadow: 0 12px 28px rgba(60, 30, 20, 0.05);
        }

        .team-tabs button {
          border: 0;
          border-radius: 999px;
          background: transparent;
          color: #6b1a2c;
          padding: 0.8rem 1.1rem;
          font-weight: 950;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.45rem;
          cursor: pointer;
          white-space: nowrap;
        }

        .team-tabs button.active {
          background: #6b1a2c;
          color: #fff;
          box-shadow: 0 10px 22px rgba(107, 26, 44, 0.22);
        }

        .team-tab-panel {
          animation: tabIn 0.18s ease both;
        }

        .stats-panel :global(.leaders-card) {
          margin-top: 0;
        }

        @keyframes tabIn {
          from {
            opacity: 0;
            transform: translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 980px) {
          .team-hero-linked {
            padding-right: 0;
            padding-top: 86px;
          }

          .tl-floating-actions {
            top: 16px;
            left: 16px;
            right: 16px;
            width: auto;
            max-width: none;
            justify-content: flex-start;
            flex-wrap: wrap;
          }

          .tl-floating-actions :global(.tl-btn),
          .tl-btn {
            min-width: 210px;
          }

          .team-tabs {
            width: 100%;
            border-radius: 22px;
          }

          .team-tabs button {
            flex: 1;
          }
        }

        @media (max-width: 640px) {
          .tl-floating-actions {
            position: static;
            margin-bottom: 1rem;
          }

          .team-hero-linked {
            padding-top: 1rem;
          }

          .team-tabs {
            flex-direction: column;
            border-radius: 18px;
          }

          .team-tabs button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}


/* ---------- ANALYSE DES ENTRAÎNEMENTS : liée aux séances de l'équipe ---------- */

type TrainingPeriod = "week" | "month" | "year";

type TrainingSessionItem = {
  id: string;
  category: string;
  title: string;
  minutes: number;
};

type TrainingSession = {
  id: string;
  title: string;
  date: string;
  duration: number;
  raw: Record<string, any>;
  items: TrainingSessionItem[];
};

type TrainingCategorySummary = {
  category: string;
  minutes: number;
  pct: number;
  sessions: number;
};

const TRAINING_CATEGORY_COLORS = [
  "#6b1a2c",
  "#d4a24c",
  "#111827",
  "#7f8c8d",
  "#ef4444",
  "#22a06b",
  "#1f6fb2",
  "#7c4dff",
  "#f47b20",
];

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getPeriodRange(period: TrainingPeriod, anchorDate: Date) {
  const d = new Date(anchorDate);

  if (period === "week") {
    return { start: startOfWeek(d), end: endOfWeek(d) };
  }

  if (period === "month") {
    return {
      start: new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }

  return {
    start: new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0),
    end: new Date(d.getFullYear(), 11, 31, 23, 59, 59, 999),
  };
}

function addPeriod(anchorDate: Date, period: TrainingPeriod, amount: number) {
  const d = new Date(anchorDate);

  if (period === "week") d.setDate(d.getDate() + amount * 7);
  if (period === "month") d.setMonth(d.getMonth() + amount);
  if (period === "year") d.setFullYear(d.getFullYear() + amount);

  return d;
}

function formatPeriodLabel(period: TrainingPeriod, anchorDate: Date) {
  const { start, end } = getPeriodRange(period, anchorDate);

  if (period === "week") {
    return `${start.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })} – ${end.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}`;
  }

  if (period === "month") {
    return anchorDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }

  return anchorDate.toLocaleDateString("fr-FR", { year: "numeric" });
}

function minutesToLabel(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;

  if (h && m) return `${h}h ${String(m).padStart(2, "0")}`;
  if (h) return `${h}h`;
  return `${m}min`;
}

function parseTrainingDate(row: Record<string, any>) {
  return String(
    row.session_date ||
      row.event_date ||
      row.date ||
      row.scheduled_at ||
      row.created_at ||
      "",
  );
}

function normalizeTrainingCategory(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "Autre";

  const lower = raw.toLowerCase();
  if (lower.includes("surnombre")) return "Surnombre";
  if (lower.includes("pré") || lower.includes("pre") || lower.includes("collect")) return "Pré-collectif";
  if (lower.includes("tir")) return "Tirs";
  if (lower.includes("déf") || lower.includes("def")) return "Défense";
  if (lower.includes("transition") || lower.includes("jeu rapide")) return "Transition / Jeu rapide";
  if (lower.includes("1c1") || lower.includes("1v1") || lower.includes("situation")) return "1c1 / Situations";
  if (lower.includes("dribble")) return "Dribble";
  if (lower.includes("passe")) return "Passe";
  if (lower.includes("phys")) return "Physique";
  if (lower.includes("échauff") || lower.includes("echauff")) return "Échauffement";

  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function parseTrainingMinutes(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value) return 0;

  const text = String(value).toLowerCase().replace(",", ".");
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*(min|mn|minutes?)/);

  if (hourMatch || minuteMatch) {
    return Math.round((Number(hourMatch?.[1] || 0) * 60) + Number(minuteMatch?.[1] || 0));
  }

  const n = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function getTrainingSessionTitle(row: Record<string, any>) {
  const content = readSessionContent(row);
  return String(row.title || row.titre || row.name || row.theme || row.objectif || content?.theme || "Séance");
}

function extractTrainingItems(row: Record<string, any>) {
  const content = readSessionContent(row);
  const rawItems =
    row.items ||
    row.session_items ||
    row.practice_session_items ||
    row.exercices ||
    row.exercises ||
    row.blocks ||
    content?.items ||
    content?.session_items ||
    [];

  if (Array.isArray(rawItems) && rawItems.length > 0) {
    return rawItems.map((item: any, index: number) => ({
      id: String(item?.id || `${row.id || "session"}_item_${index}`),
      category: normalizeTrainingCategory(
        item?.category ||
          item?.categorie ||
          item?.theme ||
          item?.type ||
          item?.tag ||
          item?.title ||
          item?.titre,
      ),
      title: String(item?.title || item?.titre || item?.name || `Bloc ${index + 1}`),
      minutes: parseTrainingMinutes(
        item?.duration_minutes || item?.minutes || item?.duration || item?.temps || item?.time,
      ),
    }));
  }

  const themes = Array.isArray(row.themes)
    ? row.themes
    : Array.isArray(row.tags)
      ? row.tags
      : Array.isArray(content?.themes)
        ? content.themes
        : [];

  if (themes.length > 0) {
    const total = parseTrainingMinutes(row.duration_minutes || row.duration || row.temps || row.total_minutes || content?.total_minutes || content?.duration_minutes);
    const split = total ? Math.round(total / themes.length) : 0;

    return themes.map((theme: unknown, index: number) => ({
      id: `${row.id || "session"}_theme_${index}`,
      category: normalizeTrainingCategory(theme),
      title: String(theme || `Bloc ${index + 1}`),
      minutes: split,
    }));
  }

  const category = normalizeTrainingCategory(row.category || row.categorie || row.theme || row.type || row.objectif || content?.theme);

  return [
    {
      id: `${row.id || "session"}_main`,
      category,
      title: getTrainingSessionTitle(row),
      minutes: parseTrainingMinutes(row.duration_minutes || row.duration || row.temps || row.total_minutes || content?.total_minutes || content?.duration_minutes),
    },
  ];
}

function normalizeTrainingSession(row: Record<string, any>): TrainingSession {
  const content = readSessionContent(row);
  const items = extractTrainingItems(row);
  const rawDuration = parseTrainingMinutes(row.duration_minutes || row.duration || row.temps || row.total_minutes || content?.total_minutes || content?.duration_minutes);
  const itemsDuration = items.reduce(
    (sum: number, item: TrainingSessionItem) => sum + item.minutes,
    0
  );
  const duration = rawDuration || itemsDuration;

  const finalItems = items.map((item: TrainingSessionItem) => ({
    ...item,
    minutes: item.minutes || (items.length ? Math.round(duration / items.length) : duration),
  }));

  return {
    id: String(row.id || crypto.randomUUID()),
    title: getTrainingSessionTitle(row),
    date: parseTrainingDate(row),
    duration,
    raw: row,
    items: finalItems,
  };
}

function sessionIsInRange(session: TrainingSession, start: Date, end: Date) {
  const d = new Date(session.date);
  if (Number.isNaN(d.getTime())) return false;
  return d >= start && d <= end;
}

function buildTrainingSummary(sessions: TrainingSession[]) {
  const totalMinutes = sessions.reduce((sum, session) => sum + session.duration, 0);
  const categoryMap = new Map<string, { minutes: number; sessionIds: Set<string> }>();

  sessions.forEach((session) => {
    session.items.forEach((item) => {
      const category = normalizeTrainingCategory(item.category);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, { minutes: 0, sessionIds: new Set() });
      }
      const entry = categoryMap.get(category)!;
      entry.minutes += item.minutes;
      entry.sessionIds.add(session.id);
    });
  });

  return Array.from(categoryMap.entries())
    .map<TrainingCategorySummary>(([category, entry]) => ({
      category,
      minutes: Math.round(entry.minutes),
      pct: totalMinutes ? Math.round((entry.minutes / totalMinutes) * 1000) / 10 : 0,
      sessions: entry.sessionIds.size,
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

function TrainingDonut({ rows, totalMinutes }: { rows: TrainingCategorySummary[]; totalMinutes: number }) {
  let offset = 0;
  const radius = 48;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="training-donut-wrap">
      <svg viewBox="0 0 140 140" className="training-donut" aria-label="Répartition des entraînements">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#f1e8dd" strokeWidth="22" />
        {rows.map((row, index) => {
          const dash = totalMinutes ? (row.minutes / totalMinutes) * circumference : 0;
          const strokeDasharray = `${dash} ${circumference - dash}`;
          const strokeDashoffset = -offset;
          offset += dash;

          return (
            <circle
              key={row.category}
              cx="70"
              cy="70"
              r={radius}
              fill="none"
              stroke={TRAINING_CATEGORY_COLORS[index % TRAINING_CATEGORY_COLORS.length]}
              strokeWidth="22"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="butt"
              transform="rotate(-90 70 70)"
            />
          );
        })}
      </svg>

      <div className="training-donut-center">
        <strong>{minutesToLabel(totalMinutes)}</strong>
        <span>Total</span>
      </div>
    </div>
  );
}

function isUuidValue(value: string | null | undefined) {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value)
  );
}

function readSessionContent(row: Record<string, any>) {
  const direct = row.session_content || row.content_json || row.content;

  if (!direct) {
    try {
      const parsedNotes = typeof row.notes === "string" ? JSON.parse(row.notes) : row.notes;
      return parsedNotes && typeof parsedNotes === "object" ? parsedNotes : null;
    } catch {
      return null;
    }
  }

  if (typeof direct === "string") {
    try {
      return JSON.parse(direct);
    } catch {
      return null;
    }
  }

  return direct;
}


function getSessionSavedHtml(session: TrainingSession) {
  const raw = session.raw || {};
  const content = readSessionContent(raw) || {};
  return String(raw.pdf_html || raw.pdfHtml || content.pdf_html || content.pdfHtml || "");
}

type Html2PdfWorker = {
  set: (options: Record<string, unknown>) => Html2PdfWorker;
  from: (source: HTMLElement | string) => Html2PdfWorker;
  outputPdf: (type: "blob") => Promise<Blob>;
  save: (filename?: string) => Promise<void>;
};

type Html2PdfFactory = () => Html2PdfWorker;

declare global {
  interface Window {
    html2pdf?: Html2PdfFactory;
  }
}

function safeFileName(value: string) {
  return String(value || "fiche-seance")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function htmlForPdf(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/window\.print\(\)/g, "");
}

function htmlForPreview(html: string) {
  const extra = `
    <style>
      html,body{max-width:100%!important;overflow-x:hidden!important;background:#fff!important;}
      .page{width:100%!important;max-width:1120px!important;min-height:auto!important;margin:0 auto!important;}
      img{max-width:100%;}
    </style>
  `;

  if (html.includes("</head>")) return html.replace("</head>", `${extra}</head>`);
  return `${extra}${html}`;
}

async function loadHtml2Pdf() {
  if (typeof window === "undefined") {
    throw new Error("Génération PDF disponible uniquement dans le navigateur.");
  }

  if (window.html2pdf) return window.html2pdf;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-html2pdf]");

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Chargement html2pdf impossible.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    script.async = true;
    script.dataset.html2pdf = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Chargement html2pdf impossible."));
    document.head.appendChild(script);
  });

  if (!window.html2pdf) throw new Error("html2pdf n'est pas disponible.");
  return window.html2pdf;
}

async function createPdfBlobFromHtml(html: string) {
  const html2pdf = await loadHtml2Pdf();
  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "0";
  holder.style.width = "1120px";
  holder.innerHTML = htmlForPdf(html);
  document.body.appendChild(holder);

  try {
    const page = holder.querySelector<HTMLElement>(".page") || holder;
    return await html2pdf()
      .set({
        margin: 0,
        filename: "fiche-seance.pdf",
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        jsPDF: { unit: "px", format: [1120, 790], orientation: "landscape" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      })
      .from(page)
      .outputPdf("blob");
  } finally {
    holder.remove();
  }
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadFileFromUrl(url: string, filename: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Téléchargement impossible.");
  const blob = await response.blob();
  downloadBlob(filename, blob);
}

function TrainingAnalysisBlock({
  teamId,
  fallbackTeamId,
  team,
}: {
  teamId: string;
  fallbackTeamId: string;
  team: Team;
}) {
  const supabase = createClient();
  const [period, setPeriod] = useState<TrainingPeriod>("week");
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null);
  const [sessionPreviewHtml, setSessionPreviewHtml] = useState<string | null>(null);

  const teamIdCandidates = useMemo(() => getTeamIdCandidates(fallbackTeamId, team), [fallbackTeamId, team]);

  async function loadSessions() {
    setLoading(true);

    try {
      const candidateIds = compactStrings([teamId, fallbackTeamId, ...teamIdCandidates]);
      const uuidCandidateIds = candidateIds.filter(isUuidValue);
      let rows: Record<string, any>[] = [];

      const queryAttempts: Array<{ column: string; ids: string[] }> = [
        { column: "team_local_id", ids: candidateIds },
        { column: "team_id", ids: uuidCandidateIds },
        { column: "equipe_id", ids: candidateIds },
        { column: "associated_team_id", ids: candidateIds },
        { column: "club_team_id", ids: candidateIds },
      ].filter((attempt) => attempt.ids.length > 0);

      for (const attempt of queryAttempts) {
        const { data, error } = await supabase
          .from("practice_sessions")
          .select("*")
          .in(attempt.column, attempt.ids)
          .order("session_date", { ascending: false });

        if (!error && data && data.length > 0) {
          rows = data as Record<string, any>[];
          break;
        }
      }

      // Fallback owner : récupère les séances privées du coach puis filtre côté client
      // avec team_local_id, team_id, notes JSON ou session_content.
      if (rows.length === 0) {
        const { data: userData } = await supabase.auth.getUser();
        const ownerId = userData.user?.id;

        if (ownerId) {
          const { data, error } = await supabase
            .from("practice_sessions")
            .select("*")
            .or(`owner_id.eq.${ownerId},user_id.eq.${ownerId}`)
            .order("session_date", { ascending: false });

          if (!error && data) {
            rows = (data as Record<string, any>[]).filter((row) => {
              const content = readSessionContent(row);
              const possibleIds = compactStrings([
                row.team_id,
                row.team_local_id,
                row.teamId,
                row.equipe_id,
                row.equipeId,
                content?.team_local_id,
                content?.team_id,
                content?.team?.id,
              ]);

              return possibleIds.some((value) => candidateIds.includes(value));
            });
          }
        }
      }

      const sessionIds = rows.map((row) => String(row.id || "")).filter(Boolean);
      let itemRows: Record<string, any>[] = [];

      if (sessionIds.length > 0) {
        for (const table of ["practice_session_items", "session_items"]) {
          const { data, error } = await supabase
            .from(table)
            .select("*")
            .in("session_id", sessionIds)
            .order("sort_order", { ascending: true });

          if (!error && data && data.length > 0) {
            itemRows = data as Record<string, any>[];
            break;
          }
        }
      }

      if (itemRows.length > 0) {
        const bySession = itemRows.reduce((acc: Record<string, any[]>, item) => {
          const sessionId = String(item.session_id || item.practice_session_id || "");
          if (!sessionId) return acc;
          if (!acc[sessionId]) acc[sessionId] = [];
          acc[sessionId].push(item);
          return acc;
        }, {});

        rows = rows.map((row) => {
          const content = readSessionContent(row);

          return {
            ...row,
            session_content: content || row.session_content,
            items:
              bySession[String(row.id)] ||
              row.items ||
              content?.items ||
              content?.session_items ||
              [],
          };
        });
      } else {
        rows = rows.map((row) => {
          const content = readSessionContent(row);
          return {
            ...row,
            session_content: content || row.session_content,
            items: row.items || content?.items || content?.session_items || [],
            duration_minutes:
              row.duration_minutes ||
              row.total_minutes ||
              content?.total_minutes ||
              content?.duration_minutes,
          };
        });
      }

      if (rows.length === 0 && typeof window !== "undefined") {
        const keys = ["mybasket_team_practice_sessions", "mybasket_sessions", "mybasket_seances", "practice_sessions"];
        for (const key of keys) {
          try {
            const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
            if (Array.isArray(parsed) && parsed.length > 0) {
              rows = parsed.filter((row: any) => {
                const content = readSessionContent(row) || {};
                const possibleIds = compactStrings([
                  row.team_id,
                  row.teamId,
                  row.team_local_id,
                  row.equipe_id,
                  row.equipeId,
                  content.team_local_id,
                  content.team_id,
                  content.team?.id,
                ]);
                return possibleIds.some((value) => candidateIds.includes(value));
              });
              if (rows.length > 0) break;
            }
          } catch {}
        }
      }

      setSessions(rows.map(normalizeTrainingSession));
    } catch (error) {
      console.error("Erreur chargement séances équipe :", error);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSessions();
  }, [teamId, fallbackTeamId, teamIdCandidates.join("|")]);

  const range = useMemo(() => getPeriodRange(period, anchorDate), [period, anchorDate]);
  const periodSessions = useMemo(
    () => sessions.filter((session) => sessionIsInRange(session, range.start, range.end)),
    [sessions, range.start, range.end],
  );
  const totalMinutes = useMemo(
    () => periodSessions.reduce((sum, session) => sum + session.duration, 0),
    [periodSessions],
  );
  const summary = useMemo(() => buildTrainingSummary(periodSessions), [periodSessions]);

  async function deleteSession(session: TrainingSession) {
    if (!confirm(`Supprimer la séance "${session.title}" ?`)) return;

    const { error } = await supabase.from("practice_sessions").delete().eq("id", session.id);

    if (error) {
      console.error("Erreur suppression séance :", error);
      alert("Impossible de supprimer cette séance. Vérifie les droits Supabase/RLS.");
      return;
    }

    setSessions((prev) => prev.filter((item) => item.id !== session.id));
    setSelectedSession(null);
  }

  function buildSessionDocumentHtml(session: TrainingSession, shouldPrint = false) {
    const savedHtml = getSessionSavedHtml(session);
    if (savedHtml) {
      if (!shouldPrint) return savedHtml;
      return savedHtml.includes("</body>")
        ? savedHtml.replace("</body>", `<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script></body>`)
        : `${savedHtml}<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>`;
    }

    const itemsRows = session.items
      .map(
        (item) => `
          <tr>
            <td>${item.category}</td>
            <td><strong>${item.title}</strong></td>
            <td>${minutesToLabel(item.minutes)}</td>
          </tr>
        `,
      )
      .join("");

    return `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${session.title}</title>
          <style>
            *{box-sizing:border-box}
            body{margin:0;background:#f7f2eb;font-family:Arial,sans-serif;color:#1f171a}
            .page{width:1120px;min-height:790px;margin:0 auto;background:white;padding:28px}
            .header{display:grid;grid-template-columns:120px 1fr 120px;align-items:center;border-bottom:3px solid #111;padding-bottom:18px}
            .logo{width:96px;height:74px;display:grid;place-items:center;border:2px solid #eadccc;border-radius:16px;color:#6b1a2c;font-weight:900}
            .title{text-align:center}.title h1{margin:0 0 10px;color:#6b1a2c;font-size:40px;letter-spacing:4px;text-transform:uppercase}.title p{margin:4px 0;color:#6f625d;text-transform:uppercase;font-weight:800;font-size:13px}
            .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:22px 0}.box{border:1px solid #eadccc;border-radius:16px;padding:14px;background:#fff8ef}.box span{display:block;color:#9a8a82;text-transform:uppercase;font-size:11px;font-weight:900}.box b{display:block;color:#1f171a;font-size:20px;margin-top:4px}
            table{width:100%;border-collapse:collapse;border:2px solid #111;margin-top:18px}th{background:#f8f1e8;color:#6b1a2c;text-transform:uppercase;font-size:12px;letter-spacing:1px}th,td{border:1px solid #e4d7c7;padding:13px;text-align:left}td:nth-child(3){font-weight:900;color:#6b1a2c}
            .footer{margin-top:18px;text-align:center;color:#9a8a82;font-size:12px;text-transform:uppercase;letter-spacing:1px}
            .actions{position:sticky;top:0;background:#fff;padding:12px;text-align:right;border-bottom:1px solid #eadccc}.actions button{border:0;border-radius:999px;background:#6b1a2c;color:white;font-weight:900;padding:12px 18px;cursor:pointer;margin-left:8px}
            @media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.actions{display:none}.page{width:100%;margin:0;padding:10mm}}
          </style>
        </head>
        <body>
          <div class="actions"><button onclick="window.print()">Télécharger / imprimer en PDF</button></div>
          <div class="page">
            <div class="header">
              <div class="logo">MyBasket</div>
              <div class="title">
                <h1>Practice Plan</h1>
                <p><strong>Équipe :</strong> ${team.name}</p>
                <p><strong>Date :</strong> ${formatMatchDate(session.date)}</p>
              </div>
              <div class="logo">Club</div>
            </div>
            <div class="summary">
              <div class="box"><span>Séance</span><b>${session.title}</b></div>
              <div class="box"><span>Durée totale</span><b>${minutesToLabel(session.duration)}</b></div>
              <div class="box"><span>Blocs</span><b>${session.items.length}</b></div>
              <div class="box"><span>Date</span><b>${formatMatchDate(session.date)}</b></div>
            </div>
            <table>
              <thead><tr><th>Catégorie</th><th>Bloc travaillé</th><th>Durée</th></tr></thead>
              <tbody>${itemsRows}</tbody>
            </table>
            <div class="footer">${team.name} · Fiche séance générée avec MyBasket</div>
          </div>
          ${shouldPrint ? `<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script>` : ""}
        </body>
      </html>
    `;
  }

  function printHtmlWithoutPopup(html: string) {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => iframe.remove(), 1200);
    }, 350);
  }

  function openSessionDocument(session: TrainingSession, shouldPrint = false) {
    const pdfUrl = String(session.raw?.pdf_url || session.raw?.pdfUrl || "");
    const html = buildSessionDocumentHtml(session, shouldPrint);

    if (pdfUrl && !shouldPrint) {
      setSessionPreviewHtml(`<iframe src="${pdfUrl}" style="width:100%;height:100%;border:0"></iframe>`);
      return;
    }

    if (shouldPrint) {
      printHtmlWithoutPopup(html);
      return;
    }

    setSessionPreviewHtml(htmlForPreview(html));
  }

  function viewSession(session: TrainingSession) {
    if (typeof window === "undefined") return;

    const url = `/seances/apercu/${encodeURIComponent(session.id)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function downloadSession(session: TrainingSession) {
    const pdfUrl = String(session.raw?.pdf_url || session.raw?.pdfUrl || session.raw?.attachment_url || "");
    const filename = `${safeFileName(`${team.name}-${session.title}`)}.pdf`;

    try {
      if (pdfUrl) {
        await downloadFileFromUrl(pdfUrl, filename);
        return;
      }

      const html = buildSessionDocumentHtml(session, false);
      const pdfBlob = await createPdfBlobFromHtml(html);
      downloadBlob(filename, pdfBlob);
    } catch (error) {
      console.error("Téléchargement PDF séance impossible:", error);
      alert("Impossible de télécharger le PDF. Essaie avec le bouton Imprimer > Enregistrer en PDF.");
    }
  }

  function printSession(session: TrainingSession) {
    openSessionDocument(session, true);
  }

  return (
    <section className="tl-card training-card">
      <div className="training-head">
        <div>
          <p className="eyebrow">Suivi automatique</p>
          <h2>Analyse des entraînements</h2>
          <p className="muted">Toutes les données sont calculées depuis les séances générées et liées à cette équipe.</p>
        </div>
        <button className="tl-btn tl-btn-bx training-refresh-btn" type="button" onClick={loadSessions}>↻ Actualiser</button>
      </div>

      <div className="training-periodbar">
        <div className="period-buttons">
          <button className={period === "week" ? "on" : ""} onClick={() => setPeriod("week")}>Semaine</button>
          <button className={period === "month" ? "on" : ""} onClick={() => setPeriod("month")}>Mois</button>
          <button className={period === "year" ? "on" : ""} onClick={() => setPeriod("year")}>Année</button>
        </div>
        <div className="period-nav">
          <button onClick={() => setAnchorDate((d) => addPeriod(d, period, -1))}>‹</button>
          <strong>{formatPeriodLabel(period, anchorDate)}</strong>
          <button onClick={() => setAnchorDate((d) => addPeriod(d, period, 1))}>›</button>
        </div>
        <div className="training-total">
          <span>Durée totale</span>
          <b>{minutesToLabel(totalMinutes)}</b>
          <em>{periodSessions.length} séance{periodSessions.length > 1 ? "s" : ""}</em>
        </div>
      </div>

      {loading ? (
        <div className="empty">Chargement des séances...</div>
      ) : periodSessions.length === 0 ? (
        <div className="empty">Aucune séance liée à cette équipe sur cette période.</div>
      ) : (
        <>
          <div className="training-grid">
            <div className="training-donut-card">
              <h3>Répartition par catégorie</h3>
              <div className="training-donut-layout">
                <TrainingDonut rows={summary} totalMinutes={totalMinutes} />
                <div className="training-legend">
                  {summary.map((row, index) => (
                    <div key={row.category} className="legend-line">
                      <span style={{ background: TRAINING_CATEGORY_COLORS[index % TRAINING_CATEGORY_COLORS.length] }} />
                      <strong>{row.category}</strong>
                      <b>{row.pct}%</b>
                      <em>{minutesToLabel(row.minutes)}</em>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="training-sessions-card">
              <h3>Séances de la période</h3>
              <div className="training-session-list">
                {periodSessions.map((session) => (
                  <button key={session.id} className="training-session-row" onClick={() => setSelectedSession(session)}>
                    <span>{formatMatchDate(session.date)}</span>
                    <strong>{session.title}</strong>
                    <em>{minutesToLabel(session.duration)}</em>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="training-table-wrap">
            <h3>Récapitulatif détaillé</h3>
            <table className="training-table">
              <thead>
                <tr>
                  <th>Catégorie</th>
                  <th>Durée</th>
                  <th>Pourcentage</th>
                  <th>Nombre de séances</th>
                  <th>Durée moyenne / séance</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((row, index) => (
                  <tr key={row.category}>
                    <td><span className="dot" style={{ background: TRAINING_CATEGORY_COLORS[index % TRAINING_CATEGORY_COLORS.length] }} />{row.category}</td>
                    <td>{minutesToLabel(row.minutes)}</td>
                    <td><span className="bar"><i style={{ width: `${Math.min(100, row.pct)}%`, background: TRAINING_CATEGORY_COLORS[index % TRAINING_CATEGORY_COLORS.length] }} /></span>{row.pct}%</td>
                    <td>{row.sessions}</td>
                    <td>{minutesToLabel(row.sessions ? row.minutes / row.sessions : 0)}</td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>Total</td>
                  <td>{minutesToLabel(totalMinutes)}</td>
                  <td>100%</td>
                  <td>{periodSessions.length}</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedSession && (
        <div className="training-modal-backdrop" onClick={() => setSelectedSession(null)}>
          <div className="training-modal" onClick={(e) => e.stopPropagation()}>
            <div className="training-modal-head">
              <div>
                <h3>{selectedSession.title}</h3>
                <p>{formatMatchDate(selectedSession.date)} · {minutesToLabel(selectedSession.duration)}</p>
              </div>
              <button onClick={() => setSelectedSession(null)}>×</button>
            </div>

            <table className="training-table compact">
              <thead><tr><th>Catégorie</th><th>Bloc</th><th>Durée</th></tr></thead>
              <tbody>
                {selectedSession.items.map((item) => (
                  <tr key={item.id}><td>{item.category}</td><td>{item.title}</td><td>{minutesToLabel(item.minutes)}</td></tr>
                ))}
              </tbody>
            </table>

            <div className="training-modal-actions">
              <button onClick={() => viewSession(selectedSession)}>Visualiser</button>
              <button onClick={() => downloadSession(selectedSession)}>Télécharger PDF</button>
              <button onClick={() => printSession(selectedSession)}>Imprimer</button>
              <button className="danger" onClick={() => deleteSession(selectedSession)}>Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {sessionPreviewHtml && (
        <div className="training-modal-backdrop" onClick={() => setSessionPreviewHtml(null)}>
          <div className="training-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="training-modal-head">
              <div>
                <h3>Fiche séance</h3>
                <p>Visualisation complète sans popup</p>
              </div>
              <button onClick={() => setSessionPreviewHtml(null)}>×</button>
            </div>
            <iframe title="Fiche séance" srcDoc={sessionPreviewHtml} />
          </div>
        </div>
      )}


      <style jsx>{`
        .training-card{margin-top:1.2rem}.training-refresh-btn{min-width:205px!important;min-height:54px!important;padding:0 24px!important;font-size:.92rem!important;box-shadow:0 12px 28px rgba(107,26,44,.24)!important}.training-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:1rem}.eyebrow{margin:0;color:#d4a24c;font-size:.78rem;font-weight:900;text-transform:uppercase;letter-spacing:.06em}h2{margin:.15rem 0 0;color:#6b1a2c;font-size:1.55rem;font-weight:950}.muted{margin:.25rem 0 0;color:#9a8a82;font-weight:700}.training-periodbar{display:grid;grid-template-columns:auto 1fr auto;gap:1rem;align-items:center;border:1px solid #efe6db;background:#fff8ef;border-radius:22px;padding:.9rem;margin-bottom:1rem}.period-buttons{display:flex;gap:.45rem}.period-buttons button,.period-nav button{border:1px solid #eadccc;background:#fff;color:#6b1a2c;border-radius:12px;padding:.65rem .9rem;font-weight:950;cursor:pointer}.period-buttons button.on{background:#6b1a2c;color:#fff;border-color:#6b1a2c}.period-nav{display:flex;align-items:center;justify-content:center;gap:.65rem;color:#24171b}.period-nav strong{text-transform:capitalize}.training-total{display:flex;flex-direction:column;align-items:flex-end}.training-total span,.training-total em{color:#9a8a82;font-size:.8rem;font-weight:900;text-transform:uppercase}.training-total b{font-size:1.35rem;color:#1f171a}.training-grid{display:grid;grid-template-columns:1.25fr .85fr;gap:1rem}.training-donut-card,.training-sessions-card,.training-table-wrap{border:1px solid #efe6db;border-radius:20px;background:#fff;padding:1rem;box-shadow:0 10px 24px rgba(60,30,20,.045)}.training-donut-card h3,.training-sessions-card h3,.training-table-wrap h3{margin:0 0 .9rem;color:#6b1a2c}.training-donut-layout{display:grid;grid-template-columns:280px 1fr;gap:1rem;align-items:center}.training-donut-wrap{position:relative;width:260px;height:260px;display:grid;place-items:center}.training-donut{width:260px;height:260px}.training-donut-center{position:absolute;text-align:center}.training-donut-center strong{display:block;color:#1f171a;font-size:1.7rem}.training-donut-center span{color:#9a8a82;font-weight:900}.training-legend{display:flex;flex-direction:column;gap:.55rem}.legend-line{display:grid;grid-template-columns:12px 1fr auto auto;gap:.65rem;align-items:center;padding:.55rem 0;border-bottom:1px solid #f0e7dc}.legend-line span,.training-table .dot{width:10px;height:10px;border-radius:999px;display:inline-block}.legend-line strong{color:#1f171a}.legend-line b{color:#6b1a2c}.legend-line em{color:#9a8a82;font-style:normal;font-weight:800}.training-session-list{display:flex;flex-direction:column;gap:.5rem;max-height:320px;overflow:auto}.training-session-row{display:grid;grid-template-columns:90px 1fr auto;gap:.65rem;align-items:center;text-align:left;border:1px solid #efe6db;background:#fff;border-radius:14px;padding:.75rem;cursor:pointer}.training-session-row:hover{border-color:#d4a24c;box-shadow:0 8px 18px rgba(60,30,20,.06)}.training-session-row span{color:#9a8a82;font-weight:900}.training-session-row strong{color:#1f171a}.training-session-row em{font-style:normal;color:#6b1a2c;font-weight:950}.training-table-wrap{margin-top:1rem;overflow:auto}.training-table{width:100%;border-collapse:collapse;font-size:.9rem}.training-table th{background:#fff8ef;color:#6b1a2c;text-align:left;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}.training-table th,.training-table td{padding:.8rem;border-bottom:1px solid #f0e7dc}.training-table td:first-child{font-weight:900;color:#1f171a}.training-table .dot{margin-right:.5rem;vertical-align:middle}.bar{display:inline-flex;width:88px;height:8px;border-radius:999px;background:#f1e8dd;margin-right:.55rem;overflow:hidden}.bar i{display:block;height:100%;border-radius:999px}.total-row td{font-weight:950;background:#fffdf9}.empty{padding:1.2rem;border:1px dashed #eadccc;border-radius:18px;background:#fffdf9;color:#9a8a82;font-weight:900}.training-modal-backdrop{position:fixed;inset:0;z-index:1000;background:rgba(17,24,39,.45);display:grid;place-items:center;padding:1rem}.training-modal{width:min(760px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:24px;padding:1.2rem;box-shadow:0 24px 80px rgba(0,0,0,.3)}.training-preview-modal{width:min(1240px,96vw);height:92vh;background:#fff;border-radius:24px;padding:1.2rem;box-shadow:0 24px 80px rgba(0,0,0,.3);display:flex;flex-direction:column}.training-preview-modal iframe{flex:1;width:100%;border:1px solid #eadccc;border-radius:16px;background:#fff;min-height:0} .training-modal-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:1rem}.training-modal-head h3{margin:0;color:#6b1a2c;font-size:1.4rem}.training-modal-head p{margin:.2rem 0 0;color:#9a8a82;font-weight:800}.training-modal-head button{border:0;background:#6b1a2c;color:#fff;width:34px;height:34px;border-radius:999px;font-size:1.3rem;cursor:pointer}.training-table.compact th,.training-table.compact td{padding:.65rem}.training-modal-actions{display:flex;justify-content:flex-end;gap:.6rem;margin-top:1rem}.training-modal-actions button{border:1px solid #eadccc;background:#fff;color:#6b1a2c;border-radius:999px;padding:.7rem 1rem;font-weight:950;cursor:pointer}.training-modal-actions .danger{background:#fee2e2;border-color:#fecaca;color:#b91c1c}@media(max-width:1050px){.training-periodbar,.training-grid,.training-donut-layout{grid-template-columns:1fr}.training-total{align-items:flex-start}.training-donut-wrap{margin:auto}}@media(max-width:640px){.training-head{flex-direction:column}.period-buttons{flex-wrap:wrap}.training-session-row{grid-template-columns:1fr}.training-modal-actions{flex-direction:column}.training-modal-actions button{width:100%}}
      `}</style>
    </section>
  );
}

/* ---------- BLOCS STATS FICHE ÉQUIPE : intégrés dans ce fichier pour éviter les erreurs d'import ---------- */

type SupaStatRow = {
  team_id?: string | null;
  player_id?: string | null;
  match_id?: string | null;
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

type SupaMatchRow = {
  id: string;
  team_id?: string | null;
  opponent: string | null;
  match_date: string | null;
  us_score: number | null;
  them_score: number | null;
  result?: string | null;
  home: boolean | null;
};

function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");

  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();

  URL.revokeObjectURL(a.href);
}

const safeNum = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const r1 = (value: number) => Math.round(value * 10) / 10;

const pctText = (made: number, attempted: number) =>
  attempted ? `${r1((made / attempted) * 100)}%` : "0%";

function formatMatchDate(value: string | null) {
  if (!value) return "—";

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/* ---------- 1. LEADERS ---------- */

type LeaderLine = {
  playerId: string;
  name: string;
  games: number;
  pts: number;
  ast: number;
  reb: number;
  stl: number;
  p3m: number;
  p3a: number;
};

type LeaderCategory = {
  key: "pts" | "ast" | "reb" | "p3pct" | "stl";
  title: string;
  icon: string;
  suffix?: string;
  type: "average" | "percent";
};

const LEADER_CATEGORIES: LeaderCategory[] = [
  { key: "pts", title: "Points", icon: "🏀", type: "average" },
  { key: "ast", title: "Passes", icon: "🎯", type: "average" },
  { key: "reb", title: "Rebonds", icon: "💪", type: "average" },
  { key: "p3pct", title: "% 3PTS", icon: "🔥", type: "percent", suffix: "%" },
  { key: "stl", title: "Interceptions", icon: "🖐️", type: "average" },
];

function playerDisplayName(player: Player) {
  const num = player.num != null ? `#${player.num} ` : "";
  return (
    `${num}${player.firstName || ""} ${player.lastName || ""}`.trim() ||
    "Joueur"
  );
}

function fallbackLeaders(players: Player[]): LeaderLine[] {
  return players.map((player) => ({
    playerId: String(player.id),
    name: playerDisplayName(player),
    games: 1,
    pts: safeNum(player.stats?.pts),
    ast: safeNum(player.stats?.ast),
    reb: safeNum(player.stats?.reb),
    stl: safeNum(player.stats?.stl),
    p3m: safeNum(player.stats?.pct3pts),
    p3a: safeNum(player.stats?.pct3pts) > 0 ? 100 : 0,
  }));
}

function aggregateLeaderRows(
  rows: SupaStatRow[],
  names: Record<string, string>,
): LeaderLine[] {
  const map: Record<string, LeaderLine> = {};

  rows
    .filter((row) => row.present !== false)
    .forEach((row) => {
      const id = String(row.player_id || "");
      if (!id) return;

      if (!map[id]) {
        map[id] = {
          playerId: id,
          name: names[id] || `Joueur ${id.slice(0, 8)}`,
          games: 0,
          pts: 0,
          ast: 0,
          reb: 0,
          stl: 0,
          p3m: 0,
          p3a: 0,
        };
      }

      map[id].games += 1;
      map[id].pts +=
        safeNum(row.pts) ||
        safeNum(row.p2m) * 2 + safeNum(row.p3m) * 3 + safeNum(row.ftm);
      map[id].ast += safeNum(row.ast);
      map[id].reb +=
        safeNum(row.reb) || safeNum(row.off_reb) + safeNum(row.def_reb);
      map[id].stl += safeNum(row.stl);
      map[id].p3m += safeNum(row.p3m);
      map[id].p3a += safeNum(row.p3a);
    });

  return Object.values(map);
}

function leaderMetric(line: LeaderLine, category: LeaderCategory) {
  if (category.key === "p3pct") {
    return line.p3a > 0 ? (line.p3m / line.p3a) * 100 : 0;
  }

  const value = line[category.key];
  return line.games ? value / line.games : 0;
}

function getTop3(lines: LeaderLine[], category: LeaderCategory) {
  return [...lines]
    .filter((line) => category.key !== "p3pct" || line.p3a >= 3)
    .sort((a, b) => leaderMetric(b, category) - leaderMetric(a, category))
    .slice(0, 3);
}

function TeamLeadersBlock({
  teamId,
  players,
}: {
  teamId: string;
  players: Player[];
}) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [leaders, setLeaders] = useState<LeaderLine[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const localNames = players.reduce(
        (acc: Record<string, string>, player) => {
          acc[String(player.id)] = playerDisplayName(player);
          return acc;
        },
        {},
      );

      const { data: matchData } = await supabase
        .from("match_stats")
        .select("id")
        .eq("team_id", teamId);

      const matchIds = ((matchData ?? []) as Array<{ id: string }>).map(
        (match) => match.id,
      );

      let rows: SupaStatRow[] = [];

      if (matchIds.length > 0) {
        const { data: byMatch } = await supabase
          .from("match_player_stats")
          .select(
            "player_id, match_id, pts, p2m, p3m, ftm, p3a, off_reb, def_reb, reb, ast, stl, present",
          )
          .in("match_id", matchIds);

        rows = (byMatch ?? []) as SupaStatRow[];
      }

      if (rows.length === 0) {
        const { data: byTeam } = await supabase
          .from("match_player_stats")
          .select(
            "player_id, match_id, pts, p2m, p3m, ftm, p3a, off_reb, def_reb, reb, ast, stl, present",
          )
          .eq("team_id", teamId);

        rows = (byTeam ?? []) as SupaStatRow[];
      }

      if (!active) return;

      if (rows.length === 0) {
        setLeaders(fallbackLeaders(players));
        setLoading(false);
        return;
      }

      setLeaders(aggregateLeaderRows(rows, localNames));
      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [players, supabase, teamId]);

  const cards = useMemo(
    () =>
      LEADER_CATEGORIES.map((category) => ({
        category,
        rows: getTop3(leaders, category),
      })),
    [leaders],
  );

  return (
    <section className="tl-card leaders-card">
      <div className="leaders-head">
        <div>
          <p className="eyebrow">Performance</p>
          <h2>Leaders de l'équipe</h2>
          <p className="muted">
            Top 3 par catégorie, calculé sur les matchs enregistrés.
          </p>
        </div>

        {loading && <span className="loading-pill">Chargement...</span>}
      </div>

      <div className="leaders-grid">
        {cards.map(({ category, rows }) => (
          <article key={category.key} className="leader-box">
            <div className="leader-title">
              <span>{category.icon}</span>
              <strong>{category.title}</strong>
            </div>

            {rows.length === 0 && (
              <div className="leader-empty">Pas encore assez de données.</div>
            )}

            {rows.map((line, index) => {
              const value = leaderMetric(line, category);
              const displayed =
                category.type === "percent"
                  ? `${r1(value)}${category.suffix || ""}`
                  : r1(value);

              return (
                <div key={line.playerId} className="leader-row">
                  <span className={`rank rank-${index + 1}`}>{index + 1}</span>

                  <div className="identity">
                    <strong>{line.name}</strong>
                    <small>
                      {line.games} match{line.games > 1 ? "s" : ""}
                      {category.key === "p3pct"
                        ? ` · ${line.p3m}/${line.p3a}`
                        : ""}
                    </small>
                  </div>

                  <span className="value">{displayed}</span>
                </div>
              );
            })}
          </article>
        ))}
      </div>

      <style jsx>{`
        .leaders-card {
          margin-top: 1.2rem;
        }
        .leaders-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .eyebrow {
          margin: 0;
          color: #d4a24c;
          font-size: 0.78rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        h2 {
          margin: 0.2rem 0 0;
          color: #6b1a2c;
          font-size: 1.45rem;
          font-weight: 900;
        }
        .muted {
          margin: 0.25rem 0 0;
          color: #9a8a82;
          font-size: 0.92rem;
        }
        .loading-pill {
          display: inline-flex;
          border-radius: 999px;
          background: #fff8ef;
          border: 1px solid #eadccc;
          color: #6b1a2c;
          padding: 0.45rem 0.75rem;
          font-weight: 900;
          font-size: 0.8rem;
        }
        .leaders-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 0.85rem;
        }
        .leader-box {
          border: 1px solid #efe6db;
          border-radius: 18px;
          background: linear-gradient(180deg, #fffdf9, #fff);
          padding: 0.9rem;
          min-height: 205px;
          box-shadow: 0 10px 24px rgba(60, 30, 20, 0.045);
        }
        .leader-title {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          color: #6b1a2c;
          margin-bottom: 0.8rem;
        }
        .leader-row {
          display: grid;
          grid-template-columns: 28px 1fr auto;
          align-items: center;
          gap: 0.55rem;
          padding: 0.55rem 0;
          border-top: 1px solid #f0e7dc;
        }
        .leader-row:first-of-type {
          border-top: 0;
        }
        .rank {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: #f5efe6;
          color: #6b1a2c;
          font-weight: 900;
          font-size: 0.82rem;
        }
        .rank-1 {
          background: #fff0c8;
          color: #7a4f00;
        }
        .rank-2 {
          background: #f1f2f5;
          color: #525866;
        }
        .rank-3 {
          background: #f5e7dc;
          color: #7a3e1d;
        }
        .identity {
          min-width: 0;
        }
        .identity strong {
          display: block;
          color: #1f171a;
          font-size: 0.88rem;
          font-weight: 900;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .identity small {
          display: block;
          margin-top: 0.12rem;
          color: #9a8a82;
          font-size: 0.72rem;
          font-weight: 800;
        }
        .value {
          color: #d4a24c;
          font-size: 1.05rem;
          font-weight: 900;
        }
        .leader-empty {
          border-top: 1px solid #f0e7dc;
          padding-top: 0.75rem;
          color: #9a8a82;
          font-weight: 800;
          font-size: 0.85rem;
        }
        @media (max-width: 1200px) {
          .leaders-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 760px) {
          .leaders-head {
            flex-direction: column;
          }
          .leaders-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}

/* ---------- 2. STATS ÉQUIPE ---------- */

type TeamStats = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  off: number;
  def: number;
  reb: number;
  ast: number;
  st: number;
  to: number;
  bs: number;
  pf: number;
  pts: number;
};

type SplitKey =
  | "total"
  | "home_win"
  | "home_loss"
  | "away_win"
  | "away_loss"
  | "home"
  | "away"
  | "win"
  | "loss";

const STAT_SPLITS: Array<{ key: SplitKey; label: string }> = [
  { key: "total", label: "TOTAL" },
  { key: "home_win", label: "Domicile/Victoire" },
  { key: "home_loss", label: "Domicile/Défaite" },
  { key: "away_win", label: "Extérieur/Victoire" },
  { key: "away_loss", label: "Extérieur/Défaite" },
  { key: "home", label: "Domicile" },
  { key: "away", label: "Extérieur" },
  { key: "win", label: "Victoire" },
  { key: "loss", label: "Défaite" },
];

function emptyTeamStats(): TeamStats {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    p2m: 0,
    p2a: 0,
    p3m: 0,
    p3a: 0,
    ftm: 0,
    fta: 0,
    off: 0,
    def: 0,
    reb: 0,
    ast: 0,
    st: 0,
    to: 0,
    bs: 0,
    pf: 0,
    pts: 0,
  };
}

function isHome(match: SupaMatchRow) {
  return match.home !== false;
}

function isWin(match: SupaMatchRow) {
  return safeNum(match.us_score) > safeNum(match.them_score);
}

function isLoss(match: SupaMatchRow) {
  return safeNum(match.us_score) < safeNum(match.them_score);
}

function matchPassesSplit(match: SupaMatchRow, split: SplitKey) {
  const home = isHome(match);

  if (split === "total") return true;
  if (split === "home") return home;
  if (split === "away") return !home;
  if (split === "win") return isWin(match);
  if (split === "loss") return isLoss(match);
  if (split === "home_win") return home && isWin(match);
  if (split === "home_loss") return home && isLoss(match);
  if (split === "away_win") return !home && isWin(match);
  if (split === "away_loss") return !home && isLoss(match);

  return true;
}

function addMatchToTeamStats(stats: TeamStats, match: SupaMatchRow) {
  const us = safeNum(match.us_score);
  const them = safeNum(match.them_score);

  stats.games += 1;
  stats.pointsFor += us;
  stats.pointsAgainst += them;

  if (us > them) stats.wins += 1;
  else if (us < them) stats.losses += 1;
  else stats.draws += 1;
}

function addLineToTeamStats(stats: TeamStats, row: SupaStatRow) {
  stats.p2m += safeNum(row.p2m);
  stats.p2a += safeNum(row.p2a);
  stats.p3m += safeNum(row.p3m);
  stats.p3a += safeNum(row.p3a);
  stats.ftm += safeNum(row.ftm);
  stats.fta += safeNum(row.fta);
  stats.off += safeNum(row.off_reb);
  stats.def += safeNum(row.def_reb);
  stats.reb += safeNum(row.reb) || safeNum(row.off_reb) + safeNum(row.def_reb);
  stats.ast += safeNum(row.ast);
  stats.st += safeNum(row.stl);
  stats.bs += safeNum(row.blk);
  stats.to += safeNum(row.turnovers);
  stats.pf += safeNum(row.pf);
  stats.pts += safeNum(row.pts);
}

function teamAdvanced(stats: TeamStats) {
  const fgm = stats.p2m + stats.p3m;
  const fga = stats.p2a + stats.p3a;
  const poss = fga + 0.44 * stats.fta + stats.to - stats.off;

  const eff =
    stats.pts +
    stats.reb +
    stats.ast +
    stats.st +
    stats.bs -
    (fga - fgm) -
    (stats.fta - stats.ftm) -
    stats.to -
    stats.pf;

  const efg = fga ? ((fgm + 0.5 * stats.p3m) / fga) * 100 : 0;
  const ts =
    fga + 0.44 * stats.fta
      ? (stats.pointsFor / (2 * (fga + 0.44 * stats.fta))) * 100
      : 0;
  const astPct = fgm ? (stats.ast / fgm) * 100 : 0;
  const tovPct = poss ? (stats.to / poss) * 100 : 0;
  const shot2Rep = fga ? (stats.p2a / fga) * 100 : 0;
  const shot3Rep = fga ? (stats.p3a / fga) * 100 : 0;

  return { fgm, fga, poss, eff, efg, ts, astPct, tovPct, shot2Rep, shot3Rep };
}

function TeamMatchStatsBlock({ teamId }: { teamId: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"total" | "average">("average");
  const [matches, setMatches] = useState<SupaMatchRow[]>([]);
  const [statsRows, setStatsRows] = useState<SupaStatRow[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const { data: matchData, error: matchError } = await supabase
        .from("match_stats")
        .select(
          "id, team_id, opponent, match_date, us_score, them_score, result, home",
        )
        .eq("team_id", teamId)
        .order("match_date", { ascending: false });

      if (!active) return;

      if (matchError) {
        console.error("Erreur stats équipe fiche :", matchError);
        setMatches([]);
        setStatsRows([]);
        setLoading(false);
        return;
      }

      const matchRows = (matchData ?? []) as SupaMatchRow[];
      setMatches(matchRows);

      const matchIds = matchRows.map((m) => m.id);

      if (matchIds.length === 0) {
        setStatsRows([]);
        setLoading(false);
        return;
      }

      const { data: playerData, error: playerError } = await supabase
        .from("match_player_stats")
        .select(
          "team_id, match_id, pts, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, reb, ast, stl, blk, turnovers, pf, present",
        )
        .in("match_id", matchIds);

      if (!active) return;

      if (playerError) {
        console.error("Erreur lignes stats équipe fiche :", playerError);
        setStatsRows([]);
      } else {
        setStatsRows(
          ((playerData ?? []) as SupaStatRow[]).filter(
            (r) => r.present !== false,
          ),
        );
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [supabase, teamId]);

  const splitRows = useMemo(() => {
    const rowsByMatch = statsRows.reduce(
      (acc, row) => {
        const id = String(row.match_id || "");
        if (!id) return acc;
        if (!acc[id]) acc[id] = [];
        acc[id].push(row);
        return acc;
      },
      {} as Record<string, SupaStatRow[]>,
    );

    return STAT_SPLITS.map((split) => {
      const sourceMatches = matches.filter((match) =>
        matchPassesSplit(match, split.key),
      );
      const stats = emptyTeamStats();

      sourceMatches.forEach((match) => {
        addMatchToTeamStats(stats, match);
        (rowsByMatch[match.id] || []).forEach((row) =>
          addLineToTeamStats(stats, row),
        );
      });

      return {
        key: split.key,
        label: split.label,
        stats,
      };
    });
  }, [matches, statsRows]);

  const total =
    splitRows.find((row) => row.key === "total")?.stats || emptyTeamStats();

  const value = (x: number, games: number) => {
    if (mode === "total") return r1(x);
    return games ? r1(x / games) : 0;
  };

  return (
    <section className="tl-card team-match-stats">
      <div className="block-head">
        <div>
          <p className="eyebrow">Matchs</p>
          <h2>Stats équipe</h2>
          <p className="muted">Synthèse liée aux matchs enregistrés en live.</p>
        </div>

        <div className="mode-switch">
          <button
            type="button"
            className={mode === "total" ? "on" : ""}
            onClick={() => setMode("total")}
          >
            Total
          </button>
          <button
            type="button"
            className={mode === "average" ? "on" : ""}
            onClick={() => setMode("average")}
          >
            Moyenne
          </button>
        </div>
      </div>

      {loading && <div className="empty">Chargement des stats...</div>}

      {!loading && matches.length === 0 && (
        <div className="empty">Aucun match enregistré pour cette équipe.</div>
      )}

      {!loading && matches.length > 0 && (
        <>
          <div className="quick-kpis">
            <MiniKpi label="Matchs" value={total.games} />
            <MiniKpi label="Victoires" value={total.wins} />
            <MiniKpi label="Défaites" value={total.losses} />
            <MiniKpi
              label="Pts marqués"
              value={value(total.pointsFor, total.games)}
            />
            <MiniKpi
              label="Pts encaissés"
              value={value(total.pointsAgainst, total.games)}
            />
            <MiniKpi
              label="Diff."
              value={value(total.pointsFor - total.pointsAgainst, total.games)}
            />
          </div>

          <div className="stats-table">
            <table>
              <thead>
                <tr>
                  <th>Filtre</th>
                  <th>MJ</th>
                  <th>PTS M</th>
                  <th>PTS E</th>
                  <th>FG</th>
                  <th>%</th>
                  <th>2PTS</th>
                  <th>%</th>
                  <th>3PTS</th>
                  <th>%</th>
                  <th>LF</th>
                  <th>%</th>
                  <th>RO</th>
                  <th>RD</th>
                  <th>REB</th>
                  <th>PD</th>
                  <th>INT</th>
                  <th>BP</th>
                  <th>CTRE</th>
                  <th>FP</th>
                  <th>Eval</th>
                  <th>Poss</th>
                  <th>eFG%</th>
                  <th>TS%</th>
                  <th>%PD</th>
                  <th>%BP</th>
                  <th>2PTS Rep</th>
                  <th>3PTS Rep</th>
                </tr>
              </thead>

              <tbody>
                {splitRows.map((row) => {
                  const s = row.stats;
                  const a = teamAdvanced(s);
                  const games = s.games;

                  return (
                    <tr key={row.key} className={`row-${row.key}`}>
                      <td className="label">{row.label}</td>
                      <td>{s.games}</td>
                      <td>{value(s.pointsFor, games)}</td>
                      <td>{value(s.pointsAgainst, games)}</td>
                      <td>
                        {value(a.fgm, games)}-{value(a.fga, games)}
                      </td>
                      <td>{pctText(a.fgm, a.fga)}</td>
                      <td>
                        {value(s.p2m, games)}-{value(s.p2a, games)}
                      </td>
                      <td>{pctText(s.p2m, s.p2a)}</td>
                      <td>
                        {value(s.p3m, games)}-{value(s.p3a, games)}
                      </td>
                      <td>{pctText(s.p3m, s.p3a)}</td>
                      <td>
                        {value(s.ftm, games)}-{value(s.fta, games)}
                      </td>
                      <td>{pctText(s.ftm, s.fta)}</td>
                      <td>{value(s.off, games)}</td>
                      <td>{value(s.def, games)}</td>
                      <td>{value(s.reb, games)}</td>
                      <td>{value(s.ast, games)}</td>
                      <td>{value(s.st, games)}</td>
                      <td>{value(s.to, games)}</td>
                      <td>{value(s.bs, games)}</td>
                      <td>{value(s.pf, games)}</td>
                      <td>{value(a.eff, games)}</td>
                      <td>{value(a.poss, games)}</td>
                      <td>{r1(a.efg)}%</td>
                      <td>{r1(a.ts)}%</td>
                      <td>{r1(a.astPct)}%</td>
                      <td>{r1(a.tovPct)}%</td>
                      <td>{r1(a.shot2Rep)}%</td>
                      <td>{r1(a.shot3Rep)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <style jsx>{`
        .team-match-stats {
          margin-top: 1.2rem;
        }
        .block-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .eyebrow {
          margin: 0;
          color: #d4a24c;
          font-size: 0.78rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        h2 {
          margin: 0.2rem 0 0;
          color: #6b1a2c;
          font-size: 1.45rem;
          font-weight: 900;
        }
        .muted {
          margin: 0.25rem 0 0;
          color: #9a8a82;
          font-size: 0.92rem;
        }
        .mode-switch {
          display: inline-flex;
          gap: 0.25rem;
          border-radius: 999px;
          background: #fff8ef;
          border: 1px solid #eadccc;
          padding: 0.25rem;
        }
        .mode-switch button {
          border: 0;
          background: transparent;
          border-radius: 999px;
          color: #6b1a2c;
          padding: 0.55rem 0.9rem;
          font-weight: 900;
          cursor: pointer;
        }
        .mode-switch button.on {
          background: #6b1a2c;
          color: #fff;
        }
        .empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 14px;
          padding: 1rem;
          color: #6b1a2c;
          font-weight: 900;
        }
        .quick-kpis {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        .kpi {
          border: 1px solid #efe6db;
          border-radius: 14px;
          background: #fffdf9;
          padding: 0.85rem;
        }
        .kpi span {
          display: block;
          color: #9a8a82;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
        }
        .kpi strong {
          display: block;
          margin-top: 0.25rem;
          color: #6b1a2c;
          font-size: 1.35rem;
          font-weight: 900;
        }
        .stats-table {
          width: 100%;
          overflow-x: auto;
          border: 1px solid #efe6db;
          border-radius: 16px;
        }
        table {
          width: max-content;
          min-width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.78rem;
        }
        th {
          background: linear-gradient(#6b1a2c, #49101d);
          color: white;
          padding: 0.65rem 0.55rem;
          text-align: center;
          white-space: nowrap;
          font-weight: 900;
        }
        th:first-child,
        td:first-child {
          position: sticky;
          left: 0;
          z-index: 2;
          min-width: 155px;
          text-align: left;
        }
        th:first-child {
          background: #6b1a2c;
        }
        td:first-child {
          background: #f8f8f8;
        }
        td {
          border-bottom: 1px solid #eee;
          border-right: 1px solid #eee;
          padding: 0.62rem 0.55rem;
          text-align: center;
          white-space: nowrap;
          background: white;
          font-weight: 800;
        }
        .label {
          color: #6b1a2c;
          font-weight: 900;
        }
        .row-total td {
          background: #fff7ec;
          font-weight: 900;
        }
        .row-home_win td:first-child,
        .row-away_win td:first-child,
        .row-win td:first-child {
          background: #eef9f1;
          color: #2f6b41;
        }
        .row-home_loss td:first-child,
        .row-away_loss td:first-child,
        .row-loss td:first-child {
          background: #fdf1ef;
          color: #8f3c34;
        }
        .row-home td:first-child {
          background: #fff8ea;
          color: #8a6a1f;
        }
        .row-away td:first-child {
          background: #f1f6ff;
          color: #355c96;
        }
        @media (max-width: 900px) {
          .block-head {
            flex-direction: column;
          }
          .quick-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </section>
  );
}

function MiniKpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/* ---------- 5. STATS JEU / TEMPS FORTS ---------- */

type GameSplitKey = "total" | "win" | "loss";

type GameActionRow = {
  match_id: string | null;
  context: string | null;
  inbound: string | null;
  temps_fort: string | null;
  action_type: string | null;
  shot_type: string | null;
  shot_result: string | null;
  special_case: string | null;
  ft_attempts: number | null;
  ft_made: number | null;
  assist_player_id: string | null;
};

type GameCellStats = {
  key: string;
  label: string;
  poss: number;
  pts: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  turnovers: number;
  assists: number;
};

const GAME_HIGHLIGHTS = [
  { key: "fast-break", label: "Fast Break" },
  { key: "transition", label: "Transition" },
  { key: "jeu-place", label: "Jeu placé" },
  { key: "pick-top", label: "Pick Top" },
  { key: "pick-side", label: "Pick Side" },
  { key: "hand-off", label: "Hand Off" },
  { key: "1v1", label: "1v1" },
  { key: "drive-kick", label: "Drive & Kick" },
  { key: "stagger", label: "Stagger" },
  { key: "jeu-sans-ballon", label: "Sans ballon" },
  { key: "off-rebound", label: "Rebond off" },
  { key: "blob", label: "BLOB" },
  { key: "slob", label: "SLOB" },
];

function emptyGameCell(item: { key: string; label: string }): GameCellStats {
  return {
    key: item.key,
    label: item.label,
    poss: 0,
    pts: 0,
    p2m: 0,
    p2a: 0,
    p3m: 0,
    p3a: 0,
    ftm: 0,
    fta: 0,
    turnovers: 0,
    assists: 0,
  };
}

function normalizeGameHighlight(action: GameActionRow) {
  const inbound = String(action.inbound || "").toLowerCase();
  const tempsFort = String(action.temps_fort || "").toLowerCase();

  if (inbound === "blob") return "blob";
  if (inbound === "slob") return "slob";

  if (tempsFort === "fast_break" || tempsFort === "fast-break")
    return "fast-break";
  if (tempsFort === "transition" || tempsFort === "early_offense")
    return "transition";
  if (
    tempsFort === "pnp_top" ||
    tempsFort === "pick_top" ||
    tempsFort === "pick-top"
  )
    return "pick-top";
  if (
    tempsFort === "pnp_side" ||
    tempsFort === "pick_side" ||
    tempsFort === "pick-side"
  )
    return "pick-side";
  if (
    tempsFort === "handoff" ||
    tempsFort === "hand_off" ||
    tempsFort === "hand-off"
  )
    return "hand-off";
  if (tempsFort === "isolation" || tempsFort === "iso" || tempsFort === "1v1")
    return "1v1";
  if (tempsFort === "drive_kick" || tempsFort === "drive-kick")
    return "drive-kick";
  if (tempsFort === "stagger") return "stagger";
  if (tempsFort === "jeu_sans_ballon" || tempsFort === "sans_ballon")
    return "jeu-sans-ballon";
  if (
    tempsFort === "rebond_off" ||
    tempsFort === "off_rebound" ||
    tempsFort === "off-rebound"
  )
    return "off-rebound";
  if (tempsFort === "blob") return "blob";
  if (tempsFort === "slob") return "slob";

  return tempsFort || "jeu-place";
}

function gameActionPoints(action: GameActionRow) {
  const context = String(action.context || "");
  const actionType = String(action.action_type || "");
  const shotType = String(action.shot_type || "");
  const shotResult = String(action.shot_result || "");
  const specialCase = String(action.special_case || "");

  if (context !== "attaque") return 0;

  if (actionType === "tir") {
    if (shotType === "LF") return safeNum(action.ft_made);

    let pts = 0;

    if (shotResult === "made") {
      if (shotType === "2PTS") pts += 2;
      if (shotType === "3PTS") pts += 3;
    }

    if (shotResult === "made" && specialCase !== "aucun") {
      pts += safeNum(action.ft_made);
    }

    return pts;
  }

  if (actionType === "faute-provoquee") {
    return safeNum(action.ft_made);
  }

  return 0;
}

function addGameAction(cell: GameCellStats, action: GameActionRow) {
  const context = String(action.context || "");
  const actionType = String(action.action_type || "");
  const shotType = String(action.shot_type || "");
  const shotResult = String(action.shot_result || "");

  if (context !== "attaque") return;

  cell.poss += 1;
  cell.pts += gameActionPoints(action);

  if (actionType === "tir") {
    if (shotType === "2PTS") {
      cell.p2a += 1;
      if (shotResult === "made") cell.p2m += 1;
    }

    if (shotType === "3PTS") {
      cell.p3a += 1;
      if (shotResult === "made") cell.p3m += 1;
    }

    if (shotType === "LF") {
      cell.fta += safeNum(action.ft_attempts);
      cell.ftm += safeNum(action.ft_made);
    }

    if (
      shotType !== "LF" &&
      shotResult === "made" &&
      action.special_case !== "aucun"
    ) {
      cell.fta += safeNum(action.ft_attempts);
      cell.ftm += safeNum(action.ft_made);
    }
  }

  if (actionType === "faute-provoquee") {
    cell.fta += safeNum(action.ft_attempts);
    cell.ftm += safeNum(action.ft_made);
  }

  if (actionType === "perte") {
    cell.turnovers += 1;
  }

  if (action.assist_player_id) {
    cell.assists += 1;
  }
}

function gameAdvanced(cell: GameCellStats) {
  const fgm = cell.p2m + cell.p3m;
  const fga = cell.p2a + cell.p3a;

  const ppp = cell.poss ? cell.pts / cell.poss : 0;
  const efg = fga ? ((fgm + 0.5 * cell.p3m) / fga) * 100 : 0;
  const ts =
    fga + 0.44 * cell.fta
      ? (cell.pts / (2 * (fga + 0.44 * cell.fta))) * 100
      : 0;
  const astPct = fgm ? (cell.assists / fgm) * 100 : 0;
  const tovPct = cell.poss ? (cell.turnovers / cell.poss) * 100 : 0;
  const ftr = fga ? cell.fta / fga : 0;

  return {
    fgm,
    fga,
    ppp,
    efg,
    ts,
    astPct,
    tovPct,
    ftr,
  };
}

function buildGameCells(actions: GameActionRow[]) {
  const cells = GAME_HIGHLIGHTS.reduce(
    (acc, item) => {
      acc[item.key] = emptyGameCell(item);
      return acc;
    },
    {} as Record<string, GameCellStats>,
  );

  actions.forEach((action) => {
    if (String(action.context || "") !== "attaque") return;

    const key = normalizeGameHighlight(action);
    const item =
      GAME_HIGHLIGHTS.find((highlight) => highlight.key === key) ||
      GAME_HIGHLIGHTS.find((highlight) => highlight.key === "jeu-place")!;

    addGameAction(cells[item.key], action);
  });

  return cells;
}

function aggregateGameTotal(cells: Record<string, GameCellStats>) {
  const total = emptyGameCell({ key: "total", label: "TOTAL" });

  Object.values(cells).forEach((cell) => {
    total.poss += cell.poss;
    total.pts += cell.pts;
    total.p2m += cell.p2m;
    total.p2a += cell.p2a;
    total.p3m += cell.p3m;
    total.p3a += cell.p3a;
    total.ftm += cell.ftm;
    total.fta += cell.fta;
    total.turnovers += cell.turnovers;
    total.assists += cell.assists;
  });

  return total;
}

function splitGameMatches(matches: SupaMatchRow[], split: GameSplitKey) {
  if (split === "total") return matches;

  return matches.filter((match) => {
    const us = safeNum(match.us_score);
    const them = safeNum(match.them_score);

    if (split === "win") return us > them;
    if (split === "loss") return us < them;

    return true;
  });
}

function TeamGameStatsBlock({ teamId }: { teamId: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<SupaMatchRow[]>([]);
  const [actions, setActions] = useState<GameActionRow[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const { data: matchData, error: matchError } = await supabase
        .from("match_stats")
        .select(
          "id, team_id, opponent, match_date, us_score, them_score, result, home",
        )
        .eq("team_id", teamId)
        .order("match_date", { ascending: false });

      if (!active) return;

      if (matchError) {
        console.error("Erreur chargement stats jeu fiche équipe :", matchError);
        setMatches([]);
        setActions([]);
        setLoading(false);
        return;
      }

      const matchRows = (matchData ?? []) as SupaMatchRow[];
      setMatches(matchRows);

      const matchIds = matchRows.map((match) => match.id);

      if (matchIds.length === 0) {
        setActions([]);
        setLoading(false);
        return;
      }

      const { data: actionData, error: actionError } = await supabase
        .from("match_actions")
        .select(
          "match_id, context, inbound, temps_fort, action_type, shot_type, shot_result, special_case, ft_attempts, ft_made, assist_player_id",
        )
        .in("match_id", matchIds);

      if (!active) return;

      if (actionError) {
        console.error("Erreur chargement actions fiche équipe :", actionError);
        setActions([]);
      } else {
        setActions((actionData ?? []) as GameActionRow[]);
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [supabase, teamId]);

  const actionsByMatch = useMemo(() => {
    return actions.reduce(
      (acc, action) => {
        const matchId = String(action.match_id || "");
        if (!matchId) return acc;

        if (!acc[matchId]) acc[matchId] = [];
        acc[matchId].push(action);

        return acc;
      },
      {} as Record<string, GameActionRow[]>,
    );
  }, [actions]);

  const totalCells = useMemo(() => {
    const allActions = matches.flatMap(
      (match) => actionsByMatch[match.id] || [],
    );
    return buildGameCells(allActions);
  }, [actionsByMatch, matches]);

  const totalGame = aggregateGameTotal(totalCells);
  const totalGameAdv = gameAdvanced(totalGame);

  const performanceRows = useMemo(() => {
    const globalPoss = totalGame.poss;

    return GAME_HIGHLIGHTS.map((item) => {
      const cell = totalCells[item.key] || emptyGameCell(item);
      const adv = gameAdvanced(cell);

      return {
        ...cell,
        usage: globalPoss ? (cell.poss / globalPoss) * 100 : 0,
        ...adv,
      };
    })
      .filter((row) => row.poss > 0)
      .sort((a, b) => b.ppp - a.ppp);
  }, [totalCells, totalGame.poss]);

  const winLossRows = useMemo(() => {
    const build = (split: GameSplitKey) => {
      const sourceMatches = splitGameMatches(matches, split);
      const splitActions = sourceMatches.flatMap(
        (match) => actionsByMatch[match.id] || [],
      );
      const cells = buildGameCells(splitActions);
      const total = aggregateGameTotal(cells);

      return { cells, total };
    };

    const win = build("win");
    const loss = build("loss");

    return GAME_HIGHLIGHTS.map((item) => {
      const winCell = win.cells[item.key] || emptyGameCell(item);
      const lossCell = loss.cells[item.key] || emptyGameCell(item);

      const winAdv = gameAdvanced(winCell);
      const lossAdv = gameAdvanced(lossCell);

      return {
        key: item.key,
        label: item.label,
        winPoss: winCell.poss,
        lossPoss: lossCell.poss,
        winPts: winCell.pts,
        lossPts: lossCell.pts,
        winPpp: winAdv.ppp,
        lossPpp: lossAdv.ppp,
        diff: winAdv.ppp - lossAdv.ppp,
        winUsage: win.total.poss ? (winCell.poss / win.total.poss) * 100 : 0,
        lossUsage: loss.total.poss
          ? (lossCell.poss / loss.total.poss) * 100
          : 0,
      };
    })
      .filter((row) => row.winPoss + row.lossPoss > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [actionsByMatch, matches]);

  const insights = useMemo(() => {
    const mostEfficient = [...performanceRows].sort((a, b) => b.ppp - a.ppp)[0];
    const mostUsed = [...performanceRows].sort((a, b) => b.poss - a.poss)[0];
    const biggestDiff = [...winLossRows].sort(
      (a, b) => Math.abs(b.diff) - Math.abs(a.diff),
    )[0];
    const mostTurnovers = [...performanceRows].sort(
      (a, b) => b.tovPct - a.tovPct,
    )[0];

    return {
      mostEfficient,
      mostUsed,
      biggestDiff,
      mostTurnovers,
    };
  }, [performanceRows, winLossRows]);

  return (
    <section className="tl-card game-stats-card">
      <div className="block-head">
        <div>
          <p className="eyebrow">Analyse jeu</p>
          <h2>Stats jeu par temps fort</h2>
          <p className="muted">
            Performance globale, impact victoire/défaite et insights
            automatiques.
          </p>
        </div>
      </div>

      {loading && <div className="empty">Chargement des stats jeu...</div>}

      {!loading && matches.length === 0 && (
        <div className="empty">Aucun match enregistré pour cette équipe.</div>
      )}

      {!loading && matches.length > 0 && actions.length === 0 && (
        <div className="empty">
          Aucune action enregistrée dans match_actions pour cette équipe.
        </div>
      )}

      {!loading && matches.length > 0 && actions.length > 0 && (
        <>
          <div className="game-kpis">
            <MiniKpi label="Possessions" value={totalGame.poss} />
            <MiniKpi label="Points" value={totalGame.pts} />
            <MiniKpi label="PPP" value={r1(totalGameAdv.ppp)} />
            <MiniKpi label="eFG%" value={`${r1(totalGameAdv.efg)}%`} />
            <MiniKpi label="TS%" value={`${r1(totalGameAdv.ts)}%`} />
            <MiniKpi label="TO%" value={`${r1(totalGameAdv.tovPct)}%`} />
          </div>

          <div className="insights-grid">
            <InsightCard
              label="Temps fort le plus rentable"
              title={insights.mostEfficient?.label || "—"}
              value={
                insights.mostEfficient
                  ? `${r1(insights.mostEfficient.ppp)} PPP`
                  : "—"
              }
              tone="good"
            />

            <InsightCard
              label="Temps fort le plus utilisé"
              title={insights.mostUsed?.label || "—"}
              value={insights.mostUsed ? `${insights.mostUsed.poss} poss` : "—"}
              tone="neutral"
            />

            <InsightCard
              label="Plus gros écart V/D"
              title={insights.biggestDiff?.label || "—"}
              value={
                insights.biggestDiff
                  ? `${insights.biggestDiff.diff >= 0 ? "+" : ""}${r1(insights.biggestDiff.diff)} PPP`
                  : "—"
              }
              tone={
                insights.biggestDiff && insights.biggestDiff.diff < 0
                  ? "bad"
                  : "good"
              }
            />

            <InsightCard
              label="Plus gros TO%"
              title={insights.mostTurnovers?.label || "—"}
              value={
                insights.mostTurnovers
                  ? `${r1(insights.mostTurnovers.tovPct)}%`
                  : "—"
              }
              tone="bad"
            />
          </div>

          <div className="sub-block">
            <div className="sub-head">
              <h3>Performance par temps fort</h3>
              <p>Quel temps fort est le plus rentable et le plus utilisé ?</p>
            </div>

            <div className="game-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Temps fort</th>
                    <th>Poss</th>
                    <th>% Util</th>
                    <th>PTS</th>
                    <th>PPP</th>
                    <th>2PT%</th>
                    <th>3PT%</th>
                    <th>LF%</th>
                    <th>eFG%</th>
                    <th>TS%</th>
                    <th>AST%</th>
                    <th>TO%</th>
                    <th>FTr</th>
                  </tr>
                </thead>

                <tbody>
                  {performanceRows.map((row) => (
                    <tr key={row.key}>
                      <td className="label">{row.label}</td>
                      <td>{row.poss}</td>
                      <td>{r1(row.usage)}%</td>
                      <td className="pts">{row.pts}</td>
                      <td
                        className={
                          row.ppp >= 1.1 ? "good" : row.ppp < 0.85 ? "bad" : ""
                        }
                      >
                        {r1(row.ppp)}
                      </td>
                      <td>{pctText(row.p2m, row.p2a)}</td>
                      <td>{pctText(row.p3m, row.p3a)}</td>
                      <td>{pctText(row.ftm, row.fta)}</td>
                      <td>{r1(row.efg)}%</td>
                      <td>{r1(row.ts)}%</td>
                      <td>{r1(row.astPct)}%</td>
                      <td>{r1(row.tovPct)}%</td>
                      <td>{r1(row.ftr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="sub-block">
            <div className="sub-head">
              <h3>Impact victoire / défaite</h3>
              <p>
                Ce tableau montre ce qui change vraiment entre les matchs gagnés
                et perdus.
              </p>
            </div>

            <div className="game-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Temps fort</th>
                    <th>PPP Victoire</th>
                    <th>PPP Défaite</th>
                    <th>Diff PPP</th>
                    <th>Util. Victoire</th>
                    <th>Util. Défaite</th>
                    <th>Poss V</th>
                    <th>Poss D</th>
                    <th>PTS V</th>
                    <th>PTS D</th>
                  </tr>
                </thead>

                <tbody>
                  {winLossRows.map((row) => (
                    <tr key={row.key}>
                      <td className="label">{row.label}</td>
                      <td>{r1(row.winPpp)}</td>
                      <td>{r1(row.lossPpp)}</td>
                      <td className={row.diff >= 0 ? "good" : "bad"}>
                        {row.diff >= 0 ? "+" : ""}
                        {r1(row.diff)}
                      </td>
                      <td>{r1(row.winUsage)}%</td>
                      <td>{r1(row.lossUsage)}%</td>
                      <td>{row.winPoss}</td>
                      <td>{row.lossPoss}</td>
                      <td>{row.winPts}</td>
                      <td>{row.lossPts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .game-stats-card {
          margin-top: 1.4rem;
          padding: 1.45rem;
          border: 1px solid #eadfd5;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 14px 34px rgba(62, 31, 22, 0.055);
        }

        .block-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1.25rem;
        }

        .eyebrow {
          margin: 0;
          color: #d4a24c;
          font-size: 0.78rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        h2 {
          margin: 0.25rem 0 0;
          color: #6b1a2c;
          font-size: 1.65rem;
          line-height: 1.1;
          font-weight: 950;
        }

        .muted {
          margin: 0.45rem 0 0;
          color: #8f817b;
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 16px;
          padding: 1.1rem;
          color: #6b1a2c;
          font-weight: 900;
        }

        .game-kpis {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.85rem;
          margin-bottom: 1rem;
        }

        .game-kpis :global(.kpi) {
          min-height: 102px;
          border: 1px solid #eadfd5;
          border-radius: 17px;
          background: #fffaf4;
          padding: 1rem 1.05rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .game-kpis :global(.kpi span) {
          color: #8b7f79;
          font-size: 0.73rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .game-kpis :global(.kpi strong) {
          display: block;
          margin-top: 0.35rem;
          color: #6b1a2c;
          font-size: 1.45rem;
          line-height: 1;
          font-weight: 950;
        }

        .insights-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border-top: 1px solid #ece4dd;
          border-bottom: 1px solid #ece4dd;
          margin: 0 0 1.25rem;
          background: #fff;
        }

        .insights-grid :global(.insight-card) {
          min-height: 126px;
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          background: #fff;
        }

        .insights-grid :global(.insight-card + .insight-card) {
          border-left: 1px solid #ece4dd;
        }

        .insights-grid :global(.insight-label) {
          color: #5c5451;
          font-size: 0.82rem;
          font-weight: 750;
          line-height: 1.3;
          margin-bottom: 0.55rem;
        }

        .insights-grid :global(.insight-title) {
          color: #201b1d;
          font-size: 1.06rem;
          font-weight: 950;
          line-height: 1.2;
          overflow-wrap: anywhere;
        }

        .insights-grid :global(.insight-value) {
          margin-top: 0.35rem;
          color: #6b1a2c;
          font-size: 0.95rem;
          font-style: italic;
          font-weight: 900;
        }

        .insights-grid :global(.insight-card.good .insight-value) {
          color: #177245;
        }

        .insights-grid :global(.insight-card.bad .insight-value) {
          color: #b42318;
        }

        .sub-block {
          margin-top: 1.15rem;
          border: 1px solid #eadfd5;
          border-radius: 18px;
          overflow: hidden;
          background: #fff;
        }

        .sub-head {
          padding: 1.05rem 1.2rem;
          background: #fff8ef;
          border-bottom: 1px solid #eadfd5;
        }

        .sub-head h3 {
          margin: 0;
          color: #6b1a2c;
          font-size: 1.12rem;
          font-weight: 950;
        }

        .sub-head p {
          margin: 0.3rem 0 0;
          color: #887a75;
          font-weight: 750;
          font-size: 0.86rem;
        }

        .game-table-wrap {
          width: 100%;
          overflow-x: auto;
          background: #fff;
        }

        table {
          width: 100%;
          min-width: 1080px;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: auto;
          font-size: 0.82rem;
        }

        th {
          background: linear-gradient(180deg, #7a1c32, #5a1325);
          color: #fff;
          min-height: 50px;
          padding: 0.85rem 0.65rem;
          text-align: center;
          vertical-align: middle;
          white-space: nowrap;
          font-weight: 950;
          border-right: 1px solid rgba(255, 255, 255, 0.14);
        }

        th:first-child,
        td:first-child {
          position: sticky;
          left: 0;
          z-index: 2;
          width: 190px;
          min-width: 190px;
          max-width: 190px;
          text-align: left;
        }

        th:first-child {
          z-index: 4;
          background: #65162a;
          padding-left: 1rem;
        }

        td {
          height: 54px;
          padding: 0.8rem 0.65rem;
          border-right: 1px solid #e8e3df;
          border-bottom: 1px solid #e8e3df;
          text-align: center;
          vertical-align: middle;
          white-space: nowrap;
          background: #fff;
          color: #211d1e;
          font-weight: 750;
        }

        td:first-child {
          background: #f7f7f7;
          padding-left: 1rem;
        }

        tbody tr:nth-child(even) td:not(:first-child) {
          background: #fcfaf9;
        }

        tbody tr:hover td {
          background: #fff7ea;
        }

        tbody tr:hover td:first-child {
          background: #f3e8df;
        }

        .label {
          color: #6b1a2c;
          font-weight: 950;
        }

        .pts {
          color: #d19b36;
          font-weight: 950;
        }

        .good {
          color: #177245;
          font-weight: 950;
        }

        .bad {
          color: #b42318;
          font-weight: 950;
        }

        @media (max-width: 1100px) {
          .game-kpis {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .insights-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .insights-grid :global(.insight-card:nth-child(3)) {
            border-left: 0;
            border-top: 1px solid #ece4dd;
          }

          .insights-grid :global(.insight-card:nth-child(4)) {
            border-top: 1px solid #ece4dd;
          }
        }

        @media (max-width: 700px) {
          .game-stats-card {
            padding: 1rem;
          }

          .game-kpis,
          .insights-grid {
            grid-template-columns: 1fr;
          }

          .insights-grid :global(.insight-card + .insight-card) {
            border-left: 0;
            border-top: 1px solid #ece4dd;
          }
        }
      `}</style>
    </section>
  );
}

function InsightCard({
  label,
  title,
  value,
  tone,
}: {
  label: string;
  title: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  return (
    <article className={`insight-card ${tone}`}>
      <div className="insight-label">{label}</div>
      <div className="insight-title">{title}</div>
      <div className="insight-value">{value}</div>
    </article>
  );
}

/* ---------- 6. LINEUPS / 5 MAJEURS ---------- */

type LineupActionRow = {
  match_id: string | null;
  context: string | null;
  action_type: string | null;
  shot_type: string | null;
  shot_result: string | null;
  special_case: string | null;
  ft_attempts: number | null;
  ft_made: number | null;
  assist_player_id: string | null;
  lineup: string[] | null;
};

type LineupRow = {
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
  fgm: number;
  fga: number;
  ppp: number;
  offRtg: number;
  efg: number;
  ts: number;
  astPct: number;
  tovPct: number;
  stopPct: number;
};

function lineupActionPoints(action: LineupActionRow) {
  const context = String(action.context || "");
  const actionType = String(action.action_type || "");
  const shotType = String(action.shot_type || "");
  const shotResult = String(action.shot_result || "");
  const specialCase = String(action.special_case || "");

  if (context === "attaque") {
    if (actionType === "tir") {
      if (shotType === "LF") return safeNum(action.ft_made);

      let pts = 0;

      if (shotResult === "made") {
        if (shotType === "2PTS") pts += 2;
        if (shotType === "3PTS") pts += 3;
      }

      if (shotResult === "made" && specialCase !== "aucun") {
        pts += safeNum(action.ft_made);
      }

      return pts;
    }

    if (actionType === "faute-provoquee") {
      return safeNum(action.ft_made);
    }
  }

  if (context === "defense" && actionType === "tir" && shotResult === "made") {
    if (shotType === "3PTS") return -3;
    if (shotType === "2PTS") return -2;
    if (shotType === "LF") return -safeNum(action.ft_made);
  }

  if (context === "defense" && actionType === "faute-commise") {
    return -safeNum(action.ft_made);
  }

  return 0;
}

function lineupPossession(action: LineupActionRow) {
  const context = String(action.context || "");
  const actionType = String(action.action_type || "");
  const shotType = String(action.shot_type || "");

  if (context !== "attaque") return 0;

  if (actionType === "tir" && (shotType === "2PTS" || shotType === "3PTS"))
    return 1;
  if (actionType === "tir" && shotType === "LF")
    return 0.44 * safeNum(action.ft_attempts);
  if (actionType === "faute-provoquee")
    return 0.44 * safeNum(action.ft_attempts);
  if (actionType === "perte") return 1;

  return 0;
}

function lineupLabel(ids: string[], names: Record<string, string>) {
  return ids
    .map((id) => {
      const name = names[id] || `Joueur ${id.slice(0, 4)}`;
      return name.replace(/^#/, "");
    })
    .join(" · ");
}

function computeLineups(
  actions: LineupActionRow[],
  names: Record<string, string>,
): LineupRow[] {
  const map: Record<
    string,
    Omit<
      LineupRow,
      | "fgm"
      | "fga"
      | "ppp"
      | "offRtg"
      | "efg"
      | "ts"
      | "astPct"
      | "tovPct"
      | "stopPct"
    >
  > = {};

  actions.forEach((action) => {
    const ids = Array.isArray(action.lineup)
      ? action.lineup.filter(Boolean).map(String)
      : [];

    if (ids.length === 0) return;

    const key = ids.slice().sort().join("|");

    if (!map[key]) {
      map[key] = {
        ids,
        label: lineupLabel(ids, names),
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

    const pts = lineupActionPoints(action);
    if (pts > 0) row.ptsFor += pts;
    if (pts < 0) row.ptsAgainst += Math.abs(pts);
    row.plusMinus += pts;
    row.poss += lineupPossession(action);

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
        row.fta += safeNum(action.ft_attempts);
        row.ftm += safeNum(action.ft_made);
      }

      if (
        shotType !== "LF" &&
        shotResult === "made" &&
        action.special_case !== "aucun"
      ) {
        row.fta += safeNum(action.ft_attempts);
        row.ftm += safeNum(action.ft_made);
      }
    }

    if (context === "attaque" && action.assist_player_id) row.ast += 1;
    if (context === "attaque" && actionType === "perte") row.to += 1;

    if (context === "defense" && pts >= 0) {
      row.stops += 1;
    }
  });

  return Object.values(map)
    .map((row) => {
      const fgm = row.p2m + row.p3m;
      const fga = row.p2a + row.p3a;
      const ppp = row.poss ? row.ptsFor / row.poss : 0;
      const offRtg = row.poss ? (row.ptsFor / row.poss) * 100 : 0;
      const efg = fga ? ((fgm + 0.5 * row.p3m) / fga) * 100 : 0;
      const ts =
        fga + 0.44 * row.fta
          ? (row.ptsFor / (2 * (fga + 0.44 * row.fta))) * 100
          : 0;
      const astPct = fgm ? (row.ast / fgm) * 100 : 0;
      const tovPct = row.poss ? (row.to / row.poss) * 100 : 0;
      const stopPct = row.actions ? (row.stops / row.actions) * 100 : 0;

      return {
        ...row,
        fgm,
        fga,
        ppp,
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

function getPlayerNameFromAny(row: any) {
  const num = row?.num ?? row?.numero ?? row?.number ?? "";
  const first = row?.first_name ?? row?.firstName ?? row?.prenom ?? "";
  const last = row?.last_name ?? row?.lastName ?? row?.nom ?? "";
  const full = row?.name ?? row?.full_name ?? row?.fullName ?? "";
  const name = full || `${first} ${last}`.trim() || "Joueur";

  return `${num ? `#${num} ` : ""}${name}`;
}

function TeamLineupsBlock({ teamId }: { teamId: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<SupaMatchRow[]>([]);
  const [actions, setActions] = useState<LineupActionRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const { data: matchData, error: matchError } = await supabase
        .from("match_stats")
        .select(
          "id, team_id, opponent, match_date, us_score, them_score, result, home",
        )
        .eq("team_id", teamId)
        .order("match_date", { ascending: false });

      if (!active) return;

      if (matchError) {
        console.error("Erreur chargement lineups matchs :", matchError);
        setMatches([]);
        setActions([]);
        setLoading(false);
        return;
      }

      const matchRows = (matchData ?? []) as SupaMatchRow[];
      setMatches(matchRows);

      const matchIds = matchRows.map((match) => match.id);

      if (matchIds.length === 0) {
        setActions([]);
        setLoading(false);
        return;
      }

      const { data: actionData, error: actionError } = await supabase
        .from("match_actions")
        .select(
          "match_id, context, action_type, shot_type, shot_result, special_case, ft_attempts, ft_made, assist_player_id, lineup",
        )
        .in("match_id", matchIds);

      if (!active) return;

      if (actionError) {
        console.error("Erreur chargement actions lineups :", actionError);
        setActions([]);
        setLoading(false);
        return;
      }

      const actionRows = (actionData ?? []) as LineupActionRow[];
      setActions(actionRows);

      const playerIds = Array.from(
        new Set(
          actionRows
            .flatMap((action) =>
              Array.isArray(action.lineup) ? action.lineup : [],
            )
            .filter(Boolean)
            .map(String),
        ),
      );

      if (playerIds.length > 0) {
        const { data: playersData } = await supabase
          .from("players")
          .select("*")
          .in("id", playerIds);

        if (playersData) {
          setNames(
            playersData.reduce((acc: Record<string, string>, player: any) => {
              acc[String(player.id)] = getPlayerNameFromAny(player);
              return acc;
            }, {}),
          );
        }
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [supabase, teamId]);

  const rows = useMemo(() => computeLineups(actions, names), [actions, names]);
  const topRows = rows.slice(0, 12);

  const best = topRows[0];
  const mostUsed = [...rows].sort((a, b) => b.poss - a.poss)[0];

  return (
    <section className="tl-card lineups-card">
      <div className="block-head">
        <div>
          <p className="eyebrow">Lineups</p>
          <h2>5 majeurs / combinaisons</h2>
          <p className="muted">
            Analyse des 5 présents sur le terrain : +/-, PPP, OffRtg, eFG%, TS%,
            pertes et stops.
          </p>
        </div>
      </div>

      {loading && <div className="empty">Chargement des lineups...</div>}

      {!loading && matches.length === 0 && (
        <div className="empty">Aucun match enregistré pour cette équipe.</div>
      )}

      {!loading && matches.length > 0 && rows.length === 0 && (
        <div className="empty">
          Aucun lineup exploitable pour l’instant. Il faut enregistrer le champ{" "}
          <strong>lineup</strong> dans match_actions à chaque action.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="lineup-insights">
            <InsightCard
              label="Meilleur 5"
              title={best?.label || "—"}
              value={
                best
                  ? `${best.plusMinus >= 0 ? "+" : ""}${best.plusMinus} +/-`
                  : "—"
              }
              tone={best && best.plusMinus < 0 ? "bad" : "good"}
            />

            <InsightCard
              label="5 le plus utilisé"
              title={mostUsed?.label || "—"}
              value={mostUsed ? `${r1(mostUsed.poss)} poss` : "—"}
              tone="neutral"
            />

            <InsightCard
              label="Meilleur OffRtg"
              title={
                [...rows].sort((a, b) => b.offRtg - a.offRtg)[0]?.label || "—"
              }
              value={
                rows.length > 0
                  ? `${r1([...rows].sort((a, b) => b.offRtg - a.offRtg)[0].offRtg)}`
                  : "—"
              }
              tone="good"
            />

            <InsightCard
              label="Plus de stops"
              title={
                [...rows].sort((a, b) => b.stopPct - a.stopPct)[0]?.label || "—"
              }
              value={
                rows.length > 0
                  ? `${r1([...rows].sort((a, b) => b.stopPct - a.stopPct)[0].stopPct)}%`
                  : "—"
              }
              tone="good"
            />
          </div>

          <div className="lineup-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>5 sur le terrain</th>
                  <th>Actions</th>
                  <th>Poss</th>
                  <th>PTS +</th>
                  <th>PTS -</th>
                  <th>+/-</th>
                  <th>PPP</th>
                  <th>OffRtg</th>
                  <th>FG</th>
                  <th>2PTS</th>
                  <th>3PTS</th>
                  <th>LF</th>
                  <th>eFG%</th>
                  <th>TS%</th>
                  <th>AST%</th>
                  <th>TO%</th>
                  <th>Stops</th>
                  <th>Stop%</th>
                </tr>
              </thead>

              <tbody>
                {topRows.map((row) => (
                  <tr key={row.ids.join("|")}>
                    <td className="lineup-label">{row.label}</td>
                    <td>{row.actions}</td>
                    <td>{r1(row.poss)}</td>
                    <td>{row.ptsFor}</td>
                    <td>{row.ptsAgainst}</td>
                    <td className={row.plusMinus >= 0 ? "good" : "bad"}>
                      {row.plusMinus > 0 ? "+" : ""}
                      {row.plusMinus}
                    </td>
                    <td>{r1(row.ppp)}</td>
                    <td>{r1(row.offRtg)}</td>
                    <td>
                      {row.fgm}-{row.fga}
                    </td>
                    <td>
                      {row.p2m}-{row.p2a}
                    </td>
                    <td>
                      {row.p3m}-{row.p3a}
                    </td>
                    <td>
                      {row.ftm}-{row.fta}
                    </td>
                    <td>{r1(row.efg)}%</td>
                    <td>{r1(row.ts)}%</td>
                    <td>{r1(row.astPct)}%</td>
                    <td>{r1(row.tovPct)}%</td>
                    <td>{row.stops}</td>
                    <td>{r1(row.stopPct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <style jsx>{`
        .lineups-card {
          margin-top: 1.4rem;
          padding: 1.45rem;
          border: 1px solid #eadfd5;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 14px 34px rgba(62, 31, 22, 0.055);
        }

        .block-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1.2rem;
        }

        .eyebrow {
          margin: 0;
          color: #d4a24c;
          font-size: 0.78rem;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        h2 {
          margin: 0.25rem 0 0;
          color: #6b1a2c;
          font-size: 1.65rem;
          line-height: 1.1;
          font-weight: 950;
        }

        .muted {
          margin: 0.45rem 0 0;
          color: #8f817b;
          font-size: 0.95rem;
          line-height: 1.5;
        }

        .empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 16px;
          padding: 1.1rem;
          color: #6b1a2c;
          font-weight: 900;
        }

        .lineup-insights {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          border-top: 1px solid #ece4dd;
          border-bottom: 1px solid #ece4dd;
          margin-bottom: 1.2rem;
          background: #fff;
        }

        .lineup-insights :global(.insight-card) {
          min-height: 148px;
          padding: 1rem 1.1rem;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          overflow: hidden;
          background: #fff;
        }

        .lineup-insights :global(.insight-card + .insight-card) {
          border-left: 1px solid #ece4dd;
        }

        .lineup-insights :global(.insight-label) {
          color: #5c5451;
          font-size: 0.82rem;
          font-weight: 750;
          line-height: 1.3;
          margin-bottom: 0.55rem;
        }

        .lineup-insights :global(.insight-title) {
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
          overflow: hidden;
          color: #211d1e;
          font-size: 0.98rem;
          line-height: 1.38;
          font-weight: 950;
          overflow-wrap: anywhere;
        }

        .lineup-insights :global(.insight-value) {
          margin-top: auto;
          padding-top: 0.6rem;
          color: #6b1a2c;
          font-size: 0.98rem;
          font-style: italic;
          font-weight: 950;
        }

        .lineup-insights :global(.insight-card.good .insight-value) {
          color: #177245;
        }

        .lineup-insights :global(.insight-card.bad .insight-value) {
          color: #b42318;
        }

        .lineup-table-wrap {
          width: 100%;
          overflow-x: auto;
          border: 1px solid #eadfd5;
          border-radius: 18px;
          background: #fff;
        }

        table {
          width: 100%;
          min-width: 1540px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.82rem;
        }

        th {
          position: sticky;
          top: 0;
          z-index: 3;
          min-height: 50px;
          background: linear-gradient(180deg, #7a1c32, #5a1325);
          color: #fff;
          padding: 0.85rem 0.65rem;
          text-align: center;
          vertical-align: middle;
          white-space: nowrap;
          font-weight: 950;
          border-right: 1px solid rgba(255, 255, 255, 0.14);
        }

        th:first-child,
        td:first-child {
          position: sticky;
          left: 0;
          width: 270px;
          min-width: 270px;
          max-width: 270px;
          text-align: left;
        }

        th:first-child {
          z-index: 5;
          background: #65162a;
          padding-left: 1rem;
        }

        td {
          height: 58px;
          padding: 0.82rem 0.65rem;
          border-right: 1px solid #e8e3df;
          border-bottom: 1px solid #e8e3df;
          text-align: center;
          vertical-align: middle;
          white-space: nowrap;
          background: #fff;
          color: #211d1e;
          font-weight: 750;
        }

        td:first-child {
          z-index: 2;
          background: #f7f7f7;
          padding-left: 1rem;
        }

        tbody tr:nth-child(even) td:not(:first-child) {
          background: #fcfaf9;
        }

        tbody tr:hover td {
          background: #fff7ea;
        }

        tbody tr:hover td:first-child {
          background: #f3e8df;
        }

        .lineup-label {
          color: #6b1a2c;
          font-weight: 950;
          white-space: normal !important;
          line-height: 1.42;
          overflow-wrap: anywhere;
        }

        .good {
          color: #177245;
          font-weight: 950;
        }

        .bad {
          color: #b42318;
          font-weight: 950;
        }

        @media (max-width: 1100px) {
          .lineup-insights {
            grid-template-columns: repeat(2, 1fr);
          }

          .lineup-insights :global(.insight-card:nth-child(3)) {
            border-left: 0;
            border-top: 1px solid #ece4dd;
          }

          .lineup-insights :global(.insight-card:nth-child(4)) {
            border-top: 1px solid #ece4dd;
          }
        }

        @media (max-width: 700px) {
          .lineups-card {
            padding: 1rem;
          }

          .lineup-insights {
            grid-template-columns: 1fr;
          }

          .lineup-insights :global(.insight-card + .insight-card) {
            border-left: 0;
            border-top: 1px solid #ece4dd;
          }

          th:first-child,
          td:first-child {
            width: 220px;
            min-width: 220px;
            max-width: 220px;
          }
        }
      `}</style>
    </section>
  );
}




/* ---------- 4. RECORDS ---------- */

type RecordLine = {
  label: string;
  value: number;
  opponent: string;
};

function TeamSeasonRecordsBlock({ teamId }: { teamId: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<SupaMatchRow[]>([]);
  const [rows, setRows] = useState<SupaStatRow[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const { data: matchData, error: matchError } = await supabase
        .from("match_stats")
        .select("id, opponent, match_date, us_score, them_score, home")
        .eq("team_id", teamId)
        .order("match_date", { ascending: false });

      if (!active) return;

      if (matchError) {
        console.error("Erreur records matchs :", matchError);
        setMatches([]);
        setRows([]);
        setLoading(false);
        return;
      }

      const matchRows = (matchData ?? []) as SupaMatchRow[];
      setMatches(matchRows);

      const matchIds = matchRows.map((m) => m.id);

      if (matchIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: statData, error: statError } = await supabase
        .from("match_player_stats")
        .select("match_id, p3m, off_reb, def_reb, reb, ast, stl, present")
        .in("match_id", matchIds);

      if (!active) return;

      if (statError) {
        console.error("Erreur records stats :", statError);
        setRows([]);
      } else {
        setRows(
          ((statData ?? []) as SupaStatRow[]).filter(
            (r) => r.present !== false,
          ),
        );
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [supabase, teamId]);

  const records = useMemo(() => {
    const byMatch = matches.reduce(
      (acc, match) => {
        acc[match.id] = {
          match,
          pts: safeNum(match.us_score),
          diff: safeNum(match.us_score) - safeNum(match.them_score),
          reb: 0,
          ast: 0,
          p3m: 0,
          stl: 0,
        };

        return acc;
      },
      {} as Record<
        string,
        {
          match: SupaMatchRow;
          pts: number;
          diff: number;
          reb: number;
          ast: number;
          p3m: number;
          stl: number;
        }
      >,
    );

    rows.forEach((row) => {
      const matchId = String(row.match_id || "");
      const box = byMatch[matchId];
      if (!box) return;

      box.reb +=
        safeNum(row.reb) || safeNum(row.off_reb) + safeNum(row.def_reb);
      box.ast += safeNum(row.ast);
      box.p3m += safeNum(row.p3m);
      box.stl += safeNum(row.stl);
    });

    const list = Object.values(byMatch);

    const best = (
      label: string,
      getter: (row: (typeof list)[number]) => number,
    ): RecordLine => {
      const sorted = [...list].sort((a, b) => getter(b) - getter(a));
      const top = sorted[0];

      if (!top) return { label, value: 0, opponent: "—" };

      return {
        label,
        value: getter(top),
        opponent: top.match.opponent || "Adversaire",
      };
    };

    return [
      best("Meilleur score", (row) => row.pts),
      best("Plus gros écart", (row) => row.diff),
      best("Plus de rebonds", (row) => row.reb),
      best("Plus de passes", (row) => row.ast),
      best("Plus de 3PTS", (row) => row.p3m),
      best("Plus d'interceptions", (row) => row.stl),
    ];
  }, [matches, rows]);

  return (
    <section className="tl-card records-card">
      <div className="block-head">
        <div>
          <p className="eyebrow">Records</p>
          <h2>Records de la saison</h2>
          <p className="muted">Les meilleures performances collectives.</p>
        </div>
      </div>

      {loading && <div className="empty">Chargement...</div>}

      {!loading && matches.length === 0 && (
        <div className="empty">Aucun record disponible pour le moment.</div>
      )}

      {!loading && matches.length > 0 && (
        <div className="records-grid">
          {records.map((record) => (
            <article key={record.label} className="record-box">
              <span>{record.label}</span>
              <strong>{record.value}</strong>
              <small>vs {record.opponent}</small>
            </article>
          ))}
        </div>
      )}

      <style jsx>{`
        .records-card {
          margin-top: 1.2rem;
        }
        .block-head {
          margin-bottom: 1rem;
        }
        .eyebrow {
          margin: 0;
          color: #d4a24c;
          font-size: 0.78rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        h2 {
          margin: 0.2rem 0 0;
          color: #6b1a2c;
          font-size: 1.45rem;
          font-weight: 900;
        }
        .muted {
          margin: 0.25rem 0 0;
          color: #9a8a82;
          font-size: 0.92rem;
        }
        .empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 14px;
          padding: 1rem;
          color: #6b1a2c;
          font-weight: 900;
        }
        .records-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .record-box {
          border: 1px solid #efe6db;
          border-radius: 16px;
          background: linear-gradient(180deg, #fffdf9, #fff);
          padding: 0.95rem;
          min-height: 118px;
        }
        .record-box span {
          display: block;
          color: #9a8a82;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
        }
        .record-box strong {
          display: block;
          color: #6b1a2c;
          font-size: 1.7rem;
          font-weight: 900;
          margin-top: 0.35rem;
        }
        .record-box small {
          display: block;
          color: #d4a24c;
          font-weight: 900;
          margin-top: 0.25rem;
        }
        @media (max-width: 1200px) {
          .records-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 700px) {
          .records-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}


function LinkedDashboardStatsBlock({
  dashboard,
  players,
}: {
  dashboard: TeamDashboardData;
  players: Player[];
}) {
  type StatTotals = {
    pts: number;
    reb: number;
    ast: number;
    stl: number;
    blk: number;
    turnovers: number;
  };

  const totals = dashboard.statRows.reduce<StatTotals>(
    (acc, row) => {
      const pts =
        safeNum(row.pts) ||
        safeNum(row.p2m) * 2 + safeNum(row.p3m) * 3 + safeNum(row.ftm);

      const reb = safeNum(row.reb) || safeNum(row.off_reb) + safeNum(row.def_reb);

      acc.pts += pts;
      acc.reb += reb;
      acc.ast += safeNum(row.ast);
      acc.stl += safeNum(row.stl);
      acc.blk += safeNum(row.blk);
      acc.turnovers += safeNum(row.turnovers);

      return acc;
    },
    {
      pts: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      turnovers: 0,
    }
  );

  const games = Math.max(1, dashboard.matches.length);

  const byPlayer = dashboard.statRows.reduce<
    Record<string, { games: number; pts: number; reb: number; ast: number }>
  >((acc, row) => {
    const id = String(row.player_id || "");

    if (!id) return acc;

    if (!acc[id]) {
      acc[id] = { games: 0, pts: 0, reb: 0, ast: 0 };
    }

    const pts =
      safeNum(row.pts) ||
      safeNum(row.p2m) * 2 + safeNum(row.p3m) * 3 + safeNum(row.ftm);

    const reb = safeNum(row.reb) || safeNum(row.off_reb) + safeNum(row.def_reb);

    acc[id].games += 1;
    acc[id].pts += pts;
    acc[id].reb += reb;
    acc[id].ast += safeNum(row.ast);

    return acc;
  }, {});

  const leaders = Object.entries(byPlayer)
    .map(([playerId, row]) => {
      const player = players.find((p) => String(p.id) === String(playerId));

      return {
        playerId,
        name: player
          ? `${player.firstName ?? ""} ${player.lastName ?? ""}`.trim()
          : playerId,
        pts: row.games ? r1(row.pts / row.games) : 0,
        reb: row.games ? r1(row.reb / row.games) : 0,
        ast: row.games ? r1(row.ast / row.games) : 0,
      };
    })
    .sort((a, b) => b.pts - a.pts)
    .slice(0, 6);

  return (
    <section className="tl-card linked-dashboard-block">
      <div className="block-head">
        <div>
          <p className="eyebrow">Synthèse liée</p>
          <h2>Stats importées Live Stats</h2>
          <p className="muted">
            Ces données viennent de Supabase ou du miroir local créé au moment où
            tu termines un match live.
          </p>
        </div>
      </div>

      <div className="quick-kpis">
        <MiniKpi label="Matchs" value={dashboard.matches.length} />
        <MiniKpi label="PTS moy." value={r1(totals.pts / games)} />
        <MiniKpi label="REB moy." value={r1(totals.reb / games)} />
        <MiniKpi label="PD moy." value={r1(totals.ast / games)} />
        <MiniKpi label="INT total" value={totals.stl} />
        <MiniKpi label="BP total" value={totals.turnovers} />
      </div>

      <div className="stats-table">
        <table>
          <thead>
            <tr>
              <th>Joueur</th>
              <th>PTS</th>
              <th>REB</th>
              <th>PD</th>
            </tr>
          </thead>

          <tbody>
            {leaders.length ? (
              leaders.map((row) => (
                <tr key={row.playerId}>
                  <td className="label">{row.name}</td>
                  <td>{row.pts}</td>
                  <td>{row.reb}</td>
                  <td>{row.ast}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>Aucune statistique liée pour le moment.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .linked-dashboard-block {
          margin-top: 1.2rem;
        }

        .block-head {
          margin-bottom: 1rem;
        }

        .eyebrow {
          margin: 0;
          color: #d4a24c;
          font-size: 0.78rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        h2 {
          margin: 0.2rem 0 0;
          color: #6b1a2c;
          font-size: 1.45rem;
          font-weight: 900;
        }

        .muted {
          margin: 0.25rem 0 0;
          color: #9a8a82;
          font-size: 0.92rem;
        }

        .quick-kpis {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .stats-table {
          width: 100%;
          overflow-x: auto;
          border: 1px solid #efe6db;
          border-radius: 16px;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.86rem;
        }

        th {
          background: #6b1a2c;
          color: #fff;
          padding: 0.7rem;
          text-align: left;
        }

        td {
          border-top: 1px solid #eee;
          padding: 0.7rem;
          font-weight: 800;
        }

        .label {
          color: #6b1a2c;
          font-weight: 900;
        }

        @media (max-width: 900px) {
          .quick-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </section>
  );
}

function LiveStatsSourceBanner({
  dashboard,
}: {
  dashboard: TeamDashboardData;
}) {
  return (
    <section className="tl-card live-source-card">
      <div>
        <p className="eyebrow">Source des données</p>
        <h2>Live Stats Supabase</h2>
        <p className="muted">
          Cette fiche est reliée aux matchs enregistrés depuis la prise de stats
          live : table match_stats pour les résultats, match_player_stats pour
          les boxscores joueurs et match_actions pour les temps forts de jeu.
        </p>
      </div>

      <div className="live-source-grid">
        <MiniKpi label="Matchs liés" value={dashboard.matches.length} />
        <MiniKpi label="Lignes joueurs" value={dashboard.statRows.length} />
        <MiniKpi label="Actions jeu" value={dashboard.actionRows.length} />
        <MiniKpi label="Présences" value={dashboard.attendanceRows.length} />
      </div>

      <style jsx>{`
        .live-source-card {
          margin-top: 1.2rem;
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 1rem;
          align-items: center;
        }
        .eyebrow {
          margin: 0;
          color: #d4a24c;
          font-size: 0.78rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        h2 {
          margin: 0.2rem 0 0;
          color: #6b1a2c;
          font-size: 1.45rem;
          font-weight: 900;
        }
        .muted {
          margin: 0.25rem 0 0;
          color: #9a8a82;
          font-size: 0.92rem;
          line-height: 1.45;
        }
        .live-source-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.65rem;
        }
        @media (max-width: 900px) {
          .live-source-card {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  );
}


function localMatchLinePoints(line: any) {
  return safeNum(line.pts) || safeNum(line.pts2made) * 2 + safeNum(line.pts3made) * 3 + safeNum(line.ftMade ?? line.ftm);
}

function LocalStatsFallbackPanel({ team }: { team: Team }) {
  const records = team.statsHistory || [];
  const playersById = (team.players || []).reduce((acc: Record<string, Player>, player) => {
    acc[String(player.id)] = player;
    return acc;
  }, {});

  const playerRows = useMemo(() => {
    const grouped: Record<string, any> = {};

    records.forEach((match: any) => {
      (match.players || []).forEach((line: any) => {
        if (!line.played) return;
        const id = String(line.playerId || "");
        if (!id) return;
        const player = playersById[id];
        if (!grouped[id]) {
          grouped[id] = {
            id,
            name: player ? `${player.firstName} ${player.lastName}` : id,
            games: 0,
            pts: 0,
            reb: 0,
            ast: 0,
            stl: 0,
            blk: 0,
          };
        }
        grouped[id].games += 1;
        grouped[id].pts += localMatchLinePoints(line);
        grouped[id].reb += safeNum(line.reb) || safeNum(line.rebOff) + safeNum(line.rebDef);
        grouped[id].ast += safeNum(line.ast);
        grouped[id].stl += safeNum(line.stl);
        grouped[id].blk += safeNum(line.blk);
      });
    });

    return Object.values(grouped)
      .map((row: any) => ({
        ...row,
        ptsAvg: row.games ? r1(row.pts / row.games) : 0,
        rebAvg: row.games ? r1(row.reb / row.games) : 0,
        astAvg: row.games ? r1(row.ast / row.games) : 0,
        stlAvg: row.games ? r1(row.stl / row.games) : 0,
      }))
      .sort((a: any, b: any) => b.ptsAvg - a.ptsAvg);
  }, [records, playersById]);

  const teamTotals = useMemo(() => {
    const games = records.length;
    const wins = records.filter((m: any) => safeNum(m.scoreUs) > safeNum(m.scoreThem)).length;
    const losses = records.filter((m: any) => safeNum(m.scoreUs) < safeNum(m.scoreThem)).length;
    const ptsFor = records.reduce((sum: number, m: any) => sum + safeNum(m.scoreUs), 0);
    const ptsAgainst = records.reduce((sum: number, m: any) => sum + safeNum(m.scoreThem), 0);
    return { games, wins, losses, ptsFor, ptsAgainst };
  }, [records]);

  if (records.length === 0) return null;

  return (
    <section className="tl-card local-stats-fallback">
      <div className="local-head">
        <div>
          <p className="eyebrow">Stats importées</p>
          <h2>Stats Live reliées à l'équipe</h2>
          <p className="muted">
            Affichage depuis l'historique local alimenté automatiquement après l'enregistrement Live Stats.
          </p>
        </div>
      </div>

      <div className="quick-kpis local-kpis">
        <MiniKpi label="Matchs" value={teamTotals.games} />
        <MiniKpi label="Victoires" value={teamTotals.wins} />
        <MiniKpi label="Défaites" value={teamTotals.losses} />
        <MiniKpi label="Pts marqués" value={teamTotals.games ? r1(teamTotals.ptsFor / teamTotals.games) : 0} />
        <MiniKpi label="Pts encaissés" value={teamTotals.games ? r1(teamTotals.ptsAgainst / teamTotals.games) : 0} />
        <MiniKpi label="Diff." value={teamTotals.games ? r1((teamTotals.ptsFor - teamTotals.ptsAgainst) / teamTotals.games) : 0} />
      </div>

      <div className="local-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Joueur</th>
              <th>MJ</th>
              <th>PTS</th>
              <th>REB</th>
              <th>PD</th>
              <th>INT</th>
              <th>CTR</th>
            </tr>
          </thead>
          <tbody>
            {playerRows.map((row: any) => (
              <tr key={row.id}>
                <td className="name">{row.name}</td>
                <td>{row.games}</td>
                <td>{row.ptsAvg}</td>
                <td>{row.rebAvg}</td>
                <td>{row.astAvg}</td>
                <td>{row.stlAvg}</td>
                <td>{r1(row.blk / Math.max(1, row.games))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style jsx>{`
        .local-stats-fallback { margin-top: 1.2rem; border: 1px solid rgba(212, 162, 76, 0.45); }
        .local-head { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
        .eyebrow { margin: 0; color: #d4a24c; font-size: 0.78rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; }
        h2 { margin: 0.2rem 0 0; color: #6b1a2c; font-size: 1.45rem; font-weight: 900; }
        .muted { margin: 0.25rem 0 0; color: #9a8a82; font-size: 0.92rem; }
        .local-kpis { margin-bottom: 1rem; }
        .local-table-wrap { overflow-x: auto; border: 1px solid #efe6db; border-radius: 16px; }
        table { width: 100%; border-collapse: collapse; min-width: 720px; }
        th { background: #6b1a2c; color: #fff; padding: 0.75rem; text-align: center; font-weight: 900; }
        td { border-bottom: 1px solid #eee; padding: 0.75rem; text-align: center; font-weight: 800; }
        td.name { text-align: left; color: #6b1a2c; font-weight: 900; }
      `}</style>
    </section>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="tl-info-row">
      <span className="ic">
        <Ic d={icon} />
      </span>
      <span className="lbl">{label}</span>
      <span className="val">{value || "—"}</span>
    </div>
  );
}
