'use client';

/**
 * Couche partagée du module Management.
 * - Lit les équipes/joueurs depuis Supabase via `lib/equipes-store`.
 * - Persiste les données propres au Management (séparées) par équipe.
 * - Expose un contexte React (`MgmtProvider` + `useMgmt`) partagé par le layout
 *   et toutes les pages d'onglet, pour garder le choix d'équipe commun.
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getTeams as getSupabaseTeams } from '@/lib/equipes-store';

/* ============================ Types ============================ */
export interface Player { id: string; num: number; name: string; pos: string; photo?: string }
export interface Team { id: string; name: string; cat?: string; players: Player[] }
export interface Line {
  playerId: string; present: boolean; min: number;
  p2m: number; p2a: number; p3m: number; p3a: number; ftm: number; fta: number;
  reb: number; ast: number; stl: number; blk: number; to: number; pf: number;
}
export interface Match { id: string; date: string; type: 'match' | 'entrainement'; opponent: string; home: boolean; scoreUs: number; scoreThem: number; lines: Line[] }
export interface Evt { id: string; date: string; time: string; type: 'match' | 'entrainement'; opponent: string; place: string; home: boolean; attachment?: string }
export interface SJCat { id: string; label: string; deletable?: boolean }
export interface SJEntry { id: string; date: string; opponent: string; possessions: number; rows: Record<string, { played: number; success: number; points: number; bp: number; reboff: number; rebdef: number }> }
export interface StatsJeu { categories: SJCat[]; entries: SJEntry[] }
export interface Rotation { durations: number[]; grid: Record<number, (string | null)[]> } // 4 QT × 5 slots
export interface GamePlan { date: string; opponent: string; offSys: string; defSys: string; consignes: string; inclureRotation: boolean; finBlob: string; finSlob: string; finSys: string }
export interface AdminData { cotisations: Record<string, { licence: boolean; assurance: boolean; equipement: boolean; cotisation: boolean; amount: string }>; presence: Record<string, Record<string, 'present' | 'absent'>> }

/* ============================ Stores ============================ */
const TEAM_SEL_KEY = 'mybasket_management_team';
const MATCHES_KEY = 'mybasket_management_matches';
const EVENTS_KEY = 'mybasket_management_events';
const PLAN_KEY = 'mybasket_management_gameplan';
const ROT_KEY = 'mybasket_management_rotation';
const SJ_KEY = 'mybasket_management_statsjeu';
const ADMIN_KEY = 'mybasket_management_admin';

const DEMO: Team[] = [{
  id: 'demo-paris', name: 'PARIS BASKETBALL', cat: 'U15',
  players: [
    { id: 'k13', num: 13, name: 'Nazpakete', pos: 'Arrière' }, { id: 'k9', num: 9, name: 'Mbonzo', pos: 'Ailier' },
    { id: 'k7', num: 7, name: 'Younang', pos: 'Pivot' }, { id: 'k3', num: 3, name: 'Cokara', pos: 'Meneur' },
    { id: 'k2', num: 2, name: 'Methale', pos: 'Ailier' }, { id: 'k5', num: 5, name: 'Sissoko', pos: 'Arrière' },
    { id: 'k11', num: 11, name: 'Mabaka', pos: 'Pivot' }, { id: 'k4', num: 4, name: 'Barry', pos: 'Ailier fort' },
  ],
}];

function normalizePlayer(p: any): Player {
  const num = Number(p.num ?? p.numero ?? p.number ?? p.maillot ?? 0) || 0;
  const name = p.name || [p.prenom, p.nom].filter(Boolean).join(' ').trim() || p.nom || p.fullName || (num ? `Joueur ${num}` : 'Joueur');
  const pos = p.pos || p.poste || p.postePrincipal || p.position || '';
  const photo = p.photo || p.avatar || p.image || p.photoUrl || '';
  return { id: String(p.id ?? p.playerId ?? `${num}-${name}`), num, name, pos, photo };
}
export function readTeams(): Team[] {
  // Fallback synchrone conservé pour ne pas casser les anciens composants.
  // La source réelle du MgmtProvider est maintenant readTeamsSupabase().
  return DEMO;
}

export async function readTeamsSupabase(): Promise<Team[]> {
  try {
    const rows = await getSupabaseTeams();

    const mapped = (rows ?? [])
      .map((team: any) => ({
        id: String(team.id ?? ''),
        name: String(team.nom || team.name || team.teamName || 'Équipe'),
        cat: team.cat || team.category || team.categorie || team.categorieLabel || '',
        players: (team.players || team.joueurs || team.effectif || team.roster || [])
          .map(normalizePlayer)
          .filter((p: Player) => p.id),
      }))
      .filter((team: Team) => team.id);

    return mapped.length ? mapped : [];
  } catch (error) {
    console.error('Erreur chargement équipes management:', error);
    return [];
  }
}
function readMap(key: string): Record<string, any> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(window.localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
}
function writeMap(key: string, v: any) { try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* noop */ } }

