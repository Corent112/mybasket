"use client";

import React, { useEffect, useState } from "react";
import {
  Home, Users, Dumbbell, Trophy, BarChart3, MessageSquare, Video,
  Calendar, Settings, ChevronLeft, Download, Pencil, Star, Play,
  ArrowUp, ArrowDown, Timer, Activity, Zap, Gauge, Move, Menu, X,
  type LucideIcon,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, Radar, PieChart, Pie, Cell,
} from "recharts";
import styles from "./PlayerProfile.module.css";
import form from "./PlayerForm.module.css";

/* =============================================================================
   MyBasket — Page Profil Joueur (dark premium) — sans Tailwind (CSS Modules)
   Icônes : lucide-react · Graphiques : recharts
   ========================================================================== */

const cx = (...xs: Array<string | false | null | undefined>): string => xs.filter(Boolean).join(" ");

/* ------------------------------- TYPES ------------------------------------ */
export type PlayerStatus = "Disponible" | "Blessé" | "Absent";

export interface PlayerIdentity {
  firstName: string;
  lastName: string;
  birthDate: string;          // ISO "YYYY-MM-DD"
  photoUrl: string;
  club: string;
  category: string;
  positionPrimary: string;
  positionSecondary: string;
  height: string;
  weight: string;
  dominantHand: string;
  licenseFFBB: string;
  number: number | string;
  status: PlayerStatus;
  potential: number;
  seniority: string;
  contractUntil: string;      // ISO "YYYY-MM-DD"
}

export interface Metric { value: number; label: string; spark: number[]; }
export interface RadarItem { skill: string; value: number; }
export interface StatItem { key: string; label: string; value: string; accent?: boolean; }
export interface PctItem { label: string; value: string; }
export interface StatsMatch { season: string; items: StatItem[]; pct: PctItem[]; }
export interface EvolutionPoint { match: string; points: number; rebonds: number; passes: number; }
export interface Playtime { percent: number; avgPerMatch: string; total: string; played: number; missed: number; }
export interface PhysicalItem { test: string; icon: string; result: string; evo: string; improved: boolean; dir: "up" | "down"; }
export interface Feedback { id: number; day: string; month: string; comment: string; author: string; date: string; type: string; }
export interface VideoItem { id: number; title: string; date: string; duration: string; thumb: string; }
export type RankColor = "orange" | "amber" | "emerald" | "violet";
export interface Ranking { key: string; label: string; rank: number; total: number; detail: string; icon: string; color: RankColor; }

export interface PlayerProfileData extends PlayerIdentity {
  id: string;
  teamId: string;
  age?: number;
  metrics: { presence: Metric; ponctualite: Metric };
  radar: RadarItem[];
  statsMatch: StatsMatch;
  evolution: EvolutionPoint[];
  playtime: Playtime;
  physical: { lastTest: string; items: PhysicalItem[] };
  feedback: Feedback[];
  videos: VideoItem[];
  rankings: Ranking[];
}

