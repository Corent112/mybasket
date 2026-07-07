'use client';

/**
 * Prise de stats LIVE — wizard une-étape-à-la-fois (Sportscode / FIBA LiveStats)
 * Intégré au Management ("Stats Live"). Choix de l'équipe depuis les vraies équipes Supabase.
 * Joueurs + photos issus de la table players.
 *
 * Étapes : Création du match (date / adversaire / équipe / 5 majeur) puis saisie :
 *  - 1 seul choix attaque/défense au début de chaque quart-temps, ensuite bascule auto
 *  - chrono live, scores par quart-temps, changements
 *  - aucune validation (auto-enregistrement), shot chart au clic
 *  - box-score consultable + analyses (temps forts/joueur, lineups, stops, possessions)
 */

import { type MouseEvent, useEffect, useRef, useState } from 'react';
import { createClient } from "@/lib/supabase/client";
import {
  saveLiveMatch,
  ensureLiveMatch,
  persistLiveAction,
  deleteLiveAction,
  upsertLiveMatchAggregates,
  finalizeLiveMatch,
} from "@/lib/stats-supabase";
import { useLivestatTags } from "@/lib/livestat-tags";

/* ============================ Types ============================ */
interface Player { id: string; num: number; name: string; pos: string; photo?: string }
type Ctx = '' | 'attaque' | 'defense';

interface Draft {
  context: Ctx; inbound: string; tempsFort: string; coverage: string;
  playerId: string | null; actionType: string;
  shotType: string; shotResult: string; specialCase: string;
  ftAttempts: number; ftMade: number; ftResults: string[];
  zone: string; courtX: number | null; courtY: number | null;
  reboundType: string; reboundPlayerId: string | null;
  assist: boolean | null; assistPlayerId: string | null;
  foulOutcome: string;
}
interface StatA extends Draft { id: string; clock: string; q: number; lineup: string[] }

/* ============================ Données "Mes équipes" ============================ */
const TEAMS_KEY = 'mybasket_equipes';
const SESSION_KEY = (id: string) => `mybasket_prise_stats_session_${id}`;

const DEFAULT_TEAMS = [
  {
    id: 'demo-roanne', name: 'ROANNE',
    players: [
      { id: 'p4', num: 4, name: 'S. Dupont', pos: 'G' }, { id: 'p5', num: 5, name: 'N. Potin', pos: 'G' },
      { id: 'p7', num: 7, name: 'J. Diallo', pos: 'G' }, { id: 'p14', num: 14, name: 'D. Benomar', pos: 'C' },
      { id: 'p9', num: 9, name: 'M. Kaba', pos: 'G' }, { id: 'p11', num: 11, name: 'T. Maleme', pos: 'F' },
      { id: 'p8', num: 8, name: 'L. Mendy', pos: 'F' },
    ],
  },
];

