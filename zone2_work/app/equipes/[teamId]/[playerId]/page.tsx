// app/equipes/[teamId]/[playerId]/page.tsx
"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPlayer, getTeam, upsertPlayer } from "../../../../lib/equipes-store";
import PlayerForm from "../../../../components/equipes/PlayerForm";
import RadarChart from "../../../../components/equipes/RadarChart";
import DonutChart from "../../../../components/equipes/DonutChart";
import LineChart from "../../../../components/equipes/LineChart";
import { Jersey, Sparkline } from "../../../../components/equipes/Sparkline";
import type { Player, Team } from "../../../../types/player";
import { createClient } from "@/lib/supabase/client";
import { useLivestatTags } from "@/lib/livestat-tags";
import PlayerMontages from "@/components/players/PlayerMontages";
import ShotChart from "@/components/prise-stats-pro/ShotChart";
import AdvancedVideoEditor from "@/components/video-editor/AdvancedVideoEditor";

type PlayerExtra = Player & {
  licenceNumber?: string;
  tuteur1Phone?: string;
  tuteur1Email?: string;
  tuteur2Phone?: string;
  tuteur2Email?: string;
  school?: string;
  className?: string;
  nationality?: string;
  emergencyContact?: string;
};

const TABS = [
  "Aperçu",
  "Informations",
  "Stats & Vidéo",
  "Tests",
  "Médical",
  "Bilans",
  "Documents",
] as const;

type Tab = (typeof TABS)[number];

type TestCategory = "Anthropométrie" | "Athlétique" | "Endurance" | "Force" | "Mobilité";

type PlayerTest = {
  id: string;
  date: string;
  category: TestCategory;
  label: string;
  value: number;
  unit: string;
  notes?: string;
};

type GrowthProfile = {
  sex: "garcon" | "fille";
  fatherHeightCm: number | "";
  motherHeightCm: number | "";
  boneAge?: number | "";
  sittingHeightCm?: number | "";
  wingspanCm?: number | "";
};

type MedicalStatus = "Disponible" | "Blessé" | "Reprise" | "Aménagé" | "Absent";

type MedicalEntry = {
  id: string;
  date: string;
  status: MedicalStatus;
  zone: string;
  injury: string;
  severity: "Faible" | "Moyenne" | "Élevée";
  daysOff: number;
  notes: string;
};

type PlayerDocument = {
  id: string;
  date: string;
  title: string;
  category: "Administratif" | "Performance" | "Scolarité" | "Vidéo" | "Contrat" | "Autre";
  url?: string;
  notes?: string;
};

type RatingBlock = {
  physique: number;
  technique: number;
  tactique: number;
  mental: number;
  relationnel: number;
};

type PlayerBilan = {
  id: string;
  date: string;
  type: "Début de saison" | "Mi-saison" | "Fin de saison" | "Bilan libre";
  evaluator: string;
  seasonTeamNote: number;
  seasonTeamWhy: string;
  individualNote: number;
  individualWhy: string;
  playerRatings: RatingBlock;
  coachRatings: RatingBlock;
  strengthsPhysical: string;
  improvementsPhysical: string;
  strengthsTechnical: string;
  improvementsTechnical: string;
  strengthsTactical: string;
  improvementsTactical: string;
  strengthsMental: string;
  improvementsMental: string;
  strengthsRelational: string;
  improvementsRelational: string;
  keepAtClub: string;
  magicStructure: string;
  magicBasket: string;
  objectives: string;
  method: string;
  expectedRole: string;
  boardingPartner: string;
  familySummary: string;
  schoolReview: string;
  examsPreparation: string;
  orientationChoices: string;
  holidayPlanning: string;
  offseasonPriority: string;
  actionPlan1: string;
  actionPlan2: string;
  actionPlan3: string;
  coachConclusion: string;
};


type PlayerLiveMatchLine = {
  matchId: string;
  date: string;
  opponent: string;
  result: string;
  usScore: number;
  themScore: number;
  present: boolean;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  pf: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
};

type PlayerLiveTotals = {
  pts: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  offReb: number;
  defReb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  pf: number;
};

type PlayerLiveAverages = {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  pf: number;
  pctTir: number;
  pct3pts: number;
  pctLf: number;
};

type PlayerLiveStats = {
  hasData: boolean;
  totalRows: number;
  games: number;
  missedGames: number;
  attendancePct: number;
  totals: PlayerLiveTotals;
  averages: PlayerLiveAverages;
  matches: PlayerLiveMatchLine[];
  evolution: Array<{ label: string; value: number }>;
};


type TeamPlayerComparisonStat = {
  id: string;
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnovers: number;
  plus_minus: number;
};


const TEST_CATALOG: Array<{ category: TestCategory; label: string; unit: string }> = [
  { category: "Anthropométrie", label: "Taille", unit: "cm" },
  { category: "Anthropométrie", label: "Poids", unit: "kg" },
  { category: "Anthropométrie", label: "Envergure", unit: "cm" },
  { category: "Anthropométrie", label: "Taille assise", unit: "cm" },
  { category: "Anthropométrie", label: "Longueur main", unit: "cm" },
  { category: "Anthropométrie", label: "Largeur main", unit: "cm" },
  { category: "Athlétique", label: "Sprint 5m", unit: "s" },
  { category: "Athlétique", label: "Sprint 10m", unit: "s" },
  { category: "Athlétique", label: "Sprint 20m", unit: "s" },
  { category: "Athlétique", label: "Détente sèche", unit: "cm" },
  { category: "Athlétique", label: "Détente avec élan", unit: "cm" },
  { category: "Athlétique", label: "Lane Agility", unit: "s" },
  { category: "Athlétique", label: "T-Test", unit: "s" },
  { category: "Endurance", label: "VMA", unit: "km/h" },
  { category: "Endurance", label: "Yo-Yo IR1", unit: "m" },
  { category: "Endurance", label: "Yo-Yo IR2", unit: "m" },
  { category: "Endurance", label: "Luc Léger", unit: "palier" },
  { category: "Force", label: "Trap Bar", unit: "kg" },
  { category: "Force", label: "Squat", unit: "kg" },
  { category: "Force", label: "Développé couché", unit: "kg" },
];

const DEFAULT_GROWTH: GrowthProfile = {
  sex: "garcon",
  fatherHeightCm: "",
  motherHeightCm: "",
  boneAge: "",
  sittingHeightCm: "",
  wingspanCm: "",
};

const EMPTY_LIVE_TOTALS: PlayerLiveTotals = {
  pts: 0,
  p2m: 0,
  p2a: 0,
  p3m: 0,
  p3a: 0,
  ftm: 0,
  fta: 0,
  offReb: 0,
  defReb: 0,
  reb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  to: 0,
  pf: 0,
};

const EMPTY_LIVE_AVERAGES: PlayerLiveAverages = {
  pts: 0,
  reb: 0,
  ast: 0,
  stl: 0,
  blk: 0,
  to: 0,
  pf: 0,
  pctTir: 0,
  pct3pts: 0,
  pctLf: 0,
};

const EMPTY_LIVE_STATS: PlayerLiveStats = {
  hasData: false,
  totalRows: 0,
  games: 0,
  missedGames: 0,
  attendancePct: 0,
  totals: EMPTY_LIVE_TOTALS,
  averages: EMPTY_LIVE_AVERAGES,
  matches: [],
  evolution: [],
};


const emptyBilan = (): PlayerBilan => ({
  id: uid(),
  date: new Date().toISOString().slice(0, 10),
  type: "Fin de saison",
  evaluator: "",
  seasonTeamNote: 5,
  seasonTeamWhy: "",
  individualNote: 5,
  individualWhy: "",
  playerRatings: { physique: 5, technique: 5, tactique: 5, mental: 5, relationnel: 5 },
  coachRatings: { physique: 5, technique: 5, tactique: 5, mental: 5, relationnel: 5 },
  strengthsPhysical: "",
  improvementsPhysical: "",
  strengthsTechnical: "",
  improvementsTechnical: "",
  strengthsTactical: "",
  improvementsTactical: "",
  strengthsMental: "",
  improvementsMental: "",
  strengthsRelational: "",
  improvementsRelational: "",
  keepAtClub: "",
  magicStructure: "",
  magicBasket: "",
  objectives: "",
  method: "",
  expectedRole: "",
  boardingPartner: "",
  familySummary: "",
  schoolReview: "",
  examsPreparation: "",
  orientationChoices: "",
  holidayPlanning: "",
  offseasonPriority: "",
  actionPlan1: "",
  actionPlan2: "",
  actionPlan3: "",
  coachConclusion: "",
});

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function storageKey(teamId: string, playerId: string, key: string) {
  return `mybasket_player_${teamId}_${playerId}_${key}`;
}

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // no-op
  }
}

function stars(n: number) {
  const full = Math.floor(n || 0);
  const half = (n || 0) - full >= 0.5;
  return "★".repeat(full) + (half ? "½" : "") + "☆".repeat(5 - full - (half ? 1 : 0));
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(+d)) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function statusClass(s: string) {
  return s === "Disponible" ? "dispo" : s === "Blessé" ? "blesse" : (s || "").toLowerCase();
}

