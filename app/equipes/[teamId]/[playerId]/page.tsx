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
import PlayerTeamComparisonSection from "@/components/equipes/PlayerTeamComparisonSection";

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
  "Stats",
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


export default function JoueurDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; playerId: string }>;
}) {
  const { teamId, playerId } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [player, setPlayer] = useState<PlayerExtra | undefined>();
  const [team, setTeam] = useState<Team | undefined>();
  const [liveStats, setLiveStats] = useState<PlayerLiveStats>(EMPTY_LIVE_STATS);
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
        const currentPlayerRows = allTeamRows.filter(
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
          computeTeamPlayersComparisonStats(allTeamRows, team?.players ?? [])
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
    const w = window.open("", "_blank", "noopener,noreferrer");

    if (!w) {
      alert("Autorise les popups pour générer le PDF.");
      return;
    }

    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  }

  if (!player || !team) {
    return (
      <div className="player-page-light">
        <style jsx global>{PLAYER_PAGE_CSS}</style>

        <aside className="player-list-side">
          <div className="player-list-brand">🏀 MyBasket</div>
        </aside>

        <main className="player-main">
          <p className="empty-player">Joueur introuvable.</p>
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
          />
        )}

        {tab === "Informations" && (
          <InformationTab p={p} team={team} latestHeight={latestHeight} latestWeight={latestWeight} latestWingspan={latestWingspan} />
        )}

        {tab === "Stats" && (
          <>
            <StatsTab p={p} tdj={tdj} tdjPct={tdjPct} cmp={cmp} team={team} liveStats={liveStats} />

            <PlayerTeamComparisonSection
              playerName={`${p.firstName ?? p.first_name ?? ""} ${p.lastName ?? p.last_name ?? ""}`.trim()}
              currentPlayerId={String(playerId)}
              playersStats={teamPlayersStats}
            />
          </>
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

              <Field label="Lien / URL">
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

      <h3 className="compare-title-light">Comparaison dans l'équipe <span>({team.name})</span></h3>

      <div className="compare-light">
        <Compare icon="🏀" bg="#f47b20" label="Points" rang={cmp.pointsRang || 0} eff={cmp.effectif || 0} sub={`${p.stats?.pts || 0} pts / match`} />
        <Compare icon="🎯" bg="#e0a800" label="Passes décisives" rang={cmp.passesRang || 0} eff={cmp.effectif || 0} sub={`${p.stats?.ast || 0} ast / match`} />
        <Compare icon="✅" bg="#22a06b" label="Présences" rang={cmp.presencesRang || 0} eff={cmp.effectif || 0} sub={`${p.presencePct || 0}% de présence`} />
        <Compare icon="⭐" bg="#1f6fb2" label="Note coach" rang={cmp.noteCoachRang || 0} eff={cmp.effectif || 0} sub="évaluation coach" />
        <Compare icon="⏱" bg="#7c4dff" label="Temps de jeu" rang={cmp.tempsJeuRang || 0} eff={cmp.effectif || 0} sub={`${tdj.tempsMoyenMatchMin || 0} min / match`} />
      </div>
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
}: {
  p: any;
  tdj: any;
  tdjPct: number;
  cmp: any;
  team: Team;
  liveStats: PlayerLiveStats;
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

      <h3 className="compare-title-light">Comparaison dans l'équipe <span>({team.name})</span></h3>

      <div className="compare-light">
        <Compare icon="🏀" bg="#f47b20" label="Points" rang={cmp.pointsRang || 0} eff={cmp.effectif || 0} sub={`${hasLiveStats ? averages.pts : p.stats?.pts || 0} pts / match`} />
        <Compare icon="🎯" bg="#e0a800" label="Passes décisives" rang={cmp.passesRang || 0} eff={cmp.effectif || 0} sub={`${hasLiveStats ? averages.ast : p.stats?.ast || 0} ast / match`} />
        <Compare icon="✅" bg="#22a06b" label="Présences" rang={cmp.presencesRang || 0} eff={cmp.effectif || 0} sub={`${hasLiveStats ? liveStats.attendancePct : p.presencePct || 0}% de présence`} />
        <Compare icon="⭐" bg="#1f6fb2" label="Note coach" rang={cmp.noteCoachRang || 0} eff={cmp.effectif || 0} sub="évaluation coach" />
        <Compare icon="⏱" bg="#7c4dff" label="Matchs joués" rang={cmp.tempsJeuRang || 0} eff={cmp.effectif || 0} sub={`${hasLiveStats ? liveStats.games : tdj.matchsJoues || 0} match(s)`} />
      </div>
    </>
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
`;