/* ----------------------------- DONNÉES MOCKÉES ---------------------------- */
export const playerProfile: PlayerProfileData = {
  id: "keelyan-13",
  teamId: "paris-basketball",
  club: "Paris Basketball",
  firstName: "Keelyan",
  lastName: "Nzapakete",
  number: 13,
  category: "U15 (France)",
  positionPrimary: "Meneur",
  positionSecondary: "Arrière",
  height: "1m82",
  weight: "72 kg",
  birthDate: "2010-04-20",
  dominantHand: "Droite",
  licenseFFBB: "VT0934512",
  status: "Disponible",
  potential: 3.5,
  seniority: "3 ans",
  contractUntil: "2027-06-30",
  photoUrl: "",

  metrics: {
    presence: { value: 95, label: "Taux de présence", spark: [88, 90, 89, 92, 91, 94, 93, 95] },
    ponctualite: { value: 92, label: "Taux de ponctualité", spark: [85, 87, 86, 88, 90, 89, 91, 92] },
  },
  radar: [
    { skill: "Tir", value: 8 }, { skill: "Dribble", value: 9 }, { skill: "Passe", value: 8 },
    { skill: "Lecture de jeu", value: 8 }, { skill: "Défense", value: 7 }, { skill: "Rebond", value: 6 }, { skill: "Mental", value: 8 },
  ],
  statsMatch: {
    season: "Saison 2025/2026",
    items: [
      { key: "PTS", label: "PTS", value: "14.3", accent: true },
      { key: "REB", label: "REB", value: "5.2", accent: true },
      { key: "AST", label: "AST", value: "4.1" },
      { key: "STL", label: "STL", value: "2.3" },
      { key: "BLK", label: "BLK", value: "0.6" },
      { key: "TO", label: "TO", value: "2.1" },
    ],
    pct: [{ label: "% TIR", value: "48%" }, { label: "% 3PTS", value: "36%" }, { label: "% LF", value: "78%" }],
  },
  evolution: [
    { match: "M1", points: 12, rebonds: 5, passes: 3 }, { match: "M2", points: 15, rebonds: 4, passes: 5 },
    { match: "M3", points: 11, rebonds: 6, passes: 4 }, { match: "M4", points: 16, rebonds: 5, passes: 6 },
    { match: "M5", points: 14, rebonds: 7, passes: 4 }, { match: "M6", points: 18, rebonds: 6, passes: 5 },
    { match: "M7", points: 13, rebonds: 8, passes: 7 }, { match: "M8", points: 20, rebonds: 7, passes: 5 },
    { match: "M9", points: 17, rebonds: 9, passes: 6 }, { match: "M10", points: 19, rebonds: 8, passes: 8 },
  ],
  playtime: { percent: 85, avgPerMatch: "28 min", total: "14h 15 min", played: 18, missed: 2 },
  physical: {
    lastTest: "20/05/2026",
    items: [
      { test: "Sprint 20m", icon: "sprint", result: "3.05 s", evo: "-0.12 s", improved: true, dir: "down" },
      { test: "Détente sèche", icon: "jump", result: "52 cm", evo: "+7 cm", improved: true, dir: "up" },
      { test: "Détente avec élan", icon: "jump", result: "59 cm", evo: "+6 cm", improved: true, dir: "up" },
      { test: "VMA", icon: "vma", result: "17.2", evo: "+0.8", improved: true, dir: "up" },
      { test: "Agilité (T-test)", icon: "agility", result: "10.45 s", evo: "-0.35 s", improved: true, dir: "down" },
    ],
  },
  feedback: [
    { id: 1, day: "28", month: "MAI", comment: "Excellente progression sur le tir extérieur. Continue ton travail, les résultats arrivent 💪", author: "Coach Thomas", date: "28/05/2026", type: "entrainement" },
    { id: 2, day: "18", month: "MAI", comment: "Doit mieux communiquer en défense. Reste concentré sur les rotations.", author: "Coach Thomas", date: "18/05/2026", type: "match" },
    { id: 3, day: "10", month: "MAI", comment: "Très bon match ce week-end ! Bonne agressivité offensive et belles passes.", author: "Coach Thomas", date: "10/05/2026", type: "match" },
  ],
  videos: [
    { id: 1, title: "Highlights vs Lille", date: "23/05/2026", duration: "4:32", thumb: "" },
    { id: 2, title: "Match complet vs Nantes", date: "17/05/2026", duration: "1:42:18", thumb: "" },
    { id: 3, title: "Séance individuelle - Tir", date: "12/05/2026", duration: "18:10", thumb: "" },
  ],
  rankings: [
    { key: "points", label: "Points", rank: 2, total: 15, detail: "14.3 pts / match", icon: "pts", color: "orange" },
    { key: "assists", label: "Passes décisives", rank: 1, total: 15, detail: "4.1 ast / match", icon: "ast", color: "amber" },
    { key: "presence", label: "Présences", rank: 4, total: 15, detail: "95% de présence", icon: "pres", color: "emerald" },
    { key: "playtime", label: "Temps de jeu", rank: 2, total: 15, detail: "28 min / match", icon: "time", color: "violet" },
  ],
};

/* -------------------------------- API ------------------------------------- */
const API_BASE = "/api";
const USE_MOCK = true; // passez à false pour utiliser les vraies routes

async function http<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${path}`);
  return (await res.json()) as T;
}

export const api = {
  getPlayer: (teamId: string, playerId: string) => http<PlayerProfileData>(`/teams/${teamId}/players/${playerId}`),
  getStats: (playerId: string) => http<Pick<PlayerProfileData, "statsMatch" | "evolution" | "radar">>(`/players/${playerId}/stats`),
  getAttendance: (playerId: string) => http<{ metrics: PlayerProfileData["metrics"]; playtime: Playtime }>(`/players/${playerId}/attendance`),
  getPhysicalTests: (playerId: string) => http<PlayerProfileData["physical"]>(`/players/${playerId}/physical-tests`),
  getVideos: (playerId: string) => http<VideoItem[]>(`/players/${playerId}/videos`),
  getCoachFeedback: (playerId: string) => http<Feedback[]>(`/players/${playerId}/coach-feedback`),
  getTeamRankings: (playerId: string) => http<Ranking[]>(`/players/${playerId}/team-rankings`),
  updatePlayer: (playerId: string, data: Partial<PlayerIdentity>) => http<PlayerProfileData>(`/players/${playerId}`, { method: "PUT", body: JSON.stringify(data) }),
  createPlayer: (teamId: string, data: PlayerIdentity) => http<PlayerProfileData>(`/teams/${teamId}/players`, { method: "POST", body: JSON.stringify(data) }),
  addCoachFeedback: (playerId: string, data: Omit<Feedback, "id">) => http<Feedback>(`/players/${playerId}/coach-feedback`, { method: "POST", body: JSON.stringify(data) }),
  addVideo: (playerId: string, data: Omit<VideoItem, "id">) => http<VideoItem>(`/players/${playerId}/videos`, { method: "POST", body: JSON.stringify(data) }),
  exportPdf: (playerId: string): Promise<Blob> => fetch(`${API_BASE}/players/${playerId}/export-pdf`).then((r) => r.blob()),
};

export async function loadFullProfile(teamId: string, playerId: string): Promise<PlayerProfileData> {
  if (USE_MOCK) return playerProfile;
  const [player, stats, attendance, physical, videos, feedback, rankings] = await Promise.all([
    api.getPlayer(teamId, playerId), api.getStats(playerId), api.getAttendance(playerId),
    api.getPhysicalTests(playerId), api.getVideos(playerId), api.getCoachFeedback(playerId), api.getTeamRankings(playerId),
  ]);
  return {
    ...player, ...stats,
    metrics: attendance?.metrics ?? player.metrics,
    playtime: attendance?.playtime ?? player.playtime,
    physical: physical ?? player.physical,
    videos: videos ?? [], feedback: feedback ?? [], rankings: rankings ?? [],
  };
}

/* --------------------------- DATES & IDENTITÉ ----------------------------- */
const fmtFR = (iso: string): string => {
  if (!iso) return "—";
  if (iso.includes("/")) return iso;
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d} / ${m} / ${y}` : iso;
};
const computeAge = (iso: string): number | null => {
  if (!iso || iso.includes("/")) return null;
  const b = new Date(iso); if (isNaN(b.getTime())) return null;
  const t = new Date(); let a = t.getFullYear() - b.getFullYear();
  const mm = t.getMonth() - b.getMonth();
  if (mm < 0 || (mm === 0 && t.getDate() < b.getDate())) a--;
  return a;
};

