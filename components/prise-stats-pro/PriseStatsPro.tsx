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
import ShotChart, { zoneById, resolveShotZone } from "@/components/prise-stats-pro/ShotChart";

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
interface StatA extends Draft {
  id: string;
  clock: string;
  q: number;
  lineup: string[];

  videoTime?: number | null;
  clipStart?: number | null;
  clipEnd?: number | null;
  syncStatus?: string | null;
}

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

/* ============================================================================
 * V6 · Boutons de codification configurables (préparation Management)
 * ----------------------------------------------------------------------------
 * Les temps forts continuent d'utiliser livestat_tags. Les AUTRES boutons
 * (actions attaque/défense, coverages, résultats, rebonds, fautes) pourront
 * plus tard venir de la table `livestat_coding_buttons`. Ici on ne BRANCHE
 * rien qui puisse casser : on définit seulement le TYPE de config + un
 * resolver à FALLBACK sur les constantes actuelles. La `key` reste stable
 * (matrices/fiches restent reliées) ; on n'affiche jamais la key brute.
 * ========================================================================== */
type CodingButtonCfg = {
  key: string;            // clé stable (= id historique) — jamais affichée telle quelle
  label: string;         // libellé affiché
  emoji?: string;        // emoji/icône
  category?: string;     // 'att-action' | 'def-action' | 'coverage' | 'result' | 'rebound' | 'foul'
  stage?: string;        // étape wizard concernée
  color?: string | null;
  shortcut_key?: string | null;
  shortcut_modifier?: string | null;
  sort_order?: number;
  is_active?: boolean;
  clip_mode?: string | null;
  pre_roll?: number | null;
  post_roll?: number | null;
};

// Fallback = constantes actuelles, converties une seule fois au shape config.
const CODING_FALLBACK: Record<string, CodingButtonCfg[]> = {
  'att-action': ATT_ACTIONS.map((o, i) => ({ key: o.id, label: o.label, emoji: o.ic, category: 'att-action', stage: 'action', sort_order: i, is_active: true })),
  'def-action': DEF_ACTIONS.map((o, i) => ({ key: o.id, label: o.label, emoji: o.ic, category: 'def-action', stage: 'action', sort_order: i, is_active: true })),
  'coverage': COVERAGES.map((o, i) => ({ key: o.id, label: o.label, category: 'coverage', stage: 'coverage', sort_order: i, is_active: true })),
};

/**
 * Resolver de boutons de codification. En V6 il renvoie toujours le fallback
 * (constantes). Quand Management écrira dans livestat_coding_buttons, il
 * suffira d'alimenter `db` : les boutons actifs de la catégorie priment, triés
 * par sort_order ; sinon fallback constantes. AUCUNE key n'est inventée.
 */