function numberFromText(value: string | number | undefined | null) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const n = Number(String(value).replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseCm(value: string | number | undefined | null) {
  const n = numberFromText(value);
  if (!n) return 0;
  if (n < 3) return Math.round(n * 100);
  return Math.round(n);
}

function midParentTargetHeight(growth: GrowthProfile) {
  const father = Number(growth.fatherHeightCm);
  const mother = Number(growth.motherHeightCm);

  if (!father || !mother) return null;

  const target =
    growth.sex === "garcon"
      ? (father + mother + 13) / 2
      : (father + mother - 13) / 2;

  return Math.round(target * 10) / 10;
}

function predictedHeightRange(growth: GrowthProfile, currentHeightCm: number) {
  const target = midParentTargetHeight(growth);

  if (!target) {
    return {
      target: null,
      low: null,
      high: null,
      probable: currentHeightCm || null,
      confidence: "Renseigne la taille des deux parents.",
      method: "Taille cible parentale",
    };
  }

  const boneAge = Number(growth.boneAge || 0);
  let probable = target;
  let margin = 8.5;
  let method = "Taille cible parentale";

  if (boneAge > 0 && currentHeightCm > 0) {
    method = "Taille cible parentale + âge osseux";
    margin = 4;

    if (boneAge < 14 && growth.sex === "garcon") probable = Math.max(target, currentHeightCm + 6);
    if (boneAge >= 16 && growth.sex === "garcon") probable = Math.max(currentHeightCm, Math.min(target, currentHeightCm + 3));
    if (boneAge < 12 && growth.sex === "fille") probable = Math.max(target, currentHeightCm + 4);
    if (boneAge >= 14 && growth.sex === "fille") probable = Math.max(currentHeightCm, Math.min(target, currentHeightCm + 2));
  }

  return {
    target,
    low: Math.round((probable - margin) * 10) / 10,
    high: Math.round((probable + margin) * 10) / 10,
    probable: Math.round(probable * 10) / 10,
    confidence:
      boneAge > 0
        ? "Estimation améliorée : l'âge osseux réduit l'incertitude, mais ne remplace pas un avis médical."
        : "Estimation génétique large : ajoute l'âge osseux pour une projection plus fine.",
    method,
  };
}

function ratingAverage(r: RatingBlock) {
  return Math.round(((r.physique + r.technique + r.tactique + r.mental + r.relationnel) / 5) * 10) / 10;
}

function latestByLabel(tests: PlayerTest[], label: string) {
  return [...tests]
    .filter((t) => t.label === label)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

function trendByLabel(tests: PlayerTest[], label: string) {
  const rows = [...tests].filter((t) => t.label === label).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  return {
    first,
    last,
    diff: Math.round((last.value - first.value) * 10) / 10,
  };
}

function downloadText(filename: string, text: string, type = "text/plain") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function statNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundStat(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentStat(made: number, attempted: number): number {
  if (!attempted) return 0;
  return Math.round((made / attempted) * 1000) / 10;
}

function liveMatchDateLabel(value: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function computeLiveStats(rows: any[], matchesById: Map<string, any>): PlayerLiveStats {
  const allRows = rows ?? [];
  const presentRows = allRows.filter((row) => row.present !== false);
  const games = presentRows.length;
  const missedGames = Math.max(0, allRows.length - games);

  if (!allRows.length) {
    return EMPTY_LIVE_STATS;
  }

  const totals = presentRows.reduce<PlayerLiveTotals>(
    (acc, row) => {
      const offReb = statNumber(row.off_reb);
      const defReb = statNumber(row.def_reb);

      acc.pts += statNumber(row.pts);
      acc.p2m += statNumber(row.p2m);
      acc.p2a += statNumber(row.p2a);
      acc.p3m += statNumber(row.p3m);
      acc.p3a += statNumber(row.p3a);
      acc.ftm += statNumber(row.ftm);
      acc.fta += statNumber(row.fta);
      acc.offReb += offReb;
      acc.defReb += defReb;
      acc.reb += statNumber(row.reb) || offReb + defReb;
      acc.ast += statNumber(row.ast);
      acc.stl += statNumber(row.stl);
      acc.blk += statNumber(row.blk);
      acc.to += statNumber(row.turnovers);
      acc.pf += statNumber(row.pf);

      return acc;
    },
    { ...EMPTY_LIVE_TOTALS }
  );

  const avg = (value: number) => (games ? roundStat(value / games) : 0);

  const matches = allRows.map<PlayerLiveMatchLine>((row) => {
    const matchId = String(row.match_id ?? "");
    const match = matchesById.get(matchId);
    const offReb = statNumber(row.off_reb);
    const defReb = statNumber(row.def_reb);

    return {
      matchId,
      date: match?.match_date ?? row.created_at ?? "",
      opponent: match?.opponent ?? "Adversaire",
      result: match?.result ?? "",
      usScore: statNumber(match?.us_score),
      themScore: statNumber(match?.them_score),
      present: row.present !== false,
      pts: statNumber(row.pts),
      reb: statNumber(row.reb) || offReb + defReb,
      ast: statNumber(row.ast),
      stl: statNumber(row.stl),
      blk: statNumber(row.blk),
      to: statNumber(row.turnovers),
      pf: statNumber(row.pf),
      p2m: statNumber(row.p2m),
      p2a: statNumber(row.p2a),
      p3m: statNumber(row.p3m),
      p3a: statNumber(row.p3a),
      ftm: statNumber(row.ftm),
      fta: statNumber(row.fta),
    };
  });

  matches.sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return {
    hasData: allRows.length > 0,
    totalRows: allRows.length,
    games,
    missedGames,
    attendancePct: allRows.length ? Math.round((games / allRows.length) * 100) : 0,
    totals,
    averages: {
      pts: avg(totals.pts),
      reb: avg(totals.reb),
      ast: avg(totals.ast),
      stl: avg(totals.stl),
      blk: avg(totals.blk),
      to: avg(totals.to),
      pf: avg(totals.pf),
      pctTir: percentStat(totals.p2m + totals.p3m, totals.p2a + totals.p3a),
      pct3pts: percentStat(totals.p3m, totals.p3a),
      pctLf: percentStat(totals.ftm, totals.fta),
    },
    matches,
    evolution: matches
      .filter((match) => match.present)
      .map((match) => ({
        label: liveMatchDateLabel(match.date),
        value: match.pts,
      })),
  };
}


function getPlayerFirstName(player: any): string | null {
  return player?.first_name ?? player?.firstName ?? null;
}

function getPlayerLastName(player: any): string | null {
  return player?.last_name ?? player?.lastName ?? null;
}

function getPlayerPosition(player: any): string | null {
  return player?.position ?? player?.postePrincipal ?? null;
}

function computeTeamPlayersComparisonStats(
  rows: any[],
  players: any[]
): TeamPlayerComparisonStat[] {
  const rowsByPlayer = new Map<string, any[]>();

  for (const row of rows ?? []) {
    const statPlayerId = String(row.player_id ?? "");
    if (!statPlayerId) continue;

    if (!rowsByPlayer.has(statPlayerId)) {
      rowsByPlayer.set(statPlayerId, []);
    }

    rowsByPlayer.get(statPlayerId)?.push(row);
  }

  const knownPlayers = (players ?? []).map((player) => ({
    id: String(player.id ?? player.player_id ?? ""),
    first_name: getPlayerFirstName(player),
    last_name: getPlayerLastName(player),
    position: getPlayerPosition(player),
  }));

  const missingPlayersFromStats = Array.from(rowsByPlayer.keys())
    .filter((statPlayerId) => !knownPlayers.some((player) => player.id === statPlayerId))
    .map((statPlayerId) => ({
      id: statPlayerId,
      first_name: null,
      last_name: null,
      position: null,
    }));

  return [...knownPlayers, ...missingPlayersFromStats]
    .filter((player) => Boolean(player.id))
    .map((player) => {
      const playerRows = rowsByPlayer.get(player.id) ?? [];
      const presentRows = playerRows.filter((row) => row.present !== false);
      const games = presentRows.length || 1;

      const totals = presentRows.reduce(
        (acc, row) => {
          const offReb = statNumber(row.off_reb);
          const defReb = statNumber(row.def_reb);

          acc.pts += statNumber(row.pts);
          acc.reb += statNumber(row.reb) || offReb + defReb;
          acc.ast += statNumber(row.ast);
          acc.stl += statNumber(row.stl);
          acc.blk += statNumber(row.blk);
          acc.turnovers += statNumber(row.turnovers);
          acc.plus_minus += statNumber(row.plus_minus);

          return acc;
        },
        {
          pts: 0,
          reb: 0,
          ast: 0,
          stl: 0,
          blk: 0,
          turnovers: 0,
          plus_minus: 0,
        }
      );

      return {
        id: player.id,
        player_id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        position: player.position,
        pts: roundStat(totals.pts / games),
        reb: roundStat(totals.reb / games),
        ast: roundStat(totals.ast / games),
        stl: roundStat(totals.stl / games),
        blk: roundStat(totals.blk / games),
        turnovers: roundStat(totals.turnovers / games),
        plus_minus: roundStat(totals.plus_minus / games),
      };
    });
}

/* ============================================================
 * LiveStat — rentabilité par temps fort (lecture match_actions)
 * Ajout non intrusif : ne touche pas aux stats existantes.
 * ============================================================ */
function matchActionPoints(a: any): number {
  if (a.context === "defense") return 0;
  const shotType = a.shot_type;
  const made = a.shot_result === "made";
  const ftMade = statNumber(a.ft_made);
  let p = 0;
  if (shotType === "LF") p += ftMade;
  else if (a.action_type === "tir" && made) {
    if (shotType === "2PTS") p = 2;
    else if (shotType === "3PTS") p = 3;
  }
  if (a.action_type === "tir" && shotType !== "LF" && made && a.special_case && a.special_case !== "aucun") {
    p += ftMade;
  }
  return p;
}

type PlayerTfRow = { key: string; actions: number; points: number; ppa: number; clips: number };

function computePlayerTempsFortRentability(actions: any[]): PlayerTfRow[] {
  const map = new Map<string, { actions: number; points: number; clips: number }>();

  for (const a of actions ?? []) {
    const key = a.temps_fort;
    if (!key) continue;

    if (!map.has(key)) map.set(key, { actions: 0, points: 0, clips: 0 });
    const row = map.get(key)!;

    row.actions += 1;
    row.points += matchActionPoints(a);
    if (a.clip_start != null || a.video_time != null) row.clips += 1;
  }

  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      actions: v.actions,
      points: v.points,
      ppa: v.actions ? roundStat(v.points / v.actions) : 0,
      clips: v.clips,
    }))
    .sort((a, b) => b.points - a.points);
}

export default function JoueurDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; playerId: string }>;
}) {
  const { teamId, playerId } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const tags = useLivestatTags(teamId);

  const [player, setPlayer] = useState<PlayerExtra | undefined>();
  const [team, setTeam] = useState<Team | undefined>();
  const [identityLoading, setIdentityLoading] = useState(true);
  const [liveStats, setLiveStats] = useState<PlayerLiveStats>(EMPTY_LIVE_STATS);
  const [playerActions, setPlayerActions] = useState<any[]>([]);
  const [teamPlayersStats, setTeamPlayersStats] = useState<TeamPlayerComparisonStat[]>([]);
  const [tab, setTab] = useState<Tab>("Aperçu");
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState("");

  const [tests, setTests] = useState<PlayerTest[]>([]);
  const [growth, setGrowth] = useState<GrowthProfile>(DEFAULT_GROWTH);
  const [medical, setMedical] = useState<MedicalEntry[]>([]);
  const [documents, setDocuments] = useState<PlayerDocument[]>([]);
  const [bilans, setBilans] = useState<PlayerBilan[]>([]);

  const [testModal, setTestModal] = useState(false);
  const [medicalModal, setMedicalModal] = useState(false);
  const [docModal, setDocModal] = useState(false);
  const [docUploading, setDocUploading] = useState(false);
  const [docUploadName, setDocUploadName] = useState("");
  const [bilanModal, setBilanModal] = useState<PlayerBilan | null>(null);

  const [testDraft, setTestDraft] = useState<PlayerTest>({
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    category: "Anthropométrie",
    label: "Taille",
    value: 0,
    unit: "cm",
    notes: "",
  });

  const [medicalDraft, setMedicalDraft] = useState<MedicalEntry>({
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    status: "Disponible",
    zone: "",
    injury: "",
    severity: "Faible",
    daysOff: 0,
    notes: "",
  });

  const [docDraft, setDocDraft] = useState<PlayerDocument>({
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    title: "",
    category: "Administratif",
    url: "",
    notes: "",
  });

  const printRef = useRef<HTMLDivElement | null>(null);

  async function reload() {
    setIdentityLoading(true);
    try {
      const [playerData, teamData] = await Promise.all([
        getPlayer(teamId, playerId),
        getTeam(teamId),
      ]);

      setPlayer(playerData as PlayerExtra | undefined);
      setTeam(teamData);
    } catch (error) {
      console.error("Erreur chargement joueur:", error);
      setPlayer(undefined);
      setTeam(undefined);
    } finally {
      setIdentityLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [teamId, playerId]);

  useEffect(() => {
    let active = true;

    async function loadPlayerSupabaseData() {
      try {
        const [
          testsRes,
          growthRes,
          medicalRes,
          documentsRes,
          bilansRes,
        ] = await Promise.all([
          supabase
            .from("player_tests")
            .select("*")
            .eq("team_id", teamId)
            .eq("player_id", playerId)
            .order("date", { ascending: true }),

          supabase
            .from("player_growth_profiles")
            .select("*")
            .eq("team_id", teamId)
            .eq("player_id", playerId)
            .maybeSingle(),

          supabase
            .from("player_medical_entries")
            .select("*")
            .eq("team_id", teamId)
            .eq("player_id", playerId)
            .order("date", { ascending: false }),

          supabase
            .from("player_documents")
            .select("*")
            .eq("team_id", teamId)
            .eq("player_id", playerId)
            .order("date", { ascending: false }),

          supabase
            .from("player_bilans")
            .select("*")
            .eq("team_id", teamId)
            .eq("player_id", playerId)
            .order("date", { ascending: false }),
        ]);

        if (!active) return;

        if (testsRes.error) console.error("Erreur chargement tests joueur :", testsRes.error);
        if (growthRes.error) console.error("Erreur chargement projection joueur :", growthRes.error);
        if (medicalRes.error) console.error("Erreur chargement médical joueur :", medicalRes.error);
        if (documentsRes.error) console.error("Erreur chargement documents joueur :", documentsRes.error);
        if (bilansRes.error) console.error("Erreur chargement bilans joueur :", bilansRes.error);

        setTests(
          ((testsRes.data ?? []) as any[]).map((row) => ({
            id: row.id,
            date: row.date,
            category: row.category,
            label: row.label,
            value: Number(row.value ?? 0),
            unit: row.unit,
            notes: row.notes ?? "",
          }))
        );

        if (growthRes.data) {
          const row: any = growthRes.data;

          setGrowth({
            sex: row.sex ?? "garcon",
            fatherHeightCm: row.father_height_cm ?? "",
            motherHeightCm: row.mother_height_cm ?? "",
            boneAge: row.bone_age ?? "",
            sittingHeightCm: row.sitting_height_cm ?? "",
            wingspanCm: row.wingspan_cm ?? "",
          });
        } else {
          setGrowth(DEFAULT_GROWTH);
        }

        setMedical(
          ((medicalRes.data ?? []) as any[]).map((row) => ({
            id: row.id,
            date: row.date,
            status: row.status,
            zone: row.zone ?? "",
            injury: row.injury ?? "",
            severity: row.severity ?? "Faible",
            daysOff: Number(row.days_off ?? 0),
            notes: row.notes ?? "",
          }))
        );

        setDocuments(
          ((documentsRes.data ?? []) as any[]).map((row) => ({
            id: row.id,
            date: row.date,
            title: row.title,
            category: row.category,
            url: row.url ?? "",
            notes: row.notes ?? "",
          }))
        );

        setBilans(
          ((bilansRes.data ?? []) as any[]).map((row) => ({
            ...emptyBilan(),
            id: row.id,
            date: row.date,
            type: row.type,
            evaluator: row.evaluator ?? "",
            seasonTeamNote: Number(row.season_team_note ?? 5),
            seasonTeamWhy: row.season_team_why ?? "",
            individualNote: Number(row.individual_note ?? 5),
            individualWhy: row.individual_why ?? "",
            playerRatings: row.player_ratings ?? { physique: 5, technique: 5, tactique: 5, mental: 5, relationnel: 5 },
            coachRatings: row.coach_ratings ?? { physique: 5, technique: 5, tactique: 5, mental: 5, relationnel: 5 },
            strengthsPhysical: row.strengths_physical ?? "",
            improvementsPhysical: row.improvements_physical ?? "",
            strengthsTechnical: row.strengths_technical ?? "",
            improvementsTechnical: row.improvements_technical ?? "",
            strengthsTactical: row.strengths_tactical ?? "",
            improvementsTactical: row.improvements_tactical ?? "",
            strengthsMental: row.strengths_mental ?? "",
            improvementsMental: row.improvements_mental ?? "",
            strengthsRelational: row.strengths_relational ?? "",
            improvementsRelational: row.improvements_relational ?? "",
            keepAtClub: row.keep_at_club ?? "",
            magicStructure: row.magic_structure ?? "",
            magicBasket: row.magic_basket ?? "",
            objectives: row.objectives ?? "",
            method: row.method ?? "",
            expectedRole: row.expected_role ?? "",
            boardingPartner: row.boarding_partner ?? "",
            familySummary: row.family_summary ?? "",
            schoolReview: row.school_review ?? "",
            examsPreparation: row.exams_preparation ?? "",
            orientationChoices: row.orientation_choices ?? "",
            holidayPlanning: row.holiday_planning ?? "",
            offseasonPriority: row.offseason_priority ?? "",
            actionPlan1: row.action_plan_1 ?? "",
            actionPlan2: row.action_plan_2 ?? "",
            actionPlan3: row.action_plan_3 ?? "",
            coachConclusion: row.coach_conclusion ?? "",
          }))
        );
      } catch (error) {
        console.error("Erreur chargement données joueur Supabase :", error);
        if (!active) return;
        setTests([]);
        setGrowth(DEFAULT_GROWTH);
        setMedical([]);
        setDocuments([]);
        setBilans([]);
      }
    }

    loadPlayerSupabaseData();

    return () => {
      active = false;
    };
  }, [supabase, teamId, playerId]);

  useEffect(() => {
    let active = true;

    async function loadSupabaseStats() {
      setLiveStats(EMPTY_LIVE_STATS);
      setTeamPlayersStats([]);

      try {
        const { data: rows, error: rowsError } = await supabase
          .from("match_player_stats")
          .select("*")
          .eq("team_id", teamId);

        if (rowsError) throw rowsError;
        if (!active) return;

        const allTeamRows = (rows ?? []) as any[];

        // §23 · le classement / la comparaison ne doivent compter que les matchs
        // TERMINÉS. On récupère le statut de tous les matchs de l'équipe et on
        // écarte les lignes rattachées à un brouillon (project_status = 'draft').
        const allMatchIds = Array.from(new Set(allTeamRows.map((r) => String(r.match_id ?? "")).filter(Boolean)));
        const draftMatchIds = new Set<string>();
        if (allMatchIds.length > 0) {
          const { data: statusRows } = await supabase
            .from("match_stats")
            .select("id, project_status")
            .in("id", allMatchIds);
          (statusRows ?? []).forEach((m: any) => { if (m.project_status === "draft") draftMatchIds.add(String(m.id)); });
        }
        const completedTeamRows = allTeamRows.filter((r) => !draftMatchIds.has(String(r.match_id ?? "")));

        const currentPlayerRows = completedTeamRows.filter(
          (row) => String(row.player_id ?? "") === String(playerId)
        );

        const matchIds = Array.from(
          new Set(
            currentPlayerRows
              .map((row) => String(row.match_id ?? ""))
              .filter(Boolean)
          )
        );

        let matchesById = new Map<string, any>();

        if (matchIds.length > 0) {
          const { data: matches, error: matchError } = await supabase
            .from("match_stats")
            .select("id, opponent, match_date, us_score, them_score, result")
            .in("id", matchIds);

          if (matchError) {
            console.error("Erreur chargement matchs pour fiche joueur :", matchError);
          }

          matchesById = new Map(
            ((matches ?? []) as any[]).map((match) => [String(match.id), match])
          );
        }

        if (!active) return;

        setLiveStats(computeLiveStats(currentPlayerRows, matchesById));
        setTeamPlayersStats(
          computeTeamPlayersComparisonStats(completedTeamRows, team?.players ?? [])
        );
      } catch (error) {
        console.error("Erreur chargement stats joueur Supabase :", error);

        if (active) {
          setLiveStats(EMPTY_LIVE_STATS);
          setTeamPlayersStats([]);
        }
      }
    }

    loadSupabaseStats();

    return () => {
      active = false;
    };
  }, [supabase, teamId, playerId, team?.players]);

  useEffect(() => {
    let active = true;

    async function loadPlayerActions() {
      try {
        const { data, error } = await supabase
          .from("match_actions")
          .select("*")
          .eq("team_id", teamId)
          .or(
            `player_id.eq.${playerId},assist_player_id.eq.${playerId},rebound_player_id.eq.${playerId}`
          );

        if (error) throw error;
        if (!active) return;
        setPlayerActions((data ?? []) as any[]);
      } catch (error) {
        console.error("Erreur chargement match_actions joueur :", error);
        if (active) setPlayerActions([]);
      }
    }

    loadPlayerActions();

    return () => {
      active = false;
    };
  }, [supabase, teamId, playerId]);

  const tfRentability = useMemo(
    () => computePlayerTempsFortRentability(playerActions),
    [playerActions]
  );

  async function requestActionExport(actionId: string) {
    if (!actionId) return;
    // Best-effort : nécessite les colonnes export_status / export_requested_at
    // (voir migration SQL). Non bloquant si absentes.
    try {
      const { error } = await supabase
        .from("match_actions")
        .update({
          export_status: "requested",
          export_requested_at: new Date().toISOString(),
        })
        .eq("id", actionId);

      if (error) {
        console.error("Demande d'export MP4 non enregistrée (non bloquant) :", error);
        return;
      }

      setPlayerActions((prev) =>
        prev.map((a) =>
          String(a.id) === String(actionId) ? { ...a, export_status: "requested" } : a
        )
      );
    } catch (error) {
      console.error("Demande d'export MP4 impossible (non bloquant) :", error);
    }
  }

  async function handleSave(p: Player) {
    try {
      await upsertPlayer(teamId, p);
      setEditing(false);
      await reload();
      flash("Fiche mise à jour ✓");
    } catch (error) {
      console.error("Erreur mise à jour joueur:", error);
      alert("Erreur pendant la mise à jour du joueur.");
    }
  }

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(""), 2200);
  }

  async function saveGrowthProfile(nextGrowth: GrowthProfile) {
    setGrowth(nextGrowth);

    const payload = {
      team_id: teamId,
      player_id: playerId,
      sex: nextGrowth.sex,
      father_height_cm: nextGrowth.fatherHeightCm === "" ? null : Number(nextGrowth.fatherHeightCm),
      mother_height_cm: nextGrowth.motherHeightCm === "" ? null : Number(nextGrowth.motherHeightCm),
      bone_age: nextGrowth.boneAge === "" ? null : Number(nextGrowth.boneAge || 0),
      sitting_height_cm: nextGrowth.sittingHeightCm === "" ? null : Number(nextGrowth.sittingHeightCm || 0),
      wingspan_cm: nextGrowth.wingspanCm === "" ? null : Number(nextGrowth.wingspanCm || 0),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("player_growth_profiles")
      .upsert(payload, { onConflict: "team_id,player_id" });

    if (error) {
      console.error("Erreur sauvegarde projection taille :", error);
    }
  }

  function exportProfile() {
    if (!player) return;

    downloadText(
      `${player.firstName}-${player.lastName}.json`,
      JSON.stringify({ player, liveStats, tests, growth, medical, documents, bilans }, null, 2),
      "application/json"
    );
  }

  function openNewTest() {
    setTestDraft({
      id: uid(),
      date: new Date().toISOString().slice(0, 10),
      category: "Anthropométrie",
      label: "Taille",
      value: 0,
      unit: "cm",
      notes: "",
    });
    setTestModal(true);
  }

  async function saveTest() {
    if (!testDraft.date || !testDraft.label || !testDraft.value) {
      alert("Date, test et valeur sont obligatoires.");
      return;
    }

    const payload = {
      id: testDraft.id || uid(),
      team_id: teamId,
      player_id: playerId,
      date: testDraft.date,
      category: testDraft.category,
      label: testDraft.label,
      value: Number(testDraft.value),
      unit: testDraft.unit,
      notes: testDraft.notes || null,
    };

    const { data, error } = await supabase
      .from("player_tests")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("Erreur ajout test joueur :", error);
      alert("Impossible d'enregistrer le test.");
      return;
    }

    const row: any = data;

    setTests((prev) => [
      ...prev,
      {
        id: row.id,
        date: row.date,
        category: row.category,
        label: row.label,
        value: Number(row.value ?? 0),
        unit: row.unit,
        notes: row.notes ?? "",
      },
    ]);

    setTestModal(false);
    flash("Test ajouté ✓");
  }

  async function saveMedical() {
    if (!medicalDraft.date || !medicalDraft.status) {
      alert("Date et statut sont obligatoires.");
      return;
    }

    const payload = {
      id: medicalDraft.id || uid(),
      team_id: teamId,
      player_id: playerId,
      date: medicalDraft.date,
      status: medicalDraft.status,
      zone: medicalDraft.zone || null,
      injury: medicalDraft.injury || null,
      severity: medicalDraft.severity,
      days_off: Number(medicalDraft.daysOff || 0),
      notes: medicalDraft.notes || null,
    };

    const { data, error } = await supabase
      .from("player_medical_entries")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("Erreur ajout médical joueur :", error);
      alert("Impossible d'enregistrer le suivi médical.");
      return;
    }

    const row: any = data;

    setMedical((prev) => [
      {
        id: row.id,
        date: row.date,
        status: row.status,
        zone: row.zone ?? "",
        injury: row.injury ?? "",
        severity: row.severity ?? "Faible",
        daysOff: Number(row.days_off ?? 0),
        notes: row.notes ?? "",
      },
      ...prev,
    ]);

    setMedicalModal(false);
    flash("Suivi médical ajouté ✓");
  }

  async function uploadPlayerDocument(file: File) {
    const allowed = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];

    if (!allowed.includes(file.type)) {
      alert("Formats acceptés : PDF, JPEG, PNG, WEBP et DOCX.");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      alert("Le fichier ne doit pas dépasser 25 Mo.");
      return;
    }

    setDocUploading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error("Utilisateur non connecté.");

      const safeName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${authData.user.id}/${teamId}/${playerId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("player-documents")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from("player-documents").getPublicUrl(path);
      setDocDraft((current) => ({
        ...current,
        title: current.title.trim() || file.name.replace(/\.[^.]+$/, ""),
        url: publicData.publicUrl,
      }));
      setDocUploadName(file.name);
      flash("Document envoyé dans Supabase ✓");
    } catch (error) {
      console.error("Erreur upload document joueur :", error);
      alert(error instanceof Error ? error.message : "Impossible d'envoyer le document.");
    } finally {
      setDocUploading(false);
    }
  }

  async function saveDocument() {
    if (!docDraft.title.trim()) {
      alert("Le titre du document est obligatoire.");
      return;
    }

    const payload = {
      id: docDraft.id || uid(),
      team_id: teamId,
      player_id: playerId,
      date: docDraft.date,
      title: docDraft.title.trim(),
      category: docDraft.category,
      url: docDraft.url || null,
      notes: docDraft.notes || null,
    };

    const { data, error } = await supabase
      .from("player_documents")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("Erreur ajout document joueur :", error);
      alert("Impossible d'enregistrer le document.");
      return;
    }

    const row: any = data;

    setDocuments((prev) => [
      {
        id: row.id,
        date: row.date,
        title: row.title,
        category: row.category,
        url: row.url ?? "",
        notes: row.notes ?? "",
      },
      ...prev,
    ]);

    setDocModal(false);
    setDocUploadName("");
    setDocDraft({
      id: uid(),
      date: new Date().toISOString().slice(0, 10),
      title: "",
      category: "Administratif",
      url: "",
      notes: "",
    });
    flash("Document ajouté ✓");
  }

  async function saveBilan() {
    if (!bilanModal) return;

    const payload = {
      id: bilanModal.id || uid(),
      team_id: teamId,
      player_id: playerId,
      date: bilanModal.date,
      type: bilanModal.type,
      evaluator: bilanModal.evaluator || null,
      season_team_note: bilanModal.seasonTeamNote,
      season_team_why: bilanModal.seasonTeamWhy || null,
      individual_note: bilanModal.individualNote,
      individual_why: bilanModal.individualWhy || null,
      player_ratings: bilanModal.playerRatings,
      coach_ratings: bilanModal.coachRatings,
      strengths_physical: bilanModal.strengthsPhysical || null,
      improvements_physical: bilanModal.improvementsPhysical || null,
      strengths_technical: bilanModal.strengthsTechnical || null,
      improvements_technical: bilanModal.improvementsTechnical || null,
      strengths_tactical: bilanModal.strengthsTactical || null,
      improvements_tactical: bilanModal.improvementsTactical || null,
      strengths_mental: bilanModal.strengthsMental || null,
      improvements_mental: bilanModal.improvementsMental || null,
      strengths_relational: bilanModal.strengthsRelational || null,
      improvements_relational: bilanModal.improvementsRelational || null,
      keep_at_club: bilanModal.keepAtClub || null,
      magic_structure: bilanModal.magicStructure || null,
      magic_basket: bilanModal.magicBasket || null,
      objectives: bilanModal.objectives || null,
      method: bilanModal.method || null,
      expected_role: bilanModal.expectedRole || null,
      boarding_partner: bilanModal.boardingPartner || null,
      family_summary: bilanModal.familySummary || null,
      school_review: bilanModal.schoolReview || null,
      exams_preparation: bilanModal.examsPreparation || null,
      orientation_choices: bilanModal.orientationChoices || null,
      holiday_planning: bilanModal.holidayPlanning || null,
      offseason_priority: bilanModal.offseasonPriority || null,
      action_plan_1: bilanModal.actionPlan1 || null,
      action_plan_2: bilanModal.actionPlan2 || null,
      action_plan_3: bilanModal.actionPlan3 || null,
      coach_conclusion: bilanModal.coachConclusion || null,
    };

    const { data, error } = await supabase
      .from("player_bilans")
      .upsert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("Erreur enregistrement bilan joueur :", error);
      alert("Impossible d'enregistrer le bilan.");
      return;
    }

    const saved: PlayerBilan = {
      ...bilanModal,
      id: String((data as any).id),
    };

    setBilans((prev) => {
      const exists = prev.some((b) => b.id === saved.id);
      if (exists) return prev.map((b) => (b.id === saved.id ? saved : b));
      return [saved, ...prev];
    });

    setBilanModal(null);
    flash("Bilan enregistré ✓");
  }

  function generateBilanPdf(bilan: PlayerBilan) {
    if (!player || !team) return;

    const html = bilanHtml(player, team, bilan, tests, medical, growth);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.src = url;
    iframe.onload = () => {
      window.setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
          iframe.remove();
        }, 1500);
      }, 350);
    };
    document.body.appendChild(iframe);
  }

  if (identityLoading) {
    return (
      <div className="player-page-light">
        <style jsx global>{PLAYER_PAGE_CSS}</style>
        <aside className="player-list-side"><div className="player-list-brand">🏀 MyBasket</div></aside>
        <main className="player-main"><p className="empty-player">Chargement de la fiche joueur…</p></main>
      </div>
    );
  }

  if (!player || !team) {
    return (
      <div className="player-page-light">
        <style jsx global>{PLAYER_PAGE_CSS}</style>
        <aside className="player-list-side"><div className="player-list-brand">🏀 MyBasket</div></aside>
        <main className="player-main">
          <p className="empty-player">Joueur introuvable.</p>
          <button className="back-btn" onClick={() => router.push(`/equipes/${teamId}`)}>Retour à l’équipe</button>
        </main>
      </div>
    );
  }

  const basePlayer: any = player;

  const p: any = {
    ...basePlayer,
    stats: liveStats.hasData
      ? {
          ...(basePlayer.stats ?? {}),
          pts: liveStats.averages.pts,
          reb: liveStats.averages.reb,
          ast: liveStats.averages.ast,
          stl: liveStats.averages.stl,
          blk: liveStats.averages.blk,
          to: liveStats.averages.to,
          pf: liveStats.averages.pf,
          pctTir: liveStats.averages.pctTir,
          pct3pts: liveStats.averages.pct3pts,
          pctLf: liveStats.averages.pctLf,
        }
      : basePlayer.stats,
    presencePct: liveStats.hasData ? liveStats.attendancePct : basePlayer.presencePct,
    evolution: liveStats.evolution.length ? liveStats.evolution : basePlayer.evolution,
  };

  const tdj = liveStats.hasData
    ? {
        ...(basePlayer.tempsDeJeu || {}),
        matchsJoues: liveStats.games,
        matchsManques: liveStats.missedGames,
        tempsMoyenMatchMin: basePlayer.tempsDeJeu?.tempsMoyenMatchMin || 0,
        tempsTotalLabel: basePlayer.tempsDeJeu?.tempsTotalLabel || "—",
      }
    : basePlayer.tempsDeJeu || {
        matchsJoues: 0,
        matchsManques: 0,
        tempsMoyenMatchMin: 0,
        tempsTotalLabel: "—",
      };

  const tdjPct =
    tdj.matchsJoues + tdj.matchsManques > 0
      ? Math.round((tdj.matchsJoues / (tdj.matchsJoues + tdj.matchsManques)) * 100)
      : 0;

  const cmp = p.comparaison || {
    pointsRang: 0,
    passesRang: 0,
    presencesRang: 0,
    noteCoachRang: 0,
    tempsJeuRang: 0,
    effectif: team.players?.length || 0,
  };

  const players = team.players || [];

  const latestHeight = latestByLabel(tests, "Taille");
  const latestWeight = latestByLabel(tests, "Poids");
  const latestWingspan = latestByLabel(tests, "Envergure");
  const currentHeightCm = latestHeight?.value || parseCm(p.taille);
  const growthPrediction = predictedHeightRange(growth, currentHeightCm);

  const latestBilan = [...bilans].sort((a, b) => b.date.localeCompare(a.date))[0];

  return (
    <div className="player-page-light">
      <style jsx global>{PLAYER_PAGE_CSS}</style>

      <aside className="player-list-side">
        <button className="player-back" onClick={() => router.push(`/equipes/${teamId}`)}>
          ← Retour équipe
        </button>

        <div className="player-list-brand">🏀 MyBasket</div>

        <div className="player-list-title">
          <strong>{team.name}</strong>
          <span>
            {players.length} joueur{players.length > 1 ? "s" : ""}
          </span>
        </div>

        <div className="player-list">
          {players.map((jp: any) => (
            <button
              key={jp.id}
              className={`player-list-item ${jp.id === playerId ? "active" : ""}`}
              onClick={() => router.push(`/equipes/${teamId}/${jp.id}`)}
            >
              <span className="mini-photo">
                {jp.photo ? <img src={jp.photo} alt="" /> : jp.firstName?.[0] || "?"}
              </span>

              <span className="mini-info">
                <strong>
                  {jp.firstName} {jp.lastName}
                </strong>
                <em>
                  #{jp.num ?? "—"} · {jp.postePrincipal}
                </em>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="player-main">
        <div className="player-topbar">
          <button className="player-back-inline" onClick={() => router.push(`/equipes/${teamId}`)}>
            ← Retour à l'équipe
          </button>

          <div className="player-actions">
            <button className="light-btn outline" onClick={exportProfile}>
              ⬇ Exporter le profil
            </button>

            <button className="light-btn primary" onClick={() => setEditing(true)}>
              ✎ Modifier
            </button>
          </div>
        </div>

        <section className="player-hero">
          <div className="player-photo">
            {p.num != null && <div className="player-num">#{p.num}</div>}

            {p.photo ? (
              <img src={p.photo} alt="" />
            ) : (
              <span>{(p.firstName || "?").charAt(0).toUpperCase()}</span>
            )}
          </div>

          <div className="player-identity">
            <span className="player-club">🏀 {p.club || team.name}</span>

            <h1>
              {p.firstName} {p.lastName}
            </h1>

            <div className="player-cat">
              <b>Catégorie</b> {p.categorie || "—"}
            </div>

            <div className="player-attr-grid">
              <Attr label="Poste principal" value={p.postePrincipal || "—"} />
              <Attr label="Poste secondaire" value={p.posteSecondaire || "—"} />
              <Attr label="Taille" value={latestHeight ? `${latestHeight.value} cm` : p.taille || "—"} />
              <Attr label="Poids" value={latestWeight ? `${latestWeight.value} kg` : p.poids || "—"} />
              <Attr label="Âge" value={p.age != null ? `${p.age} ans` : "—"} />
              <Attr label="Date de naissance" value={p.dob || "—"} />
              <Attr label="Main dominante" value={p.mainDominante || "—"} />
              <Attr label="Numéro" value={p.num != null ? String(p.num) : "—"} />
            </div>

            <div className="player-hero-bottom">
              <span className={`status-pill ${statusClass(p.statut || "Disponible")}`}>
                {p.statut || "Disponible"}
              </span>

              <span className="stars-line">
                Potentiel <span>{stars(p.potentiel || 0)}</span>
              </span>
            </div>
          </div>

          <div className="jersey-card-light">
            <Jersey name={p.lastName} num={p.num} />

            <div className="jersey-meta-light">
              <div>
                Ancienneté au club
                <b>{p.ancienneteLabel || "—"}</b>
              </div>

              <div>
                Contrat jusqu'au
                <b>{p.contratJusquau || "—"}</b>
              </div>
            </div>
          </div>
        </section>

        <div className="player-tabs">
          {TABS.map((t) => (
            <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>

        {tab === "Aperçu" && (
          <OverviewTab
            p={p}
            team={team}
            tdj={tdj}
            tdjPct={tdjPct}
            cmp={cmp}
            tests={tests}
            medical={medical}
            latestBilan={latestBilan}
            prediction={growthPrediction}
            liveStats={liveStats}
            teamPlayersStats={teamPlayersStats}
            currentPlayerId={String(playerId)}
          />
        )}

        {tab === "Informations" && (
          <InformationTab p={p} team={team} latestHeight={latestHeight} latestWeight={latestWeight} latestWingspan={latestWingspan} />
        )}

        {tab === "Stats & Vidéo" && (
          <VideoRentabilityTab
            actions={playerActions}
            tags={tags}
            teamId={String(teamId)}
            playerId={String(playerId)}
            playerName={`${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || "Joueur"}
            matches={liveStats.matches}
            onRequestExport={requestActionExport}
          />
        )}

        {tab === "Tests" && (
          <TestsTab
            tests={tests}
            growth={growth}
            setGrowth={saveGrowthProfile}
            currentHeightCm={currentHeightCm}
            prediction={growthPrediction}
            onAddTest={openNewTest}
            onDeleteTest={async (id) => {
              const { error } = await supabase.from("player_tests").delete().eq("id", id);
              if (error) {
                console.error("Erreur suppression test joueur :", error);
                alert("Impossible de supprimer le test.");
                return;
              }
              setTests((prev) => prev.filter((t) => t.id !== id));
            }}
          />
        )}

        {tab === "Médical" && (
          <MedicalTab
            entries={medical}
            onAdd={() => {
              setMedicalDraft({
                id: uid(),
                date: new Date().toISOString().slice(0, 10),
                status: "Disponible",
                zone: "",
                injury: "",
                severity: "Faible",
                daysOff: 0,
                notes: "",
              });
              setMedicalModal(true);
            }}
            onDelete={async (id) => {
              const { error } = await supabase.from("player_medical_entries").delete().eq("id", id);
              if (error) {
                console.error("Erreur suppression médical joueur :", error);
                alert("Impossible de supprimer le suivi médical.");
                return;
              }
              setMedical((prev) => prev.filter((m) => m.id !== id));
            }}
          />
        )}

        {tab === "Bilans" && (
          <BilansTab
            bilans={bilans}
            onNew={() => setBilanModal(emptyBilan())}
            onEdit={(bilan) => setBilanModal(bilan)}
            onDelete={async (id) => {
              const { error } = await supabase.from("player_bilans").delete().eq("id", id);
              if (error) {
                console.error("Erreur suppression bilan joueur :", error);
                alert("Impossible de supprimer le bilan.");
                return;
              }
              setBilans((prev) => prev.filter((b) => b.id !== id));
            }}
            onPdf={generateBilanPdf}
          />
        )}

        {tab === "Documents" && (
          <DocumentsTab
            documents={documents}
            onAdd={() => {
              setDocDraft({
                id: uid(),
                date: new Date().toISOString().slice(0, 10),
                title: "",
                category: "Administratif",
                url: "",
                notes: "",
              });
              setDocModal(true);
            }}
            onDelete={async (id) => {
              const { error } = await supabase.from("player_documents").delete().eq("id", id);
              if (error) {
                console.error("Erreur suppression document joueur :", error);
                alert("Impossible de supprimer le document.");
                return;
              }
              setDocuments((prev) => prev.filter((d) => d.id !== id));
            }}
          />
        )}

        {editing && <PlayerForm initial={p} onSave={handleSave} onClose={() => setEditing(false)} />}

        {testModal && (
          <Modal title="Ajouter un test" onClose={() => setTestModal(false)}>
            <div className="modal-grid">
              <Field label="Date">
                <input type="date" value={testDraft.date} onChange={(e) => setTestDraft({ ...testDraft, date: e.target.value })} />
              </Field>

              <Field label="Catégorie">
                <select
                  value={testDraft.category}
                  onChange={(e) => {
                    const category = e.target.value as TestCategory;
                    const first = TEST_CATALOG.find((t) => t.category === category) || TEST_CATALOG[0];

                    setTestDraft({
                      ...testDraft,
                      category,
                      label: first.label,
                      unit: first.unit,
                    });
                  }}
                >
                  {Array.from(new Set(TEST_CATALOG.map((t) => t.category))).map((cat) => (
                    <option key={cat}>{cat}</option>
                  ))}
                </select>
              </Field>

              <Field label="Test">
                <select
                  value={testDraft.label}
                  onChange={(e) => {
                    const selected = TEST_CATALOG.find((t) => t.label === e.target.value);

                    setTestDraft({
                      ...testDraft,
                      label: e.target.value,
                      unit: selected?.unit || testDraft.unit,
                    });
                  }}
                >
                  {TEST_CATALOG.filter((t) => t.category === testDraft.category).map((test) => (
                    <option key={test.label}>{test.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Valeur">
                <input
                  type="number"
                  step="0.01"
                  value={testDraft.value || ""}
                  onChange={(e) => setTestDraft({ ...testDraft, value: Number(e.target.value) })}
                />
              </Field>

              <Field label="Unité">
                <input value={testDraft.unit} onChange={(e) => setTestDraft({ ...testDraft, unit: e.target.value })} />
              </Field>

              <Field label="Notes">
                <textarea value={testDraft.notes || ""} onChange={(e) => setTestDraft({ ...testDraft, notes: e.target.value })} />
              </Field>
            </div>

            <div className="modal-actions">
              <button className="light-btn outline" onClick={() => setTestModal(false)}>Annuler</button>
              <button className="light-btn primary" onClick={saveTest}>Enregistrer</button>
            </div>
          </Modal>
        )}

        {medicalModal && (
          <Modal title="Ajouter un suivi médical" onClose={() => setMedicalModal(false)}>
            <div className="modal-grid">
              <Field label="Date">
                <input type="date" value={medicalDraft.date} onChange={(e) => setMedicalDraft({ ...medicalDraft, date: e.target.value })} />
              </Field>

              <Field label="Statut">
                <select value={medicalDraft.status} onChange={(e) => setMedicalDraft({ ...medicalDraft, status: e.target.value as MedicalStatus })}>
                  <option>Disponible</option>
                  <option>Blessé</option>
                  <option>Reprise</option>
                  <option>Aménagé</option>
                  <option>Absent</option>
                </select>
              </Field>

              <Field label="Zone">
                <input value={medicalDraft.zone} placeholder="Cheville, genou..." onChange={(e) => setMedicalDraft({ ...medicalDraft, zone: e.target.value })} />
              </Field>

              <Field label="Blessure / motif">
                <input value={medicalDraft.injury} onChange={(e) => setMedicalDraft({ ...medicalDraft, injury: e.target.value })} />
              </Field>

              <Field label="Gravité">
                <select value={medicalDraft.severity} onChange={(e) => setMedicalDraft({ ...medicalDraft, severity: e.target.value as MedicalEntry["severity"] })}>
                  <option>Faible</option>
                  <option>Moyenne</option>
                  <option>Élevée</option>
                </select>
              </Field>

              <Field label="Jours d'arrêt">
                <input type="number" value={medicalDraft.daysOff} onChange={(e) => setMedicalDraft({ ...medicalDraft, daysOff: Number(e.target.value) })} />
              </Field>

              <Field label="Notes">
                <textarea value={medicalDraft.notes} onChange={(e) => setMedicalDraft({ ...medicalDraft, notes: e.target.value })} />
              </Field>
            </div>

            <div className="modal-actions">
              <button className="light-btn outline" onClick={() => setMedicalModal(false)}>Annuler</button>
              <button className="light-btn primary" onClick={saveMedical}>Enregistrer</button>
            </div>
          </Modal>
        )}

        {docModal && (
          <Modal title="Ajouter un document" onClose={() => setDocModal(false)}>
            <div className="modal-grid">
              <Field label="Date">
                <input type="date" value={docDraft.date} onChange={(e) => setDocDraft({ ...docDraft, date: e.target.value })} />
              </Field>

              <Field label="Titre">
                <input value={docDraft.title} onChange={(e) => setDocDraft({ ...docDraft, title: e.target.value })} />
              </Field>

              <Field label="Catégorie">
                <select value={docDraft.category} onChange={(e) => setDocDraft({ ...docDraft, category: e.target.value as PlayerDocument["category"] })}>
                  <option>Administratif</option>
                  <option>Performance</option>
                  <option>Scolarité</option>
                  <option>Vidéo</option>
                  <option>Contrat</option>
                  <option>Autre</option>
                </select>
              </Field>

              <Field label="Fichier (PDF, JPEG, PNG, WEBP, DOCX)">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,application/pdf,image/jpeg,image/png,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  disabled={docUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadPlayerDocument(file);
                    e.currentTarget.value = "";
                  }}
                />
                {docUploading && <small>Envoi vers Supabase…</small>}
                {!docUploading && docUploadName && <small>Fichier prêt : {docUploadName}</small>}
              </Field>

              <Field label="Ou lien / URL">
                <input value={docDraft.url || ""} onChange={(e) => setDocDraft({ ...docDraft, url: e.target.value })} />
              </Field>

              <Field label="Notes">
                <textarea value={docDraft.notes || ""} onChange={(e) => setDocDraft({ ...docDraft, notes: e.target.value })} />
              </Field>
            </div>

            <div className="modal-actions">
              <button className="light-btn outline" onClick={() => setDocModal(false)}>Annuler</button>
              <button className="light-btn primary" onClick={saveDocument}>Enregistrer</button>
            </div>
          </Modal>
        )}

        {bilanModal && (
          <BilanModal
            bilan={bilanModal}
            setBilan={setBilanModal}
            onClose={() => setBilanModal(null)}
            onSave={saveBilan}
          />
        )}

        {toast && <div className="toast-light">{toast}</div>}
        <div ref={printRef} />
      </main>
    </div>
  );
}

function OverviewTab({
  p,
  team,
  tdj,
  tdjPct,
  cmp,
  tests,
  medical,
  latestBilan,
  prediction,
  liveStats,
  teamPlayersStats,
  currentPlayerId,
}: {
  p: any;
  team: Team;
  tdj: any;
  tdjPct: number;
  cmp: any;
  tests: PlayerTest[];
  medical: MedicalEntry[];
  latestBilan?: PlayerBilan;
  prediction: ReturnType<typeof predictedHeightRange>;
  liveStats: PlayerLiveStats;
  teamPlayersStats: TeamPlayerComparisonStat[];
  currentPlayerId: string;
}) {
  const latestMedical = [...medical].sort((a, b) => b.date.localeCompare(a.date))[0];
  const latestTests = ["Taille", "Poids", "Envergure", "Détente sèche", "VMA"]
    .map((label) => latestByLabel(tests, label))
    .filter(Boolean) as PlayerTest[];

  return (
    <>
      <div className="kpi-row-light">
        <Kpi icon="✅" label="Présence" value={`${liveStats.hasData ? liveStats.attendancePct : p.presencePct || 0}%`} sub={liveStats.hasData ? "Depuis les matchs LiveStats" : "Taux de présence"} spark={[88, 90, 92, 91, 95, 94, 95]} color="#22a06b" />
        <Kpi icon="⏱" label="Ponctualité" value={`${p.ponctualitePct || 0}%`} sub="Taux de ponctualité" spark={[85, 88, 90, 89, 92, 91, 92]} color="#22a06b" />
        <Kpi icon="🏀" label="Matchs joués" value={String(tdj.matchsJoues || 0)} sub={`${tdj.matchsManques || 0} manqué${tdj.matchsManques > 1 ? "s" : ""}`} />
        <Kpi icon="⌛" label="Temps moyen" value={`${tdj.tempsMoyenMatchMin || 0} min`} sub="par match" />
      </div>

      <div className="player-grid three">
        <div className="light-card">
          <h3>Radar de compétences</h3>
          <p className="muted">Évaluation coach</p>
          <RadarChart data={p.radar} />
        </div>

        <div className="light-card">
          <h3>Stats match <span>(moyennes)</span></h3>

          <div className="stats-grid-light">
            <StatCell n={p.stats?.pts || 0} l="Pts" />
            <StatCell n={p.stats?.reb || 0} l="Reb" />
            <StatCell n={p.stats?.ast || 0} l="Ast" />
            <StatCell n={p.stats?.stl || 0} l="Stl" />
            <StatCell n={p.stats?.blk || 0} l="Blk" />
            <StatCell n={p.stats?.to || 0} l="To" />
          </div>

          <div className="pct-row-light">
            <StatCell n={`${p.stats?.pctTir || 0}%`} l="% Tir" small />
            <StatCell n={`${p.stats?.pct3pts || 0}%`} l="% 3pts" small />
            <StatCell n={`${p.stats?.pctLf || 0}%`} l="% LF" small />
          </div>
        </div>

        <div className="light-card">
          <h3>Bilan rapide</h3>

          <div className="summary-list">
            <SummaryLine label="Statut médical" value={latestMedical?.status || p.statut || "Disponible"} />
            <SummaryLine label="Taille prédite" value={prediction.probable ? `${prediction.probable} cm` : "À renseigner"} />
            <SummaryLine label="Dernier bilan" value={latestBilan ? `${latestBilan.type} · ${fmtDate(latestBilan.date)}` : "Aucun bilan"} />
            <SummaryLine label="Note coach" value={latestBilan ? `${ratingAverage(latestBilan.coachRatings)}/10` : "—"} />
          </div>
        </div>
      </div>

      <div className="player-grid two">
        <div className="light-card">
          <h3>Temps de jeu</h3>

          <div className="temps-row">
            <DonutChart pct={tdjPct} centerTop="Temps de jeu" centerBottom="moyen" />

            <div className="legend-list">
              <Legend color="#1f6fb2" label="Temps moyen / match" value={`${tdj.tempsMoyenMatchMin || 0} min`} />
              <Legend color="#f47b20" label="Temps total" value={tdj.tempsTotalLabel || "—"} />
              <Legend color="#22a06b" label="Matchs joués" value={String(tdj.matchsJoues || 0)} />
              <Legend color="#e4564f" label="Matchs manqués" value={String(tdj.matchsManques || 0)} />
            </div>
          </div>
        </div>

        <div className="light-card">
          <h3>Derniers tests</h3>

          {latestTests.length === 0 ? (
            <p className="empty-small">Aucun test renseigné.</p>
          ) : (
            <table className="phys-light">
              <thead>
                <tr>
                  <th>Test</th>
                  <th>Résultat</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {latestTests.map((test) => (
                  <tr key={test.id}>
                    <td>{test.label}</td>
                    <td>{test.value} {test.unit}</td>
                    <td>{fmtDate(test.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ModernPlayerComparisonSection
        team={team}
        p={p}
        liveStats={liveStats}
        teamPlayersStats={teamPlayersStats}
        currentPlayerId={currentPlayerId}
      />
    </>
  );
}

function InformationTab({
  p,
  team,
  latestHeight,
  latestWeight,
  latestWingspan,
}: {
  p: any;
  team: Team;
  latestHeight?: PlayerTest;
  latestWeight?: PlayerTest;
  latestWingspan?: PlayerTest;
}) {
  return (
    <>
      <section className="light-card admin-card">
        <h3>Informations joueur</h3>

        <div className="admin-grid">
          <Attr label="Club" value={p.club || team.name || "—"} />
          <Attr label="Catégorie" value={p.categorie || "—"} />
          <Attr label="Poste principal" value={p.postePrincipal || "—"} />
          <Attr label="Poste secondaire" value={p.posteSecondaire || "—"} />
          <Attr label="Nationalité" value={p.nationality || "—"} />
          <Attr label="Taille" value={latestHeight ? `${latestHeight.value} cm` : p.taille || "—"} />
          <Attr label="Poids" value={latestWeight ? `${latestWeight.value} kg` : p.poids || "—"} />
          <Attr label="Envergure" value={latestWingspan ? `${latestWingspan.value} cm` : "—"} />
          <Attr label="Âge" value={p.age != null ? `${p.age} ans` : "—"} />
          <Attr label="Date de naissance" value={p.dob || "—"} />
          <Attr label="Main dominante" value={p.mainDominante || "—"} />
          <Attr label="Numéro" value={p.num != null ? String(p.num) : "—"} />
        </div>
      </section>

      <section className="light-card admin-card">
        <h3>Informations administratives</h3>

        <div className="admin-grid">
          <Attr label="Numéro de licence" value={p.licenceNumber || "—"} />
          <Attr label="Téléphone tuteur 1" value={p.tuteur1Phone || "—"} />
          <Attr label="Email tuteur 1" value={p.tuteur1Email || "—"} />
          <Attr label="Téléphone tuteur 2" value={p.tuteur2Phone || "—"} />
          <Attr label="Email tuteur 2" value={p.tuteur2Email || "—"} />
          <Attr label="Contact urgence" value={p.emergencyContact || "—"} />
          <Attr label="Établissement" value={p.school || "—"} />
          <Attr label="Classe" value={p.className || "—"} />
        </div>
      </section>
    </>
  );
}

function StatsTab({
  p,
  tdj,
  tdjPct,
  cmp,
  team,
  liveStats,
  teamPlayersStats,
  currentPlayerId,
}: {
  p: any;
  tdj: any;
  tdjPct: number;
  cmp: any;
  team: Team;
  liveStats: PlayerLiveStats;
  teamPlayersStats: TeamPlayerComparisonStat[];
  currentPlayerId: string;
}) {
  const hasLiveStats = liveStats.hasData;
  const totals = liveStats.totals;
  const averages = liveStats.averages;

  return (
    <>
      {!hasLiveStats && (
        <div className="light-card" style={{ marginBottom: 18 }}>
          <h3>Stats LiveStats</h3>
          <p className="empty-small">
            Aucune ligne trouvée dans Supabase pour ce joueur. Les prochaines prises de stats
            alimenteront automatiquement cette fiche via <b>match_player_stats.player_id</b>.
          </p>
        </div>
      )}

      <div className="player-grid three">
        <div className="light-card">
          <h3>Stats match <span>(moyennes LiveStats)</span></h3>

          <div className="stats-grid-light">
            <StatCell n={hasLiveStats ? averages.pts : p.stats?.pts || 0} l="Pts" />
            <StatCell n={hasLiveStats ? averages.reb : p.stats?.reb || 0} l="Reb" />
            <StatCell n={hasLiveStats ? averages.ast : p.stats?.ast || 0} l="Ast" />
            <StatCell n={hasLiveStats ? averages.stl : p.stats?.stl || 0} l="Stl" />
            <StatCell n={hasLiveStats ? averages.blk : p.stats?.blk || 0} l="Blk" />
            <StatCell n={hasLiveStats ? averages.to : p.stats?.to || 0} l="To" />
          </div>

          <div className="pct-row-light">
            <StatCell n={`${hasLiveStats ? averages.pctTir : p.stats?.pctTir || 0}%`} l="% Tir" small />
            <StatCell n={`${hasLiveStats ? averages.pct3pts : p.stats?.pct3pts || 0}%`} l="% 3pts" small />
            <StatCell n={`${hasLiveStats ? averages.pctLf : p.stats?.pctLf || 0}%`} l="% LF" small />
          </div>
        </div>

        <div className="light-card">
          <h3>Totaux saison</h3>

          <div className="stats-grid-light">
            <StatCell n={totals.pts} l="Pts" />
            <StatCell n={totals.reb} l="Reb" />
            <StatCell n={totals.ast} l="Ast" />
            <StatCell n={totals.stl} l="Stl" />
            <StatCell n={totals.blk} l="Blk" />
            <StatCell n={totals.to} l="BP" />
          </div>

          <div className="pct-row-light">
            <StatCell n={`${totals.p2m}/${totals.p2a}`} l="2PTS" small />
            <StatCell n={`${totals.p3m}/${totals.p3a}`} l="3PTS" small />
            <StatCell n={`${totals.ftm}/${totals.fta}`} l="LF" small />
          </div>
        </div>

        <div className="light-card">
          <h3>Présence & matchs</h3>

          <div className="temps-row">
            <DonutChart
              pct={hasLiveStats ? liveStats.attendancePct : tdjPct}
              centerTop="Présence"
              centerBottom="match"
            />

            <div className="legend-list">
              <Legend color="#22a06b" label="Matchs joués" value={String(hasLiveStats ? liveStats.games : tdj.matchsJoues || 0)} />
              <Legend color="#e4564f" label="Matchs manqués" value={String(hasLiveStats ? liveStats.missedGames : tdj.matchsManques || 0)} />
              <Legend color="#1f6fb2" label="Lignes LiveStats" value={String(liveStats.totalRows)} />
              <Legend color="#f47b20" label="Présence" value={`${hasLiveStats ? liveStats.attendancePct : tdjPct}%`} />
            </div>
          </div>
        </div>
      </div>

      <div className="player-grid two">
        <div className="light-card">
          <h3>Évolution des points</h3>
          <LineChart data={liveStats.evolution.length ? liveStats.evolution : p.evolution || []} />
        </div>

        <div className="light-card">
          <h3>Détail par match</h3>

          {liveStats.matches.length === 0 ? (
            <p className="empty-small">Aucun match enregistré pour ce joueur.</p>
          ) : (
            <table className="phys-light">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Adversaire</th>
                  <th>Prés.</th>
                  <th>PTS</th>
                  <th>REB</th>
                  <th>AST</th>
                  <th>INT</th>
                  <th>CTR</th>
                  <th>BP</th>
                </tr>
              </thead>

              <tbody>
                {[...liveStats.matches].reverse().map((match) => (
                  <tr key={match.matchId || `${match.date}-${match.opponent}`}>
                    <td>{fmtDate(match.date)}</td>
                    <td>{match.opponent || "—"}</td>
                    <td>{match.present ? "Oui" : "Non"}</td>
                    <td>{match.pts}</td>
                    <td>{match.reb}</td>
                    <td>{match.ast}</td>
                    <td>{match.stl}</td>
                    <td>{match.blk}</td>
                    <td>{match.to}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ModernPlayerComparisonSection
        team={team}
        p={p}
        liveStats={liveStats}
        teamPlayersStats={teamPlayersStats}
        currentPlayerId={currentPlayerId}
      />
    </>
  );
}


/* ======================================================================
   Onglet Vidéo & Rentabilité — helpers de classification (match_actions)
   Vocabulaire réel du wizard : action_type ∈ tir/faute-provoquee/touche/
   perte/faute-commise (att) + interception/perte-adverse/contre (def) ;
   shot_type 2PTS/3PTS/LF ; shot_result made/missed ; rebound_type off/def/
   touche-pour/touche-contre ; special_case aucun/2pts+1lf/3pts+1lf.
   On stocke la key temps_fort ; on affiche via tags.label(key).
====================================================================== */

const low = (v: unknown) => String(v ?? "").toLowerCase().trim();

function isActorRow(a: any, playerId: string) {
  return String(a.player_id ?? "") === String(playerId);
}
function isFieldShot(a: any) {
  return low(a.action_type) === "tir" && (a.shot_type === "2PTS" || a.shot_type === "3PTS");
}
function shotIsMade(a: any) {
  return low(a.shot_result) === "made";
}
function shotIsMissed(a: any) {
  return low(a.shot_result) === "missed";
}
function actionHasClip(a: any) {
  return a.clip_start != null || a.video_time != null;
}
function actionVideoUrl(a: any): string | null {
  return a.video_url ?? a.clip_url ?? a.source_url ?? null;
}
function actionIsYoutube(a: any) {
  const u = low(actionVideoUrl(a) || a.video_provider);
  return u.includes("youtube") || u.includes("youtu.be");
}
function actionIsPlayable(a: any) {
  return actionHasClip(a) && !!actionVideoUrl(a) && !actionIsYoutube(a);
}
function exportEligibility(a: any): { ok: boolean; reason: string } {
  if (!actionHasClip(a)) return { ok: false, reason: "Vidéo non synchronisée" };
  if (actionIsYoutube(a)) return { ok: false, reason: "Source YouTube non exportable" };
  if (!actionVideoUrl(a)) return { ok: false, reason: "Source vidéo locale requise" };
  return { ok: true, reason: "" };
}

function shotZone(a: any): { id: string; label: string } {
  const x = Number(a.court_x);
  const y = Number(a.court_y);
  const side = x < 0.38 ? "G" : x > 0.62 ? "D" : "C";
  const sideLabel = side === "G" ? "gauche" : side === "D" ? "droite" : "axe";
  if (a.shot_type === "3PTS") return { id: `3-${side}`, label: `3PTS ${sideLabel}` };
  if (Number.isFinite(y) && y < 0.28) return { id: "paint", label: "Près du panier" };
  return { id: `mid-${side}`, label: `Mi-distance ${sideLabel}` };
}
const ZONE_ORDER = ["paint", "mid-G", "mid-C", "mid-D", "3-G", "3-C", "3-D"];

type MtxBucket = {
  key: string;
  actor: any[];
  assist: any[];
  reboff: any[];
  rebdef: any[];
  all: any[];
  points: number;
};

function buildTempsFortBuckets(actions: any[], playerId: string): Map<string, MtxBucket> {
  const map = new Map<string, MtxBucket>();
  const ensure = (key: string) => {
    if (!map.has(key)) {
      map.set(key, { key, actor: [], assist: [], reboff: [], rebdef: [], all: [], points: 0 });
    }
    return map.get(key)!;
  };

  for (const a of actions ?? []) {
    const key = a.temps_fort;
    if (!key) continue;
    const b = ensure(key);
    b.all.push(a);

    if (isActorRow(a, playerId)) {
      b.actor.push(a);
      b.points += matchActionPoints(a);
    }
    if (String(a.assist_player_id ?? "") === String(playerId)) b.assist.push(a);
    if (String(a.rebound_player_id ?? "") === String(playerId)) {
      if (low(a.rebound_type) === "off") b.reboff.push(a);
      else if (low(a.rebound_type) === "def") b.rebdef.push(a);
    }
  }

  return map;
}

type MtxCol = {
  id: string;
  label: string;
  value: (b: MtxBucket) => number;
  list: (b: MtxBucket) => any[];
  ratio?: boolean;
};

const MATRIX_COLUMNS: MtxCol[] = [
  { id: "actions", label: "Actions", value: (b) => b.actor.length, list: (b) => b.actor },
  { id: "points", label: "Points", value: (b) => b.points, list: (b) => b.actor.filter((a) => matchActionPoints(a) > 0) },
  { id: "ppa", label: "Pts/action", value: (b) => (b.actor.length ? roundStat(b.points / b.actor.length) : 0), list: (b) => b.actor, ratio: true },
  { id: "p2m", label: "2PTS M", value: (b) => b.actor.filter((a) => a.shot_type === "2PTS" && shotIsMade(a)).length, list: (b) => b.actor.filter((a) => a.shot_type === "2PTS" && shotIsMade(a)) },
  { id: "p2r", label: "2PTS R", value: (b) => b.actor.filter((a) => a.shot_type === "2PTS" && shotIsMissed(a)).length, list: (b) => b.actor.filter((a) => a.shot_type === "2PTS" && shotIsMissed(a)) },
  { id: "p3m", label: "3PTS M", value: (b) => b.actor.filter((a) => a.shot_type === "3PTS" && shotIsMade(a)).length, list: (b) => b.actor.filter((a) => a.shot_type === "3PTS" && shotIsMade(a)) },
  { id: "p3r", label: "3PTS R", value: (b) => b.actor.filter((a) => a.shot_type === "3PTS" && shotIsMissed(a)).length, list: (b) => b.actor.filter((a) => a.shot_type === "3PTS" && shotIsMissed(a)) },
  { id: "lfm", label: "LF M", value: (b) => b.actor.filter((a) => a.shot_type === "LF").reduce((s, a) => s + statNumber(a.ft_made), 0), list: (b) => b.actor.filter((a) => a.shot_type === "LF" && statNumber(a.ft_made) > 0) },
  { id: "lfr", label: "LF R", value: (b) => b.actor.filter((a) => a.shot_type === "LF").reduce((s, a) => s + Math.max(0, statNumber(a.ft_attempts) - statNumber(a.ft_made)), 0), list: (b) => b.actor.filter((a) => a.shot_type === "LF" && statNumber(a.ft_attempts) - statNumber(a.ft_made) > 0) },
  { id: "ast", label: "Passes déc.", value: (b) => b.assist.length, list: (b) => b.assist },
  { id: "roff", label: "Reb off.", value: (b) => b.reboff.length, list: (b) => b.reboff },
  { id: "rdef", label: "Reb déf.", value: (b) => b.rebdef.length, list: (b) => b.rebdef },
  { id: "to", label: "Pertes", value: (b) => b.actor.filter((a) => low(a.action_type) === "perte").length, list: (b) => b.actor.filter((a) => low(a.action_type) === "perte") },
  { id: "stl", label: "Interceptions", value: (b) => b.actor.filter((a) => low(a.action_type) === "interception").length, list: (b) => b.actor.filter((a) => low(a.action_type) === "interception") },
  { id: "blk", label: "Contres", value: (b) => b.actor.filter((a) => low(a.action_type) === "contre").length, list: (b) => b.actor.filter((a) => low(a.action_type) === "contre") },
  { id: "fd", label: "Fautes prov.", value: (b) => b.actor.filter((a) => low(a.action_type) === "faute-provoquee").length, list: (b) => b.actor.filter((a) => low(a.action_type) === "faute-provoquee") },
  { id: "fc", label: "Fautes com.", value: (b) => b.actor.filter((a) => low(a.action_type) === "faute-commise").length, list: (b) => b.actor.filter((a) => low(a.action_type) === "faute-commise") },
  { id: "clips", label: "Clips", value: (b) => b.all.filter(actionHasClip).length, list: (b) => b.all.filter(actionHasClip) },
];

function quarterLabel(q: unknown): string {
  const n = Number(q);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n <= 4 ? `Q${n}` : `OT${n - 4}`;
}

/* ======================================================================
   Onglet Vidéo & Rentabilité (joueur) — dashboard pro façon Hudl/Synergy,
   identité MyBasket. Tout est calculé côté client depuis match_actions.
   Réutilise les helpers module : low, isActorRow, buildTempsFortBuckets,
   shotZone, matchActionPoints, exportEligibility, actionHasClip,
   actionVideoUrl, actionIsYoutube, actionIsPlayable, quarterLabel.
====================================================================== */

function actionResultCategory(a: any): "made" | "missed" | "fauteProv" | "intercept" | "perte" | "autre" {
  const at = low(a.action_type);
  if (at === "tir") {
    if (a.shot_type === "LF") {
      if (statNumber(a.ft_made) > 0) return "made";
      if (statNumber(a.ft_attempts) > 0) return "missed";
      return "autre";
    }
    if (shotIsMade(a)) return "made";
    if (shotIsMissed(a)) return "missed";
    return "autre";
  }
  if (at === "faute-provoquee") return "fauteProv";
  if (at === "interception") return "intercept";
  if (at === "perte") return "perte";
  return "autre";
}

const RESULT_KEYS = ["made", "missed", "fauteProv", "intercept", "perte"] as const;
type ResultKey = (typeof RESULT_KEYS)[number];

type VideoFilters = {
  match: string;
  quarter: string;
  tf: string;
  side: string;
  results: Record<ResultKey, boolean>;
  shots: { p2: boolean; p3: boolean; lf: boolean };
};

const DEFAULT_VIDEO_FILTERS: VideoFilters = {
  match: "all",
  quarter: "all",
  tf: "all",
  side: "all",
  results: { made: true, missed: true, fauteProv: true, intercept: true, perte: true },
  shots: { p2: true, p3: true, lf: true },
};

function filterVideoActions(actions: any[], f: VideoFilters): any[] {
  const allResult = RESULT_KEYS.every((k) => f.results[k]);
  const allShot = f.shots.p2 && f.shots.p3 && f.shots.lf;
  return (actions ?? []).filter((a) => {
    if (f.match !== "all" && String(a.match_id ?? "") !== f.match) return false;
    if (f.quarter !== "all" && String(a.quarter ?? "") !== f.quarter) return false;
    if (f.tf !== "all" && String(a.temps_fort ?? "") !== f.tf) return false;
    if (f.side !== "all" && low(a.context) !== f.side) return false;
    if (!allResult) {
      const cat = actionResultCategory(a);
      if (cat === "autre" || !f.results[cat as ResultKey]) return false;
    }
    if (!allShot && low(a.action_type) === "tir") {
      const st = a.shot_type;
      const ok =
        (st === "2PTS" && f.shots.p2) ||
        (st === "3PTS" && f.shots.p3) ||
        (st === "LF" && f.shots.lf);
      if (!ok) return false;
    }
    return true;
  });
}

/* ------- Matrice de rentabilité (temps fort × résultat) ------- */
type RentabRow = {
  key: string;
  made: { n: number; pts: number; list: any[] };
  missed: { n: number; pts: number; list: any[] };
  fauteProv: { n: number; pts: number; list: any[] };
  intercept: { n: number; pts: number; list: any[] };
  perte: { n: number; pts: number; list: any[] };
  total: { n: number; pts: number; list: any[] };
  ppa: number;
};

function computeTempsFortMatrix(
  buckets: Map<string, MtxBucket>,
  orderedKeys: string[]
): RentabRow[] {
  const cell = (list: any[]) => ({
    n: list.length,
    pts: list.reduce((s, a) => s + matchActionPoints(a), 0),
    list,
  });
  return orderedKeys.map((key) => {
    const b = buckets.get(key)!;
    const actor = b.actor;
    const made = actor.filter((a) => actionResultCategory(a) === "made");
    const missed = actor.filter((a) => actionResultCategory(a) === "missed");
    const fauteProv = actor.filter((a) => actionResultCategory(a) === "fauteProv");
    const intercept = actor.filter((a) => actionResultCategory(a) === "intercept");
    const perte = actor.filter((a) => actionResultCategory(a) === "perte");
    const total = cell(actor);
    return {
      key,
      made: cell(made),
      missed: cell(missed),
      fauteProv: cell(fauteProv),
      intercept: cell(intercept),
      perte: cell(perte),
      total,
      ppa: total.n ? roundStat(total.pts / total.n) : 0,
    };
  });
}

const RENTAB_COLS: { id: keyof RentabRow; label: string; icon: string; tint: string }[] = [
  { id: "made", label: "Marqué", icon: "✅", tint: "green" },
  { id: "missed", label: "Manqué", icon: "❌", tint: "red" },
  { id: "fauteProv", label: "Faute provoquée", icon: "🔔", tint: "amber" },
  { id: "intercept", label: "Intercepté", icon: "🖐", tint: "violet" },
  { id: "perte", label: "Perte", icon: "↩️", tint: "grey" },
  { id: "total", label: "Total", icon: "", tint: "neutral" },
];

function ppaClass(ppa: number): string {
  if (ppa >= 1.2) return "ppa-good";
  if (ppa >= 0.8) return "ppa-mid";
  if (ppa > 0) return "ppa-low";
  return "ppa-zero";
}

/* ------- Shot chart zones ------- */
const ZONE_LABELS: Record<string, string> = {
  paint: "Près du panier",
  "mid-G": "Mi-distance gauche",
  "mid-C": "Mi-distance axe",
  "mid-D": "Mi-distance droite",
  "3-G": "3PTS gauche",
  "3-C": "3PTS axe",
  "3-D": "3PTS droite",
};
const ZONE_LAYOUT: Record<string, { l: number; t: number; w: number; h: number }> = {
  "3-G": { l: 3, t: 5, w: 25, h: 30 },
  "3-C": { l: 30, t: 3, w: 40, h: 24 },
  "3-D": { l: 72, t: 5, w: 25, h: 30 },
  "mid-G": { l: 6, t: 40, w: 25, h: 30 },
  "mid-C": { l: 33, t: 31, w: 34, h: 26 },
  "mid-D": { l: 69, t: 40, w: 25, h: 30 },
  paint: { l: 33, t: 61, w: 34, h: 33 },
};

type ZoneStat = { id: string; label: string; made: number; att: number; pts: number; shots: any[] };

function computeShotZones(fieldShots: any[]): ZoneStat[] {
  const m = new Map<string, ZoneStat>();
  for (const a of fieldShots) {
    if (a.court_x == null || a.court_y == null) continue;
    const z = shotZone(a);
    if (!m.has(z.id)) m.set(z.id, { id: z.id, label: ZONE_LABELS[z.id] || z.label, made: 0, att: 0, pts: 0, shots: [] });
    const zs = m.get(z.id)!;
    zs.att += 1;
    if (shotIsMade(a)) {
      zs.made += 1;
      zs.pts += matchActionPoints(a);
    }
    zs.shots.push(a);
  }
  return ZONE_ORDER.map((id) => m.get(id)).filter(Boolean) as ZoneStat[];
}
function zoneColor(pct: number): string {
  if (pct >= 60) return "#2f9e6a";
  if (pct >= 45) return "#8fce9f";
  if (pct >= 30) return "#e4b64c";
  return "#e0645c";
}

function clipDurationLabel(a: any): string {
  const start = a.clip_start;
  const end = a.clip_end;
  if (start != null && end != null) {
    const d = Math.max(0, Math.round(Number(end) - Number(start)));
    return `00:${String(d).padStart(2, "0")}`;
  }
  return "—";
}
function matchTimeLabel(a: any): string {
  if (a.clock) return String(a.clock);
  if (a.video_time != null) {
    const s = Math.max(0, Math.round(Number(a.video_time)));
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  return "—";
}
function actionTypeLabel(a: any): string {
  const at = low(a.action_type);
  if (at === "tir") return a.shot_type || "Tir";
  if (at === "faute-provoquee") return "Faute provoquée";
  if (at === "faute-commise") return "Faute commise";
  if (at === "interception") return "Interception";
  if (at === "perte") return "Perte";
  if (at === "contre") return "Contre";
  if (at === "touche") return "Touche";
  return a.action_type || "Action";
}

/* ------- V4 · intelligence vidéo / scouting (tout côté client) ------- */

type VideoProfile = {
  style: { icon: string; label: string };
  bestWeapon: { key: string; ppa: number; actions: number } | null;
  weakness: { key: string; ppa: number; losses: number } | null;
};

function computeVideoProfile(
  actorActions: any[],
  buckets: Map<string, MtxBucket>,
  matrix: RentabRow[]
): VideoProfile {
  const transitionPts = actorActions
    .filter((a) => a.temps_fort === "transition" || a.temps_fort === "fast-break")
    .reduce((s, a) => s + matchActionPoints(a), 0);
  const threeVol = actorActions.filter((a) => a.shot_type === "3PTS").length;
  const paintMade = actorActions.filter(
    (a) => isFieldShot(a) && a.shot_type === "2PTS" && shotIsMade(a) && shotZone(a).id === "paint"
  ).length;

  let assists = 0;
  let rebDef = 0;
  buckets.forEach((b) => {
    assists += b.assist.length;
    rebDef += b.rebdef.length;
  });
  const steals = actorActions.filter((a) => low(a.action_type) === "interception").length;
  const blocks = actorActions.filter((a) => low(a.action_type) === "contre").length;

  const scored = [
    { icon: "⚡", label: "Transition scorer", score: transitionPts },
    { icon: "🎯", label: "Shooter", score: threeVol * 1.2 },
    { icon: "🧱", label: "Finisseur intérieur", score: paintMade * 1.3 },
    { icon: "🧠", label: "Créateur", score: assists * 1.6 },
    { icon: "🛡", label: "Défenseur impact", score: (steals + blocks) * 1.5 + rebDef * 0.6 },
  ].sort((a, b) => b.score - a.score);

  const style =
    scored[0] && scored[0].score > 0
      ? { icon: scored[0].icon, label: scored[0].label }
      : { icon: "🏀", label: "Joueur polyvalent" };

  const MIN = 4;
  const eligible = matrix.filter((r) => r.total.n >= MIN);
  let bestWeapon: VideoProfile["bestWeapon"] = null;
  let weakness: VideoProfile["weakness"] = null;
  if (eligible.length) {
    const best = [...eligible].sort((a, b) => b.ppa - a.ppa)[0];
    const worst = [...eligible].sort((a, b) => a.ppa - b.ppa)[0];
    bestWeapon = { key: best.key, ppa: best.ppa, actions: best.total.n };
    weakness = { key: worst.key, ppa: worst.ppa, losses: worst.perte.n };
  }
  return { style, bestWeapon, weakness };
}

type ScoutRow = {
  key: string;
  positive: any[];
  negative: any[];
  creation: any[];
  defense: any[];
  neutre: any[];
  score: number;
};

function computeScoutMatrix(buckets: Map<string, MtxBucket>, orderedKeys: string[]): ScoutRow[] {
  return orderedKeys.map((key) => {
    const b = buckets.get(key)!;
    const made = b.actor.filter((a) => actionResultCategory(a) === "made");
    const missed = b.actor.filter((a) => actionResultCategory(a) === "missed");
    const perte = b.actor.filter((a) => low(a.action_type) === "perte");
    const fCom = b.actor.filter((a) => low(a.action_type) === "faute-commise");
    const fProv = b.actor.filter((a) => low(a.action_type) === "faute-provoquee");
    const steals = b.actor.filter((a) => low(a.action_type) === "interception");
    const blocks = b.actor.filter((a) => low(a.action_type) === "contre");
    const driveKick = b.actor.filter((a) => a.temps_fort === "drive-kick");

    const positive = [...made, ...b.assist, ...fProv, ...b.reboff];
    const negative = [...missed, ...perte, ...fCom];
    const creation = [...b.assist, ...fProv, ...driveKick];
    const defense = [...steals, ...blocks, ...b.rebdef];
    const counted = new Set<any>([...positive, ...negative, ...creation, ...defense]);
    const neutre = b.actor.filter((a) => !counted.has(a));

    return { key, positive, negative, creation, defense, neutre, score: positive.length - negative.length };
  });
}

const SCOUT_COLS: { id: keyof ScoutRow; label: string; icon: string; cls: string }[] = [
  { id: "positive", label: "Positives", icon: "🟢", cls: "sc-pos" },
  { id: "negative", label: "Négatives", icon: "🔴", cls: "sc-neg" },
  { id: "creation", label: "Création", icon: "🎯", cls: "sc-cre" },
  { id: "defense", label: "Défense", icon: "🛡", cls: "sc-def" },
  { id: "neutre", label: "Neutre", icon: "⚪", cls: "sc-neu" },
];

type TLEvent = { a: any; icon: string; cat: string };

function timelineCategory(a: any, playerId: string): { icon: string; cat: string } {
  if (String(a.assist_player_id ?? "") === String(playerId) && !isActorRow(a, playerId))
    return { icon: "🎯", cat: "Passe décisive" };
  if (
    String(a.rebound_player_id ?? "") === String(playerId) &&
    low(a.rebound_type) === "def" &&
    !isActorRow(a, playerId)
  )
    return { icon: "🛡", cat: "Rebond défensif" };
  const at = low(a.action_type);
  if (at === "interception") return { icon: "🛡", cat: "Interception" };
  if (at === "contre") return { icon: "🛡", cat: "Contre" };
  const rc = actionResultCategory(a);
  if (rc === "made") return { icon: "🔥", cat: "Marqué" };
  if (rc === "missed") return { icon: "❌", cat: "Manqué" };
  if (rc === "perte") return { icon: "❌", cat: "Perte" };
  if (at === "faute-commise") return { icon: "❌", cat: "Faute commise" };
  return { icon: "•", cat: actionTypeLabel(a) };
}

function computeTimeline(actions: any[], playerId: string): { quarter: number; events: TLEvent[] }[] {
  const byQ = new Map<number, TLEvent[]>();
  for (const a of actions ?? []) {
    const q = Number(a.quarter) || 0;
    if (!byQ.has(q)) byQ.set(q, []);
    const { icon, cat } = timelineCategory(a, playerId);
    byQ.get(q)!.push({ a, icon, cat });
  }
  return Array.from(byQ.entries())
    .sort((x, y) => x[0] - y[0])
    .map(([quarter, events]) => ({ quarter, events }));
}

type SmartPlaylist = { id: string; icon: string; name: string; actions: any[]; best: any | null };

function computeSmartPlaylists(actions: any[], playerId: string): SmartPlaylist[] {
  const actor = actions.filter((a) => isActorRow(a, playerId));
  const assists = actions.filter(
    (a) => String(a.assist_player_id ?? "") === String(playerId) && !isActorRow(a, playerId)
  );
  const rebDef = actions.filter(
    (a) =>
      String(a.rebound_player_id ?? "") === String(playerId) &&
      low(a.rebound_type) === "def" &&
      !isActorRow(a, playerId)
  );
  const made = actor.filter((a) => actionResultCategory(a) === "made");
  const missed = actor.filter((a) => actionResultCategory(a) === "missed");
  const perte = actor.filter((a) => low(a.action_type) === "perte");
  const fCom = actor.filter((a) => low(a.action_type) === "faute-commise");
  const fProv = actor.filter((a) => low(a.action_type) === "faute-provoquee");
  const steals = actor.filter((a) => low(a.action_type) === "interception");
  const blocks = actor.filter((a) => low(a.action_type) === "contre");
  const shots = actor.filter((a) => low(a.action_type) === "tir");
  const driveKick = actor.filter((a) => a.temps_fort === "drive-kick");

  const best = (list: any[]) =>
    list.length ? [...list].sort((a, b) => matchActionPoints(b) - matchActionPoints(a))[0] : null;
  const pl = (id: string, icon: string, name: string, list: any[]): SmartPlaylist => ({
    id,
    icon,
    name,
    actions: list,
    best: best(list),
  });

  return [
    pl("highlights", "🔥", "Highlights", [...made, ...assists, ...steals, ...blocks]),
    pl("corrections", "⚠️", "Corrections", [...perte, ...missed, ...fCom]),
    pl("shooting", "🎯", "Shooting", shots),
    pl("creation", "🧠", "Création", [...assists, ...driveKick, ...fProv]),
    pl("defense", "🛡", "Défense", [...steals, ...blocks, ...rebDef]),
  ];
}

// Qualité de tir : dépend d'un champ optionnel (absent aujourd'hui → seule l'option "Tous")
function actionShotQuality(a: any): string | null {
  const q = a.shot_quality ?? a.quality ?? a.catch_shoot ?? null;
  return q != null && q !== "" ? String(q) : null;
}

/* ------- V4.1 · structures préparées pour une future persistance Supabase -------
   Future tables : video_notes, video_tags, video_highlights.
   (Aucune table créée, aucune écriture DB — state local uniquement pour l'instant.) */
type VideoNote = { action_id: string; note: string; type: string; created_at: string };
type VideoCustomTag = { action_id: string; tags: string[] };
type HighlightClip = { action_id: string; temps_fort: string; label: string; added_at: string };
type MontageDesignItem = {
  id: string;
  item_type: "title" | "text" | "image";
  title: string;
  text: string;
  image_url: string;
  background_url: string;
  font_family: string;
  font_size: number;
  font_color: string;
  placement: "intro" | "outro";
};
type SavedMontage = {
  id: string;
  title: string | null;
  match_id: string | null;
  created_at: string;
  updated_at: string;
};

const NOTE_TYPES = ["Correction", "Positif", "Question joueur", "Objectif travail"];
const QUICK_TAGS = ["🔥 Excellent", "⚠️ À corriger", "👀 À revoir", "⭐ Exemple équipe"];

/* ------- V4.1 · comparateur avant / après (créé depuis created_at) ------- */
type EvoBucket = { n: number; ppa: number; success: number; positives: number; negatives: number };
type VideoEvolution = { early: EvoBucket; recent: EvoBucket } | null;

function evoBucket(list: any[]): EvoBucket {
  const n = list.length;
  const points = list.reduce((s, a) => s + matchActionPoints(a), 0);
  const shots = list.filter((a) => low(a.action_type) === "tir");
  const madeShots = shots.filter((a) => actionResultCategory(a) === "made");
  const positives = list.filter((a) => {
    const c = actionResultCategory(a);
    return c === "made" || c === "fauteProv";
  }).length;
  const negatives = list.filter((a) => {
    const c = actionResultCategory(a);
    return c === "missed" || c === "perte" || low(a.action_type) === "faute-commise";
  }).length;
  return {
    n,
    ppa: n ? roundStat(points / n) : 0,
    success: shots.length ? Math.round((madeShots.length / shots.length) * 100) : 0,
    positives,
    negatives,
  };
}

function computeVideoEvolution(actorActions: any[]): VideoEvolution {
  const MIN_EACH = 5;
  const now = Date.now();
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const dated = actorActions.filter((a) => a.created_at && !Number.isNaN(new Date(a.created_at).getTime()));
  if (dated.length < MIN_EACH * 2) return null;
  const recent = dated.filter((a) => new Date(a.created_at).getTime() >= cutoff);
  const early = dated.filter((a) => new Date(a.created_at).getTime() < cutoff);
  if (recent.length < MIN_EACH || early.length < MIN_EACH) return null;
  return { early: evoBucket(early), recent: evoBucket(recent) };
}

/* ------- V4.1 · insights automatiques (aucune IA externe) ------- */
function tfVolumeTrend(actorActions: any[]): { key: string; delta: number } | null {
  const now = Date.now();
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const dated = actorActions.filter((a) => a.created_at && !Number.isNaN(new Date(a.created_at).getTime()) && a.temps_fort);
  if (dated.length < 10) return null;
  const delta = new Map<string, number>();
  for (const a of dated) {
    const recent = new Date(a.created_at).getTime() >= cutoff;
    delta.set(a.temps_fort, (delta.get(a.temps_fort) || 0) + (recent ? 1 : -1));
  }
  let best: { key: string; delta: number } | null = null;
  delta.forEach((d, key) => {
    if (d > 0 && (!best || d > best.delta)) best = { key, delta: d };
  });
  return best;
}

function computeAutoInsights(
  matrix: RentabRow[],
  actorActions: any[],
  label: (k: string) => string
): string[] {
  const insights: string[] = [];
  const elig = matrix.filter((r) => r.total.n >= 4);

  if (elig.length) {
    const best = [...elig].sort((a, b) => b.ppa - a.ppa)[0];
    if (best.ppa >= 1.0) insights.push(`Très efficace sur ${label(best.key)} avec ${best.ppa.toFixed(2)} pts/action.`);
  }

  const trend = tfVolumeTrend(actorActions);
  if (trend && trend.delta > 0) {
    insights.push(`Le volume de ${label(trend.key)} augmente sur les 30 derniers jours.`);
  } else {
    const topVol = [...matrix].sort((a, b) => b.total.n - a.total.n)[0];
    if (topVol && topVol.total.n > 0) insights.push(`Temps fort le plus utilisé : ${label(topVol.key)} (${topVol.total.n} actions).`);
  }

  const mostTO = [...matrix].sort((a, b) => b.perte.n - a.perte.n)[0];
  const worst = elig.length ? [...elig].sort((a, b) => a.ppa - b.ppa)[0] : null;
  if (mostTO && mostTO.perte.n >= 2) {
    insights.push(`Attention aux pertes de balle sur ${label(mostTO.key)} (${mostTO.perte.n}).`);
  } else if (worst && worst.ppa < 0.9) {
    insights.push(`Point à travailler : ${label(worst.key)} à ${worst.ppa.toFixed(2)} pts/action.`);
  }

  if (!insights.length) insights.push("Pas encore assez d'actions pour générer une analyse.");
  return insights.slice(0, 3);
}

function VideoRentabilityTab({
  actions,
  tags,
  teamId,
  playerId,
  playerName,
  matches,
  onRequestExport,
}: {
  actions: any[];
  tags: ReturnType<typeof useLivestatTags>;
  teamId: string;
  playerId: string;
  playerName: string;
  matches: PlayerLiveMatchLine[];
  onRequestExport: (actionId: string) => void;
}) {
  const [section, setSection] = useState<"overview" | "shots" | "temps-forts" | "actions" | "montage">("overview");
  const [shotFilter, setShotFilter] = useState<"all" | "2PTS" | "3PTS">("all");
  const [matchFilter, setMatchFilter] = useState("all");
  const [popup, setPopup] = useState<{ title: string; actions: any[]; index?: number } | null>(null);
  const [highlightQueue, setHighlightQueue] = useState<HighlightClip[]>([]);
  const [montageDesignItems, setMontageDesignItems] = useState<MontageDesignItem[]>([]);
  const [savedMontages, setSavedMontages] = useState<SavedMontage[]>([]);
  const [activeMontageId, setActiveMontageId] = useState<string>("");
  const [montageTitle, setMontageTitle] = useState(`Montage ${playerName}`);
  const [montageBusy, setMontageBusy] = useState(false);
  const [montageMessage, setMontageMessage] = useState("");
  const montageSupabase = useMemo(() => createClient(), []);
  const montageStorageKey = `mybasket_player_montage_${playerId}`;
  const montageDesignStorageKey = `mybasket_player_montage_design_${playerId}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(montageStorageKey);
      if (saved) setHighlightQueue(JSON.parse(saved));
    } catch {
      setHighlightQueue([]);
    }
  }, [montageStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(montageStorageKey, JSON.stringify(highlightQueue));
    } catch {
      // Le montage reste utilisable pendant la session.
    }
  }, [highlightQueue, montageStorageKey]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(montageDesignStorageKey);
      if (saved) setMontageDesignItems(JSON.parse(saved));
    } catch {
      setMontageDesignItems([]);
    }
  }, [montageDesignStorageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(montageDesignStorageKey, JSON.stringify(montageDesignItems));
    } catch {
      // Le montage reste utilisable pendant la session.
    }
  }, [montageDesignItems, montageDesignStorageKey]);

  const flashMontage = (message: string) => {
    setMontageMessage(message);
    window.setTimeout(() => setMontageMessage(""), 2400);
  };

  const refreshSavedMontages = async () => {
    const { data, error } = await montageSupabase
      .from("livestat_montages")
      .select("id,title,match_id,created_at,updated_at")
      .eq("team_id", teamId)
      .eq("player_id", playerId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Erreur chargement montages joueur :", error);
      return [];
    }

    const rows = (data ?? []) as SavedMontage[];
    setSavedMontages(rows);
    return rows;
  };

  const loadSavedMontage = async (montageId: string) => {
    if (!montageId) return;
    setMontageBusy(true);

    try {
      const montage = savedMontages.find((row) => row.id === montageId);
      const { data: items, error } = await montageSupabase
        .from("livestat_montage_items")
        .select("id,item_type,action_id,title,text,image_url,background_url,font_family,font_size,font_color,sort_order,created_at")
        .eq("montage_id", montageId)
        .order("sort_order", { ascending: true });

      if (error) throw error;

      setActiveMontageId(montageId);
      setMontageTitle(montage?.title || `Montage ${playerName}`);
      const itemRows = ((items ?? []) as any[]);
      setHighlightQueue(
        itemRows
          .filter((item) => item.item_type === "clip" && item.action_id)
          .map((item) => ({
            action_id: String(item.action_id),
            temps_fort: "",
            label: String(item.title ?? "Clip"),
            added_at: String(item.created_at ?? new Date().toISOString()),
          }))
      );
      setMontageDesignItems(
        itemRows
          .filter((item) => ["title", "text", "image"].includes(String(item.item_type)))
          .map((item) => ({
            id: String(item.id),
            item_type: item.item_type as MontageDesignItem["item_type"],
            title: String(item.title ?? ""),
            text: String(item.text ?? ""),
            image_url: String(item.image_url ?? ""),
            background_url: String(item.background_url ?? ""),
            font_family: String(item.font_family ?? "Inter"),
            font_size: Number(item.font_size ?? 38),
            font_color: String(item.font_color ?? "#ffffff"),
            placement: Number(item.sort_order ?? 0) < 0 ? "intro" : "outro",
          }))
      );
      flashMontage("Montage chargé ✓");
    } catch (error) {
      console.error("Erreur chargement montage :", error);
      flashMontage("Impossible de charger le montage");
    } finally {
      setMontageBusy(false);
    }
  };

  useEffect(() => {
    let active = true;

    (async () => {
      const rows = await refreshSavedMontages();
      if (!active || !rows.length) return;

      let hasLocalDraft = false;
      try {
        const local = window.localStorage.getItem(montageStorageKey);
        hasLocalDraft = Boolean(local && JSON.parse(local)?.length);
      } catch {
        hasLocalDraft = false;
      }

      if (!hasLocalDraft) {
        await loadSavedMontage(rows[0].id);
      }
    })();

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, playerId]);

  const toggleHighlight = (action: any) => {
    const actionId = String(action?.id ?? "");
    if (!actionId) return;

    setHighlightQueue((current) => {
      if (current.some((clip) => clip.action_id === actionId)) {
        return current.filter((clip) => clip.action_id !== actionId);
      }

      return [
        ...current,
        {
          action_id: actionId,
          temps_fort: String(action.temps_fort ?? ""),
          label: actionTypeLabel(action),
          added_at: new Date().toISOString(),
        },
      ];
    });
  };

  const removeHighlight = (actionId: string) =>
    setHighlightQueue((current) => current.filter((clip) => clip.action_id !== actionId));

  const clearHighlights = () => setHighlightQueue([]);

  const newMontage = () => {
    setActiveMontageId("");
    setMontageTitle(`Montage ${playerName}`);
    setHighlightQueue([]);
    setMontageDesignItems([]);
    flashMontage("Nouveau montage local");
  };

  const saveMontageToSupabase = async () => {
    if (!highlightQueue.length && !montageDesignItems.length) {
      flashMontage("Ajoute au moins un clip, un titre, un texte ou une image");
      return;
    }

    setMontageBusy(true);

    try {
      const { data: authData, error: authError } = await montageSupabase.auth.getUser();
      if (authError || !authData.user) throw authError || new Error("Utilisateur non connecté");

      const now = new Date().toISOString();
      const matchIds = Array.from(
        new Set(
          highlightQueue
            .map((clip) => (actions ?? []).find((action) => String(action.id) === clip.action_id)?.match_id)
            .filter(Boolean)
            .map(String)
        )
      );

      const payload: any = {
        user_id: authData.user.id,
        team_id: teamId,
        player_id: playerId,
        match_id: matchIds.length === 1 ? matchIds[0] : null,
        title: montageTitle.trim() || `Montage ${playerName}`,
        type: "player",
        updated_at: now,
      };

      let montageId = activeMontageId;

      if (montageId) {
        const { error } = await montageSupabase
          .from("livestat_montages")
          .update(payload)
          .eq("id", montageId);
        if (error) throw error;
      } else {
        const { data, error } = await montageSupabase
          .from("livestat_montages")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        montageId = String(data.id);
        setActiveMontageId(montageId);
      }

      const { error: deleteError } = await montageSupabase
        .from("livestat_montage_items")
        .delete()
        .eq("montage_id", montageId);
      if (deleteError) throw deleteError;

      const actionById = new Map((actions ?? []).map((action) => [String(action.id ?? ""), action]));
      const introItems = montageDesignItems.filter((item) => item.placement === "intro");
      const outroItems = montageDesignItems.filter((item) => item.placement === "outro");
      const designPayload = (item: MontageDesignItem, sortOrder: number) => ({
        montage_id: montageId,
        user_id: authData.user.id,
        item_type: item.item_type,
        action_id: null,
        clip_id: null,
        title: item.title || null,
        text: item.text || null,
        image_url: item.image_url || null,
        background_url: item.background_url || null,
        font_family: item.font_family || "Inter",
        font_size: Number(item.font_size || 38),
        font_color: item.font_color || "#ffffff",
        sort_order: sortOrder,
        position: sortOrder,
        duration: item.item_type === "image" ? 4 : 3,
      });

      const clipItems = highlightQueue.map((clip, index) => {
        const action = actionById.get(clip.action_id) as any;
        const clipStart = action?.edited_clip_start ?? action?.clip_start ?? action?.video_time ?? null;
        const clipEnd = action?.edited_clip_end ?? action?.clip_end ?? null;

        return {
          montage_id: montageId,
          user_id: authData.user.id,
          item_type: "clip",
          action_id: clip.action_id,
          clip_id: action?.clip_id ?? null,
          title: clip.label || actionTypeLabel(action || {}),
          sort_order: introItems.length + index,
          position: introItems.length + index,
          clip_start: clipStart,
          clip_end: clipEnd,
          duration:
            clipStart != null && clipEnd != null
              ? Math.max(0, Number(clipEnd) - Number(clipStart))
              : null,
        };
      });

      const items = [
        ...introItems.map((item, index) => designPayload(item, index)),
        ...clipItems,
        ...outroItems.map((item, index) =>
          designPayload(item, introItems.length + clipItems.length + index)
        ),
      ];

      const { error: insertError } = await montageSupabase
        .from("livestat_montage_items")
        .insert(items);
      if (insertError) throw insertError;

      await refreshSavedMontages();
      flashMontage("Montage enregistré dans Supabase ✓");
    } catch (error: any) {
      console.error("Erreur sauvegarde montage Supabase :", error);
      flashMontage(error?.message || "Impossible d'enregistrer le montage");
    } finally {
      setMontageBusy(false);
    }
  };

  const deleteSavedMontage = async () => {
    if (!activeMontageId) return;
    if (!window.confirm("Supprimer définitivement ce montage ?")) return;

    setMontageBusy(true);
    try {
      const { error } = await montageSupabase
        .from("livestat_montages")
        .delete()
        .eq("id", activeMontageId);
      if (error) throw error;
      newMontage();
      await refreshSavedMontages();
      flashMontage("Montage supprimé");
    } catch (error) {
      console.error("Erreur suppression montage :", error);
      flashMontage("Impossible de supprimer le montage");
    } finally {
      setMontageBusy(false);
    }
  };

  const matchLabelOf = useMemo(() => {
    const labels = new Map<string, string>();
    for (const row of matches ?? []) {
      labels.set(
        String(row.matchId),
        `${row.opponent || "Adversaire"}${row.date ? ` · ${fmtDate(row.date)}` : ""}`
      );
    }
    return (id: unknown) => labels.get(String(id ?? "")) || "Match";
  }, [matches]);

  // Données strictement individuelles : aucune action d'un autre joueur.
  const playerActionsOnly = useMemo(
    () =>
      (actions ?? []).filter((a) => {
        const id = String(playerId);
        return (
          String(a.player_id ?? "") === id ||
          String(a.assist_player_id ?? "") === id ||
          String(a.rebound_player_id ?? "") === id
        );
      }),
    [actions, playerId]
  );

  const montageActions = useMemo(() => {
    const byId = new Map(playerActionsOnly.map((action) => [String(action.id ?? ""), action]));
    return highlightQueue
      .map((clip) => byId.get(clip.action_id))
      .filter((action): action is any => Boolean(action));
  }, [playerActionsOnly, highlightQueue]);

  const matchOptions = useMemo(
    () =>
      Array.from(
        new Set(playerActionsOnly.map((a) => String(a.match_id ?? "")).filter(Boolean))
      ),
    [playerActionsOnly]
  );

  const filteredActions = useMemo(
    () =>
      playerActionsOnly.filter(
        (a) => matchFilter === "all" || String(a.match_id ?? "") === matchFilter
      ),
    [playerActionsOnly, matchFilter]
  );

  // La shot chart ne prend que les tirs dont ce joueur est le tireur.
  const playerShots = useMemo(() => {
    return filteredActions.filter(
      (a) =>
        String(a.player_id ?? "") === String(playerId) &&
        isFieldShot(a) &&
        (shotFilter === "all" || a.shot_type === shotFilter)
    );
  }, [filteredActions, playerId, shotFilter]);

  const locatedShots = useMemo(
    () =>
      playerShots.filter(
        (a) => Number.isFinite(Number(a.court_x)) && Number.isFinite(Number(a.court_y))
      ),
    [playerShots]
  );

  const shots2 = playerShots.filter((a) => a.shot_type === "2PTS");
  const shots3 = playerShots.filter((a) => a.shot_type === "3PTS");
  const made2 = shots2.filter(shotIsMade).length;
  const made3 = shots3.filter(shotIsMade).length;
  const made = playerShots.filter(shotIsMade).length;
  const pct = playerShots.length ? Math.round((made / playerShots.length) * 100) : 0;
  const totalPoints = filteredActions.reduce((sum, action) => {
    if (String(action.player_id ?? "") !== String(playerId)) return sum;
    return sum + matchActionPoints(action);
  }, 0);
  const clips = filteredActions.filter(actionHasClip);
  const zones = computeShotZones(playerShots);
  const ppa = filteredActions.length
    ? roundStat(totalPoints / filteredActions.length)
    : 0;

  const recentActions = [...filteredActions].reverse().slice(0, 8);
  const recentClips = [...clips].reverse().slice(0, 6);

  // Rentabilité strictement calculée sur les actions dont CE joueur est l'acteur.
  // Les passes décisives et rebonds où il est seulement associé restent visibles
  // dans la liste générale, mais ne faussent pas les possessions ni le PPP.
  const playerActorActions = useMemo(
    () =>
      filteredActions.filter(
        (action) => String(action.player_id ?? "") === String(playerId)
      ),
    [filteredActions, playerId]
  );

  const tempsFortRows = useMemo(() => {
    const grouped = new Map<string, any[]>();

    for (const action of playerActorActions) {
      const key = String(action.temps_fort ?? "").trim() || "sans_temps_fort";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(action);
    }

    return Array.from(grouped.entries())
      .map(([key, list]) => {
        const points = list.reduce((sum, action) => sum + matchActionPoints(action), 0);
        const madeActions = list.filter((action) => actionResultCategory(action) === "made");
        const missedActions = list.filter((action) => actionResultCategory(action) === "missed");
        const foulActions = list.filter((action) => actionResultCategory(action) === "fauteProv");
        const turnoverActions = list.filter((action) => actionResultCategory(action) === "perte");
        const stealActions = list.filter((action) => actionResultCategory(action) === "intercept");
        const otherActions = list.filter((action) => actionResultCategory(action) === "autre");
        const made = madeActions.length;
        const missed = missedActions.length;
        const foulsDrawn = foulActions.length;
        const turnovers = turnoverActions.length;
        const steals = stealActions.length;
        const attempts = made + missed;
        const clipsCount = list.filter(actionHasClip).length;

        return {
          key,
          label: key === "sans_temps_fort" ? "Sans temps fort" : tags.label(key),
          actions: list,
          madeActions,
          missedActions,
          foulActions,
          turnoverActions,
          stealActions,
          otherActions,
          possessions: list.length,
          points,
          ppp: list.length ? roundStat(points / list.length) : 0,
          made,
          missed,
          foulsDrawn,
          turnovers,
          steals,
          successPct: attempts ? Math.round((made / attempts) * 100) : 0,
          clipsCount,
        };
      })
      .sort((a, b) => b.possessions - a.possessions || b.ppp - a.ppp);
  }, [playerActorActions, tags]);

  const totalTempsFortPossessions = tempsFortRows.reduce((sum, row) => sum + row.possessions, 0);
  const totalTempsFortPoints = tempsFortRows.reduce((sum, row) => sum + row.points, 0);
  const globalTempsFortPpp = totalTempsFortPossessions
    ? roundStat(totalTempsFortPoints / totalTempsFortPossessions)
    : 0;

  const openPopup = (title: string, list: any[], index = 0) => {
    if (!list.length) return;
    setPopup({ title, actions: list, index });
  };

  return (
    <section className="pa-shell">
      <div className="pa-head">
        <div>
          <span className="pa-eyebrow">Analyse individuelle</span>
          <h2>Stats & vidéo — {playerName}</h2>
          <p>Uniquement les actions et les tirs de ce joueur.</p>
        </div>

        <div className="pa-head-actions">
          <input
            className="pa-montage-title"
            value={montageTitle}
            onChange={(e) => setMontageTitle(e.target.value)}
            placeholder="Nom du montage"
          />
          <select
            className="pa-montage-select"
            value={activeMontageId}
            onChange={(e) => e.target.value ? loadSavedMontage(e.target.value) : newMontage()}
          >
            <option value="">Nouveau montage</option>
            {savedMontages.map((montage) => (
              <option key={montage.id} value={montage.id}>
                {montage.title || "Montage sans titre"}
              </option>
            ))}
          </select>
          <button type="button" className="pa-montage-secondary" onClick={newMontage}>＋ Nouveau</button>
          <button
            type="button"
            className="pa-montage-save"
            disabled={montageBusy || !highlightQueue.length}
            onClick={saveMontageToSupabase}
          >
            {montageBusy ? "Enregistrement…" : "☁ Enregistrer"}
          </button>
          {activeMontageId && (
            <button type="button" className="pa-montage-delete" disabled={montageBusy} onClick={deleteSavedMontage}>Supprimer</button>
          )}
          <button
            type="button"
            className="pa-montage-launch"
            disabled={!montageActions.length}
            onClick={() => openPopup(montageTitle || "Montage en cours", montageActions)}
          >
            🎬 Ouvrir <b>{highlightQueue.length}</b>
          </button>
          <select value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)}>
            <option value="all">Tous les matchs</option>
            {matchOptions.map((id) => (
              <option key={id} value={id}>{matchLabelOf(id)}</option>
            ))}
          </select>
        </div>
      </div>

      {montageMessage && <div className="pa-montage-message">{montageMessage}</div>}

      <div className="pa-kpis">
        <div><span>Actions</span><strong>{filteredActions.length}</strong></div>
        <div><span>Points générés</span><strong>{totalPoints}</strong></div>
        <div><span>Réussite</span><strong>{pct}%</strong></div>
        <div><span>Clips</span><strong>{clips.length}</strong></div>
      </div>

      <div className="pa-tabs">
        <button className={section === "overview" ? "active" : ""} onClick={() => setSection("overview")}>Vue d'ensemble</button>
        <button className={section === "shots" ? "active" : ""} onClick={() => setSection("shots")}>Shot chart</button>
        <button className={section === "temps-forts" ? "active" : ""} onClick={() => setSection("temps-forts")}>Temps forts</button>
        <button className={section === "actions" ? "active" : ""} onClick={() => setSection("actions")}>Actions</button>
        <button className={section === "montage" ? "active" : ""} onClick={() => setSection("montage")}>Montage</button>
      </div>

      {(section === "overview" || section === "shots") && (
        <div className="pa-main-grid">
          <div className="pa-court-card">
            <div className="pa-card-title">
              <div>
                <h3>Shot chart personnelle</h3>
                <p>{playerShots.length} tir{playerShots.length > 1 ? "s" : ""} affiché{playerShots.length > 1 ? "s" : ""}</p>
              </div>
              <div className="pa-shot-switch">
                {(["all", "2PTS", "3PTS"] as const).map((value) => (
                  <button key={value} className={shotFilter === value ? "active" : ""} onClick={() => setShotFilter(value)}>
                    {value === "all" ? "Tous" : value}
                  </button>
                ))}
              </div>
            </div>

            <div className="pa-court pa-court-live">
              <ShotChart
                mode="analysis"
                size="lg"
                showPoints
                showDots
                showStats
                shots={playerShots}
                onShotClick={(shot) => {
                  const index = playerShots.findIndex((item) => item === shot);
                  openPopup("Tir du joueur", playerShots, Math.max(0, index));
                }}
                onZoneClick={(zoneId) => openPopup(`Zone ${zoneId}`, playerShots.filter((shot) => (shot.shot_zone_id ?? shot.zone) === zoneId))}
              />
            </div>

            <div className="pa-legend">
              <span><i className="made" /> Tir réussi</span>
              <span><i className="missed" /> Tir manqué</span>
              {locatedShots.length !== playerShots.length && (
                <em>{playerShots.length - locatedShots.length} tir(s) sans position</em>
              )}
            </div>
          </div>

          <aside className="pa-summary-card">
            <h3>Résumé tir</h3>
            <div className="pa-big-rate"><strong>{pct}%</strong><span>{made}/{playerShots.length}</span></div>
            <div className="pa-summary-row"><span>2 points</span><b>{made2}/{shots2.length}</b><em>{shots2.length ? Math.round((made2 / shots2.length) * 100) : 0}%</em></div>
            <div className="pa-summary-row"><span>3 points</span><b>{made3}/{shots3.length}</b><em>{shots3.length ? Math.round((made3 / shots3.length) * 100) : 0}%</em></div>
            <div className="pa-summary-row"><span>Pts / action</span><b>{ppa.toFixed(2)}</b><em>PPP</em></div>
            <div className="pa-summary-row"><span>Réussis</span><b className="green">{made}</b><em>tirs</em></div>
            <div className="pa-summary-row"><span>Manqués</span><b className="red">{Math.max(0, playerShots.length - made)}</b><em>tirs</em></div>
          </aside>
        </div>
      )}

      {section === "temps-forts" && (
        <div className="pa-tf-card">
          <div className="pa-card-title pa-tf-head">
            <div>
              <h3>Rentabilité par temps fort</h3>
              <p>Chaque ligne regroupe uniquement les actions réalisées par {playerName}.</p>
            </div>
            <div className="pa-tf-global">
              <span>PPP global</span>
              <strong>{globalTempsFortPpp.toFixed(2)}</strong>
              <em>{totalTempsFortPoints} pts · {totalTempsFortPossessions} possessions</em>
            </div>
          </div>

          {tempsFortRows.length === 0 ? (
            <p className="empty-small">Aucune action avec un temps fort pour ce joueur.</p>
          ) : (
            <div className="pa-tf-table-wrap">
              <table className="pa-tf-table">
                <thead>
                  <tr>
                    <th>Temps fort</th>
                    <th>Poss.</th>
                    <th>Points</th>
                    <th>PPP</th>
                    <th>Réussite</th>
                    <th>Résultats</th>
                    <th>Clips</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tempsFortRows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <button
                          className="pa-tf-name"
                          onClick={() => openPopup(row.label, row.actions)}
                        >
                          <strong>{row.label}</strong>
                          <span>{row.actions.length} action{row.actions.length > 1 ? "s" : ""}</span>
                        </button>
                      </td>
                      <td><b>{row.possessions}</b></td>
                      <td><b>{row.points}</b></td>
                      <td>
                        <span className={`pa-ppp ${row.ppp >= 1.2 ? "good" : row.ppp >= 0.8 ? "mid" : "low"}`}>
                          {row.ppp.toFixed(2)}
                        </span>
                      </td>
                      <td>
                        <b>{row.successPct}%</b>
                        <small>{row.made}/{row.made + row.missed}</small>
                      </td>
                      <td>
                        <div className="pa-tf-results">
                          <button
                            className="made"
                            disabled={!row.made}
                            title="Revoir les actions marquées"
                            onClick={() => openPopup(`${row.label} · Marqué`, row.madeActions)}
                          >
                            ✓ Marqué <b>{row.made}</b>
                          </button>
                          <button
                            className="missed"
                            disabled={!row.missed}
                            title="Revoir les tirs manqués"
                            onClick={() => openPopup(`${row.label} · Loupé`, row.missedActions)}
                          >
                            × Loupé <b>{row.missed}</b>
                          </button>
                          <button
                            className="turnover"
                            disabled={!row.turnovers}
                            title="Revoir les balles perdues"
                            onClick={() => openPopup(`${row.label} · Balle perdue`, row.turnoverActions)}
                          >
                            BP <span>Balle perdue</span> <b>{row.turnovers}</b>
                          </button>
                          <button
                            className="foul"
                            disabled={!row.foulsDrawn}
                            title="Revoir les fautes provoquées"
                            onClick={() => openPopup(`${row.label} · Faute provoquée`, row.foulActions)}
                          >
                            F <span>Faute provoquée</span> <b>{row.foulsDrawn}</b>
                          </button>
                          {row.steals > 0 && (
                            <button
                              className="steal"
                              title="Revoir les interceptions"
                              onClick={() => openPopup(`${row.label} · Interception`, row.stealActions)}
                            >
                              INT <span>Interception</span> <b>{row.steals}</b>
                            </button>
                          )}
                          {row.otherActions.length > 0 && (
                            <button
                              className="other"
                              title="Revoir les autres résultats"
                              onClick={() => openPopup(`${row.label} · Autres actions`, row.otherActions)}
                            >
                              Autres <b>{row.otherActions.length}</b>
                            </button>
                          )}
                        </div>
                      </td>
                      <td><b>{row.clipsCount}</b></td>
                      <td>
                        <button className="pa-tf-open" onClick={() => openPopup(row.label, row.actions)}>
                          Revoir →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pa-tf-note">
            <b>PPP</b> = points marqués ÷ possessions codées pour ce temps fort.
            Clique sur <b>Marqué</b>, <b>Loupé</b>, <b>Balle perdue</b> ou un autre résultat pour revoir uniquement ces actions.
            Les actions d'autres joueurs ne sont jamais intégrées.
          </div>
        </div>
      )}

      {section === "overview" && (
        <div className="pa-bottom-grid">
          <div className="pa-list-card">
            <div className="pa-card-title"><div><h3>Dernières actions</h3><p>Actions individuelles récentes</p></div></div>
            {recentActions.length === 0 ? <p className="empty-small">Aucune action.</p> : recentActions.map((action, index) => (
              <button className="pa-action-row" key={action.id ?? index} onClick={() => openPopup(actionTypeLabel(action), recentActions, index)}>
                <span className={`pa-result-dot ${actionResultCategory(action)}`} />
                <span className="pa-action-main"><b>{actionTypeLabel(action)}</b><em>{tags.label(action.temps_fort)}</em></span>
                <span>{quarterLabel(action.quarter)}</span>
                <span>{matchActionPoints(action)} pt</span>
                <span>{actionHasClip(action) ? "▶" : "—"}</span>
              </button>
            ))}
          </div>

          <div className="pa-list-card">
            <div className="pa-card-title"><div><h3>Clips clés</h3><p>Accès rapide aux séquences du joueur</p></div></div>
            {recentClips.length === 0 ? <p className="empty-small">Aucun clip synchronisé.</p> : recentClips.map((action, index) => (
              <button className="pa-clip-row" key={action.id ?? index} onClick={() => openPopup(actionTypeLabel(action), recentClips, index)}>
                <span className="pa-play">▶</span>
                <span><b>{actionTypeLabel(action)}</b><em>{matchLabelOf(action.match_id)} · {quarterLabel(action.quarter)}</em></span>
                <small>{matchTimeLabel(action)}</small>
              </button>
            ))}
          </div>
        </div>
      )}

      {section === "shots" && (
        <div className="pa-zones-card">
          <div className="pa-card-title"><div><h3>Répartition par zone</h3><p>Clique une zone pour voir ses tirs</p></div></div>
          <div className="pa-zone-grid">
            {zones.length === 0 ? <p className="empty-small">Aucune zone disponible.</p> : zones.map((zone) => {
              const zPct = zone.att ? Math.round((zone.made / zone.att) * 100) : 0;
              return (
                <button key={zone.id} onClick={() => openPopup(zone.label, zone.shots)}>
                  <span>{zone.label}</span><strong>{zPct}%</strong><em>{zone.made}/{zone.att}</em>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {section === "actions" && (
        <div className="pa-list-card pa-full-list">
          <div className="pa-card-title"><div><h3>Toutes les actions du joueur</h3><p>{filteredActions.length} action(s)</p></div></div>
          {[...filteredActions].reverse().map((action, index, list) => (
            <button className="pa-action-row" key={action.id ?? index} onClick={() => openPopup(actionTypeLabel(action), list, index)}>
              <span className={`pa-result-dot ${actionResultCategory(action)}`} />
              <span className="pa-action-main"><b>{actionTypeLabel(action)}</b><em>{tags.label(action.temps_fort)} · {matchLabelOf(action.match_id)}</em></span>
              <span>{quarterLabel(action.quarter)}</span>
              <span>{matchActionPoints(action)} pt</span>
              <span>{actionHasClip(action) ? "▶" : "—"}</span>
            </button>
          ))}
        </div>
      )}

      {section === "montage" && (
        <div className="pa-montages-section">
          <div className="pa-card-title">
            <div><h3>Montages assignés au joueur</h3><p>Tous les montages enregistrés avec ce joueur.</p></div>
          </div>
          <PlayerMontages teamId={teamId} playerId={playerId} showEmpty />
        </div>
      )}

      {popup && (
        <VideoModal
          title={popup.title}
          actions={popup.actions}
          startIndex={popup.index || 0}
          tags={tags}
          playerName={playerName}
          matchLabelOf={matchLabelOf}
          onRequestExport={onRequestExport}
          highlightQueue={highlightQueue}
          onToggleHighlight={toggleHighlight}
          onRemoveHighlight={removeHighlight}
          onClearHighlights={clearHighlights}
          onSaveMontage={saveMontageToSupabase}
          montageBusy={montageBusy}
          montageTitle={montageTitle}
          montageId={activeMontageId}
          teamId={teamId}
          playerId={playerId}
          montageDesignItems={montageDesignItems}
          onChangeMontageDesignItems={setMontageDesignItems}
          coachNotes={[]}
          onSaveNote={() => undefined}
          customTags={[]}
          onSaveTags={() => undefined}
          onClose={() => setPopup(null)}
        />
      )}
    </section>
  );
}


function PlayerCourt() {
  return (
    <svg viewBox="0 0 400 280" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="vrwood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#caa06a" />
          <stop offset="1" stopColor="#b07f3e" />
        </linearGradient>
      </defs>
      <rect width="400" height="280" fill="url(#vrwood)" />
      <g stroke="#fff" strokeWidth="2" fill="none" opacity=".92">
        <rect x="8" y="8" width="384" height="264" rx="4" />
        <rect x="150" y="8" width="100" height="104" fill="rgba(158,27,50,.40)" />
        <circle cx="200" cy="112" r="36" />
        <path d="M40 8 L40 64 A170 170 0 0 0 360 64 L360 8" />
        <circle cx="200" cy="34" r="9" stroke="#ff5a3c" strokeWidth="3" />
        <line x1="172" y1="20" x2="228" y2="20" strokeWidth="3" />
        <circle cx="200" cy="272" r="30" />
      </g>
    </svg>
  );
}

function VideoModal({
  title,
  actions,
  startIndex,
  tags,
  playerName,
  matchLabelOf,
  onRequestExport,
  highlightQueue,
  onToggleHighlight,
  onRemoveHighlight,
  onClearHighlights,
  onSaveMontage,
  montageBusy,
  montageTitle,
  montageId,
  teamId,
  playerId,
  montageDesignItems,
  onChangeMontageDesignItems,
  coachNotes,
  onSaveNote,
  customTags,
  onSaveTags,
  onClose,
}: {
  title: string;
  actions: any[];
  startIndex: number;
  tags: ReturnType<typeof useLivestatTags>;
  playerName: string;
  matchLabelOf: (id: unknown) => string;
  onRequestExport: (actionId: string) => void;
  highlightQueue: HighlightClip[];
  onToggleHighlight: (a: any) => void;
  onRemoveHighlight: (id: string) => void;
  onClearHighlights: () => void;
  onSaveMontage: () => void;
  montageBusy: boolean;
  montageTitle: string;
  montageId: string;
  teamId: string;
  playerId: string;
  montageDesignItems: MontageDesignItem[];
  onChangeMontageDesignItems: (items: MontageDesignItem[]) => void;
  coachNotes: VideoNote[];
  onSaveNote: (n: VideoNote) => void;
  customTags: VideoCustomTag[];
  onSaveTags: (t: VideoCustomTag) => void;
  onClose: () => void;
}) {
  const [pf, setPf] = useState({ result: "all", shot: "all", tf: "all", quarter: "all", match: "all" });
  const [idx, setIdx] = useState(startIndex || 0);
  const [panel, setPanel] = useState<"" | "note" | "tag" | "montage">("");
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState(NOTE_TYPES[0]);
  const [tagDraft, setTagDraft] = useState<string[]>([]);
  const [tagFree, setTagFree] = useState("");
  const [designType, setDesignType] = useState<MontageDesignItem["item_type"]>("title");
  const [designTitle, setDesignTitle] = useState("");
  const [designText, setDesignText] = useState("");
  const [designImage, setDesignImage] = useState("");
  const [designBackground, setDesignBackground] = useState("");
  const [designFont, setDesignFont] = useState("Inter");
  const [designSize, setDesignSize] = useState(38);
  const [designColor, setDesignColor] = useState("#ffffff");
  const [designPlacement, setDesignPlacement] = useState<"intro" | "outro">("intro");
  const [designUploading, setDesignUploading] = useState(false);
  const [advancedEditorOpen, setAdvancedEditorOpen] = useState(false);
  const modalSupabase = useMemo(() => createClient(), []);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const tfKeys = useMemo(() => Array.from(new Set(actions.map((a) => String(a.temps_fort ?? "")).filter(Boolean))), [actions]);
  const quarters = useMemo(() => Array.from(new Set(actions.map((a) => String(a.quarter ?? "")).filter(Boolean))).sort((a, b) => Number(a) - Number(b)), [actions]);
  const matchIds = useMemo(() => Array.from(new Set(actions.map((a) => String(a.match_id ?? "")).filter(Boolean))), [actions]);
  const hasLF = useMemo(() => actions.some((a) => a.shot_type === "LF"), [actions]);

  const list = useMemo(() => {
    return actions.filter((a) => {
      if (pf.result !== "all") {
        const cat = actionResultCategory(a);
        if (pf.result === "made" && cat !== "made") return false;
        if (pf.result === "missed" && cat !== "missed") return false;
        if (pf.result === "perte" && cat !== "perte") return false;
        if (pf.result === "passe" && String(a.assist_player_id ?? "") === "") return false;
        if (pf.result === "defense" && low(a.context) !== "defense") return false;
      }
      if (pf.shot !== "all" && a.shot_type !== pf.shot) return false;
      if (pf.tf !== "all" && String(a.temps_fort ?? "") !== pf.tf) return false;
      if (pf.quarter !== "all" && String(a.quarter ?? "") !== pf.quarter) return false;
      if (pf.match !== "all" && String(a.match_id ?? "") !== pf.match) return false;
      return true;
    });
  }, [actions, pf]);

  const safeIdx = list.length ? Math.min(idx, list.length - 1) : 0;
  const current = list[safeIdx];

  useEffect(() => { setIdx(startIndex || 0); }, [startIndex]);
  useEffect(() => { setIdx(0); }, [pf]);
  useEffect(() => {
    if (current && actionIsPlayable(current) && videoRef.current && current.clip_start != null) {
      try { videoRef.current.currentTime = Number(current.clip_start) || 0; } catch { /* no-op */ }
    }
  }, [current]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (event.key === "ArrowRight") setIdx((i) => Math.min(list.length - 1, i + 1));
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [list.length, onClose]);

  const goPrev = () => setIdx((i) => Math.max(0, (list.length ? Math.min(i, list.length - 1) : 0) - 1));
  const goNext = () => setIdx((i) => Math.min(list.length - 1, (list.length ? Math.min(i, list.length - 1) : 0) + 1));
  const goFullscreen = () => {
    const el = stageRef.current as any;
    if (el?.requestFullscreen) el.requestFullscreen();
    else if (el?.webkitRequestFullscreen) el.webkitRequestFullscreen();
  };

  const elig = current ? exportEligibility(current) : { ok: false, reason: "Aucune action" };
  const playable = current ? actionIsPlayable(current) : false;
  const url = current ? actionVideoUrl(current) : null;
  const cat = current ? actionResultCategory(current) : "autre";
  const catLabel = cat === "made" ? "Marqué" : cat === "missed" ? "Manqué" : cat === "fauteProv" ? "Faute provoquée" : cat === "intercept" ? "Intercepté" : cat === "perte" ? "Perte" : actionTypeLabel(current || {});

  const currentId = current ? String(current.id ?? "") : "";
  const isQueued = !!currentId && highlightQueue.some((c) => c.action_id === currentId);
  const existingNote = coachNotes.find((n) => n.action_id === currentId) || null;
  const existingTags = customTags.find((t) => t.action_id === currentId)?.tags || [];

  useEffect(() => {
    setNoteText(existingNote?.note || "");
    setNoteType(existingNote?.type || NOTE_TYPES[0]);
    setTagDraft(existingTags);
    setTagFree("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const toggleTagDraft = (t: string) =>
    setTagDraft((d) => (d.includes(t) ? d.filter((x) => x !== t) : [...d, t]));
  const submitNote = () => {
    if (!current) return;
    onSaveNote({ action_id: currentId, note: noteText.trim(), type: noteType, created_at: new Date().toISOString() });
    setPanel("");
  };
  const submitTags = () => {
    if (!current) return;
    const all = Array.from(new Set([...tagDraft, ...(tagFree.trim() ? [tagFree.trim()] : [])]));
    onSaveTags({ action_id: currentId, tags: all });
    setTagFree("");
    setPanel("");
  };

  const uploadMontageImage = async (file: File) => {
    setDesignUploading(true);
    try {
      const { data: authData, error: authError } = await modalSupabase.auth.getUser();
      if (authError || !authData.user) throw authError || new Error("Utilisateur non connecté");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const objectPath = `${authData.user.id}/${teamId}/${playerId}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await modalSupabase.storage
        .from("livestat-montages")
        .upload(objectPath, file, { upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      const { data } = modalSupabase.storage.from("livestat-montages").getPublicUrl(objectPath);
      setDesignImage(data.publicUrl);
    } catch (error: any) {
      console.error("Erreur upload image montage :", error);
      alert(error?.message || "Impossible d'envoyer l'image. Vérifie le bucket livestat-montages.");
    } finally {
      setDesignUploading(false);
    }
  };

  const addDesignItem = () => {
    if (designType === "image" && !designImage.trim()) return;
    if (designType !== "image" && !designTitle.trim() && !designText.trim()) return;
    const next: MontageDesignItem = {
      id: uid(),
      item_type: designType,
      title: designTitle.trim(),
      text: designText.trim(),
      image_url: designImage.trim(),
      background_url: designBackground.trim(),
      font_family: designFont,
      font_size: Number(designSize || 38),
      font_color: designColor,
      placement: designPlacement,
    };
    onChangeMontageDesignItems([...montageDesignItems, next]);
    setDesignTitle("");
    setDesignText("");
    setDesignImage("");
    setDesignBackground("");
  };
  const removeDesignItem = (id: string) =>
    onChangeMontageDesignItems(montageDesignItems.filter((item) => item.id !== id));
  const moveDesignItem = (id: string, dir: -1 | 1) => {
    const index = montageDesignItems.findIndex((item) => item.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= montageDesignItems.length) return;
    const copy = [...montageDesignItems];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChangeMontageDesignItems(copy);
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="vr-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vr-modal-head">
          <h2>{current ? `${tags.label(current.temps_fort)} - ${actionTypeLabel(current)} ${cat === "made" ? "marqué" : cat === "missed" ? "manqué" : ""}` : title}</h2>
          <div className="vr-head-right">
            <button className={`vr-montage-count ${panel === "montage" ? "on" : ""}`} onClick={() => setPanel((p) => (p === "montage" ? "" : "montage"))}>
              🎬 Montage ({highlightQueue.length})
            </button>
            <button className="vr-modal-x" onClick={onClose}>×</button>
          </div>
        </div>

        {panel === "montage" && (
          <div className="vr-montage-panel">
            <div className="vr-montage-head">
              <strong>{montageTitle || "Mon montage"} · {highlightQueue.length} clip{highlightQueue.length > 1 ? "s" : ""}</strong>
              <div className="vr-montage-actions">
                <button className="vr-montage-save" onClick={onSaveMontage} disabled={montageBusy || !highlightQueue.length}>
                  {montageBusy ? "Enregistrement…" : "☁ Enregistrer"}
                </button>
                <button className="vr-montage-clear" onClick={onClearHighlights} disabled={!highlightQueue.length}>Vider</button>
              </div>
            </div>
            {highlightQueue.length === 0 ? (
              <p className="vr-montage-empty">Aucun clip sélectionné. Utilise ⭐ Highlight sur une action.</p>
            ) : (
              <ul className="vr-montage-list">
                {highlightQueue.map((c) => (
                  <li key={c.action_id}>
                    <span style={{ color: tags.color(c.temps_fort) }}>{tags.emoji(c.temps_fort)} {tags.label(c.temps_fort)}</span>
                    <button onClick={() => onRemoveHighlight(c.action_id)} title="Retirer">✕</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="vr-montage-editor">
              <div className="vr-editor-head"><strong>Habillage du montage</strong><span>Titre, texte ou image</span></div>
              <div className="vr-editor-grid">
                <select value={designType} onChange={(e) => setDesignType(e.target.value as MontageDesignItem["item_type"])}>
                  <option value="title">Titre</option><option value="text">Texte</option><option value="image">Image</option>
                </select>
                <select value={designPlacement} onChange={(e) => setDesignPlacement(e.target.value as "intro" | "outro")}>
                  <option value="intro">Avant les clips</option><option value="outro">Après les clips</option>
                </select>
                <input placeholder="Titre" value={designTitle} onChange={(e) => setDesignTitle(e.target.value)} />
                <input placeholder="Texte / sous-titre" value={designText} onChange={(e) => setDesignText(e.target.value)} />
                <input placeholder="URL image" value={designImage} onChange={(e) => setDesignImage(e.target.value)} />
                <label className="vr-file-field">{designUploading ? "Envoi…" : "Importer une image"}<input type="file" accept="image/*" disabled={designUploading} onChange={(e) => { const file = e.target.files?.[0]; if (file) uploadMontageImage(file); e.currentTarget.value = ""; }} /></label>
                <input placeholder="URL image de fond" value={designBackground} onChange={(e) => setDesignBackground(e.target.value)} />
                <select value={designFont} onChange={(e) => setDesignFont(e.target.value)}>
                  <option>Inter</option><option>Roboto</option><option>Arial</option><option>Georgia</option><option>Impact</option>
                </select>
                <input type="number" min="14" max="120" value={designSize} onChange={(e) => setDesignSize(Number(e.target.value))} />
                <label className="vr-color-field">Couleur <input type="color" value={designColor} onChange={(e) => setDesignColor(e.target.value)} /></label>
                <button className="vr-add-design" onClick={addDesignItem}>＋ Ajouter</button>
              </div>
              {montageDesignItems.length > 0 && (
                <div className="vr-design-list">
                  {montageDesignItems.map((item, index) => (
                    <div className="vr-design-item" key={item.id}>
                      <div className="vr-design-preview" style={{ backgroundImage: item.background_url ? `linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.38)),url(${item.background_url})` : undefined }}>
                        {item.item_type === "image" && item.image_url ? <img src={item.image_url} alt="" /> : <span style={{ fontFamily: item.font_family, fontSize: Math.min(item.font_size, 22), color: item.font_color }}>{item.title || item.text || item.item_type}</span>}
                      </div>
                      <div><b>{item.item_type === "title" ? "Titre" : item.item_type === "text" ? "Texte" : "Image"}</b><small>{item.placement === "intro" ? "Avant les clips" : "Après les clips"}</small></div>
                      <div className="vr-design-actions"><button onClick={() => moveDesignItem(item.id, -1)} disabled={index === 0}>↑</button><button onClick={() => moveDesignItem(item.id, 1)} disabled={index === montageDesignItems.length - 1}>↓</button><button className="danger" onClick={() => removeDesignItem(item.id)}>✕</button></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="vr-montage-note">Les titres, textes et images seront enregistrés dans Supabase avec le montage.</p>
          </div>
        )}

        <div className="vr-modal-body">
          <div className="vr-modal-stage" ref={stageRef}>
            <button className="vr-stage-arrow prev" onClick={goPrev} disabled={safeIdx <= 0} aria-label="Clip précédent">‹</button>
            <button className="vr-stage-arrow next" onClick={goNext} disabled={safeIdx >= list.length - 1} aria-label="Clip suivant">›</button>
            {current && playable && url ? (
              <video ref={videoRef} src={url} controls playsInline className="vr-modal-video" />
            ) : (
              <div className="vr-modal-empty">
                <span>🎬 Clip à synchroniser</span>
                <small>{current ? "L'action est enregistrée. Le clip se lira ici dès la synchronisation de la vidéo du match." : "Aucune action."}</small>
              </div>
            )}
          </div>

          <div className="vr-modal-meta">
            <div className="vr-meta-row"><span>⚡ Temps fort</span><b style={{ color: current ? tags.color(current.temps_fort) : undefined }}>{current ? tags.label(current.temps_fort) : "—"}</b></div>
            <div className="vr-meta-row"><span>✔ Résultat</span><b className={`vr-res ${cat}`}>{catLabel}</b></div>
            <div className="vr-meta-row"><span>🎯 Type de tir</span><b>{current?.shot_type || actionTypeLabel(current || {})}</b></div>
            <div className="vr-meta-row"><span>🏀 Points</span><b>{current ? matchActionPoints(current) : 0}</b></div>
            <div className="vr-meta-row"><span>⏱ Période</span><b>{current ? quarterLabel(current.quarter) : "—"}</b></div>
            <div className="vr-meta-row"><span>🎬 Match</span><b>{current ? matchLabelOf(current.match_id) : "—"}</b></div>
            <div className="vr-meta-row"><span>🕑 Temps match</span><b>{current ? matchTimeLabel(current) : "—"}</b></div>
            {current && (current.score || current.us_score != null) && (
              <div className="vr-meta-row"><span>🔢 Score</span><b>{current.score ?? `${current.us_score}-${current.them_score}`}</b></div>
            )}
            <div className="vr-meta-row"><span>👤 Joueur</span><b>{playerName}</b></div>

            <div className="vr-modal-tools">
              <button className={`vr-tool ${isQueued ? "on" : ""}`} disabled={!current} onClick={() => current && onToggleHighlight(current)} title="Ajouter au highlight">
                {isQueued ? "✓ Dans le montage" : "+ Ajouter au montage"}
              </button>
              <button className={`vr-tool ${panel === "note" ? "on" : ""} ${existingNote ? "has" : ""}`} disabled={!current} onClick={() => setPanel((p) => (p === "note" ? "" : "note"))} title="Note coach">📝 Note{existingNote ? " •" : ""}</button>
              <button className={`vr-tool ${panel === "tag" ? "on" : ""} ${existingTags.length ? "has" : ""}`} disabled={!current} onClick={() => setPanel((p) => (p === "tag" ? "" : "tag"))} title="Tag perso">🏷 Tag{existingTags.length ? ` (${existingTags.length})` : ""}</button>
            </div>

            {panel === "note" && current && (
              <div className="vr-subpanel">
                <strong className="vr-subpanel-title">Note coach</strong>
                <select value={noteType} onChange={(e) => setNoteType(e.target.value)}>
                  {NOTE_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
                <textarea placeholder="Commentaire…" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                <div className="vr-subpanel-actions">
                  <button className="ghost" onClick={() => setPanel("")}>Annuler</button>
                  <button className="solid" onClick={submitNote}>Enregistrer</button>
                </div>
              </div>
            )}

            {panel === "tag" && current && (
              <div className="vr-subpanel">
                <strong className="vr-subpanel-title">Tags coach</strong>
                <div className="vr-quicktags">
                  {QUICK_TAGS.map((t) => (
                    <button key={t} className={`vr-qtag ${tagDraft.includes(t) ? "on" : ""}`} onClick={() => toggleTagDraft(t)}>{t}</button>
                  ))}
                </div>
                <input placeholder="Tag libre…" value={tagFree} onChange={(e) => setTagFree(e.target.value)} />
                <div className="vr-subpanel-actions">
                  <button className="ghost" onClick={() => setPanel("")}>Annuler</button>
                  <button className="solid" onClick={submitTags}>Enregistrer</button>
                </div>
              </div>
            )}

            <button className="vr-tool vr-advanced-edit" disabled={!current || !playable} onClick={() => setAdvancedEditorOpen(true)}>
              ✂ Éditer la vidéo
            </button>
            <button
              className="vr-export-btn"
              disabled={!elig.ok}
              title={elig.ok ? "Préparer l'export MP4" : elig.reason}
              onClick={() => current && elig.ok && onRequestExport(String(current.id))}
            >
              ⬇ Exporter en MP4
            </button>
            <div className={`vr-export-status ${elig.ok ? "ok" : "ko"}`}>
              {elig.ok ? "✔ Export possible · vidéo locale synchronisée" : `⚠ ${elig.reason}`}
            </div>
          </div>
        </div>

        <AdvancedVideoEditor
          open={advancedEditorOpen}
          onClose={() => setAdvancedEditorOpen(false)}
          action={current}
          videoUrl={url}
          montageId={montageId}
          teamId={teamId}
          playerId={playerId}
          montageTitle={montageTitle}
        />

        <div className="vr-modal-filters">
          <select value={pf.result} onChange={(e) => setPf({ ...pf, result: e.target.value })}>
            <option value="all">Tous</option>
            <option value="made">Marqués</option>
            <option value="missed">Ratés</option>
            <option value="perte">Perte</option>
            <option value="passe">Passe</option>
            <option value="defense">Défense</option>
          </select>
          <select value={pf.shot} onChange={(e) => setPf({ ...pf, shot: e.target.value })}>
            <option value="all">2PTS & 3PTS</option>
            <option value="2PTS">2PTS</option>
            <option value="3PTS">3PTS</option>
            {hasLF && <option value="LF">LF</option>}
          </select>
          <select value={pf.tf} onChange={(e) => setPf({ ...pf, tf: e.target.value })}>
            <option value="all">Tous temps forts</option>
            {tfKeys.map((k) => (<option key={k} value={k}>{tags.label(k)}</option>))}
          </select>
          <select value={pf.quarter} onChange={(e) => setPf({ ...pf, quarter: e.target.value })}>
            <option value="all">Toutes périodes</option>
            {quarters.map((q) => (<option key={q} value={q}>{quarterLabel(q)}</option>))}
          </select>
          <select value={pf.match} onChange={(e) => setPf({ ...pf, match: e.target.value })}>
            <option value="all">Tous les matchs</option>
            {matchIds.map((id) => (<option key={id} value={id}>{matchLabelOf(id)}</option>))}
          </select>
        </div>

        <div className="vr-modal-nav">
          <button className="light-btn outline" onClick={goPrev} disabled={safeIdx <= 0}>‹ Précédent</button>
          <span className="vr-counter">{list.length ? safeIdx + 1 : 0} / {list.length}</span>
          <button className="light-btn outline" onClick={goNext} disabled={safeIdx >= list.length - 1}>Suivant ›</button>
          <button className="light-btn outline" onClick={goFullscreen} disabled={!playable}>⛶</button>
        </div>
      </div>

      <style jsx>{`
        .modal-bg { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px; background: rgba(22, 14, 15, .58); backdrop-filter: blur(5px); z-index: 1299; }
        .vr-modal { position: relative; width: min(920px, 94vw); max-height: min(88vh, 820px); overflow: auto; background: #14100f; color: #f4efe8; border: 1px solid rgba(255,255,255,.11); border-radius: 18px; box-shadow: 0 30px 90px rgba(0,0,0,.62); z-index: 1300; }
        .vr-modal-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .8rem 1rem; border-bottom: 1px solid rgba(255,255,255,.08); }
        .vr-modal-head h2 { font-size: .95rem; margin: 0; font-weight: 800; color: #fff; }
        .vr-head-right { display: flex; align-items: center; gap: .5rem; }
        .vr-modal-x { width: 30px; height: 30px; border-radius: 999px; border: 0; background: rgba(255,255,255,.12); color: #fff; font-size: 1.1rem; cursor: pointer; }
        .vr-montage-count { border: 1px solid #d4a24c; background: rgba(212,162,76,.16); color: #f4c56a; border-radius: 999px; padding: .3rem .6rem; font-weight: 900; font-size: .74rem; cursor: pointer; white-space: nowrap; }
        .vr-montage-count.on { background: #d4a24c; color: #201b19; }
        .vr-montage-panel { margin: 0 1rem .4rem; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 10px; padding: .6rem .7rem; }
        .vr-montage-head { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .4rem; }.vr-montage-actions{display:flex;align-items:center;gap:.4rem}.vr-montage-save{background:#d4a24c;border:1px solid #d4a24c;color:#201b19;border-radius:6px;padding:.25rem .55rem;font-size:.7rem;font-weight:900;cursor:pointer}.vr-montage-save:disabled{opacity:.4;cursor:not-allowed}
        .vr-montage-head strong { color: #f4c56a; font-size: .8rem; }
        .vr-montage-clear { background: none; border: 1px solid rgba(255,255,255,.2); color: #f4efe8; border-radius: 6px; padding: .2rem .5rem; font-size: .7rem; font-weight: 800; cursor: pointer; }
        .vr-montage-clear:disabled { opacity: .4; cursor: not-allowed; }
        .vr-montage-empty, .vr-montage-note { color: #b9aca4; font-size: .72rem; margin: .2rem 0 0; }
        .vr-montage-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .25rem; max-height: 130px; overflow: auto; }
        .vr-montage-list li { display: flex; align-items: center; justify-content: space-between; gap: .5rem; background: rgba(255,255,255,.05); border-radius: 6px; padding: .25rem .5rem; font-size: .76rem; font-weight: 700; }
        .vr-montage-list li button { background: none; border: 0; color: #ff8a80; cursor: pointer; font-weight: 900; }
        .vr-montage-editor{margin-top:.65rem;padding-top:.65rem;border-top:1px solid rgba(255,255,255,.1)}.vr-editor-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:.45rem}.vr-editor-head strong{color:#f4c56a;font-size:.78rem}.vr-editor-head span{color:#9f9290;font-size:.66rem}.vr-editor-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.38rem}.vr-editor-grid input,.vr-editor-grid select{width:100%;min-width:0;background:#171313;border:1px solid rgba(255,255,255,.14);color:#f7f0ea;border-radius:7px;padding:.42rem .5rem;font-size:.7rem}.vr-color-field{display:flex;align-items:center;justify-content:space-between;background:#171313;border:1px solid rgba(255,255,255,.14);border-radius:7px;padding:.28rem .45rem;color:#b9aca4;font-size:.68rem}.vr-color-field input{width:34px;height:24px;padding:0;border:0;background:transparent}.vr-add-design{border:1px solid #d4a24c;background:#d4a24c;color:#211b18;border-radius:7px;font-size:.7rem;font-weight:900;cursor:pointer}.vr-design-list{display:grid;gap:.35rem;margin-top:.5rem;max-height:155px;overflow:auto}.vr-design-item{display:grid;grid-template-columns:78px minmax(0,1fr) auto;gap:.45rem;align-items:center;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:.35rem}.vr-design-preview{height:46px;border-radius:6px;background:#251e1d center/cover no-repeat;display:grid;place-items:center;overflow:hidden;text-align:center;padding:.25rem}.vr-design-preview img{width:100%;height:100%;object-fit:cover}.vr-design-item b,.vr-design-item small{display:block}.vr-design-item b{font-size:.7rem;color:#f4efe8}.vr-design-item small{font-size:.62rem;color:#9f9290}.vr-design-actions{display:flex;gap:.22rem}.vr-design-actions button{width:26px;height:26px;border-radius:6px;border:1px solid rgba(255,255,255,.14);background:#201a19;color:#f4efe8;cursor:pointer}.vr-design-actions button:disabled{opacity:.3;cursor:default}.vr-design-actions button.danger{color:#ff8a80}.vr-file-field{display:flex;align-items:center;justify-content:center;border:1px dashed rgba(212,162,76,.65);color:#f4c56a;border-radius:7px;font-size:.68rem;font-weight:900;cursor:pointer;min-height:32px}.vr-file-field input{display:none}
        .vr-modal-body { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: .8rem; padding: .9rem 1rem; }
        .vr-modal-stage { position: relative; background: #000; border-radius: 10px; overflow: hidden; min-height: 260px; display: grid; }
        .vr-stage-arrow { position: absolute; top: 50%; transform: translateY(-50%); z-index: 5; width: 42px; height: 42px; border-radius: 50%; border: 1px solid rgba(255,255,255,.35); background: rgba(12,8,8,.72); color: #fff; font-size: 28px; line-height: 1; cursor: pointer; box-shadow: 0 8px 22px rgba(0,0,0,.35); }
        .vr-stage-arrow.prev { left: 12px; }
        .vr-stage-arrow.next { right: 12px; }
        .vr-stage-arrow:disabled { opacity: .22; cursor: default; }
        .vr-modal-video { width: 100%; display: block; max-height: 300px; }
        .vr-modal-empty { display: grid; place-items: center; gap: .3rem; text-align: center; padding: 1rem; }
        .vr-modal-empty span { font-weight: 900; }
        .vr-modal-empty small { color: #b9aca4; font-size: .72rem; line-height: 1.35; }
        .vr-modal-meta { display: grid; gap: .3rem; align-content: start; }
        .vr-meta-row { display: flex; align-items: center; justify-content: space-between; gap: .5rem; font-size: .74rem; border-bottom: 1px solid rgba(255,255,255,.06); padding: .18rem 0; }
        .vr-meta-row span { color: #b9aca4; }
        .vr-meta-row b { color: #fff; font-weight: 800; text-align: right; }
        .vr-meta-row .vr-res.made { color: #6ee7a0; } .vr-meta-row .vr-res.missed { color: #ff8a80; }
        .vr-export-btn { margin-top: .5rem; width: 100%; border: 0; border-radius: 8px; padding: .5rem; font-weight: 900; background: #c0392b; color: #fff; cursor: pointer; }
        .vr-modal-tools { display: flex; gap: .35rem; margin-top: .5rem; flex-wrap: wrap; }
        .vr-tool { flex: 1; min-width: 74px; border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); color: #f4efe8; border-radius: 7px; padding: .35rem .3rem; font-size: .68rem; font-weight: 800; cursor: pointer; }
        .vr-tool:disabled { opacity: .4; cursor: not-allowed; }
        .vr-tool.on { background: #d4a24c; color: #201b19; border-color: #d4a24c; }
        .vr-tool.has { border-color: #d4a24c; }
        .vr-subpanel { margin-top: .5rem; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; padding: .6rem; display: grid; gap: .4rem; }
        .vr-subpanel-title { color: #f4c56a; font-size: .74rem; }
        .vr-subpanel select, .vr-subpanel textarea, .vr-subpanel input { background: #201b19; color: #f4efe8; border: 1px solid rgba(255,255,255,.14); border-radius: 7px; padding: .4rem .5rem; font: inherit; font-size: .76rem; width: 100%; }
        .vr-subpanel textarea { min-height: 56px; resize: vertical; }
        .vr-quicktags { display: flex; flex-wrap: wrap; gap: .3rem; }
        .vr-qtag { border: 1px solid rgba(255,255,255,.16); background: rgba(255,255,255,.06); color: #f4efe8; border-radius: 999px; padding: .25rem .5rem; font-size: .7rem; font-weight: 800; cursor: pointer; }
        .vr-qtag.on { background: #d4a24c; color: #201b19; border-color: #d4a24c; }
        .vr-subpanel-actions { display: flex; justify-content: flex-end; gap: .4rem; }
        .vr-subpanel-actions button { border-radius: 7px; padding: .35rem .8rem; font-weight: 800; font-size: .74rem; cursor: pointer; border: 1px solid rgba(255,255,255,.18); }
        .vr-subpanel-actions .ghost { background: transparent; color: #f4efe8; }
        .vr-subpanel-actions .solid { background: #d4a24c; color: #201b19; border-color: #d4a24c; }
        .vr-export-btn:disabled { background: #5a4a48; color: #cbbcb8; cursor: not-allowed; }
        .vr-export-status { margin-top: .35rem; font-size: .66rem; border-radius: 6px; padding: .3rem .4rem; text-align: center; }
        .vr-export-status.ok { background: rgba(212,162,76,.16); color: #f4c56a; }
        .vr-export-status.ko { background: rgba(255,255,255,.06); color: #d9b7b2; }
        .vr-modal-filters { display: flex; flex-wrap: wrap; gap: .4rem; padding: 0 1rem .3rem; }
        .vr-modal-filters select { background: #201b19; color: #f4efe8; border: 1px solid rgba(255,255,255,.12); border-radius: 6px; padding: .3rem .4rem; font: inherit; font-size: .72rem; }
        .vr-modal-nav { display: flex; align-items: center; gap: .5rem; padding: .5rem 1rem .9rem; }
        .vr-modal-nav .light-btn { background: rgba(255,255,255,.1); color: #fff; border-color: rgba(255,255,255,.15); }
        .vr-modal-nav .light-btn:disabled { opacity: .4; cursor: not-allowed; }
        .vr-counter { color: #b9aca4; font-weight: 900; font-size: .8rem; margin: 0 auto; }
        @media (max-width: 560px) {
          .modal-bg { padding: 8px; }
          .vr-modal { width: 100%; max-height: 94vh; }
          .vr-modal-body { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}


function ModernPlayerComparisonSection({
  team,
  p,
  liveStats,
  teamPlayersStats,
  currentPlayerId,
}: {
  team: Team;
  p: any;
  liveStats: PlayerLiveStats;
  teamPlayersStats: TeamPlayerComparisonStat[];
  currentPlayerId: string;
}) {
  const fallbackCurrent: TeamPlayerComparisonStat = {
    id: currentPlayerId,
    player_id: currentPlayerId,
    first_name: p.firstName ?? p.first_name ?? null,
    last_name: p.lastName ?? p.last_name ?? null,
    position: p.postePrincipal ?? p.position ?? null,
    pts: liveStats.hasData ? liveStats.averages.pts : statNumber(p.stats?.pts),
    reb: liveStats.hasData ? liveStats.averages.reb : statNumber(p.stats?.reb),
    ast: liveStats.hasData ? liveStats.averages.ast : statNumber(p.stats?.ast),
    stl: liveStats.hasData ? liveStats.averages.stl : statNumber(p.stats?.stl),
    blk: liveStats.hasData ? liveStats.averages.blk : statNumber(p.stats?.blk),
    turnovers: liveStats.hasData ? liveStats.averages.to : statNumber(p.stats?.to),
    plus_minus: statNumber(p.stats?.plusMinus ?? p.stats?.plus_minus),
  };

  const effectif = Math.max(team.players?.length || 0, teamPlayersStats.length || 0, 1);
  const rows = teamPlayersStats.length ? teamPlayersStats : [fallbackCurrent];
  const normalizedRows = rows.map((row) =>
    String(row.player_id || row.id) === currentPlayerId
      ? { ...row, ...fallbackCurrent }
      : row
  );

  const playerRow =
    normalizedRows.find((row) => String(row.player_id || row.id) === currentPlayerId) ||
    fallbackCurrent;

  const metrics: Array<{
    key: keyof Pick<TeamPlayerComparisonStat, "pts" | "reb" | "ast" | "stl" | "blk" | "turnovers" | "plus_minus">;
    label: string;
    short: string;
    icon: string;
    unit: string;
    lowerIsBetter?: boolean;
  }> = [
    { key: "pts", label: "Points", short: "POINTS", icon: "🏀", unit: "pts" },
    { key: "reb", label: "Rebonds", short: "REBONDS", icon: "🧺", unit: "reb" },
    { key: "ast", label: "Passes", short: "PASSES", icon: "🎯", unit: "ast" },
    { key: "stl", label: "Interceptions", short: "INTERCEPTIONS", icon: "✋", unit: "int" },
    { key: "blk", label: "Contres", short: "CONTRES", icon: "🛡️", unit: "ctr" },
    { key: "turnovers", label: "Balles perdues", short: "BALLES PERDUES", icon: "🏀", unit: "bp", lowerIsBetter: true },
    { key: "plus_minus", label: "+/-", short: "+/-", icon: "✚", unit: "+/-" },
  ];

  function metricValue(row: TeamPlayerComparisonStat, key: typeof metrics[number]["key"]) {
    return roundStat(statNumber(row[key]));
  }

  function averageFor(key: typeof metrics[number]["key"]) {
    const source = normalizedRows.filter((row) => row.player_id || row.id);
    if (!source.length) return 0;
    return roundStat(source.reduce((sum, row) => sum + metricValue(row, key), 0) / source.length);
  }

  function rankFor(key: typeof metrics[number]["key"], lowerIsBetter?: boolean): number | null {
    const current = metricValue(playerRow, key);
    const sorted = [...normalizedRows]
      .filter((row) => row.player_id || row.id)
      .sort((a, b) => {
        const av = metricValue(a, key);
        const bv = metricValue(b, key);
        return lowerIsBetter ? av - bv : bv - av;
      });

    // §23 · si personne n'a de valeur sur cette métrique (tous à zéro), aucun
    // classement pertinent : on renvoie null → affichage "Pas encore classé".
    const anyNonZero = sorted.some((row) => metricValue(row, key) !== 0) || current !== 0;
    if (!anyNonZero) return null;

    const index = sorted.findIndex((row) => String(row.player_id || row.id) === currentPlayerId);
    if (index >= 0) return index + 1;

    const better = sorted.filter((row) => {
      const value = metricValue(row, key);
      return lowerIsBetter ? value < current : value > current;
    }).length;

    return better + 1;
  }

  function medal(rank: number | null) {
    if (rank == null) return "";
    if (rank === 1) return "🥇";
    if (rank === 2) return "🥈";
    if (rank === 3) return "🥉";
    return "🏅";
  }

  const comparisonRows = metrics.map((metric) => {
    const value = metricValue(playerRow, metric.key);
    const avg = averageFor(metric.key);
    const rank = rankFor(metric.key, metric.lowerIsBetter);
    const diff = roundStat(value - avg);
    const isGood = metric.lowerIsBetter ? diff <= 0 : diff >= 0;
    const max = Math.max(Math.abs(value), Math.abs(avg), 1);
    const playerPct = Math.min(100, Math.max(1, (Math.abs(value) / max) * 100));
    const teamPct = Math.min(100, Math.max(1, (Math.abs(avg) / max) * 100));

    return { metric, value, avg, rank, diff, isGood, playerPct, teamPct };
  });

  return (
    <section className="mb-compare-modern">
      <div className="mb-compare-heading">
        <h2>Classement & comparaison</h2>
        <span />
        <p>Analysez vos performances et comparez-vous à votre équipe.</p>
      </div>

      <div className="mb-rank-card">
        <h3><span>🏀</span> Classement dans l'équipe</h3>
        <div className="mb-rank-grid">
          {comparisonRows.map((row) => (
            <article key={row.metric.key} className="mb-rank-tile">
              <div className="mb-rank-icon">{row.metric.icon}</div>
              <strong>{row.metric.short}</strong>
              <b>{row.value}</b>
              <small>moy. équipe {row.avg}</small>
              <em>{row.rank == null ? 'Pas encore classé' : `${medal(row.rank)} ${row.rank}/${effectif}`}</em>
            </article>
          ))}
        </div>
      </div>

      <div className="mb-average-card">
        <div className="mb-average-head">
          <h3><span>📊</span> Comparaison avec la moyenne</h3>
          <div className="mb-legend-modern">
            <i className="player" /> Joueur
            <i className="team" /> Équipe
            <i className="diff" /> Différence
          </div>
        </div>

        <div className="mb-average-list">
          {comparisonRows.map((row) => (
            <article key={row.metric.key} className="mb-average-row">
              <div className="mb-average-label">
                <span>{row.metric.icon}</span>
                <div>
                  <strong>{row.metric.short}</strong>
                  <b className={row.isGood ? "good" : "bad"}>{row.diff > 0 ? "+" : ""}{row.diff}</b>
                </div>
              </div>

              <div className="mb-bars-side">
                <div className="mb-bar-line">
                  <div className="mb-bar-meta"><span>Joueur</span><b>{row.value}</b></div>
                  <div className="mb-bar-track"><i className="player" style={{ width: `${row.playerPct}%` }} /></div>
                </div>

                <div className="mb-bar-line">
                  <div className="mb-bar-meta"><span>Équipe</span><b>{row.avg}</b></div>
                  <div className="mb-bar-track"><i className="team" style={{ width: `${row.teamPct}%` }} /></div>
                </div>
              </div>

              <div className={`mb-diff ${row.isGood ? "good" : "bad"}`}>
                <span>Différence</span>
                <strong>{row.diff > 0 ? "+" : ""}{row.diff}</strong>
              </div>
            </article>
          ))}
        </div>
      </div>

      <style jsx>{`
        .mb-compare-modern{margin-top:28px}.mb-compare-heading h2{margin:0;color:#111;font-size:2rem;font-weight:950;text-transform:uppercase;letter-spacing:.01em}.mb-compare-heading span{display:block;width:108px;height:7px;border-radius:999px;background:linear-gradient(90deg,#6b1a2c 0 55%,#d4a24c 55%);margin:.55rem 0 .7rem}.mb-compare-heading p{margin:0 0 1.2rem;color:#6f625d;font-weight:800}.mb-rank-card,.mb-average-card{border:1px solid #eadfd6;border-radius:18px;background:#fff;box-shadow:0 18px 40px rgba(60,30,20,.08);padding:1.35rem;margin-bottom:1.35rem}.mb-rank-card h3,.mb-average-card h3{margin:0;color:#6b1a2c;font-size:1.35rem;text-transform:uppercase;font-weight:950;display:flex;align-items:center;gap:.55rem}.mb-rank-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:1rem;margin-top:1.25rem}.mb-rank-tile{min-height:190px;border:1px solid #eadfd6;border-radius:16px;background:linear-gradient(180deg,#fff,#fffdf9);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:1rem;box-shadow:0 8px 20px rgba(60,30,20,.045)}.mb-rank-icon{width:54px;height:54px;border-radius:999px;background:radial-gradient(circle at 30% 20%,#b51d3a,#6b1a2c 72%);color:white;display:grid;place-items:center;font-size:1.45rem;box-shadow:0 8px 18px rgba(107,26,44,.25);margin-bottom:.7rem}.mb-rank-tile strong{font-size:.82rem;color:#24171b;text-transform:uppercase}.mb-rank-tile b{font-size:1.65rem;color:#111;margin:.35rem 0 .15rem}.mb-rank-tile small{color:#6f625d;font-weight:800}.mb-rank-tile em{font-style:normal;margin-top:.65rem;color:#111;font-weight:950;font-size:1.1rem}.mb-average-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1.2rem}.mb-legend-modern{display:flex;align-items:center;gap:.7rem;color:#6f625d;font-weight:900;font-size:.82rem;text-transform:uppercase}.mb-legend-modern i{width:12px;height:12px;border-radius:999px;display:inline-block}.mb-legend-modern .player{background:#6b1a2c}.mb-legend-modern .team{background:#d4a24c}.mb-legend-modern .diff{background:#b7b7b7}.mb-average-list{display:flex;flex-direction:column;gap:.55rem}.mb-average-row{display:grid;grid-template-columns:260px 1fr 135px;align-items:center;gap:1.3rem;border:1px solid #eadfd6;border-radius:14px;background:#fff;padding:.9rem 1rem}.mb-average-label{display:flex;align-items:center;gap:1rem}.mb-average-label>span{width:42px;height:42px;border-radius:999px;background:#6b1a2c;color:#fff;display:grid;place-items:center;font-size:1.15rem}.mb-average-label strong{display:block;color:#111;font-weight:950;text-transform:uppercase}.mb-average-label b{display:block;margin-top:.2rem;font-size:1.05rem}.good{color:#17803a!important}.bad{color:#c02626!important}.mb-bars-side{display:grid;grid-template-columns:1fr 1fr;gap:1.6rem}.mb-bar-meta{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:.35rem}.mb-bar-meta span{color:#6f625d;text-transform:uppercase;font-size:.72rem;font-weight:950}.mb-bar-meta b{font-size:1.15rem;color:#6b1a2c}.mb-bar-track{height:9px;border-radius:999px;background:#f0ece8;overflow:hidden}.mb-bar-track i{display:block;height:100%;border-radius:999px}.mb-bar-track .player{background:#6b1a2c}.mb-bar-track .team{background:#d4a24c}.mb-diff{text-align:center}.mb-diff span{display:block;color:#6f625d;text-transform:uppercase;font-size:.72rem;font-weight:950}.mb-diff strong{display:block;margin-top:.35rem;font-size:1.2rem}@media(max-width:1180px){.mb-rank-grid{grid-template-columns:repeat(3,1fr)}.mb-average-row{grid-template-columns:1fr}.mb-bars-side{grid-template-columns:1fr}}@media(max-width:700px){.mb-rank-grid{grid-template-columns:1fr}.mb-average-head{align-items:flex-start;flex-direction:column}.mb-legend-modern{flex-wrap:wrap}}
      `}</style>

      {/* §22 · Montages liés à ce joueur */}

    </section>
  );
}

function TestsTab({
  tests,
  growth,
  setGrowth,
  currentHeightCm,
  prediction,
  onAddTest,
  onDeleteTest,
}: {
  tests: PlayerTest[];
  growth: GrowthProfile;
  setGrowth: (g: GrowthProfile) => void;
  currentHeightCm: number;
  prediction: ReturnType<typeof predictedHeightRange>;
  onAddTest: () => void;
  onDeleteTest: (id: string) => void;
}) {
  const labels = Array.from(new Set(tests.map((t) => t.label)));
  const defaultLabels = ["Taille", "Poids", "Envergure", "Détente sèche", "VMA"];
  const chartLabels = labels.length ? labels : defaultLabels;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Tests & développement</h2>
          <p>Chaque test alimente automatiquement les graphiques d’évolution.</p>
        </div>

        <button className="light-btn primary" onClick={onAddTest}>+ Ajouter un test</button>
      </div>

      <div className="player-grid two">
        <div className="light-card">
          <h3>Projection taille</h3>

          <div className="projection-grid">
            <ProjectionBox label="Taille actuelle" value={currentHeightCm ? `${currentHeightCm} cm` : "—"} />
            <ProjectionBox label="Taille cible" value={prediction.target ? `${prediction.target} cm` : "—"} />
            <ProjectionBox label="Projection probable" value={prediction.probable ? `${prediction.probable} cm` : "—"} />
            <ProjectionBox label="Fourchette" value={prediction.low ? `${prediction.low} - ${prediction.high} cm` : "—"} />
          </div>

          <p className="method-note">
            Méthode : {prediction.method}. {prediction.confidence}
          </p>

          <div className="form-mini">
            <label>
              Sexe
              <select value={growth.sex} onChange={(e) => setGrowth({ ...growth, sex: e.target.value as "garcon" | "fille" })}>
                <option value="garcon">Garçon</option>
                <option value="fille">Fille</option>
              </select>
            </label>

            <label>
              Taille père (cm)
              <input type="number" value={growth.fatherHeightCm} onChange={(e) => setGrowth({ ...growth, fatherHeightCm: e.target.value ? Number(e.target.value) : "" })} />
            </label>

            <label>
              Taille mère (cm)
              <input type="number" value={growth.motherHeightCm} onChange={(e) => setGrowth({ ...growth, motherHeightCm: e.target.value ? Number(e.target.value) : "" })} />
            </label>

            <label>
              Âge osseux (optionnel)
              <input type="number" step="0.1" value={growth.boneAge || ""} onChange={(e) => setGrowth({ ...growth, boneAge: e.target.value ? Number(e.target.value) : "" })} />
            </label>
          </div>
        </div>

        <div className="light-card">
          <h3>Tests récents</h3>

          {tests.length === 0 ? (
            <p className="empty-small">Aucun test pour le moment.</p>
          ) : (
            <table className="phys-light">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Test</th>
                  <th>Résultat</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {[...tests].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((test) => (
                  <tr key={test.id}>
                    <td>{fmtDate(test.date)}</td>
                    <td>{test.label}</td>
                    <td>{test.value} {test.unit}</td>
                    <td>
                      <button className="icon-btn" onClick={() => onDeleteTest(test.id)}>🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="charts-stack">
        {chartLabels.map((label) => (
          <EvolutionChart key={label} title={`Évolution ${label}`} tests={tests.filter((t) => t.label === label)} />
        ))}
      </div>
    </>
  );
}

function MedicalTab({
  entries,
  onAdd,
  onDelete,
}: {
  entries: MedicalEntry[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  const latest = [...entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const totalDays = entries.reduce((sum, e) => sum + (e.daysOff || 0), 0);
  const injuries = entries.filter((e) => e.status === "Blessé").length;

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Médical</h2>
          <p>Disponibilité, blessures, reprise et historique des indisponibilités.</p>
        </div>

        <button className="light-btn primary" onClick={onAdd}>+ Ajouter un suivi</button>
      </div>

      <div className="kpi-row-light">
        <Kpi icon="🩺" label="Statut actuel" value={latest?.status || "Disponible"} sub="Dernier suivi" />
        <Kpi icon="⏳" label="Jours d'arrêt" value={String(totalDays)} sub="Cumul historique" />
        <Kpi icon="⚠️" label="Blessures" value={String(injuries)} sub="Nombre d'alertes" />
        <Kpi icon="✅" label="Disponibilité" value={latest?.status === "Blessé" ? "Non" : "Oui"} sub="Aujourd'hui" />
      </div>

      <div className="light-card">
        <h3>Historique médical</h3>

        {entries.length === 0 ? (
          <p className="empty-small">Aucune entrée médicale.</p>
        ) : (
          <table className="phys-light">
            <thead>
              <tr>
                <th>Date</th>
                <th>Statut</th>
                <th>Zone</th>
                <th>Blessure</th>
                <th>Arrêt</th>
                <th>Gravité</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map((entry) => (
                <tr key={entry.id}>
                  <td>{fmtDate(entry.date)}</td>
                  <td>{entry.status}</td>
                  <td>{entry.zone || "—"}</td>
                  <td>{entry.injury || "—"}</td>
                  <td>{entry.daysOff} j</td>
                  <td>{entry.severity}</td>
                  <td>
                    <button className="icon-btn" onClick={() => onDelete(entry.id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function BilansTab({
  bilans,
  onNew,
  onEdit,
  onDelete,
  onPdf,
}: {
  bilans: PlayerBilan[];
  onNew: () => void;
  onEdit: (bilan: PlayerBilan) => void;
  onDelete: (id: string) => void;
  onPdf: (bilan: PlayerBilan) => void;
}) {
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Bilans</h2>
          <p>Entretiens individuels, auto-évaluation, évaluation coach et plan d’action.</p>
        </div>

        <button className="light-btn primary" onClick={onNew}>+ Nouveau bilan</button>
      </div>

      {bilans.length === 0 ? (
        <div className="light-card empty-card">
          <h3>Aucun bilan</h3>
          <p>Crée un premier bilan pour suivre l’évolution du joueur sur la saison.</p>
          <button className="light-btn primary" onClick={onNew}>Créer un bilan</button>
        </div>
      ) : (
        <div className="bilan-grid">
          {[...bilans].sort((a, b) => b.date.localeCompare(a.date)).map((bilan) => (
            <article key={bilan.id} className="bilan-card">
              <div className="bilan-top">
                <span>{bilan.type}</span>
                <strong>{fmtDate(bilan.date)}</strong>
              </div>

              <div className="bilan-scores">
                <ScorePill label="Joueur" value={`${ratingAverage(bilan.playerRatings)}/10`} />
                <ScorePill label="Coach" value={`${ratingAverage(bilan.coachRatings)}/10`} />
                <ScorePill label="Indiv." value={`${bilan.individualNote}/10`} />
              </div>

              <p>{bilan.coachConclusion || bilan.objectives || "Bilan enregistré."}</p>

              <div className="bilan-actions">
                <button onClick={() => onEdit(bilan)}>Modifier</button>
                <button onClick={() => onPdf(bilan)}>PDF</button>
                <button className="danger" onClick={() => onDelete(bilan.id)}>🗑️</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function DocumentsTab({
  documents,
  onAdd,
  onDelete,
}: {
  documents: PlayerDocument[];
  onAdd: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className="section-head">
        <div>
          <h2>Documents</h2>
          <p>Administratif, performance, scolarité, vidéo et contrats.</p>
        </div>

        <button className="light-btn primary" onClick={onAdd}>+ Ajouter un document</button>
      </div>

      {documents.length === 0 ? (
        <div className="light-card empty-card">
          <h3>Aucun document</h3>
          <p>Ajoute les licences, certificats, bilans, vidéos ou documents scolaires.</p>
        </div>
      ) : (
        <div className="doc-grid">
          {[...documents].sort((a, b) => b.date.localeCompare(a.date)).map((doc) => (
            <article key={doc.id} className="doc-card">
              <span>{doc.category}</span>
              <h3>{doc.title}</h3>
              <p>{fmtDate(doc.date)}</p>
              {doc.notes && <small>{doc.notes}</small>}

              <div className="bilan-actions">
                {doc.url && (
                  <a href={doc.url} target="_blank" rel="noreferrer">Ouvrir</a>
                )}
                <button className="danger" onClick={() => onDelete(doc.id)}>🗑️</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function EvolutionChart({ title, tests }: { title: string; tests: PlayerTest[] }) {
  const rows = [...tests].sort((a, b) => a.date.localeCompare(b.date));
  const max = Math.max(...rows.map((r) => r.value), 1);
  const min = Math.min(...rows.map((r) => r.value), 0);
  const range = max - min || 1;
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? 50 : (index / (rows.length - 1)) * 100;
    const y = 100 - ((row.value - min) / range) * 80 - 10;
    return { x, y, row };
  });

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const trend = tests.length >= 2 ? trendByLabel(tests, tests[0]?.label || "") : null;

  return (
    <div className="chart-card">
      <div className="chart-head">
        <div>
          <h3>{title}</h3>
          <p>{rows.length} mesure{rows.length > 1 ? "s" : ""}</p>
        </div>

        {trend && (
          <strong className={trend.diff >= 0 ? "green" : "red"}>
            {trend.diff >= 0 ? "+" : ""}{trend.diff} {trend.last.unit}
          </strong>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="empty-graph">Aucune donnée</div>
      ) : (
        <svg viewBox="0 0 100 100" className="line-evolution" preserveAspectRatio="none">
          <line x1="0" y1="90" x2="100" y2="90" />
          <line x1="0" y1="10" x2="0" y2="90" />
          <path d={path} />
          {points.map((point) => (
            <circle key={point.row.id} cx={point.x} cy={point.y} r="2.4" />
          ))}
        </svg>
      )}

      {rows.length > 0 && (
        <div className="chart-values">
          <span>{fmtDate(rows[0].date)} · {rows[0].value}{rows[0].unit}</span>
          <span>{fmtDate(rows[rows.length - 1].date)} · {rows[rows.length - 1].value}{rows[rows.length - 1].unit}</span>
        </div>
      )}
    </div>
  );
}

function BilanModal({
  bilan,
  setBilan,
  onClose,
  onSave,
}: {
  bilan: PlayerBilan;
  setBilan: (bilan: PlayerBilan) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const patch = (p: Partial<PlayerBilan>) => setBilan({ ...bilan, ...p });
  const patchRating = (key: "playerRatings" | "coachRatings", rating: Partial<RatingBlock>) =>
    setBilan({ ...bilan, [key]: { ...bilan[key], ...rating } });

  return (
    <Modal title="Bilan joueur" onClose={onClose} wide>
      <div className="modal-grid">
        <Field label="Type de bilan">
          <select value={bilan.type} onChange={(e) => patch({ type: e.target.value as PlayerBilan["type"] })}>
            <option>Début de saison</option>
            <option>Mi-saison</option>
            <option>Fin de saison</option>
            <option>Bilan libre</option>
          </select>
        </Field>

        <Field label="Date">
          <input type="date" value={bilan.date} onChange={(e) => patch({ date: e.target.value })} />
        </Field>

        <Field label="Évaluateur">
          <input value={bilan.evaluator} onChange={(e) => patch({ evaluator: e.target.value })} />
        </Field>
      </div>

      <div className="bilan-form-grid">
        <FormBlock title="1. Notes générales">
          <Field label="Note saison équipe">
            <input type="number" min="0" max="10" value={bilan.seasonTeamNote} onChange={(e) => patch({ seasonTeamNote: Number(e.target.value) })} />
          </Field>

          <Field label="Pourquoi ?">
            <textarea value={bilan.seasonTeamWhy} onChange={(e) => patch({ seasonTeamWhy: e.target.value })} />
          </Field>

          <Field label="Note saison individuelle">
            <input type="number" min="0" max="10" value={bilan.individualNote} onChange={(e) => patch({ individualNote: Number(e.target.value) })} />
          </Field>

          <Field label="Pourquoi ?">
            <textarea value={bilan.individualWhy} onChange={(e) => patch({ individualWhy: e.target.value })} />
          </Field>
        </FormBlock>

        <FormBlock title="2. Évaluation joueur / coach">
          <RatingEditor title="Auto-évaluation joueur" value={bilan.playerRatings} onChange={(rating) => patchRating("playerRatings", rating)} />
          <RatingEditor title="Évaluation coach" value={bilan.coachRatings} onChange={(rating) => patchRating("coachRatings", rating)} />
        </FormBlock>

        <FormBlock title="3. Progression individuelle">
          <TwoText label="Physique" left={bilan.strengthsPhysical} right={bilan.improvementsPhysical} onLeft={(v) => patch({ strengthsPhysical: v })} onRight={(v) => patch({ improvementsPhysical: v })} />
          <TwoText label="Technique" left={bilan.strengthsTechnical} right={bilan.improvementsTechnical} onLeft={(v) => patch({ strengthsTechnical: v })} onRight={(v) => patch({ improvementsTechnical: v })} />
          <TwoText label="Tactique" left={bilan.strengthsTactical} right={bilan.improvementsTactical} onLeft={(v) => patch({ strengthsTactical: v })} onRight={(v) => patch({ improvementsTactical: v })} />
          <TwoText label="Mental" left={bilan.strengthsMental} right={bilan.improvementsMental} onLeft={(v) => patch({ strengthsMental: v })} onRight={(v) => patch({ improvementsMental: v })} />
          <TwoText label="Relationnel" left={bilan.strengthsRelational} right={bilan.improvementsRelational} onLeft={(v) => patch({ strengthsRelational: v })} onRight={(v) => patch({ improvementsRelational: v })} />
        </FormBlock>

        <FormBlock title="4. Projet / intersaison">
          <Field label="Ce qui te plaît au club, ce qu'il faut garder">
            <textarea value={bilan.keepAtClub} onChange={(e) => patch({ keepAtClub: e.target.value })} />
          </Field>

          <Field label="Baguette magique : élément structurel à améliorer">
            <textarea value={bilan.magicStructure} onChange={(e) => patch({ magicStructure: e.target.value })} />
          </Field>

          <Field label="Baguette magique : élément basket à améliorer">
            <textarea value={bilan.magicBasket} onChange={(e) => patch({ magicBasket: e.target.value })} />
          </Field>

          <Field label="Objectifs saison prochaine">
            <textarea value={bilan.objectives} onChange={(e) => patch({ objectives: e.target.value })} />
          </Field>

          <Field label="Comment t'y prendre ?">
            <textarea value={bilan.method} onChange={(e) => patch({ method: e.target.value })} />
          </Field>

          <Field label="Rôle attendu">
            <textarea value={bilan.expectedRole} onChange={(e) => patch({ expectedRole: e.target.value })} />
          </Field>

          <Field label="Partenaire d'internat envisagé">
            <input value={bilan.boardingPartner} onChange={(e) => patch({ boardingPartner: e.target.value })} />
          </Field>
        </FormBlock>

        <FormBlock title="5. Famille / scolarité">
          <Field label="Retranscription entretien joueur/famille">
            <textarea value={bilan.familySummary} onChange={(e) => patch({ familySummary: e.target.value })} />
          </Field>

          <Field label="Bilan scolaire">
            <textarea value={bilan.schoolReview} onChange={(e) => patch({ schoolReview: e.target.value })} />
          </Field>

          <Field label="Préparation examens">
            <textarea value={bilan.examsPreparation} onChange={(e) => patch({ examsPreparation: e.target.value })} />
          </Field>

          <Field label="Options / spécialités / orientation">
            <textarea value={bilan.orientationChoices} onChange={(e) => patch({ orientationChoices: e.target.value })} />
          </Field>
        </FormBlock>

        <FormBlock title="6. Plan d'action">
          <Field label="Planning vacances">
            <textarea value={bilan.holidayPlanning} onChange={(e) => patch({ holidayPlanning: e.target.value })} />
          </Field>

          <Field label="La photo de toi qui va changer : priorité intersaison">
            <textarea value={bilan.offseasonPriority} onChange={(e) => patch({ offseasonPriority: e.target.value })} />
          </Field>

          <Field label="Objectif n°1 + actions">
            <textarea value={bilan.actionPlan1} onChange={(e) => patch({ actionPlan1: e.target.value })} />
          </Field>

          <Field label="Objectif n°2 + actions">
            <textarea value={bilan.actionPlan2} onChange={(e) => patch({ actionPlan2: e.target.value })} />
          </Field>

          <Field label="Objectif n°3 + actions">
            <textarea value={bilan.actionPlan3} onChange={(e) => patch({ actionPlan3: e.target.value })} />
          </Field>

          <Field label="Conclusion coach">
            <textarea value={bilan.coachConclusion} onChange={(e) => patch({ coachConclusion: e.target.value })} />
          </Field>
        </FormBlock>
      </div>

      <div className="modal-actions">
        <button className="light-btn outline" onClick={onClose}>Annuler</button>
        <button className="light-btn primary" onClick={onSave}>Enregistrer le bilan</button>
      </div>
    </Modal>
  );
}

function RatingEditor({ title, value, onChange }: { title: string; value: RatingBlock; onChange: (v: Partial<RatingBlock>) => void }) {
  return (
    <div className="rating-editor">
      <h4>{title}</h4>
      {(["physique", "technique", "tactique", "mental", "relationnel"] as Array<keyof RatingBlock>).map((key) => (
        <label key={key}>
          <span>{key}</span>
          <input type="range" min="0" max="10" value={value[key]} onChange={(e) => onChange({ [key]: Number(e.target.value) })} />
          <b>{value[key]}/10</b>
        </label>
      ))}
    </div>
  );
}

function TwoText({
  label,
  left,
  right,
  onLeft,
  onRight,
}: {
  label: string;
  left: string;
  right: string;
  onLeft: (v: string) => void;
  onRight: (v: string) => void;
}) {
  return (
    <div className="two-text">
      <h4>{label}</h4>
      <textarea placeholder="3 points forts" value={left} onChange={(e) => onLeft(e.target.value)} />
      <textarea placeholder="3 axes d'amélioration" value={right} onChange={(e) => onRight(e.target.value)} />
    </div>
  );
}

function FormBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="form-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Modal({ title, children, onClose, wide }: { title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal ${wide ? "wide" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={onClose}>×</button>
        </div>

        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Attr({ label, value }: { label: string; value: string }) {
  return (
    <div className="attr-light">
      <label>{label}</label>
      <span>{value}</span>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  spark,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  sub: string;
  spark?: number[];
  color?: string;
}) {
  return (
    <div className="kpi-light">
      <div className="head">
        {icon} {label}
      </div>
      <div className="val">{value}</div>
      <div className="sub">{sub}</div>

      {spark && (
        <div className="spark">
          <Sparkline values={spark} color={color} />
        </div>
      )}
    </div>
  );
}

function StatCell({ n, l, small }: { n: number | string; l: string; small?: boolean }) {
  return (
    <div className="stat-cell-light">
      <div className="n" style={{ fontSize: small ? "1.2rem" : undefined }}>
        {n}
      </div>
      <div className="l">{l}</div>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="legend-light">
      <span style={{ background: color }} />
      <em>{label}</em>
      <b>{value}</b>
    </div>
  );
}

function Compare({
  icon,
  bg,
  label,
  rang,
  eff,
  sub,
}: {
  icon: string;
  bg: string;
  label: string;
  rang: number;
  eff: number;
  sub: string;
}) {
  return (
    <div className="compare-item-light">
      <div className="icon" style={{ background: bg }}>
        {icon}
      </div>

      <div>
        <div className="l">{label}</div>
        <div className="rang">
          #{rang} <small>/ {eff}</small>
        </div>
        <div className="sub">{sub}</div>
      </div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProjectionBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="projection-box">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScorePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="score-pill">
      {label} <b>{value}</b>
    </span>
  );
}

function bilanHtml(
  player: PlayerExtra,
  team: Team,
  bilan: PlayerBilan,
  tests: PlayerTest[],
  medical: MedicalEntry[],
  growth: GrowthProfile
) {
  const p: any = player;
  const height = latestByLabel(tests, "Taille")?.value || parseCm(p.taille);
  const projection = predictedHeightRange(growth, height);
  const medicalStatus = [...medical].sort((a, b) => b.date.localeCompare(a.date))[0]?.status || p.statut || "Disponible";

  const esc = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Bilan ${esc(p.firstName)} ${esc(p.lastName)}</title>
<style>
  body { font-family: Arial, sans-serif; color: #171717; margin: 32px; }
  h1 { color: #6b1a2c; margin-bottom: 4px; text-transform: uppercase; }
  h2 { color: #6b1a2c; border-bottom: 2px solid #6b1a2c; padding-bottom: 6px; margin-top: 28px; }
  .meta { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin: 18px 0; }
  .box { border: 1px solid #ddd; border-radius: 10px; padding: 12px; }
  .box span { display: block; color: #777; font-size: 12px; text-transform: uppercase; }
  .box strong { display: block; margin-top: 4px; font-size: 18px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  p { white-space: pre-wrap; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
  th { background: #f7f1ea; }
  @media print { body { margin: 18mm; } button { display:none; } }
</style>
</head>
<body>
  <h1>Bilan joueur — ${esc(p.firstName)} ${esc(p.lastName)}</h1>
  <div>${esc(team.name)} · ${esc(bilan.type)} · ${esc(fmtDate(bilan.date))}</div>

  <div class="meta">
    <div class="box"><span>Poste</span><strong>${esc(p.postePrincipal || "—")}</strong></div>
    <div class="box"><span>Taille</span><strong>${height ? `${height} cm` : "—"}</strong></div>
    <div class="box"><span>Médical</span><strong>${esc(medicalStatus)}</strong></div>
    <div class="box"><span>Projection taille</span><strong>${projection.probable ? `${projection.probable} cm` : "—"}</strong></div>
  </div>

  <h2>Notes générales</h2>
  <div class="grid">
    <div class="box"><span>Note équipe</span><strong>${bilan.seasonTeamNote}/10</strong><p>${esc(bilan.seasonTeamWhy)}</p></div>
    <div class="box"><span>Note individuelle</span><strong>${bilan.individualNote}/10</strong><p>${esc(bilan.individualWhy)}</p></div>
  </div>

  <h2>Évaluations</h2>
  <table>
    <tr><th>Domaine</th><th>Joueur</th><th>Coach</th></tr>
    <tr><td>Physique</td><td>${bilan.playerRatings.physique}/10</td><td>${bilan.coachRatings.physique}/10</td></tr>
    <tr><td>Technique</td><td>${bilan.playerRatings.technique}/10</td><td>${bilan.coachRatings.technique}/10</td></tr>
    <tr><td>Tactique</td><td>${bilan.playerRatings.tactique}/10</td><td>${bilan.coachRatings.tactique}/10</td></tr>
    <tr><td>Mental</td><td>${bilan.playerRatings.mental}/10</td><td>${bilan.coachRatings.mental}/10</td></tr>
    <tr><td>Relationnel</td><td>${bilan.playerRatings.relationnel}/10</td><td>${bilan.coachRatings.relationnel}/10</td></tr>
  </table>

  <h2>Progression individuelle</h2>
  <table>
    <tr><th>Domaine</th><th>Points forts</th><th>Axes d'amélioration</th></tr>
    <tr><td>Physique</td><td>${esc(bilan.strengthsPhysical)}</td><td>${esc(bilan.improvementsPhysical)}</td></tr>
    <tr><td>Technique</td><td>${esc(bilan.strengthsTechnical)}</td><td>${esc(bilan.improvementsTechnical)}</td></tr>
    <tr><td>Tactique</td><td>${esc(bilan.strengthsTactical)}</td><td>${esc(bilan.improvementsTactical)}</td></tr>
    <tr><td>Mental</td><td>${esc(bilan.strengthsMental)}</td><td>${esc(bilan.improvementsMental)}</td></tr>
    <tr><td>Relationnel</td><td>${esc(bilan.strengthsRelational)}</td><td>${esc(bilan.improvementsRelational)}</td></tr>
  </table>

  <h2>Projet & intersaison</h2>
  <p><strong>Ce qu'il faut garder :</strong><br/>${esc(bilan.keepAtClub)}</p>
  <p><strong>Objectifs :</strong><br/>${esc(bilan.objectives)}</p>
  <p><strong>Méthode :</strong><br/>${esc(bilan.method)}</p>
  <p><strong>Priorité intersaison :</strong><br/>${esc(bilan.offseasonPriority)}</p>

  <h2>Famille & scolarité</h2>
  <p><strong>Famille :</strong><br/>${esc(bilan.familySummary)}</p>
  <p><strong>Scolarité :</strong><br/>${esc(bilan.schoolReview)}</p>
  <p><strong>Orientation :</strong><br/>${esc(bilan.orientationChoices)}</p>

  <h2>Plan d'action</h2>
  <p>${esc(bilan.actionPlan1)}</p>
  <p>${esc(bilan.actionPlan2)}</p>
  <p>${esc(bilan.actionPlan3)}</p>

  <h2>Conclusion coach</h2>
  <p>${esc(bilan.coachConclusion)}</p>
</body>
</html>`;
}

const PLAYER_PAGE_CSS = `
@import url("https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700;800;900&family=Roboto:wght@400;500;700;800;900&display=swap");

html,
body {
  background: #ffffff !important;
}

.player-page-light {
  min-height: 100vh;
  background: #ffffff !important;
  color: #171717;
  display: grid;
  grid-template-columns: 260px 1fr;
  font-family: "Roboto", system-ui, sans-serif;
}

.player-page-light * {
  box-sizing: border-box;
}

.player-page-light button {
  font-family: inherit;
  cursor: pointer;
}

.player-list-side {
  background: #ffffff;
  border-right: 1px solid #e8e2da;
  min-height: 100vh;
  padding: 1rem .9rem;
  position: sticky;
  top: 0;
  color: #171717;
}

.player-list-brand {
  font-family: "Oswald", system-ui, sans-serif;
  color: #7a1228;
  font-weight: 800;
  font-size: 1.08rem;
  margin-bottom: 1.2rem;
  text-transform: uppercase;
}

.player-back {
  width: 100%;
  border: 1px solid #7a1228;
  background: #fff;
  color: #7a1228;
  border-radius: 999px;
  padding: .48rem .7rem;
  font-weight: 800;
  margin-bottom: 1rem;
}

.player-list-title {
  border-top: 1px solid #eee;
  border-bottom: 1px solid #eee;
  padding: .85rem 0;
  margin-bottom: .85rem;
  display: flex;
  flex-direction: column;
  gap: .2rem;
}

.player-list-title strong {
  color: #111;
  font-weight: 900;
}

.player-list-title span {
  color: #8a7b73;
  font-size: .8rem;
  font-weight: 700;
}

.player-list {
  display: flex;
  flex-direction: column;
  gap: .4rem;
}

.player-list-item {
  border: 1px solid transparent;
  background: #fff;
  color: #111;
  display: flex;
  align-items: center;
  gap: .6rem;
  text-align: left;
  border-radius: 12px;
  padding: .55rem;
  width: 100%;
}

.player-list-item:hover {
  background: #fbf6ef;
}

.player-list-item.active {
  background: #fdeef0;
  border-color: #f0d2d9;
}

.mini-photo {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: #7a1228;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-weight: 900;
  flex: 0 0 auto;
}

.mini-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.mini-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: .1rem;
}

.mini-info strong {
  font-size: .84rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mini-info em {
  font-style: normal;
  color: #8a7b73;
  font-size: .72rem;
  font-weight: 700;
}

.player-main {
  background: #ffffff !important;
  min-height: 100vh;
  padding: 1.4rem 1.8rem 3rem;
  max-width: 1180px;
}

.empty-player,
.empty-small {
  color: #8a7b73;
  padding: 1rem 0;
  font-weight: 800;
}

.player-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.4rem;
  flex-wrap: wrap;
}

.player-back-inline {
  background: #fff;
  color: #7a1228;
  border: 1px solid #7a1228;
  border-radius: 999px;
  padding: .45rem .9rem;
  font-weight: 800;
}

.player-actions {
  display: flex;
  gap: .6rem;
}

.light-btn {
  border-radius: 10px;
  padding: .55rem .95rem;
  font-size: .86rem;
  font-weight: 900;
  border: 1px solid #e8e2da;
  background: #fff;
  text-decoration: none;
  color: #171717;
}

.light-btn.primary {
  background: #f47b20;
  color: #111;
  border-color: #f47b20;
}

.light-btn.outline {
  color: #7a1228;
}

.player-hero {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr) 210px;
  gap: 1.2rem;
  align-items: stretch;
  margin-bottom: 1.2rem;
}

.player-photo {
  position: relative;
  width: 180px;
  height: 230px;
  border-radius: 16px;
  overflow: hidden;
  background: #f4efe8;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e8e2da;
  color: #7a1228;
  font-family: "Oswald", sans-serif;
  font-size: 4rem;
  font-weight: 900;
  flex-shrink: 0;
}

.player-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-num {
  position: absolute;
  top: 10px;
  left: 10px;
  background: #7a1228;
  color: #fff;
  border-radius: 999px;
  padding: .25rem .55rem;
  font-size: .8rem;
  font-weight: 900;
  z-index: 2;
}

.player-identity {
  min-width: 0;
  padding-left: 0.5rem;
}

.player-club {
  color: #7a1228;
  font-weight: 900;
}

.player-identity h1 {
  font-family: "Oswald", sans-serif;
  font-size: clamp(2rem, 4vw, 2.9rem);
  text-transform: uppercase;
  margin: .3rem 0 .2rem;
  line-height: 1;
  color: #151515;
  word-break: normal;
  overflow-wrap: anywhere;
}

.player-cat {
  color: #8a7b73;
  font-size: .9rem;
  margin-bottom: .9rem;
}

.player-cat b {
  color: #f47b20;
  text-transform: uppercase;
  font-size: .75rem;
  letter-spacing: .05em;
}

.player-attr-grid,
.admin-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: .8rem 1.2rem;
  padding: .9rem 0;
  border-top: 1px solid #e8e2da;
  border-bottom: 1px solid #e8e2da;
}

.admin-grid {
  grid-template-columns: repeat(4, 1fr);
  border: 0;
  padding: 0;
}

.attr-light label {
  display: block;
  color: #8a7b73;
  text-transform: uppercase;
  font-size: .68rem;
  letter-spacing: .05em;
  font-weight: 900;
  margin-bottom: .2rem;
}

.attr-light span {
  color: #171717;
  font-size: .9rem;
  font-weight: 800;
}

.player-hero-bottom {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: .9rem;
  flex-wrap: wrap;
}

.status-pill {
  border-radius: 999px;
  padding: .3rem .65rem;
  font-size: .78rem;
  font-weight: 900;
  background: #e8f7ef;
  color: #168653;
}

.status-pill.blesse {
  background: #ffe8e8;
  color: #c5283d;
}

.stars-line {
  color: #8a7b73;
  font-size: .85rem;
}

.stars-line span {
  color: #f47b20;
  font-size: 1rem;
}

.jersey-card-light,
.light-card,
.kpi-light,
.compare-item-light,
.chart-card,
.bilan-card,
.doc-card {
  background: #ffffff;
  border: 1px solid #e8e2da;
  border-radius: 16px;
  box-shadow: 0 8px 22px rgba(60, 30, 20, .06);
}

.jersey-card-light {
  padding: 1rem;
}

.jersey-meta-light {
  border-top: 1px solid #e8e2da;
  margin-top: .8rem;
  padding-top: .8rem;
  color: #8a7b73;
  font-size: .82rem;
  display: grid;
  gap: .5rem;
}

.jersey-meta-light b {
  display: block;
  color: #171717;
  margin-top: .15rem;
}

.light-card {
  padding: 1.1rem 1.2rem;
  margin-bottom: 1.2rem;
}

.light-card h3,
.compare-title-light,
.section-head h2 {
  font-family: "Oswald", sans-serif;
  text-transform: uppercase;
  color: #7a1228;
  margin: 0 0 .9rem;
  font-size: 1rem;
  letter-spacing: .04em;
}

.section-head h2 {
  font-size: 1.35rem;
  margin-bottom: .1rem;
}

.light-card h3 span,
.compare-title-light span {
  color: #8a7b73;
  font-family: "Roboto", sans-serif;
  font-size: .75rem;
  text-transform: none;
  font-weight: 500;
}

.muted,
.section-head p,
.method-note {
  color: #8a7b73;
  font-size: .85rem;
  margin: 0;
}

.admin-card {
  margin-bottom: 1.2rem;
}

.player-tabs {
  display: flex;
  gap: 1rem;
  border-bottom: 1px solid #e8e2da;
  margin: 1.2rem 0 1rem;
  overflow-x: auto;
}

.player-tabs button {
  border: 0;
  background: none;
  color: #8a7b73;
  font-weight: 900;
  text-transform: uppercase;
  font-size: .75rem;
  padding: .8rem 0;
  white-space: nowrap;
}

.player-tabs button.active {
  color: #f47b20;
  border-bottom: 2px solid #f47b20;
}

.kpi-row-light {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: .9rem;
  margin-bottom: 1.2rem;
}

.kpi-light {
  padding: 1rem;
}

.kpi-light .head {
  color: #8a7b73;
  font-size: .8rem;
  font-weight: 900;
  text-transform: uppercase;
}

.kpi-light .val {
  font-family: "Oswald", sans-serif;
  font-size: 2rem;
  color: #171717;
  font-weight: 900;
  line-height: 1;
  margin-top: .4rem;
}

.kpi-light .sub {
  color: #8a7b73;
  font-size: .8rem;
}

.player-grid {
  display: grid;
  gap: 1rem;
  margin-bottom: 1.2rem;
}

.player-grid.three {
  grid-template-columns: 1fr 1fr 1.3fr;
}

.player-grid.two {
  grid-template-columns: 1fr 1fr;
}

.stats-grid-light {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: .8rem;
  margin-top: 1rem;
}

.pct-row-light {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: .8rem;
  border-top: 1px solid #e8e2da;
  margin-top: 1rem;
  padding-top: 1rem;
}

.stat-cell-light {
  text-align: center;
}

.stat-cell-light .n {
  font-family: "Oswald", sans-serif;
  color: #7a1228;
  font-size: 1.8rem;
  font-weight: 900;
}

.stat-cell-light .l {
  color: #8a7b73;
  text-transform: uppercase;
  font-size: .7rem;
  font-weight: 900;
}

.temps-row {
  display: flex;
  gap: 1.2rem;
  align-items: center;
  flex-wrap: wrap;
}

.legend-list {
  display: flex;
  flex-direction: column;
  gap: .5rem;
  font-size: .85rem;
}

.legend-light {
  display: flex;
  align-items: center;
  gap: .5rem;
}

.legend-light span {
  width: 10px;
  height: 10px;
  border-radius: 3px;
}

.legend-light em {
  color: #8a7b73;
  font-style: normal;
}

.legend-light b {
  margin-left: auto;
  padding-left: .5rem;
  color: #171717;
}

.phys-light {
  width: 100%;
  border-collapse: collapse;
  font-size: .88rem;
}

.phys-light th {
  text-align: left;
  color: #8a7b73;
  text-transform: uppercase;
  font-size: .7rem;
  padding-bottom: .5rem;
}

.phys-light td {
  border-top: 1px solid #e8e2da;
  padding: .65rem .25rem;
  color: #171717;
  font-weight: 700;
}

.compare-light {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: .8rem;
  margin-bottom: 2rem;
}

.compare-item-light {
  display: flex;
  gap: .7rem;
  padding: .9rem;
  align-items: center;
}

.compare-item-light .icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
}

.compare-item-light .l {
  color: #8a7b73;
  font-size: .75rem;
  font-weight: 900;
  text-transform: uppercase;
}

.compare-item-light .rang {
  color: #171717;
  font-weight: 900;
  font-size: 1.2rem;
}

.compare-item-light .rang small,
.compare-item-light .sub {
  color: #8a7b73;
}

.compare-item-light .sub {
  font-size: .75rem;
}

.section-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.summary-list {
  display: grid;
  gap: .65rem;
}

.summary-line {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid #e8e2da;
  padding-bottom: .55rem;
}

.summary-line span {
  color: #8a7b73;
  font-weight: 800;
}

.summary-line strong {
  color: #171717;
}

.projection-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: .7rem;
  margin-bottom: .8rem;
}

.projection-box {
  border-radius: 14px;
  background: #fbf6ef;
  padding: .8rem;
  border: 1px solid #efe4da;
}

.projection-box span {
  display: block;
  color: #8a7b73;
  font-size: .7rem;
  font-weight: 900;
  text-transform: uppercase;
}

.projection-box strong {
  display: block;
  color: #7a1228;
  font-family: "Oswald", sans-serif;
  font-size: 1.45rem;
  margin-top: .2rem;
}

.form-mini {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: .7rem;
  margin-top: 1rem;
}

.form-mini label,
.field {
  display: grid;
  gap: .35rem;
  color: #8a7b73;
  font-size: .75rem;
  font-weight: 900;
  text-transform: uppercase;
}

.form-mini input,
.form-mini select,
.field input,
.field select,
.field textarea,
.two-text textarea {
  border: 1px solid #e8e2da;
  border-radius: 10px;
  padding: .65rem .75rem;
  background: #fff;
  color: #171717;
  font: inherit;
  font-size: .9rem;
  text-transform: none;
}

.field textarea,
.two-text textarea {
  min-height: 90px;
  resize: vertical;
}

.charts-stack {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.chart-card {
  padding: 1rem;
}

.chart-head {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: .7rem;
}

.chart-head h3 {
  color: #7a1228;
  font-family: "Oswald", sans-serif;
  margin: 0;
  text-transform: uppercase;
}

.chart-head p {
  color: #8a7b73;
  margin: 0;
  font-size: .8rem;
}

.green {
  color: #168653;
}

.red {
  color: #c5283d;
}

.line-evolution {
  width: 100%;
  height: 180px;
  display: block;
  overflow: visible;
}

.line-evolution line {
  stroke: #e8e2da;
  stroke-width: .8;
}

.line-evolution path {
  fill: none;
  stroke: #7a1228;
  stroke-width: 2.2;
  vector-effect: non-scaling-stroke;
}

.line-evolution circle {
  fill: #f47b20;
  vector-effect: non-scaling-stroke;
}

.chart-values {
  display: flex;
  justify-content: space-between;
  color: #8a7b73;
  font-size: .78rem;
  font-weight: 800;
}

.empty-graph {
  height: 180px;
  border: 1px dashed #e8e2da;
  border-radius: 14px;
  display: grid;
  place-items: center;
  color: #8a7b73;
  font-weight: 900;
}

.icon-btn {
  border: 0;
  background: transparent;
}

.bilan-grid,
.doc-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.bilan-card,
.doc-card {
  padding: 1rem;
}

.bilan-top {
  display: flex;
  justify-content: space-between;
  gap: .6rem;
  margin-bottom: .8rem;
}

.bilan-top span,
.doc-card span {
  color: #f47b20;
  font-weight: 900;
  text-transform: uppercase;
  font-size: .72rem;
}

.bilan-top strong {
  color: #7a1228;
}

.bilan-scores {
  display: flex;
  flex-wrap: wrap;
  gap: .4rem;
  margin-bottom: .75rem;
}

.score-pill {
  background: #fbf6ef;
  color: #8a7b73;
  border-radius: 999px;
  padding: .28rem .55rem;
  font-size: .75rem;
  font-weight: 900;
}

.score-pill b {
  color: #7a1228;
}

.bilan-card p,
.doc-card p,
.doc-card small,
.empty-card p {
  color: #8a7b73;
  line-height: 1.45;
}

.bilan-actions {
  display: flex;
  gap: .5rem;
  flex-wrap: wrap;
  margin-top: 1rem;
}

.bilan-actions button,
.bilan-actions a {
  border: 1px solid #e8e2da;
  background: #fff;
  color: #7a1228;
  border-radius: 999px;
  padding: .4rem .7rem;
  text-decoration: none;
  font-weight: 900;
}

.bilan-actions .danger {
  color: #c5283d;
}

.doc-card h3 {
  font-family: "Oswald", sans-serif;
  color: #7a1228;
  margin: .3rem 0;
  text-transform: uppercase;
}

.empty-card {
  text-align: center;
}

.modal-bg {
  position: fixed;
  inset: 0;
  background: rgba(10, 8, 8, .55);
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 1rem;
}

.modal {
  background: #fff;
  border-radius: 18px;
  width: min(720px, 96vw);
  max-height: 92vh;
  overflow: auto;
  padding: 1rem;
  border: 1px solid #e8e2da;
}

.modal.wide {
  width: min(1120px, 96vw);
}

.modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.modal-head h2 {
  font-family: "Oswald", sans-serif;
  color: #7a1228;
  text-transform: uppercase;
  margin: 0;
}

.modal-head button {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 0;
  background: #7a1228;
  color: #fff;
  font-size: 1.3rem;
}

.modal-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: .8rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: .7rem;
  margin-top: 1rem;
}

.bilan-form-grid {
  display: grid;
  gap: 1rem;
}

.form-block {
  border: 1px solid #e8e2da;
  border-radius: 16px;
  padding: 1rem;
}

.form-block h3 {
  margin: 0 0 .8rem;
  color: #7a1228;
  font-family: "Oswald", sans-serif;
  text-transform: uppercase;
}

.rating-editor {
  display: grid;
  gap: .5rem;
  margin-bottom: 1rem;
}

.rating-editor h4,
.two-text h4 {
  margin: .3rem 0;
  color: #171717;
}

.rating-editor label {
  display: grid;
  grid-template-columns: 110px 1fr 46px;
  align-items: center;
  gap: .6rem;
  color: #8a7b73;
  font-weight: 900;
  text-transform: capitalize;
}

.two-text {
  display: grid;
  grid-template-columns: 120px 1fr 1fr;
  gap: .7rem;
  align-items: start;
  margin-bottom: .8rem;
}

.toast-light {
  position: fixed;
  bottom: 1.2rem;
  left: 50%;
  transform: translateX(-50%);
  background: #7a1228;
  color: #fff;
  padding: .7rem 1rem;
  border-radius: 999px;
  font-weight: 900;
  z-index: 1200;
  box-shadow: 0 8px 24px rgba(0,0,0,.2);
}

@media (max-width: 1180px) {
  .player-page-light {
    grid-template-columns: 1fr;
  }

  .player-list-side {
    position: relative;
    min-height: auto;
    border-right: 0;
    border-bottom: 1px solid #e8e2da;
  }

  .player-list {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }

  .player-main {
    max-width: none;
  }
}

@media (max-width: 960px) {
  .player-hero,
  .player-grid.three,
  .player-grid.two,
  .charts-stack,
  .bilan-grid,
  .doc-grid {
    grid-template-columns: 1fr;
  }

  .player-photo {
    width: 100%;
    height: 280px;
  }

  .jersey-card-light {
    display: none;
  }

  .player-attr-grid,
  .admin-grid,
  .kpi-row-light,
  .compare-light,
  .form-mini,
  .modal-grid,
  .projection-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .two-text {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .player-main {
    padding: 1rem;
  }

  .player-list {
    grid-template-columns: 1fr;
  }

  .player-attr-grid,
  .admin-grid,
  .kpi-row-light,
  .compare-light,
  .form-mini,
  .modal-grid,
  .projection-grid {
    grid-template-columns: 1fr;
  }

  .player-actions {
    width: 100%;
  }

  .light-btn {
    flex: 1;
  }
}
.pa-shell{padding:24px 0 40px;color:#211c1d}.pa-montage-title{min-width:190px;border:1px solid #e8ded9;background:#fff;border-radius:12px;padding:10px 12px;font-weight:750;color:#352e30}.pa-montage-select{min-width:190px!important}.pa-montage-secondary,.pa-montage-save,.pa-montage-delete{border-radius:11px;padding:10px 12px;font-weight:900;cursor:pointer;white-space:nowrap}.pa-montage-secondary{border:1px solid #dfd1cb;background:#fff;color:#574b4e}.pa-montage-save{border:1px solid #8d1531;background:#8d1531;color:#fff}.pa-montage-delete{border:1px solid #efc8c8;background:#fff5f5;color:#b42318}.pa-montage-save:disabled,.pa-montage-delete:disabled{opacity:.45;cursor:not-allowed}.pa-montage-message{margin:-6px 0 14px;padding:10px 13px;border:1px solid #d8eadf;background:#f1faf4;color:#187746;border-radius:11px;font-size:12px;font-weight:800}.pa-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:18px}.pa-eyebrow{display:block;color:#8d1531;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.14em;margin-bottom:5px}.pa-head h2{margin:0;font-size:27px;letter-spacing:-.03em;color:#211c1d}.pa-head p{margin:6px 0 0;color:#83787a;font-size:13px}.pa-head-actions{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.pa-head-actions select{min-width:210px;border:1px solid #e8ded9;background:#fff;border-radius:12px;padding:11px 36px 11px 13px;font-weight:700;color:#352e30}.pa-montage-launch{border:1px solid #d7a84f;background:#201b19;color:#f4c56a;border-radius:12px;padding:10px 13px;font-weight:900;cursor:pointer;white-space:nowrap}.pa-montage-launch b{display:inline-grid;place-items:center;min-width:22px;height:22px;margin-left:6px;border-radius:999px;background:#d4a24c;color:#201b19}.pa-montage-launch:disabled{opacity:.45;cursor:not-allowed}.pa-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:18px}.pa-kpis>div{background:#fff;border:1px solid #eadfda;border-radius:15px;padding:15px 17px;box-shadow:0 7px 20px rgba(58,35,28,.04)}.pa-kpis span{display:block;color:#918486;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.pa-kpis strong{display:block;margin-top:5px;font-size:26px;color:#8d1531}.pa-tabs{display:flex;gap:6px;border-bottom:1px solid #eadfda;margin-bottom:16px}.pa-tabs button{border:0;background:transparent;padding:11px 14px;color:#8b7f81;font-weight:800;cursor:pointer;border-bottom:3px solid transparent}.pa-tabs button.active{color:#8d1531;border-bottom-color:#f0823f}.pa-main-grid{display:grid;grid-template-columns:minmax(0,1fr) 245px;gap:14px;align-items:stretch}.pa-court-card,.pa-summary-card,.pa-list-card,.pa-zones-card{background:#fff;border:1px solid #eadfda;border-radius:16px;box-shadow:0 8px 26px rgba(60,38,31,.045)}.pa-court-card{padding:15px}.pa-card-title{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:12px}.pa-card-title h3{margin:0;font-size:16px;color:#292224}.pa-card-title p{margin:3px 0 0;font-size:12px;color:#938789}.pa-shot-switch{display:flex;padding:3px;background:#f5efec;border-radius:10px}.pa-shot-switch button{border:0;background:transparent;border-radius:8px;padding:7px 11px;font-size:11px;font-weight:900;color:#786d6f;cursor:pointer}.pa-shot-switch button.active{background:#8d1531;color:#fff}.pa-court{position:relative;aspect-ratio:10/7;overflow:hidden;border-radius:12px;background:#bd8f56}.pa-court>svg{width:100%;height:100%;display:block}.pa-shot{position:absolute;z-index:3;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;border:2px solid #fff;display:grid;place-items:center;color:#fff;font-size:14px;font-weight:1000;box-shadow:0 2px 7px rgba(0,0,0,.36);cursor:pointer;transition:.16s ease}.pa-shot:hover{transform:translate(-50%,-50%) scale(1.25);z-index:5}.pa-shot.made{background:#1f9d55}.pa-shot.missed{background:#df342c}.pa-legend{display:flex;align-items:center;gap:18px;padding-top:12px;color:#655a5c;font-size:12px;font-weight:700}.pa-legend span{display:flex;align-items:center;gap:7px}.pa-legend i{width:11px;height:11px;border-radius:50%;display:inline-block}.pa-legend i.made{background:#1f9d55}.pa-legend i.missed{background:#df342c}.pa-legend em{margin-left:auto;color:#9a8d90;font-style:normal}.pa-summary-card{padding:18px}.pa-summary-card h3{margin:0 0 14px;font-size:16px}.pa-big-rate{display:flex;align-items:flex-end;gap:9px;padding:16px;border-radius:14px;background:#8d1531;color:#fff;margin-bottom:10px}.pa-big-rate strong{font-size:40px;line-height:1}.pa-big-rate span{font-size:13px;font-weight:800;opacity:.82;padding-bottom:4px}.pa-summary-row{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:12px 1px;border-bottom:1px solid #f0e7e3}.pa-summary-row span{font-size:12px;color:#776b6d;font-weight:700}.pa-summary-row b{font-size:16px;color:#2c2527}.pa-summary-row em{grid-column:2;font-size:10px;color:#9b8e90;font-style:normal;text-align:right}.pa-summary-row b.green{color:#1f9d55}.pa-summary-row b.red{color:#df342c}.pa-bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}.pa-list-card{padding:15px}.pa-action-row,.pa-clip-row{width:100%;display:grid;align-items:center;border:0;border-top:1px solid #f0e8e4;background:transparent;padding:11px 4px;text-align:left;cursor:pointer;color:#403638}.pa-action-row{grid-template-columns:12px minmax(0,1fr) 45px 45px 28px;gap:9px}.pa-action-row:hover,.pa-clip-row:hover{background:#fbf7f5}.pa-action-main,.pa-clip-row>span:nth-child(2){min-width:0}.pa-action-main b,.pa-clip-row b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pa-action-main em,.pa-clip-row em,.pa-clip-row small{display:block;color:#998c8e;font-size:10px;font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pa-result-dot{width:9px;height:9px;border-radius:50%;background:#aaa}.pa-result-dot.made{background:#1f9d55}.pa-result-dot.missed,.pa-result-dot.perte{background:#df342c}.pa-result-dot.intercept,.pa-result-dot.fauteProv{background:#e6a21a}.pa-clip-row{grid-template-columns:34px minmax(0,1fr) auto;gap:10px}.pa-play{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#f8e9df;color:#8d1531;font-size:10px}.pa-zones-card{padding:15px;margin-top:14px}.pa-zone-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.pa-zone-grid button{border:1px solid #eee2dd;background:#fcf9f7;border-radius:12px;padding:13px;text-align:left;cursor:pointer}.pa-zone-grid button:hover{border-color:#c9977c;background:#fff}.pa-zone-grid span{display:block;color:#817476;font-size:10px;font-weight:800}.pa-zone-grid strong{display:block;font-size:23px;color:#8d1531;margin-top:4px}.pa-zone-grid em{font-style:normal;font-size:11px;color:#998d8f}.pa-full-list{margin-top:2px}.pa-tf-card{background:#fff;border:1px solid #eadfda;border-radius:16px;padding:18px;box-shadow:0 8px 26px rgba(60,38,31,.045)}.pa-tf-head{align-items:flex-start}.pa-tf-global{min-width:185px;background:#8d1531;color:#fff;border-radius:14px;padding:12px 15px;text-align:right}.pa-tf-global span,.pa-tf-global em{display:block}.pa-tf-global span{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;opacity:.78}.pa-tf-global strong{display:block;font-size:31px;line-height:1.05;margin:3px 0}.pa-tf-global em{font-size:10px;font-style:normal;opacity:.78}.pa-tf-table-wrap{overflow:auto;border:1px solid #eee3de;border-radius:13px}.pa-tf-table{width:100%;border-collapse:collapse;min-width:890px}.pa-tf-table th{background:#f8f3f0;color:#87797c;font-size:10px;text-transform:uppercase;letter-spacing:.06em;text-align:left;padding:11px 10px;border-bottom:1px solid #eadfda}.pa-tf-table td{padding:12px 10px;border-bottom:1px solid #f1e9e5;color:#3e3537;font-size:12px;vertical-align:middle}.pa-tf-table tbody tr:last-child td{border-bottom:0}.pa-tf-table tbody tr:hover{background:#fcf8f6}.pa-tf-name{border:0;background:transparent;padding:0;text-align:left;cursor:pointer;color:#2f282a}.pa-tf-name strong,.pa-tf-name span{display:block}.pa-tf-name strong{font-size:13px}.pa-tf-name span{font-size:10px;color:#9a8c8f;margin-top:2px}.pa-ppp{display:inline-flex;min-width:48px;justify-content:center;border-radius:999px;padding:5px 8px;font-weight:900}.pa-ppp.good{background:#e5f6eb;color:#167a43}.pa-ppp.mid{background:#fff3d9;color:#9a6700}.pa-ppp.low{background:#fde8e5;color:#bd2d25}.pa-tf-table td small{display:block;color:#9a8d90;margin-top:2px}.pa-tf-results{display:flex;flex-wrap:wrap;gap:6px}.pa-tf-results button{display:inline-flex;align-items:center;gap:4px;border:1px solid transparent;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900;cursor:pointer;transition:.15s ease}.pa-tf-results button span{font-weight:800}.pa-tf-results button b{font-size:10px}.pa-tf-results button:hover:not(:disabled){transform:translateY(-1px);filter:brightness(.97);box-shadow:0 3px 8px rgba(45,28,25,.10)}.pa-tf-results button:disabled{opacity:.35;cursor:default}.pa-tf-results .made{background:#e5f6eb;color:#167a43;border-color:#c9ead5}.pa-tf-results .missed{background:#fde8e5;color:#bd2d25;border-color:#f5cfca}.pa-tf-results .foul{background:#fff3d9;color:#9a6700;border-color:#f4dfaa}.pa-tf-results .turnover{background:#eee9f7;color:#624596;border-color:#ddd2ee}.pa-tf-results .steal{background:#e6f1fb;color:#216aa2;border-color:#cbdff2}.pa-tf-results .other{background:#f2eeec;color:#6f6466;border-color:#e4dcda}.pa-tf-open{border:1px solid #dfcfc7;background:#fff;color:#8d1531;border-radius:9px;padding:7px 10px;font-weight:900;font-size:10px;cursor:pointer;white-space:nowrap}.pa-tf-open:hover{background:#8d1531;color:#fff;border-color:#8d1531}.pa-tf-note{margin-top:11px;color:#8a7d80;font-size:11px}.pa-tf-note b{color:#8d1531}.pa-clips-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.pa-clip-card{border:1px solid #eadfda;background:#fff;border-radius:15px;padding:0;overflow:hidden;text-align:left;cursor:pointer}.pa-clip-cover{height:108px;background:linear-gradient(135deg,#281f21,#8d1531);display:grid;place-items:center}.pa-clip-cover i{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#fff;color:#8d1531;font-style:normal}.pa-clip-info{display:block;padding:13px}.pa-clip-info b,.pa-clip-info em,.pa-clip-info small{display:block}.pa-clip-info b{font-size:13px}.pa-clip-info em{font-style:normal;color:#8d1531;font-size:11px;font-weight:800;margin-top:3px}.pa-clip-info small{color:#95888a;margin-top:6px}@media(max-width:1050px){.pa-main-grid{grid-template-columns:1fr}.pa-summary-card{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pa-summary-card h3{grid-column:1/-1}.pa-big-rate{grid-row:2/4}.pa-kpis{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.pa-tf-head{flex-direction:column}.pa-tf-global{width:100%;text-align:left}.pa-head{align-items:flex-start;flex-direction:column}.pa-head-actions,.pa-head-actions select{width:100%}.pa-bottom-grid,.pa-clips-grid{grid-template-columns:1fr}.pa-zone-grid{grid-template-columns:repeat(2,1fr)}.pa-summary-card{display:block}.pa-kpis{grid-template-columns:1fr 1fr}.pa-tabs{overflow:auto}.pa-tabs button{white-space:nowrap}.pa-court{aspect-ratio:4/3}}

`;