/* ------------------------- SCHÉMA DU FORMULAIRE --------------------------- */
const POSTES = ["Meneur", "Arrière", "Ailier", "Ailier fort", "Pivot"] as const;
const HANDS = ["Droite", "Gauche", "Ambidextre"] as const;
const STATUSES: PlayerStatus[] = ["Disponible", "Blessé", "Absent"];

type FieldType = "text" | "number" | "date" | "select" | "stars";
interface FieldDef { key: keyof PlayerIdentity; label: string; type: FieldType; options?: readonly string[]; required?: boolean; full?: boolean; placeholder?: string; }
interface FormSection { title: string; fields: FieldDef[]; }

const PLAYER_SECTIONS: FormSection[] = [
  {
    title: "Identité",
    fields: [
      { key: "firstName", label: "Prénom", type: "text", required: true },
      { key: "lastName", label: "Nom", type: "text", required: true },
      { key: "birthDate", label: "Date de naissance", type: "date", required: true },
    ],
  },
  {
    title: "Profil sportif",
    fields: [
      { key: "club", label: "Club", type: "text" },
      { key: "category", label: "Catégorie", type: "text", placeholder: "U15 (France)" },
      { key: "positionPrimary", label: "Poste principal", type: "select", options: POSTES },
      { key: "positionSecondary", label: "Poste secondaire", type: "select", options: POSTES },
      { key: "height", label: "Taille", type: "text", placeholder: "1m82" },
      { key: "weight", label: "Poids", type: "text", placeholder: "72 kg" },
      { key: "dominantHand", label: "Main dominante", type: "select", options: HANDS },
      { key: "licenseFFBB", label: "N° licence FFBB", type: "text", placeholder: "VT0934512" },
      { key: "number", label: "Numéro", type: "number" },
      { key: "status", label: "Statut", type: "select", options: STATUSES },
      { key: "potential", label: "Potentiel", type: "stars", full: true },
    ],
  },
  {
    title: "Club & contrat",
    fields: [
      { key: "seniority", label: "Ancienneté au club", type: "text", placeholder: "3 ans" },
      { key: "contractUntil", label: "Contrat jusqu'au", type: "date" },
    ],
  },
];

export const emptyPlayer: PlayerIdentity = {
  firstName: "", lastName: "", birthDate: "", photoUrl: "", club: "", category: "",
  positionPrimary: "", positionSecondary: "", height: "", weight: "", dominantHand: "",
  licenseFFBB: "", number: "", status: "Disponible", potential: 0, seniority: "", contractUntil: "",
};