function normalizePlayer(p: any): Player {
  const num = Number(p.num ?? p.numero ?? p.number ?? p.number_jersey ?? p.maillot ?? 0) || 0;

  const name =
    p.name ||
    [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
    [p.prenom, p.nom].filter(Boolean).join(' ').trim() ||
    p.nom ||
    p.fullName ||
    p.displayName ||
    (num ? `Joueur ${num}` : 'Joueur');

  const pos = p.pos || p.poste || p.postePrincipal || p.position || '';
  const photo = p.photo_url || p.photo || p.avatar || p.image || p.photoUrl || p.url || '';
  const id = String(p.id ?? p.playerId ?? `${num}-${name}`);

  return { id, num, name, pos, photo };
}

function readTeamsFromLocalStorage(): { id: string; name: string; players: Player[] }[] {
  if (typeof window === 'undefined') return DEFAULT_TEAMS as any;

  try {
    const raw = window.localStorage.getItem(TEAMS_KEY);
    if (!raw) return DEFAULT_TEAMS as any;

    const data = JSON.parse(raw);
    const list: any[] = Array.isArray(data) ? data : data?.teams || data?.equipes || [];

    const mapped = list
      .map((t) => ({
        id: String(t.id ?? ''),
        name: String(t.nom || t.name || t.teamName || 'Équipe').toUpperCase(),
        players: (t.players || t.joueurs || t.effectif || t.roster || [])
          .map(normalizePlayer)
          .filter((p: Player) => p.id),
      }))
      .filter((t) => t.id && t.players.length);

    return mapped.length ? mapped : (DEFAULT_TEAMS as any);
  } catch {
    return DEFAULT_TEAMS as any;
  }
}

async function readTeams(): Promise<{ id: string; name: string; players: Player[] }[]> {
  if (typeof window === 'undefined') return [];

  try {
    const supabase = createClient();

    const { data: teamsData, error: teamsError } = await supabase
      .from('teams')
      .select('*')
      .order('name', { ascending: true });

    if (teamsError) {
      console.error('Erreur chargement équipes Supabase prise stats :', {
        message: teamsError.message,
        details: teamsError.details,
        hint: teamsError.hint,
        code: teamsError.code,
        raw: teamsError,
      });

      return [];
    }

    const validTeams = (teamsData ?? [])
      .map((team: any) => ({
        ...team,
        id: String(team.id ?? ''),
      }))
      .filter((team: any) => team.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(team.id));

    const teamIds = validTeams.map((team: any) => team.id);

    if (!teamIds.length) {
      console.warn('Aucune vraie équipe Supabase trouvée pour la prise de stats.');
      return [];
    }

    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select('*')
      .in('team_id', teamIds);

    if (playersError) {
      console.error('Erreur chargement joueurs Supabase prise stats :', {
        message: playersError.message,
        details: playersError.details,
        hint: playersError.hint,
        code: playersError.code,
        raw: playersError,
      });

      return validTeams.map((team: any) => ({
        id: team.id,
        name: String(team.name || team.club_name || 'Équipe').toUpperCase(),
        players: [],
      }));
    }

    const playersByTeam: Record<string, Player[]> = {};

    (playersData ?? []).forEach((player: any) => {
      const currentTeamId = String(player.team_id ?? '');
      if (!currentTeamId) return;

      if (!playersByTeam[currentTeamId]) playersByTeam[currentTeamId] = [];

      playersByTeam[currentTeamId].push(
        normalizePlayer({
          id: player.id,
          num:
            player.number_jersey ??
            player.number ??
            player.numero ??
            player.num ??
            player.jersey_number ??
            0,
          first_name: player.first_name,
          last_name: player.last_name,
          name:
            player.name ||
            [player.first_name, player.last_name].filter(Boolean).join(' ').trim() ||
            player.full_name ||
            '',
          pos: player.position || player.pos || player.poste || '',
          photo_url: player.photo_url || player.avatar_url || player.photo || '',
        })
      );
    });

    Object.keys(playersByTeam).forEach((id) => {
      playersByTeam[id].sort((a, b) => a.num - b.num);
    });

    const mapped = validTeams
      .map((team: any) => {
        const players = playersByTeam[team.id] ?? [];

        return {
          id: team.id,
          name: String(team.name || team.club_name || 'Équipe').toUpperCase(),
          players,
        };
      })
      .filter((team: { id?: string; players: unknown[] }) => team.id && team.players.length);

    console.log('Équipes Supabase chargées pour prise stats =', mapped);

    return mapped;
  } catch (error) {
    console.error('Erreur inattendue chargement équipes Supabase prise stats :', error);
    return [];
  }
}

/* ============================ Constantes wizard ============================ */
const TEMPS = [
  { id: 'fast-break', label: 'Fast Break', ic: '🏃' }, { id: 'transition', label: 'Transition', ic: '⚡' },
  { id: 'jeu-place', label: 'Jeu placé', ic: '📋' }, { id: 'pick-side', label: 'Pick Side', ic: '⛹' },
  { id: 'pick-top', label: 'Pick Top', ic: '⛹' }, { id: 'hand-off', label: 'Hand Off', ic: '🤝' },
  { id: '1v1', label: '1v1', ic: '🤼' }, { id: 'drive-kick', label: 'Drive & kick', ic: '🎯' },
  { id: 'stagger', label: 'Stagger', ic: '🧱' }, { id: 'jeu-sans-ballon', label: 'Jeu sans ballon', ic: '✂' },
  { id: 'off-rebound', label: 'Offensive Rebound', ic: '↺' },
];
const COVERAGES = [
  { id: 'step-out', label: 'Step out' }, { id: 'switch', label: 'Switch' }, { id: 'under', label: 'Under' },
  { id: 'protect', label: 'Protect' }, { id: 'ice', label: 'ICE' },
];
const ATT_ACTIONS = [
  { id: 'tir', label: 'Tir', ic: '🏀' }, { id: 'faute-provoquee', label: 'Faute provoquée', ic: '🔔' },
  { id: 'touche', label: 'Touche / Sortie', ic: '⤵' }, { id: 'perte', label: 'Perte de balle', ic: '✖' },
  { id: 'faute-commise', label: 'Faute commise', ic: '🟨' },
];
const DEF_ACTIONS = [
  { id: 'tir', label: 'Tir adverse', ic: '🏀' },
  { id: 'interception', label: 'Interception / récupération', ic: '🖐' },
  { id: 'perte-adverse', label: 'BP adverse', ic: '✖' },
  { id: 'contre', label: 'Contre', ic: '🛑' },
  { id: 'faute-provoquee', label: 'Faute provoquée', ic: '🔔' },
  { id: 'faute-commise', label: 'Faute commise', ic: '🟨' },
];
const NEEDS_PLAYER_DEF = ["contre"];
const CAN_TAG_PLAYER_DEF = ["interception", "perte-adverse"];
const NAV = ['Contexte', 'Temps fort', 'Joueur', "Type d'action", 'Résultat', 'Où ?', 'Conséquence'];
const STAGE_NAV: Record<string, number> = {
  context: 0, inbound: 1, temps: 1, coverage: 1, player: 2, action: 3, faute: 3, result: 4, ft: 4, zone: 5, rebound: 6, assist: 6,
};
const emptyDraft = (): Draft => ({
  context: '', inbound: '', tempsFort: '', coverage: '', playerId: null, actionType: '',
  shotType: '', shotResult: '', specialCase: 'aucun', ftAttempts: 0, ftMade: 0, ftResults: [],
  zone: '', courtX: null, courtY: null, reboundType: '', reboundPlayerId: null, assist: null, assistPlayerId: null, foulOutcome: '',
});

/* ============================ Calculs ============================ */
const POSS = (c: Ctx): Ctx => (c === 'attaque' ? 'defense' : c === 'defense' ? 'attaque' : '');
const isMyRebound = (c: Ctx, t: string) => (c === 'attaque' && t === 'off') || (c === 'defense' && t === 'def');
const reboundNext = (c: Ctx, t: string): Ctx =>
  t === 'off' ? (c === 'attaque' ? 'attaque' : 'defense')
    : t === 'def' ? (c === 'attaque' ? 'defense' : 'attaque')
      : t === 'touche-pour' ? 'attaque' : t === 'touche-contre' ? 'defense' : POSS(c);

function ptsOf(a: Draft) {
  if (a.context === 'defense') return 0;
  let p = 0;
  if (a.shotType === 'LF') p += a.ftMade || 0;
  else if (a.actionType === 'tir' && a.shotResult === 'made') { if (a.shotType === '2PTS') p = 2; else if (a.shotType === '3PTS') p = 3; }
  if (a.actionType === 'tir' && a.shotType !== 'LF' && a.shotResult === 'made' && a.specialCase !== 'aucun') p += a.ftMade || 0;
  return p;
}
function themPtsOf(a: Draft) {
  if (a.context === 'defense' && a.actionType === 'tir' && a.shotResult === 'made')
    return a.shotType === '3PTS' ? 3 : a.shotType === 'LF' ? 1 : 2;
  if (a.context === 'defense' && a.actionType === 'faute-commise') {
    let p = a.ftMade || 0;
    if (a.specialCase === '2pts+1lf') p += 2; else if (a.specialCase === '3pts+1lf') p += 3;
    return p;
  }
  return 0;
}
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const periodLabel = (period: number) => (period <= 4 ? `Q${period}` : `OT${period - 4}`);
const periodDuration = (period: number) => (period <= 4 ? 600 : 300);
const uid = () => Math.random().toString(36).slice(2, 9);
const isSupabaseUuid = (value: string | null | undefined) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

function describe(a: StatA, find: (id: string | null) => Player | undefined) {
  if (a.actionType === 'tir') {
    if (a.context === 'defense') {
      const made = a.shotResult === 'made';
      return {
        b: 'ADV',
        c: made ? 'b-neutral' : 'b-def',
        t: made
          ? `Panier adverse (${a.shotType === '3PTS' ? 3 : a.shotType === 'LF' ? 1 : 2})`
          : 'Tir adverse manqué',
      };
    }

    if (a.shotType === 'LF') {
      return {
        b: 'LF',
        c: a.ftMade > 0 ? 'b-ft' : 'b-miss',
        t: `${a.ftMade || 0}/${a.ftAttempts || 0} LF`,
      };
    }

    const made = a.shotResult === 'made';

    return {
      b: a.shotType,
      c: made ? 'b-made' : 'b-miss',
      t: made
        ? `${a.shotType === '3PTS' ? 3 : 2} pts marqués`
        : `${a.shotType === '3PTS' ? 3 : 2} pts raté`,
    };
  }

  if (a.actionType === 'perte-adverse') {
    return { b: 'BP ADV', c: 'b-stl', t: 'Balle perdue adverse' };
  }

  if (a.actionType === 'interception' && a.context === 'defense') {
    return { b: 'INT', c: 'b-stl', t: 'Interception / récupération' };
  }

  if (a.actionType === 'passe') return { b: 'AST', c: 'b-ast', t: 'Passe décisive' };
  if (a.actionType === 'rebond-def') return { b: 'DEF REB', c: 'b-def', t: 'Rebond défensif' };
  if (a.actionType === 'interception') return { b: 'STL', c: 'b-stl', t: 'Interception' };
  if (a.actionType === 'contre') return { b: 'BLK', c: 'b-def', t: 'Contre' };
  if (a.actionType === 'perte') return { b: 'TO', c: 'b-to', t: 'Perte de balle' };

  if (a.actionType === 'touche') {
    return {
      b: 'IN',
      c: 'b-neutral',
      t: `Remise en jeu${a.inbound ? ' (' + a.inbound.toUpperCase() + ')' : ''}`,
    };
  }

  if (a.actionType === 'faute-provoquee') {
    return {
      b: 'FP',
      c: 'b-foul',
      t: `Faute provoquée${
        a.foulOutcome === 'touche'
          ? ' · touche'
          : a.shotType === 'LF'
            ? ` · ${a.ftMade}/${a.ftAttempts} LF`
            : ''
      }`,
    };
  }

  if (a.actionType === 'faute-commise') {
    let t = 'Faute commise';

    if (a.foulOutcome === 'touche') t += ' · touche';
    else if (a.specialCase === '2pts+1lf') t += ` · 2 +1 (LF ${a.ftMade ? '✓' : '✗'})`;
    else if (a.specialCase === '3pts+1lf') t += ` · 3 +1 (LF ${a.ftMade ? '✓' : '✗'})`;
    else if (a.shotType === 'LF') t += ` · ${a.ftMade || 0}/${a.ftAttempts || 0} LF adv.`;

    return { b: 'FC', c: 'b-foul', t };
  }

  return { b: '•', c: 'b-neutral', t: a.actionType };
}

function computeBox(actions: StatA[], roster: Player[]) {
  const map: Record<string, any> = {};

  const blank = (p: Player) => ({
    p,
    p2m: 0,
    p2a: 0,
    p3m: 0,
    p3a: 0,
    ftm: 0,
    fta: 0,
    offReb: 0,
    defReb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    to: 0,
    pf: 0,
  });

  roster.forEach((p) => {
    map[p.id] = blank(p);
  });

  const ens = (id: string | null) => {
    if (id && !map[id]) {
      const p =
        roster.find((x) => x.id === id) || {
          id,
          num: 0,
          name: id,
          pos: "",
        };

      map[id] = blank(p as Player);
    }

    return id ? map[id] : null;
  };

  actions.forEach((a) => {
    const L = ens(a.playerId);

    if (a.actionType === "tir" && L && a.context !== "defense") {
      if (a.shotType === "2PTS") {
        L.p2a++;
        if (a.shotResult === "made") L.p2m++;
      } else if (a.shotType === "3PTS") {
        L.p3a++;
        if (a.shotResult === "made") L.p3m++;
      } else if (a.shotType === "LF") {
        L.fta += a.ftAttempts;
        L.ftm += a.ftMade;
      }

      if (
        a.shotType !== "LF" &&
        a.shotResult === "made" &&
        a.specialCase !== "aucun"
      ) {
        L.fta += a.ftAttempts;
        L.ftm += a.ftMade;
      }
    } else if (a.actionType === "interception" && L) {
      L.stl++;
    } else if (a.actionType === "contre" && L) {
      L.blk++;
    } else if (a.actionType === "perte" && L) {
      L.to++;
    } else if (a.actionType === "rebond-def" && L) {
      L.defReb++;
    } else if (a.actionType === "faute-commise" && L) {
      L.pf++;
    } else if (
      a.actionType === "faute-provoquee" &&
      L &&
      a.shotType === "LF"
    ) {
      L.fta += a.ftAttempts;
      L.ftm += a.ftMade;
    }

    if (a.assist && a.assistPlayerId) {
      const x = ens(a.assistPlayerId);
      if (x) x.ast++;
    }

    if (a.reboundPlayerId) {
      const x = ens(a.reboundPlayerId);

      if (x) {
        if (a.reboundType === "off") {
          x.offReb++;
        }

        if (a.reboundType === "def") {
          x.defReb++;
        }
      }
    }
  });

  return Object.values(map)
    .filter(
      (l: any) =>
        l.p2a +
          l.p3a +
          l.fta +
          l.offReb +
          l.defReb +
          l.ast +
          l.stl +
          l.blk +
          l.to +
          l.pf >
        0
    )
    .sort((a: any, b: any) => a.p.num - b.p.num);
}
function computeAnalytics(actions: StatA[], roster: Player[]) {
  let offPoss = 0, defPoss = 0; const defSeq: boolean[] = [];
  actions.forEach((a) => {
    if (a.context === 'attaque') offPoss++;
    else if (a.context === 'defense') { defPoss++; defSeq.push(themPtsOf(a) === 0); }
  });
  let maxStreak = 0, cur = 0; defSeq.forEach((stop) => { if (stop) { cur++; maxStreak = Math.max(maxStreak, cur); } else cur = 0; });
  const tfUsed = TEMPS.filter((t) => actions.some((a) => a.tempsFort === t.id));
  const tfMatrix: Record<string, Record<string, number>> = {};
  actions.forEach((a) => { if (a.playerId && a.tempsFort) { tfMatrix[a.playerId] = tfMatrix[a.playerId] || {}; tfMatrix[a.playerId][a.tempsFort] = (tfMatrix[a.playerId][a.tempsFort] || 0) + ptsOf(a); } });
  const lu: Record<string, any> = {};
  actions.forEach((a) => { const sig = (a.lineup || []).slice().sort().join(','); if (!sig) return; lu[sig] = lu[sig] || { ids: a.lineup.slice(), us: 0, them: 0, n: 0 }; lu[sig].n++; lu[sig].us += ptsOf(a); lu[sig].them += themPtsOf(a); });
  return { offPoss, defPoss, maxStreak, curStreak: cur, tfUsed, tfMatrix, lineups: Object.values(lu) };
}

/* ============================ Avatar ============================ */
function Av({ p, cls }: { p?: Player; cls?: string }) {
  if (!p) return <span className={`av none ${cls || ''}`}>∅</span>;
  if (p.photo) return <img className={`av ${cls || ''}`} src={p.photo} alt="" />;
  const ini = (p.name || '').split(/[\s.\-]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className={`av ${cls || ''}`}>{ini || '?'}</span>;
}

/* ============================ Composant ============================ */
export default function PriseStatsProPage() {
  const [teams, setTeams] = useState<{ id: string; name: string; players: Player[] }[]>([]);
  const [screen, setScreen] = useState<'setup' | 'live' | 'box'>('setup');
  const [teamId, setTeamId] = useState('');
  const [activeTeamId, setActiveTeamId] = useState('');
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [home, setHome] = useState(true);
  const [starters, setStarters] = useState<string[]>([]);

  const [roster, setRoster] = useState<Player[]>([]);
  const [teamName, setTeamName] = useState('');
  const [onCourt, setOnCourt] = useState<string[]>([]);
  const [stage, setStage] = useState('context');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [actions, setActions] = useState<StatA[]>([]);
  const [q, setQ] = useState(1);
  const [secs, setSecs] = useState(600);

  // Temps de jeu automatique : stocke le nombre de secondes jouées par joueur.
  // Dès que le chrono tourne, les joueurs présents dans `onCourt` prennent +1 seconde.
  const [minutesByPlayer, setMinutesByPlayer] = useState<Record<string, number>>({});

  const [running, setRunning] = useState(false);
  const [perQ, setPerQ] = useState<Record<number, { us: number; them: number }>>({ 1: { us: 0, them: 0 } });
  const [subSel, setSubSel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* -------- Persistance TEMPS RÉEL (match_actions = source unique) -------- */
  // matchId Supabase du match en cours + realTeamId résolu, gardés en state ET
  // en ref pour un accès synchrone dans commit()/undo() sans attendre un render.
  const [liveMatchId, setLiveMatchId] = useState<string | null>(null);
  const liveMatchIdRef = useRef<string | null>(null);
  const liveTeamIdRef = useRef<string | null>(null);
  const ensuringRef = useRef(false); // évite les doubles créations concurrentes

  const setLiveMatch = (matchId: string | null, teamId: string | null) => {
    liveMatchIdRef.current = matchId;
    liveTeamIdRef.current = teamId;
    setLiveMatchId(matchId);
  };

  // Recalcule les lignes boxscore (mapping identique à finishMatch) à partir
  // de l'état courant, pour l'upsert live de match_player_stats.
  const buildLiveLines = (arr: StatA[], court: string[]) => {
    const playedIds = new Set<string>();
    arr.forEach((action) => (action.lineup || []).forEach((id) => playedIds.add(id)));
    court.forEach((id) => playedIds.add(id));

    const box = computeBox(arr, roster);
    const byId: Record<string, any> = {};
    box.forEach((line: any) => { byId[line.p.id] = line; });

    return roster.map((player) => {
      const line = byId[player.id] || {};
      return {
        playerId: player.id,
        present: playedIds.has(player.id),
        p2m: line.p2m || 0, p2a: line.p2a || 0,
        p3m: line.p3m || 0, p3a: line.p3a || 0,
        ftm: line.ftm || 0, fta: line.fta || 0,
        offReb: line.offReb || 0, defReb: line.defReb || 0,
        ast: line.ast || 0, stl: line.stl || 0, blk: line.blk || 0,
        to: line.to || 0, pf: line.pf || 0,
      };
    });
  };

  // Écrit le boxscore + le score live à partir d'un jeu d'actions donné.
  // Non bloquant : toute erreur est avalée (le live continue en local).
  const syncLiveAggregates = (arr: StatA[], court: string[], perQuarters: typeof perQ) => {
    const matchId = liveMatchIdRef.current;
    const teamId = liveTeamIdRef.current;
    if (!matchId || !teamId) return;
    const us = Object.values(perQuarters).reduce((s, q) => s + (q?.us || 0), 0);
    const them = Object.values(perQuarters).reduce((s, q) => s + (q?.them || 0), 0);
    upsertLiveMatchAggregates({
      matchId, teamId,
      lines: buildLiveLines(arr, court),
      us, them, perQ: perQuarters,
    }).catch(() => {});
  };

  useEffect(() => {
    document.body.classList.add('prise-stats-fullscreen');

    return () => {
      document.body.classList.remove('prise-stats-fullscreen');
    };
  }, []);

  const find = (id: string | null) => roster.find((p) => p.id === id);
  const floor = roster.filter((p) => onCourt.includes(p.id));
  const bench = roster.filter((p) => !onCourt.includes(p.id));

  useEffect(() => {
    let active = true;

    async function loadTeams() {
      const loadedTeams = await readTeams();
      if (active) setTeams(loadedTeams);
    }

    loadTeams();

    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!teams.length) return;

    const currentStillExists = teams.some((team) => team.id === teamId);

    if (!teamId || !currentStillExists) {
      setTeamId(teams[0].id);
      setStarters([]);
    }
  }, [teams, teamId]);

  // chrono + calcul automatique du temps de jeu
  useEffect(() => {
    if (!running) return;

    const t = setInterval(() => {
      // +1 seconde pour chaque joueur actuellement sur le terrain.
      // Si un joueur sort, il arrête de cumuler. Si un remplaçant entre, il commence à cumuler.
      setMinutesByPlayer((prev) => {
        const next = { ...prev };

        onCourt.forEach((playerId) => {
          next[playerId] = (next[playerId] || 0) + 1;
        });

        return next;
      });

      setSecs((s) => {
        if (s > 1) return s - 1;

        setRunning(false);

        const us = sumPerQ('us');
        const them = sumPerQ('them');

        // Fin du Q4 ou d'une prolongation : si égalité, on lance automatiquement une OT de 5 min.
        if (q >= 4 && us === them) {
          const nextPeriod = q + 1;

          setQ(nextPeriod);
          setPerQ((p) =>
            p[nextPeriod] ? p : { ...p, [nextPeriod]: { us: 0, them: 0 } }
          );
          setDraft(emptyDraft());
          setStage('context');
          flash(`${periodLabel(nextPeriod)} lancé · 5 minutes`);

          return periodDuration(nextPeriod);
        }

        return 0;
      });
    }, 1000);

    return () => clearInterval(t);
  }, [running, q, perQ, onCourt]);

  // persistance par équipe
  useEffect(() => {
    if (screen === 'setup' || !teamId) return;
    try { window.localStorage.setItem(SESSION_KEY(teamId), JSON.stringify({ actions, perQ, q, onCourt, opponent, teamName, home, minutesByPlayer })); } catch { /* noop */ }
  }, [actions, perQ, q, onCourt, screen, teamId, opponent, teamName, home, minutesByPlayer]);

  const flash = (m: string) => { setToast(m); window.clearTimeout((flash as any)._t); (flash as any)._t = window.setTimeout(() => setToast(null), 1500); };

  const sumPerQ = (key: 'us' | 'them') =>
    Object.values(perQ).reduce((total, item) => total + item[key], 0);

  /* -------- création du match -------- */
  const selTeam = teams.find((t) => t.id === teamId);
  const setupRoster = selTeam?.players || [];
  const canStart = !!opponent.trim() && starters.length === 5;
  const toggleStarter = (id: string) => setStarters((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 5 ? [...s, id] : s));
  const startMatch = () => {
    if (!selTeam) return;
    setActiveTeamId(selTeam.id);
    setTeamId(selTeam.id);
    setRoster(selTeam.players); setTeamName(selTeam.name); setOnCourt(starters.slice());
    setActions([]); setMinutesByPlayer({}); setPerQ({ 1: { us: 0, them: 0 } }); setQ(1); setSecs(600); setRunning(false);
    setDraft(emptyDraft()); setStage('context'); setScreen('live');

    // Prépare la ligne match_stats (statut 'live') UNE fois, en arrière-plan.
    // Non bloquant : si ça échoue, la saisie continue et tout reste en local.
    setLiveMatch(null, null);
    ensuringRef.current = true;
    ensureLiveMatch({
      teamId: selTeam.id,
      opponent: opponent || 'Adversaire',
      date,
      home,
      playerIds: selTeam.players.map((p) => p.id),
    })
      .then((res) => {
        if (res.ok) setLiveMatch(res.matchId, res.teamId);
      })
      .catch(() => {})
      .finally(() => { ensuringRef.current = false; });
  };

  /* -------- horloge / quart-temps -------- */
  const changeQ = (d: number) => {
    const nq = Math.max(1, q + d);
    setQ(nq); setPerQ((p) => (p[nq] ? p : { ...p, [nq]: { us: 0, them: 0 } }));
    setSecs(periodDuration(nq)); setRunning(false); setDraft(emptyDraft()); setStage('context');
  };

  /* -------- enregistrement (auto, sans validation) -------- */
  const commit = (d: Draft) => {
    const a: StatA = { ...d, id: uid(), clock: fmt(secs), q, lineup: onCourt.slice() };
    setActions((arr) => [...arr, a]);
    setPerQ((p) => { const cur = p[q] || { us: 0, them: 0 }; return { ...p, [q]: { us: cur.us + ptsOf(a), them: cur.them + themPtsOf(a) } }; });
    flash('Enregistré : ' + describe(a, find).t);

    /* --- Écriture TEMPS RÉEL (non bloquante) : match_actions + boxscore ---
       Le state React se met à jour de façon asynchrone : on calcule donc
       localement le prochain jeu d'actions et le prochain perQ pour écrire des
       valeurs à jour, sans attendre le render. En cas d'erreur Supabase, le
       live continue en local (localStorage + export CSV/JSON restent le filet). */
    const matchId = liveMatchIdRef.current;
    const teamId = liveTeamIdRef.current;
    if (matchId && teamId) {
      persistLiveAction({
        matchId, teamId,
        action: {
          id: a.id, q: a.q, clock: a.clock, lineup: a.lineup,
          context: a.context, inbound: a.inbound, tempsFort: a.tempsFort,
          coverage: a.coverage, playerId: a.playerId,
          actionType: a.actionType, shotType: a.shotType, shotResult: a.shotResult,
          specialCase: a.specialCase, ftAttempts: a.ftAttempts, ftMade: a.ftMade,
          ftResults: a.ftResults, reboundType: a.reboundType,
          reboundPlayerId: a.reboundPlayerId, assist: a.assist,
          assistPlayerId: a.assistPlayerId, foulOutcome: a.foulOutcome,
          courtX: a.courtX ?? null, courtY: a.courtY ?? null,
        },
      }).catch(() => {});

      const nextActions = [...actions, a];
      const cur = perQ[q] || { us: 0, them: 0 };
      const nextPerQ = { ...perQ, [q]: { us: cur.us + ptsOf(a), them: cur.them + themPtsOf(a) } };
      syncLiveAggregates(nextActions, onCourt, nextPerQ);
    }

    let next: Ctx, inbound = false;
    if (a.actionType === 'touche') next = 'attaque';
    else if (a.actionType === 'faute-commise' && a.context === 'defense') next = 'defense';
    else if (a.foulOutcome === 'touche') { if (a.context === 'defense') next = 'defense'; else { next = 'attaque'; inbound = true; } }
    else if (a.reboundType === 'touche-pour') { next = 'attaque'; inbound = true; }
    else if (a.reboundType) next = reboundNext(a.context, a.reboundType);
    else next = POSS(a.context);
    const fresh = emptyDraft(); fresh.context = next;
    setDraft(fresh); setStage(inbound ? 'inbound' : 'temps');
  };

  /* -------- routages LF / passe décisive -------- */
  const afterFT = (d: Draft) => {
    const anyMade = d.ftMade > 0;
    const lastMiss = d.ftResults[d.ftResults.length - 1] === 'miss';

    if (d.actionType === 'faute-commise') {
      const nd = { ...d, shotResult: anyMade ? 'made' : 'missed' };

      // En défense, si le dernier LF adverse est loupé, on doit choisir le rebond.
      if (lastMiss) {
        setDraft(nd);
        setStage('rebound');
        return;
      }

      commit(nd);
      return;
    }

    if (d.specialCase === '2pts+1lf' || d.specialCase === '3pts+1lf') {
      if (lastMiss) {
        setDraft(d);
        setStage('rebound');
      } else {
        commit(d);
      }
      return;
    }

    if (d.actionType === 'faute-provoquee') {
      const nd = { ...d, shotResult: anyMade ? 'made' : 'missed' };

      if (anyMade) {
        setDraft(nd);
        setStage('assist');
        return;
      }

      if (lastMiss) {
        setDraft(nd);
        setStage('rebound');
        return;
      }

      commit(nd);
      return;
    }

    const nd = { ...d, shotResult: anyMade ? 'made' : 'missed' };

    if (lastMiss) {
      setDraft(nd);
      setStage('rebound');
    } else {
      commit(nd);
    }
  };
  const afterPD = (d: Draft) => {
    if (d.specialCase === '2pts+1lf' || d.specialCase === '3pts+1lf') { setDraft({ ...d, ftResults: [] }); setStage('ft'); return; }
    if (d.actionType === 'faute-provoquee') { const lastMiss = d.ftResults[d.ftResults.length - 1] === 'miss'; if (lastMiss) { setDraft(d); setStage('rebound'); return; } commit(d); return; }
    commit(d);
  };

  /* -------- handlers -------- */
  const ctxPick = (c: Ctx) => { setDraft({ ...draft, context: c }); setStage('temps'); };
  const inboundPick = (t: string) => { const d = { ...draft, inbound: t }; if (d.actionType === 'touche') commit(d); else { setDraft(d); setStage('temps'); } };
  const tempsPick = (id: string) => { const d = { ...draft, tempsFort: id, coverage: '' }; if (id === 'pick-side' || id === 'pick-top') { setDraft(d); setStage('coverage'); } else { setDraft(d); setStage(d.context === 'defense' ? 'action' : 'player'); } };
  const covPick = (id: string) => { const d = { ...draft, coverage: id }; setDraft(d); setStage(d.context === 'defense' ? 'action' : 'player'); };
  const actionPick = (id: string) => {
  const d = { ...draft, actionType: id };

  if (d.context === "defense") {
    if (id === "tir") {
      setDraft(d);
      setStage("result");
      return;
    }

    if (id === "faute-commise") {
      setDraft(d);
      setStage("player");
      return;
    }

    if (NEEDS_PLAYER_DEF.includes(id) || CAN_TAG_PLAYER_DEF.includes(id)) {
      setDraft(d);
      setStage("player");
      return;
    }

    commit(d);
    return;
  }

  if (id === "tir") {
    setDraft(d);
    setStage("result");
  } else if (id === "faute-provoquee") {
    setDraft(d);
    setStage("faute");
  } else if (id === "touche") {
    setDraft(d);
    setStage("inbound");
  } else {
    commit(d);
  }
};
  const playerPick = (id: string) => {
  if (draft.context === "defense" && draft.actionType === "faute-commise") {
    setDraft({ ...draft, playerId: id });
    setStage("faute");
    return;
  }

  if (
    draft.context === "defense" &&
    (NEEDS_PLAYER_DEF.includes(draft.actionType) ||
      CAN_TAG_PLAYER_DEF.includes(draft.actionType))
  ) {
    commit({ ...draft, playerId: id });
    return;
  }

  setDraft({ ...draft, playerId: id });
  setStage("action");
};
  const foulPick = (o: string) => {
    if (o === 'touche') { commit({ ...draft, foulOutcome: 'touche' }); return; }
    if (o === '2plus1' || o === '3plus1') { setDraft({ ...draft, foulOutcome: 'and-one', specialCase: o === '2plus1' ? '2pts+1lf' : '3pts+1lf', shotType: 'LF', ftAttempts: 1, ftResults: [] }); setStage('ft'); return; }
    setDraft({ ...draft, foulOutcome: 'lf', shotType: 'LF', ftAttempts: o === 'lf2' ? 2 : 3, ftResults: [] }); setStage('ft');
  };
  const shotPick = (t: string) => { const d = { ...draft, shotType: t, actionType: 'tir' }; if (t === 'LF') { d.ftAttempts = d.ftAttempts || 2; d.ftResults = []; } setDraft(d); };
  const ftn = (n: number) => setDraft({ ...draft, ftAttempts: n, ftResults: [] });
  const ftSet = (made: boolean) => {
    const res = [...(draft.ftResults || [])]; if (res.length >= draft.ftAttempts) return;
    res.push(made ? 'made' : 'miss');
    const d = { ...draft, ftResults: res };
    if (res.length >= draft.ftAttempts) { d.ftMade = res.filter((r) => r === 'made').length; afterFT(d); } else setDraft(d);
  };
  const resultPick = (r: string) => {
    const d = { ...draft, shotResult: r, actionType: 'tir' };
    if (d.context === 'defense') { if (r === 'made') commit(d); else { setDraft(d); setStage('rebound'); } return; }
    setDraft(d); setStage('zone');
  };
  const special = (s: string) => {
    const d = { ...draft, actionType: 'tir', specialCase: s === '2pts1lf' ? '2pts+1lf' : '3pts+1lf', shotType: s === '2pts1lf' ? '2PTS' : '3PTS', shotResult: 'made', ftAttempts: 1, ftMade: 0, ftResults: [] };
    setDraft(d); setStage('zone');
  };
  const courtClick = (e: MouseEvent<HTMLDivElement>) => {
    if (stage !== 'zone') return;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const d = { ...draft, courtX: (e.clientX - r.left) / r.width, courtY: (e.clientY - r.top) / r.height };
    if (d.shotResult === 'missed') { setDraft(d); setStage('rebound'); } else { setDraft(d); setStage('assist'); }
  };
  const rebPick = (id: string) => { const d = { ...draft, reboundType: id }; if (isMyRebound(d.context, id)) { setDraft(d); } else commit(d); };
  const rebWho = (id: string) => commit({ ...draft, reboundPlayerId: id });
  const passer = (id: string) => { if (id) afterPD({ ...draft, assist: true, assistPlayerId: id }); else afterPD({ ...draft, assist: false, assistPlayerId: null }); };
  const themBtn = (d: number) => setPerQ((p) => { const cur = p[q] || { us: 0, them: 0 }; return { ...p, [q]: { ...cur, them: Math.max(0, cur.them + d) } }; });

  const stageForCorrection = (a: Draft) => {
    if (!a.context) return 'context';
    if (a.actionType === 'tir') return a.shotType ? 'result' : 'action';
    if (a.actionType === 'faute-commise' || a.actionType === 'faute-provoquee') return 'faute';
    if (a.actionType === 'touche') return 'inbound';
    if (a.actionType) return 'action';
    if (a.playerId) return 'action';
    if (a.tempsFort) return a.context === 'defense' ? 'action' : 'player';
    return 'temps';
  };

  const restoreDraftFromAction = (a: StatA) => {
    setDraft({
      context: a.context,
      inbound: a.inbound,
      tempsFort: a.tempsFort,
      coverage: a.coverage,
      playerId: a.playerId,
      actionType: a.actionType,
      shotType: a.shotType,
      shotResult: a.shotResult,
      specialCase: a.specialCase,
      ftAttempts: a.ftAttempts,
      ftMade: a.ftMade,
      ftResults: a.ftResults,
      zone: a.zone,
      courtX: a.courtX,
      courtY: a.courtY,
      reboundType: a.reboundType,
      reboundPlayerId: a.reboundPlayerId,
      assist: a.assist,
      assistPlayerId: a.assistPlayerId,
      foulOutcome: a.foulOutcome,
    });

    setStage(stageForCorrection(a));
  };

  const subtractActionFromScore = (a: StatA) => {
    setPerQ((p) => {
      const cur = p[a.q] || { us: 0, them: 0 };

      return {
        ...p,
        [a.q]: {
          us: Math.max(0, cur.us - ptsOf(a)),
          them: Math.max(0, cur.them - themPtsOf(a)),
        },
      };
    });
  };

  const undo = () => {
    if (!actions.length) return;

    const a = actions[actions.length - 1];

    setActions((arr) => arr.slice(0, -1));
    subtractActionFromScore(a);
    restoreDraftFromAction(a);
    flash('Dernière action annulée et replacée en correction');

    // Correction TEMPS RÉEL (non bloquante) : retire la ligne + resync boxscore.
    const matchId = liveMatchIdRef.current;
    const teamId = liveTeamIdRef.current;
    if (matchId && teamId) {
      deleteLiveAction({ matchId, clientActionId: a.id }).catch(() => {});
      const nextActions = actions.filter((x) => x.id !== a.id);
      const cur = perQ[a.q] || { us: 0, them: 0 };
      const nextPerQ = { ...perQ, [a.q]: { us: cur.us - ptsOf(a), them: cur.them - themPtsOf(a) } };
      syncLiveAggregates(nextActions, onCourt, nextPerQ);
    }
  };

  const removeAction = (id: string) => {
    const a = actions.find((x) => x.id === id);
    if (!a) return;

    setActions((arr) => arr.filter((x) => x.id !== id));
    subtractActionFromScore(a);
    flash('Action supprimée de l’historique');

    // Correction TEMPS RÉEL (non bloquante) : retire la ligne + resync boxscore.
    const matchId = liveMatchIdRef.current;
    const teamId = liveTeamIdRef.current;
    if (matchId && teamId) {
      deleteLiveAction({ matchId, clientActionId: a.id }).catch(() => {});
      const nextActions = actions.filter((x) => x.id !== id);
      const cur = perQ[a.q] || { us: 0, them: 0 };
      const nextPerQ = { ...perQ, [a.q]: { us: cur.us - ptsOf(a), them: cur.them - themPtsOf(a) } };
      syncLiveAggregates(nextActions, onCourt, nextPerQ);
    }
  };
  const resetDraft = () => {
    setDraft(emptyDraft());
    setStage('context');
  };

  const swap = (outId: string) => {
    if (!subSel) {
      flash('Choisis un remplaçant');
      return;
    }

    setOnCourt((arr) => arr.map((x) => (x === outId ? subSel : x)));
    setSubSel(null);
    flash('Changement effectué');
  };

  const finishMatch = async () => {
    if (!actions.length) {
      flash('Aucune action à enregistrer');
      return;
    }

    if (saving) return;

    const selectedTeam =
      teams.find((team) => team.id === activeTeamId) ||
      teams.find((team) => team.id === teamId) ||
      teams.find((team) => team.name === teamName);

    const realTeamId = String(selectedTeam?.id || activeTeamId || teamId || '').trim();

    console.log('DEBUG TEAMS =', teams);
    console.log('DEBUG ACTIVE TEAM ID =', activeTeamId);
    console.log('DEBUG TEAM ID STATE =', teamId);
    console.log('DEBUG TEAM NAME STATE =', teamName);
    console.log('DEBUG SELECTED TEAM =', selectedTeam);
    console.log('DEBUG REAL TEAM ID =', realTeamId);
    console.log('DEBUG IS UUID =', isSupabaseUuid(realTeamId));

    if (!isSupabaseUuid(realTeamId)) {
      flash(
        "Impossible d’enregistrer : choisis une vraie équipe Supabase avant de terminer le match."
      );
      setScreen('setup');
      return;
    }

    const ok = window.confirm(
      "Terminer le match et l'enregistrer dans les stats de l'équipe ?"
    );

    if (!ok) return;

    setSaving(true);

    try {
      const playedIds = new Set<string>();

      actions.forEach((action) => {
        (action.lineup || []).forEach((id) => playedIds.add(id));
      });

      onCourt.forEach((id) => playedIds.add(id));

      const box = computeBox(actions, roster);
      const byId: Record<string, any> = {};

      box.forEach((line: any) => {
        byId[line.p.id] = line;
      });

      const lines = roster.map((player) => {
        const line = byId[player.id] || {};

        return {
          playerId: player.id,
          present: playedIds.has(player.id),
          minutesSeconds: minutesByPlayer[player.id] || 0,
          p2m: line.p2m || 0,
          p2a: line.p2a || 0,
          p3m: line.p3m || 0,
          p3a: line.p3a || 0,
          ftm: line.ftm || 0,
          fta: line.fta || 0,
          offReb: line.offReb || 0,
          defReb: line.defReb || 0,
          ast: line.ast || 0,
          stl: line.stl || 0,
          blk: line.blk || 0,
          to: line.to || 0,
          pf: line.pf || 0,
        };
      });

      const us = sumPerQ('us');
      const them = sumPerQ('them');
      const result: 'V' | 'N' | 'D' = us > them ? 'V' : us < them ? 'D' : 'N';

      console.log('TEAM ID ENVOYÉ =', realTeamId);
      console.log('TEAM NAME =', selectedTeam?.name || teamName);
      console.log('ROSTER =', roster);
      console.log('LINES =', lines);
      console.log('ACTIONS =', actions);

      const payload = {
        teamId: realTeamId,
        opponent: opponent || 'Adversaire',
        date,
        us,
        them,
        result,
        perQ,
        lines,
        actions,
        home,
      } as any;

      // Le match a été alimenté en TEMPS RÉEL : finishMatch FINALISE (score
      // final + statut 'finished' + boxscore), il ne recrée pas tout. Si aucun
      // match live n'a pu être créé au démarrage (ex. ensureLiveMatch échoué),
      // on retombe sur saveLiveMatch (filet : écriture complète en une fois).
      const activeMatchId = liveMatchIdRef.current;
      const activeTeamForWrite = liveTeamIdRef.current || realTeamId;

      const res = activeMatchId && !activeMatchId.startsWith('local_')
        ? await finalizeLiveMatch({ matchId: activeMatchId, teamId: activeTeamForWrite, payload })
        : await saveLiveMatch(payload);

      console.log('SAVE RESULT =', res);

      if (res.ok) {
        flash('Match enregistré ✓');
        setLiveMatch(null, null);
        setScreen('box');
      } else {
        console.error('finalize/saveLiveMatch a renvoyé une erreur:', res.error);
        flash('Enregistrement échoué — utilise ⬇ CSV / JSON pour exporter');
        setScreen('box');
      }
    } catch (error: any) {
      const msg =
        error?.message ||
        error?.error_description ||
        error?.details ||
        error?.hint ||
        error?.code ||
        (typeof error === 'string' ? error : JSON.stringify(error));

      console.error('Erreur finishMatch:', msg, error);
      flash('Erreur : ' + (msg || 'enregistrement') + ' — exporte via ⬇ CSV / JSON');
      setScreen('box');
    } finally {
      setSaving(false);
    }
  };

  /* -------- export du match (CSV + JSON, indépendant de Supabase) -------- */
  const triggerDownload = (filename: string, content: string, mime: string) => {
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error('Export download error:', e);
      flash('Export impossible sur ce navigateur');
    }
  };

  const safeName = (s: string) => (s || 'match').replace(/[^a-z0-9_-]+/gi, '_');

  const exportMatchCSV = () => {
    if (!actions.length) { flash('Aucune action à exporter'); return; }
    const box = computeBox(actions, roster);
    const ptsOfLine = (l: any) => l.p2m * 2 + l.p3m * 3 + l.ftm;
    const us = sumPerQ('us');
    const them = sumPerQ('them');

    const lines: string[] = [];
    lines.push(`Équipe;${teamName}`);
    lines.push(`Adversaire;${opponent || 'Adversaire'}`);
    lines.push(`Date;${date}`);
    lines.push(`Lieu;${home ? 'Domicile' : 'Extérieur'}`);
    lines.push(`Score;${us}-${them}`);
    Object.keys(perQ).forEach((k) => lines.push(`${periodLabel(+k)};${perQ[+k].us}-${perQ[+k].them}`));
    lines.push('');
    lines.push(['Num', 'Joueur', 'MIN', 'PTS', '2PTM', '2PTA', '3PTM', '3PTA', 'LFM', 'LFA', 'RO', 'RD', 'RT', 'PD', 'INT', 'CT', 'BP', 'F'].join(';'));
    box.forEach((l: any) => {
      lines.push([
        l.p.num, l.p.name, fmt(minutesByPlayer[l.p.id] || 0), ptsOfLine(l), l.p2m, l.p2a, l.p3m, l.p3a, l.ftm, l.fta,
        l.offReb || 0, l.defReb || 0, (l.offReb || 0) + (l.defReb || 0),
        l.ast, l.stl, l.blk, l.to, l.pf,
      ].join(';'));
    });

    triggerDownload(
      `stats_${safeName(teamName)}_vs_${safeName(opponent)}_${date}.csv`,
      '\uFEFF' + lines.join('\r\n'),
      'text/csv;charset=utf-8;',
    );
    flash('Export CSV téléchargé ✓');
  };

  const exportMatchJSON = () => {
    if (!actions.length) { flash('Aucune action à exporter'); return; }
    const us = sumPerQ('us');
    const them = sumPerQ('them');
    const payload = {
      teamId, teamName, opponent: opponent || 'Adversaire', date,
      home,
      score: { us, them }, perQ,
      minutesByPlayer,
      box: computeBox(actions, roster),
      actions,
      exportedAt: new Date().toISOString(),
    };
    triggerDownload(
      `match_${safeName(teamName)}_${date}.json`,
      JSON.stringify(payload, null, 2),
      'application/json',
    );
    flash('Export JSON téléchargé ✓');
  };

  const scoreUs = sumPerQ('us');
  const scoreThem = sumPerQ('them');

  /* ============================ Rendu ============================ */
  if (screen === 'setup') {
    return (
      <div className="ps-root">
        <div className="setup"><div className="setup-card">
          <div className="setup-head"><div className="kicker">PRISE DE STATS · NOUVEAU MATCH</div><h1>Créer le match</h1></div>
          <div className="setup-body">
            <div className="row">
              <label className="fld"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="fld"><span>Équipe Supabase</span>
                <select value={teamId} onChange={(e) => { setTeamId(e.target.value); setStarters([]); }}>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="fld"><span>Adversaire</span><input placeholder="Nom de l'adversaire" value={opponent} onChange={(e) => setOpponent(e.target.value)} /></label>
              <label className="fld venue-field">
                <span>Lieu du match</span>
                <div className="venue-switch">
                  <button type="button" className={home ? 'on' : ''} onClick={() => setHome(true)}>🏠 Domicile</button>
                  <button type="button" className={!home ? 'on' : ''} onClick={() => setHome(false)}>🚌 Extérieur</button>
                </div>
              </label>
            </div>
            <div>
              <p className="sub-h">5 majeur <span className="cnt">— {starters.length}/5 sélectionnés</span></p>
              <div className="starters">
                {setupRoster.map((p) => (
                  <button key={p.id} type="button" className={`scard ${starters.includes(p.id) ? 'on' : ''}`} onClick={() => toggleStarter(p.id)}>
                    <Av p={p} /><span className="n">{p.num}</span><span>{p.name}<br /><small>{p.pos}</small></span>
                  </button>
                ))}
                {setupRoster.length === 0 && <span className="cnt">Aucun joueur Supabase dans cette équipe.</span>}
              </div>
            </div>
          </div>
          <div className="setup-foot"><button className="btn primary" disabled={!canStart} onClick={startMatch}>Démarrer la saisie →</button></div>
        </div></div>
        <Style />
      </div>
    );
  }

  const liveCourt = stage === 'zone';
  const navIdx = STAGE_NAV[stage] ?? 0;

  return (
    <div className="ps-root">
      <header className="h">
        <div className="h-l"><div className="h-ic">📊</div><div><div className="h-tt">PRISE DE STATS LIVE</div><div className="h-sub">{screen === 'box' ? 'Box-score' : NAV[navIdx]}</div></div></div>
        <div className="h-c">
          <div className="team"><div className="logo">{teamName.slice(0, 2)}</div><span>{teamName}</span></div>
          <div className="score us">{scoreUs}</div>
          <div className="clockbox">
            <div className="qtag">{periodLabel(q)}</div><div className="clk">{fmt(secs)}</div>
            <div className="clk-ctrl">
              <button className="mini" onClick={() => changeQ(-1)}>◀</button>
              <button className="mini play" onClick={() => setRunning((r) => !r)}>{running ? '⏸' : '▶'}</button>
              <button className="mini" onClick={() => changeQ(1)}>▶</button>
            </div>
          </div>
          <div className="score them"><button className="mini" onClick={() => themBtn(-1)}>–</button><span>{scoreThem}</span><button className="mini" onClick={() => themBtn(1)}>+</button></div>
          <div className="team"><span>{opponent || 'ADVERSAIRE'}</span><div className="logo">{(opponent || 'AD').slice(0, 2).toUpperCase()}</div></div>
        </div>
        <div className="h-r">
          <button
            className="ghost"
            onClick={finishMatch}
            disabled={saving}
            title="Enregistrer le match dans Supabase"
          >
            {saving ? '⏳ …' : '🏁 Terminer'}
          </button>

          <button
            className="ghost"
            onClick={exportMatchCSV}
            title="Exporter le box-score en CSV (Excel)"
          >
            ⬇ CSV
          </button>

          <button
            className="ghost"
            onClick={exportMatchJSON}
            title="Exporter toutes les données du match en JSON"
          >
            ⬇ JSON
          </button>

          <button
            className={`ghost ${screen === 'box' ? 'on' : ''}`}
            onClick={() => setScreen((s) => (s === 'box' ? 'live' : 'box'))}
          >
            📊 Box-score
          </button>

          <button className="ghost" onClick={() => setScreen('setup')}>
            ⚙ Match
          </button>
        </div>
      </header>

      <div className="qstrip">{Object.keys(perQ).map((k) => <span key={k} className={`qbox ${+k === q ? 'cur' : ''}`}>{periodLabel(+k)} <b>{perQ[+k].us}-{perQ[+k].them}</b></span>)}</div>

      {screen === 'box' ? (
        <BoxView actions={actions} roster={roster} teamId={activeTeamId || teamId} />
      ) : (
        <>
          <nav className="steps">
            {NAV.map((s, i) => (
              <span
                key={i}
                className={`step ${i === navIdx ? 'active' : i < navIdx ? 'done' : ''}`}
              >
                <span className="n">{i + 1}</span>
                {s}
              </span>
            ))}
          </nav>

          <div className="liveFrame">
            <div className="wrap">
              <aside className="pane historyPane">
                <h3>Historique</h3>
                <div className="hist">
                  {actions.length === 0 && <div className="hist-empty">Aucune action.</div>}

                  {actions
                    .slice()
                    .reverse()
                    .map((a) => {
                      const d = describe(a, find);
                      const p = find(a.playerId);

                      return (
                        <div className="hrow" key={a.id}>
                          <span className="htime">{a.clock}</span>
                          <span className={`badge ${d.c}`}>{d.b}</span>
                          <span className="hbody">
                            <b>{p ? `#${p.num} ${p.name}` : '—'}</b>
                            <em>{d.t}</em>
                          </span>
                          <button
                            className="hist-edit"
                            onClick={() => {
                              setActions((arr) => arr.filter((x) => x.id !== a.id));
                              subtractActionFromScore(a);
                              restoreDraftFromAction(a);
                              flash('Action ouverte en correction');

                              // Retire la ligne côté Supabase (re-créée au prochain
                              // commit, même client_action_id → upsert idempotent).
                              const mId = liveMatchIdRef.current;
                              const tId = liveTeamIdRef.current;
                              if (mId && tId) {
                                deleteLiveAction({ matchId: mId, clientActionId: a.id }).catch(() => {});
                                const nextActions = actions.filter((x) => x.id !== a.id);
                                const cur = perQ[a.q] || { us: 0, them: 0 };
                                const nextPerQ = { ...perQ, [a.q]: { us: cur.us - ptsOf(a), them: cur.them - themPtsOf(a) } };
                                syncLiveAggregates(nextActions, onCourt, nextPerQ);
                              }
                            }}
                          >
                            ↩
                          </button>
                          <button className="hist-del" onClick={() => removeAction(a.id)}>
                            ✕
                          </button>
                        </div>
                      );
                    })}
                </div>
              </aside>

              <section className="pane center">
                {stage !== 'context' && (
                  <button
                    className="backBtn"
                    onClick={() => {
                      const order = [
                        'context',
                        'inbound',
                        'temps',
                        'coverage',
                        'player',
                        'action',
                        'faute',
                        'result',
                        'ft',
                        'zone',
                        'rebound',
                        'assist',
                      ];

                      const currentIndex = order.indexOf(stage);

                      if (currentIndex > 0) setStage(order[currentIndex - 1]);
                    }}
                  >
                    ← Retour
                  </button>
                )}

                {renderStage()}
              </section>

              <aside className="pane courtPane">
                <h3>Terrain</h3>
                <div className={`courtbox ${liveCourt ? 'live' : ''}`} onClick={courtClick}>
                  <Court />
                  {actions
                    .filter((a) => a.courtX != null)
                    .map((a) => (
                      <span
                        key={a.id}
                        className="shotdot"
                        style={{
                          left: `${(a.courtX as number) * 100}%`,
                          top: `${(a.courtY as number) * 100}%`,
                          background: a.shotResult === 'made' ? 'var(--green)' : 'var(--red)',
                        }}
                      />
                    ))}
                  {draft.courtX != null && (
                    <span
                      className={`mark ${draft.shotResult === 'made' ? 'made' : 'miss'}`}
                      style={{
                        left: `${draft.courtX * 100}%`,
                        top: `${(draft.courtY as number) * 100}%`,
                      }}
                    />
                  )}
                </div>
                <p className="courthint">
                  {liveCourt ? 'Clique sur le terrain' : "Terrain actif à l'étape Où ?"}
                </p>
              </aside>
            </div>

            <div className="bottom">
              <div className="pane playersPane">
                <div className="playersHead">
                  <h3>Joueurs</h3>
                  <button
                    className={`ghost ${subSel !== null ? 'on' : ''}`}
                    onClick={() => setSubSel((s) => (s === null ? '' : null))}
                  >
                    ⇄ Changements
                  </button>
                </div>

                <div className="playersGrid">
                  <div className="floor">
                    <div className="miniTitle">Terrain</div>
                    {floor.map((p) => (
                      <div
                        key={p.id}
                        className={`fc ${draft.playerId === p.id ? 'active' : ''} ${subSel !== null ? 'swap' : ''}`}
                        onClick={subSel !== null ? () => swap(p.id) : undefined}
                      >
                        <Av p={p} />
                        <span className="num">{p.num}</span>
                        <span className="nm">{p.name}</span>
                        <span className="pos">{p.pos}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bench">
                    <div className="miniTitle">Remplaçants</div>
                    {bench.map((p) => (
                      <button
                        key={p.id}
                        className={`bchip ${subSel === p.id ? 'sel' : ''}`}
                        onClick={() => setSubSel(p.id)}
                      >
                        <Av p={p} /> #{p.num} {p.name}
                      </button>
                    ))}
                    {bench.length === 0 && <span className="hist-empty">Banc vide.</span>}
                  </div>
                </div>
              </div>

              <div className="pane quickPane">
                <h3>Actions rapides</h3>
                <div className="quick">
                  <button className="qbtn" onClick={undo}>
                    ↺ Annuler
                    <small>Dernière action</small>
                  </button>
                  <button className="qbtn" onClick={resetDraft}>
                    🗑 Reset
                    <small>Action en cours</small>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {toast && <div className="toast show">{toast}</div>}
      <Style />
    </div>
  );

  /* ---------- rendu d'une étape ---------- */
  function head(t: string, s?: string) { return <div className="wzhead"><div className="wzstep">{NAV[navIdx].toUpperCase()}</div><div className="wztitle">{t}</div>{s && <div className="wzsub">{s}</div>}</div>; }
  function tileGrid(arr: { id: string; label: string; ic?: string }[], sel: string, fn: (id: string) => void) {
    return <div className="grid c3">{arr.map((o) => <button key={o.id} className={`bt ${sel === o.id ? 'active' : ''}`} onClick={() => fn(o.id)}><span className="ic">{o.ic || '•'}</span><span className="lbl">{o.label}</span></button>)}</div>;
  }
  function players3(sel: string | null, fn: (id: string) => void) {
    return <div className="grid c3">{floor.map((p) => <button key={p.id} className={`pl ${sel === p.id ? 'active' : ''}`} onClick={() => fn(p.id)}><Av p={p} /><span className="num">{p.num}</span><span className="nm">{p.name}</span><span className="pos">{p.pos}</span></button>)}</div>;
  }
  function ftSeq() {
    const done = draft.ftResults || [];
    return (<>
      <div className="sublbl">Clique chaque lancer dans l'ordre : marqué / loupé</div>
      <div className="seg">{Array.from({ length: draft.ftAttempts }).map((_, i) => { const r = done[i]; const cur = i === done.length; return <button key={i} className={`segb ${r === 'made' ? 'active' : ''}`} disabled style={{ outline: cur ? '2px solid var(--gold)' : 'none', opacity: r === 'miss' ? 0.55 : 1 }}>LF{i + 1}{r ? (r === 'made' ? ' ✓' : ' ✗') : ''}</button>; })}</div>
      {done.length < draft.ftAttempts && <><button className="res made" onClick={() => ftSet(true)}>✓ LF{done.length + 1} marqué</button><button className="res miss" onClick={() => ftSet(false)}>✕ LF{done.length + 1} loupé</button></>}
    </>);
  }

  function renderStage() {
    switch (stage) {
      case 'context':
        return <>{head('Contexte de possession', 'Choix uniquement au début du quart-temps')}<div className="grid c2 big">
          <button className={`bt ${draft.context === 'attaque' ? 'active' : ''}`} onClick={() => ctxPick('attaque')}><span className="ic">↗</span><span className="lbl">ATTAQUE</span></button>
          <button className={`bt def ${draft.context === 'defense' ? 'active' : ''}`} onClick={() => ctxPick('defense')}><span className="ic">🛡</span><span className="lbl">DÉFENSE</span></button>
        </div></>;
      case 'inbound':
        return <>{head('Remise en jeu', 'Sortie de balle / faute → on remet en jeu')}<div className="grid c2 big">
          <button className={`bt ${draft.inbound === 'slob' ? 'active' : ''}`} onClick={() => inboundPick('slob')}><span className="ic">↔</span><span className="lbl">SLOB<br /><small className="mut">Côté</small></span></button>
          <button className={`bt ${draft.inbound === 'blob' ? 'active' : ''}`} onClick={() => inboundPick('blob')}><span className="ic">⎯</span><span className="lbl">BLOB<br /><small className="mut">Ligne de fond</small></span></button>
        </div></>;
      case 'temps':
        return <>{head('Temps fort', 'Type de jeu')}{tileGrid(TEMPS, draft.tempsFort, tempsPick)}</>;
      case 'coverage':
        return <>{head("Défense sur l'écran", 'Comment défend-on le pick ?')}<div className="grid c3">{COVERAGES.map((c) => <button key={c.id} className={`chip ${draft.coverage === c.id ? 'active' : ''}`} onClick={() => covPick(c.id)}>{c.label}</button>)}</div></>;
      case "player": {
  const canSkip =
    draft.context === "defense" &&
    CAN_TAG_PLAYER_DEF.includes(draft.actionType);

  return (
    <>
      {head(
        "Joueur",
        draft.actionType === "faute-commise"
          ? "Qui a commis la faute ?"
          : draft.context === "defense"
            ? "Qui réalise l'action défensive ?"
            : "Qui réalise l'action ?"
      )}

      {players3(draft.playerId, playerPick)}

      {canSkip && (
        <button
          className="chip"
          style={{ marginTop: 10, width: "100%" }}
          onClick={() => commit({ ...draft, playerId: null })}
        >
          Sans précision
        </button>
      )}
    </>
  );
}
      case 'action': {
        const opts = draft.context === 'defense' ? DEF_ACTIONS : ATT_ACTIONS;
        return <>{head("Type d'action", draft.context === 'defense' ? 'Action défensive' : 'Action offensive')}{tileGrid(opts, draft.actionType, actionPick)}</>;
      }
      case 'faute':
        return draft.actionType === 'faute-commise'
          ? <>{head('Faute commise', 'LF concédés, and-one ou touche ?')}<div className="grid c3"><button className="chip" onClick={() => foulPick('touche')}>Touche</button><button className="chip" onClick={() => foulPick('lf2')}>2 LF</button><button className="chip" onClick={() => foulPick('lf3')}>3 LF</button><button className="chip" onClick={() => foulPick('2plus1')}>2 + 1</button><button className="chip" onClick={() => foulPick('3plus1')}>3 + 1</button></div></>
          : <>{head('Faute provoquée', 'Touche ou lancers francs ?')}<div className="grid c3"><button className="chip" onClick={() => foulPick('touche')}>Touche</button><button className="chip" onClick={() => foulPick('lf2')}>2 LF</button><button className="chip" onClick={() => foulPick('lf3')}>3 LF</button></div></>;
      case 'result':
        return <>{head('Résultat', 'Type de tir puis issue')}<div className="seg">{['LF', '2PTS', '3PTS'].map((t) => <button key={t} className={`segb ${draft.shotType === t ? 'active' : ''}`} onClick={() => shotPick(t)}>{t}</button>)}</div>
          {draft.shotType === 'LF' ? <><div className="sublbl">Nombre de lancers</div><div className="seg">{[1, 2, 3].map((n) => <button key={n} className={`segb ${draft.ftAttempts === n ? 'active' : ''}`} onClick={() => ftn(n)}>{n} LF</button>)}</div>{draft.ftAttempts > 0 && ftSeq()}</>
            : draft.shotType ? <><button className="res made" onClick={() => resultPick('made')}>✓ MARQUÉ</button><button className="res miss" onClick={() => resultPick('missed')}>✕ RATÉ</button>{draft.context !== 'defense' && <><div className="sublbl">Cas particulier</div><div className="grid c2"><button className="chip" onClick={() => special('2pts1lf')}>2 PTS + 1 LF</button><button className="chip" onClick={() => special('3pts1lf')}>3 PTS + 1 LF</button></div></>}</>
              : <div className="tip">Choisissez LF, 2 PTS ou 3 PTS.</div>}
        </>;
      case 'ft':
        return <>{head('Lancers francs', (draft.specialCase === '2pts+1lf' || draft.specialCase === '3pts+1lf') ? 'Lancer franc bonus (and-one)' : draft.actionType === 'faute-commise' ? `${draft.ftAttempts} LF adverses — dans l'ordre` : `${draft.ftAttempts} LF — dans l'ordre`)}{ftSeq()}</>;
      case 'zone':
        return <>{head('Où ?', 'Cliquez directement sur le terrain (shot chart)')}<div className="tip">Pas d'étiquette de zone : cliquez l'emplacement exact du tir sur le terrain à droite.</div></>;
      case 'rebound': {
        const reb: [string, string][] = [['off', 'Rebond offensif'], ['def', 'Rebond défensif'], ['touche-pour', 'Touche pour'], ['touche-contre', 'Touche contre']];
        return <>{head('Conséquence', 'Rebond sur tir manqué')}<div className="grid c2">{reb.map(([id, l]) => <button key={id} className={`chip ${draft.reboundType === id ? 'active' : ''}`} onClick={() => rebPick(id)}>{l}</button>)}</div>
          {draft.reboundType && isMyRebound(draft.context, draft.reboundType) && <><div className="sublbl">Qui prend le rebond ?</div>{players3(draft.reboundPlayerId, rebWho)}<button className="chip" style={{ marginTop: 8 }} onClick={() => commit(draft)}>Sans précision →</button></>}
        </>;
      }
      case 'assist': {
        const others = floor.filter((p) => p.id !== draft.playerId);
        return <>{head('Passe décisive', draft.actionType === 'faute-provoquee' ? 'Action ayant amené la faute' : 'Panier marqué')}<div className="sublbl">Qui a fait la passe décisive ?</div>
          <div className="grid c3">{others.map((p) => <button key={p.id} className="pl sm" onClick={() => passer(p.id)}><Av p={p} /><span className="num">{p.num}</span><span className="nm">{p.name}</span></button>)}
            <button className="pl sm" onClick={() => passer('')}><Av /><span className="num">—</span><span className="nm">Personne</span></button></div></>;
      }
      default: return null;
    }
  }
}

/* ============================ Box-score ============================ */
function BoxView({ actions, roster, teamId }: { actions: StatA[]; roster: Player[]; teamId?: string }) {
  const tags = useLivestatTags(teamId);
  const box = computeBox(actions, roster);
  const pts = (l: any) => l.p2m * 2 + l.p3m * 3 + l.ftm;

  const tot: any = box.reduce((t: any, l: any) => {
    [
      "p2m",
      "p2a",
      "p3m",
      "p3a",
      "ftm",
      "fta",
      "offReb",
      "defReb",
      "ast",
      "stl",
      "blk",
      "to",
      "pf",
    ].forEach((k) => {
      t[k] = (t[k] || 0) + (l[k] || 0);
    });

    t.pts = (t.pts || 0) + pts(l);

    return t;
  }, {});

  const A = computeAnalytics(actions, roster);
  const Sec = ({ t }: { t: string }) => <div className="boxsec">{t}</div>;
  const Card = ({ t, v, c }: { t: string; v: any; c?: string }) => (
    <div className="boxcard">
      <div className="bt-lbl2">{t}</div>
      <div className="bt-val" style={{ color: c || "var(--txt)" }}>
        {v}
      </div>
    </div>
  );

  return (
    <div className="box">
      <Sec t="Box-score joueurs" />

      <table>
        <thead>
          <tr>
            <th className="l">Joueur</th>
            <th>PTS</th>
            <th>2PTS</th>
            <th>3PTS</th>
            <th>LF</th>
            <th>RO</th>
            <th>RD</th>
            <th>RT</th>
            <th>PD</th>
            <th>INT</th>
            <th>CT</th>
            <th>BP</th>
            <th>F</th>
          </tr>
        </thead>

        <tbody>
          {box.map((l: any) => (
            <tr key={l.p.id}>
              <td className="l">
                #{l.p.num} {l.p.name}
              </td>
              <td>
                <b>{pts(l)}</b>
              </td>
              <td>
                {l.p2m}/{l.p2a}
              </td>
              <td>
                {l.p3m}/{l.p3a}
              </td>
              <td>
                {l.ftm}/{l.fta}
              </td>
              <td>{l.offReb || 0}</td>
              <td>{l.defReb || 0}</td>
              <td>{(l.offReb || 0) + (l.defReb || 0)}</td>
              <td>{l.ast}</td>
              <td>{l.stl}</td>
              <td>{l.blk}</td>
              <td>{l.to}</td>
              <td>{l.pf}</td>
            </tr>
          ))}

          {box.length === 0 && (
            <tr>
              <td className="l" colSpan={13}>
                Aucune stat pour le moment.
              </td>
            </tr>
          )}

          {box.length > 0 && (
            <tr className="tot">
              <td className="l">TOTAL ÉQUIPE</td>
              <td>{tot.pts || 0}</td>
              <td>
                {tot.p2m || 0}/{tot.p2a || 0}
              </td>
              <td>
                {tot.p3m || 0}/{tot.p3a || 0}
              </td>
              <td>
                {tot.ftm || 0}/{tot.fta || 0}
              </td>
              <td>{tot.offReb || 0}</td>
              <td>{tot.defReb || 0}</td>
              <td>{(tot.offReb || 0) + (tot.defReb || 0)}</td>
              <td>{tot.ast || 0}</td>
              <td>{tot.stl || 0}</td>
              <td>{tot.blk || 0}</td>
              <td>{tot.to || 0}</td>
              <td>{tot.pf || 0}</td>
            </tr>
          )}
        </tbody>
      </table>

      <Sec t="Possessions & stops" />
      <div className="cardrow">
        <Card t="Possessions offensives" v={A.offPoss} />
        <Card t="Possessions défensives" v={A.defPoss} />
        <Card t="Stops d'affilé (max)" v={A.maxStreak} c="var(--green)" />
        <Card t="Stops d'affilé (en cours)" v={A.curStreak} c="var(--green)" />
      </div>
      <div className="tip" style={{ marginTop: 8 }}>
        Possession = de la récupération du ballon jusqu'à ce que l'adversaire
        le récupère. Un « stop » = possession défensive sans point adverse
        encaissé.
      </div>

      <Sec t="Box-score des temps forts par joueur (points)" />

      {A.tfUsed.length ? (
        <div style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th className="l">Joueur</th>
                {A.tfUsed.map((t) => (
                  <th key={t.id}>{tags.emoji(t.id)} {tags.label(t.id)}</th>
                ))}
                <th>Tot.</th>
              </tr>
            </thead>

            <tbody>
              {box.map((l: any) => {
                const row = A.tfMatrix[l.p.id] || {};
                const tt = A.tfUsed.reduce((s, t) => s + (row[t.id] || 0), 0);

                return (
                  <tr key={l.p.id}>
                    <td className="l">
                      #{l.p.num} {l.p.name}
                    </td>
                    {A.tfUsed.map((t) => (
                      <td key={t.id}>{row[t.id] || 0}</td>
                    ))}
                    <td>
                      <b>{tt}</b>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tip">Aucune action rattachée à un temps fort.</div>
      )}

      <Sec t="Analyse des 5 sur le terrain (lineups)" />

      {A.lineups.length ? (
        <table>
          <thead>
            <tr>
              <th className="l">5 sur le terrain</th>
              <th>Actions</th>
              <th>Pts pour</th>
              <th>Pts contre</th>
              <th>+/-</th>
            </tr>
          </thead>

          <tbody>
            {A.lineups
              .slice()
              .sort(
                (a: any, b: any) =>
                  b.us - b.them - (a.us - a.them)
              )
              .map((L: any, i: number) => {
                const names = L.ids
                  .map((id: string) => {
                    const p = roster.find((x) => x.id === id);
                    return p ? "#" + p.num : "?";
                  })
                  .join(" ");

                const diff = L.us - L.them;

                return (
                  <tr key={i}>
                    <td className="l">{names}</td>
                    <td>{L.n}</td>
                    <td>{L.us}</td>
                    <td>{L.them}</td>
                    <td>
                      <b
                        style={{
                          color: diff >= 0 ? "var(--green)" : "var(--red)",
                        }}
                      >
                        {diff >= 0 ? "+" : ""}
                        {diff}
                      </b>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      ) : (
        <div className="tip">Pas encore de données de lineup.</div>
      )}
    </div>
  );
}

/* ============================ Terrain ============================ */
function Court() {
  return (
    <svg
      viewBox="0 0 400 280"
      preserveAspectRatio="xMidYMid meet"
      className="courtSvg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#caa06a" />
          <stop offset="1" stopColor="#b07f3e" />
        </linearGradient>
      </defs>
      <rect width="400" height="280" fill="url(#wood)" />
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

/* ============================ Styles ============================ */
function Style() {
  return (
    <style jsx global>{`
      html,
      body,
      body > div:first-child {
        height: 100%;
      }

      body.prise-stats-fullscreen {
        overflow: hidden !important;
      }

      body.prise-stats-fullscreen > header,
      body.prise-stats-fullscreen > footer,
      body.prise-stats-fullscreen .site-header,
      body.prise-stats-fullscreen .site-footer,
      body.prise-stats-fullscreen .main-header,
      body.prise-stats-fullscreen .main-footer,
      body.prise-stats-fullscreen header:not(.h),
      body.prise-stats-fullscreen footer {
        display: none !important;
      }

      .ps-root {
        --bg: #0a0e1a;
        --panel: #10131f;
        --panel2: #171b29;
        --card: #1b2030;
        --border: #2a3142;
        --txt: #eef1f7;
        --mute: #8a93a8;
        --bordeaux: #9e1b32;
        --bordeaux2: #c12a44;
        --gold: #d9a441;
        --green: #36b37e;
        --red: #e5484d;
        --blue: #3f7bd1;
        --orange: #d9772f;

        position: fixed;
        inset: 0;
        z-index: 9999;
        height: 100dvh;
        width: 100vw;
        overflow: hidden;
        background: radial-gradient(1000px 520px at 50% -10%, #141a2b 0%, var(--bg) 62%);
        color: var(--txt);
        font-family: "Roboto", "Segoe UI", system-ui, sans-serif;
        display: flex;
        flex-direction: column;
      }

      .ps-root * {
        box-sizing: border-box;
      }

      .ps-root button {
        font: inherit;
        cursor: pointer;
      }

      .ps-root h1,
      .ps-root h2,
      .ps-root h3,
      .wztitle,
      .num,
      .clk,
      .qtag {
        font-size: 13px;
        line-height: 1;
        color: var(--gold);
        font-weight: 900;
      }

      .setup {
        flex: 1;
        display: grid;
        place-items: center;
        padding: 20px;
        overflow: hidden;
      }

      .setup-card {
        width: min(820px, 100%);
        max-height: calc(100dvh - 40px);
        overflow: auto;
        background: linear-gradient(180deg, #0e1730, #0a1224);
        border: 1px solid var(--border);
        border-radius: 16px;
        box-shadow: 0 30px 80px -20px #000;
      }

      .setup-head {
        padding: 16px 20px;
        border-bottom: 1px solid var(--border);
        background: linear-gradient(90deg, rgba(158, 27, 50, 0.25), transparent);
      }

      .kicker {
        font-size: 13px;
        letter-spacing: 0.16em;
        color: var(--gold);
        font-weight: 700;
      }

      .setup-head h1 {
        font-size: 22px;
        margin: 4px 0 0;
      }

      .setup-body {
        padding: 18px 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
      }

      .fld {
        display: flex;
        flex-direction: column;
        gap: 6px;
        font-size: 12px;
        color: var(--mute);
      }

      .fld input,
      .fld select {
        background: #0a1224;
        border: 1px solid var(--border);
        border-radius: 9px;
        color: var(--txt);
        padding: 9px 10px;
        font-size: 13px;
      }

      .venue-switch {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        background: #0a1224;
        border: 1px solid var(--border);
        border-radius: 9px;
        padding: 4px;
      }

      .venue-switch button {
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: var(--mute);
        padding: 7px 8px;
        font-weight: 900;
        cursor: pointer;
      }

      .venue-switch button.on {
        background: var(--gold);
        color: #1a0f05;
      }

      .sub-h {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--gold);
        margin: 0 0 8px;
      }

      .cnt,
      .hist-empty {
        font-size: 11px;
        color: var(--mute);
      }

      .starters {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .scard {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 10px;
        color: var(--txt);
      }

      .scard.on {
        background: #1f7a44;
        border-color: #25a05a;
      }

      .scard .n {
        font-weight: 700;
        font-size: 16px;
        width: 20px;
        text-align: center;
      }

      .scard small,
      .pl .pos,
      .fc .pos {
        color: var(--gold);
      }

      .setup-foot {
        display: flex;
        justify-content: flex-end;
        padding: 14px 20px;
        border-top: 1px solid var(--border);
        background: #0e1730;
      }

      .btn,
      .ghost,
      .backBtn,
      .chip,
      .segb,
      .res,
      .qbtn,
      .bchip,
      .mini,
      .bt,
      .pl,
      .fc {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 7px 9px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 9px;
        min-width: 0;
        max-width: none;
      }

      .btn {
        padding: 10px 16px;
        border-radius: 10px;
        background: var(--panel2);
        color: var(--txt);
      }

      .btn.primary {
        background: var(--bordeaux);
        border-color: var(--bordeaux2);
        font-weight: 700;
      }

      .btn.primary:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .setup .btn.primary {
        min-width: 190px;
        max-width: none;
        min-height: 44px;
        font-size: 14px;
      }

      .h {
        flex: 0 0 15dvh;
        min-height: 118px;
        display: grid;
        grid-template-columns: 190px minmax(0, 1fr) auto;
        align-items: center;
        gap: 14px;
        padding: 10px 16px;
        border-bottom: 1px solid var(--border);
        background: #0c1020;
      }

      .h-l,
      .h-c,
      .h-r,
      .team,
      .clockbox,
      .clk-ctrl,
      .quick,
      .playersHead {
        display: flex;
        align-items: center;
      }

      .h-l {
        gap: 9px;
        min-width: 0;
      }

      .h-ic {
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: var(--panel2);
        display: grid;
        place-items: center;
        color: var(--gold);
        flex: 0 0 auto;
      }

      .h-tt {
        font-size: 13px;
        font-weight: 800;
        white-space: nowrap;
      }

      .h-sub {
        font-size: 9px;
        color: var(--mute);
        white-space: nowrap;
      }

      .h-c {
        display: grid;
        grid-template-columns: minmax(130px, 1fr) 96px 170px 118px minmax(130px, 1fr);
        align-items: center;
        justify-content: center;
        gap: 12px;
        min-width: 0;
      }

      .team {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 800;
        font-size: 10.5px;
        min-width: 0;
        overflow: hidden;
      }

      .logo {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--panel2);
        display: grid;
        place-items: center;
        font-size: 11px;
        color: var(--gold);
        flex: 0 0 auto;
      }

      .score {
        font-weight: 900;
        font-size: 34px;
        line-height: 1;
        min-width: 70px;
        text-align: center;
        border-radius: 12px;
        padding: 8px 0;
      }

      .score.us {
        background: var(--bordeaux);
        color: #fff;
      }

      .score.them {
        background: #141a2b;
        border: 1px solid var(--border);
        display: flex;
        align-items: center;
        gap: 5px;
        justify-content: center;
      }

      .clockbox {
        width: 170px;
        min-width: 170px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 11px 14px;
        border-radius: 16px;
        background: rgba(23, 27, 41, 0.72);
        border: 1px solid rgba(42, 49, 66, 0.75);
      }

      .clk {
        font-size: 34px;
        line-height: 1;
        font-weight: 900;
      }

      .qtag {
        font-size: 18px;
        color: var(--gold);
        line-height: 1;
      }

      .clk-ctrl {
        display: flex;
        gap: 3px;
        align-items: center;
        justify-content: center;
      }

      .mini {
        width: 34px;
        height: 30px;
        border-radius: 8px;
        border: 1px solid var(--border);
        background: #222a3a;
        color: var(--txt);
        font-size: 14px;
        line-height: 1;
        padding: 0;
      }

      .mini.play {
        background: var(--bordeaux);
        border-color: var(--bordeaux2);
      }

      .h-r {
        display: flex;
        justify-content: flex-end;
        flex-wrap: wrap;
        gap: 6px;
        min-width: 0;
        overflow: visible;
      }

      .ghost {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        background: var(--panel2);
        border: 1px solid var(--border);
        color: var(--txt);
        border-radius: 11px;
        padding: 11px 14px;
        font-size: 13px;
        font-weight: 800;
        line-height: 1;
        white-space: nowrap;
      }

      .ghost.on {
        border-color: var(--gold);
        color: var(--gold);
      }

      .qstrip {
        flex: 0 0 50px;
        min-height: 50px;
        display: flex;
        gap: 10px;
        justify-content: center;
        align-items: center;
        padding: 6px 12px;
        background: #0b0f1d;
        border-bottom: 1px solid var(--border);
        overflow: hidden;
      }

      .qbox {
        font-size: 17px;
        color: var(--mute);
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 9px 22px;
        line-height: 1.1;
        font-weight: 800;
      }

      .qbox b {
        color: var(--txt);
        font-size: 18px;
      }

      .qbox.cur {
        border-color: var(--gold);
      }

      .steps {
        flex: 0 0 30px;
        min-height: 30px;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: #0c1020;
        border-bottom: 1px solid var(--border);
        overflow: hidden;
      }

      .step {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 9px;
        border-radius: 16px;
        white-space: nowrap;
        color: var(--mute);
        font-size: 11px;
      }

      .step .n {
        width: 15px;
        height: 15px;
        border-radius: 50%;
        border: 1px solid currentColor;
        display: grid;
        place-items: center;
        font-size: 11px;
      }

      .step.done {
        color: var(--gold);
      }

      .step.active {
        color: #fff;
        background: var(--bordeaux);
      }

      .step.active .n {
        background: #fff;
        color: var(--bordeaux);
        border-color: #fff;
      }

      .liveFrame {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-rows: minmax(0, 1fr) 198px;
        gap: 8px;
        padding: 7px 10px 8px;
        overflow: hidden;
      }

      .wrap {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(180px, 20%) minmax(300px, 40%) minmax(300px, 40%);
        gap: 8px;
        overflow: hidden;
      }

      .pane {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }

      .pane h3 {
        flex: 0 0 auto;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mute);
        margin: 0 0 6px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        line-height: 1.1;
      }

      .historyPane,
      .courtPane,
      .center {
        height: 100%;
        max-height: 100%;
      }

      .center {
        padding: 12px 14px;
        gap: 8px;
        overflow-y: auto;
      }

      .hist {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding-right: 2px;
      }

      .hrow {
        display: grid;
        grid-template-columns: 30px auto minmax(0, 1fr) 20px 20px;
        align-items: center;
        gap: 5px;
        padding: 5px 6px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px;
      }

      .hist-edit,
      .hist-del {
        width: 20px;
        height: 20px;
        border-radius: 6px;
        border: 1px solid var(--border);
        background: #2a3142;
        color: #fff;
        font-size: 9px;
        display: grid;
        place-items: center;
        padding: 0;
      }

      .hist-edit:hover {
        background: var(--gold);
        border-color: var(--gold);
        color: #1a1a1a;
      }

      .hist-del:hover {
        background: var(--red);
        border-color: var(--red);
        color: #fff;
      }

      .htime {
        font-size: 9px;
        color: var(--mute);
      }

      .badge {
        font-size: 7.5px;
        font-weight: 800;
        padding: 2px 5px;
        border-radius: 5px;
        white-space: nowrap;
      }

      .b-made { background: #1f7a44; color: #fff; }
      .b-miss { background: var(--red); color: #fff; }
      .b-ast { background: #1f7a44; color: #fff; }
      .b-stl,
      .b-def { background: var(--blue); color: #fff; }
      .b-to { background: var(--gold); color: #1a1a1a; }
      .b-foul { background: #7a4fb5; color: #fff; }
      .b-neutral { background: #3a4256; color: #fff; }
      .b-reb { background: var(--orange); color: #fff; }
      .b-ft { background: #1f7a44; color: #fff; }

      .hbody {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .hbody b {
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .hbody em {
        font-size: 9px;
        color: var(--mute);
        font-style: normal;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .wzhead {
        text-align: center;
        flex: 0 0 auto;
      }

      .wzstep {
        font-size: 9px;
        letter-spacing: 0.14em;
        color: var(--bordeaux2);
        font-weight: 800;
      }

      .wztitle {
        font-size: 24px;
        font-weight: 800;
        margin: 2px 0;
        line-height: 1.05;
      }

      .wzsub {
        color: var(--mute);
        font-size: 13px;
        margin: 2px 0;
      }

      .grid {
        display: grid;
        gap: 12px;
        width: 100%;
        min-height: 0;
        align-content: start;
        grid-auto-rows: auto;
      }

      .c2 {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .c3 {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }

      .bt {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        width: 100%;
        min-width: 0;
        max-width: none;
        min-height: 120px;
        height: 120px;
        padding: 18px 16px;
        background: var(--card);
        border-radius: 18px;
        color: var(--txt);
        transition: 0.12s;
        overflow: hidden;
        cursor: pointer;
        text-align: center;
      }

      .bt:hover,
      .chip:hover,
      .pl:hover,
      .qbtn:hover {
        border-color: var(--gold);
      }

      .bt .ic {
        font-size: 34px;
        color: var(--gold);
        line-height: 1;
        flex: 0 0 auto;
      }

      .bt .lbl {
        font-size: 17px;
        font-weight: 900;
        text-align: center;
        line-height: 1.12;
        white-space: normal;
      }

      .bt .mut {
        color: var(--mute);
        font-size: 13px;
      }

      .bt.active,
      .chip.active,
      .segb.active,
      .pl.active,
      .fc.active {
        background: linear-gradient(180deg, var(--bordeaux2), var(--bordeaux));
        border-color: var(--bordeaux2);
        color: #fff;
      }

      .bt.active .ic,
      .pl.active .pos,
      .fc.active .pos {
        color: #fff;
      }

      .grid.big {
        align-content: center;
      }

      .grid.big .bt {
        min-height: 140px;
        height: 140px;
        padding: 20px 22px;
      }

      .grid.big .bt .ic {
        font-size: 46px;
      }

      .bt.def.active {
        background: linear-gradient(180deg, #3f7bd1, #27518c);
        border-color: #3f7bd1;
      }

      .pl {
        display: grid;
        grid-template-columns: 36px 48px minmax(0, 1fr) 34px;
        align-items: center;
        column-gap: 10px;
        width: 100%;
        min-width: 0;
        max-width: none;
        min-height: 78px;
        height: 78px;
        padding: 10px 12px;
        background: var(--card);
        border-radius: 14px;
        color: var(--txt);
        overflow: hidden;
        cursor: pointer;
      }

      .pl .num {
        font-weight: 900;
        font-size: 22px;
        line-height: 1;
        text-align: center;
      }

      .pl .nm {
        font-size: 15px;
        line-height: 1.1;
        text-align: left;
        font-weight: 800;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .pl .pos {
        font-size: 12px;
        font-weight: 800;
        text-align: center;
      }

      .pl.sm {
        min-height: 72px;
        height: 72px;
        padding: 9px 12px;
      }

      .pl.sm .num {
        font-size: 20px;
      }

      .av {
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: #2a3142;
        display: inline-grid;
        place-items: center;
        font-size: 11px;
        font-weight: 800;
        color: var(--gold);
        object-fit: cover;
        margin-bottom: 1px;
        flex: 0 0 auto;
      }

      .av.none {
        color: var(--mute);
        background: #1b2030;
      }

      .bchip .av {
        width: 24px;
        height: 24px;
        margin: 0 3px 0 0;
        vertical-align: middle;
      }

      .fc .av {
        width: 40px;
        height: 40px;
        grid-column: 1;
        grid-row: 1;
      }

      .scard .av {
        width: 28px;
        height: 28px;
        margin: 0;
      }

      .chip,
      .segb,
      .res {
        background: var(--card);
        border-radius: 9px;
        color: var(--txt);
        font-weight: 700;
      }

      .chip {
        width: 100%;
        min-width: 0;
        max-width: none;
        min-height: 74px;
        padding: 16px 14px;
        font-size: 16px;
        border-radius: 16px;
        cursor: pointer;
      }

      .seg {
        display: flex;
        gap: 12px;
      }

      .segb {
        flex: 1;
        min-height: 58px;
        padding: 14px;
        font-size: 16px;
        border-radius: 14px;
        cursor: pointer;
      }

      .res {
        display: block;
        width: 100%;
        min-height: 68px;
        padding: 16px;
        font-size: 18px;
        margin-bottom: 10px;
        border-radius: 16px;
        cursor: pointer;
      }

      .res.made:hover {
        background: #1f7a44;
        border-color: #25a05a;
        color: #fff;
      }

      .res.miss:hover {
        background: var(--bordeaux);
        border-color: var(--bordeaux2);
        color: #fff;
      }

      .sublbl {
        color: var(--mute);
        font-size: 11px;
        margin: 5px 0 2px;
        text-align: center;
      }

      .tip {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 9px;
        padding: 8px 10px;
        color: var(--mute);
        font-size: 10.5px;
      }

      .backBtn {
        align-self: flex-start;
        background: var(--panel2);
        color: var(--txt);
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 11px;
        margin-bottom: 5px;
      }

      .courtPane {
        overflow: hidden;
      }

      .courtbox {
        position: relative;
        flex: 1;
        min-height: 0;
        width: 100%;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid var(--border);
        background: #0b0f1d;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .courtSvg,
      .courtbox img,
      .courtbox canvas {
        width: 100%;
        height: 100%;
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        display: block;
      }

      .courtbox.live {
        box-shadow: 0 0 0 2px var(--gold);
        cursor: crosshair;
      }

      .courtbox:not(.live) {
        opacity: 0.95;
      }

      .mark {
        position: absolute;
        width: 13px;
        height: 13px;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        border: 2px solid #fff;
        pointer-events: none;
      }

      .mark.made { background: var(--green); }
      .mark.miss { background: var(--red); }

      .shotdot {
        position: absolute;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        border: 1px solid rgba(0, 0, 0, 0.4);
        pointer-events: none;
      }

      .courthint {
        flex: 0 0 auto;
        color: var(--mute);
        font-size: 9.5px;
        margin: 5px 0 0;
        text-align: center;
        line-height: 1.1;
      }

      .bottom {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 240px;
        gap: 8px;
        overflow: hidden;
      }

      .playersPane,
      .quickPane {
        padding: 7px;
      }

      .playersHead {
        justify-content: space-between;
        gap: 8px;
        flex: 0 0 20px;
        min-height: 20px;
        margin-bottom: 4px;
      }

      .playersHead h3 {
        margin: 0;
      }

      .playersHead .ghost {
        padding: 4px 7px;
        font-size: 11px;
      }

      .playersGrid {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: 48% 52%;
        gap: 10px;
        overflow: hidden;
      }

      .floor,
      .bench {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-content: flex-start;
        min-height: 0;
        overflow-y: auto;
        padding-right: 2px;
      }

      .miniTitle {
        width: 100%;
        color: var(--gold);
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        line-height: 1;
      }

      .fc {
        display: grid;
        grid-template-columns: 40px minmax(0, 1fr);
        grid-template-rows: auto auto;
        align-items: center;
        column-gap: 9px;
        row-gap: 3px;
        padding: 10px 12px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        min-width: 126px;
        max-width: 156px;
        min-height: 86px;
        color: var(--txt);
      }

      .fc.swap {
        cursor: pointer;
        border-color: var(--gold);
      }

      .fc .num {
        font-weight: 900;
        font-size: 23px;
        line-height: 1;
        grid-column: 2;
        grid-row: 1;
      }

      .fc .nm {
        font-size: 13px;
        line-height: 1.1;
        max-width: 96px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 800;
        grid-column: 2;
        grid-row: 2;
      }

      .fc .pos {
        font-size: 10px;
        line-height: 1;
        font-weight: 800;
        grid-column: 1;
        grid-row: 2;
        text-align: center;
      }

      .bchip {
        min-height: 52px;
        padding: 12px 16px;
        border-radius: 13px;
        border: 1px solid var(--border);
        background: var(--panel2);
        color: var(--txt);
        font-size: 14px;
        font-weight: 800;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
      }

      .bchip.sel {
        border-color: var(--gold);
        color: var(--gold);
      }

      .quick {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-rows: 1fr 1fr;
        gap: 10px;
      }

      .qbtn {
        min-width: 0;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
        align-items: flex-start;
        justify-content: center;
        padding: 12px 14px;
        background: var(--card);
        border-radius: 14px;
        color: var(--txt);
        font-size: 15px;
        font-weight: 900;
        cursor: pointer;
        overflow: hidden;
      }

      .qbtn small {
        font-weight: 600;
        color: var(--mute);
        font-size: 12px;
      }

      .box {
        flex: 1;
        min-height: 0;
        padding: 12px;
        overflow: auto;
      }

      .box table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .box th,
      .box td {
        padding: 7px 8px;
        text-align: center;
        border-bottom: 1px solid #20273a;
      }

      .box th {
        color: var(--gold);
        font-weight: 700;
        text-transform: uppercase;
        font-size: 11px;
      }

      .box td.l,
      .box th.l {
        text-align: left;
      }

      .box tr.tot td {
        border-top: 2px solid var(--border);
        font-weight: 800;
        background: #0e1424;
      }

      .boxsec {
        color: var(--gold);
        text-transform: uppercase;
        font-size: 12px;
        letter-spacing: 0.05em;
        margin: 16px 0 8px;
        font-weight: 800;
      }

      .cardrow {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .boxcard {
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 8px 10px;
        min-width: 130px;
      }

      .bt-lbl2 {
        color: var(--mute);
        font-size: 11px;
      }

      .bt-val {
        font-size: 19px;
        font-weight: 800;
      }

      .toast {
        position: fixed;
        bottom: 14px;
        left: 50%;
        transform: translateX(-50%);
        background: #000;
        border: 1px solid var(--gold);
        color: var(--gold);
        padding: 9px 16px;
        border-radius: 10px;
        font-size: 12px;
        z-index: 10000;
      }

      @media (max-height: 760px) {
        .h { flex-basis: 14dvh; min-height: 98px; padding: 6px 12px; }
        .h-c { grid-template-columns: minmax(110px, 1fr) 82px 145px 102px minmax(110px, 1fr); }
        .score { font-size: 28px; min-width: 58px; padding: 6px 0; }
        .clockbox { width: 145px; min-width: 145px; padding: 8px 10px; }
        .clk { font-size: 28px; }
        .qtag { font-size: 15px; }
        .mini { width: 30px; height: 26px; }
        .ghost { font-size: 12px; padding: 9px 11px; }
        .qstrip { flex-basis: 42px; min-height: 42px; }
        .qbox { font-size: 15px; padding: 7px 18px; }
        .steps { flex-basis: 28px; min-height: 28px; padding: 3px 8px; }
        .liveFrame { grid-template-rows: minmax(0, 1fr) 184px; gap: 6px; padding: 6px 8px 7px; }
        .wztitle { font-size: 21px; }
        .bt { min-height: 110px; height: 110px; padding: 14px 12px; }
        .bt .ic { font-size: 30px; }
        .bt .lbl { font-size: 15px; }
        .grid.big .bt { min-height: 125px; height: 125px; }
        .pl { min-height: 68px; height: 68px; }
        .fc { min-width: 112px; min-height: 78px; padding: 8px 10px; }
        .bchip { min-height: 44px; font-size: 12px; }
      }

      @media (max-width: 1200px) {
        .h {
          grid-template-columns: 150px minmax(0, 1fr) auto;
        }

        .h-tt,
        .team {
          font-size: 11px;
        }

        .ghost {
          font-size: 9.5px;
          padding: 5px 6px;
        }

        .wrap {
          grid-template-columns: minmax(160px, 20%) minmax(280px, 40%) minmax(280px, 40%);
        }

        .bottom {
          grid-template-columns: minmax(0, 1fr) 240px;
        }
      }

      @media (max-width: 920px) {
        .ps-root {
          position: fixed;
          inset: 0;
          height: 100dvh;
          overflow: auto;
        }

        .h {
          grid-template-columns: 1fr;
          height: auto;
          min-height: 0;
        }

        .h-c,
        .h-r {
          justify-content: center;
          flex-wrap: wrap;
        }

        .liveFrame {
          display: block;
          overflow: auto;
        }

        .wrap,
        .bottom,
        .playersGrid {
          display: grid;
          grid-template-columns: 1fr;
          height: auto;
          overflow: visible;
        }

        .wrap,
        .bottom {
          gap: 8px;
        }

        .pane {
          min-height: 180px;
        }

        .courtbox {
          aspect-ratio: 400 / 280;
          flex: 0 0 auto;
        }
      }
    `}</style>
  );
}