/* ============================ Helpers de calcul ============================ */
export const PTS = (l: Line) => l.p2m * 2 + l.p3m * 3 + l.ftm;
export const emptyLine = (playerId: string): Line => ({ playerId, present: true, min: 0, p2m: 0, p2a: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 });
export const pct = (m: number, a: number) => (a > 0 ? Math.round((m / a) * 100) : 0);
export const uid = () => Math.random().toString(36).slice(2, 9);

export function aggregate(matches: Match[], players: Player[]) {
  const games = matches.filter((m) => m.type === 'match');
  return players.map((p) => {
    const lines = games.map((g) => g.lines.find((l) => l.playerId === p.id)).filter((l): l is Line => !!l && l.present);
    const gp = lines.length;
    const sum = (f: (l: Line) => number) => lines.reduce((s, l) => s + f(l), 0);
    const avg = (f: (l: Line) => number) => (gp ? +(sum(f) / gp).toFixed(1) : 0);
    return {
      p, gp,
      ptsAvg: avg(PTS), minAvg: avg((l) => l.min), rebAvg: avg((l) => l.reb), astAvg: avg((l) => l.ast),
      stlAvg: avg((l) => l.stl), blkAvg: avg((l) => l.blk), toAvg: avg((l) => l.to),
      fg2: pct(sum((l) => l.p2m), sum((l) => l.p2a)), fg3: pct(sum((l) => l.p3m), sum((l) => l.p3a)), ft: pct(sum((l) => l.ftm), sum((l) => l.fta)),
    };
  });
}
export function teamRecord(matches: Match[]) {
  const g = matches.filter((m) => m.type === 'match');
  let w = 0, l = 0, d = 0, pf = 0, pa = 0;
  g.forEach((m) => { pf += m.scoreUs; pa += m.scoreThem; if (m.scoreUs > m.scoreThem) w++; else if (m.scoreUs < m.scoreThem) l++; else d++; });
  return { w, l, d, pf, pa, gp: g.length };
}
export const defaultRotation = (): Rotation => ({ durations: [10, 10, 10, 10], grid: { 0: [null, null, null, null, null], 1: [null, null, null, null, null], 2: [null, null, null, null, null], 3: [null, null, null, null, null] } });
export const defaultStatsJeu = (): StatsJeu => ({
  categories: [
    { id: 'transition', label: 'Transition', deletable: false }, { id: 'jeu-place', label: 'Jeu placé', deletable: false },
    { id: 'pick', label: 'Pick & roll', deletable: false }, { id: 'iso', label: 'Isolation' }, { id: 'post', label: 'Poste bas' },
  ], entries: [],
});
export const defaultGamePlan = (): GamePlan => ({ date: '', opponent: '', offSys: '', defSys: '', consignes: '', inclureRotation: false, finBlob: '', finSlob: '', finSys: '' });
export const defaultAdmin = (): AdminData => ({ cotisations: {}, presence: {} });

export const TABS = [
  { id: 'stats', label: '📈 Stats joueurs', href: '/management' },
  { id: 'stats-jeu', label: '🎯 Stats jeu', href: '/management/stats-jeu' },
  { id: 'live', label: '🔴 Stats Live', href: '/management/live' },
  { id: 'historique', label: '📚 Historique', href: '/management/historique' },
  { id: 'recherche', label: '🔍 Recherche', href: '/management/recherche' },
  { id: 'rotation', label: '🔄 Rotation', href: '/management/rotation' },
  { id: 'temps', label: '⏱ Temps de jeu', href: '/management/temps' },
  { id: 'performances', label: '🏆 Performances', href: '/management/performances' },
  { id: 'game-plan', label: '📋 Game Plan', href: '/management/game-plan' },
  { id: 'admin', label: '⚙️ Gestion admin', href: '/management/admin' },
];

/* ============================ Contexte ============================ */
interface Ctx {
  teams: Team[]; team?: Team; teamId: string; setTeamId: (id: string) => void;
  matches: Match[]; setMatches: (a: Match[]) => void;
  events: Evt[]; setEvents: (a: Evt[]) => void;
  plan: GamePlan; setPlan: (p: GamePlan) => void;
  rotation: Rotation; setRotation: (r: Rotation) => void;
  statsjeu: StatsJeu; setStatsJeu: (s: StatsJeu) => void;
  admin: AdminData; setAdmin: (a: AdminData) => void;
  flash: (m: string) => void;
}
const MgmtCtx = createContext<Ctx | null>(null);
export const useMgmt = () => {
  const c = useContext(MgmtCtx);
  if (!c) throw new Error('useMgmt must be used within MgmtProvider');
  return c;
};