/** Construit une fiche joueur complète (identité + blocs de perf vides) prête à afficher. */
export function makePlayer(identity: PlayerIdentity, teamId: string, id?: string): PlayerProfileData {
  return {
    ...identity,
    id: id ?? (globalThis.crypto?.randomUUID?.() ?? `pl_${Date.now()}`),
    teamId,
    metrics: {
      presence: { value: 0, label: "Taux de présence", spark: [] },
      ponctualite: { value: 0, label: "Taux de ponctualité", spark: [] },
    },
    radar: [
      { skill: "Tir", value: 0 }, { skill: "Dribble", value: 0 }, { skill: "Passe", value: 0 },
      { skill: "Lecture de jeu", value: 0 }, { skill: "Défense", value: 0 }, { skill: "Rebond", value: 0 }, { skill: "Mental", value: 0 },
    ],
    statsMatch: {
      season: "Saison 2025/2026",
      items: [
        { key: "PTS", label: "PTS", value: "0" }, { key: "REB", label: "REB", value: "0" }, { key: "AST", label: "AST", value: "0" },
        { key: "STL", label: "STL", value: "0" }, { key: "BLK", label: "BLK", value: "0" }, { key: "TO", label: "TO", value: "0" },
      ],
      pct: [{ label: "% TIR", value: "0%" }, { label: "% 3PTS", value: "0%" }, { label: "% LF", value: "0%" }],
    },
    evolution: [],
    playtime: { percent: 0, avgPerMatch: "—", total: "—", played: 0, missed: 0 },
    physical: { lastTest: "—", items: [] },
    feedback: [], videos: [], rankings: [],
  };
}

function pickIdentity(src?: Partial<PlayerProfileData>): PlayerIdentity {
  return {
    ...emptyPlayer,
    ...(src ?? {}),
  };
}

/* ------------------------------ CONSTANTES UI ----------------------------- */
const ORANGE = "#D4A24C";
const BLUE = "#6B1A2C";
const GREEN = "#22c55e";

interface NavItem { icon: LucideIcon; label: string; active?: boolean; }
const NAV: NavItem[] = [
  { icon: Home, label: "Accueil" }, { icon: Users, label: "Équipe", active: true },
  { icon: Dumbbell, label: "Séances" }, { icon: Trophy, label: "Matchs" },
  { icon: BarChart3, label: "Statistiques" }, { icon: MessageSquare, label: "Messagerie" },
  { icon: Video, label: "Vidéo" }, { icon: Calendar, label: "Calendrier" }, { icon: Settings, label: "Paramètres" },
];

const TABS = ["Aperçu", "Performance", "Développement", "Présences", "Médias"] as const;
type Tab = (typeof TABS)[number];

const STATUS_CLASS: Record<PlayerStatus, string> = {
  Disponible: styles.statusDispo, "Blessé": styles.statusBlesse, Absent: styles.statusAbsent,
};
const PHYS_ICON: Record<string, LucideIcon> = { sprint: Zap, jump: Move, vma: Gauge, agility: Activity };
const RANK_ICON: Record<string, LucideIcon> = { pts: Trophy, ast: Users, pres: Calendar, time: Timer };
const RANK_CLASS: Record<RankColor, string> = {
  orange: styles.rankOrange, amber: styles.rankAmber, emerald: styles.rankEmerald, violet: styles.rankViolet,
};

/* ------------------------------- ATOMES ----------------------------------- */
function Card({ className = "", pad = true, children }: { className?: string; pad?: boolean; children: React.ReactNode }) {
  return <div className={cx(styles.card, pad && styles.cardPad, className)}>{children}</div>;
}

function SectionTitle({ children, right, auto }: { children: React.ReactNode; right?: React.ReactNode; auto?: boolean }) {
  return (
    <div className={styles.sectionTitle}>
      <h3 className={styles.sectionTitleText}>
        {children}
        {auto && <span className={styles.autoPill} title="Alimenté automatiquement par les outils du site">⟳ Auto</span>}
      </h3>
      {right}
    </div>
  );
}

function StarRating({ value = 0, size = 16 }: { value?: number; size?: number }) {
  return (
    <div className={styles.starsRow}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className={styles.starWrap} style={{ width: size, height: size }}>
            <Star size={size} className={styles.starBg} />
            <span className={styles.starFill} style={{ width: `${fill * 100}%` }}><Star size={size} fill={ORANGE} /></span>
          </span>
        );
      })}
    </div>
  );
}

function StarInput({ value = 0, onChange, size = 24 }: { value?: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div className={form.starsRow}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <button type="button" key={i} className={form.starBtn} style={{ width: size, height: size }}
            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
              const r = e.currentTarget.getBoundingClientRect();
              onChange(i + (e.clientX - r.left < r.width / 2 ? 0.5 : 1));
            }}>
            <Star size={size} className={form.starBg} />
            <span className={form.starFill} style={{ width: `${fill * 100}%` }}><Star size={size} fill="#D4A24C" /></span>
          </button>
        );
      })}
      <span className={form.starValue}>{Number(value).toFixed(1)} / 5</span>
    </div>
  );
}

