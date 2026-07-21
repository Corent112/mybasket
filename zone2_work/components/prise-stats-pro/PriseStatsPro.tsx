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
  saveProjectState,
  listProjects,
  loadProject,
  deleteProject,
  type LiveProjectSummary,
  type LiveMatchAction,
} from "@/lib/stats-supabase";
import { listPlaybooks, listPlaybookSystems, type Playbook, type PlaybookSystem } from "@/lib/playbook";
import { useLivestatTags } from "@/lib/livestat-tags";
import ActionClipsModal, { type ClipAction } from "@/components/prise-stats-pro/ActionClipsModal";
import VideoSyncModal from "@/components/prise-stats-pro/VideoSyncModal";
import ShotChart, { SHOT_ZONES, zoneById, resolveShotZone } from "@/components/prise-stats-pro/ShotChart";
import {
  type VideoSyncState,
  NATIVE_SYNC,
  normalizeSync,
  resolveActionClipBounds,
  resolveSyncedVideoTime,
  syncToProjectState,
  formatOffset,
} from "@/lib/video-sync";

/* Safari/WebKit peut exposer un TimeRanges vide sous le nom interne
 * `EmptyRanges`. Certaines opérations vidéo détachées peuvent alors tenter
 * de résoudre ce symbole global. Ce petit fallback évite le ReferenceError
 * sans modifier la logique vidéo ni les données du match. */
class MyBasketEmptyRanges {
  readonly length = 0;
  start(_index: number): number { throw new DOMException('IndexSizeError', 'IndexSizeError'); }
  end(_index: number): number { throw new DOMException('IndexSizeError', 'IndexSizeError'); }
}

if (typeof globalThis !== 'undefined' && !(globalThis as any).EmptyRanges) {
  (globalThis as any).EmptyRanges = MyBasketEmptyRanges;
}

/* ============================ Types ============================ */
interface Player { id: string; num: number; name: string; pos: string; photo?: string }
type Ctx = '' | 'attaque' | 'defense';