function resolveCodingButtons(
  category: string,
  db?: CodingButtonCfg[] | null
): CodingButtonCfg[] {
  if (db && db.length) {
    const rows = db.filter((b) => b.category === category && b.is_active !== false);
    if (rows.length) return [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }
  return CODING_FALLBACK[category] ?? [];
}

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

  /* V6→final · boutons de codification configurables (Management).
     Chargés depuis livestat_coding_buttons pour l'équipe active ; si vide ou
     erreur → null → resolveCodingButtons retombe sur les constantes. Un
     changement dans Management se répercute ici (label/emoji/couleur/ordre). */
  const [codingDb, setCodingDb] = useState<CodingButtonCfg[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* -------- V5 · choix vidéo à la création du match (structure + UI) --------
     Aucun upload serveur / ffmpeg ici : on ne prépare que la donnée et l'UI. */
  const [videoMode, setVideoMode] = useState<'later' | 'file' | 'youtube'>('later');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoStatus, setVideoStatus] = useState('pending');   // pending | ready | linked
  const [videoProvider, setVideoProvider] = useState('none');  // none | local | youtube
  const [videoUrl, setVideoUrl] = useState('');                // objectURL local ou lien YouTube
  const [videoFilename, setVideoFilename] = useState('');

  // Accès synchrone dans commit() (le state est async) + base de temps vidéo.
  const videoProviderRef = useRef('none');
  const matchStartAtRef = useRef<number | null>(null);
  const VIDEO_PRE_ROLL = 6;   // s avant l'action (préparation du clip)
  const VIDEO_POST_ROLL = 4;  // s après l'action

  // Sélection d'un fichier vidéo local (objectURL, pas d'upload réel en V5).
  const onPickVideoFile = (file: File | null) => {
    if (!file) return;
    setVideoFile(file);
    setVideoFilename(file.name);
    try { setVideoUrl(URL.createObjectURL(file)); } catch { setVideoUrl(''); }
    setVideoProvider('local');
    setVideoStatus('ready');
  };

  // Saisie d'un lien YouTube.
  const onSetYoutube = (url: string) => {
    setYoutubeUrl(url);
    const ok = /youtu\.?be/i.test(url) && url.trim().length > 0;
    setVideoUrl(url.trim());
    setVideoProvider(ok ? 'youtube' : 'none');
    setVideoStatus(ok ? 'linked' : 'pending');
  };

  // Bascule entre les 3 modes (réinitialise proprement les champs liés).
  const chooseVideoMode = (mode: 'later' | 'file' | 'youtube') => {
    setVideoMode(mode);
    if (mode === 'later') {
      setVideoFile(null); setVideoFilename(''); setYoutubeUrl('');
      setVideoUrl(''); setVideoProvider('none'); setVideoStatus('pending');
    } else if (mode === 'file') {
      setYoutubeUrl('');
      setVideoProvider(videoFile ? 'local' : 'none');
      setVideoStatus(videoFile ? 'ready' : 'pending');
    } else {
      setVideoFile(null); setVideoFilename('');
      const ok = /youtu\.?be/i.test(youtubeUrl) && youtubeUrl.trim().length > 0;
      setVideoProvider(ok ? 'youtube' : 'none');
      setVideoStatus(ok ? 'linked' : 'pending');
    }
  };

  // Prépare video_time / clip_start / clip_end au moment d'un commit.
  // Vidéo active (local/youtube) → timestamp relatif au coup d'envoi ; sinon null.
  const stampVideo = (): { videoTime: number | null; clipStart: number | null; clipEnd: number | null; syncStatus: string | null } => {
    if (videoProviderRef.current === 'none' || matchStartAtRef.current == null) {
      return { videoTime: null, clipStart: null, clipEnd: null, syncStatus: 'pending' };
    }
    const t = Math.max(0, Math.round((Date.now() - matchStartAtRef.current) / 1000));
    return {
      videoTime: t,
      clipStart: Math.max(0, t - VIDEO_PRE_ROLL),
      clipEnd: t + VIDEO_POST_ROLL,
      syncStatus: 'prepared',
    };
  };

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

  // Résolution d'affichage des temps forts (label/emoji/color) pour l'écran live.
  const tags = useLivestatTags(activeTeamId || teamId);

  /* ---------------- V7 · ergonomie vidéo + workspace à onglets ---------------- */
  // Onglet de travail visible dans l'écran live (desktop + mobile).
  const [workTab, setWorkTab] = useState<'coding' | 'center' | 'analysis'>('coding');

  // Lecteur vidéo local + saut réglable + Tab+flèches.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoStepSeconds, setVideoStepSeconds] = useState(5);
  const [videoStepCustom, setVideoStepCustom] = useState(false);
  const tabHeldRef = useRef(false);

  const hasLocalVideo = () => videoProvider === 'local' && !!videoRef.current;
  const nudgeVideo = (dir: -1 | 1) => {
    const v = videoRef.current;
    if (videoProvider !== 'local' || !v) return; // pas de vidéo active → rien
    const dur = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.max(0, Math.min(dur, v.currentTime + dir * videoStepSeconds));
  };

  // Revoir un clip : place la vidéo locale à clip_start (ou videoTime) ; sinon message.
  const playClip = (a: StatA) => {
    const t = (a.clipStart ?? a.videoTime) as number | null;
    if (videoProvider === 'local' && videoRef.current && t != null) {
      setWorkTab((w) => (w === 'coding' ? w : w)); // vidéo toujours visible au centre
      try { videoRef.current.currentTime = t; videoRef.current.play().catch(() => {}); } catch { /* noop */ }
      flash('Clip : ' + fmt(Math.round(t)));
    } else if (videoProvider === 'youtube' && videoUrl && t != null) {
      flash('YouTube lié — repère à ' + fmt(Math.round(t)));
    } else {
      flash('Clip à synchroniser');
    }
  };

  // Filtres matrice (agissent sur les actions LOCALES pendant le match).
  const [mxPlayer, setMxPlayer] = useState('all');
  const [mxPeriod, setMxPeriod] = useState('all');
  const [mxSide, setMxSide] = useState<'all' | 'attaque' | 'defense'>('all');
  const [mxShotRes, setMxShotRes] = useState<'all' | 'made' | 'missed'>('all');
  const [mxShotType, setMxShotType] = useState<'all' | '2PTS' | '3PTS' | 'LF'>('all');
  const [mxCell, setMxCell] = useState<{ tf: string; cat: string } | null>(null);
  // V7.1 · sous-onglet de la colonne analyse (droite) + zone shot chart sélectionnée
  const [analysisTab, setAnalysisTab] = useState<'history' | 'matrix' | 'montage'>('history');
  const [zoneSel, setZoneSel] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<'all' | 'made' | 'missed'>('all');

  // Montage en cours (reçoit des actions LOCALES pendant le match).
  const [montageTitle, setMontageTitle] = useState('Nouveau montage');
  const [montageNote, setMontageNote] = useState('');
  const [montageItems, setMontageItems] = useState<{ caid: string; label: string; sub: string; note: string; clipStart: number | null; clipEnd: number | null }[]>([]);
  const [montageSaving, setMontageSaving] = useState(false);

  const addToMontage = (a: StatA) => {
    const p = find(a.playerId);
    const label = `${tags.label(a.tempsFort) || '—'} · ${describe(a, find).t}`;
    const sub = [periodLabel(a.q), a.clock, p ? `#${p.num} ${p.name}` : null].filter(Boolean).join(' · ');
    setMontageItems((prev) => prev.some((x) => x.caid === a.id)
      ? prev
      : [...prev, { caid: a.id, label, sub, note: '', clipStart: a.clipStart ?? null, clipEnd: a.clipEnd ?? null }]);
    flash('Ajouté au montage');
  };
  const removeMontageItem = (caid: string) => setMontageItems((prev) => prev.filter((x) => x.caid !== caid));
  const moveMontageItem = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    setMontageItems((prev) => {
      if (j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };
  const setMontageItemNote = (caid: string, note: string) =>
    setMontageItems((prev) => prev.map((x) => (x.caid === caid ? { ...x, note } : x)));

  const saveMontage = async () => {
    const tId = activeTeamId || teamId;
    if (!montageItems.length) { flash('Ajoute au moins un clip.'); return; }
    if (!isSupabaseUuid(tId)) { flash('Équipe non Supabase — montage gardé en local.'); return; }
    setMontageSaving(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('livestat_montages')
        .insert({ team_id: tId, match_id: liveMatchIdRef.current, title: montageTitle, coach_note: montageNote || null, status: 'draft' })
        .select('id').single();
      if (error || !data) { flash('Montage non enregistré : ' + (error?.message || '')); setMontageSaving(false); return; }
      const payload = montageItems.map((it, i) => ({
        montage_id: data.id, match_id: liveMatchIdRef.current, client_action_id: it.caid,
        sort_order: i, title: it.label, note: it.note || null, clip_start: it.clipStart, clip_end: it.clipEnd,
      }));
      const { error: itErr } = await supabase.from('livestat_montage_items').insert(payload);
      if (itErr) { flash('Clips non enregistrés : ' + itErr.message); }
      else flash('Montage enregistré ✓');
    } catch (e: any) {
      flash('Erreur : ' + (e?.message || 'montage'));
    } finally {
      setMontageSaving(false);
    }
  };

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

  // V7 · Tab maintenu + flèche gauche/droite = reculer/avancer la vidéo locale.
  // Si aucune vidéo locale active, on ne fait rien (et on n'entrave pas le Tab).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (hasLocalVideo()) { tabHeldRef.current = true; e.preventDefault(); }
        return;
      }
      if (!tabHeldRef.current) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); nudgeVideo(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); nudgeVideo(-1); }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Tab') tabHeldRef.current = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoProvider, videoStepSeconds]);

  // Charge les boutons de codification configurés pour l'équipe active.
  // Non bloquant : en cas d'absence/erreur, on garde null (fallback constantes).
  useEffect(() => {
    let active = true;
    const tId = activeTeamId || teamId;
    if (!tId || !isSupabaseUuid(tId)) { setCodingDb(null); return; }

    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('livestat_coding_buttons')
          .select('key,label,emoji,category,stage,color,shortcut_key,shortcut_modifier,sort_order,is_active,clip_mode,pre_roll,post_roll')
          .eq('team_id', tId);
        if (!active) return;
        if (error || !data || !data.length) { setCodingDb(null); return; }
        setCodingDb(data as CodingButtonCfg[]);
      } catch {
        if (active) setCodingDb(null);
      }
    })();

    return () => { active = false; };
  }, [activeTeamId, teamId]);

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
    videoProviderRef.current = videoProvider;
    matchStartAtRef.current = Date.now();
    ensuringRef.current = true;
    ensureLiveMatch({
      teamId: selTeam.id,
      opponent: opponent || 'Adversaire',
      date,
      home,
      playerIds: selTeam.players.map((p) => p.id),
      videoMode,
      videoStatus,
      videoProvider,
      videoUrl,
      videoFilename,
      youtubeUrl,
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
    const vstamp = stampVideo();

    const a: StatA = {
      ...d,
      id: uid(),
      clock: fmt(secs),
      q,
      lineup: onCourt.slice(),
      videoTime: vstamp.videoTime,
      clipStart: vstamp.clipStart,
      clipEnd: vstamp.clipEnd,
      syncStatus: vstamp.syncStatus,
    };

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
          videoTime: vstamp.videoTime, clipStart: vstamp.clipStart,
          clipEnd: vstamp.clipEnd, syncStatus: vstamp.syncStatus,
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

  // V7.2 · sélection par ZONE (shot chart pro). Écrit shot_zone_id (dans draft.zone)
  // + court_x/court_y = centroïde de la zone (repère 0..1). Transition INCHANGÉE.
  const zonePick = (zone: { id: string; cx: number; cy: number }) => {
    if (stage !== 'zone') return;
    const d = { ...draft, zone: zone.id, courtX: zone.cx / 100, courtY: zone.cy / 100 };
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
              <p className="sub-h">Vidéo du match <span className="cnt">— optionnel, modifiable après le match</span></p>
              <div className="vid-modes">
                <button type="button" className={`vmode ${videoMode === 'later' ? 'on' : ''}`} onClick={() => chooseVideoMode('later')}>
                  <span className="vm-ic">⏳</span>
                  <span className="vm-tt">Sans vidéo / plus tard</span>
                  <span className="vm-sub">Coder maintenant, ajouter la vidéo ensuite</span>
                </button>
                <button type="button" className={`vmode ${videoMode === 'file' ? 'on' : ''}`} onClick={() => chooseVideoMode('file')}>
                  <span className="vm-ic">🎥</span>
                  <span className="vm-tt">Fichier vidéo maintenant</span>
                  <span className="vm-sub">Sélectionner un fichier local</span>
                </button>
                <button type="button" className={`vmode ${videoMode === 'youtube' ? 'on' : ''}`} onClick={() => chooseVideoMode('youtube')}>
                  <span className="vm-ic">▶️</span>
                  <span className="vm-tt">Lien YouTube</span>
                  <span className="vm-sub">Coller l'URL de la vidéo</span>
                </button>
              </div>

              {videoMode === 'file' && (
                <div className="vid-input">
                  <label className="vid-file">
                    <input type="file" accept="video/*" onChange={(e) => onPickVideoFile(e.target.files?.[0] ?? null)} />
                    <span className="vf-btn">📁 Choisir un fichier vidéo</span>
                    <span className="vf-name">{videoFilename || 'Aucun fichier sélectionné'}</span>
                  </label>
                  {videoProvider === 'local' && <p className="vid-ok">🎥 Vidéo locale prête — les repères clip seront préparés à chaque action.</p>}
                  <p className="vid-note">L'upload serveur n'est pas encore géré : la vidéo reste locale pour l'instant.</p>
                </div>
              )}

              {videoMode === 'youtube' && (
                <div className="vid-input">
                  <input
                    className="vid-yt"
                    placeholder="https://www.youtube.com/watch?v=…"
                    value={youtubeUrl}
                    onChange={(e) => onSetYoutube(e.target.value)}
                  />
                  {videoProvider === 'youtube'
                    ? <p className="vid-ok">▶️ YouTube lié — les repères clip seront préparés à chaque action.</p>
                    : youtubeUrl.trim().length > 0 && <p className="vid-warn">Lien YouTube non reconnu.</p>}
                </div>
              )}
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
        <div className="h-l"><div className="h-ic">📊</div><div><div className="h-tt">PRISE DE STATS LIVE</div><div className="h-sub">{screen === 'box' ? 'Box-score' : NAV[navIdx]}</div></div>
          {screen !== 'box' && (
            <div className={`vid-badge ${videoProvider === 'local' ? 'is-local' : videoProvider === 'youtube' ? 'is-yt' : 'is-later'}`}>
              {videoProvider === 'local' ? '🎥 Vidéo locale prête'
                : videoProvider === 'youtube' ? '▶️ YouTube lié'
                : '⏳ Vidéo à ajouter après match'}
            </div>
          )}
        </div>
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
          {/* Onglets mobiles — pilotent la colonne affichée sur petit écran */}
          <nav className="wtabs">
            {([['coding', '🎯 Codage'], ['center', '🎥 Vidéo'], ['analysis', '📊 Analyse']] as const).map(([k, l]) => (
              <button key={k} className={`wtab ${workTab === k ? 'on' : ''}`} onClick={() => setWorkTab(k as any)}>{l}</button>
            ))}
          </nav>

          <div className="live3">
            {/* ============ GAUCHE 25% · CODAGE compact ============ */}
            <aside className={`lc lc-code ${workTab === 'coding' ? 'mshow' : ''}`}>
              <div className="lc-head">
                <div className="crumb-mini">
                  {['Contexte', 'Temps fort', 'Joueur', 'Action', 'Résultat', 'Zone'].map((c, i) => {
                    const state = navIdx === i ? 'cur' : navIdx > i ? 'done' : '';
                    return <span key={c} className={`cm ${state}`} title={c}>{c}</span>;
                  })}
                </div>
              </div>
              <div className="lc-body codeDense">
                {stage !== 'context' && (
                  <button className="backBtn sm" onClick={() => {
                    const order = ['context', 'inbound', 'temps', 'coverage', 'player', 'action', 'faute', 'result', 'ft', 'zone', 'rebound', 'assist'];
                    const currentIndex = order.indexOf(stage);
                    if (currentIndex > 0) setStage(order[currentIndex - 1]);
                  }}>← Retour</button>
                )}
                {renderStage()}
              </div>
              <div className="lc-foot">
                <button className="qbtn sm" onClick={undo}>↺ Annuler</button>
                <button className="qbtn sm" onClick={resetDraft}>🗑 Reset</button>
              </div>
              {/* Bandeau joueurs compact (remplacements) */}
              <div className="lc-players">
                <div className="lcp-row">
                  {floor.map((p) => (
                    <button key={p.id} className={`pchip xs ${draft.playerId === p.id ? 'active' : ''} ${subSel !== null ? 'swap' : ''}`} onClick={subSel !== null ? () => swap(p.id) : undefined}>
                      <span className="num">{p.num}</span><span className="nm">{p.name}</span>
                    </button>
                  ))}
                </div>
                <div className="lcp-row bench">
                  <button className={`pbtoggle xs ${subSel !== null ? 'on' : ''}`} onClick={() => setSubSel((s) => (s === null ? '' : null))}>⇄</button>
                  {bench.map((p) => (
                    <button key={p.id} className={`pchip xs bench ${subSel === p.id ? 'sel' : ''}`} onClick={() => setSubSel(p.id)}>
                      <span className="num">{p.num}</span><span className="nm">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>

            {/* ============ CENTRE 50% · VIDÉO prioritaire + shot chart zones ============ */}
            <section className={`lc lc-center ${workTab === 'center' ? 'mshow' : ''}`}>
              <div className="videoSlot big">
                {videoProvider === 'local' && videoUrl ? (
                  <video ref={videoRef} className="vplayer" src={videoUrl} controls />
                ) : videoProvider === 'youtube' && videoUrl ? (
                  <div className="vyt">
                    <div className="vyt-ic">▶️</div>
                    <div className="vyt-tx">YouTube lié</div>
                    <a className="vyt-open" href={videoUrl} target="_blank" rel="noreferrer">Ouvrir</a>
                  </div>
                ) : (
                  <div className="vempty">
                    <div className="vempty-tt">Ajouter une vidéo</div>
                    <div className="vempty-sub">Le codage fonctionne sans vidéo — synchronisable après le match.</div>
                    <div className="vempty-btns">
                      <label className="vbtn"><input type="file" accept="video/*" onChange={(e) => onPickVideoFile(e.target.files?.[0] ?? null)} />📁 Fichier</label>
                      <button className="vbtn" onClick={() => { const u = window.prompt('Lien YouTube :', youtubeUrl); if (u != null) onSetYoutube(u); }}>▶️ YouTube</button>
                      <button className="vbtn ghosty" onClick={() => flash('Vidéo à ajouter après le match')}>⏳ Plus tard</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Contrôles de lecture (visibles si vidéo locale) */}
              {videoProvider === 'local' && videoUrl && (
                <div className="vbar">
                  <button className="vnav" onClick={() => nudgeVideo(-1)} title="Reculer (Tab + ←)">« −{videoStepSeconds}s</button>
                  <div className="vstep">
                    <span>Saut</span>
                    {[3, 5, 10].map((s) => (
                      <button key={s} className={!videoStepCustom && videoStepSeconds === s ? 'on' : ''} onClick={() => { setVideoStepCustom(false); setVideoStepSeconds(s); }}>{s}s</button>
                    ))}
                    <button className={videoStepCustom ? 'on' : ''} onClick={() => setVideoStepCustom(true)}>Perso</button>
                    {videoStepCustom && <input type="number" min={1} max={60} value={videoStepSeconds} onChange={(e) => setVideoStepSeconds(Math.max(1, Number(e.target.value) || 1))} />}
                  </div>
                  <button className="vnav" onClick={() => nudgeVideo(1)} title="Avancer (Tab + →)">+{videoStepSeconds}s »</button>
                </div>
              )}

              {/* Shot chart PAR ZONES pro — pick à l'étape zone, analyse sinon */}
              <div className="scZone">
                {liveCourt ? (
                  <div className="scZone-live">
                    <div className="courtSlotHead"><span>🎯 Choisis la zone du tir ({draft.shotType || '2PTS'})</span></div>
                    <ShotChart
                      mode="pick"
                      size="sm"
                      shotType={draft.shotType === '3PTS' ? '3PTS' : '2PTS'}
                      selectedZone={draft.zone || null}
                      onPick={(z) => zonePick(z)}
                    />
                  </div>
                ) : (
                  <ShotChart
                    mode="analysis"
                    size="sm"
                    showPoints
                    shots={actions.filter((a) => a.actionType === 'tir')}
                    onZoneClick={(zid) => { setZoneSel(zid); setZoneFilter('all'); }}
                  />
                )}
              </div>
            </section>

            {/* ============ DROITE 25% · ANALYSE LIVE (3 sous-onglets) ============ */}
            <aside className={`lc lc-analysis ${workTab === 'analysis' ? 'mshow' : ''}`}>
              <div className="an-tabs">
                {([['history', 'Historique'], ['matrix', 'Matrice'], ['montage', `Montage${montageItems.length ? ' · ' + montageItems.length : ''}`]] as const).map(([k, l]) => (
                  <button key={k} className={`an-tab ${analysisTab === k ? 'on' : ''}`} onClick={() => setAnalysisTab(k as any)}>{l}</button>
                ))}
              </div>
              <div className="an-body">
                {analysisTab === 'history' && renderHistoryList()}
                {analysisTab === 'matrix' && renderMatrix()}
                {analysisTab === 'montage' && renderMontage()}
              </div>
            </aside>
          </div>
        </>
      )}

      {zoneSel && (() => {
        const z = zoneById(zoneSel);
        const shotsAll = actions.filter((a) => a.actionType === 'tir' && a.shotType !== 'LF' && resolveShotZone(a) === zoneSel);
        const shots = shotsAll.filter((a) => zoneFilter === 'all' ? true : zoneFilter === 'made' ? a.shotResult === 'made' : a.shotResult !== 'made');
        const made = shotsAll.filter((a) => a.shotResult === 'made').length;
        return (
          <div className="zpop" onClick={() => setZoneSel(null)}>
            <div className="zpop-card" onClick={(e) => e.stopPropagation()}>
              <div className="zpop-head">
                <b>{z?.label} · {z?.type} — {made}/{shotsAll.length}{shotsAll.length ? ` (${Math.round((made / shotsAll.length) * 100)}%)` : ''}</b>
                <button onClick={() => setZoneSel(null)}>×</button>
              </div>
              <div className="zpop-filters">
                {([['all', 'Tous'], ['made', 'Marqués'], ['missed', 'Ratés']] as const).map(([k, l]) => (
                  <button key={k} className={zoneFilter === k ? 'on' : ''} onClick={() => setZoneFilter(k)}>{l}</button>
                ))}
              </div>
              <div className="zpop-list">
                {shots.length === 0 ? <div className="hist-empty">Aucun tir.</div> : shots.map((a) => {
                  const p = find(a.playerId);
                  const hasClip = a.videoTime != null || a.clipStart != null;
                  return (
                    <div className="mx-arow" key={a.id}>
                      <span className="htime">{periodLabel(a.q)} {a.clock}</span>
                      <span className="hbody"><b>{p ? `#${p.num} ${p.name}` : '—'}</b><em>{tags.label(a.tempsFort)} · {describe(a, find).t}</em></span>
                      <button className={`hplay ${hasClip ? 'has' : ''}`} title={hasClip ? 'Revoir le clip' : 'Clip à synchroniser'} onClick={() => playClip(a)}>▶</button>
                      <button className="hadd" onClick={() => addToMontage(a)}>⭐</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

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

  /* ============ V7 · onglets de travail (historique / matrice / montage / joueurs) ============ */
  function mxCat(a: StatA): string {
    const at = a.actionType;
    if (at === 'tir') return a.shotResult === 'made' ? 'made' : 'missed';
    if (at === 'faute-provoquee') return 'foul';
    if (at === 'perte' || at === 'perte-adverse') return 'to';
    if (at === 'interception') return 'stl';
    return 'other';
  }
  const MX_COLS: { id: string; label: string }[] = [
    { id: 'made', label: 'Marqué' }, { id: 'missed', label: 'Manqué' },
    { id: 'foul', label: 'Faute prov.' }, { id: 'to', label: 'Perte' }, { id: 'stl', label: 'Interc.' },
  ];
  function mxFiltered(): StatA[] {
    return actions.filter((a) => {
      if (mxPlayer !== 'all' && a.playerId !== mxPlayer) return false;
      if (mxPeriod !== 'all' && String(a.q) !== mxPeriod) return false;
      if (mxSide !== 'all' && a.context !== mxSide) return false;
      if (mxShotRes !== 'all') { if (a.actionType !== 'tir' || a.shotResult !== mxShotRes) return false; }
      if (mxShotType !== 'all') { if (a.shotType !== mxShotType) return false; }
      return true;
    });
  }

  function renderHistoryList() {
    return (
      <div className="hist">
        {actions.length === 0 && <div className="hist-empty">Aucune action.</div>}
        {actions.slice().reverse().map((a) => {
          const d = describe(a, find);
          const p = find(a.playerId);
          const hasClip = a.videoTime != null || a.clipStart != null;
          return (
            <div className="hrow2" key={a.id}>
              <span className="htime">{a.clock}</span>
              <span className="hvtime">{a.videoTime != null ? '🎬 ' + fmt(Math.round(a.videoTime)) : ''}</span>
              <span className="htf" style={{ color: tags.color(a.tempsFort) }} title={tags.label(a.tempsFort)}>{tags.emoji(a.tempsFort)}</span>
              <span className="hbody">
                <b>{p ? `#${p.num} ${p.name}` : '—'}</b>
                <em><span className="htf-l">{tags.label(a.tempsFort)}</span> · {d.t}</em>
              </span>
              <button className={`hplay ${hasClip ? 'has' : ''}`} title={hasClip ? 'Revoir le clip' : 'Clip à synchroniser'} onClick={() => playClip(a)}>▶</button>
              <button className="hadd" title="Ajouter au montage" onClick={() => addToMontage(a)}>⭐</button>
              <button className="hedit" title="Corriger" onClick={() => {
                setActions((arr) => arr.filter((x) => x.id !== a.id));
                subtractActionFromScore(a);
                restoreDraftFromAction(a);
                flash('Action ouverte en correction');
                const mId = liveMatchIdRef.current;
                const tId = liveTeamIdRef.current;
                if (mId && tId) {
                  deleteLiveAction({ matchId: mId, clientActionId: a.id }).catch(() => {});
                  const nextActions = actions.filter((x) => x.id !== a.id);
                  const cur = perQ[a.q] || { us: 0, them: 0 };
                  const nextPerQ = { ...perQ, [a.q]: { us: cur.us - ptsOf(a), them: cur.them - themPtsOf(a) } };
                  syncLiveAggregates(nextActions, onCourt, nextPerQ);
                }
              }}>↩</button>
              <button className="hdel" title="Supprimer" onClick={() => removeAction(a.id)}>✕</button>
            </div>
          );
        })}
      </div>
    );
  }

  function renderMatrix() {
    const list = mxFiltered();
    const tfKeys = (tags.active && tags.active.length ? tags.active.map((t: any) => t.key) : TEMPS.map((t) => t.id));
    const cellActions = mxCell ? list.filter((a) => a.tempsFort === mxCell.tf && mxCat(a) === mxCell.cat) : [];
    return (
      <div className="mx-wrap">
        <div className="mx-filters">
          <select value={mxPlayer} onChange={(e) => { setMxPlayer(e.target.value); setMxCell(null); }}>
            <option value="all">Tous les joueurs</option>
            {roster.map((p) => <option key={p.id} value={p.id}>#{p.num} {p.name}</option>)}
          </select>
          <select value={mxPeriod} onChange={(e) => { setMxPeriod(e.target.value); setMxCell(null); }}>
            <option value="all">Toutes périodes</option>
            {Object.keys(perQ).map((k) => <option key={k} value={k}>{periodLabel(+k)}</option>)}
          </select>
          <select value={mxSide} onChange={(e) => { setMxSide(e.target.value as any); setMxCell(null); }}>
            <option value="all">Attaque + Défense</option>
            <option value="attaque">Attaque</option>
            <option value="defense">Défense</option>
          </select>
          <select value={mxShotRes} onChange={(e) => { setMxShotRes(e.target.value as any); setMxCell(null); }}>
            <option value="all">Tirs : tous</option>
            <option value="made">Marqués</option>
            <option value="missed">Ratés</option>
          </select>
          <select value={mxShotType} onChange={(e) => { setMxShotType(e.target.value as any); setMxCell(null); }}>
            <option value="all">Type : tous</option>
            <option value="2PTS">2 PTS</option>
            <option value="3PTS">3 PTS</option>
            <option value="LF">LF</option>
          </select>
        </div>
        <div className="mx-scroll">
          <table className="mx-table">
            <thead>
              <tr><th className="mx-corner">Temps fort</th>{MX_COLS.map((c) => <th key={c.id}>{c.label}</th>)}<th>Pts</th><th>Pts/Act</th></tr>
            </thead>
            <tbody>
              {tfKeys.map((tf: string) => {
                const rows = list.filter((a) => a.tempsFort === tf);
                if (!rows.length) return null;
                const pts = rows.reduce((s, a) => s + ptsOf(a), 0);
                const ppa = rows.length ? pts / rows.length : 0;
                return (
                  <tr key={tf}>
                    <th className="mx-row" style={{ color: tags.color(tf) }}>{tags.emoji(tf)} {tags.label(tf)}</th>
                    {MX_COLS.map((c) => {
                      const n = rows.filter((a) => mxCat(a) === c.id).length;
                      const on = mxCell && mxCell.tf === tf && mxCell.cat === c.id;
                      return <td key={c.id} className={`mx-cell ${n ? 'has' : ''} ${on ? 'on' : ''}`} onClick={() => n && setMxCell(on ? null : { tf, cat: c.id })}>{n || ''}</td>;
                    })}
                    <td className="mx-pts">{pts}</td>
                    <td className={`mx-ppa ${ppa >= 1.1 ? 'good' : ppa > 0 && ppa < 0.85 ? 'bad' : ''}`}>{ppa ? ppa.toFixed(2) : '—'}</td>
                  </tr>
                );
              })}
              {list.length === 0 && <tr><td className="mx-empty" colSpan={MX_COLS.length + 3}>Aucune action (avec ces filtres).</td></tr>}
            </tbody>
          </table>
        </div>
        {mxCell && (
          <div className="mx-pop" onClick={() => setMxCell(null)}>
            <div className="mx-pop-card" onClick={(e) => e.stopPropagation()}>
              <div className="mx-detail-head">
                <b>{tags.emoji(mxCell.tf)} {tags.label(mxCell.tf)} · {MX_COLS.find((c) => c.id === mxCell.cat)?.label}</b>
                <button onClick={() => setMxCell(null)}>×</button>
              </div>
              <div className="mx-pop-list">
                {cellActions.length === 0 ? <div className="hist-empty">Aucune action.</div> : cellActions.map((a) => {
                  const p = find(a.playerId);
                  const hasClip = a.videoTime != null || a.clipStart != null;
                  return (
                    <div className="mx-arow" key={a.id}>
                      <span className="htime">{periodLabel(a.q)} {a.clock}</span>
                      <span className="hbody"><b>{p ? `#${p.num} ${p.name}` : '—'}</b><em>{describe(a, find).t}</em></span>
                      <button className={`hplay ${hasClip ? 'has' : ''}`} title={hasClip ? 'Revoir le clip' : 'Clip à synchroniser'} onClick={() => playClip(a)}>▶</button>
                      <button className="hadd" title="Ajouter au montage" onClick={() => addToMontage(a)}>⭐</button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderMontage() {
    return (
      <div className="mo-wrap">
        <div className="mo-meta">
          <input className="mo-title" value={montageTitle} onChange={(e) => setMontageTitle(e.target.value)} placeholder="Titre du montage (thème, joueur, temps fort…)" />
          <textarea className="mo-note" value={montageNote} onChange={(e) => setMontageNote(e.target.value)} placeholder="Note coach…" />
          <div className="mo-status">
            <span className="mo-badge">🎬 {montageItems.length} clip{montageItems.length > 1 ? 's' : ''}</span>
            <span className="mo-badge pending">⏳ Export à venir</span>
            <button className="mo-save" disabled={montageSaving || !montageItems.length} onClick={saveMontage}>{montageSaving ? '⏳ …' : '💾 Enregistrer'}</button>
          </div>
        </div>
        <div className="mo-list">
          {montageItems.length === 0
            ? <div className="hist-empty">Ajoute des clips depuis l'Historique ou la Matrice (bouton ＋).</div>
            : montageItems.map((it, idx) => (
              <div className="mo-item" key={it.caid}>
                <span className="mo-num">{idx + 1}</span>
                <div className="mo-body">
                  <b>{it.label}</b><small>{it.sub}</small>
                  <input className="mo-inote" value={it.note} placeholder="Note sur ce clip…" onChange={(e) => setMontageItemNote(it.caid, e.target.value)} />
                </div>
                <div className="mo-ctrl">
                  <button disabled={idx === 0} onClick={() => moveMontageItem(idx, -1)}>▲</button>
                  <button disabled={idx === montageItems.length - 1} onClick={() => moveMontageItem(idx, 1)}>▼</button>
                  <button className="rm" onClick={() => removeMontageItem(it.caid)}>✕</button>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
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
        return <>{head("Défense sur l'écran", 'Comment défend-on le pick ?')}<div className="grid c3">{resolveCodingButtons('coverage', codingDb).map((c) => <button key={c.key} className={`chip ${draft.coverage === c.key ? 'active' : ''}`} onClick={() => covPick(c.key)}>{c.emoji ? c.emoji + ' ' : ''}{c.label}</button>)}</div></>;
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
        const cfg = resolveCodingButtons(draft.context === 'defense' ? 'def-action' : 'att-action', codingDb);
        const opts = cfg.map((b) => ({ id: b.key, label: b.label, ic: b.emoji }));
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

      /* --- V5 vidéo : choix à la création --- */
      .vid-modes {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        margin-top: 8px;
      }
      .vmode {
        display: grid;
        gap: 3px;
        text-align: left;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.03);
        border-radius: 12px;
        padding: 12px;
        cursor: pointer;
        color: var(--ink, #f4efe8);
      }
      .vmode:hover { border-color: rgba(212, 162, 76, 0.5); }
      .vmode.on { border-color: var(--gold); background: rgba(212, 162, 76, 0.12); }
      .vmode .vm-ic { font-size: 20px; }
      .vmode .vm-tt { font-weight: 900; font-size: 13px; }
      .vmode .vm-sub { font-size: 11px; color: var(--mute); }
      .vid-input { margin-top: 10px; display: grid; gap: 6px; }
      .vid-file { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; cursor: pointer; }
      .vid-file input[type="file"] { display: none; }
      .vf-btn {
        border: 1px solid var(--gold);
        color: var(--gold);
        border-radius: 8px;
        padding: 8px 12px;
        font-weight: 900;
        font-size: 12px;
        white-space: nowrap;
      }
      .vf-name { font-size: 12px; color: var(--mute); }
      .vid-yt {
        width: 100%;
        background: rgba(0, 0, 0, 0.25);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 8px;
        padding: 9px 11px;
        color: var(--ink, #f4efe8);
        font: inherit;
        font-size: 13px;
      }
      .vid-ok { font-size: 12px; color: #46c17f; font-weight: 800; margin: 0; }
      .vid-warn { font-size: 12px; color: #e0a13a; font-weight: 800; margin: 0; }
      .vid-note { font-size: 11px; color: var(--mute); margin: 0; }
      .vid-badge {
        margin-left: 10px;
        align-self: center;
        border-radius: 999px;
        padding: 5px 11px;
        font-size: 11px;
        font-weight: 900;
        white-space: nowrap;
        border: 1px solid transparent;
      }
      .vid-badge.is-local { background: rgba(70, 193, 127, 0.16); color: #46c17f; border-color: rgba(70, 193, 127, 0.4); }
      .vid-badge.is-yt { background: rgba(224, 63, 63, 0.16); color: #f07171; border-color: rgba(224, 63, 63, 0.4); }
      .vid-badge.is-later { background: rgba(212, 162, 76, 0.14); color: var(--gold); border-color: rgba(212, 162, 76, 0.4); }

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

      /* ===================== V6 · Studio layout ===================== */
      .mtabs { display: none; }

      /* ===================== V7 · Workspace à onglets ===================== */
      .wtabs { flex: 0 0 auto; display: flex; gap: 4px; padding: 6px 10px; background: #0c1020; border-bottom: 1px solid var(--border); overflow-x: auto; }
      .wtab { flex: 0 0 auto; border: 1px solid var(--border); background: transparent; color: var(--mute); border-radius: 9px; padding: 7px 12px; font-size: 12.5px; font-weight: 800; cursor: pointer; white-space: nowrap; }
      .wtab.on { background: var(--bordeaux); color: #fff; border-color: var(--bordeaux); }

      /* ===================== V7.1 · Layout live 25 / 50 / 25 ===================== */
      .live3 { flex: 1; min-height: 0; display: grid; grid-template-columns: 25% 50% 25%; gap: 8px; padding: 8px 10px; overflow: hidden; }
      .lc { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

      /* -- Gauche : codage compact/dense -- */
      .lc-head { flex: 0 0 auto; padding: 7px 8px; border-bottom: 1px solid var(--border); }
      .crumb-mini { display: flex; flex-wrap: wrap; gap: 3px; }
      .cm { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .02em; color: var(--mute); opacity: .5; white-space: nowrap; }
      .cm::after { content: '›'; margin-left: 3px; opacity: .5; }
      .cm:last-child::after { content: ''; }
      .cm.done { color: var(--gold); opacity: .9; } .cm.cur { color: #fff; opacity: 1; }
      .lc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }
      .lc-foot { flex: 0 0 auto; display: grid; grid-template-columns: 1fr 1fr; gap: 5px; padding: 6px 8px; border-top: 1px solid var(--border); }
      .backBtn.sm { align-self: flex-start; font-size: 11px; padding: 4px 8px; }
      .qbtn.sm { padding: 6px 4px; font-size: 11px; min-height: 0; }

      /* Codage DENSE : boutons petits, façon scouting pro */
      .codeDense .grid { gap: 5px; }
      .codeDense .grid.c2, .codeDense .grid.c3 { grid-template-columns: repeat(2, 1fr); }
      .codeDense .bt { min-height: 0 !important; height: auto !important; flex-direction: row; justify-content: flex-start; gap: 7px; padding: 8px 9px !important; border-radius: 8px; }
      .codeDense .bt .ic { font-size: 15px !important; }
      .codeDense .bt .lbl { font-size: 12px !important; font-weight: 700; text-align: left; }
      .codeDense .grid.big { grid-template-columns: 1fr 1fr; }
      .codeDense .grid.big .bt { min-height: 0 !important; height: auto !important; padding: 12px 10px !important; }
      .codeDense .chip { padding: 7px 9px; font-size: 12px; }
      .codeDense .seg { gap: 4px; }
      .codeDense .segb { padding: 7px 6px; font-size: 12px; }
      .codeDense .res { padding: 9px 10px; font-size: 13px; }
      .codeDense .pl { min-height: 0 !important; height: auto !important; flex-direction: row; justify-content: flex-start; gap: 6px; padding: 6px 8px !important; }
      .codeDense .pl .nm { font-size: 12px; }
      .codeDense .wztitle { font-size: 15px; }
      .codeDense .wzsub { font-size: 11px; }
      .codeDense .wzstep { font-size: 9px; }

      /* Joueurs compacts dans la colonne codage */
      .lc-players { flex: 0 0 auto; border-top: 1px solid var(--border); padding: 6px 8px; display: grid; gap: 4px; }
      .lcp-row { display: flex; gap: 4px; overflow-x: auto; }
      .pchip.xs { flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--ink); cursor: pointer; font-size: 11px; }
      .pchip.xs .num { font-weight: 900; }
      .pchip.xs.active { border-color: var(--gold); background: rgba(212,162,76,.16); }
      .pchip.xs.swap { outline: 1px dashed var(--gold); }
      .pchip.xs.bench { opacity: .8; }
      .pchip.xs.bench.sel { opacity: 1; border-color: var(--gold); background: rgba(212,162,76,.16); }
      .pbtoggle.xs { flex: 0 0 auto; width: 24px; height: 24px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--mute); cursor: pointer; }
      .pbtoggle.xs.on { border-color: var(--gold); color: var(--gold); }

      /* -- Centre : vidéo prioritaire + contrôles + shot chart zones -- */
      .lc-center { padding: 8px; gap: 8px; }
      .videoSlot.big { flex: 1 1 auto; min-height: 200px; }
      .vbar { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; justify-content: center; padding: 4px 0; flex-wrap: wrap; }
      .vbar .vnav { border: 1px solid var(--border); background: var(--card); color: var(--ink); border-radius: 8px; padding: 7px 12px; font-weight: 800; font-size: 12px; cursor: pointer; }
      .vbar .vstep { display: flex; align-items: center; gap: 4px; }
      .vbar .vstep > span { font-size: 10px; color: var(--mute); font-weight: 800; text-transform: uppercase; }
      .vbar .vstep button { border: 1px solid var(--border); background: var(--card); color: var(--ink); border-radius: 6px; padding: 4px 8px; font-size: 11px; font-weight: 800; cursor: pointer; }
      .vbar .vstep button.on { background: var(--gold); color: #201b19; border-color: var(--gold); }
      .vbar .vstep input { width: 46px; border-radius: 6px; border: 1px solid var(--border); background: var(--card); color: var(--ink); padding: 3px 5px; font: inherit; font-size: 11px; }

      .scZone { flex: 0 0 auto; }
      .scZone-live .courtSlotHead { font-size: 11px; color: var(--gold); text-transform: uppercase; margin-bottom: 3px; }

      /* Popup zone (clic sur une zone du shot chart) */
      .zpop { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: grid; place-items: center; z-index: 60; padding: 20px; }
      .zpop-card { width: min(460px, 92vw); max-height: 80vh; background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
      .zpop-head { display: flex; align-items: center; justify-content: space-between; font-size: 13px; }
      .zpop-head button { border: 0; background: transparent; color: var(--mute); font-size: 18px; cursor: pointer; }
      .zpop-filters { display: flex; gap: 4px; flex-wrap: wrap; }
      .zpop-filters button { border: 1px solid var(--border); background: var(--card); color: var(--mute); border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 800; cursor: pointer; }
      .zpop-filters button.on { background: var(--bordeaux); color: #fff; border-color: var(--bordeaux); }
      .zpop-list { overflow: auto; display: flex; flex-direction: column; gap: 4px; }

      /* -- Droite : analyse (sous-onglets) -- */
      .lc-analysis { padding: 0; }
      .an-tabs { flex: 0 0 auto; display: flex; gap: 4px; padding: 6px; border-bottom: 1px solid var(--border); }
      .an-tab { flex: 1; border: 1px solid var(--border); background: transparent; color: var(--mute); border-radius: 8px; padding: 6px 4px; font-size: 12px; font-weight: 800; cursor: pointer; }
      .an-tab.on { background: var(--bordeaux); color: #fff; border-color: var(--bordeaux); }
      .an-body { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
      .an-body .hist { padding: 6px; overflow-y: auto; }

      /* Popup matrice */
      .mx-pop { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: grid; place-items: center; z-index: 60; padding: 20px; }
      .mx-pop-card { width: min(460px, 92vw); max-height: 80vh; background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 12px; display: flex; flex-direction: column; }
      .mx-pop-list { overflow: auto; }
      .mx-ppa { font-weight: 900; }
      .mx-ppa.good { color: var(--green); } .mx-ppa.bad { color: var(--red); }

      .studio2 { flex: 1; min-height: 0; display: grid; grid-template-columns: 46% 54%; gap: 8px; padding: 8px 10px; overflow: hidden; }
      .colWork { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

      /* Contrôles de saut vidéo + navigation */
      .vctrls { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 6px 10px; background: linear-gradient(transparent, rgba(0,0,0,0.72)); }
      .vstep { display: flex; align-items: center; gap: 4px; }
      .vstep > span { font-size: 10px; color: #cdd6e6; font-weight: 800; text-transform: uppercase; }
      .vstep button { border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.08); color: #eaf0ff; border-radius: 6px; padding: 3px 7px; font-size: 11px; font-weight: 800; cursor: pointer; }
      .vstep button.on { background: var(--gold); color: #201b19; border-color: var(--gold); }
      .vstep input { width: 48px; border-radius: 6px; border: 1px solid rgba(255,255,255,.22); background: #12151f; color: #fff; padding: 2px 5px; font: inherit; font-size: 11px; }
      .vnudge { display: flex; gap: 4px; margin-left: auto; }
      .vnudge button { border: 1px solid rgba(255,255,255,.22); background: rgba(255,255,255,.08); color: #eaf0ff; border-radius: 6px; padding: 3px 9px; font-size: 11px; font-weight: 800; cursor: pointer; }

      /* Historique enrichi (chrono + temps vidéo + temps fort + joueur + action) */
      .hrow2 { display: grid; grid-template-columns: 40px 58px 20px minmax(0,1fr) 24px 24px 24px 24px; align-items: center; gap: 6px; padding: 6px 8px; background: var(--card); border: 1px solid var(--border); border-radius: 9px; margin-bottom: 5px; }
      .hvtime { font-size: 10px; color: var(--gold); font-weight: 800; white-space: nowrap; }
      .htf { font-size: 15px; text-align: center; }
      .htf-l { font-weight: 800; }
      .hadd { width: 24px; height: 24px; border-radius: 6px; border: 1px solid var(--gold); background: transparent; color: var(--gold); cursor: pointer; font-size: 13px; font-weight: 900; }
      .hplay.has { color: var(--gold); border-color: var(--gold); }

      /* Matrice */
      .mx-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: 8px; gap: 8px; }
      .mx-filters { display: flex; flex-wrap: wrap; gap: 6px; }
      .mx-filters select { border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; font: inherit; font-size: 12px; background: var(--card); color: var(--ink); }
      .mx-scroll { flex: 1; min-height: 0; overflow: auto; border: 1px solid var(--border); border-radius: 10px; }
      .mx-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .mx-table th, .mx-table td { border-bottom: 1px solid var(--border); padding: 7px 8px; text-align: center; }
      .mx-table thead th { position: sticky; top: 0; background: #0c1020; color: var(--mute); font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; z-index: 1; }
      .mx-corner, .mx-row { text-align: left !important; white-space: nowrap; }
      .mx-row { font-weight: 800; }
      .mx-cell { cursor: default; color: var(--mute); }
      .mx-cell.has { cursor: pointer; color: var(--ink); font-weight: 800; }
      .mx-cell.has:hover { background: rgba(212,162,76,.14); }
      .mx-cell.on { background: var(--gold); color: #201b19; }
      .mx-tot { font-weight: 800; }
      .mx-pts { font-weight: 900; color: var(--gold); }
      .mx-empty { color: var(--mute); padding: 20px; }
      .mx-detail { flex: 0 0 auto; max-height: 210px; overflow: auto; border: 1px solid var(--border); border-radius: 10px; padding: 8px; background: var(--card); }
      .mx-detail-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 12.5px; }
      .mx-detail-head button { border: 0; background: transparent; color: var(--mute); font-size: 16px; cursor: pointer; }
      .mx-arow { display: grid; grid-template-columns: 84px minmax(0,1fr) 24px 24px; align-items: center; gap: 6px; padding: 5px 4px; border-top: 1px dashed var(--border); }

      /* Montage (in-live) */
      .mo-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: 8px; gap: 8px; }
      .mo-meta { display: grid; gap: 6px; }
      .mo-title { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 14px; font-weight: 700; background: var(--card); color: var(--ink); }
      .mo-note { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 13px; min-height: 46px; resize: vertical; background: var(--card); color: var(--ink); }
      .mo-status { display: flex; align-items: center; gap: 6px; }
      .mo-badge { font-size: 11.5px; font-weight: 800; border-radius: 999px; padding: 4px 10px; background: rgba(212,162,76,.14); color: var(--gold); }
      .mo-badge.pending { background: rgba(255,255,255,.06); color: var(--mute); }
      .mo-save { margin-left: auto; border: 1px solid var(--gold); background: var(--gold); color: #201b19; border-radius: 8px; padding: 7px 12px; font-weight: 800; font-size: 12.5px; cursor: pointer; }
      .mo-save:disabled { opacity: .5; cursor: not-allowed; }
      .mo-list { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 6px; }
      .mo-item { display: grid; grid-template-columns: 24px minmax(0,1fr) auto; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 9px; padding: 7px 9px; background: var(--card); }
      .mo-num { width: 22px; height: 22px; border-radius: 50%; background: var(--bordeaux); color: #fff; font-size: 11px; font-weight: 900; display: grid; place-items: center; }
      .mo-body { min-width: 0; display: grid; gap: 3px; }
      .mo-body b { font-size: 12.5px; }
      .mo-body small { font-size: 11px; color: var(--mute); }
      .mo-inote { border: 1px solid var(--border); border-radius: 6px; padding: 4px 7px; font: inherit; font-size: 11.5px; background: var(--panel); color: var(--ink); }
      .mo-ctrl { display: flex; gap: 4px; }
      .mo-ctrl button { border: 1px solid var(--border); background: var(--panel); border-radius: 6px; cursor: pointer; font-size: 11px; width: 24px; height: 24px; }
      .mo-ctrl button:disabled { opacity: .35; cursor: not-allowed; }
      .mo-ctrl .rm { color: var(--red); border-color: #e6b9b9; }

      /* Joueurs (onglet) */
      .pl-wrap { flex: 1; min-height: 0; overflow: auto; padding: 10px; display: flex; flex-direction: column; gap: 12px; }
      .pl-sec .miniTitle { display: flex; align-items: center; justify-content: space-between; }
      .pl-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }

      .studio {
        flex: 1;
        min-height: 0;
        display: grid;
        grid-template-columns: 22% 48% 30%;
        gap: 8px;
        padding: 8px 10px 6px;
        overflow: hidden;
      }

      .col {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 12px;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }

      .colHead {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
      }
      .colHead h3 {
        margin: 0;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mute);
      }
      .colCount {
        font-size: 11px;
        font-weight: 800;
        color: var(--gold);
        background: rgba(212, 162, 76, 0.12);
        border-radius: 999px;
        padding: 1px 8px;
      }

      /* ---------- Historique compact ---------- */
      .hist {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 6px;
      }
      .hrow {
        display: grid;
        grid-template-columns: 34px 8px minmax(0, 1fr) 22px 22px 22px;
        align-items: center;
        gap: 6px;
        max-height: 52px;
        padding: 6px 7px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 8px;
      }
      .htime { font-size: 11px; color: var(--mute); font-variant-numeric: tabular-nums; }
      .hdot { width: 8px; height: 8px; border-radius: 50%; background: var(--mute); }
      .hdot.b-made, .hdot.b-ft { background: var(--green); }
      .hdot.b-miss, .hdot.b-to, .hdot.b-foul { background: var(--red); }
      .hdot.b-ast { background: var(--gold); }
      .hdot.b-stl, .hdot.b-def { background: #4a90d9; }
      .hdot.b-neutral { background: var(--mute); }
      .hbody { min-width: 0; display: flex; flex-direction: column; line-height: 1.15; }
      .hbody b { font-size: 12px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .hbody em { font-size: 10.5px; font-style: normal; color: var(--mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .hplay, .hedit, .hdel {
        width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--border);
        background: transparent; color: var(--mute); cursor: pointer; font-size: 11px;
        display: grid; place-items: center;
      }
      .hplay { color: var(--gold); }
      .hplay:disabled { opacity: 0.35; cursor: not-allowed; }
      .hedit:hover, .hplay:hover:not(:disabled) { border-color: var(--gold); color: var(--gold); }
      .hdel:hover { border-color: var(--red); color: var(--red); }
      .hist-empty { color: var(--mute); font-size: 12px; padding: 10px; text-align: center; }

      /* ---------- Centre : vidéo + terrain ---------- */
      .colCenter { gap: 8px; padding: 8px; }
      .videoSlot {
        flex: 0 0 auto;
        height: 300px;
        max-height: 46vh;
        border-radius: 10px;
        overflow: hidden;
        background: #05070e;
        border: 1px solid var(--border);
        display: flex;
        flex-direction: column;
        position: relative;
      }
      .vplayer { width: 100%; height: 100%; object-fit: contain; background: #000; }
      .vctrls { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: linear-gradient(transparent, rgba(0,0,0,0.6)); }
      .vname { font-size: 11px; color: #dfe6f5; font-weight: 700; }
      .vyt { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #dfe6f5; }
      .vyt-ic { font-size: 34px; }
      .vyt-tx { font-weight: 800; }
      .vyt-open { font-size: 12px; color: var(--gold); text-decoration: none; border: 1px solid var(--gold); border-radius: 8px; padding: 5px 12px; }
      .vempty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 16px; text-align: center; }
      .vempty-tt { font-size: 16px; font-weight: 900; color: #eaf0ff; }
      .vempty-sub { font-size: 12px; color: var(--mute); max-width: 340px; }
      .vempty-btns { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 4px; }
      .vbtn {
        border: 1px solid var(--gold); color: var(--gold); background: transparent;
        border-radius: 9px; padding: 8px 14px; font-weight: 800; font-size: 13px; cursor: pointer;
        display: inline-flex; align-items: center; gap: 6px;
      }
      .vbtn input[type="file"] { display: none; }
      .vbtn.ghosty { border-color: var(--border); color: var(--mute); }
      .vbtn:hover { filter: brightness(1.1); }

      .courtSlot {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .courtSlotHead { flex: 0 0 auto; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mute); }
      .courtSlotHead span { color: var(--gold); }

      /* ---------- Droite : codification progressive ---------- */
      .colCoding { padding: 0; }
      .crumbBar {
        flex: 0 0 auto;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        padding: 8px 10px;
        border-bottom: 1px solid var(--border);
      }
      .crumb {
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        color: var(--mute);
        opacity: 0.55;
        white-space: nowrap;
      }
      .crumb::after { content: '›'; margin-left: 4px; opacity: 0.5; }
      .crumb:last-child::after { content: ''; }
      .crumb.done { color: var(--gold); opacity: 0.9; }
      .crumb.cur { color: #fff; opacity: 1; }

      .codingBody {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .codingFoot {
        flex: 0 0 auto;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        padding: 8px 10px;
        border-top: 1px solid var(--border);
      }

      /* ---------- Bas : joueurs en chips compactes ---------- */
      .playersBar {
        flex: 0 0 auto;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px;
        padding: 0 10px 8px;
      }
      .pbSection {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 6px 8px;
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        overflow: hidden;
      }
      .pbSection.bench { background: #0c1020; }
      .pbLabel { flex: 0 0 auto; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--mute); writing-mode: vertical-rl; transform: rotate(180deg); }
      .pbChips { display: flex; gap: 6px; overflow-x: auto; padding: 2px; min-width: 0; }
      .pchip {
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px 5px 5px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--card);
        color: var(--ink);
        cursor: pointer;
        white-space: nowrap;
      }
      .pchip .num { font-weight: 900; font-size: 12px; }
      .pchip .nm { font-size: 12px; }
      .pchip.active { border-color: var(--gold); background: rgba(212, 162, 76, 0.16); }
      .pchip.swap { outline: 1px dashed var(--gold); }
      .pchip.bench { opacity: 0.82; }
      .pchip.bench.sel { opacity: 1; border-color: var(--gold); background: rgba(212, 162, 76, 0.16); }
      .pbtoggle { flex: 0 0 auto; width: 30px; height: 30px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); color: var(--mute); cursor: pointer; font-size: 14px; }
      .pbtoggle.on { border-color: var(--gold); color: var(--gold); }

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
      .courtbox { max-height: 220px; }

      /* ===================== V6/V7.1 · Responsive ===================== */
      @media (max-width: 1200px) {
        .studio { grid-template-columns: 30% 70%; grid-template-rows: minmax(0, 1fr); }
        .studio2 { grid-template-columns: 40% 60%; }
        .live3 { grid-template-columns: 28% 44% 28%; }
        .colHistory { display: none; }
        .colCenter { order: 2; }
        .colCoding { order: 1; }
        .videoSlot { height: 240px; }
      }

      @media (max-width: 900px) {
        .mtabs, .wtabs { display: flex; }
        .wtabs { gap: 4px; }
        .mtab {
          flex: 1;
          border: 1px solid var(--border);
          background: transparent;
          color: var(--mute);
          border-radius: 8px;
          padding: 7px 4px;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
        }
        .mtab.on { background: var(--bordeaux); color: #fff; border-color: var(--bordeaux); }
        .wtab { flex: 1; text-align: center; }

        .studio { grid-template-columns: 1fr; }
        .studio2 { grid-template-columns: 1fr; grid-auto-rows: min-content; overflow-y: auto; }
        .hrow2 { grid-template-columns: 38px 20px minmax(0,1fr) 22px 22px 22px 22px; }
        .hvtime { display: none; }
        .colCenter, .colWork { min-height: 0; }
        .colHistory { display: none; }
        .playersBar { display: none; }
        .videoSlot { height: 200px; max-height: 40vh; }
        .courtbox { max-height: 180px; }

        /* live3 → une colonne, pilotée par les onglets .wtabs */
        .live3 { grid-template-columns: 1fr; }
        .lc { display: none; }
        .lc.mshow { display: flex; }
        .codeDense .grid.c2, .codeDense .grid.c3 { grid-template-columns: repeat(3, 1fr); }
        .videoSlot.big { min-height: 210px; }
      }

      @media (max-width: 560px) {
        .h-r .ghost { padding: 6px 8px; font-size: 11px; }
        .vempty-tt { font-size: 14px; }
        .videoSlot { height: 170px; }
        .codeDense .grid.c2, .codeDense .grid.c3 { grid-template-columns: repeat(2, 1fr); }
      }

    `}</style>
  );
}