function InfoCell({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div>
      <div className={styles.infoLabel}>{label}</div>
      <div className={cx(styles.infoValue, accent && styles.infoValueAccent)}>{value}</div>
    </div>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const d = data.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={44} minWidth={1} minHeight={44} initialDimension={{ width: 320, height: 44 }}>
      <LineChart data={d} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

interface TooltipItem { dataKey: string; value: number; color: string; }
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipItem[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ borderRadius: 8, border: "1px solid #ECE3D6", background: "#ffffff", padding: "8px 12px", fontSize: 12, boxShadow: "0 10px 30px rgba(107,26,44,.15)" }}>
      <div style={{ marginBottom: 4, fontWeight: 600, color: "#1F1A17" }}>{label}</div>
      {payload.map((pp) => (
        <div key={pp.dataKey} style={{ display: "flex", alignItems: "center", gap: 8, color: "#4A4039" }}>
          <span style={{ display: "inline-block", height: 8, width: 8, borderRadius: 9999, background: pp.color }} />
          <span style={{ textTransform: "capitalize" }}>{pp.dataKey}</span>
          <span style={{ marginLeft: "auto", fontWeight: 700 }}>{pp.value}</span>
        </div>
      ))}
    </div>
  );
}

function Legendish({ color, label, value }: { color: string; label: string; value: React.ReactNode }) {
  return (
    <div className={styles.legendRow}>
      <span className={styles.legendDot} style={{ background: color }} />
      <span className={styles.legendLabel}>{label}</span>
      <span className={styles.legendValue}>{value}</span>
    </div>
  );
}