interface Draft {
  context: Ctx; systemeJeu: string; inbound: string; tempsFort: string; coverage: string;
  playerId: string | null; actionType: string;
  shotType: string; shotResult: string; specialCase: string;
  ftAttempts: number; ftMade: number; ftResults: string[];
  zone: string; courtX: number | null; courtY: number | null;
  reboundType: string; reboundPlayerId: string | null;
  assist: boolean | null; assistPlayerId: string | null;
  foulOutcome: string;
  // AJOUT §2 · playbook, système mappé, bornes de possession, joueur adverse
  playbookId?: string | null;
  systemeSlot?: string | null;
  systemeId?: string | null;
  systemeName?: string | null;
  possessionStart?: number | null;
  possessionEnd?: number | null;
  opponentPlayerId?: string | null;
  opponentPlayerName?: string | null;
  opponentPlayerNumber?: string | null;
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
const SYSTEMES_JEU = [
  { id: 'contre-attaque', label: 'Contre attaque', ic: '⚡' },
  { id: 'transition', label: 'Transition', ic: '🏃' },
  { id: 'systeme-1', label: 'Système 1', ic: '①' },
  { id: 'systeme-2', label: 'Système 2', ic: '②' },
  { id: 'systeme-3', label: 'Système 3', ic: '③' },
  { id: 'systeme-4', label: 'Système 4', ic: '④' },
  { id: 'systeme-5', label: 'Système 5', ic: '⑤' },
  { id: 'systeme-6', label: 'Système 6', ic: '⑥' },
  { id: 'systeme-7', label: 'Système 7', ic: '⑦' },
  { id: 'systeme-8', label: 'Système 8', ic: '⑧' },
  // AJOUT §3 · remises en jeu
  { id: 'slob-1', label: 'SLOB 1', ic: '🅢' },
  { id: 'slob-2', label: 'SLOB 2', ic: '🅢' },
  { id: 'blob-1', label: 'BLOB 1', ic: '🅑' },
  { id: 'blob-2', label: 'BLOB 2', ic: '🅑' },
];

const TEMPS = [
  {
    id: "pick_side",
    label: "Pick Side",
    icon: "🏃",
  },
  {
    id: "pick_top",
    label: "Pick Top",
    icon: "🏃",
  },
  {
    id: "pick_non_porteur",
    label: "Pick non porteur",
    icon: "🏃",
  },
  {
    id: "one_vs_one",
    label: "1v1",
    icon: "🏀",
  },
  {
    id: "hand_off",
    label: "Hand Off",
    icon: "🤝",
  },
  {
    id: "drive_kick",
    label: "Drive & Kick",
    icon: "🎯",
  },
  {
    id: "jeu_sans_ballon",
    label: "Jeu sans ballon",
    icon: "✂️",
  },
  {
    id: "rebond_offensif",
    label: "Rebond offensif",
    icon: "🔄",
  },
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

const NAV = ['Contexte', 'Système de jeu', 'Temps fort', 'Joueur', "Type d'action", 'Résultat', 'Où ?', 'Conséquence'];
const STAGE_NAV: Record<string, number> = {
  context: 0, inbound: 1, systeme: 1, temps: 2, coverage: 2, player: 3, action: 4, faute: 4, result: 5, ft: 5, zone: 6, rebound: 7, assist: 7,
};
const emptyDraft = (): Draft => ({
  context: '', systemeJeu: '', inbound: '', tempsFort: '', coverage: '', playerId: null, actionType: '',
  shotType: '', shotResult: '', specialCase: 'aucun', ftAttempts: 0, ftMade: 0, ftResults: [],
  zone: '', courtX: null, courtY: null, reboundType: '', reboundPlayerId: null, assist: null, assistPlayerId: null, foulOutcome: '',
  // AJOUT §2
  playbookId: null, systemeSlot: null, systemeId: null, systemeName: null,
  possessionStart: null, possessionEnd: null,
  opponentPlayerId: null, opponentPlayerName: null, opponentPlayerNumber: null,
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
  /* ══════════════ AJOUT §12 · Effectif adverse temporaire ══════════════
     Optionnel. Permet de nommer les joueurs adverses (numéro + nom) pour
     leur attribuer les tirs concédés en défense, sans créer d'équipe en base.
     Persisté dans project_state (aucune table supplémentaire). */
  const [oppRoster, setOppRoster] = useState<{ id: string; num: string; name: string }[]>([]);
  const [oppNumInput, setOppNumInput] = useState('');
  const [oppNameInput, setOppNameInput] = useState('');
  const addOppPlayer = () => {
    const num = oppNumInput.trim();
    if (!num) return;
    if (oppRoster.some((p) => p.num === num)) { flash('Numéro déjà présent'); return; }
    setOppRoster((r) => [...r, { id: 'opp_' + num, num, name: oppNameInput.trim() || ('Adv. #' + num) }]);
    setOppNumInput(''); setOppNameInput('');
  };
  const removeOppPlayer = (id: string) => setOppRoster((r) => r.filter((p) => p.id !== id));
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

  /* -------- Synchro vidéo ajoutée APRÈS le codage (offset/dérive au niveau match) --------
     On ne modifie JAMAIS les temps bruts des actions : cette synchro convertit,
     à la lecture, un temps de codage (source) en position réelle dans la vidéo. */
  const [videoSync, setVideoSyncState] = useState<VideoSyncState>(NATIVE_SYNC);
  const videoSyncRef = useRef<VideoSyncState>(NATIVE_SYNC);
  const setVideoSync = (s: VideoSyncState) => { videoSyncRef.current = s; setVideoSyncState(s); };
  const [showVideoSync, setShowVideoSync] = useState(false);

  // Accès synchrone dans commit() (le state est async) + base de temps vidéo.
  const videoProviderRef = useRef('none');
  const matchStartAtRef = useRef<number | null>(null);
  const VIDEO_PRE_ROLL = 6;   // s avant l'action (préparation du clip)
  const VIDEO_POST_ROLL = 4;  // s après l'action

  // Sélection d'un fichier vidéo local (objectURL, pas d'upload réel en V5).
  // Ne réinitialise NI les actions NI les bornes de clips : on ne fait que
  // rattacher une source vidéo. Sert aussi à re-sélectionner la vidéo d'un
  // projet rouvert (l'URL blob: d'origine ne survit pas au rechargement).
  const onPickVideoFile = (file: File | null) => {
    if (!file) return;
    setVideoFile(file);
    setVideoFilename(file.name);
    try { setVideoUrl(URL.createObjectURL(file)); } catch { setVideoUrl(''); }
    setVideoProvider('local');
    videoProviderRef.current = 'local';
    setVideoStatus('ready');

    // §3/§8 · Vidéo ajoutée APRÈS le codage : si des actions existent déjà et
    // que la synchro n'a pas encore été validée, on ouvre automatiquement la
    // fenêtre « Synchroniser la vidéo avec le codage ». Si elle est déjà validée
    // (réouverture d'un projet), on applique directement le décalage sauvegardé
    // et on ne redemande rien (bouton « Recalibrer la vidéo » disponible).
    const already = videoSyncRef.current.validated ?? videoSyncRef.current.mode !== 'native';
    if (actions.length > 0 && !already) {
      setTimeout(() => setShowVideoSync(true), 60);
    }
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
  //
  // IMPORTANT · ce sont des temps SOURCE du codage (pas encore des temps média).
  // Même SANS vidéo, chaque action reçoit une chronologie source exploitable :
  //   - vidéo présente → position réelle du lecteur ;
  //   - aucune vidéo   → temps écoulé depuis le début du codage.
  // La conversion en temps média (offset/dérive) se fait UNIQUEMENT à la lecture,
  // via resolveActionClipBounds. On n'applique donc jamais videoSyncOffset ici.
  const stampVideo = (): { videoTime: number | null; clipStart: number | null; clipEnd: number | null; syncStatus: string | null } => {
    // Horloge source commune (jamais décalée par la synchro).
    const t = getRawCodingTime();
    if (t == null) {
      // Le codage n'a pas encore démarré (pas de coup d'envoi) → aucun repère.
      return { videoTime: null, clipStart: null, clipEnd: null, syncStatus: 'pending' };
    }

    // IMPORTANT · on NE met PAS la vidéo en pause. Chaque action ne fait que
    // RELEVER la borne de fin de possession (possessionEnd = t) : le clip
    // [possessionStart, possessionEnd] reste découpé et retrouvable ensuite.
    // Repli sur le pré-roll/post-roll si aucune possession n'a été ouverte.
    const start = possessionStartRef.current;
    return {
      videoTime: t,
      clipStart: start != null ? Math.max(0, start) : Math.max(0, t - VIDEO_PRE_ROLL),
      clipEnd: start != null ? Math.max(t, start) : t + VIDEO_POST_ROLL,
      // Sans vidéo, les temps existent mais devront être synchronisés plus tard.
      syncStatus: videoProviderRef.current === 'none' ? 'awaiting-video' : 'prepared',
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

  // Boutons "temps fort" du wizard, dérivés de la config dynamique par équipe
  // (livestat_tags via useLivestatTags). key = id stable ; label/emoji renommables
  // depuis Management > Codification sans casser les stats. Fallback constantes
  // intégré dans useLivestatTags → jamais vide, jamais de key brute affichée.
  // Temps forts officiels LiveStat : on force la liste fixe demandée ici.
  // Les anciens tags Supabase peuvent encore exister, mais ne doivent pas
  // réafficher Fast Break / Transition / Jeu placé dans ce wizard.
  const tempsFortsButtons = TEMPS.map((t) => ({
  id: t.id,
  label: t.label,
  ic: t.icon,
}));

  /* ---------------- V7 · ergonomie vidéo + workspace à onglets ---------------- */
  // Onglet de travail visible dans l'écran live (desktop + mobile).
  const [workTab, setWorkTab] = useState<'coding' | 'center' | 'analysis'>('coding');

  // Lecteur vidéo local + saut réglable + Tab+flèches.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const clipVideoRef = useRef<HTMLVideoElement | null>(null); // vidéo du popup "revoir séquence"
  const detachedVideoWindowRef = useRef<Window | null>(null);
  const detachedVideoChannelRef = useRef<BroadcastChannel | null>(null);
  const [videoStepSeconds, setVideoStepSeconds] = useState(5);
  const [videoStepCustom, setVideoStepCustom] = useState(false);
  const tabHeldRef = useRef(false);

  /* ══════════════════ AJOUT · Vidéo détachée : horloge partagée ══════════════════
     Une seule source de vérité pour le timecode : le lecteur détaché quand il est
     ouvert, sinon le lecteur principal. Le moteur de codage lit toujours cette
     horloge, donc les clips restent corrects quelle que soit la fenêtre utilisée. */
  const [videoDetached, setVideoDetached] = useState(false);
  const detachedTimeRef = useRef(0);
  const detachedPlayingRef = useRef(false);
  const [playbackRate, setPlaybackRateState] = useState(1);
  // Début de possession (timecode vidéo), posé à l'ouverture de l'étape Système.
  const possessionStartRef = useRef<number | null>(null);
  // Nettoyage de l'arrêt automatique d'un clip en cours.
  const clipStopRef = useRef<(() => void) | null>(null);

  /* ══════════════ AJOUT · PROJET RÉOUVRABLE (brouillon Supabase) ══════════════
     L'état complet du match est sauvegardé dans match_stats.project_state.
     Tant qu'on n'a pas cliqué « Terminer », le match reste 'draft' et
     n'alimente pas les statistiques officielles de la fiche équipe. */
  /* ══════════════ AJOUT · PLAYBOOK & MAPPING DES SYSTÈMES (§8) ══════════════
     Chaque bouton "Système N" du wizard est un SLOT à id stable (systeme-1…).
     À la création du match on associe un playbook, puis chaque slot est mappé
     sur un vrai système du playbook. Le codage enregistre le slot (id stable)
     ET le système réel (id + nom), donc renommer un système ne casse rien. */
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [playbookId, setPlaybookId] = useState<string>('');
  const [playbookSystems, setPlaybookSystems] = useState<PlaybookSystem[]>([]);
  // slot ('systeme-1') → id du système du playbook
  const [systemMapping, setSystemMapping] = useState<Record<string, string>>({});

  const systemForSlot = (slot: string): PlaybookSystem | undefined => {
    const sid = systemMapping[slot];
    return sid ? playbookSystems.find((s) => s.id === sid) : undefined;
  };

  // Boutons du wizard : libellé réel si le slot est mappé, sinon libellé par défaut.
  const systemeButtons = SYSTEMES_JEU.map((s) => {
    const mapped = systemForSlot(s.id);
    return { id: s.id, label: mapped ? mapped.title : s.label, ic: s.ic };
  });

  const [projects, setProjects] = useState<LiveProjectSummary[]>([]);
  const [projectBusy, setProjectBusy] = useState(false);
  const projectSaveRef = useRef<number | null>(null);

  const buildProjectState = () => ({
    v: 1,
    teamId: activeTeamId || teamId,
    teamName,
    opponent,
    date,
    home,
    q,
    secs,
    perQ,
    onCourt,
    minutesByPlayer,
    actions,
    stage,
    draft,
    videoMode,
    videoProvider,
    videoUrl,
    videoFilename,
    youtubeUrl,
    playbookId,        // AJOUT §8
    playbookName: playbooks.find((pb) => pb.id === playbookId)?.title ?? null, // Bloc C
    systemMapping,     // AJOUT §8
    oppRoster,         // AJOUT §12
    clipEdits,         // §25 · notes / rognage / dessins par action (persistés)
    montageItems,      // Bloc C · montage restauré à la reprise
    montageTitle,
    montageNote,
    // AJOUT · synchro vidéo (offset/dérive) pour rouvrir le brouillon au bon décalage
    ...syncToProjectState(videoSyncRef.current),
    // AJOUT · horloge SOURCE du codage : temps écoulé depuis le coup d'envoi.
    // Permet de reprendre un brouillon codé SANS vidéo sans remettre l'horloge à
    // zéro (les nouvelles actions gardent une chronologie cohérente).
    codingElapsed: matchStartAtRef.current == null ? 0 : (Date.now() - matchStartAtRef.current) / 1000,
    savedAt: new Date().toISOString(),
  });

  const persistProjectState = () => {
    const matchId = liveMatchIdRef.current;
    if (!matchId) return;
    saveProjectState({
      matchId,
      state: buildProjectState(),
      playbookId: playbookId || null,        // AJOUT §8
      systemMapping,                          // AJOUT §8
      videoSync: videoSyncRef.current,        // AJOUT · miroir colonnes video_sync_*
    }).catch(() => {});
  };

  const refreshProjects = async (tId: string) => {
    if (!isSupabaseUuid(tId)) { setProjects([]); return; }
    const list = await listProjects({ teamId: tId, status: 'draft' });
    setProjects(list);
  };

  const resumeProject = async (matchId: string, mode: 'resume' | 'analysis' | 'montage' = 'resume') => {
    setProjectBusy(true);
    try {
      const res = await loadProject(matchId);
      if (!res.ok) { flash('Projet illisible : ' + res.error); return; }
      const s = res.state as Record<string, any>;
      const tId = String(s.teamId || teamId);
      const team = teams.find((t) => t.id === tId);
      if (!team) { flash('Équipe du projet introuvable.'); return; }

      setActiveTeamId(team.id);
      setTeamId(team.id);
      setRoster(team.players);
      setTeamName(String(s.teamName || team.name));
      setOpponent(String(s.opponent || ''));
      setDate(String(s.date || date));
      setHome(s.home ?? true);
      setQ(Number(s.q || 1));
      setSecs(Number(s.secs ?? 600));
      setPerQ(s.perQ || { 1: { us: 0, them: 0 } });
      setOnCourt(Array.isArray(s.onCourt) ? s.onCourt : []);
      setMinutesByPlayer(s.minutesByPlayer || {});
      setActions(Array.isArray(s.actions) ? s.actions : []);
      setStage(String(s.stage || 'context'));
      setDraft(s.draft || emptyDraft());
      setRunning(false);

      // AJOUT §8 · restauration du playbook et du mapping des systèmes
      setPlaybookId(res.playbookId || String(s.playbookId || ''));
      const mapping = (Object.keys(res.systemMapping || {}).length
        ? res.systemMapping
        : (s.systemMapping || {})) as Record<string, string>;
      setSystemMapping(mapping);
      setOppRoster(Array.isArray(s.oppRoster) ? s.oppRoster : []); // AJOUT §12
      setClipEdits((s.clipEdits && typeof s.clipEdits === 'object') ? s.clipEdits : {}); // §25 · annotations

      // Bloc C · restauration des réglages vidéo. Une URL locale (blob:) n'est
      // jamais restaurable après rechargement : on force le provider à 'none' et
      // on prévient l'utilisateur. YouTube, lui, est restaurable.
      const provider = String(s.videoProvider || 'none');
      setVideoMode(String(s.videoMode || 'later') as any);
      setVideoFilename(String(s.videoFilename || ''));
      setYoutubeUrl(String(s.youtubeUrl || ''));

      // AJOUT §8 · restauration de la synchro vidéo (colonnes prioritaires, sinon
      // project_state). Le décalage sauvegardé est réappliqué immédiatement dès
      // que la vidéo locale sera resélectionnée ; on ne redemande pas la synchro.
      setVideoSync(normalizeSync(res.videoSync ?? s));

      if (provider === 'youtube' && s.youtubeUrl) {
        setVideoProvider('youtube'); setVideoUrl(String(s.videoUrl || s.youtubeUrl));
        videoProviderRef.current = 'youtube';
      } else {
        setVideoProvider('none'); setVideoUrl('');
        videoProviderRef.current = 'none';
        if (provider === 'local') flash('Projet restauré. Resélectionne le fichier vidéo local — le décalage de synchronisation sera réappliqué automatiquement.');
      }

      // Bloc C · restauration du montage.
      if (Array.isArray(s.montageItems)) setMontageItems(s.montageItems);
      if (s.montageTitle) setMontageTitle(String(s.montageTitle));
      if (s.montageNote != null) setMontageNote(String(s.montageNote));

      setLiveMatch(matchId, team.id);
      // AJOUT · on NE remet PAS l'horloge source à zéro : on la recale sur le
      // temps de codage déjà écoulé (codingElapsed), pour poursuivre un brouillon
      // codé sans vidéo avec une chronologie source continue.
      matchStartAtRef.current = Date.now() - Number(s.codingElapsed ?? 0) * 1000;
      possessionStartRef.current = null;

      // Mode d'ouverture demandé depuis l'Historique.
      if (mode === 'analysis') { setScreen('box'); flash('Projet ouvert en analyse'); }
      else if (mode === 'montage') { setScreen('box'); setShowMontagePanel(true); flash('Montage ouvert'); }
      else { setScreen('live'); flash('Projet rouvert — reprends le codage'); }
    } finally {
      setProjectBusy(false);
    }
  };

  // Bloc C · ouverture depuis Management → Historique via ?project=<id>&mode=<...>.
  // Attend que les équipes soient chargées, puis déclenche une seule fois.
  const urlProjectHandled = useRef(false);
  useEffect(() => {
    if (urlProjectHandled.current) return;
    if (typeof window === 'undefined') return;
    if (!teams.length) return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('project');
    if (!pid) return;
    const mode = (params.get('mode') || 'resume') as 'resume' | 'analysis' | 'montage';
    const tab = params.get('tab'); // 'history' | 'players' | null
    if (tab === 'players') setInitialBoxTab('box');
    else if (tab === 'history') setInitialBoxTab('team');
    urlProjectHandled.current = true;
    resumeProject(pid, mode);
    // Nettoie l'URL pour ne pas rouvrir au prochain render.
    try { window.history.replaceState({}, '', window.location.pathname); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  const removeProject = async (matchId: string) => {
    if (!window.confirm('Supprimer définitivement ce brouillon ?')) return;
    setProjectBusy(true);
    const res = await deleteProject(matchId);
    setProjectBusy(false);
    if (res.ok) { flash('Brouillon supprimé'); refreshProjects(activeTeamId || teamId); }
    else flash('Suppression impossible');
  };

  const postVideo = (msg: Record<string, unknown>) => {
    try { detachedVideoChannelRef.current?.postMessage(msg); } catch { /* noop */ }
  };
  const hasVideoLoaded = () => videoProvider !== 'none' && !!videoUrl;
  const getCurrentVideoTime = (): number => {
    if (videoDetached) return detachedTimeRef.current;
    const v = clipVideoRef.current || videoRef.current;
    return v ? v.currentTime || 0 : 0;
  };

  // HORLOGE SOURCE COMMUNE du codage (temps BRUT, jamais décalé par la synchro).
  //   - vidéo présente (locale/détachée/popup) → position réelle du lecteur ;
  //   - aucune vidéo → temps réel écoulé depuis le coup d'envoi du codage.
  // Renvoie null uniquement si le codage n'a pas encore démarré.
  const getRawCodingTime = (): number | null => {
    if (matchStartAtRef.current == null) return null;
    const hasVideoPlayer =
      videoDetached ||
      Boolean(clipVideoRef.current) ||
      (videoProviderRef.current === 'local' && Boolean(videoRef.current));
    if (hasVideoPlayer) {
      return Math.max(0, getCurrentVideoTime());
    }
    return Math.max(0, (Date.now() - matchStartAtRef.current) / 1000);
  };
  const isVideoPlaying = (): boolean => {
    if (videoDetached) return detachedPlayingRef.current;
    const v = videoRef.current;
    return !!v && !v.paused && !v.ended;
  };
  const seekVideo = (t: number) => {
    const time = Math.max(0, t);
    if (videoDetached) { detachedTimeRef.current = time; postVideo({ type: 'seek', time }); return; }
    const v = clipVideoRef.current || videoRef.current;
    if (v) { try { v.currentTime = time; } catch { /* noop */ } }
  };
  const playVideo = () => {
    if (videoDetached) { detachedPlayingRef.current = true; postVideo({ type: 'cmd-play' }); return; }
    const v = clipVideoRef.current || videoRef.current;
    v?.play().catch(() => {});
  };
  const pauseVideo = () => {
    if (videoDetached) { detachedPlayingRef.current = false; postVideo({ type: 'cmd-pause' }); return; }
    const v = clipVideoRef.current || videoRef.current;
    v?.pause();
  };
  const setPlaybackRate = (r: number) => {
    setPlaybackRateState(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
    postVideo({ type: 'rate', rate: r });
  };
  // Image dans l'image (fallback explicite si le navigateur refuse).
  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v || typeof document === 'undefined' || !document.pictureInPictureEnabled) {
      flash("Image dans l'image non supportée par ce navigateur.");
      return;
    }
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch { flash("Image dans l'image refusée par le navigateur."); }
  };

  /* AJOUT · Lecture d'un clip borné : démarre à clipStart, s'arrête à clipEnd.
     Fonctionne sur le lecteur principal, le lecteur détaché et la popup clip. */
  const playActionClip = (a: StatA) => {
    // Bornes DÉJÀ synchronisées (source → position réelle dans la vidéo). On ne
    // lit jamais clipStart/clipEnd bruts sans passer par la synchronisation.
    const bounds = resolveActionClipBounds(a, videoSyncRef.current);
    const start = bounds.start;
    const end = bounds.end;
    if (!hasVideoLoaded() || start == null) { flash('Clip à synchroniser'); return; }
    if (videoProvider === 'youtube') { flash('YouTube lié — repère à ' + fmt(Math.round(start))); return; }

    clipStopRef.current?.();
    clipStopRef.current = null;

    if (videoDetached) {
      detachedTimeRef.current = start;
      detachedPlayingRef.current = true;
      postVideo({ type: 'clip', start, end });
    } else {
      const v = clipVideoRef.current || videoRef.current;
      if (!v) { flash('Clip à synchroniser'); return; }
      try { v.currentTime = start; } catch { /* noop */ }
      v.play().catch(() => {});
      if (end != null) {
        const onTick = () => {
          if (v.currentTime >= end) {
            v.pause();
            v.removeEventListener('timeupdate', onTick);
            clipStopRef.current = null;
          }
        };
        v.addEventListener('timeupdate', onTick);
        clipStopRef.current = () => v.removeEventListener('timeupdate', onTick);
      }
    }
    flash('Clip ' + fmt(Math.round(start)) + (end != null ? ' → ' + fmt(Math.round(end)) : ''));
  };

  const hasLocalVideo = () => (videoProvider === 'local' && !!videoRef.current) || !!clipVideoRef.current;
  const nudgeVideo = (dir: -1 | 1) => {
    // Priorité à la vidéo du popup clip si elle est ouverte, sinon la vidéo centrale.
    const v = clipVideoRef.current || (videoProvider === 'local' ? videoRef.current : null);
    if (!v) return;
    const dur = Number.isFinite(v.duration) ? v.duration : Infinity;
    v.currentTime = Math.max(0, Math.min(dur, v.currentTime + dir * videoStepSeconds));
  };

  // Revoir un clip : place la vidéo locale à clip_start (ou videoTime) ; sinon message.
  // Conservé pour compat : délègue à la lecture bornée clipStart → clipEnd.
  const playClip = (a: StatA) => playActionClip(a);

  // Filtres matrice (agissent sur les actions LOCALES pendant le match).
  const [mxPlayer, setMxPlayer] = useState('all');
  const [mxPeriod, setMxPeriod] = useState('all');
  const [mxSide, setMxSide] = useState<'all' | 'attaque' | 'defense'>('all');
  const [mxShotRes, setMxShotRes] = useState<'all' | 'made' | 'missed'>('all');
  const [mxShotType, setMxShotType] = useState<'all' | '2PTS' | '3PTS' | 'LF'>('all');
  const [mxCell, setMxCell] = useState<{ tf: string; cat: string } | null>(null);
  // V7.1 · sous-onglet de la colonne analyse (droite) + zone shot chart sélectionnée
  const [analysisTab, setAnalysisTab] = useState<'history' | 'timeline' | 'matrix' | 'montage'>('history');
  const [zoneSel, setZoneSel] = useState<string | null>(null);
  const [showTimelinePanel, setShowTimelinePanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showMontagePanel, setShowMontagePanel] = useState(false);
  const [montageFull, setMontageFull] = useState(false); // AJOUT §5 · montage plein écran (second écran)
  const [zoneFilter, setZoneFilter] = useState<'all' | 'made' | 'missed'>('all');
  // V8 · timeline Sportscode : événement sélectionné (popup revoir/modifier)
  const [evtSel, setEvtSel] = useState<string | null>(null);
  // §25 · popup clips commune (Historique + Timeline). BoxView a la sienne branchée
  // sur la même modale pour Matrice/Boxscore/Shot chart.
  const [clipModal, setClipModal] = useState<{ title: string; items: StatA[]; index: number } | null>(null);
  // Bloc C · onglet Boxscore à ouvrir quand on arrive depuis l'Historique (tab=).
  const [initialBoxTab, setInitialBoxTab] = useState<'box' | 'team' | null>(null);
  const openClipModal = (title: string, items: StatA[], index = 0) => {
    if (!items.length) return;
    setClipModal({ title, items, index });
  };
  // V8 · édition de clip locale (hors match_actions) : rognage / note coach / dessins.
  // Clé = id d'action ; stockée séparément, jamais persistée dans match_actions.
  type ClipDraw = { id: string; tool: 'arrow' | 'circle' | 'rect' | 'text'; x1: number; y1: number; x2: number; y2: number; text?: string };
  type ClipEdit = { trimStart: number | null; trimEnd: number | null; note: string; draws: ClipDraw[] };
  const [clipEdits, setClipEdits] = useState<Record<string, ClipEdit>>({});
  const [drawTool, setDrawTool] = useState<'arrow' | 'circle' | 'rect' | 'text' | null>(null);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);

  const getClipEdit = (id: string): ClipEdit => clipEdits[id] || { trimStart: null, trimEnd: null, note: '', draws: [] };
  const setClipEdit = (id: string, upd: Partial<ClipEdit>) =>
    setClipEdits((prev) => ({ ...prev, [id]: { ...getClipEdit(id), ...upd } }));

  // Navigation précédent / suivant dans la liste chronologique des actions.
  const gotoEvt = (dir: -1 | 1) => {
    if (!evtSel) return;
    const idx = actions.findIndex((x) => x.id === evtSel);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= actions.length) return;
    setEvtSel(actions[j].id);
    setDrawTool(null);
  };

  // Montage en cours (reçoit des actions LOCALES pendant le match).
  const [montageTitle, setMontageTitle] = useState('Nouveau montage');
  const [montageNote, setMontageNote] = useState('');
  const [montageItems, setMontageItems] = useState<{ caid: string; label: string; sub: string; note: string; clipStart: number | null; clipEnd: number | null }[]>([]);
  const [montageSaving, setMontageSaving] = useState(false);
  // V8 · rechargement d'un montage existant depuis Supabase.
  const [montageId, setMontageId] = useState<string | null>(null);      // montage en cours d'édition (null = nouveau)
  const [savedMontages, setSavedMontages] = useState<{ id: string; title: string; coach_note: string | null }[]>([]);
  const [montageLoading, setMontageLoading] = useState(false);

  const addToMontage = (a: StatA) => {
    const p = find(a.playerId);
    const label = `${tags.label(a.tempsFort) || '—'} · ${describe(a, find).t}`;
    const sub = [periodLabel(a.q), a.clock, p ? `#${p.num} ${p.name}` : null].filter(Boolean).join(' · ');
    // Reprend le rognage + la note saisis dans la popup clip (édition locale),
    // sinon retombe sur les repères auto de l'action.
    const ce = clipEdits[a.id];
    const cs = (ce?.trimStart ?? a.clipStart) ?? null;
    const cEnd = (ce?.trimEnd ?? a.clipEnd) ?? null;
    const note = ce?.note || '';
    setMontageItems((prev) => {
      const existing = prev.find((x) => x.caid === a.id);
      if (existing) {
        flash('Clip mis à jour dans le montage');
        return prev.map((x) => (x.caid === a.id ? { ...x, label, sub, clipStart: cs, clipEnd: cEnd, note: note || x.note } : x));
      }
      flash('Ajouté au montage');
      return [...prev, { caid: a.id, label, sub, note, clipStart: cs, clipEnd: cEnd }];
    });
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

  // Bloc 6 · élément sélectionné dans le storyboard (pour le panneau Propriétés).
  const [montageSel, setMontageSel] = useState<string | null>(null);
  // Mise à jour générique d'un item du montage (titre/note/rognage).
  const updateMontageItem = (caid: string, patch: Partial<{ label: string; note: string; clipStart: number | null; clipEnd: number | null }>) =>
    setMontageItems((prev) => prev.map((x) => (x.caid === caid ? { ...x, ...patch } : x)));
  // Ajoute un élément non-vidéo (diapo couleur / image / texte). Persiste dans le
  // schéma EXISTANT : client_action_id synthétique + titre/note. Pas de colonne
  // supplémentaire → aucune migration Supabase requise. Le texte est conservé.
  const addMontageElement = (kind: 'slide' | 'image' | 'text') => {
    const caid = `${kind}_${uid()}`;
    const label = kind === 'slide' ? '🟥 Diapo couleur' : kind === 'image' ? '🖼 Image' : '✎ Texte';
    setMontageItems((prev) => [...prev, { caid, label, sub: 'Élément', note: '', clipStart: null, clipEnd: null }]);
    setMontageSel(caid);
    flash(kind === 'slide' ? 'Diapo ajoutée' : kind === 'image' ? 'Image ajoutée' : 'Texte ajouté');
  };

  const openMontageWindow = () => {
    const w = window.open('', 'mybasket-montage-window', 'width=1380,height=860');
    if (!w) { flash('Popup bloquée par le navigateur.'); return; }

    // §7 · Le montage conserve les bornes ORIGINALES (clipStart/clipEnd bruts) et
    // expose EN PLUS les bornes synchronisées (mediaStart/mediaEnd), calculées à
    // l'export via la synchro du match. On ne duplique ni ne modifie les clips.
    const items = montageItems.map((item, index) => ({
      ...item,
      index: index + 1,
      mediaStart: resolveSyncedVideoTime(item.clipStart, videoSyncRef.current),
      mediaEnd: resolveSyncedVideoTime(item.clipEnd, videoSyncRef.current),
    }));
    const itemsJson = JSON.stringify(items).replace(/</g, '\\u003c');
    const titleJson = JSON.stringify(montageTitle || 'Nouveau montage');
    const noteJson = JSON.stringify(montageNote || '');

    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>MyBasket · Montage</title><style>
      *{box-sizing:border-box}html,body{margin:0;height:100%;background:#07101f;color:#fff;font-family:Inter,system-ui,sans-serif}
      header{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;background:#111827;border-bottom:1px solid #293449}
      header b{font-size:20px}.app{display:grid;grid-template-columns:270px 1fr 330px;height:calc(100% - 64px)}
      aside,.props{padding:18px;background:#0b1424;overflow:auto}.props{border-left:1px solid #263044}aside{border-right:1px solid #263044}
      main{padding:20px;overflow:auto}.preview{height:52%;border-radius:18px;background:#000;display:grid;place-items:center;border:1px solid #263044;color:#65718a}
      .timeline{margin-top:18px;display:flex;gap:10px;overflow:auto;padding:12px;background:#0b1424;border-radius:14px}
      .clip{min-width:210px;padding:12px;border:1px solid #33415d;border-radius:12px;background:#111b2d}.clip b{display:block;color:#f0bd55;margin-bottom:6px}
      button,input,textarea{font:inherit}.tool{width:100%;padding:11px;margin:0 0 8px;border-radius:10px;border:1px solid #33415d;background:#172238;color:#fff;text-align:left;cursor:pointer}
      input,textarea{width:100%;padding:10px;border-radius:10px;border:1px solid #33415d;background:#08111f;color:#fff;margin-bottom:12px}textarea{min-height:110px}
      .export{padding:11px 16px;border:0;border-radius:10px;background:#d4a24c;color:#10131d;font-weight:900;cursor:pointer}
    </style></head><body><header><b>🎬 MyBasket Montage</b><button class="export" id="export">Exporter le projet</button></header><div class="app"><aside><h3>Bibliothèque</h3><button class="tool">＋ Ajouter un titre</button><button class="tool">＋ Ajouter une image</button><button class="tool">✎ Ajouter du texte</button><button class="tool">➜ Outil dessin</button><button class="tool">✂ Rogner un clip</button></aside><main><div class="preview">Aperçu du montage</div><div class="timeline" id="timeline"></div></main><div class="props"><h3>Projet</h3><label>Titre</label><input id="title"><label>Notes</label><textarea id="note"></textarea><p style="color:#94a3b8;font-size:12px">Les clips sélectionnés dans LiveStat apparaissent dans la timeline.</p></div></div><script>
      const items=${itemsJson}; const timeline=document.getElementById('timeline');
      document.getElementById('title').value=${titleJson}; document.getElementById('note').value=${noteJson};
      timeline.innerHTML=items.length?items.map(x=>'<div class="clip"><b>'+x.index+'. '+String(x.label||'Clip')+'</b><small>'+String(x.sub||'')+'</small><p>'+String(x.note||'')+'</p></div>').join(''):'<div style="color:#65718a">Aucun clip sélectionné.</div>';
      document.getElementById('export').onclick=()=>{ const data={title:document.getElementById('title').value,note:document.getElementById('note').value,items}; const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})); a.download='montage-mybasket.json'; a.click(); };
    <\/script></body></html>`);
    w.document.close();
  };

  const saveMontage = async () => {
    const tId = activeTeamId || teamId;
    if (!montageItems.length) { flash('Ajoute au moins un clip.'); return; }
    if (!isSupabaseUuid(tId)) { flash('Équipe non Supabase — montage gardé en local.'); return; }
    setMontageSaving(true);
    try {
      const supabase = createClient();
      let mId = montageId;

      if (mId) {
        // Mise à jour d'un montage existant : titre/note + on remplace ses items.
        const { error: upErr } = await supabase
          .from('livestat_montages')
          .update({ title: montageTitle, coach_note: montageNote || null })
          .eq('id', mId);
        if (upErr) { flash('Maj impossible : ' + upErr.message); setMontageSaving(false); return; }
        await supabase.from('livestat_montage_items').delete().eq('montage_id', mId);
      } else {
        const { data, error } = await supabase
          .from('livestat_montages')
          .insert({ team_id: tId, match_id: liveMatchIdRef.current, title: montageTitle, coach_note: montageNote || null, status: 'draft' })
          .select('id').single();
        if (error || !data) { flash('Montage non enregistré : ' + (error?.message || '')); setMontageSaving(false); return; }
        mId = data.id;
        setMontageId(mId);
      }

      const payload = montageItems.map((it, i) => ({
        montage_id: mId, match_id: liveMatchIdRef.current, client_action_id: it.caid,
        sort_order: i, title: it.label, note: it.note || null, clip_start: it.clipStart, clip_end: it.clipEnd,
      }));
      const { error: itErr } = await supabase.from('livestat_montage_items').insert(payload);
      if (itErr) { flash('Clips non enregistrés : ' + itErr.message); }
      else { flash(montageId ? 'Montage mis à jour ✓' : 'Montage enregistré ✓'); loadMontageList(); }
    } catch (e: any) {
      flash('Erreur : ' + (e?.message || 'montage'));
    } finally {
      setMontageSaving(false);
    }
  };

  // Liste des montages sauvegardés de l'équipe (pour le sélecteur).
  const loadMontageList = async () => {
    const tId = activeTeamId || teamId;
    if (!isSupabaseUuid(tId)) return;
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('livestat_montages')
        .select('id,title,coach_note')
        .eq('team_id', tId)
        .order('created_at', { ascending: false });
      setSavedMontages((data ?? []) as { id: string; title: string; coach_note: string | null }[]);
    } catch { /* noop */ }
  };

  // Charge un montage existant + ses items dans l'éditeur.
  const loadMontage = async (id: string) => {
    if (!id) return;
    setMontageLoading(true);
    try {
      const supabase = createClient();
      const { data: m } = await supabase.from('livestat_montages').select('id,title,coach_note').eq('id', id).single();
      const { data: items } = await supabase
        .from('livestat_montage_items')
        .select('client_action_id,sort_order,title,note,clip_start,clip_end')
        .eq('montage_id', id)
        .order('sort_order', { ascending: true });
      if (m) {
        setMontageId(m.id);
        setMontageTitle(m.title || 'Montage');
        setMontageNote(m.coach_note || '');
      }
      setMontageItems((items ?? []).map((it: any) => ({
        caid: it.client_action_id || uid(),
        label: it.title || 'Clip',
        sub: '',
        note: it.note || '',
        clipStart: it.clip_start ?? null,
        clipEnd: it.clip_end ?? null,
      })));
      flash('Montage chargé');
    } catch (e: any) {
      flash('Chargement impossible : ' + (e?.message || ''));
    } finally {
      setMontageLoading(false);
    }
  };

  // Nouveau montage vierge (repart de zéro sans toucher aux montages sauvegardés).
  const newMontage = () => {
    setMontageId(null);
    setMontageTitle('Nouveau montage');
    setMontageNote('');
    setMontageItems([]);
    flash('Nouveau montage');
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

  // V10 · Raccourcis clavier : ESPACE = play/pause vidéo, B = chrono start/stop,
  // SHIFT + flèche = reculer/avancer la vidéo. (Compat V7 : Tab+flèche marche aussi.)
  // On n'intercepte pas quand on tape dans un champ (input/textarea/select).
  const toggleVideo = () => {
    const v = clipVideoRef.current || videoRef.current;
    if (!v) return;

    if (v.paused) {
      // ESPACE démarre uniquement la vidéo. Le chrono reste dans son état actuel.
      v.play().catch(() => {});
      return;
    }

    // ESPACE met la vidéo en pause et coupe aussi le chrono du match.
    v.pause();
    setRunning(false);
  };

  // AJOUT · Touche B / bouton chrono. Le chrono du match doit pouvoir tourner
  // MÊME SANS vidéo : c'est ce qui permet de coder un match en direct et de caler
  // la vidéo après coup. Avec une vidéo, on garde la synchro lecture/pause.
  const toggleClockAndVideo = () => {
    if (!hasVideoLoaded()) {
      // Sans vidéo : simple bascule du chrono (l'horloge source tourne déjà en
      // temps réel depuis le coup d'envoi, cf. getRawCodingTime).
      setRunning((r) => !r);
      return;
    }
    if (running && isVideoPlaying()) { pauseVideo(); setRunning(false); return; }
    if (running && !isVideoPlaying()) { setRunning(false); return; }
    if (!isVideoPlaying()) playVideo();
    setRunning(true);
  };

  // AJOUT · Barre espace. Sans vidéo → bascule seulement le chrono. Avec vidéo :
  // vidéo à l'arrêt → on lance la vidéo ; vidéo en lecture → pause + arrêt chrono.
  const toggleVideoOnly = () => {
    if (!hasVideoLoaded()) { setRunning((r) => !r); return; }
    if (isVideoPlaying()) { pauseVideo(); setRunning(false); }
    else playVideo();
  };

  const detachVideo = () => {
    if (videoProvider === 'youtube' && videoUrl) {
      window.open(videoUrl, 'mybasket-detached-video', 'width=1100,height=720,noopener,noreferrer');
      return;
    }

    const sourceVideo = videoRef.current;
    if (videoProvider !== 'local' || !videoUrl || !sourceVideo) {
      flash('Ajoute une vidéo locale avant de la détacher.');
      return;
    }

    const currentTime = sourceVideo.currentTime || 0;
    const wasPlaying = !sourceVideo.paused;
    sourceVideo.pause();

    const channelName = `mybasket-video-${Date.now()}`;
    detachedVideoChannelRef.current?.close();
    const channel = new BroadcastChannel(channelName);
    detachedVideoChannelRef.current = channel;

    channel.onmessage = (event) => {
      const data = event.data || {};
      // AJOUT · le parent garde en mémoire le timecode + l'état du lecteur détaché :
      // c'est cette horloge que le moteur de codage lit pour borner les clips.
      if (data.type === 'time') {
        detachedTimeRef.current = Number(data.time || 0);
        detachedPlayingRef.current = !!data.playing;
      }
      if (data.type === 'time' && videoRef.current) {
        const v = videoRef.current;
        if (Math.abs((v.currentTime || 0) - Number(data.time || 0)) > 0.35) {
          v.currentTime = Number(data.time || 0);
        }
      }
      if (data.type === 'play') {
        detachedPlayingRef.current = true;
        videoRef.current?.play().catch(() => {});
      }
      if (data.type === 'pause') {
        detachedPlayingRef.current = false;
        videoRef.current?.pause();
        setRunning(false); // sécurité chrono depuis la fenêtre détachée
      }
      if (data.type === 'closed') {
        detachedTimeRef.current = Number(data.time || detachedTimeRef.current || 0);
        detachedPlayingRef.current = false;
        if (videoRef.current) {
          videoRef.current.currentTime = Number(data.time || videoRef.current.currentTime || 0);
          if (data.playing) videoRef.current.play().catch(() => {});
        }
        detachedVideoWindowRef.current = null;
        setVideoDetached(false); // AJOUT · le lecteur principal reprend la main
      }
    };

    const w = window.open('', 'mybasket-detached-video', 'width=1100,height=720');
    if (!w) {
      channel.close();
      detachedVideoChannelRef.current = null;
      flash('Popup bloquée par le navigateur.');
      return;
    }
    detachedVideoWindowRef.current = w;
    // AJOUT · on bascule l'horloge de référence sur la fenêtre détachée.
    detachedTimeRef.current = currentTime;
    detachedPlayingRef.current = wasPlaying;
    setVideoDetached(true);

    const safeUrl = JSON.stringify(videoUrl);
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>MyBasket · Vidéo détachée</title><style>
      html,body{margin:0;height:100%;background:#050813;color:#fff;font-family:system-ui;overflow:hidden}
      .bar{height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#111827;border-bottom:1px solid #263044;font-weight:900}
      .hint{font-size:12px;color:#aab3c5} video{width:100%;height:calc(100% - 48px);background:#000;object-fit:contain}
    </style></head><body><div class="bar"><span>🎥 Vidéo MyBasket</span><span class="hint">ESPACE : lecture/pause · fenêtre synchronisée</span></div><video id="v" src=${safeUrl} controls></video><script>
      if (typeof window.EmptyRanges === 'undefined') {
        window.EmptyRanges = class EmptyRanges {
          constructor(){ this.length = 0; }
          start(){ throw new DOMException('IndexSizeError', 'IndexSizeError'); }
          end(){ throw new DOMException('IndexSizeError', 'IndexSizeError'); }
        };
      }
      const channel = new BroadcastChannel(${JSON.stringify(channelName)});
      const v = document.getElementById('v');
      v.currentTime = ${currentTime};
      ${wasPlaying ? "v.play().catch(()=>{});" : ""}
      let lastSent = 0;
      let clipEnd = null;
      v.playbackRate = ${'${playbackRate}'};
      const sendTime = () => { const now = Date.now(); if(now-lastSent>250){ channel.postMessage({type:'time',time:v.currentTime,playing:!v.paused}); lastSent=now; } };
      // Commandes venues de la fenêtre principale (verrou : on n'y répond pas en boucle).
      channel.onmessage = (ev) => {
        const d = ev.data || {};
        if (d.type === 'seek') { v.currentTime = Math.max(0, Number(d.time||0)); }
        if (d.type === 'cmd-play') { v.play().catch(()=>{}); }
        if (d.type === 'cmd-pause') { v.pause(); }
        if (d.type === 'rate') { v.playbackRate = Number(d.rate||1); }
        if (d.type === 'clip') { clipEnd = (d.end == null ? null : Number(d.end)); v.currentTime = Math.max(0, Number(d.start||0)); v.play().catch(()=>{}); }
      };
      // Arrêt automatique à la fin du clip (jamais de débordement sur la suite).
      v.addEventListener('timeupdate', () => { if (clipEnd != null && v.currentTime >= clipEnd) { v.pause(); clipEnd = null; } });
      v.addEventListener('timeupdate', sendTime);
      v.addEventListener('play', ()=>channel.postMessage({type:'play',time:v.currentTime}));
      v.addEventListener('pause', ()=>channel.postMessage({type:'pause',time:v.currentTime}));
      window.addEventListener('keydown', (e)=>{ if(e.code==='Space'){ e.preventDefault(); if(v.paused){v.play()}else{v.pause()} } });
      window.addEventListener('beforeunload', ()=>channel.postMessage({type:'closed',time:v.currentTime,playing:!v.paused}));
    <\/script></body></html>`);
    w.document.close();
    flash('Vidéo détachée au même timecode');
  };
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (typing(e.target)) return;

      // ESPACE = play/pause vidéo
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); toggleVideoOnly(); return; }
      // B = start/stop du chrono match
      if (e.key === 'b' || e.key === 'B') { e.preventDefault(); toggleClockAndVideo(); return; }

      // SHIFT + flèche = seek vidéo (ou Tab maintenu + flèche, compat V7)
      if (e.key === 'Tab') { if (hasLocalVideo()) { tabHeldRef.current = true; e.preventDefault(); } return; }
      if (e.key === 'ArrowRight' && (e.shiftKey || tabHeldRef.current)) { e.preventDefault(); nudgeVideo(1); return; }
      if (e.key === 'ArrowLeft' && (e.shiftKey || tabHeldRef.current)) { e.preventDefault(); nudgeVideo(-1); return; }
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

  // Charge la liste des montages sauvegardés quand on ouvre l'onglet Montage.
  useEffect(() => {
    if (analysisTab === 'montage') loadMontageList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisTab, activeTeamId, teamId]);

  /* AJOUT · Sécurité chrono : dès que la vidéo principale se met en pause, se
     termine ou tombe en erreur, le chrono du match s'arrête. Le lecteur détaché
     envoie déjà 'pause' sur le canal, qui coupe également le chrono. */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const stop = () => setRunning(false);
    v.addEventListener('pause', stop);
    v.addEventListener('ended', stop);
    v.addEventListener('error', stop);
    return () => {
      v.removeEventListener('pause', stop);
      v.removeEventListener('ended', stop);
      v.removeEventListener('error', stop);
    };
  }, [videoUrl, videoProvider]);

  /* AJOUT · Auto-sauvegarde du projet (debounce 1,5 s) dès qu'une action, le
     score, le chrono ou la rotation changent. Non bloquant : une erreur réseau
     n'interrompt pas la saisie (localStorage reste le filet). */
  useEffect(() => {
    if (screen !== 'live') return;
    if (!liveMatchIdRef.current) return;
    if (projectSaveRef.current) window.clearTimeout(projectSaveRef.current);
    projectSaveRef.current = window.setTimeout(() => { persistProjectState(); }, 1500);
    return () => { if (projectSaveRef.current) window.clearTimeout(projectSaveRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, perQ, q, secs, onCourt, minutesByPlayer, screen, playbookId, systemMapping, oppRoster, clipEdits]);

  /* AJOUT · Playbooks disponibles (écran de création). Non bloquant. */
  useEffect(() => {
    if (screen !== 'setup') return;
    listPlaybooks().then(setPlaybooks).catch(() => setPlaybooks([]));
  }, [screen]);

  /* AJOUT · Systèmes du playbook sélectionné + pré-mapping des slots dans l'ordre. */
  useEffect(() => {
    if (!playbookId) { setPlaybookSystems([]); setSystemMapping({}); return; }
    let alive = true;
    listPlaybookSystems(playbookId)
      .then((list: PlaybookSystem[]) => {
        if (!alive) return;
        setPlaybookSystems(list);
        // AJOUT §7 · pré-remplissage catégorisé : les slots SLOB reçoivent les
        // systèmes SLOB, BLOB les BLOB, et les Système N le reste (demi-terrain).
        const auto: Record<string, string> = {};
        const byCat = (pred: (c: string) => boolean) => list.filter((s) => pred((s.category || '').toUpperCase()));
        const slob = byCat((c) => c.includes('SLOB'));
        const blob = byCat((c) => c.includes('BLOB'));
        const half = byCat((c) => !c.includes('SLOB') && !c.includes('BLOB'));
        ['systeme-1','systeme-2','systeme-3','systeme-4','systeme-5','systeme-6','systeme-7','systeme-8']
          .forEach((slot, i) => { if (half[i]) auto[slot] = half[i].id; });
        ['slob-1','slob-2'].forEach((slot, i) => { if (slob[i]) auto[slot] = slob[i].id; });
        ['blob-1','blob-2'].forEach((slot, i) => { if (blob[i]) auto[slot] = blob[i].id; });
        setSystemMapping(auto);
      })
      .catch(() => { if (alive) { setPlaybookSystems([]); setSystemMapping({}); } });
    return () => { alive = false; };
  }, [playbookId]);

  /* AJOUT §7 · systèmes du playbook proposés pour un slot donné, filtrés par type. */
  const systemsForSlot = (slotId: string): PlaybookSystem[] => {
    const cat = (s: PlaybookSystem) => (s.category || '').toUpperCase();
    if (slotId.startsWith('slob-')) return playbookSystems.filter((s) => cat(s).includes('SLOB'));
    if (slotId.startsWith('blob-')) return playbookSystems.filter((s) => cat(s).includes('BLOB'));
    return playbookSystems.filter((s) => !cat(s).includes('SLOB') && !cat(s).includes('BLOB'));
  };

  /* AJOUT · Liste des brouillons de l'équipe sélectionnée (écran de création). */
  useEffect(() => {
    if (screen !== 'setup') return;
    const tId = teamId;
    if (!tId) return;
    refreshProjects(tId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, teamId]);

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
  const canStart = !!date && !!teamId && !!selTeam && !!opponent.trim() && starters.length === 5;
  const toggleStarter = (id: string) => setStarters((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 5 ? [...s, id] : s));
  const startMatch = () => {
    if (!selTeam) return;
    setActiveTeamId(selTeam.id);
    setTeamId(selTeam.id);
    setRoster(selTeam.players); setTeamName(selTeam.name); setOnCourt(starters.slice());
    setActions([]); setMinutesByPlayer({}); setPerQ({ 1: { us: 0, them: 0 } }); setQ(1); setSecs(600); setRunning(false);
    setDraft(emptyDraft()); setStage('context'); setScreen('live');


    // Le match reste uniquement en brouillon local pendant le live.
    // Aucune ligne Supabase n'est créée avant le clic sur « Terminer ».
    setLiveMatch(null, null);
    videoProviderRef.current = videoProvider;
    matchStartAtRef.current = Date.now();
    ensuringRef.current = false;
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
    // AJOUT §2/§6/§7 · on fige sur l'action les infos système + possession + playbook,
    // pour qu'elles soient identiques partout (state, Supabase, exports, project_state).
    const mappedSys = systemForSlot(d.systemeJeu);
    const enrich: Partial<StatA> = {
      playbookId: playbookId || null,
      systemeSlot: d.systemeJeu || null,
      systemeId: (systemMapping[d.systemeJeu] as string | undefined) ?? null,
      systemeName: mappedSys?.title
        ?? (SYSTEMES_JEU.find((s) => s.id === d.systemeJeu)?.label ?? null),
      possessionStart: vstamp.clipStart ?? null,
      possessionEnd: vstamp.clipEnd ?? null,
    };
    const a: StatA = { ...d, ...enrich, id: uid(), clock: fmt(secs), q, lineup: onCourt.slice(), ...vstamp };
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
          // AJOUT · système joué (valeurs figées au commit, cohérentes partout)
          systemeSlot: a.systemeSlot ?? null,
          systemeId: a.systemeId ?? null,
          systemeName: a.systemeName ?? null,
          playbookId: a.playbookId ?? null,
          possessionStart: a.possessionStart ?? a.clipStart ?? null,
          possessionEnd: a.possessionEnd ?? a.clipEnd ?? null,
          // AJOUT §12 · joueur adverse (tir concédé)
          opponentPlayerId: a.opponentPlayerId ?? null,
          opponentPlayerName: a.opponentPlayerName ?? null,
          opponentPlayerNumber: a.opponentPlayerNumber ?? null,
          actionType: a.actionType, shotType: a.shotType, shotResult: a.shotResult,
          specialCase: a.specialCase, ftAttempts: a.ftAttempts, ftMade: a.ftMade,
          ftResults: a.ftResults, reboundType: a.reboundType,
          reboundPlayerId: a.reboundPlayerId, assist: a.assist,
          assistPlayerId: a.assistPlayerId, foulOutcome: a.foulOutcome,
          zone: a.zone ?? null,
          courtX: a.courtX ?? null, courtY: a.courtY ?? null,
          videoTime: a.videoTime ?? null, clipStart: a.clipStart ?? null,
          clipEnd: a.clipEnd ?? null, syncStatus: a.syncStatus ?? null,
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
    // AJOUT · la possession suivante commence au timecode de bascule du contexte.
    possessionStartRef.current = getRawCodingTime();
    setDraft(fresh); setStage(inbound ? 'inbound' : 'systeme');
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
  const ctxPick = (c: Ctx) => {
    possessionStartRef.current = getRawCodingTime(); // AJOUT · début de possession (temps source)
    setDraft({ ...draft, context: c, systemeJeu: '', tempsFort: '', coverage: '' });
    setStage('systeme');
  };
  const inboundPick = (t: string) => {
    const d = { ...draft, inbound: t };
    if (d.actionType === 'touche') commit(d);
    else { possessionStartRef.current = getRawCodingTime(); setDraft(d); setStage('systeme'); } // AJOUT
  };
  const systemePick = (id: string) => { setDraft({ ...draft, systemeJeu: id, tempsFort: '', coverage: '' }); setStage('temps'); };
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
  const quickShotResult = (shotType: '2PTS' | '3PTS', shotResult: 'made' | 'missed') => {
    const d = { ...draft, actionType: 'tir', shotType, shotResult };

    // Même logique qu'avant : tout tir extérieur à LF passe par la shot chart,
    // y compris en défense pour localiser le panier concédé.
    setDraft(d);
    setStage('zone');
  };

  const resultPick = (r: string) => {
    const d = { ...draft, shotResult: r, actionType: 'tir' };

    // En défense aussi, on localise le tir concédé sur la shot chart.
    // Le point est affiché temporairement pendant l'action puis enregistré
    // dans le boxscore / shot chart défense.
    if (d.context === 'defense') {
      if (d.shotType === 'LF') {
        if (r === 'made') commit(d);
        else { setDraft(d); setStage('rebound'); }
        return;
      }
      setDraft(d);
      setStage('zone');
      return;
    }

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

  // V10.8 · sélection par CLIC EXACT sur la shot chart. Écrit shot_zone_id
  // (draft.zone) + court_x/court_y = point réellement cliqué (repère 0..1).
  // Le point alimente ensuite les agrégats de sa zone (tirs pris / réussis / %).
  // Transition INCHANGÉE.
  const zonePick = (zone: { id: string; cx: number; cy: number }, point?: { x: number; y: number }) => {
    if (stage !== 'zone') return;
    const px = point ? point.x : zone.cx;
    const py = point ? point.y : zone.cy;
    const d = { ...draft, zone: zone.id, courtX: px / 100, courtY: py / 100 };
    if (d.context === 'defense') {
      if (d.shotResult === 'missed') { setDraft(d); setStage('rebound'); }
      else { commit(d); }
      return;
    }
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
      systemeJeu: a.systemeJeu || '',
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
      '\uFEFF' + lines.join('\r\n') + '\r\n\r\n' + actionsCSV(),
      'text/csv;charset=utf-8;',
    );
    flash('Export CSV téléchargé ✓');
  };

  // AJOUT §2 · feuille détaillée des actions (système, temps fort, zone, adversaire).
  const actionsCSV = (): string => {
    const rows: string[] = [];
    rows.push(['QT', 'Chrono', 'Contexte', 'Système', 'SystèmeSlot', 'TempsFort', 'Joueur',
      'Action', 'TypeTir', 'Résultat', 'Zone', 'CourtX', 'CourtY',
      'JoueurAdverse', 'NumAdverse', 'PossStart', 'PossEnd', 'ClipStart', 'ClipEnd'].join(';'));
    actions.forEach((a) => {
      const p = find(a.playerId);
      rows.push([
        periodLabel(a.q), a.clock, a.context,
        a.systemeName || a.systemeSlot || a.systemeJeu || '', a.systemeSlot || a.systemeJeu || '',
        tags.label(a.tempsFort) || a.tempsFort || '',
        p ? `#${p.num} ${p.name}` : '',
        a.actionType || '', a.shotType || '', a.shotResult || '', a.zone || '',
        a.courtX ?? '', a.courtY ?? '',
        a.opponentPlayerName || '', a.opponentPlayerNumber || '',
        a.possessionStart ?? '', a.possessionEnd ?? '', a.clipStart ?? '', a.clipEnd ?? '',
      ].join(';'));
    });
    return rows.join('\r\n');
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
    const startersList = setupRoster.filter((p) => starters.includes(p.id));
    const videoLabel = videoMode === 'file' ? '📁 Fichier vidéo' : videoMode === 'youtube' ? '▶️ Lien YouTube' : '🏟 Aucune sélection';
    return (
      <div className="ps-root">
        <div id="create-match">
          <header className="cm-head">
            <div className="cm-brand"><div className="cm-logo">📊</div><div><div className="cm-t">PRISE DE STATS</div><div className="cm-s">LIVE STATS PRO</div></div></div>
            <div className="cm-head-r"><button className="cm-ghost" type="button">↺ Historique des matchs</button></div>
          </header>

          <div className="cm-body">
            {/* Colonne gauche */}
            <div className="cm-left">
              <div className="cm-hero">
                <div className="cm-hero-ic">🏀</div>
                <div>
                  <div className="cm-eyebrow">NOUVEAU MATCH</div>
                  <h1 className="cm-h1">Créer le match</h1>
                  <p className="cm-sub">Configurez les informations du match et sélectionnez votre 5 majeur.</p>
                </div>
              </div>

              {/* AJOUT · Reprise d'un match en cours (projet brouillon Supabase) */}
              {projects.length > 0 && (
                <section className="cm-card">
                  <div className="cm-card-t">⏸ MATCHS EN COURS <span className="cm-opt">NON TERMINÉS — NON COMPTÉS DANS LES STATS</span></div>
                  <div className="prj-list">
                    {projects.map((pr) => (
                      <div className="prj-row" key={pr.id}>
                        <div className="prj-tx">
                          <b>vs {pr.opponent}</b>
                          <small>{pr.date} · {pr.home ? 'Domicile' : 'Extérieur'} · {pr.us}-{pr.them}</small>
                        </div>
                        <button className="prj-open" disabled={projectBusy} onClick={() => resumeProject(pr.id)}>▶ Continuer le codage</button>
                        <button className="prj-del" disabled={projectBusy} onClick={() => removeProject(pr.id)} title="Supprimer le brouillon">🗑</button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="cm-card">
                <div className="cm-card-t">📋 INFORMATIONS DU MATCH</div>
                <div className="cm-form">
                  <label className="cm-field">Date du match
                    <div className="cm-input"><span>📅</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div></label>
                  <label className="cm-field">Équipe Supabase
                    <div className="cm-input"><span>🅧</span>
                      <select value={teamId} onChange={(e) => { setTeamId(e.target.value); setStarters([]); }}>
                        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <span className="cm-auto">↳ depuis <b>Mes équipes</b> : joueurs, numéros, postes, photos et staff récupérés automatiquement</span>
                  </label>
                  <label className="cm-field">Adversaire
                    <div className="cm-input"><input placeholder="Nom de l'adversaire" value={opponent} onChange={(e) => setOpponent(e.target.value)} /></div></label>
                  <div className="cm-field">Lieu du match
                    <div className="cm-venue"><button type="button" className={`cm-v ${home ? 'on' : ''}`} onClick={() => setHome(true)}>🏠 DOMICILE</button><button type="button" className={`cm-v ${!home ? 'on' : ''}`} onClick={() => setHome(false)}>🏟 EXTÉRIEUR</button></div></div>
                </div>
              </section>

              {/* AJOUT §12 · Effectif adverse (optionnel) pour attribuer les tirs concédés */}
              <section className="cm-card">
                <div className="cm-card-t">🆚 EFFECTIF ADVERSE <span className="cm-opt">OPTIONNEL — POUR NOMMER LES TIRS CONCÉDÉS EN DÉFENSE</span></div>
                <div className="opp-add">
                  <input className="opp-num" placeholder="N°" value={oppNumInput} onChange={(e) => setOppNumInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOppPlayer(); } }} />
                  <input className="opp-name" placeholder="Nom (optionnel)" value={oppNameInput} onChange={(e) => setOppNameInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOppPlayer(); } }} />
                  <button type="button" className="opp-addbtn" onClick={addOppPlayer}>＋ Ajouter</button>
                </div>
                {oppRoster.length > 0 && (
                  <div className="opp-list">
                    {oppRoster.map((p) => (
                      <span className="opp-chip" key={p.id}>#{p.num} {p.name}<button type="button" onClick={() => removeOppPlayer(p.id)}>✕</button></span>
                    ))}
                  </div>
                )}
              </section>

              {/* AJOUT · Playbook associé au match + mapping des slots système (§8) */}
              <section className="cm-card">
                <div className="cm-card-t">📕 PLAYBOOK DU MATCH <span className="cm-opt">OPTIONNEL — DONNE LEURS VRAIS NOMS AUX SYSTÈMES</span></div>
                <label className="cm-field">Playbook
                  <div className="cm-input"><span>📕</span>
                    <select value={playbookId} onChange={(e) => setPlaybookId(e.target.value)}>
                      <option value="">Aucun playbook (Système 1…8)</option>
                      {playbooks.map((pb) => <option key={pb.id} value={pb.id}>{pb.title}</option>)}
                    </select>
                  </div>
                </label>

                {playbookId && (
                  playbookSystems.length === 0
                    ? <div className="tip">Ce playbook ne contient aucun système.</div>
                    : (
                      <div className="pbmap">
                        {SYSTEMES_JEU.map((slot) => (
                          <label className="pbmap-row" key={slot.id}>
                            <span className="pbmap-slot">{slot.ic} {slot.label}</span>
                            <select
                              value={systemMapping[slot.id] ?? ''}
                              onChange={(e) => setSystemMapping((m) => ({ ...m, [slot.id]: e.target.value }))}
                            >
                              <option value="">— non utilisé —</option>
                              {systemsForSlot(slot.id).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                            </select>
                          </label>
                        ))}
                      </div>
                    )
                )}
              </section>

              <section className="cm-card">
                <div className="cm-card-t">🎥 VIDÉO DU MATCH <span className="cm-opt">OPTIONNEL, MODIFIABLE APRÈS LE MATCH</span></div>
                <div className="cm-video">
                  <div className={`cm-vid ${videoMode === 'later' ? 'on' : ''}`} onClick={() => chooseVideoMode('later')}>{videoMode === 'later' && <div className="cm-vid-ck">✓</div>}<div className="cm-vid-ic">🎥</div><div className="cm-vid-t">Sans vidéo / plus tard</div><div className="cm-vid-d">Coder maintenant, ajouter la vidéo ensuite.</div></div>
                  <div className={`cm-vid ${videoMode === 'file' ? 'on' : ''}`} onClick={() => chooseVideoMode('file')}>{videoMode === 'file' && <div className="cm-vid-ck">✓</div>}<div className="cm-vid-ic">▶</div><div className="cm-vid-t">Fichier vidéo maintenant</div><div className="cm-vid-d">Sélectionner un fichier vidéo sur votre appareil.</div></div>
                  <div className={`cm-vid ${videoMode === 'youtube' ? 'on' : ''}`} onClick={() => chooseVideoMode('youtube')}>{videoMode === 'youtube' && <div className="cm-vid-ck">✓</div>}<div className="cm-vid-ic">▶</div><div className="cm-vid-t">Lien YouTube</div><div className="cm-vid-d">Coller l'URL d'une vidéo YouTube.</div></div>
                </div>
                {videoMode === 'file' && (
                  <div className="vid-input">
                    <label className="vid-file">
                      <input type="file" accept="video/*" onChange={(e) => onPickVideoFile(e.target.files?.[0] ?? null)} />
                      <span className="vf-btn">📁 Choisir un fichier vidéo</span>
                      <span className="vf-name">{videoFilename || 'Aucun fichier sélectionné'}</span>
                    </label>
                  </div>
                )}
                {videoMode === 'youtube' && (
                  <div className="vid-input">
                    <input className="vid-yt" placeholder="https://www.youtube.com/watch?v=…" value={youtubeUrl} onChange={(e) => onSetYoutube(e.target.value)} />
                  </div>
                )}
              </section>
            </div>

            {/* Colonne droite : 5 majeur */}
            <div className="cm-right">
              <div className="cm-right-head">
                <div className="cm-5t">👥 <b>5 MAJEUR</b> <span className="cm-5c">{starters.length} / 5 SÉLECTIONNÉS</span></div>
                <button className="cm-ghost sm" type="button" onClick={() => setStarters([])}>Vider la sélection</button>
              </div>
              <div className="cm-players">
                {setupRoster.map((p) => {
                  const on = starters.includes(p.id);
                  return (
                    <div key={p.id} className={`cm-p ${on ? 'on' : ''}`} onClick={() => toggleStarter(p.id)}>
                      <div className="cm-p-num">{p.num}</div>
                      <div className="cm-p-ck">{on ? '✓' : '○'}</div>
                      <div className="cm-p-av"><Av p={p} /></div>
                      <div className="cm-p-nm">{p.name}</div>
                      <div className="cm-p-pos">● {p.pos}</div>
                    </div>
                  );
                })}
                {setupRoster.length === 0 && <span className="cnt">Aucun joueur Supabase dans cette équipe.</span>}
              </div>
              <div className="cm-slots">
                {[0, 1, 2, 3, 4].map((i) => {
                  const p = startersList[i];
                  return (
                    <div className="cm-slot" key={i}>
                      <span className="cm-slot-l">TITULAIRE {i + 1}</span>
                      {p
                        ? <div className="cm-slot-f"><span className="rm" onClick={() => toggleStarter(p.id)}>✕</span><b>{p.num}</b><span>{p.name}</span></div>
                        : <div className="cm-slot-e">＋ Ajouter</div>}
                    </div>
                  );
                })}
              </div>
              <div className={`cm-warn ${starters.length === 5 ? 'ok' : ''}`}>
                {starters.length === 5 ? <><span>✓</span> 5 joueurs sélectionnés — le reste de l'effectif passe automatiquement sur le banc.</> : <><span>⚠</span> Sélectionnez 5 joueurs pour démarrer la saisie des statistiques.</>}
              </div>
            </div>
          </div>

          {/* Résumé + démarrer */}
          <footer className="cm-foot">
            <div className="cm-summary">
              <div className="cm-sum-t">📋 RÉSUMÉ DU MATCH</div>
              <div className="cm-sum-grid">
                <div className="cm-sum"><span className="cm-sum-l">DATE</span><span className="cm-sum-v">{date || '-'}</span></div>
                <div className="cm-sum"><span className="cm-sum-l">ÉQUIPE</span><span className="cm-sum-v">{selTeam?.name || '-'}</span></div>
                <div className="cm-sum"><span className="cm-sum-l">ADVERSAIRE</span><span className="cm-sum-v">{opponent.trim() || '-'}</span></div>
                <div className="cm-sum"><span className="cm-sum-l">LIEU</span><span className="cm-sum-v">{home ? '🏠 DOMICILE' : '🏟 EXTÉRIEUR'}</span></div>
                <div className="cm-sum"><span className="cm-sum-l">VIDÉO</span><span className="cm-sum-v">{videoLabel}</span></div>
                <div className="cm-sum"><span className="cm-sum-l">5 MAJEUR</span><span className="cm-sum-v"><b className="gold">{starters.length} / 5</b> sélectionnés</span></div>
              </div>
            </div>
            <div className="cm-start-wrap">
              <button className="cm-start" disabled={!canStart} onClick={startMatch}>▶ Démarrer la saisie</button>
              <div className="cm-start-hint">{canStart ? 'Tout est prêt — lancez la saisie' : (starters.length < 5 ? 'Complétez votre 5 majeur pour continuer' : 'Renseignez date, équipe et adversaire')}</div>
            </div>
            <div className="cm-start-fixed">
              <button className="cm-start cm-start-main" disabled={!canStart} onClick={startMatch}>▶ DÉMARRER LE MATCH</button>
            </div>
          </footer>
        </div>

        {/* Bouton fixe hors footer : toujours visible sur l’écran de création */}
        <button
          type="button"
          className="cm-start-fixed-only"
          disabled={!canStart}
          onClick={startMatch}
        >
          ▶ DÉMARRER LE MATCH
        </button>

        <Style />
      </div>
    );
  }

  const liveCourt = stage === 'zone';
  const navIdx = STAGE_NAV[stage] ?? 0;

  // Stats live pour les cartes joueurs de la colonne droite
  const liveBox = computeBox(actions, roster) as any[];
  const liveBoxById = new Map<string, any>(liveBox.map((line: any) => [line.p.id, line]));
  const liveLine = (playerId: string) => liveBoxById.get(playerId) || {};
  const livePts = (playerId: string) => {
    const line = liveLine(playerId);
    return (line.p2m || 0) * 2 + (line.p3m || 0) * 3 + (line.ftm || 0);
  };
  const liveAst = (playerId: string) => liveLine(playerId).ast || 0;
  const livePf = (playerId: string) => liveLine(playerId).pf || 0;
  const foulDots = (playerId: string) => (
    <span className="fdots" title={`Fautes : ${livePf(playerId)}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <i key={i} className={i < livePf(playerId) ? 'on' : ''} />
      ))}
    </span>
  );
  const usTeamFouls = actions.filter((a) => a.q === q && a.actionType === 'faute-commise' && a.context === 'defense').length;
  const themTeamFouls = actions.filter((a) => a.q === q && a.actionType === 'faute-provoquee').length;

  // Bloc C · bandeau de resélection de la vidéo locale d'un projet rouvert.
  // Une URL blob: locale ne survit pas au rechargement : si le projet attend une
  // vidéo locale (nom connu) mais que l'URL est vide, on propose de la recharger.
  const needsLocalVideo = !!videoFilename && !videoUrl && videoProvider !== 'youtube';
  const VideoReselectBanner = () => needsLocalVideo ? (
    <div className="vid-reselect">
      <span>🎥 Vidéo requise : <b>{videoFilename}</b></span>
      <label className="vid-reselect-btn">
        Resélectionner la vidéo
        <input type="file" accept="video/*" onChange={(e) => onPickVideoFile(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  ) : null;

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
        <div className="h-c compactScore">
          <div className="team"><div className="logo">{teamName.slice(0, 2)}</div><span>{teamName}</span></div>
          <div className="score us">{scoreUs}</div>
          <div className="clockbox">
            <div className="qtag">{periodLabel(q)}</div><div className="clk">{fmt(secs)}</div>
            <div className="clk-ctrl">
              <button className="mini" onClick={() => changeQ(-1)}>◀</button>
              <button className="mini play" onClick={toggleClockAndVideo}>{running ? '⏸' : '▶'}</button>
              <button className="mini" onClick={() => changeQ(1)}>▶</button>
            </div>
          </div>
          <div className="score them"><button className="mini" onClick={() => themBtn(-1)}>–</button><span>{scoreThem}</span><button className="mini" onClick={() => themBtn(1)}>+</button></div>
          <div className="team"><span>{opponent || 'ADVERSAIRE'}</span><div className="logo">{(opponent || 'AD').slice(0, 2).toUpperCase()}</div></div>
        </div>
        <div className="h-r">
          <button
            className={`ghost ${showHistoryPanel ? 'on' : ''}`}
            onClick={() => setShowHistoryPanel((v) => !v)}
            title="Afficher / masquer l'historique des actions"
          >
            📚 Historique
          </button>

          <button
            className={`ghost ${showMontagePanel ? 'on' : ''}`}
            onClick={openMontageWindow}
            title="Ouvrir le logiciel de montage dans une nouvelle fenêtre"
          >
            🎬 Montage
          </button>

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

      <div className="qstrip">
        {Object.keys(perQ).map((k) => <span key={k} className={`qbox ${+k === q ? 'cur' : ''}`}>{periodLabel(+k)} <b>{perQ[+k].us}-{perQ[+k].them}</b></span>)}
        <span className="foulbox usf">Fautes équipe {teamName || 'Nous'} <b>{usTeamFouls}</b></span>
        <span className="foulbox themf">Fautes adv. <b>{themTeamFouls}</b></span>
      </div>

      {screen === 'box' ? (
        <>
          <VideoReselectBanner />
          <BoxView actions={actions} roster={roster} teamId={activeTeamId || teamId} videoProvider={videoProvider} videoUrl={videoUrl} sync={videoSync} oppRoster={oppRoster} onAddToMontage={addToMontage} onSaveNote={(id, note) => setClipEdit(id, { note })} onTrim={(id, cs, ce) => setClipEdit(id, { trimStart: cs, trimEnd: ce })} getEdit={(id) => getClipEdit(id)} initialTab={initialBoxTab} />
        </>
      ) : (
        <>
          <VideoReselectBanner />
          <div className="live3">
            {/* ============ GAUCHE · VIDÉO (élément principal) ============ */}
            <section className={`lc lc-video ${workTab === 'center' ? 'mshow' : ''}`}>
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

              <div className="detacherRow">
                <button className="detachBtn" onClick={detachVideo}>↗ Détacher la vidéo</button>
                {/* AJOUT · Image dans l'image + vitesse de lecture (synchronisée) */}
                <button className="detachBtn" onClick={togglePiP} title="Garder la vidéo au-dessus de la fenêtre de codage">⧉ Image dans l'image</button>
                <label className="rateBox">
                  Vitesse
                  <select value={playbackRate} onChange={(e) => setPlaybackRate(Number(e.target.value))}>
                    {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
                  </select>
                </label>
                {videoProvider === 'local' && videoUrl && (
                  <button className="detachBtn" onClick={() => setShowVideoSync(true)} title="Ajuster la correspondance vidéo ↔ codage">
                    🎯 Recalibrer la vidéo
                  </button>
                )}
                {videoSync.mode !== 'native' && (
                  <span className="syncBadge" title="Décalage vidéo appliqué à la lecture des clips">
                    Décalage {formatOffset(videoSync.offset)}{videoSync.mode === 'calibrated' ? ` · ${videoSync.rate.toFixed(3)}×` : ''}
                  </span>
                )}
                {videoDetached && <span className="detachState">🎥 Vidéo ouverte dans une fenêtre détachée</span>}
              </div>

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
            </section>

            {/* ============ CENTRE · CODAGE (wizard) ============ */}
            <aside className={`lc lc-code ${workTab === 'coding' ? 'mshow' : ''}`}>
              <div className="lc-head codeTop">
                <button className="headBack" disabled={stage === 'context'} onClick={() => {
                  const order = ['context', 'inbound', 'temps', 'coverage', 'player', 'action', 'faute', 'result', 'ft', 'zone', 'rebound', 'assist'];
                  const currentIndex = order.indexOf(stage);
                  if (currentIndex > 0) setStage(order[currentIndex - 1]);
                }}>←</button>
                <button className="headUndo" onClick={undo}>↺</button>
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
            </aside>

            {/* ============ DROITE · SHOT CHART + JOUEURS / BANC ============ */}
            <aside className={`lc lc-right ${workTab === 'analysis' ? 'mshow' : ''}`}>
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
                      shotResult={draft.shotResult === 'made' ? 'made' : draft.shotResult === 'missed' ? 'missed' : null}
                      pendingPoint={draft.courtX != null && draft.courtY != null ? { x: draft.courtX * 100, y: draft.courtY * 100 } : null}
                      showLabels={false}
                      onPick={(z, pt) => zonePick(z, pt)}
                    />
                  </div>
                ) : (
                  <ShotChart
                    mode="analysis"
                    size="sm"
                    showStats={false}
                    showLabels={false}
                    shots={[]}
                    onZoneClick={(zid) => { setZoneSel(zid); setZoneFilter('all'); }}
                  />
                )}
              </div>

              {/* Joueurs sur le terrain + banc (remplacements) */}
              <div className="lc-players compactPlayerTable">
                <div className="playerTableSection">
                  <div className="playerTableTitle">🏀 5 sur le terrain</div>
                  <div className="playerTableHead">
                    <span>N°</span>
                    <span>Joueur</span>
                    <span>PTS</span>
                    <span>Fautes</span>
                  </div>
                  {floor.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`playerTableRow ${draft.playerId === p.id ? 'active' : ''} ${subSel !== null ? 'swap' : ''}`}
                      onClick={subSel !== null ? () => swap(p.id) : undefined}
                    >
                      <span className="ptNum">{p.num}</span>
                      <span className="ptName">{p.name}</span>
                      <span className="ptPts">{livePts(p.id)}</span>
                      <span className="ptFouls">{foulDots(p.id)}</span>
                    </button>
                  ))}
                </div>

                <div className="playerTableSection benchSection">
                  <div className="playerTableTitle benchTitle">
                    <span>🪑 Joueurs sur le banc</span>
                    <button
                      type="button"
                      className={`pbtoggle tableSwap ${subSel !== null ? 'on' : ''}`}
                      onClick={() => setSubSel((s) => (s === null ? '' : null))}
                    >
                      ⇄
                    </button>
                  </div>
                  <div className="playerTableHead">
                    <span>N°</span>
                    <span>Joueur</span>
                    <span>PTS</span>
                    <span>Fautes</span>
                  </div>
                  {bench.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`playerTableRow bench ${subSel === p.id ? 'sel' : ''}`}
                      onClick={() => setSubSel(p.id)}
                    >
                      <span className="ptNum">{p.num}</span>
                      <span className="ptName">{p.name}</span>
                      <span className="ptPts">{livePts(p.id)}</span>
                      <span className="ptFouls">{foulDots(p.id)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          {/* ============ BAS · TIMELINE REPLIABLE ============ */}
          <button className={`timelinePull ${showTimelinePanel ? 'open' : ''}`} onClick={() => setShowTimelinePanel((v) => !v)}>
            {showTimelinePanel ? '⌄ Fermer timeline' : '⌃ Timeline'}
          </button>
          {showTimelinePanel && (
            <div className="live-strip timelineOnly">
              <div className="an-body">{renderTimeline()}</div>
            </div>
          )}

          {showHistoryPanel && (
            <div className="floatingPanel historyPanel">
              <div className="floatingHead"><b>📚 Historique des actions</b><button onClick={() => setShowHistoryPanel(false)}>×</button></div>
              <div className="floatingBody">{renderHistoryList()}</div>
            </div>
          )}

          {showMontagePanel && (
            <div className={`floatingPanel montagePanel ${montageFull ? 'montageFull' : ''}`}>
              <div className="floatingHead">
                <b>🎬 Montage vidéo</b>
                <div className="floatingHeadBtns">
                  {/* AJOUT §5 · plein écran pour travailler le montage sur un second écran */}
                  <button className="montageExpand" onClick={() => setMontageFull((v) => !v)} title={montageFull ? 'Réduire' : 'Agrandir (plein écran)'}>
                    {montageFull ? '🗗 Réduire' : '⛶ Plein écran'}
                  </button>
                  <button onClick={() => { setMontageFull(false); setShowMontagePanel(false); }}>×</button>
                </div>
              </div>
              <div className="floatingBody"><VideoReselectBanner />{renderMontage()}</div>
            </div>
          )}
        </>
      )}

      {evtSel && (() => {
        const a = actions.find((x) => x.id === evtSel);
        if (!a) return null;
        const p = find(a.playerId);
        const hasClip = a.videoTime != null || a.clipStart != null;
        const isShot = a.actionType === 'tir' && a.shotType !== 'LF';
        const ce = getClipEdit(a.id);
        // Le rognage (trimStart) est déjà en temps média ; sinon on synchronise
        // la borne de début issue de l'action (source → média).
        const baseStart = (ce.trimStart ?? resolveActionClipBounds(a, videoSync).start) as number | null;
        const idx = actions.findIndex((x) => x.id === a.id);
        const patch = (upd: Partial<StatA>) => {
          setActions((arr) => arr.map((x) => (x.id === a.id ? { ...x, ...upd } as StatA : x)));
          flash('Séquence modifiée');
        };
        const seek = (t: number | null) => { const v = clipVideoRef.current; if (v && t != null) { try { v.currentTime = Math.max(0, t); v.play().catch(() => {}); } catch { /* noop */ } } };
        const curTime = () => { const v = clipVideoRef.current; return v ? Math.round(v.currentTime) : null; };

        // Dessin : conversion coordonnées écran → repère 0..100 du calque.
        const rel = (e: MouseEvent) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
        };
        const onDrawDown = (e: MouseEvent) => { if (!drawTool) return; drawStartRef.current = rel(e); };
        const onDrawUp = (e: MouseEvent) => {
          if (!drawTool || !drawStartRef.current) return;
          const s = drawStartRef.current; const en = rel(e);
          drawStartRef.current = null;
          let text: string | undefined;
          if (drawTool === 'text') { const t = window.prompt('Texte :', ''); if (t == null || !t.trim()) return; text = t.trim(); }
          const d: ClipDraw = { id: uid(), tool: drawTool, x1: s.x, y1: s.y, x2: en.x, y2: en.y, text };
          setClipEdit(a.id, { draws: [...ce.draws, d] });
        };

        return (
          <div className="zpop" onClick={() => { setEvtSel(null); setDrawTool(null); }}>
            <div className="zpop-card clip" onClick={(e) => e.stopPropagation()}>
              <div className="zpop-head">
                <b>{periodLabel(a.q)} {a.clock} · {tags.label(a.tempsFort)}</b>
                <div className="clip-nav">
                  <button disabled={idx <= 0} onClick={() => gotoEvt(-1)} title="Précédent">‹ Préc.</button>
                  <button disabled={idx >= actions.length - 1} onClick={() => gotoEvt(1)} title="Suivant">Suiv. ›</button>
                  <button title="Ouvrir le lecteur de clips" onClick={() => { const list = actions.slice(); openClipModal('Timeline', list, list.findIndex((x) => x.id === a.id)); }}>🎬</button>
                  <button onClick={() => { setEvtSel(null); setDrawTool(null); }}>×</button>
                </div>
              </div>

              {/* Vidéo + calque de dessin */}
              <div className="clip-stage">
                {videoProvider === 'local' && videoUrl && hasClip ? (
                  <video
                    className="evt-vplayer"
                    src={videoUrl}
                    controls
                    ref={(el) => { clipVideoRef.current = el; if (el && baseStart != null && el.dataset.seeded !== a.id) { try { el.currentTime = baseStart; el.dataset.seeded = a.id; } catch { /* noop */ } } }}
                  />
                ) : (
                  <div className="evt-noclip">{hasClip ? '▶️ YouTube lié — repère ' + fmt(Math.round((resolveActionClipBounds(a, videoSync).start ?? 0))) : 'Clip à synchroniser (ajoute une vidéo locale)'}</div>
                )}

                {/* Calque d'annotations (SVG 0..100) */}
                <svg className={`clip-draw ${drawTool ? 'active' : ''}`} viewBox="0 0 100 100" preserveAspectRatio="none"
                  onMouseDown={onDrawDown} onMouseUp={onDrawUp}>
                  <defs>
                    <marker id="arrowhead" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
                      <path d="M0,0 L4,2 L0,4 Z" fill="var(--gold)" />
                    </marker>
                  </defs>
                  {ce.draws.map((d) => {
                    if (d.tool === 'arrow') return <line key={d.id} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} stroke="var(--gold)" strokeWidth="0.8" markerEnd="url(#arrowhead)" />;
                    if (d.tool === 'circle') { const rx = Math.abs(d.x2 - d.x1) / 2, ry = Math.abs(d.y2 - d.y1) / 2; return <ellipse key={d.id} cx={(d.x1 + d.x2) / 2} cy={(d.y1 + d.y2) / 2} rx={rx} ry={ry} fill="none" stroke="var(--gold)" strokeWidth="0.8" />; }
                    if (d.tool === 'rect') return <rect key={d.id} x={Math.min(d.x1, d.x2)} y={Math.min(d.y1, d.y2)} width={Math.abs(d.x2 - d.x1)} height={Math.abs(d.y2 - d.y1)} fill="none" stroke="var(--gold)" strokeWidth="0.8" />;
                    if (d.tool === 'text') return <text key={d.id} x={d.x1} y={d.y1} fill="var(--gold)" fontSize="5" fontWeight="800">{d.text}</text>;
                    return null;
                  })}
                </svg>
              </div>

              {/* Barre d'outils dessin */}
              <div className="clip-draws">
                {([['arrow', '↗ Flèche'], ['circle', '◯ Cercle'], ['rect', '▭ Rectangle'], ['text', 'T Texte']] as const).map(([t, l]) => (
                  <button key={t} className={drawTool === t ? 'on' : ''} onClick={() => setDrawTool(drawTool === t ? null : t)}>{l}</button>
                ))}
                <button className="danger" disabled={!ce.draws.length} onClick={() => setClipEdit(a.id, { draws: [] })}>🧹 Effacer</button>
              </div>

              {/* Rognage */}
              <div className="clip-trim">
                <span className="clip-trim-lbl">Rognage</span>
                <button onClick={() => { const t = curTime(); if (t != null) { setClipEdit(a.id, { trimStart: t }); flash('Début → ' + fmt(t)); } }}>⇤ Début ici</button>
                <span className="clip-trim-val">{ce.trimStart != null ? fmt(ce.trimStart) : (a.clipStart != null ? fmt(a.clipStart) + ' (auto)' : '—')}</span>
                <button onClick={() => { const t = curTime(); if (t != null) { setClipEdit(a.id, { trimEnd: t }); flash('Fin → ' + fmt(t)); } }}>⇥ Fin ici</button>
                <span className="clip-trim-val">{ce.trimEnd != null ? fmt(ce.trimEnd) : (a.clipEnd != null ? fmt(a.clipEnd) + ' (auto)' : '—')}</span>
                <button onClick={() => seek(baseStart)}>▶ Revoir début</button>
              </div>

              <div className="evt-info">
                <span>{p ? `#${p.num} ${p.name}` : 'Sans joueur'}</span>
                <span>{describe(a, find).t}</span>
              </div>

              {/* Correction rapide + montage */}
              <div className="evt-tools">
                {isShot && (
                  <>
                    <button className={a.shotResult === 'made' ? 'on' : ''} onClick={() => patch({ shotResult: 'made' })}>✓ Marqué</button>
                    <button className={a.shotResult === 'missed' ? 'on' : ''} onClick={() => patch({ shotResult: 'missed' })}>✕ Raté</button>
                  </>
                )}
                <select value={a.playerId ?? ''} onChange={(e) => patch({ playerId: e.target.value || null })}>
                  <option value="">Joueur…</option>
                  {roster.map((pl) => <option key={pl.id} value={pl.id}>#{pl.num} {pl.name}</option>)}
                </select>
                <button onClick={() => addToMontage(a)}>⭐ Montage</button>
                <button className="danger" onClick={() => { removeAction(a.id); setEvtSel(null); }}>🗑 Supprimer</button>
              </div>

              {/* Note coach */}
              <textarea className="clip-note" placeholder="Note coach sur ce clip…" value={ce.note}
                onChange={(e) => setClipEdit(a.id, { note: e.target.value })} />

              <div className="evt-note">Rognage, note et dessins sont stockés en local (hors match_actions). La correction Marqué/Raté/joueur modifie l'action ; pour un recalcul de score immédiat, préfère ↩ dans l'historique.</div>
            </div>
          </div>
        );
      })()}

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
                      <button className={`hplay ${hasClip ? 'has' : ''}`} title={hasClip ? 'Revoir le clip' : 'Clip à synchroniser'} onClick={() => { const list = actions.slice().reverse(); openClipModal('Historique des actions', list, list.findIndex((x) => x.id === a.id)); }}>▶</button>
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

      {/* §3–§6 · Synchronisation d'une vidéo ajoutée APRÈS le codage */}
      <VideoSyncModal
        open={showVideoSync}
        videoUrl={videoProvider === 'local' ? videoUrl : null}
        actions={actions as unknown as LiveMatchAction[]}
        sync={videoSync}
        expectedFilename={videoFilename || null}
        onChange={(s) => setVideoSync(s)}
        onPickVideoFile={(f) => onPickVideoFile(f)}
        onValidate={() => {
          const validated: VideoSyncState = { ...videoSyncRef.current, validated: true };
          setVideoSync(validated);
          persistProjectState();
          setShowVideoSync(false);
          flash('Synchronisation vidéo validée ✓');
        }}
        onClose={() => setShowVideoSync(false)}
      />

      {/* §25 · popup clips COMMUNE — Historique & Timeline */}
      <ActionClipsModal
        open={!!clipModal}
        actions={(clipModal?.items ?? []) as unknown as ClipAction[]}
        startIndex={clipModal?.index ?? 0}
        title={clipModal?.title ?? ''}
        videoUrl={videoProvider === 'local' ? videoUrl : ''}
        sync={videoSync}
        onClose={() => setClipModal(null)}
        onAddToMontage={(a: ClipAction) => addToMontage(a as unknown as StatA)}
        onSaveNote={(a: ClipAction, note: string) => { if (a.id) { setClipEdit(a.id, { note }); flash('Note enregistrée'); } }}
        onTrim={(a: ClipAction, cs: number, ce: number) => { if (a.id) { setClipEdit(a.id, { trimStart: cs, trimEnd: ce }); flash('Rognage enregistré'); } }}
        getEdit={(a: ClipAction) => a.id ? getClipEdit(a.id) : undefined}
        describe={(a: ClipAction) => describe(a as unknown as StatA, find).t}
        playerName={(id: string | null | undefined) => { const p = find(id ?? null); return p ? `#${p.num} ${p.name}` : undefined; }}
        tempsFortLabel={(id: string | null | undefined) => tags.label(id ?? '')}
      />
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

  /* ============ V8 · Timeline Sportscode ============
     Une piste (row) par catégorie codée effectivement utilisée : les temps
     forts (via tags) + les contextes attaque/défense. Chaque événement est
     placé horizontalement selon son chrono dans le quart-temps ; séparateurs
     verticaux entre QT. Hover = tags ; clic = popup revoir/modifier (evtSel).
     Lecture seule des `actions` locales : aucun impact moteur. */
  function evtColor(a: StatA): string {
    // Bleu = attaque réussie, Rouge = erreur/perte, Vert = positif défensif, Orange = faute
    if (a.actionType === 'tir' && a.shotResult === 'made') return 'var(--blue)';
    if (a.actionType === 'perte' || a.actionType === 'perte-adverse') return 'var(--red)';
    if (a.actionType === 'tir' && a.shotResult === 'missed') return 'var(--red)';
    if (a.actionType === 'interception' || a.actionType === 'contre') return 'var(--green)';
    if (a.actionType === 'faute-provoquee' || a.actionType === 'faute-commise') return 'var(--orange)';
    if (a.context === 'attaque') return 'var(--bordeaux2)';
    return 'var(--mute)';
  }
  // Position horizontale 0..1 d'une action dans son quart-temps (chrono décroissant).
  function evtX(a: StatA): number {
    const parts = (a.clock || '00:00').split(':');
    const rem = (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
    const dur = periodDuration(a.q);
    return Math.max(0, Math.min(1, (dur - rem) / dur)); // début QT = 0, fin QT = 1
  }

  function renderTimeline() {
    const list = mxFiltered();
    // Lignes = catégories réellement utilisées : temps forts d'abord, puis contextes.
    const usedTf = (tags.active && tags.active.length ? tags.active.map((t: any) => t.key) : TEMPS.map((t) => t.id))
      .filter((k: string) => list.some((a) => a.tempsFort === k));
    const rows: { key: string; label: string; color?: string; test: (a: StatA) => boolean }[] = [
      ...usedTf.map((k: string) => ({ key: 'tf:' + k, label: tags.label(k), color: tags.color(k), test: (a: StatA) => a.tempsFort === k })),
      { key: 'ctx:attaque', label: 'Attaque', test: (a: StatA) => a.context === 'attaque' },
      { key: 'ctx:defense', label: 'Défense', test: (a: StatA) => a.context === 'defense' },
    ];
    const quarters = Object.keys(perQ).map(Number).sort((a, b) => a - b);

    return (
      <div className="tl-wrap">
        <div className="tl-legend">
          <span><i style={{ background: 'var(--blue)' }} />Attaque réussie</span>
          <span><i style={{ background: 'var(--red)' }} />Erreur / raté</span>
          <span><i style={{ background: 'var(--green)' }} />Positif déf.</span>
          <span><i style={{ background: 'var(--orange)' }} />Faute</span>
        </div>
        <div className="tl-grid">
          {rows.length === 0 && <div className="hist-empty">Aucune action à afficher.</div>}
          {rows.map((row) => {
            const evs = list.filter(row.test);
            return (
              <div className="tl-row" key={row.key}>
                <div className="tl-label" style={{ color: row.color || 'var(--txt)' }} title={row.label}>{row.label}</div>
                <div className="tl-track">
                  {/* séparateurs de quart-temps */}
                  {quarters.slice(1).map((_, i) => (
                    <span key={i} className="tl-qsep" style={{ left: `${((i + 1) / quarters.length) * 100}%` }} />
                  ))}
                  {evs.map((a) => {
                    const qi = Math.max(0, quarters.indexOf(a.q));
                    const left = ((qi + evtX(a)) / quarters.length) * 100;
                    const p = find(a.playerId);
                    const tip = `${periodLabel(a.q)} ${a.clock} · ${p ? '#' + p.num + ' ' + p.name : '—'} · ${describe(a, find).t}`;
                    return (
                      <button
                        key={a.id}
                        className="tl-evt"
                        style={{ left: `${left}%`, background: evtColor(a) }}
                        title={tip}
                        onClick={() => setEvtSel(a.id)}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="tl-axis">
          {quarters.map((qq) => <span key={qq} style={{ width: `${100 / quarters.length}%` }}>{periodLabel(qq)}</span>)}
        </div>
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
    const sel = montageItems.find((x) => x.caid === montageSel) || null;
    const inMontage = new Set(montageItems.map((x) => x.caid));
    // Bibliothèque : actions codées disponibles (clip vidéo prioritaire), non déjà ajoutées.
    const library = actions.filter((a) => !inMontage.has(a.id));
    return (
      <div className="mo3">
        {/* ---------- GAUCHE · Bibliothèque de clips ---------- */}
        <div className="mo-col">
          <div className="mo-col-h">Bibliothèque · {library.length} clip{library.length > 1 ? 's' : ''}</div>
          <div className="mo-col-b">
            {library.length === 0
              ? <div className="hist-empty">Toutes les actions codées sont déjà dans le montage.</div>
              : library.slice().reverse().map((a) => {
                const p = find(a.playerId);
                return (
                  <div className="mo-lib" key={a.id}>
                    <div className="mo-lib-tx">
                      <b>{tags.emoji(a.tempsFort)} {tags.label(a.tempsFort)}</b>
                      <small>{periodLabel(a.q)} {a.clock}{p ? ` · #${p.num}` : ''} · {describe(a, find).t}</small>
                    </div>
                    <button className="mo-lib-add" onClick={() => addToMontage(a)} title="Ajouter au montage">＋</button>
                  </div>
                );
              })}
          </div>
        </div>

        {/* ---------- CENTRE · Storyboard (montage final) ---------- */}
        <div className="mo-col">
          <div className="mo-col-h">
            <select className="mo-pick" value={montageId ?? ''} onChange={(e) => { const v = e.target.value; if (v) loadMontage(v); else newMontage(); }}>
              <option value="">➕ Nouveau montage</option>
              {savedMontages.map((m) => <option key={m.id} value={m.id}>{m.title || 'Montage'}</option>)}
            </select>
            <button className="mo-new" onClick={newMontage} title="Repartir d'un montage vierge">Nouveau</button>
            {montageLoading && <span className="mo-badge">⏳</span>}
          </div>
          <div className="mo-col-b">
            {montageItems.length === 0
              ? <div className="hist-empty">Ajoute des clips depuis la bibliothèque (＋), la popup clip (⭐), l'Historique ou la Matrice.</div>
              : montageItems.map((it, idx) => (
                <div className={`mo-item ${montageSel === it.caid ? 'sel' : ''}`} key={it.caid} onClick={() => setMontageSel(it.caid)}>
                  <span className="mo-num">{idx + 1}</span>
                  <div className="mo-body"><b>{it.label}</b><small>{it.sub}</small></div>
                  <div className="mo-ctrl">
                    <button disabled={idx === 0} onClick={(e) => { e.stopPropagation(); moveMontageItem(idx, -1); }}>▲</button>
                    <button disabled={idx === montageItems.length - 1} onClick={(e) => { e.stopPropagation(); moveMontageItem(idx, 1); }}>▼</button>
                    <button className="rm" onClick={(e) => { e.stopPropagation(); removeMontageItem(it.caid); if (montageSel === it.caid) setMontageSel(null); }}>✕</button>
                  </div>
                </div>
              ))}
          </div>
          <div className="mo-add">
            <button onClick={() => addMontageElement('image')}>🖼 Image</button>
            <button onClick={() => addMontageElement('slide')}>🟥 Diapo</button>
            <button onClick={() => addMontageElement('text')}>✎ Texte</button>
          </div>
        </div>

        {/* ---------- DROITE · Propriétés ---------- */}
        <div className="mo-col mo-props">
          <div className="mo-col-h">Propriétés</div>
          <div className="mo-col-b">
            {/* Propriétés du montage */}
            <label className="mo-f">Titre du montage
              <input value={montageTitle} onChange={(e) => setMontageTitle(e.target.value)} placeholder="Thème, joueur, temps fort…" />
            </label>
            <label className="mo-f">Note coach (montage)
              <textarea value={montageNote} onChange={(e) => setMontageNote(e.target.value)} placeholder="Note coach…" />
            </label>
            <div className="mo-sep" />
            {/* Propriétés de l'élément sélectionné */}
            {sel ? (
              <>
                <div className="mo-f-h">Élément sélectionné</div>
                <label className="mo-f">Titre
                  <input value={sel.label} onChange={(e) => updateMontageItem(sel.caid, { label: e.target.value })} />
                </label>
                <label className="mo-f">Note
                  <textarea value={sel.note} onChange={(e) => updateMontageItem(sel.caid, { note: e.target.value })} placeholder="Note sur cet élément…" />
                </label>
                <div className="mo-frow">
                  <label className="mo-f">Début (s)
                    <input type="number" value={sel.clipStart ?? ''} onChange={(e) => updateMontageItem(sel.caid, { clipStart: e.target.value === '' ? null : Number(e.target.value) })} />
                  </label>
                  <label className="mo-f">Fin (s)
                    <input type="number" value={sel.clipEnd ?? ''} onChange={(e) => updateMontageItem(sel.caid, { clipEnd: e.target.value === '' ? null : Number(e.target.value) })} />
                  </label>
                </div>
              </>
            ) : <div className="tip">Sélectionne un élément du storyboard pour éditer ses propriétés.</div>}
          </div>
          <div className="mo-foot">
            <span className="mo-badge">🎬 {montageItems.length} clip{montageItems.length > 1 ? 's' : ''}</span>
            <button className="mo-save" disabled={montageSaving || !montageItems.length} onClick={saveMontage}>{montageSaving ? '⏳ …' : (montageId ? '💾 Enregistrer les modifs' : '💾 Enregistrer')}</button>
            <button className="mo-export" disabled title="Bientôt disponible">⬇ Export vidéo (à venir)</button>
          </div>
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
      case 'systeme':
        return <>{head('Système de jeu', playbookId ? 'Systèmes du playbook associé' : 'Organisation de la possession')}{tileGrid(systemeButtons, draft.systemeJeu, systemePick)}</>;
      case 'temps':
        return <>{head('Temps fort', 'Type de jeu')}{tileGrid(tempsFortsButtons, draft.tempsFort, tempsPick)}</>;
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
        return (
          <>
            {head('Résultat', draft.context === 'defense' ? 'Tir concédé — résultat' : 'Choisis directement le résultat du tir')}

            {/* AJOUT §12 · en défense, attribuer le tir à un joueur adverse (optionnel) */}
            {draft.context === 'defense' && oppRoster.length > 0 && (
              <>
                <div className="sublbl">Joueur adverse (tir concédé)</div>
                <div className="grid c3">
                  {oppRoster.map((op) => (
                    <button key={op.id} className={`bt ${draft.playerId === op.id ? 'active' : ''}`} onClick={() => setDraft({ ...draft, playerId: draft.playerId === op.id ? null : op.id })}>
                      <span className="ic">#{op.num}</span><span className="lbl">{op.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="grid c2">
              <button className="res made" onClick={() => quickShotResult('2PTS', 'made')}>✓ 2PTS marqué</button>
              <button className="res miss" onClick={() => quickShotResult('2PTS', 'missed')}>✕ 2PTS raté</button>
              <button className="res made" onClick={() => quickShotResult('3PTS', 'made')}>✓ 3PTS marqué</button>
              <button className="res miss" onClick={() => quickShotResult('3PTS', 'missed')}>✕ 3PTS raté</button>
            </div>

            <div className="sublbl">Lancers francs</div>
            <div className="seg">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  className={`segb ${draft.shotType === 'LF' && draft.ftAttempts === n ? 'active' : ''}`}
                  onClick={() => {
                    shotPick('LF');
                    ftn(n);
                  }}
                >
                  {n} LF
                </button>
              ))}
            </div>
            {draft.shotType === 'LF' && draft.ftAttempts > 0 && ftSeq()}

            {draft.context !== 'defense' && (
              <>
                <div className="sublbl">Situations spéciales</div>
                <div className="grid c2">
                  <button className="chip" onClick={() => special('2pts1lf')}>2 PTS + 1 LF</button>
                  <button className="chip" onClick={() => special('3pts1lf')}>3 PTS + 1 LF</button>
                </div>
              </>
            )}
          </>
        );
      case 'ft':
        return <>{head('Lancers francs', (draft.specialCase === '2pts+1lf' || draft.specialCase === '3pts+1lf') ? 'Lancer franc bonus (and-one)' : draft.actionType === 'faute-commise' ? `${draft.ftAttempts} LF adverses — dans l'ordre` : `${draft.ftAttempts} LF — dans l'ordre`)}{ftSeq()}</>;
      case 'zone':
        return <>{head('Où ?', 'Cliquez directement sur le terrain (shot chart)')}<div className="tip">Pas d'étiquette de zone : cliquez l'emplacement exact du tir sur le terrain à droite.</div></>;
      case 'rebound': {
        // Rebonds : ids STABLES (off/def/touche-pour/touche-contre) utilisés par le
        // moteur (isMyRebound/reboundNext) — jamais modifiés. Seuls les LIBELLÉS sont
        // configurables via livestat_coding_buttons (catégorie 'rebound') : la config
        // par équipe écrase le label par key, sinon on garde les libellés par défaut.
        const rebDefaults: Record<string, string> = { 'off': 'Rebond offensif', 'def': 'Rebond défensif', 'touche-pour': 'Touche pour', 'touche-contre': 'Touche contre' };
        const rebCfg = resolveCodingButtons('rebound', codingDb);
        const rebLabelOf = (id: string) => rebCfg.find((c) => c.key === id)?.label ?? rebDefaults[id];
        const reb: string[] = ['off', 'def', 'touche-pour', 'touche-contre'];
        return <>{head('Conséquence', 'Rebond sur tir manqué')}<div className="grid c2">{reb.map((id) => <button key={id} className={`chip ${draft.reboundType === id ? 'active' : ''}`} onClick={() => rebPick(id)}>{rebLabelOf(id)}</button>)}</div>
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
function BoxView({ actions, roster, teamId, videoProvider = 'none', videoUrl = '', sync = NATIVE_SYNC, oppRoster = [], onAddToMontage, onSaveNote, onTrim, getEdit, initialTab }: { actions: StatA[]; roster: Player[]; teamId?: string; videoProvider?: string; videoUrl?: string; sync?: VideoSyncState; oppRoster?: { id: string; num: string; name: string }[]; onAddToMontage?: (a: StatA) => void; onSaveNote?: (id: string, note: string) => void; onTrim?: (id: string, cs: number, ce: number) => void; getEdit?: (id: string) => { note?: string; trimStart?: number | null; trimEnd?: number | null } | undefined; initialTab?: 'box' | 'team' | null }) {
  const tags = useLivestatTags(teamId);
  // AJOUT §12 · find reconnaît aussi les joueurs adverses (préfixe opp_).
  const find = (id: string | null) => roster.find((p) => p.id === id)
    || (id ? oppRoster.filter((o) => o.id === id).map((o) => ({ id: o.id, num: Number(o.num) || 0, name: o.name, pos: 'ADV' } as Player))[0] : undefined);
  const box = computeBox(actions, roster);
  const A = computeAnalytics(actions, roster);
  const pts = (l: any) => l.p2m * 2 + l.p3m * 3 + l.ftm;
  const [boxTab, setBoxTab] = useState<'box' | 'team' | 'matrix' | 'systems' | 'search' | 'lineups' | 'shot' | 'video'>('box');
  // Bloc C · onglet initial demandé depuis l'Historique (tab=history → Collectif, tab=players → Boxscore).
  useEffect(() => { if (initialTab) setBoxTab(initialTab); }, [initialTab]);
  const [boxSide, setBoxSide] = useState<'attaque' | 'defense'>('attaque');
  const [matrixSide, setMatrixSide] = useState<'attaque' | 'defense'>('attaque');
  const [sysSide, setSysSide] = useState<'attaque' | 'defense'>('attaque');
  const [clipAction, setClipAction] = useState<StatA | null>(null);
  const [clipList, setClipList] = useState<{ title: string; items: StatA[] } | null>(null);
  // La lecture vidéo bornée est désormais gérée par ActionClipsModal (§25).

  const tot: any = box.reduce((t: any, l: any) => {
    ['p2m', 'p2a', 'p3m', 'p3a', 'ftm', 'fta', 'offReb', 'defReb', 'ast', 'stl', 'blk', 'to', 'pf'].forEach((k) => { t[k] = (t[k] || 0) + (l[k] || 0); });
    t.pts = (t.pts || 0) + pts(l);
    return t;
  }, {});

  // --- KPIs collectifs (calculés sur les vraies actions) ---
  const teamPts = tot.pts || 0;
  const fga = (tot.p2a || 0) + (tot.p3a || 0);
  const fgm = (tot.p2m || 0) + (tot.p3m || 0);
  const efg = fga ? ((fgm + 0.5 * (tot.p3m || 0)) / fga) * 100 : 0;
  const ts = (fga || tot.fta) ? (teamPts / (2 * (fga + 0.44 * (tot.fta || 0)))) * 100 : 0;
  const ppp = A.offPoss ? teamPts / A.offPoss : 0;
  const astTo = (tot.to || 0) ? (tot.ast || 0) / (tot.to || 0) : (tot.ast || 0);

  // --- Matrice temps forts × résultats ---
  const tfRows = A.tfUsed.map((t) => {
    const list = actions.filter((a) => a.tempsFort === t.id);
    const made = list.filter((a) => a.actionType === 'tir' && a.shotResult === 'made').length;
    const missed = list.filter((a) => a.actionType === 'tir' && a.shotResult === 'missed').length;
    const lost = list.filter((a) => a.actionType === 'perte').length;
    const points = list.reduce((s, a) => s + ptsOf(a), 0);
    const poss = list.length;
    const shots = made + missed;
    return { t, made, missed, lost, points, poss, pct: shots ? Math.round((made / shots) * 100) : 0, ppp: poss ? points / poss : 0 };
  });

  // --- Recherche avancée : filtres cumulables ---
  const [fPlayer, setFPlayer] = useState('all');
  const [fQ, setFQ] = useState('all');
  const [fTf, setFTf] = useState('all');
  const [fAct, setFAct] = useState('all');
  const [fRes, setFRes] = useState('all');
  const [fSide, setFSide] = useState<'all' | 'attaque' | 'defense'>('all');
  // Filtre joueur de l'onglet Shot chart (tirs réussis / manqués de ce joueur).
  const [shotPlayer, setShotPlayer] = useState('all');
  const filtered = actions.filter((a) =>
    (fPlayer === 'all' || a.playerId === fPlayer) &&
    (fQ === 'all' || String(a.q) === fQ) &&
    (fTf === 'all' || a.tempsFort === fTf) &&
    (fAct === 'all' || a.actionType === fAct) &&
    (fRes === 'all' || a.shotResult === fRes) &&
    (fSide === 'all' || a.context === fSide)
  );

  const videoClips = actions.filter((a) => a.videoTime != null || a.clipStart != null);

  const sideActions = (side: 'attaque' | 'defense') => actions.filter((a) => a.context === side);
  const tfRowsFor = (side: 'attaque' | 'defense') => A.tfUsed.map((t) => {
    const list = actions.filter((a) => a.context === side && a.tempsFort === t.id);
    const made = list.filter((a) => a.actionType === 'tir' && a.shotResult === 'made').length;
    const missed = list.filter((a) => a.actionType === 'tir' && a.shotResult === 'missed').length;
    const lost = list.filter((a) => side === 'attaque' ? a.actionType === 'perte' : a.actionType === 'perte-adverse').length;
    const points = list.reduce((sum, a) => sum + (side === 'attaque' ? ptsOf(a) : themPtsOf(a)), 0);
    const poss = list.length;
    const shots = made + missed;
    return { t, list, made, missed, lost, points, poss, pct: shots ? Math.round((made / shots) * 100) : 0, ppp: poss ? points / poss : 0 };
  }).filter((r) => r.poss > 0);

  /* AJOUT §11 · Rentabilité par SYSTÈME de jeu. Regroupe les actions par système
     réellement joué : d'abord le nom du playbook (systemeName) s'il existe, sinon
     le slot brut (systemeJeu : 'systeme-1'…). Points par possession, réussite et
     volume, côté attaque comme défense. Chaque ligne ouvre la liste des clips. */
  const sysRowsFor = (side: 'attaque' | 'defense') => {
    const groups = new Map<string, { key: string; label: string; list: StatA[] }>();
    actions.forEach((a) => {
      if (a.context !== side) return;
      const slot = (a as any).systemeJeu || '';
      if (!slot) return;
      const name = (a as any).systemeName as string | undefined;
      const sys = SYSTEMES_JEU.find((s) => s.id === slot);
      const key = slot;
      const label = name || (sys ? sys.label : slot);
      if (!groups.has(key)) groups.set(key, { key, label, list: [] });
      groups.get(key)!.list.push(a);
    });
    return Array.from(groups.values()).map((g) => {
      const made = g.list.filter((a) => a.actionType === 'tir' && a.shotResult === 'made').length;
      const missed = g.list.filter((a) => a.actionType === 'tir' && a.shotResult === 'missed').length;
      const lost = g.list.filter((a) => side === 'attaque' ? a.actionType === 'perte' : a.actionType === 'perte-adverse').length;
      const points = g.list.reduce((sum, a) => sum + (side === 'attaque' ? ptsOf(a) : themPtsOf(a)), 0);
      const poss = g.list.length;
      const shots = made + missed;
      return { ...g, made, missed, lost, points, poss, pct: shots ? Math.round((made / shots) * 100) : 0, ppp: poss ? points / poss : 0 };
    }).filter((r) => r.poss > 0).sort((a, b) => b.ppp - a.ppp);
  };

  const openList = (title: string, items: StatA[]) => {
    setClipList({ title, items });
    if (items.length === 1) setClipAction(items[0]);
  };

  const actionTitle = (a: StatA) => {
    const p = find(a.playerId);
    return `${periodLabel(a.q)} ${a.clock} · ${p ? `#${p.num} ${p.name}` : a.context === 'defense' ? 'Adversaire' : '—'} · ${tags.label(a.tempsFort)} · ${describe(a, find).t}`;
  };

  const SideSwitch = ({ value, onChange }: { value: 'attaque' | 'defense'; onChange: (v: 'attaque' | 'defense') => void }) => (
    <div className="sideSwitch">
      <button className={value === 'attaque' ? 'on' : ''} onClick={() => onChange('attaque')}>↗ Attaque</button>
      <button className={value === 'defense' ? 'on' : ''} onClick={() => onChange('defense')}>🛡 Défense</button>
    </div>
  );

  const Sec = ({ t }: { t: string }) => <div className="boxsec">{t}</div>;
  const Card = ({ t, v, c }: { t: string; v: any; c?: string }) => (
    <div className="boxcard"><div className="bt-lbl2">{t}</div><div className="bt-val" style={{ color: c || 'var(--txt)' }}>{v}</div></div>
  );

  const TABS: [typeof boxTab, string][] = [
    ['box', 'Boxscore joueurs'], ['team', 'Collectif'], ['matrix', 'Matrice'],
    ['systems', 'Systèmes'],
    ['search', 'Recherche avancée'], ['lineups', 'Lineups'], ['shot', 'Shot chart'], ['video', 'Vidéo'],
  ];

  return (
    <div className="box">
      <div className="box-tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={`box-tab ${boxTab === k ? 'on' : ''}`} onClick={() => setBoxTab(k)}>{l}</button>
        ))}
      </div>

      {/* ===== Boxscore joueurs ===== */}
      {boxTab === 'box' && (
        <table>
          <thead><tr><th className="l">Joueur</th><th>PTS</th><th>2PTS</th><th>3PTS</th><th>LF</th><th>RO</th><th>RD</th><th>RT</th><th>PD</th><th>INT</th><th>CT</th><th>BP</th><th>F</th></tr></thead>
          <tbody>
            {box.map((l: any) => (
              <tr key={l.p.id} className="clickRow" onClick={() => openList(`#${l.p.num} ${l.p.name}`, actions.filter((a) => a.playerId === l.p.id))}>
                <td className="l">#{l.p.num} {l.p.name}</td>
                <td><b>{pts(l)}</b></td>
                <td>{l.p2m}/{l.p2a}</td><td>{l.p3m}/{l.p3a}</td><td>{l.ftm}/{l.fta}</td>
                <td>{l.offReb || 0}</td><td>{l.defReb || 0}</td><td>{(l.offReb || 0) + (l.defReb || 0)}</td>
                <td>{l.ast}</td><td>{l.stl}</td><td>{l.blk}</td><td>{l.to}</td><td>{l.pf}</td>
              </tr>
            ))}
            {box.length === 0 && <tr><td className="l" colSpan={13}>Aucune stat pour le moment.</td></tr>}
            {box.length > 0 && (
              <tr className="tot">
                <td className="l">TOTAL ÉQUIPE</td><td>{tot.pts || 0}</td>
                <td>{tot.p2m || 0}/{tot.p2a || 0}</td><td>{tot.p3m || 0}/{tot.p3a || 0}</td><td>{tot.ftm || 0}/{tot.fta || 0}</td>
                <td>{tot.offReb || 0}</td><td>{tot.defReb || 0}</td><td>{(tot.offReb || 0) + (tot.defReb || 0)}</td>
                <td>{tot.ast || 0}</td><td>{tot.stl || 0}</td><td>{tot.blk || 0}</td><td>{tot.to || 0}</td><td>{tot.pf || 0}</td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {/* ===== Collectif ===== */}
      {boxTab === 'team' && (() => {
        const rows = tfRowsFor(boxSide);
        const list = sideActions(boxSide);
        const sidePts = list.reduce((sum, a) => sum + (boxSide === 'attaque' ? ptsOf(a) : themPtsOf(a)), 0);
        const sideShots = list.filter((a) => a.actionType === 'tir' && a.shotType !== 'LF');
        const sideMade = sideShots.filter((a) => a.shotResult === 'made').length;
        const sidePct = sideShots.length ? Math.round((sideMade / sideShots.length) * 100) : 0;
        return (
          <>
            <SideSwitch value={boxSide} onChange={setBoxSide} />
            <div className="cardrow">
              <button className="boxcard clickable" onClick={() => openList(boxSide === 'attaque' ? 'Toutes les actions attaque' : 'Toutes les actions défense', list)}><div className="bt-lbl2">Actions</div><div className="bt-val">{list.length}</div></button>
              <button className="boxcard clickable" onClick={() => openList('Tirs ' + boxSide, sideShots)}><div className="bt-lbl2">Tirs</div><div className="bt-val">{sideMade}/{sideShots.length}</div></button>
              <Card t={boxSide === 'attaque' ? 'Points marqués' : 'Points concédés'} v={sidePts} c="var(--gold)" />
              <Card t="Réussite" v={sidePct + '%'} />
              <Card t="Temps forts" v={rows.length} />
              <Card t="PPP" v={list.length ? (sidePts / list.length).toFixed(2) : '0.00'} />
            </div>
            <Sec t={boxSide === 'attaque' ? 'Temps forts offensifs' : 'Temps forts défensifs'} />
            {rows.length ? (
              <table>
                <thead><tr><th className="l">Temps fort</th><th>Poss.</th><th>Points</th><th>PPP</th><th>Réussite</th></tr></thead>
                <tbody>{rows.map((r) => (
                  <tr key={r.t.id} className="clickRow" onClick={() => openList(`${boxSide === 'attaque' ? 'Attaque' : 'Défense'} · ${tags.label(r.t.id)}`, r.list)}>
                    <td className="l">{tags.emoji(r.t.id)} {tags.label(r.t.id)}</td><td>{r.poss}</td><td>{r.points}</td><td>{r.ppp.toFixed(2)}</td><td>{r.pct}%</td>
                  </tr>
                ))}</tbody>
              </table>
            ) : <div className="tip">Aucune action {boxSide === 'attaque' ? 'offensive' : 'défensive'} rattachée à un temps fort.</div>}
          </>
        );
      })()}

      {/* ===== Matrice temps forts × résultats ===== */}
      {boxTab === 'matrix' && (() => {
        const rows = tfRowsFor(matrixSide);
        return rows.length ? (
          <>
            <SideSwitch value={matrixSide} onChange={setMatrixSide} />
            <table className="matrixClick">
              <thead><tr><th className="l">Temps fort</th><th>Marqué</th><th>Raté</th><th>Perte</th><th>%</th><th>Points</th><th>PPP</th></tr></thead>
              <tbody>{rows.map((r) => {
                const madeList = r.list.filter((a) => a.actionType === 'tir' && a.shotResult === 'made');
                const missedList = r.list.filter((a) => a.actionType === 'tir' && a.shotResult === 'missed');
                const lostList = r.list.filter((a) => matrixSide === 'attaque' ? a.actionType === 'perte' : a.actionType === 'perte-adverse');
                return (
                  <tr key={r.t.id}>
                    <td className="l clickCell" onClick={() => openList(`${matrixSide} · ${tags.label(r.t.id)}`, r.list)}>{tags.emoji(r.t.id)} {tags.label(r.t.id)}</td>
                    <td><button className="cellBtn ok" onClick={() => openList(`${tags.label(r.t.id)} · paniers marqués`, madeList)}>{r.made}</button></td>
                    <td><button className="cellBtn ko" onClick={() => openList(`${tags.label(r.t.id)} · tirs ratés`, missedList)}>{r.missed}</button></td>
                    <td><button className="cellBtn" onClick={() => openList(`${tags.label(r.t.id)} · pertes`, lostList)}>{r.lost}</button></td>
                    <td>{r.pct}%</td><td>{r.points}</td><td>{r.ppp.toFixed(2)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </>
        ) : <><SideSwitch value={matrixSide} onChange={setMatrixSide} /><div className="tip">Aucune action {matrixSide === 'attaque' ? 'offensive' : 'défensive'} rattachée à un temps fort.</div></>;
      })()}

      {/* ===== AJOUT §11 · Rentabilité par système (attaque / défense) ===== */}
      {boxTab === 'systems' && (() => {
        const rows = sysRowsFor(sysSide);
        return rows.length ? (
          <>
            <SideSwitch value={sysSide} onChange={setSysSide} />
            <div className="tip" style={{ marginBottom: 8 }}>
              {sysSide === 'attaque' ? 'Rentabilité de tes systèmes offensifs' : 'Rendement concédé sur les systèmes adverses'} · PPP = points par possession · clique une cellule pour revoir les clips.
            </div>
            <table className="matrixClick">
              <thead><tr><th className="l">Système</th><th>Poss.</th><th>Marqué</th><th>Raté</th><th>Perte</th><th>%</th><th>Points</th><th>PPP</th></tr></thead>
              <tbody>{rows.map((r) => {
                const madeList = r.list.filter((a) => a.actionType === 'tir' && a.shotResult === 'made');
                const missedList = r.list.filter((a) => a.actionType === 'tir' && a.shotResult === 'missed');
                const lostList = r.list.filter((a) => sysSide === 'attaque' ? a.actionType === 'perte' : a.actionType === 'perte-adverse');
                return (
                  <tr key={r.key}>
                    <td className="l clickCell" onClick={() => openList(`${sysSide} · ${r.label}`, r.list)}>{r.label}</td>
                    <td>{r.poss}</td>
                    <td><button className="cellBtn ok" onClick={() => openList(`${r.label} · paniers marqués`, madeList)}>{r.made}</button></td>
                    <td><button className="cellBtn ko" onClick={() => openList(`${r.label} · tirs ratés`, missedList)}>{r.missed}</button></td>
                    <td><button className="cellBtn" onClick={() => openList(`${r.label} · pertes`, lostList)}>{r.lost}</button></td>
                    <td>{r.pct}%</td><td>{r.points}</td>
                    <td><b style={{ color: r.ppp >= 1 ? 'var(--green)' : r.ppp >= 0.8 ? 'var(--gold)' : 'var(--red)' }}>{r.ppp.toFixed(2)}</b></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </>
        ) : (
          <>
            <SideSwitch value={sysSide} onChange={setSysSide} />
            <div className="tip">Aucun système {sysSide === 'attaque' ? 'offensif' : 'défensif'} codé. Associe un playbook à la création du match, ou code l'étape « Système de jeu » pendant la saisie.</div>
          </>
        );
      })()}

      {/* ===== Recherche avancée : filtres cumulables ===== */}
      {boxTab === 'search' && (
        <>
          <div className="srch-filters">
            <select value={fPlayer} onChange={(e) => setFPlayer(e.target.value)}><option value="all">Joueur : tous</option>{roster.map((p) => <option key={p.id} value={p.id}>#{p.num} {p.name}</option>)}</select>
            <select value={fQ} onChange={(e) => setFQ(e.target.value)}><option value="all">QT : tous</option>{[1, 2, 3, 4].map((n) => <option key={n} value={String(n)}>{periodLabel(n)}</option>)}</select>
            <select value={fTf} onChange={(e) => setFTf(e.target.value)}><option value="all">Temps fort : tous</option>{A.tfUsed.map((t) => <option key={t.id} value={t.id}>{tags.label(t.id)}</option>)}</select>
            <select value={fAct} onChange={(e) => setFAct(e.target.value)}><option value="all">Action : toutes</option><option value="tir">Tir</option><option value="perte">Perte</option><option value="faute-provoquee">Faute provoquée</option><option value="interception">Interception</option><option value="contre">Contre</option></select>
            <select value={fRes} onChange={(e) => setFRes(e.target.value)}><option value="all">Résultat : tous</option><option value="made">Marqué</option><option value="missed">Raté</option></select>
            <select value={fSide} onChange={(e) => setFSide(e.target.value as 'all' | 'attaque' | 'defense')}><option value="all">Att./Déf. : tout</option><option value="attaque">Attaque</option><option value="defense">Défense</option></select>
            <button className="srch-reset" onClick={() => { setFPlayer('all'); setFQ('all'); setFTf('all'); setFAct('all'); setFRes('all'); setFSide('all'); }}>↺ Réinitialiser</button>
          </div>
          <div className="srch-count"><b>{filtered.length}</b> action{filtered.length > 1 ? 's' : ''} trouvée{filtered.length > 1 ? 's' : ''}</div>
          <div className="srch-list">
            {filtered.slice(0, 200).map((a) => {
              const p = find(a.playerId);
              return <button key={a.id} className="srch-row clickRowBtn" onClick={() => setClipAction(a)}><span className="sr-t">{periodLabel(a.q)} {a.clock}</span><span className="sr-p">{p ? `#${p.num} ${p.name}` : a.context === 'defense' ? 'Adversaire' : '—'}</span><span className="sr-d">{a.context === 'defense' ? 'Défense' : 'Attaque'} · {tags.label(a.tempsFort)} · {describe(a, find).t}</span></button>;
            })}
            {filtered.length === 0 && <div className="tip">Aucune action ne correspond à ces filtres.</div>}
          </div>
        </>
      )}

      {/* ===== Lineups ===== */}
      {boxTab === 'lineups' && (
        A.lineups.length ? (
          <table>
            <thead><tr><th className="l">5 sur le terrain</th><th>Actions</th><th>Pts pour</th><th>Pts contre</th><th>+/-</th><th>OffRtg</th><th>DefRtg</th><th>NetRtg</th></tr></thead>
            <tbody>
              {A.lineups.slice().sort((a: any, b: any) => (b.us - b.them) - (a.us - a.them)).map((L: any, i: number) => {
                const names = L.ids.map((id: string) => { const p = roster.find((x) => x.id === id); return p ? '#' + p.num : '?'; }).join(' ');
                const diff = L.us - L.them;
                const off = L.n ? Math.round((L.us / L.n) * 100) : 0;
                const def = L.n ? Math.round((L.them / L.n) * 100) : 0;
                return (
                  <tr key={i}><td className="l">{names}</td><td>{L.n}</td><td>{L.us}</td><td>{L.them}</td>
                    <td><b style={{ color: diff >= 0 ? 'var(--green)' : 'var(--red)' }}>{diff >= 0 ? '+' : ''}{diff}</b></td>
                    <td>{off}</td><td>{def}</td><td><b style={{ color: off - def >= 0 ? 'var(--green)' : 'var(--red)' }}>{off - def >= 0 ? '+' : ''}{off - def}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="tip">Pas encore de données de lineup.</div>
      )}

      {/* ===== Shot chart ===== */}
      {boxTab === 'shot' && (() => {
        const attackShotsAll = actions.filter((a) => a.context === 'attaque' && a.actionType === 'tir' && a.shotType !== 'LF');
        const attackShots = shotPlayer === 'all' ? attackShotsAll : attackShotsAll.filter((a) => a.playerId === shotPlayer);
        const defenseShots = actions.filter((a) => a.context === 'defense' && a.actionType === 'tir' && a.shotType !== 'LF');
        const summary = (arr: StatA[]) => {
          const att = arr.length;
          const made = arr.filter((a) => a.shotResult === 'made').length;
          return { att, made, pct: att ? Math.round((made / att) * 100) : 0 };
        };
        const Ashot = summary(attackShots);
        const Dshot = summary(defenseShots);
        return (
          <div className="box-shot dualShot">
            <div className="shot-head">
              <select value={shotPlayer} onChange={(e) => setShotPlayer(e.target.value)}>
                <option value="all">Tous les joueurs en attaque</option>
                {roster.map((p) => <option key={p.id} value={p.id}>#{p.num} {p.name}</option>)}
              </select>
              <div className="shot-tot">
                <span>Attaque <b>{Ashot.made}/{Ashot.att}</b> <b className="gold">{Ashot.pct}%</b></span>
                <span>Défense concédée <b>{Dshot.made}/{Dshot.att}</b> <b className="gold">{Dshot.pct}%</b></span>
              </div>
            </div>
            <div className="shotPair">
              <div className="shotPanel">
                <div className="boxsec">Shot chart attaque</div>
                {Ashot.att === 0 ? <div className="tip">Aucun tir attaque.</div> : <ShotChart mode="analysis" size="lg" showPoints showDots shots={attackShots} onShotClick={(a) => setClipAction(a as unknown as StatA)} />}
              </div>
              <div className="shotPanel">
                <div className="boxsec">Shot chart défense — tirs concédés</div>
                {Dshot.att === 0 ? <div className="tip">Aucun tir concédé localisé.</div> : <ShotChart mode="analysis" size="lg" showPoints showDots shots={defenseShots} onShotClick={(a) => setClipAction(a as unknown as StatA)} />}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ===== Vidéo ===== */}
      {boxTab === 'video' && (
        videoClips.length ? (
          <div className="srch-list">
            {videoClips.map((a) => {
              const p = find(a.playerId);
              return <button key={a.id} className="srch-row clickRowBtn" onClick={() => setClipAction(a)}><span className="sr-t">{periodLabel(a.q)} {a.clock}</span><span className="sr-p">{p ? `#${p.num} ${p.name}` : a.context === 'defense' ? 'Adversaire' : '—'}</span><span className="sr-d">{a.context === 'defense' ? 'Défense' : 'Attaque'} · {tags.label(a.tempsFort)} · {describe(a, find).t}</span></button>;
            })}
          </div>
        ) : <div className="tip">Aucun clip vidéo synchronisé pour le moment.</div>
      )}

      {/* §25 · popup clips COMMUNE — Boxscore / Matrice / Systèmes / Shot chart */}
      <ActionClipsModal
        open={!!clipList || !!clipAction}
        actions={(clipList ? clipList.items : clipAction ? [clipAction] : []) as unknown as ClipAction[]}
        title={clipList ? clipList.title : clipAction ? 'Séquence codée' : ''}
        videoUrl={videoProvider === 'local' ? videoUrl : ''}
        sync={sync}
        onClose={() => { setClipList(null); setClipAction(null); }}
        onAddToMontage={onAddToMontage ? (a: ClipAction) => onAddToMontage(a as unknown as StatA) : undefined}
        onSaveNote={onSaveNote ? (a: ClipAction, note: string) => { if (a.id) onSaveNote(a.id, note); } : undefined}
        onTrim={onTrim ? (a: ClipAction, cs: number, ce: number) => { if (a.id) onTrim(a.id, cs, ce); } : undefined}
        getEdit={getEdit ? (a: ClipAction) => a.id ? getEdit(a.id) : undefined : undefined}
        describe={(a: ClipAction) => actionTitle(a as unknown as StatA)}
        playerName={(id: string | null | undefined) => { const p = find(id ?? null); return p ? `#${p.num} ${p.name}` : undefined; }}
        tempsFortLabel={(id: string | null | undefined) => tags.label(id ?? '')}
      />
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

      /* ===== ÉCRAN CRÉER LE MATCH (design V10.8) ===== */
      #create-match { position: fixed; inset: 0; z-index: 40; overflow: auto; display: flex; flex-direction: column;
        background: radial-gradient(1200px 600px at 50% -5%, #141a2b 0%, var(--bg) 60%); }
      .cm-head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 16px 26px; border-bottom: 1px solid var(--border); }
      .cm-brand { display: flex; align-items: center; gap: 11px; }
      .cm-logo { width: 34px; height: 34px; border-radius: 9px; background: var(--panel2); display: grid; place-items: center; color: var(--gold); font-size: 17px; }
      .cm-t { font-size: 13px; font-weight: 900; letter-spacing: .03em; } .cm-s { font-size: 9px; color: var(--mute); font-weight: 800; letter-spacing: .12em; }
      .cm-head-r { display: flex; gap: 10px; align-items: center; }
      .cm-ghost { display: flex; align-items: center; gap: 7px; background: var(--panel2); border: 1px solid var(--border); border-radius: 10px; padding: 9px 14px; font-size: 12px; font-weight: 800; color: var(--txt); cursor: pointer; }
      .cm-ghost.sm { padding: 6px 11px; font-size: 11px; }
      .cm-body { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 22px; padding: 24px 26px; align-items: start; }
      .cm-hero { display: flex; gap: 18px; align-items: center; margin-bottom: 20px; }
      .cm-hero-ic { width: 92px; height: 92px; border-radius: 50%; background: radial-gradient(circle at 40% 30%, #6d1626, #45101c); display: grid; place-items: center; font-size: 38px; flex: 0 0 auto; border: 1px solid #7c2136; }
      .cm-eyebrow { font-size: 11px; font-weight: 900; color: var(--gold); letter-spacing: .14em; }
      .cm-h1 { font-size: 44px; font-weight: 900; line-height: 1.02; margin: 2px 0 6px; }
      .cm-sub { font-size: 13px; color: var(--mute); }
      .cm-card { background: rgba(16,19,31,.7); border: 1px solid var(--border); border-radius: 16px; padding: 18px 20px; margin-bottom: 16px; }
      .cm-card-t { font-size: 12px; font-weight: 900; color: var(--gold); letter-spacing: .08em; margin-bottom: 14px; }
      .cm-opt { color: var(--mute); font-weight: 700; letter-spacing: .04em; font-size: 10px; margin-left: 6px; }
      .cm-form { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .cm-field { display: flex; flex-direction: column; gap: 6px; font-size: 11px; font-weight: 800; color: var(--mute); }
      .cm-auto { font-size: 10px; font-weight: 600; color: var(--mute); font-style: italic; }
      .cm-auto b { color: var(--gold); font-style: normal; }
      .cm-input { display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); padding: 0 11px; height: 44px; }
      .cm-input span { color: var(--mute); font-size: 13px; }
      .cm-input input, .cm-input select { flex: 1; border: 0; background: transparent; color: var(--txt); font: inherit; font-size: 13px; font-weight: 700; outline: none; height: 100%; }
      .cm-input input::placeholder { color: #5a6070; font-weight: 600; }
      .cm-venue { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; height: 44px; }
      .cm-v { background: var(--panel); font-size: 12px; font-weight: 900; display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--txt); cursor: pointer; border: 0; }
      .cm-v.on { background: var(--gold); color: #201b19; }
      .cm-video { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
      .cm-vid { position: relative; border: 1px solid var(--border); border-radius: 14px; background: var(--card); padding: 16px 14px; cursor: pointer; min-height: 120px; }
      .cm-vid.on { border-color: var(--gold); }
      .cm-vid-ck { position: absolute; top: 10px; right: 10px; width: 22px; height: 22px; border-radius: 50%; background: var(--gold); color: #201b19; display: grid; place-items: center; font-size: 12px; font-weight: 900; }
      .cm-vid-ic { font-size: 22px; color: var(--gold); margin-bottom: 8px; }
      .cm-vid-t { font-size: 13px; font-weight: 800; margin-bottom: 4px; } .cm-vid-d { font-size: 11px; color: var(--mute); line-height: 1.35; }
      .cm-right { background: rgba(16,19,31,.55); border: 1px solid var(--border); border-radius: 16px; padding: 16px; }
      .cm-right-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
      .cm-5t { font-size: 13px; } .cm-5t b { color: var(--gold); } .cm-5c { color: var(--mute); font-size: 11px; font-weight: 800; margin-left: 6px; }
      .cm-players { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 11px; }
      .cm-p { position: relative; border: 1px solid var(--border); border-radius: 13px; background: var(--card); padding: 12px 10px 10px; text-align: center; cursor: pointer; transition: border-color .12s; }
      .cm-p:hover { border-color: #3a4256; }
      .cm-p.on { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold) inset; }
      .cm-p-num { position: absolute; top: 9px; left: 11px; font-size: 17px; font-weight: 900; }
      .cm-p-ck { position: absolute; top: 9px; right: 11px; color: var(--mute); font-size: 15px; }
      .cm-p.on .cm-p-ck { color: var(--gold); }
      .cm-p-av { width: 56px; height: 56px; border-radius: 50%; overflow: hidden; margin: 6px auto 8px; display: grid; place-items: center; }
      .cm-p-av .av { width: 56px; height: 56px; border-radius: 50%; font-size: 18px; }
      .cm-p-nm { font-size: 12px; font-weight: 800; }
      .cm-p-pos { font-size: 9.5px; font-weight: 800; margin-top: 3px; color: var(--blue); }
      .cm-slots { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
      .cm-slot { display: flex; flex-direction: column; gap: 5px; }
      .cm-slot-l { font-size: 9px; font-weight: 800; color: var(--mute); letter-spacing: .04em; text-align: center; }
      .cm-slot-e { border: 1px dashed var(--border); border-radius: 10px; min-height: 54px; display: grid; place-items: center; font-size: 11px; font-weight: 800; color: var(--mute); text-align: center; padding: 4px; }
      .cm-slot-f { border: 1px solid var(--gold); border-radius: 10px; min-height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; background: rgba(212,162,76,.1); font-size: 11px; font-weight: 800; padding: 4px; position: relative; }
      .cm-slot-f .rm { position: absolute; top: 3px; right: 5px; color: var(--mute); font-size: 11px; cursor: pointer; }
      .cm-warn { margin-top: 14px; display: flex; align-items: center; gap: 9px; background: rgba(212,162,76,.1); border: 1px solid rgba(212,162,76,.4); border-radius: 10px; padding: 11px 14px; font-size: 12px; font-weight: 700; color: var(--gold); }
      .cm-warn.ok { background: rgba(54,179,126,.12); border-color: rgba(54,179,126,.4); color: var(--green); }
      .cm-foot { flex: 0 0 auto; display: grid; grid-template-columns: 1fr auto; gap: 22px; align-items: center; padding: 18px 26px; margin: 0 26px 22px; background: rgba(16,19,31,.8); border: 1px solid var(--border); border-radius: 16px; }
      .cm-sum-t { font-size: 12px; font-weight: 900; color: var(--gold); letter-spacing: .08em; margin-bottom: 12px; }
      .cm-sum-grid { display: grid; grid-template-columns: repeat(6,auto); gap: 26px; }
      .cm-sum { display: flex; flex-direction: column; gap: 4px; }
      .cm-sum-l { font-size: 9px; font-weight: 800; color: var(--mute); letter-spacing: .08em; }
      .cm-sum-v { font-size: 13px; font-weight: 800; } .cm-sum-v .gold { color: var(--gold); }
      .cm-start-wrap { text-align: center; }
      .cm-start { background: linear-gradient(180deg,#c12a44,#8a1428); border: 1px solid #c12a44; border-radius: 12px; padding: 18px 34px; font-size: 17px; font-weight: 900; color: #fff; white-space: nowrap; }
      .cm-start:disabled { background: #2a2030; border-color: #3a2f3a; color: #7a6a72; cursor: not-allowed; opacity: .7; }
      .cm-start:not(:disabled) { box-shadow: 0 10px 30px -10px #c12a44; cursor: pointer; }
      .cm-start-hint { font-size: 11px; color: var(--mute); margin-top: 8px; }
      .cm-start-fixed { position: fixed; right: 42px; bottom: 34px; z-index: 9999; display: flex; align-items: center; gap: 10px; }
      .cm-start-main { min-width: 250px; border-radius: 16px; background: linear-gradient(135deg,#d4a24c,#f3c75b); border-color: #f3c75b; color: #0b0f1e; box-shadow: 0 14px 34px rgba(212,162,76,.35); text-transform: uppercase; letter-spacing: .04em; }
      .cm-start-main:disabled { background: #2a2030; border-color: #3a2f3a; color: #7a6a72; box-shadow: none; }
      .cm-start-fixed-only {
        position: fixed;
        right: 42px;
        bottom: 34px;
        z-index: 2147483647;
        height: 56px;
        min-width: 265px;
        padding: 0 42px;
        border-radius: 18px;
        border: 2px solid #f3c75b;
        background: linear-gradient(135deg,#d4a24c,#f3c75b);
        color: #080b17;
        font-size: 16px;
        font-weight: 950;
        letter-spacing: .04em;
        text-transform: uppercase;
        box-shadow: 0 16px 38px rgba(212,162,76,.42);
        cursor: pointer;
      }
      .cm-start-fixed-only:hover:not(:disabled) { transform: translateY(-2px); }
      .cm-start-fixed-only:disabled {
        opacity: .38;
        cursor: not-allowed;
        filter: grayscale(.4);
        box-shadow: none;
      }

      .cm-left .vid-input { margin-top: 12px; }
      /* AJOUT §12 · effectif adverse */
      .opp-add { display: grid; grid-template-columns: 70px 1fr auto; gap: 6px; }
      .opp-add input { border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 8px; padding: 8px 9px; font: inherit; font-size: 12.5px; }
      .opp-addbtn { border: 1px solid var(--gold); background: rgba(212,162,76,.12); color: var(--gold); border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 900; cursor: pointer; white-space: nowrap; }
      .opp-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
      .opp-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border); background: var(--card); border-radius: 999px; padding: 5px 6px 5px 11px; font-size: 12px; font-weight: 700; }
      .opp-chip button { border: none; background: rgba(229,72,77,.15); color: var(--red); border-radius: 50%; width: 18px; height: 18px; cursor: pointer; font-size: 10px; }

      /* AJOUT · mapping playbook */
      .pbmap { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 12px; }
      .pbmap-row { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.2fr); align-items: center; gap: 6px; font-size: 11px; font-weight: 800; color: var(--mute); }
      .pbmap-slot { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .pbmap-row select { border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 7px; padding: 6px 7px; font: inherit; font-size: 11.5px; font-weight: 700; min-width: 0; }
      @media (max-width: 700px) { .pbmap { grid-template-columns: 1fr; } }

      /* AJOUT · projets brouillons */
      .prj-list { display: flex; flex-direction: column; gap: 8px; }
      .prj-row { display: grid; grid-template-columns: minmax(0,1fr) auto auto; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 10px; padding: 9px 11px; background: var(--card); }
      .prj-tx { min-width: 0; display: grid; gap: 2px; }
      .prj-tx b { font-size: 13px; } .prj-tx small { font-size: 11px; color: var(--mute); }
      .prj-open { border: 1px solid var(--gold); background: rgba(212,162,76,.12); color: var(--gold); border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 900; cursor: pointer; white-space: nowrap; }
      .prj-del { border: 1px solid var(--border); background: var(--panel); color: var(--red); border-radius: 8px; padding: 7px 10px; font-size: 12px; cursor: pointer; }
      .prj-open:disabled, .prj-del:disabled { opacity: .5; cursor: not-allowed; }
      @media (max-width: 1000px) {
        .cm-body { grid-template-columns: 1fr; }
        .cm-h1 { font-size: 34px; }
        .cm-sum-grid { grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
        .cm-foot { grid-template-columns: 1fr; gap: 14px; }
      }
      @media (max-width: 600px) {
        .cm-form { grid-template-columns: 1fr; } .cm-video { grid-template-columns: 1fr; }
        .cm-players { grid-template-columns: 1fr 1fr; } .cm-slots { grid-template-columns: 1fr 1fr; }
        .cm-hero-ic { width: 64px; height: 64px; font-size: 26px; } .cm-h1 { font-size: 26px; }
        .cm-sum-grid { grid-template-columns: 1fr 1fr; } .cm-start { width: 100%; }
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
      .vid-reselect { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin: 10px 12px; padding: 11px 14px; background: rgba(212,162,76,.12); border: 1px solid rgba(212,162,76,.5); border-radius: 12px; color: #6B1A2C; font-size: 13px; font-weight: 700; }
      .vid-reselect b { color: #2b2b2b; }
      .vid-reselect-btn { background: #6B1A2C; color: #fff; border-radius: 9px; padding: 8px 14px; font-size: 12.5px; font-weight: 900; cursor: pointer; }
      .vid-reselect-btn input[type="file"] { display: none; }
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
        flex: 0 0 82px;
        min-height: 82px;
        display: grid;
        grid-template-columns: 190px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
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
        grid-template-columns: minmax(110px, 1fr) 76px 132px 96px minmax(110px, 1fr);
        align-items: center;
        justify-content: center;
        gap: 8px;
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
        font-size: 25px;
        line-height: 1;
        min-width: 58px;
        text-align: center;
        border-radius: 10px;
        padding: 7px 0;
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
        width: 132px;
        min-width: 132px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        padding: 7px 10px;
        border-radius: 13px;
        background: rgba(23, 27, 41, 0.72);
        border: 1px solid rgba(42, 49, 66, 0.75);
      }

      .clk {
        font-size: 25px;
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
        flex: 0 0 38px;
        min-height: 38px;
        display: flex;
        gap: 10px;
        justify-content: center;
        align-items: center;
        padding: 4px 10px;
        background: #0b0f1d;
        border-bottom: 1px solid var(--border);
        overflow: hidden;
      }

      .qbox {
        font-size: 13px;
        color: var(--mute);
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 6px 16px;
        line-height: 1.1;
        font-weight: 800;
      }

      .qbox b {
        color: var(--txt);
        font-size: 14px;
      }

      .foulbox {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 6px 12px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: rgba(23, 27, 41, .75);
        color: var(--mute);
        font-size: 12px;
        font-weight: 900;
        white-space: nowrap;
      }
      .foulbox b { color: var(--gold); font-size: 14px; }

      .qbox.cur {
        border-color: var(--gold);
      }

      /* ===================== V6 · Studio layout ===================== */
      .mtabs { display: none; }

      /* ===================== V7 · Workspace à onglets ===================== */
      .wtabs { display: none !important; }
      .wtab { flex: 0 0 auto; border: 1px solid var(--border); background: transparent; color: var(--mute); border-radius: 9px; padding: 7px 12px; font-size: 12.5px; font-weight: 800; cursor: pointer; white-space: nowrap; }
      .wtab.on { background: var(--bordeaux); color: #fff; border-color: var(--bordeaux); }

      /* ===================== V10.8 · Layout live (vidéo / codage / chart+joueurs / strip) ===================== */
      .live3 { flex: 1; min-height: 0; display: grid; grid-template-columns: 46% minmax(0, 1fr) 300px; gap: 8px; padding: 8px 10px 4px; overflow: hidden; }
      .lc { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
      /* Vidéo = élément principal, occupe toute la colonne gauche */
      .lc-video { padding: 0; }
      .lc-video .videoSlot { flex: 1; min-height: 0; }
      /* Colonne droite : shot chart en haut + joueurs/banc en bas, scrollable */
      .lc-right { overflow-y: auto; }
      .lc-right .scZone { flex: 0 0 auto; }
      /* Bandeau bas : timeline / historique / matrice / montage */
      .live-strip { flex: 0 0 auto; height: 210px; margin: 0 10px 8px; background: var(--panel); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
      .live-strip .an-tabs { flex: 0 0 auto; }
      .live-strip .an-body { flex: 1; min-height: 0; overflow-y: auto; }

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
      .codeDense .bt { min-height: 0 !important; height: auto !important; flex-direction: row; justify-content: flex-start; gap: 10px; padding: 12px 14px !important; border-radius: 11px; }
      .codeDense .bt .ic { font-size: 20px !important; }
      .codeDense .bt .lbl { font-size: 14px !important; font-weight: 900; text-align: left; }
      .codeDense .grid.big { grid-template-columns: 1fr 1fr; }
      .codeDense .grid.big .bt { min-height: 0 !important; height: auto !important; padding: 12px 10px !important; }
      .codeDense .chip { padding: 7px 9px; font-size: 12px; }
      .codeDense .seg { gap: 4px; }
      .codeDense .segb { padding: 7px 6px; font-size: 12px; }
      .codeDense .res { padding: 9px 10px; font-size: 13px; }
      .codeDense .pl { min-height: 0 !important; height: auto !important; flex-direction: row; justify-content: flex-start; gap: 6px; padding: 6px 8px !important; }
      .codeDense .pl { color: #fff !important; }
      .codeDense .pl .nm { font-size: 12px; color: #fff !important; }
      .codeDense .pl .num { color: #fff !important; }
      .codeDense .wztitle { font-size: 15px; }
      .codeDense .wzsub { font-size: 11px; }
      .codeDense .wzstep { font-size: 9px; }

      /* Joueurs compacts dans la colonne codage */
      .lc-players { flex: 1 1 auto; border-top: 1px solid var(--border); padding: 8px; display: grid; gap: 8px; min-height: 0; overflow-y: auto; }
      .lcp-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; overflow: visible; }
      .lcp-row.bench { grid-template-columns: 28px repeat(2, minmax(0, 1fr)); align-items: stretch; }
      .pchip.xs { min-width: 0; display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto auto; column-gap: 7px; row-gap: 1px; align-items: center; padding: 8px 9px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); color: var(--ink); cursor: pointer; font-size: 11px; text-align: left; }
      .pchip.xs .num { grid-row: 1 / 4; font-weight: 950; font-size: 15px; color: var(--gold); }
      .pchip.xs .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 900; }
      .pchip.xs .pstat { color: var(--txt); font-size: 10px; font-weight: 800; }
      .pchip.xs .pstat b { color: #fff; font-size: 12px; }
      .pchip.xs .pstat em { color: var(--gold); font-style: normal; }
      .fdots { display: inline-flex; gap: 3px; align-items: center; }
      .fdots i { width: 5px; height: 5px; border-radius: 50%; border: 1px solid rgba(255,255,255,.24); background: transparent; }
      .fdots i.on { background: var(--red); border-color: var(--red); }
      .pchip.xs.active { border-color: var(--gold); background: rgba(212,162,76,.16); }
      .pchip.xs.swap { outline: 1px dashed var(--gold); }
      .pchip.xs.bench { opacity: .86; }
      .pchip.xs.bench.sel { opacity: 1; border-color: var(--gold); background: rgba(212,162,76,.16); }
      .pbtoggle.xs { width: 28px; min-height: 48px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); color: var(--mute); cursor: pointer; }
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

      /* V8 · Timeline Sportscode */
      .tl-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: 8px; gap: 6px; }
      .tl-legend { flex: 0 0 auto; display: flex; flex-wrap: wrap; gap: 10px; font-size: 10px; color: var(--mute); }
      .tl-legend span { display: inline-flex; align-items: center; gap: 4px; }
      .tl-legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
      .tl-grid { flex: 1; min-height: 0; overflow: auto; display: flex; flex-direction: column; gap: 3px; }
      .tl-row { display: grid; grid-template-columns: 84px 1fr; align-items: center; gap: 6px; min-height: 24px; }
      .tl-label { font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tl-track { position: relative; height: 22px; background: var(--card); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
      .tl-qsep { position: absolute; top: 0; bottom: 0; width: 1px; background: rgba(255,255,255,.18); }
      .tl-evt { position: absolute; top: 3px; width: 10px; height: 16px; transform: translateX(-50%); border: 1px solid rgba(0,0,0,.4); border-radius: 3px; cursor: pointer; padding: 0; }
      .tl-evt:hover { outline: 2px solid var(--gold); z-index: 2; }
      .tl-axis { flex: 0 0 auto; display: flex; padding-left: 90px; }
      .tl-axis span { font-size: 10px; color: var(--mute); text-align: center; border-left: 1px solid var(--border); }

      /* V8 · Popup événement (revoir + modifier) */
      .zpop-card.evt { width: min(560px, 94vw); gap: 10px; }
      .evt-video { background: #05070e; border-radius: 10px; overflow: hidden; aspect-ratio: 16/9; display: grid; place-items: center; }
      .evt-vplayer { width: 100%; height: 100%; object-fit: contain; background: #000; }
      .evt-noclip { color: var(--mute); font-size: 13px; }
      .evt-info { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 700; }
      .evt-tools { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .evt-tools button, .evt-tools select { border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 800; cursor: pointer; }
      .evt-tools button.on { background: var(--gold); color: #201b19; border-color: var(--gold); }
      .evt-tools button.danger { color: var(--red); border-color: #e6b9b9; }
      .evt-note { font-size: 10.5px; color: var(--mute); }

      /* V8 · Popup clip complète (rognage / note / dessin / préc-suiv) */
      .zpop-card.clip { width: min(680px, 96vw); gap: 9px; }
      .clip-nav { display: flex; align-items: center; gap: 6px; }
      .clip-nav button { border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 8px; padding: 4px 9px; font-size: 12px; font-weight: 800; cursor: pointer; }
      .clip-nav button:last-child { border: 0; background: transparent; color: var(--mute); font-size: 18px; padding: 0 4px; }
      .clip-nav button:disabled { opacity: .4; cursor: not-allowed; }
      .clip-stage { position: relative; background: #05070e; border-radius: 10px; overflow: hidden; aspect-ratio: 16/9; display: grid; place-items: center; }
      .clip-draw { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
      .clip-draw.active { pointer-events: auto; cursor: crosshair; }
      .clip-draws { display: flex; flex-wrap: wrap; gap: 6px; }
      .clip-draws button { border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 8px; padding: 6px 10px; font-size: 12px; font-weight: 800; cursor: pointer; }
      .clip-draws button.on { background: var(--gold); color: #201b19; border-color: var(--gold); }
      .clip-draws button.danger { color: var(--red); border-color: #e6b9b9; }
      .clip-draws button:disabled { opacity: .4; cursor: not-allowed; }
      .clip-trim { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
      .clip-trim-lbl { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: var(--mute); }
      .clip-trim button { border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 8px; padding: 5px 9px; font-size: 12px; font-weight: 800; cursor: pointer; }
      .clip-trim-val { font-size: 11px; color: var(--gold); font-weight: 800; font-variant-numeric: tabular-nums; }
      .clip-note { border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 13px; min-height: 46px; resize: vertical; background: var(--card); color: var(--txt); }

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
      .mo-picker { display: flex; align-items: center; gap: 6px; }
      .mo-picker select { flex: 1; min-width: 0; border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 13px; background: var(--card); color: var(--txt); }
      .mo-new { border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 8px; padding: 7px 10px; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap; }
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

      /* Bloc 6 · Montage 3 colonnes (bibliothèque / storyboard / propriétés) */
      .mo3 { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 8px; overflow: hidden; }
      .mo-col { min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 10px; background: var(--panel); overflow: hidden; }
      .mo-col-h { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 7px 9px; border-bottom: 1px solid var(--border); font-size: 11.5px; font-weight: 800; color: var(--mute); }
      .mo-col-b { flex: 1; min-height: 0; overflow-y: auto; padding: 7px; display: flex; flex-direction: column; gap: 6px; }
      .mo-lib { display: grid; grid-template-columns: minmax(0,1fr) 30px; align-items: center; gap: 6px; border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; background: var(--card); }
      .mo-lib-tx { min-width: 0; display: grid; gap: 2px; }
      .mo-lib-tx b { font-size: 12px; } .mo-lib-tx small { font-size: 10.5px; color: var(--mute); }
      .mo-lib-add { width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--gold); background: rgba(212,162,76,.14); color: var(--gold); font-size: 16px; font-weight: 900; cursor: pointer; }
      .mo-pick { flex: 1; min-width: 0; border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; font: inherit; font-size: 12px; background: var(--card); color: var(--txt); }
      .mo-item { cursor: pointer; }
      .mo-item.sel { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold) inset; }
      .mo-add { flex: 0 0 auto; display: flex; gap: 5px; padding: 7px; border-top: 1px solid var(--border); }
      .mo-add button { flex: 1; border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 7px; padding: 7px 4px; font-size: 11.5px; font-weight: 800; cursor: pointer; }
      .mo-props .mo-col-b { gap: 8px; }
      .mo-f { display: flex; flex-direction: column; gap: 4px; font-size: 10.5px; font-weight: 800; color: var(--mute); }
      .mo-f input, .mo-f textarea { border: 1px solid var(--border); border-radius: 7px; padding: 6px 8px; font: inherit; font-size: 12.5px; font-weight: 600; background: var(--card); color: var(--txt); }
      .mo-f textarea { min-height: 44px; resize: vertical; }
      .mo-f-h { font-size: 11px; font-weight: 800; color: var(--gold); text-transform: uppercase; letter-spacing: .04em; }
      .mo-frow { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      .mo-sep { height: 1px; background: var(--border); margin: 2px 0; }
      .mo-foot { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; padding: 7px; border-top: 1px solid var(--border); }
      .mo-export { border: 1px solid var(--border); background: var(--panel); color: var(--mute); border-radius: 8px; padding: 7px 10px; font-size: 11.5px; font-weight: 800; opacity: .55; cursor: not-allowed; }
      @media (max-width: 900px) { .mo3 { grid-template-columns: 1fr; overflow-y: auto; } .mo-col { min-height: 160px; } }

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

      /* Onglets de l'analyse (7 vues) */
      .box-tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 12px; position: sticky; top: 0; background: var(--bg); padding-bottom: 4px; z-index: 2; }
      .box-tab { border: 1px solid var(--border); background: transparent; color: var(--mute); border-radius: 9px; padding: 8px 14px; font-size: 12.5px; font-weight: 800; cursor: pointer; white-space: nowrap; }
      .box-tab.on { background: var(--card); color: var(--txt); border-color: var(--gold); }
      /* Recherche avancée */
      .srch-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
      .srch-filters select { border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 12px; }
      .srch-reset { border: 1px solid var(--border); background: var(--panel); color: var(--txt); border-radius: 8px; padding: 7px 11px; font-size: 12px; font-weight: 800; cursor: pointer; }
      .srch-count { font-size: 14px; margin: 6px 0 10px; } .srch-count b { color: var(--gold); font-size: 18px; }
      .srch-list { display: flex; flex-direction: column; gap: 5px; }
      .srch-row { display: grid; grid-template-columns: 90px 130px 1fr; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 7px 10px; background: var(--card); font-size: 12.5px; }
      .srch-row .sr-t { color: var(--mute); font-variant-numeric: tabular-nums; }
      .srch-row .sr-p { font-weight: 800; }
      .box-shot { max-width: 680px; margin: 0 auto; }
      .shot-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
      .shot-head select { border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 8px; padding: 7px 9px; font: inherit; font-size: 12.5px; font-weight: 700; }
      .shot-tot { display: flex; gap: 14px; margin-left: auto; font-size: 12.5px; color: var(--mute); }
      .shot-tot b { color: var(--txt); font-size: 16px; }
      .shot-tot b.ok { color: var(--green); } .shot-tot b.gold { color: var(--gold); }
      .shot-sub { font-size: 11.5px; color: var(--mute); margin-bottom: 8px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .shot-sub b { color: var(--txt); }
      .shot-lg { margin-left: auto; display: flex; align-items: center; gap: 5px; }
      .shot-lg .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
      .shot-lg .dot.ok { background: var(--green); } .shot-lg .dot.ko { background: var(--red); }

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

      /* PATCH Boxscore cliquable / joueurs droite propres */
      .clickRow { cursor: pointer; }
      .clickRow:hover, .clickCell:hover { background: rgba(212,162,76,.10); }
      .clickRowBtn { width: 100%; text-align: left; border: 0; cursor: pointer; }
      .clickRowBtn:hover, .clipItem:hover { background: rgba(212,162,76,.12); }
      .sideSwitch { display: inline-flex; gap: 8px; padding: 4px; border: 1px solid var(--border); border-radius: 12px; background: rgba(255,255,255,.04); margin: 0 0 10px; }
      .sideSwitch button { border: 0; border-radius: 9px; padding: 8px 14px; background: transparent; color: var(--mute); font-weight: 900; cursor: pointer; }
      .sideSwitch button.on { background: var(--gold); color: #080b17; }
      .boxcard.clickable { border: 1px solid var(--border); cursor: pointer; text-align: left; }
      .cellBtn { min-width: 54px; height: 32px; border-radius: 9px; border: 1px solid var(--border); background: rgba(255,255,255,.05); color: #fff; font-weight: 950; cursor: pointer; }
      .cellBtn.ok { color: var(--green); }
      .cellBtn.ko { color: var(--red); }
      .shotPair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; align-items: stretch; width: 100%; }
      .shotPanel { border: 1px solid var(--border); border-radius: 14px; padding: 14px; background: rgba(255,255,255,.03); min-width: 0; }
      .dualShot { width: 100%; max-width: none; }
      .dualShot .shotPanel > div:not(.boxsec),
      .dualShot .shotPanel svg { width: 100% !important; max-width: none !important; }
      .dualShot .shotPanel { min-height: 560px; }
      .clipModal { position: fixed; inset: 0; z-index: 1300; background: rgba(0,0,0,.55); display: grid; place-items: center; padding: 18px; }
      .clipCard { width: min(900px, 96vw); max-height: 90vh; background: #10131f; border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 26px 90px rgba(0,0,0,.55); overflow: hidden; display: flex; flex-direction: column; }
      .clipListCard { width: min(720px, 94vw); }
      .clipHead { height: 48px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); }
      .clipHead button { width: 30px; height: 30px; border-radius: 9px; border: 1px solid var(--border); background: rgba(255,255,255,.06); color: #fff; cursor: pointer; }
      .clipBody { padding: 12px; overflow: auto; display: grid; gap: 10px; }
      .clipTitle { font-weight: 900; color: #fff; }
      .clipVideo { width: 100%; max-height: 58vh; background: #000; border-radius: 12px; }
      .clipNoVideo { min-height: 160px; display: grid; place-items: center; color: var(--mute); border: 1px dashed var(--border); border-radius: 12px; }
      .clipTools { display: flex; gap: 8px; flex-wrap: wrap; }
      .clipTools button { border: 1px solid rgba(212,162,76,.45); background: rgba(212,162,76,.12); color: var(--gold); border-radius: 10px; padding: 8px 12px; font-weight: 900; cursor: pointer; }
      .clipNote { width: 100%; min-height: 78px; border-radius: 12px; border: 1px solid var(--border); background: rgba(255,255,255,.05); color: #fff; padding: 10px; }
      .clipItem { width: 100%; text-align: left; border: 1px solid var(--border); background: rgba(255,255,255,.04); color: #fff; border-radius: 10px; padding: 10px 12px; cursor: pointer; }
      .pchip.xs { grid-template-columns: 34px minmax(0, 1fr) !important; grid-template-rows: auto auto !important; min-height: 56px; }
      .pchip.xs .namePts { grid-column: 2; grid-row: 1; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .pchip.xs .namePts .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #fff; }
      .pchip.xs .namePts b { white-space: nowrap; font-size: 12px; color: #fff; }
      .pchip.xs .fdots { grid-column: 2; grid-row: 2; margin-top: 4px; }
      @media (max-width: 980px) { .shotPair { grid-template-columns: 1fr; } }
      @media (max-width: 1200px) {
        .studio { grid-template-columns: 30% 70%; grid-template-rows: minmax(0, 1fr); }
        .studio2 { grid-template-columns: 40% 60%; }
        .live3 { grid-template-columns: 42% minmax(0, 1fr) 240px; }
        .colHistory { display: none; }
        .colCenter { order: 2; }
        .colCoding { order: 1; }
        .videoSlot { height: 240px; }
      }

      @media (max-width: 900px) {
        .mtabs { display: flex; }
        .wtabs { display: none !important; }
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
        .live-strip { display: none; height: 260px; }
        .live-strip.mshow { display: flex; }
        .codeDense .grid.c2, .codeDense .grid.c3 { grid-template-columns: repeat(3, 1fr); }
        .videoSlot.big { min-height: 210px; }
      }

      @media (max-width: 560px) {
        .h-r .ghost { padding: 6px 8px; font-size: 11px; }
        .vempty-tt { font-size: 14px; }
        .videoSlot { height: 170px; }
        .codeDense .grid.c2, .codeDense .grid.c3 { grid-template-columns: repeat(2, 1fr); }
      }

      /* ===================== PATCH UI LiveStat · timeline repliable / header / joueurs ===================== */
      .ps-root { overflow: hidden; }
      .h { min-height: 78px; padding: 8px 10px; gap: 8px; }
      .h-c.compactScore { transform: none; min-width: 460px; flex: 1 1 auto; display: grid; grid-template-columns: minmax(72px, 1fr) 70px 120px 88px minmax(80px, 1fr); align-items: center; gap: 8px; }
      .clockbox { min-width: 118px; height: 66px; padding: 4px 8px; overflow: visible; }
      .clockbox .clk { font-size: 24px; line-height: 24px; }
      .clockbox .qtag { font-size: 12px; line-height: 12px; }
      .score { min-width: 64px; height: 42px; font-size: 24px; }
      .h-r { gap: 7px; flex-wrap: nowrap; }
      .ghost { min-height: 40px; padding: 0 13px; white-space: nowrap; }
      .qstrip { height: 30px; padding: 3px 10px; gap: 8px; justify-content: center; }
      .foulbox { display: inline-flex; gap: 5px; align-items: center; }
      .foulbox::after { content: ''; display: inline-flex; width: 46px; height: 7px; border-radius: 999px; background: repeating-linear-gradient(90deg, rgba(212,162,76,.95) 0 7px, transparent 7px 9px); opacity: .35; }
      .detacherRow { flex: 0 0 auto; height: 34px; display: flex; align-items: center; justify-content: center; border-top: 1px solid var(--border); background: rgba(6,9,18,.35); }
      .detachBtn { border: 1px solid rgba(212,162,76,.65); background: rgba(212,162,76,.12); color: var(--gold); border-radius: 10px; padding: 7px 12px; font-size: 12px; font-weight: 900; cursor: pointer; }
      .detachBtn:hover { background: rgba(212,162,76,.22); }
      /* AJOUT §5 · Montage plein écran + en-tête à boutons */
      .floatingHeadBtns { display: inline-flex; align-items: center; gap: 8px; }
      .montageExpand { border: 1px solid rgba(212,162,76,.55); background: rgba(212,162,76,.12); color: var(--gold); border-radius: 8px; padding: 4px 10px; font-size: 11px; font-weight: 900; cursor: pointer; }
      .montageExpand:hover { background: rgba(212,162,76,.22); }
      .floatingPanel.montageFull { position: fixed; inset: 12px; width: auto; height: auto; max-width: none; max-height: none; z-index: 3000; }
      .floatingPanel.montageFull .floatingBody { height: calc(100% - 46px); max-height: none; }
      .detacherRow { gap: 8px; flex-wrap: wrap; height: auto; padding: 5px 8px; }
      .rateBox { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; color: var(--mute); }
      .rateBox select { border: 1px solid var(--border); background: var(--card); color: var(--txt); border-radius: 7px; padding: 4px 6px; font: inherit; font-size: 11px; }
      .detachState { font-size: 11px; font-weight: 900; color: var(--gold); background: rgba(212,162,76,.12); border: 1px solid rgba(212,162,76,.4); border-radius: 999px; padding: 4px 10px; }
      .syncBadge { font-size: 11px; font-weight: 900; color: #6B1A2C; background: rgba(107,26,44,.08); border: 1px solid rgba(107,26,44,.35); border-radius: 999px; padding: 4px 10px; font-variant-numeric: tabular-nums; }
      .codeTop { display: grid; grid-template-columns: 30px 30px 1fr; align-items: center; gap: 6px; }
      .headBack, .headUndo { width: 28px; height: 28px; border-radius: 9px; border: 1px solid var(--border); background: rgba(255,255,255,.05); color: #fff; font-size: 14px; font-weight: 950; cursor: pointer; }
      .headBack:disabled { opacity: .25; cursor: not-allowed; }
      .lc-foot { display: none !important; }
      .lc-body { padding: 10px; }
      .codeDense .grid.big, .codeDense .grid.c2, .codeDense .grid.c3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .codeDense .bt { min-height: 54px !important; padding: 15px 18px !important; }
      .codeDense .bt .lbl { font-size: 15px !important; }
      .codeDense .wztitle { font-size: 22px !important; line-height: 1.05; margin-top: -4px; }
      .codeDense .wzsub { font-size: 12px !important; }
      .live3 { grid-template-columns: minmax(0, 48%) minmax(0, 1fr) 305px; padding-bottom: 8px; }
      .lc-right { overflow: hidden; display: grid; grid-template-rows: auto 1fr; }
      .lc-players { overflow: auto; padding: 8px; border-top: 1px solid var(--border); }
      .lcp-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .lcp-row.bench { grid-template-columns: 32px repeat(2, minmax(0, 1fr)); }
      .pchip.xs { min-height: 52px; grid-template-columns: 34px minmax(0, 1fr) auto; grid-template-rows: auto auto; padding: 9px 10px; align-items: center; }
      .pchip.xs .num { grid-row: 1 / 3; font-size: 18px; }
      .pchip.xs .nm { font-size: 12px; }
      .pchip.xs .pstat { grid-column: 3; grid-row: 1; font-size: 11px; color: #fff; white-space: nowrap; }
      .pchip.xs .pstat em, .pchip.xs .pstat::after { display: none; }
      .pchip.xs .pstat b { font-size: 13px; color: #fff; }
      .fdots { grid-column: 2 / 4; grid-row: 2; gap: 5px; }
      .fdots i { width: 8px; height: 8px; border-width: 1px; }
      .timelinePull { position: fixed; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 1001; border: 1px solid rgba(212,162,76,.65); background: rgba(10,13,25,.96); color: var(--gold); border-radius: 999px; height: 28px; padding: 0 16px; font-size: 12px; font-weight: 950; cursor: pointer; box-shadow: 0 8px 22px rgba(0,0,0,.35); }
      .timelinePull.open { bottom: 226px; }
      .live-strip.timelineOnly { position: fixed; left: 10px; right: 10px; bottom: 8px; z-index: 1000; height: 210px; margin: 0; box-shadow: 0 -18px 40px rgba(0,0,0,.35); animation: slideTimeline .18s ease-out; }
      @keyframes slideTimeline { from { transform: translateY(105%); opacity: .4; } to { transform: translateY(0); opacity: 1; } }
      .floatingPanel { position: fixed; z-index: 1200; right: 14px; top: 88px; width: min(620px, calc(100vw - 28px)); max-height: calc(100vh - 120px); background: rgba(13,17,31,.98); border: 1px solid var(--border); border-radius: 16px; box-shadow: 0 24px 70px rgba(0,0,0,.45); overflow: hidden; display: flex; flex-direction: column; }
      .montagePanel { width: min(760px, calc(100vw - 28px)); }
      .floatingHead { height: 44px; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); color: #fff; }
      .floatingHead button { border: 1px solid var(--border); background: rgba(255,255,255,.06); color: #fff; width: 28px; height: 28px; border-radius: 9px; cursor: pointer; }
      .floatingBody { flex: 1; min-height: 0; overflow: auto; padding: 10px; }
      @media (max-width: 1200px) {
        .live3 { grid-template-columns: 1fr; overflow: auto; }
        .h-c.compactScore { min-width: 360px; grid-template-columns: 70px 58px 100px 74px 70px; }
      }

      /* PATCH UNIQUE · joueurs sous shot chart en tableau compact */
      .compactPlayerTable {
        display: grid !important;
        gap: 10px !important;
        padding: 10px !important;
        border-radius: 16px !important;
        background: rgba(255,255,255,.045) !important;
        border: 1px solid rgba(255,255,255,.10) !important;
      }
      .playerTableSection {
        display: grid;
        gap: 5px;
        min-width: 0;
      }
      .playerTableTitle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: var(--gold);
        font-size: 11px;
        font-weight: 950;
        text-transform: uppercase;
        letter-spacing: .06em;
      }
      .benchTitle { color: rgba(255,255,255,.78); }
      .playerTableHead,
      .playerTableRow {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr) 44px 78px;
        align-items: center;
        gap: 7px;
      }
      .playerTableHead {
        padding: 0 8px;
        color: rgba(255,255,255,.45);
        font-size: 9px;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: .05em;
      }
      .playerTableRow {
        width: 100%;
        min-height: 32px;
        padding: 5px 8px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,.09);
        background: rgba(6,10,22,.62);
        color: #fff;
        cursor: pointer;
        text-align: left;
      }
      .playerTableRow:hover,
      .playerTableRow.active,
      .playerTableRow.sel {
        border-color: rgba(212,162,76,.75);
        background: rgba(212,162,76,.14);
      }
      .playerTableRow.swap { outline: 1px dashed rgba(212,162,76,.8); }
      .playerTableRow.bench { opacity: .88; }
      .ptNum {
        color: var(--gold);
        font-size: 13px;
        font-weight: 950;
        text-align: center;
      }
      .ptName {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 11px;
        font-weight: 850;
      }
      .ptPts {
        font-size: 12px;
        font-weight: 950;
        text-align: right;
      }
      .ptFouls .fdots {
        display: flex;
        justify-content: flex-end;
        gap: 3px;
        margin: 0;
      }
      .ptFouls .fdot,
      .ptFouls .dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
      }
      .tableSwap {
        width: 32px;
        height: 24px;
        border-radius: 9px;
        border: 1px solid rgba(212,162,76,.42);
        background: rgba(212,162,76,.10);
        color: var(--gold);
        font-weight: 950;
        cursor: pointer;
      }
      .tableSwap.on {
        background: rgba(212,162,76,.24);
        border-color: var(--gold);
      }

    `}</style>
  );
}