export function MgmtProvider({ children, onToast }: { children: React.ReactNode; onToast?: (m: string) => void }) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamIdState] = useState('');
  const [matchesMap, setMatchesMap] = useState<Record<string, Match[]>>({});
  const [eventsMap, setEventsMap] = useState<Record<string, Evt[]>>({});
  const [planMap, setPlanMap] = useState<Record<string, GamePlan>>({});
  const [rotMap, setRotMap] = useState<Record<string, Rotation>>({});
  const [sjMap, setSjMap] = useState<Record<string, StatsJeu>>({});
  const [adminMap, setAdminMap] = useState<Record<string, AdminData>>({});

  useEffect(() => {
    async function initializeManagement() {
      const t = await readTeamsSupabase();

      setTeams(t);

      const saved =
        (typeof window !== 'undefined' && window.localStorage.getItem(TEAM_SEL_KEY)) ||
        '';

      setTeamIdState(saved && t.some((x) => x.id === saved) ? saved : t[0]?.id ?? '');

      setMatchesMap(readMap(MATCHES_KEY));
      setEventsMap(readMap(EVENTS_KEY));
      setPlanMap(readMap(PLAN_KEY));
      setRotMap(readMap(ROT_KEY));
      setSjMap(readMap(SJ_KEY));
      setAdminMap(readMap(ADMIN_KEY));
    }

    initializeManagement();
  }, []);

  const setTeamId = (id: string) => { setTeamIdState(id); try { window.localStorage.setItem(TEAM_SEL_KEY, id); } catch { /* noop */ } };
  const team = teams.find((t) => t.id === teamId);
  const mk = <T,>(map: Record<string, T>, fallback: T): T => map[teamId] ?? fallback;

  const ctx: Ctx = {
    teams, team, teamId, setTeamId,
    matches: matchesMap[teamId] || [],
    setMatches: (a) => { const n = { ...matchesMap, [teamId]: a }; setMatchesMap(n); writeMap(MATCHES_KEY, n); },
    events: eventsMap[teamId] || [],
    setEvents: (a) => { const n = { ...eventsMap, [teamId]: a }; setEventsMap(n); writeMap(EVENTS_KEY, n); },
    plan: mk(planMap, defaultGamePlan()),
    setPlan: (p) => { const n = { ...planMap, [teamId]: p }; setPlanMap(n); writeMap(PLAN_KEY, n); },
    rotation: mk(rotMap, defaultRotation()),
    setRotation: (r) => { const n = { ...rotMap, [teamId]: r }; setRotMap(n); writeMap(ROT_KEY, n); },
    statsjeu: mk(sjMap, defaultStatsJeu()),
    setStatsJeu: (s) => { const n = { ...sjMap, [teamId]: s }; setSjMap(n); writeMap(SJ_KEY, n); },
    admin: mk(adminMap, defaultAdmin()),
    setAdmin: (a) => { const n = { ...adminMap, [teamId]: a }; setAdminMap(n); writeMap(ADMIN_KEY, n); },
    flash: (m) => onToast?.(m),
  };

  return <MgmtCtx.Provider value={ctx}>{children}</MgmtCtx.Provider>;
}

/* ============================ Avatar ============================ */
export function Av({ p }: { p: Player }) {
  if (p.photo) return <img className="mg-av" src={p.photo} alt="" />;
  const ini = (p.name || '').split(/[\s.\-]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="mg-av">{ini || '?'}</span>;
}

/* ============================ Export CSV générique ============================ */
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => String(c)).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

/* ============================ Entraînements depuis "Mon Calendrier" ============================ */
/** Ancien fallback local : lit le store de Mon Calendrier (`mybasket_calendar_events`) et renvoie les
 *  ENTRAÎNEMENTS de l'équipe donnée (triés par date), avec les joueurs assignés.
 *  Sert à synchroniser la grille de présence de Gestion admin. */
export interface CalTraining { id: string; date: string; time: string; opponent: string; assignedPlayers: string[] }
export function readCalendarTrainings(teamId: string): CalTraining[] {
  if (typeof window === 'undefined' || !teamId) return [];
  try {
    const raw = window.localStorage.getItem('mybasket_calendar_events');
    const list: any[] = raw ? JSON.parse(raw) : [];
    return (Array.isArray(list) ? list : [])
      .filter((e) => e && e.type === 'entrainement' && String(e.teamId || '') === String(teamId))
      .map((e) => ({ id: String(e.id), date: String(e.date || ''), time: String(e.time || ''), opponent: String(e.opponent || e.title || ''), assignedPlayers: Array.isArray(e.assignedPlayers) ? e.assignedPlayers.map(String) : [] }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  } catch { return []; }
}