/* ------------------------------- MODAL ------------------------------------ */
function Modal({ title, subtitle, onClose, footer, children, size = "lg" }: {
  title: string; subtitle?: string; onClose: () => void; footer?: React.ReactNode; children: React.ReactNode; size?: "lg" | "sm";
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className={form.modalOverlay} onClick={onClose}>
      <div className={cx(form.modal, size === "sm" && form.modalSm)} onClick={(e) => e.stopPropagation()}>
        <div className={form.modalHead}>
          <div>
            <h2 className={form.modalTitle}>{title}</h2>
            {subtitle && <p className={form.modalSub}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className={form.modalClose}><X size={20} /></button>
        </div>
        <div className={form.modalBody}>{children}</div>
        {footer && <div className={form.modalFoot}>{footer}</div>}
      </div>
    </div>
  );
}

/* --------------------------- FORMULAIRE JOUEUR ---------------------------- */
function FieldRow({ field, value, onChange }: { field: FieldDef; value: string | number; onChange: (v: string | number) => void }) {
  let control: React.ReactNode;
  if (field.type === "select") {
    control = (
      <select className={form.select} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  } else if (field.type === "stars") {
    control = <StarInput value={Number(value) || 0} onChange={onChange} />;
  } else {
    control = (
      <input className={form.input}
        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
        value={value ?? ""} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return (
    <label className={cx(form.field, field.full && form.fieldFull)}>
      <span className={form.fieldLabel}>{field.label}{field.required ? " *" : ""}</span>
      {control}
    </label>
  );
}
function UploadPhoto({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      onChange(reader.result as string);
    };

    reader.readAsDataURL(file);
  };

  return (
    <div className={form.photoUploader}>
      <div className={form.photoPreview}>
        {value ? (
          <img src={value} alt="joueur" />
        ) : (
          <span>Photo joueur</span>
        )}
      </div>

      <label className={form.uploadBtn}>
        Importer une photo
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={handleFile}
        />
      </label>

      {value && (
        <button
          type="button"
          className={form.removeBtn}
          onClick={() => onChange("")}
        >
          Supprimer
        </button>
      )}
    </div>
  );
}

export function PlayerForm({ initial, isNew = false, onClose, onSave }: {
  initial?: Partial<PlayerProfileData>; isNew?: boolean; onClose: () => void; onSave: (form: PlayerIdentity, isNew: boolean) => void;
}) {
  const [f, setF] = useState<PlayerIdentity>(() => pickIdentity(initial));
  const set = (k: keyof PlayerIdentity, v: string | number) => setF((s) => ({ ...s, [k]: v }) as PlayerIdentity);
  const submit = () => {
    const required = PLAYER_SECTIONS.flatMap((s) => s.fields).filter((x) => x.required);
    const miss = required.filter((x) => !String(f[x.key] ?? "").trim());
    if (miss.length) { alert("Champs d'identité obligatoires : " + miss.map((m) => m.label).join(", ")); return; }
    onSave(f, isNew);
  };
  return (
    <Modal
  title={isNew ? "Créer un joueur" : "Modifier la fiche"}
  subtitle="Renseignez ce que vous souhaitez — seuls les champs d'identité (*) sont obligatoires."
  onClose={onClose}
  footer={
    <>
      <button
        onClick={onClose}
        className={cx(form.btn, form.btnOutline)}
      >
        Annuler
      </button>

      <button
        onClick={submit}
        className={cx(form.btn, form.btnPrimary)}
      >
        {isNew ? "Créer le joueur" : "Enregistrer"}
      </button>
    </>
  }
>
  <div className={form.photoBlock}>
    <UploadPhoto
      value={f.photoUrl}
      onChange={(v) => set("photoUrl", v)}
    />
  </div>

  {PLAYER_SECTIONS.map((section) => (
    <section key={section.title} className={form.section}>
      <h3 className={form.sectionTitle}>{section.title}</h3>

      <div className={form.grid}>
        {section.fields.map((field) => (
          <FieldRow
  key={field.key}
  field={field}
  value={f[field.key]}
  onChange={(v) => set(field.key, v)}
/>
        ))}
      </div>
    </section>
  ))}

  <div className={form.note}>
    Les statistiques, présences, vidéos, feedbacks et tests physiques
    sont alimentés automatiquement par les outils MyBasket.
  </div>
</Modal>
  );
}

/* =============================== PAGE ===================================== */
export default function PlayerProfilePage({ teamId = "paris-basketball", playerId = "keelyan-13", initialData, onBack }: { teamId?: string; playerId?: string; initialData?: PlayerProfileData; onBack?: () => void }) {
  const [p, setP] = useState<PlayerProfileData>(initialData ?? playerProfile);
  const [tab, setTab] = useState<Tab>("Aperçu");
  const [navOpen, setNavOpen] = useState(false);
  const [editing, setEditing] = useState<{ mode: "edit" | "new"; data: PlayerProfileData } | null>(null);
  const [toast, setToast] = useState("");
  const flash = (m: string) => { setToast(m); window.setTimeout(() => setToast(""), 2400); };

  useEffect(() => {
    if (initialData) { setP(initialData); return; }
    let on = true;
    loadFullProfile(teamId, playerId).then((data) => { if (on && data) setP(data); }).catch(() => {});
    return () => { on = false; };
  }, [teamId, playerId, initialData]);

  const handleExport = async () => {
    if (USE_MOCK) { alert(`Export PDF → GET /api/players/${p.id}/export-pdf`); return; }
    const blob = await api.exportPdf(p.id);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${p.lastName}-profil.pdf`; a.click();
    URL.revokeObjectURL(url);
  };
  const handleEdit = () => setEditing({ mode: "edit", data: p });
  const savePlayer = async (form: PlayerIdentity, isNew: boolean) => {
    const merged: PlayerProfileData = { ...p, ...form };
    setP(merged); setEditing(null);
    flash(isNew ? "Joueur créé ✓" : "Fiche mise à jour ✓");
    if (!USE_MOCK) { try { await api.updatePlayer(p.id, form); } catch { /* gérer l'erreur UI */ } }
  };

  const metricCards: Array<Metric & { title: string; icon: LucideIcon }> = [
    { ...p.metrics.presence, title: "Présence", icon: Calendar },
    { ...p.metrics.ponctualite, title: "Ponctualité", icon: Timer },
  ];

  return (
    <div className={styles.page}>
      {/* SIDEBAR */}
      <aside className={cx(styles.sidebar, navOpen && styles.sidebarOpen)}>
        <div className={styles.sidebarHead}>
          <div className={styles.logoMark}><span>🏀</span></div>
          <span className={styles.logoText}>My<span className={styles.logoAccent}>Basket</span></span>
          <button className={cx(styles.navClose, styles.lgHide)} onClick={() => setNavOpen(false)}><X size={18} /></button>
        </div>
        <nav className={styles.navList}>
          {NAV.map(({ icon: Icon, label, active }) => (
            <a key={label} href="#" className={cx(styles.navLink, active && styles.navLinkActive)}>
              <Icon size={18} /> <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className={styles.navBottom}>
          <div className={styles.navBottomRow}><Calendar size={14} /> Saison</div>
          <div className={styles.navBottomVal}>2025 / 2026</div>
        </div>
      </aside>
      {navOpen && <div className={cx(styles.scrim, styles.lgHide)} onClick={() => setNavOpen(false)} />}

      {/* MAIN */}
      <div className={styles.main}>
        <header className={styles.topbar}>
          <button className={cx(styles.menuBtn, styles.lgHide)} onClick={() => setNavOpen(true)}><Menu size={20} /></button>
          <button className={styles.backBtn} onClick={onBack}><ChevronLeft size={18} /> <span className={styles.smShow}>Retour à l'équipe</span></button>
          <div className={styles.topActions}>
            <button onClick={handleExport} className={cx(styles.btn, styles.btnGhost)}><Download size={16} /> <span className={styles.smShow}>Exporter le profil</span></button>
            <button onClick={handleEdit} className={cx(styles.btn, styles.btnPrimary)}><Pencil size={16} /> Modifier</button>
          </div>
        </header>

        <main className={styles.container}>
          {/* HEADER JOUEUR */}
          <Card pad={false} className={styles.headerCard}>
            <div className={styles.headerGrid}>
              <div className={styles.photo}>
                {p.photoUrl ? <img src={p.photoUrl} alt={p.lastName} className={styles.photoImg} /> : <div className={styles.photoPh}><Users size={64} /></div>}
                <span className={styles.numBadge}>#{p.number}</span>
              </div>

              <div className={styles.identity}>
                <div className={styles.clubRow}>
                  <span className={styles.clubLogo}>🏀</span>
                  <span className={styles.clubName}>{p.club}</span>
                </div>
                <h1 className={styles.playerName}>{p.firstName} {p.lastName}</h1>
                <div className={styles.catRow}><span className={styles.catLabel}>Catégorie </span><span className={styles.catValue}>{p.category}</span></div>

                <div className={styles.infoGrid}>
                  <InfoCell label="Poste principal" value={p.positionPrimary} accent />
                  <InfoCell label="Poste secondaire" value={p.positionSecondary} />
                  <InfoCell label="Taille" value={p.height} />
                  <InfoCell label="Poids" value={p.weight} />
                  <InfoCell label="Âge" value={`${computeAge(p.birthDate) ?? p.age ?? "—"} ans`} />
                  <InfoCell label="Date de naissance" value={fmtFR(p.birthDate)} />
                  <InfoCell label="Main dominante" value={p.dominantHand} />
                  <InfoCell label="N° licence FFBB" value={p.licenseFFBB || "—"} />
                  <InfoCell label="Numéro" value={p.number} />
                </div>

                <div className={styles.statusRow}>
                  <span className={cx(styles.statusBadge, STATUS_CLASS[p.status] || styles.statusDispo)}>{p.status}</span>
                  <div className={styles.potentialRow}><span className={styles.potentialLabel}>Potentiel</span><StarRating value={p.potential} /></div>
                </div>
              </div>

              <div className={styles.jerseyCol}>
                <div className={styles.jersey}>
                  <span className={styles.jerseyName}>{p.lastName}</span>
                  <span className={styles.jerseyNum}>{p.number}</span>
                </div>
                <div className={styles.contractBlock}>
                  <div>
                    <div className={styles.contractLabel}>Ancienneté au club</div>
                    <div className={styles.contractValue}>{p.seniority || "—"}</div>
                  </div>
                  <div>
                    <div className={styles.contractLabel}>Contrat jusqu'au</div>
                    <div className={styles.contractValue}>{fmtFR(p.contractUntil)}</div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ONGLETS */}
          <div className={styles.tabs}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={cx(styles.tab, tab === t && styles.tabActive)}>
                {t}
                {tab === t && <span className={styles.tabUnderline} />}
              </button>
            ))}
          </div>

          {tab !== "Aperçu" ? (
            <Card pad={false} className={styles.placeholder}>
              <div>
                <div className={styles.placeholderTitle}>Onglet « {tab} »</div>
                <p className={styles.placeholderText}>Section prête à recevoir son contenu dédié.</p>
              </div>
            </Card>
          ) : (
            <>
              {/* PRÉSENCE + PONCTUALITÉ */}
              <div className={styles.grid2sm}>
                {metricCards.map((m) => (
                  <Card key={m.title}>
                    <div className={styles.metricHead}><m.icon size={16} className={styles.metricIcon} /> {m.title}</div>
                    <div className={styles.metricValue}>{m.value}%</div>
                    <div className={styles.metricLabel}>{m.label}</div>
                    <div className={styles.sparkWrap}><Sparkline data={m.spark} color={GREEN} /></div>
                  </Card>
                ))}
              </div>

              {/* RADAR + STATS MATCH + ÉVOLUTION */}
              <div className={styles.grid3xl}>
                <Card>
                  <SectionTitle auto>Radar de compétences</SectionTitle>
                  <p className={styles.subNote}>Évaluation coach</p>
                  <div className={styles.chartH}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 320, height: 256 }}>
                      <RadarChart data={p.radar} outerRadius="72%">
                        <PolarGrid stroke="#ECE3D6" />
                        <PolarAngleAxis dataKey="skill" tick={{ fill: "#9A8E80", fontSize: 11 }} />
                        <Radar dataKey="value" stroke={ORANGE} fill={ORANGE} fillOpacity={0.45} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card>
                  <SectionTitle auto right={<span className={styles.seasonPill}>{p.statsMatch.season}</span>}>
                    Stats match <span className={styles.muted}>(moy.)</span>
                  </SectionTitle>
                  <div className={styles.statGrid}>
                    {p.statsMatch.items.map((s) => (
                      <div key={s.key} className={styles.statBox}>
                        <div className={cx(styles.statBoxValue, s.accent && styles.statBoxValueAccent)}>{s.value}</div>
                        <div className={styles.statBoxLabel}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  <div className={styles.pctGrid}>
                    {p.statsMatch.pct.map((s) => (
                      <div key={s.label} className={styles.pctBox}>
                        <div className={styles.pctValue}>{s.value}</div>
                        <div className={styles.pctLabel}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <SectionTitle auto>Évolution des stats</SectionTitle>
                  <div className={styles.chartH}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 320, height: 256 }}>
                      <LineChart data={p.evolution} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ECE3D6" vertical={false} />
                        <XAxis dataKey="match" tick={{ fill: "#9A8E80", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: "#9A8E80", fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                        <Line type="monotone" dataKey="points" name="Points" stroke={ORANGE} strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="rebonds" name="Rebonds" stroke={BLUE} strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="passes" name="Passes" stroke={GREEN} strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              {/* TEMPS DE JEU + SUIVI PHYSIQUE */}
              <div className={styles.grid2lg}>
                <Card>
                  <SectionTitle auto right={<span className={styles.seasonPill}>Saison 2025/2026</span>}>Temps de jeu</SectionTitle>
                  <div className={styles.playtimeWrap}>
                    <div className={styles.donut}>
                      <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} initialDimension={{ width: 160, height: 160 }}>
                        <PieChart>
                          <Pie data={[{ v: p.playtime.percent }, { v: 100 - p.playtime.percent }]} dataKey="v" innerRadius={52} outerRadius={70} startAngle={90} endAngle={-270} stroke="none">
                            <Cell fill={ORANGE} /><Cell fill={BLUE} />
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                      <div className={styles.donutCenter}>
                        <div>
                          <div className={styles.donutPercent}>{p.playtime.percent}%</div>
                          <div className={styles.donutCaption}>Temps de jeu<br />moyen</div>
                        </div>
                      </div>
                    </div>
                    <div className={styles.legendCol}>
                      <Legendish color={BLUE} label="Temps moyen / match" value={p.playtime.avgPerMatch} />
                      <Legendish color={ORANGE} label="Temps total" value={p.playtime.total} />
                      <Legendish color={GREEN} label="Matchs joués" value={p.playtime.played} />
                      <Legendish color="#f59e0b" label="Matchs manqués" value={p.playtime.missed} />
                    </div>
                  </div>
                </Card>

                <Card>
                  <SectionTitle auto right={<span className={styles.muted} style={{ fontSize: 12 }}>Dernier test : {p.physical.lastTest}</span>}>Suivi physique</SectionTitle>
                  <div className={styles.physHead}>
                    <span className={styles.physHeadTest}>Test</span><span className={styles.physHeadRes}>Résultat</span><span className={styles.physHeadEvo}>Évolution</span>
                  </div>
                  <div className={styles.physList}>
                    {p.physical.items.map((t) => {
                      const Icon = PHYS_ICON[t.icon] || Activity;
                      const Arrow = t.dir === "up" ? ArrowUp : ArrowDown;
                      return (
                        <div key={t.test} className={styles.physRow}>
                          <span className={styles.physTest}><Icon size={15} className={styles.physTestIcon} /> {t.test}</span>
                          <span className={styles.physResult}>{t.result}</span>
                          <span className={cx(styles.physEvo, t.improved ? styles.evoUp : styles.evoDown)}>{t.evo} <Arrow size={14} /></span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </div>

              {/* FEEDBACK + VIDÉOS */}
              <div className={styles.grid2lg}>
                <Card>
                  <SectionTitle auto>Feedback coach</SectionTitle>
                  <div className={styles.feedList}>
                    {p.feedback.map((f) => (
                      <div key={f.id} className={styles.feedItem}>
                        <div className={styles.feedDate}>
                          <div className={styles.feedDay}>{f.day}</div>
                          <div className={styles.feedMonth}>{f.month}</div>
                        </div>
                        <div className={styles.feedBody}>
                          <p className={styles.feedComment}>{f.comment}</p>
                          <div className={styles.feedMeta}>
                            <span>{f.author}</span><span>·</span><span>{f.date}</span>
                            <span className={styles.feedType}>{f.type}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className={cx(styles.linkBtn, styles.feedMore)}>Voir tout l'historique</button>
                </Card>

                <Card>
                  <SectionTitle auto right={<button className={cx(styles.linkBtn, styles.linkBtnSm)}>Voir toutes les vidéos</button>}>Dernières vidéos</SectionTitle>
                  <div className={styles.videoList}>
                    {p.videos.map((v) => (
                      <div key={v.id} className={styles.videoItem}>
                        <div className={styles.videoThumb}>
                          {v.thumb && <img src={v.thumb} alt="" className={styles.videoThumbImg} />}
                          <span className={styles.playBtn}><Play size={16} fill="currentColor" /></span>
                        </div>
                        <div className={styles.videoBody}>
                          <div className={styles.videoTitle}>{v.title}</div>
                          <div className={styles.videoMeta}>{v.date} · {v.duration}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* COMPARAISON */}
              <Card>
                <SectionTitle auto>Comparaison dans l'équipe <span className={styles.muted}>({p.category.split(" ")[0]})</span></SectionTitle>
                <div className={styles.grid4}>
                  {p.rankings.map((r) => {
                    const Icon = RANK_ICON[r.icon] || Trophy;
                    return (
                      <div key={r.key} className={styles.rankCard}>
                        <div className={cx(styles.rankIcon, RANK_CLASS[r.color])}><Icon size={18} /></div>
                        <div className={styles.rankLabel}>{r.label}</div>
                        <div className={styles.rankValue}>#{r.rank}<span className={styles.rankTotal}> / {r.total}</span></div>
                        <div className={styles.rankDetail}>{r.detail}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </>
          )}
        </main>
      </div>

      {editing && <PlayerForm initial={editing.data} isNew={editing.mode === "new"} onClose={() => setEditing(null)} onSave={savePlayer} />}
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}