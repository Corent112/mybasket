'use client';

/**
 * MyBasket — Management › Rotation
 * Planificateur de rotation "timeline" (4 QT × 5 postes).
 *
 * Porté depuis renderMgmtRotation du fichier de référence mybasket-app_24.html.
 * Fonctionnalités : drag depuis l'effectif, drag/déplacement des segments entre
 * postes & QT, redimensionnement aux bords (snap 30s), menus Placer / Éditer
 * (sliders entrée/sortie/durée + validation live), undo/redo (Ctrl+Z / Ctrl+Y),
 * sauvegarde, reset, export CSV, validation des chevauchements.
 *
 * Données :
 *   - Équipes & joueurs    → Supabase via `lib/equipes-store`
 *   - Équipe sélectionnée  → localStorage `mybasket_management_team`
 *   - Rotation par équipe   → localStorage `mybasket_management_rotation`
 *       forme : { [teamId]: { durations:[10,10,10,10], segments:[Seg] } }
 *       migration auto depuis l'ancien format grid[qt][pos].
 *
 * Page autonome : elle lit/écrit directement le localStorage (mêmes clés que le
 * provider Management) et se resynchronise au focus, donc elle s'intègre quelle
 * que soit la signature exacte de useMgmt().
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CORRECTIF (desync DOM ↔ state) :
 *   Le redimensionnement et le déplacement passaient par des mutations
 *   impératives du DOM (segEl.style.left/width/opacity…). L'aperçu visuel
 *   pouvait alors diverger de l'état React : au premier re-render (ex. drag
 *   depuis l'effectif, focus, storage…), React réaffichait le VRAI state et
 *   les segments « fantômes » non commités disparaissaient / se replaçaient.
 *
 *   → Désormais tout le rendu dérive du state. L'aperçu pendant un geste est
 *     porté par un état transitoire `drag` (resize ET move), donc le DOM
 *     reflète toujours l'état réel. Plus aucune écriture de style sur les
 *     segments. `reload()` est aussi neutralisé pendant une interaction.
 * ───────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { getTeams } from '@/lib/equipes-store';

/* ──────────────────────────────────────────────────────────── Constantes */

const SEL_KEY = 'mybasket_management_team';
const ROT_KEY = 'mybasket_management_rotation';

const ROT_POSTES = [
  { abbr: 'PG', label: 'Meneur', color: '#1E40AF' },
  { abbr: 'SG', label: 'Arrière', color: '#0E7490' },
  { abbr: 'SF', label: 'Ailier', color: '#15803D' },
  { abbr: 'PF', label: 'Ailier fort', color: '#B45309' },
  { abbr: 'C', label: 'Pivot', color: '#7C2D12' },
] as const;

const PALETTE = [
  '#6B1A2C', '#D4A24C', '#16A34A', '#1E40AF', '#0E7490', '#15803D', '#B45309',
  '#7C2D12', '#7C3AED', '#DB2777', '#0891B2', '#65A30D', '#9333EA', '#C2410C',
];

const POSTE_TO_IDX: Record<string, number> = {
  meneur: 0, pg: 0, 'point guard': 0,
  'arrière': 1, arriere: 1, sg: 1, 'shooting guard': 1,
  ailier: 2, sf: 2, 'small forward': 2,
  'ailier fort': 3, pf: 3, 'power forward': 3,
  pivot: 4, c: 4, center: 4, centre: 4,
};

/* ──────────────────────────────────────────────────────────────── Types */

type Player = {
  id: string;
  num?: string | number;
  firstName?: string;
  lastName?: string;
  poste?: string;
  photo?: string;
};
type Team = { id: string; name: string; players: Player[] };
type Seg = { id: string; playerId: string; qt: number; pos: number; start: number; end: number };
type Rotation = { durations: number[]; segments: Seg[] };

type MenuState =
  | null
  | { mode: 'place'; playerId: string; x: number; y: number }
  | { mode: 'edit'; segId: string; x: number; y: number };

/**
 * État transitoire d'un geste (resize ou move). Sert UNIQUEMENT à l'aperçu :
 * le rendu lit cet état pour dessiner le segment en cours sans toucher au DOM.
 * Rien n'est commité tant que la souris n'est pas relâchée.
 */
type DragState =
  | null
  | {
      kind: 'resize';
      segId: string;
      side: 'left' | 'right';
      start: number;
      end: number;
      ok: boolean;
      reason?: string;
    }
  | {
      kind: 'move';
      segId: string;
      /* cible live (track survolée) */
      qt: number;
      pos: number;
      start: number;
      end: number;
      ok: boolean;
      reason?: string;
      /* fantôme flottant */
      ghostX: number;
      ghostY: number;
      ghostW: number;
      ghostH: number;
      color: string;
      label: string;
    };

/* ────────────────────────────────────────────────────────────── Helpers */

let _uidSeq = 0;
const uid = () =>
  Date.now().toString(36) +
  '_' +
  (_uidSeq++).toString(36) +
  '_' +
  Math.random().toString(36).slice(2, 6);

function fmtSec(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
const min1 = (n: number) => n.toFixed(1).replace('.0', '');

function playerColor(playerId: string, team: Team) {
  const idx = team.players.findIndex((p) => p.id === playerId);
  if (idx < 0) return PALETTE[0];
  return PALETTE[idx % PALETTE.length];
}

function pxToSec(px: number, totalPx: number, durMin: number, snap: boolean) {
  let sec = Math.max(0, Math.min(durMin * 60, (px / totalPx) * durMin * 60));
  if (snap) sec = Math.round(sec / 30) * 30;
  return sec;
}

/** Validation : pas de chevauchement même track ; pas le même joueur sur 2 postes en même temps. */
function validateSegment(
  team: Team,
  rot: Rotation,
  newSeg: { playerId: string; qt: number; pos: number; start: number; end: number },
  ignoreId?: string | null
): { ok: boolean; reason?: string } {
  const overlap = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;
  for (const s of rot.segments) {
    if (ignoreId && s.id === ignoreId) continue;
    if (s.qt !== newSeg.qt) continue;
    if (!overlap(newSeg.start, newSeg.end, s.start, s.end)) continue;
    if (s.pos === newSeg.pos) {
      const op = team.players.find((p) => p.id === s.playerId);
      return {
        ok: false,
        reason: `Emplacement déjà occupé par ${op ? '#' + (op.num || '') + ' ' + (op.firstName || '') : 'un autre joueur'} (${fmtSec(s.start)} → ${fmtSec(s.end)})`,
      };
    }
    if (s.playerId === newSeg.playerId) {
      const pl = team.players.find((p) => p.id === newSeg.playerId);
      return {
        ok: false,
        reason: `${pl ? pl.firstName : 'Ce joueur'} est déjà sur le terrain au poste ${ROT_POSTES[s.pos].abbr} à ce moment-là`,
      };
    }
  }
  return { ok: true };
}

/** Détecte le 1er chevauchement temporel entre 2 segments d'un même (QT, poste). */
function findOverlap(segments: Seg[]): { a: Seg; b: Seg } | null {
  const overlap = (a1: number, a2: number, b1: number, b2: number) => a1 < b2 && b1 < a2;

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];

      if (!a || !b) continue;
      if (a.start >= a.end || b.start >= b.end) continue;

      if (
        a.qt === b.qt &&
        a.pos === b.pos &&
        overlap(a.start, a.end, b.start, b.end)
      ) {
        return { a, b };
      }
    }
  }

  return null;
}

function computeStats(team: Team, rot: Rotation) {
  const mins: Record<string, number> = {};
  team.players.forEach((p) => (mins[p.id] = 0));
  rot.segments.forEach((s) => {
    mins[s.playerId] = (mins[s.playerId] || 0) + (s.end - s.start) / 60;
  });
  const starters = rot.segments
    .filter((s) => s.qt === 0 && s.start === 0)
    .sort((a, b) => a.pos - b.pos)
    .slice(0, 5)
    .map((s) => team.players.find((p) => p.id === s.playerId)?.firstName || '?');
  return { mins, starters };
}

/* ───────────────────────────────────── Lecture / écriture du localStorage */

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function readTeams(): Promise<Team[]> {
  const data = await getTeams();

  return ((data ?? []) as any[]).map((t, ti) => ({
    id: String(t.id ?? 'team_' + ti),
    name: t.name ?? t.nom ?? 'Équipe',
    players: (t.players ?? t.joueurs ?? t.effectif ?? t.roster ?? []).map((p: any, pi: number) => ({
      id: String(p.id ?? 'pl_' + (t.id ?? ti) + '_' + pi),
      num: p.num ?? p.numero ?? p.number ?? '',
      firstName:
        p.firstName ??
        p.prenom ??
        p.firstname ??
        p.name?.split?.(' ')?.[0] ??
        '',
      lastName:
        p.lastName ??
        p.nom ??
        p.lastname ??
        p.name?.split?.(' ')?.slice(1).join(' ') ??
        '',
      poste: p.poste ?? p.postePrincipal ?? p.position ?? '',
      photo: p.photo ?? p.photo_url ?? p.avatar ?? '',
    })),
  })).filter((team) => team.id);
}

function readSelectedTeamId(teams: Team[]): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SEL_KEY);
  const id = raw ? raw.replace(/^"|"$/g, '') : null;
  if (id && teams.some((t) => t.id === id)) return id;
  return teams[0]?.id ?? null;
}

/** Migre/normalise une rotation brute (segments OU ancien grid) vers {durations, segments}. */
function normalizeRotation(raw: any, team: Team): Rotation {
  const rot: Rotation = { durations: [10, 10, 10, 10], segments: [] };
  if (raw && Array.isArray(raw.durations) && raw.durations.length === 4) {
    rot.durations = raw.durations.map((d: any) => Math.max(1, Math.min(20, Number(d) || 10)));
  }
  if (raw && Array.isArray(raw.segments)) {
    rot.segments = raw.segments
      .filter((s: any) => s && s.playerId)
      .map((s: any) => ({
        id: String(s.id ?? 'seg_' + uid()),
        playerId: String(s.playerId),
        qt: Number(s.qt) || 0,
        pos: Number(s.pos) || 0,
        start: Number(s.start) || 0,
        end: Number(s.end) || 60,
      }));
  } else if (raw && raw.grid) {
    // Ancien format : grid[qt][pos] = playerId | { playerId, duration }
    (raw.grid as any[]).forEach((row, qt) => {
      if (!row) return;
      row.forEach((cell: any, pos: number) => {
        let playerId: string | null = null;
        let duration = rot.durations[qt];
        if (typeof cell === 'string') playerId = cell;
        else if (cell && cell.playerId) {
          playerId = cell.playerId;
          duration = Number(cell.duration) || rot.durations[qt];
        }
        if (playerId) {
          rot.segments.push({ id: 'seg_' + uid(), playerId, qt, pos, start: 0, end: duration * 60 });
        }
      });
    });
  }
  // Nettoyage : joueurs supprimés + clamp aux durées de QT
  const valid = new Set(team.players.map((p) => p.id));
  rot.segments = rot.segments.filter((s) => valid.has(s.playerId));
  rot.segments.forEach((s) => {
    const max = rot.durations[s.qt] * 60;
    if (s.end > max) s.end = max;
    if (s.start < 0) s.start = 0;
    if (s.start >= s.end) s.end = Math.min(s.start + 60, max);
  });
  return rot;
}

function loadRotation(teamId: string, team: Team): Rotation {
  if (typeof window === 'undefined') return { durations: [10, 10, 10, 10], segments: [] };
  const store = safeParse<any>(localStorage.getItem(ROT_KEY), {});
  // Map par teamId, ou ancien objet plat mono-équipe
  const raw = store && store[teamId] ? store[teamId] : store?.durations || store?.grid || store?.segments ? store : null;
  return normalizeRotation(raw, team);
}

function persistRotation(teamId: string, rot: Rotation) {
  if (typeof window === 'undefined') return;
  const store = safeParse<any>(localStorage.getItem(ROT_KEY), {});
  const map = store && typeof store === 'object' && !Array.isArray(store) && !store.durations && !store.grid ? store : {};
  map[teamId] = { durations: rot.durations, segments: rot.segments };
  localStorage.setItem(ROT_KEY, JSON.stringify(map));
}

/* ════════════════════════════════════════════════════════════ COMPONENT */

export default function RotationModule() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [team, setTeam] = useState<Team | null>(null);
  const [teamId, setTeamId] = useState<string>('');
  const [rot, setRotState] = useState<Rotation>({ durations: [10, 10, 10, 10], segments: [] });
  const [menu, setMenu] = useState<MenuState>(null);
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);

  // Aperçu transitoire du geste en cours (resize / move). Piloté par le state → DOM == state.
  const [drag, setDrag] = useState<DragState>(null);

  const teamRef = useRef<Team | null>(null);
  const rotRef = useRef<Rotation>(rot);
  const history = useRef<string[]>([]);
  const histIdx = useRef<number>(-1);
  const draggingRef = useRef<{ playerId: string } | null>(null);
  // Verrou : empêche reload() d'écraser un geste en cours (resize/move/drop/menu).
  const interactingRef = useRef<boolean>(false);
  teamRef.current = team;
  rotRef.current = rot;

  /* ── Toast auto-disparition ── */
  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 2600);
  }, []);

  /* ── Chargement / resynchronisation ── */
  const reload = useCallback(async () => {
    // Ne JAMAIS resynchroniser pendant une interaction : un focus/storage/visibilitychange
    // au milieu d'un drag effacerait l'édition en cours.
    if (interactingRef.current) return;
    try {
      const loadedTeams = await readTeams();
      setTeams(loadedTeams);

      const tid = readSelectedTeamId(loadedTeams);
      const t = loadedTeams.find((x) => x.id === tid) || null;

      setTeamId(t?.id ?? '');
      setTeam(t);

      if (t) {
        const r = loadRotation(t.id, t);
        setRotState(r);
        history.current = [JSON.stringify(r)];
        histIdx.current = 0;
      } else {
        setRotState({ durations: [10, 10, 10, 10], segments: [] });
        history.current = [];
        histIdx.current = -1;
      }
    } catch (error) {
      console.error('Erreur chargement rotation:', error);
      setTeams([]);
      setTeam(null);
      setTeamId('');
      setRotState({ durations: [10, 10, 10, 10], segments: [] });
    }
  }, []);

  useEffect(() => {
    reload();
    const onFocus = () => reload();
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [reload]);

  const selectTeam = (id: string) => {
    const nextTeam = teams.find((x) => x.id === id) || null;

    setTeamId(id);
    setTeam(nextTeam);

    if (typeof window !== 'undefined') {
      localStorage.setItem(SEL_KEY, id);
    }

    if (nextTeam) {
      const nextRotation = loadRotation(nextTeam.id, nextTeam);
      setRotState(nextRotation);
      history.current = [JSON.stringify(nextRotation)];
      histIdx.current = 0;
    } else {
      setRotState({ durations: [10, 10, 10, 10], segments: [] });
      history.current = [];
      histIdx.current = -1;
    }
  };

  /* ── Commit : applique un nouvel état de rotation + historique + persistance ── */
  const commit = useCallback(
    (next: Rotation, opts?: { silent?: boolean }) => {
      const t = teamRef.current;
      if (!t) return;

      // Garde-fou central : aucune rotation avec chevauchement ne peut être enregistrée.
      // Même si un geste contourne validateSegment(), ce point bloque l'écriture.
      const clash = findOverlap(next.segments);

      if (clash) {
        const pa = t.players.find((p) => p.id === clash.a.playerId);
        const pb = t.players.find((p) => p.id === clash.b.playerId);

        showToast(
          `Chevauchement empêché : ${pa?.firstName || '?'} et ${pb?.firstName || '?'} se superposent sur ${ROT_POSTES[clash.a.pos].abbr} (Q${clash.a.qt + 1})`,
          true
        );

        // Re-render depuis l'état courant (faithful : DOM == state).
        setRotState({
          durations: [...rotRef.current.durations],
          segments: rotRef.current.segments.map((s) => ({ ...s })),
        });

        return;
      }

      setRotState(next);
      persistRotation(t.id, next);

      if (!opts?.silent) {
        history.current = history.current.slice(0, histIdx.current + 1);
        history.current.push(JSON.stringify(next));
        if (history.current.length > 50) history.current.shift();
        histIdx.current = history.current.length - 1;
      }
    },
    [showToast]
  );

  const mutate = useCallback(
    (fn: (draft: Rotation) => Rotation) => {
      const next = fn({
        durations: [...rotRef.current.durations],
        segments: rotRef.current.segments.map((s) => ({ ...s })),
      });
      commit(next);
    },
    [commit]
  );

  /* ── Undo / Redo ── */
  const undo = useCallback(() => {
    if (histIdx.current <= 0) return;
    histIdx.current--;
    const snap = JSON.parse(history.current[histIdx.current]) as Rotation;
    setRotState(snap);
    if (teamRef.current) persistRotation(teamRef.current.id, snap);
  }, []);
  const redo = useCallback(() => {
    if (histIdx.current >= history.current.length - 1) return;
    histIdx.current++;
    const snap = JSON.parse(history.current[histIdx.current]) as Rotation;
    setRotState(snap);
    if (teamRef.current) persistRotation(teamRef.current.id, snap);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /* ── Barre d'outils ── */
  const onSave = () => {
    if (team) persistRotation(team.id, rotRef.current);
    showToast('Rotation sauvegardée ✓');
  };
  const onReset = () => {
    if (!window.confirm('Vider toute la rotation ?')) return;
    commit({ durations: [10, 10, 10, 10], segments: [] });
    showToast('Rotation réinitialisée');
  };
  const onExport = () => {
    if (!team) return;
    exportCsv(team, rotRef.current);
    showToast('Rotation exportée ✓');
  };

  /* ── Durée d'un QT ── */
  const setQtDuration = (qt: number, value: number) => {
    const v = Math.max(1, Math.min(20, value || 10));
    mutate((d) => {
      d.durations[qt] = v;
      d.segments
        .filter((s) => s.qt === qt)
        .forEach((s) => {
          const max = v * 60;
          if (s.end > max) s.end = max;
          if (s.start >= s.end) s.start = Math.max(0, s.end - 60);
        });
      return d;
    });
  };

  /* ── Drop depuis l'effectif → création d'un segment ── */
  const onTrackDrop = (qt: number, pos: number, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).style.background = '';
    const dragFrom = draggingRef.current;
    if (!dragFrom) return;
    const r = e.currentTarget.getBoundingClientRect();
    const startSec = pxToSec(e.clientX - r.left, r.width, rotRef.current.durations[qt], true);
    const maxEnd = rotRef.current.durations[qt] * 60;
    let pStart = startSec;
    let pEnd = Math.min(pStart + 120, maxEnd);
    const segs = rotRef.current.segments.filter((s) => s.qt === qt && s.pos === pos);
    const next = segs.filter((s) => s.start >= pStart).sort((a, b) => a.start - b.start)[0];
    if (next && next.start < pEnd) pEnd = next.start;
    const prev = segs.filter((s) => s.end > pStart && s.start < pStart).sort((a, b) => b.end - a.end)[0];
    if (prev) pStart = prev.end;
    if (pEnd - pStart < 30) {
      showToast('Pas assez de place ici', true);
      return;
    }
    const candidate = { playerId: dragFrom.playerId, qt, pos, start: pStart, end: pEnd };
    const v = validateSegment(team!, rotRef.current, candidate);
    if (!v.ok) {
      showToast(v.reason!, true);
      return;
    }
    mutate((d) => {
      d.segments.push({ id: 'seg_' + uid(), ...candidate });
      return d;
    });
  };

  /* ── Déplacement / redimensionnement d'un segment (mousedown, 100% state) ── */
  const onSegMouseDown = (segId: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const handle = target.closest('[data-resize]') as HTMLElement | null;
    const segEl = e.currentTarget as HTMLElement;
    const seg = rotRef.current.segments.find((s) => s.id === segId);
    if (!seg) return;
    e.preventDefault();
    e.stopPropagation();

    const t = team!;
    interactingRef.current = true;

    /* ═════════════════════════════════════════════════════════════ Resize */
    if (handle) {
      const side = handle.dataset.resize as 'left' | 'right';
      const trackEl = segEl.parentElement!;
      const tr = trackEl.getBoundingClientRect();
      const origStart = seg.start;
      const origEnd = seg.end;
      const maxEnd = rotRef.current.durations[seg.qt] * 60;
      // `live` = dernière géométrie valide calculée (lue au mouseup).
      let live = { start: origStart, end: origEnd, ok: true, reason: undefined as string | undefined };

      const onMove = (ev: MouseEvent) => {
        let sec = pxToSec(ev.clientX - tr.left, tr.width, rotRef.current.durations[seg.qt], false);
        sec = Math.round(sec / 30) * 30;
        let ns = origStart;
        let ne = origEnd;

        if (side === 'left') {
          ns = Math.max(0, Math.min(origEnd - 30, sec));
          // Empêche de passer sous le segment précédent du même poste.
          const previousLimit = rotRef.current.segments
            .filter((s) => s.id !== seg.id && s.qt === seg.qt && s.pos === seg.pos && s.end <= origEnd)
            .reduce((max, s) => Math.max(max, s.end), 0);
          ns = Math.max(ns, previousLimit);
        } else {
          ne = Math.min(maxEnd, Math.max(origStart + 30, sec));
          // Empêche de passer sur le segment suivant du même poste.
          const nextLimit = rotRef.current.segments
            .filter((s) => s.id !== seg.id && s.qt === seg.qt && s.pos === seg.pos && s.start >= origStart)
            .reduce((min, s) => Math.min(min, s.start), maxEnd);
          ne = Math.min(ne, nextLimit);
        }

        const v = validateSegment(
          t,
          rotRef.current,
          { playerId: seg.playerId, qt: seg.qt, pos: seg.pos, start: ns, end: ne },
          seg.id
        );
        live = { start: ns, end: ne, ok: v.ok, reason: v.reason };
        // Aperçu via state : le rendu réaffiche le segment avec ces bornes.
        setDrag({ kind: 'resize', segId: seg.id, side, start: ns, end: ne, ok: v.ok, reason: v.reason });
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        interactingRef.current = false;
        setDrag(null); // l'aperçu disparaît, le rendu repart du state (commité ou non).

        if (!live.ok) {
          showToast(live.reason || 'Chevauchement — étirement annulé', true);
          return;
        }
        if (live.start !== origStart || live.end !== origEnd) {
          mutate((d) => {
            const tg = d.segments.find((s) => s.id === seg.id);
            if (tg) {
              tg.start = live.start;
              tg.end = live.end;
            }
            return d;
          });
        }
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return;
    }

    /* ═══════════════════════════════════════════════════════ Déplacement */
    const startX = e.clientX;
    const startY = e.clientY;
    const segRect = segEl.getBoundingClientRect();
    const grabX = e.clientX - segRect.left;
    const grabY = e.clientY - segRect.top;
    const dur = seg.end - seg.start;
    const origQt = seg.qt;
    const origPos = seg.pos;
    const origStart = seg.start;
    const color = playerColor(seg.playerId, t);
    const label = (segEl.textContent || '').trim();
    let moved = false;
    let live = {
      qt: origQt,
      pos: origPos,
      start: origStart,
      end: seg.end,
      ok: true,
      reason: undefined as string | undefined,
    };

    const onMove = (ev: MouseEvent) => {
      if (!moved && (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4)) {
        moved = true;
      }
      if (!moved) return;

      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const tr = under ? (under.closest('[data-track]') as HTMLElement | null) : null;

      if (!tr) {
        live = { ...live, ok: false, reason: 'Glisse sur une ligne de poste' };
      } else {
        const [qt2, pos2] = tr.dataset.track!.split('|').map(Number);
        const r2 = tr.getBoundingClientRect();
        const maxEnd = rotRef.current.durations[qt2] * 60;
        let ns = pxToSec(ev.clientX - grabX - r2.left, r2.width, rotRef.current.durations[qt2], false);
        ns = Math.max(0, Math.min(maxEnd - dur, ns));
        ns = Math.round(ns / 30) * 30;
        const ne = Math.min(maxEnd, ns + dur);
        const v = validateSegment(
          t,
          rotRef.current,
          { playerId: seg.playerId, qt: qt2, pos: pos2, start: ns, end: ne },
          seg.id
        );
        live = { qt: qt2, pos: pos2, start: ns, end: ne, ok: v.ok, reason: v.reason };
      }

      // Aperçu via state : segment source estompé + fantôme flottant (rendu React).
      setDrag({
        kind: 'move',
        segId: seg.id,
        qt: live.qt,
        pos: live.pos,
        start: live.start,
        end: live.end,
        ok: live.ok,
        reason: live.reason,
        ghostX: ev.clientX - grabX,
        ghostY: ev.clientY - grabY,
        ghostW: segRect.width,
        ghostH: segRect.height,
        color,
        label,
      });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      interactingRef.current = false;
      setDrag(null);

      if (!moved) {
        // Simple clic → menu d'édition.
        openEditMenu(seg.id, startX, startY);
        return;
      }
      if (!live.ok) {
        showToast(live.reason || 'Position invalide (chevauchement)', true);
        return;
      }
      if (live.qt === origQt && live.pos === origPos && live.start === origStart) return;

      mutate((d) => {
        const tg = d.segments.find((s) => s.id === seg.id);
        if (tg) {
          tg.qt = live.qt;
          tg.pos = live.pos;
          tg.start = live.start;
          tg.end = live.end;
        }
        return d;
      });
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /* ── Ouverture des menus ── */
  const openPlaceMenu = (playerId: string, x: number, y: number) => {
    setSelectedSegId(null);
    setMenu({ mode: 'place', playerId, x, y });
  };
  const openEditMenu = (segId: string, x: number, y: number) => {
    setSelectedSegId(segId);
    setMenu({ mode: 'edit', segId, x, y });
  };

  /* ── Actions des menus ── */
  const applyPlace = (s: { playerId: string; qt: number; pos: number; start: number; end: number }) => {
    const v = validateSegment(team!, rotRef.current, s);
    if (!v.ok) {
      showToast(v.reason!, true);
      return false;
    }
    mutate((d) => {
      d.segments.push({ id: 'seg_' + uid(), ...s });
      return d;
    });
    const pl = team!.players.find((p) => p.id === s.playerId);
    showToast(`✓ ${pl?.firstName || ''} placé en Q${s.qt + 1} ${ROT_POSTES[s.pos].abbr} (${min1((s.end - s.start) / 60)} min)`);
    setMenu(null);
    return true;
  };
  const applyEdit = (segId: string, s: { playerId: string; qt: number; pos: number; start: number; end: number }) => {
    const v = validateSegment(team!, rotRef.current, s, segId);
    if (!v.ok) {
      showToast(v.reason!, true);
      return false;
    }
    mutate((d) => {
      const tg = d.segments.find((x) => x.id === segId);
      if (tg) Object.assign(tg, s);
      return d;
    });
    showToast('Segment modifié ✓');
    setMenu(null);
    setSelectedSegId(null);
    return true;
  };
  const deleteSeg = (segId: string) => {
    mutate((d) => {
      d.segments = d.segments.filter((s) => s.id !== segId);
      return d;
    });
    showToast('Segment supprimé');
    setMenu(null);
    setSelectedSegId(null);
  };

  /* ───────────────────────────────────────────────────────────── RENDER */

  if (!team) {
    return (
      <div className="rot-root">
        <Steps />
        <TeamSelect teams={teams} teamId={teamId} onChange={selectTeam} />
        <div className="rot-empty">Sélectionne une équipe pour planifier la rotation.</div>
        <style jsx>{rotCss}</style>
      </div>
    );
  }
  if (!team.players.length) {
    return (
      <div className="rot-root">
        <Steps />
        <TeamSelect teams={teams} teamId={teamId} onChange={selectTeam} />
        <div className="rot-empty">
          Aucun joueur — ajoute des joueurs dans <b>Mes Équipes</b> d&apos;abord.
        </div>
        <style jsx>{rotCss}</style>
      </div>
    );
  }

  const { mins, starters } = computeStats(team, rot);
  const totalMatchMin = rot.durations.reduce((a, b) => a + b, 0);

  return (
    <div className="rot-root">
      <Steps />

      <TeamSelect teams={teams} teamId={teamId} onChange={selectTeam} />

      {/* Barre d'outils */}
      <div className="rot-toolbar">
        <button className="rb" onClick={undo} title="Annuler (Ctrl+Z)">↶ Undo</button>
        <button className="rb" onClick={redo} title="Refaire (Ctrl+Y)">↷ Redo</button>
        <span className="rsep" />
        <button className="rb" onClick={onSave}>💾 Sauvegarder</button>
        <button className="rb" onClick={onExport}>📥 Export CSV</button>
        <button className="rb rb-red" onClick={onReset} style={{ marginLeft: 'auto' }}>↺ Reset</button>
      </div>

      {/* Tips */}
      <div className="rot-tips">
        💡 <b>Drag depuis l&apos;effectif</b> sur une ligne de poste pour placer un joueur ·{' '}
        <b>Drag la barre</b> pour la déplacer · <b>Drag les bords</b> pour étirer ·{' '}
        <b>Clic</b> sur une barre pour modifier/supprimer
      </div>

      {/* Layout */}
      <div className="rot-layout">
        <div className="rot-planner">
          {[0, 1, 2, 3].map((qt) => (
            <QtTimeline
              key={qt}
              team={team}
              rot={rot}
              qt={qt}
              drag={drag}
              selectedSegId={selectedSegId}
              onQtDuration={setQtDuration}
              onTrackDrop={onTrackDrop}
              onSegMouseDown={onSegMouseDown}
              setTrackBg={(el, on) => (el.style.background = on ? '#FFF8E7' : '')}
              draggingRef={draggingRef}
            />
          ))}
          <div className="rot-summary">
            <span>⏱ Total match : <b>{totalMatchMin}</b> min</span>
            <span className="dim">
              5 majeurs : <b>{starters.length ? starters.join(', ') : '— (place des joueurs sur Q1 à 10:00)'}</b>
            </span>
            <span className="dim">{rot.segments.length} segment(s)</span>
          </div>
        </div>

        {/* Sidebar effectif */}
        <div className="rot-sidebar">
          <div className="rs-title">
            👥 Effectif <span className="rs-hint">— clic = placer · drag = glisser</span>
          </div>
          <div className="rs-list">
            {team.players.map((p) => {
              const m = mins[p.id] || 0;
              const onBench = m === 0;
              const col = playerColor(p.id, team);
              return (
                <div
                  key={p.id}
                  className="rs-player"
                  draggable
                  data-bench={onBench ? '1' : '0'}
                  title="Clic pour placer · Drag pour glisser sur le diagramme"
                  onDragStart={(e) => {
                    draggingRef.current = { playerId: p.id };
                    interactingRef.current = true; // protège l'édition pendant le drag natif
                    e.dataTransfer.setData('text/plain', 'sidebar:' + p.id);
                    e.dataTransfer.effectAllowed = 'copy';
                    (e.currentTarget as HTMLElement).style.opacity = '0.5';
                  }}
                  onDragEnd={(e) => {
                    (e.currentTarget as HTMLElement).style.opacity = '';
                    draggingRef.current = null;
                    interactingRef.current = false;
                  }}
                  onClick={(e) => {
                    if (draggingRef.current) return;
                    openPlaceMenu(p.id, e.clientX, e.clientY);
                  }}
                >
                  <div className="rs-swatch" style={{ background: col }} />
                  <div className="rs-info">
                    <div className="rs-name">
                      {p.num ? '#' + p.num + ' ' : ''}
                      {p.firstName || ''}
                    </div>
                    <div className="rs-sub">
                      {p.poste || '—'} ·{' '}
                      <b style={{ color: m >= 20 ? '#16A34A' : m > 0 ? 'var(--rot-bordeaux)' : '#999' }}>{min1(m)} min</b>
                    </div>
                  </div>
                  <div className="rs-plus" title="Clic pour ajouter un segment">＋</div>
                </div>
              );
            })}
          </div>
          <div className="rs-legend">🟢 ≥20min · 🟠 a joué · ⚪ banc</div>
        </div>
      </div>

      {/* Fantôme de déplacement (rendu depuis le state, jamais via le DOM) */}
      {drag?.kind === 'move' && (
        <div
          className="rot-ghost"
          style={{
            left: drag.ghostX,
            top: drag.ghostY,
            width: drag.ghostW,
            height: drag.ghostH,
            background: drag.color,
            borderColor: drag.ok ? '#16A34A' : '#E63946',
            boxShadow: drag.ok
              ? '0 6px 18px rgba(22,163,74,.5)'
              : '0 6px 18px rgba(230,57,70,.5)',
          }}
        >
          {drag.label}
        </div>
      )}

      {/* Menus */}
      {menu?.mode === 'place' && (
        <SegMenu
          mode="place"
          team={team}
          rot={rot}
          x={menu.x}
          y={menu.y}
          player={team.players.find((p) => p.id === menu.playerId)!}
          onCancel={() => setMenu(null)}
          onApply={(s) => applyPlace(s)}
        />
      )}
      {menu?.mode === 'edit' && (() => {
        const seg = rot.segments.find((s) => s.id === menu.segId);
        if (!seg) return null;
        return (
          <SegMenu
            mode="edit"
            team={team}
            rot={rot}
            x={menu.x}
            y={menu.y}
            seg={seg}
            onCancel={() => {
              setMenu(null);
              setSelectedSegId(null);
            }}
            onApply={(s) => applyEdit(seg.id, s)}
            onDelete={() => deleteSeg(seg.id)}
          />
        );
      })()}

      {/* Toast */}
      {toast && <div className={'rot-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}

      <style jsx>{rotCss}</style>
    </div>
  );
}


function TeamSelect({
  teams,
  teamId,
  onChange,
}: {
  teams: Team[];
  teamId: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="rot-teamselect">
      <label>Équipe</label>

      <select value={teamId} onChange={(e) => onChange(e.target.value)}>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>

      <span>{teams.length} équipe(s)</span>

      <style jsx>{`
        .rot-teamselect {
          display: flex;
          align-items: center;
          gap: 0.55rem;
          background: #fff;
          border: 1px solid var(--rot-med);
          border-left: 4px solid var(--rot-or);
          border-radius: 8px;
          padding: 0.55rem 0.75rem;
          margin-bottom: 0.75rem;
        }

        .rot-teamselect label {
          color: var(--rot-bordeaux);
          font-weight: 900;
          text-transform: uppercase;
          font-size: 0.75rem;
        }

        .rot-teamselect select {
          min-width: 220px;
          max-width: 360px;
          height: 34px;
          border: 1px solid var(--rot-med);
          border-radius: 7px;
          padding: 0 0.65rem;
          background: #fff;
          color: #1a1a1a;
          font-weight: 800;
        }

        .rot-teamselect span {
          color: var(--rot-gris);
          font-size: 0.75rem;
          font-weight: 700;
        }

        @media (max-width: 760px) {
          .rot-teamselect {
            align-items: stretch;
            flex-direction: column;
          }

          .rot-teamselect select {
            width: 100%;
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
}


/* ─────────────────────────────────────────────── Bandeau "Marche à suivre" */

function Steps() {
  return (
    <div className="rot-steps">
      <b>Marche à suivre</b>
      <span>1. Choisis l&apos;équipe ·</span>
      <span>2. Glisse tes joueurs sur les lignes de poste, QT par QT ·</span>
      <span>3. Ajuste les durées d&apos;entrée/sortie ·</span>
      <span>4. Sauvegarde ou exporte la feuille de rotation.</span>
      <style jsx>{`
        .rot-steps {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem 0.6rem;
          align-items: baseline;
          background: #fff;
          border: 1px solid var(--rot-or);
          border-left: 4px solid var(--rot-bordeaux);
          border-radius: 8px;
          padding: 0.6rem 0.9rem;
          margin-bottom: 0.85rem;
          font-size: 0.8rem;
          color: var(--rot-gris);
        }
        .rot-steps b {
          color: var(--rot-bordeaux);
          font-size: 0.85rem;
          margin-right: 0.3rem;
        }
      `}</style>
    </div>
  );
}

/* ───────────────────────────────────────────────────── Timeline d'un QT */

function QtTimeline({
  team,
  rot,
  qt,
  drag,
  selectedSegId,
  onQtDuration,
  onTrackDrop,
  onSegMouseDown,
  setTrackBg,
  draggingRef,
}: {
  team: Team;
  rot: Rotation;
  qt: number;
  drag: DragState;
  selectedSegId: string | null;
  onQtDuration: (qt: number, v: number) => void;
  onTrackDrop: (qt: number, pos: number, e: React.DragEvent<HTMLDivElement>) => void;
  onSegMouseDown: (segId: string, e: React.MouseEvent<HTMLDivElement>) => void;
  setTrackBg: (el: HTMLElement, on: boolean) => void;
  draggingRef: React.MutableRefObject<{ playerId: string } | null>;
}) {
  const dur = rot.durations[qt];
  const totalSec = dur * 60;
  const ticks: number[] = [];
  for (let s = 0; s <= totalSec; s += 120) ticks.push(s);
  const cell = 100 / (totalSec / 120); // largeur d'une cellule de 2 min en %

  return (
    <div className="rot-qt">
      <div className="rqt-head">
        <h3>QT{qt + 1}</h3>
        <div className="rqt-dur">
          <span>Durée :</span>
          <input
            type="number"
            min={1}
            max={20}
            value={dur}
            onChange={(e) => onQtDuration(qt, parseInt(e.target.value) || 10)}
          />
          <span>min</span>
        </div>
      </div>

      {/* Axe temps */}
      <div className="rqt-axis-row">
        <div />
        <div className="rqt-axis">
          {ticks.map((s) => (
            <span key={s} style={{ left: (s / totalSec) * 100 + '%' }}>
              {fmtSec(totalSec - s)}
            </span>
          ))}
        </div>
      </div>

      {/* Lignes de postes */}
      <div className="rqt-rows">
        {ROT_POSTES.map((post, pos) => (
          <div className="rqt-row" key={pos}>
            <div className="rqt-poste">
              <span style={{ background: post.color }}>{post.abbr}</span>
            </div>
            <div
              className="rqt-track"
              data-track={`${qt}|${pos}`}
              style={{
                backgroundImage: `repeating-linear-gradient(90deg,#FAFAFA 0,#FAFAFA calc(${cell}% - 1px),#E5E5E5 calc(${cell}% - 1px),#E5E5E5 ${cell}%)`,
              }}
              onDragOver={(e) => {
                if (!draggingRef.current) return;
                e.preventDefault();
                setTrackBg(e.currentTarget, true);
              }}
              onDragLeave={(e) => setTrackBg(e.currentTarget, false)}
              onDrop={(e) => onTrackDrop(qt, pos, e)}
            >
              {rot.segments
                .filter((s) => s.qt === qt && s.pos === pos)
                .map((seg) => {
                  const player = team.players.find((p) => p.id === seg.playerId);
                  if (!player) return null;

                  // ── Aperçu transitoire : on dérive l'affichage du state `drag`. ──
                  const isResizing = drag?.kind === 'resize' && drag.segId === seg.id;
                  const isMoving = drag?.kind === 'move' && drag.segId === seg.id;

                  const segStart = isResizing ? drag.start : seg.start;
                  const segEnd = isResizing ? drag.end : seg.end;

                  const left = (segStart / totalSec) * 100;
                  const width = ((segEnd - segStart) / totalSec) * 100;
                  const col = playerColor(seg.playerId, team);
                  const durMin = (segEnd - segStart) / 60;
                  const sel = selectedSegId === seg.id;

                  return (
                    <div
                      key={seg.id}
                      className="rot-seg"
                      data-seg={seg.id}
                      onMouseDown={(e) => onSegMouseDown(seg.id, e)}
                      onDragStart={(e) => e.preventDefault()}
                      style={{
                        left: left + '%',
                        width: width + '%',
                        background: `linear-gradient(135deg,${col},${col}cc)`,
                        border: '1px solid ' + col,
                        // Estompe la source pendant un déplacement (le fantôme suit la souris).
                        opacity: isMoving ? 0.3 : undefined,
                        pointerEvents: isMoving ? 'none' : undefined,
                        // Cadre rouge si l'étirement en cours est invalide.
                        boxShadow: isResizing && !drag.ok ? '0 0 0 2px #E63946' : undefined,
                        outline: sel ? '3px solid #FFC107' : undefined,
                        outlineOffset: sel ? '2px' : undefined,
                        zIndex: sel || isResizing ? 50 : undefined,
                      }}
                    >
                      <div className="rot-handle" data-resize="left" />
                      <span className="rot-seg-label">
                        {player.num ? '#' + player.num + ' ' : ''}
                        {player.firstName || ''}
                        <span className="rot-seg-dur">{min1(durMin)}&apos;</span>
                      </span>
                      <div className="rot-handle" data-resize="right" />
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Menu Placer / Éditer (formulaire commun) */

function SegMenu(props: {
  mode: 'place' | 'edit';
  team: Team;
  rot: Rotation;
  x: number;
  y: number;
  player?: Player;
  seg?: Seg;
  onCancel: () => void;
  onApply: (s: { playerId: string; qt: number; pos: number; start: number; end: number }) => boolean;
  onDelete?: () => void;
}) {
  const { mode, team, rot, x, y, seg } = props;
  const menuRef = useRef<HTMLDivElement>(null);

  const initialPlayerId =
    mode === 'edit' ? seg!.playerId : props.player!.id;
  const defaultPos = (() => {
    if (mode === 'edit') return seg!.pos;
    const np = (props.player!.poste || '').trim().toLowerCase();
    if (POSTE_TO_IDX[np] !== undefined) return POSTE_TO_IDX[np];
    let idx = 0;
    ROT_POSTES.forEach((p, i) => {
      if (p.abbr.toLowerCase() === np) idx = i;
    });
    return idx;
  })();

  const [st, setSt] = useState({
    qt: mode === 'edit' ? seg!.qt : 0,
    pos: defaultPos,
    start: mode === 'edit' ? seg!.start : 0,
    end: mode === 'edit' ? seg!.end : 300,
    playerId: initialPlayerId,
  });

  const qtMaxSec = rot.durations[st.qt] * 60;

  // Reposition si débordement + fermeture au clic extérieur
  const [pos, setPos] = useState({ left: x, top: y });
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (r.right > window.innerWidth) left = window.innerWidth - r.width - 10;
    if (r.bottom > window.innerHeight) top = window.innerHeight - r.height - 10;
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [x, y]);

  useEffect(() => {
    const onDoc = (ev: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(ev.target as Node)) {
        const inRoster = (ev.target as HTMLElement).closest?.('.rs-player');
        if (mode === 'place' && inRoster) return;
        props.onCancel();
      }
    };
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDoc), 60);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const live = validateSegment(team, rot, st, mode === 'edit' ? seg!.id : null);

  const setStart = (s: number) => {
    s = Math.max(0, Math.min(rot.durations[st.qt] * 60 - 30, Math.round(s / 30) * 30));
    setSt((p) => ({ ...p, start: s, end: p.end <= s ? Math.min(rot.durations[p.qt] * 60, s + 30) : p.end }));
  };
  const setEnd = (e: number) => {
    e = Math.max(30, Math.min(rot.durations[st.qt] * 60, Math.round(e / 30) * 30));
    setSt((p) => ({ ...p, end: e, start: p.start >= e ? Math.max(0, e - 30) : p.start }));
  };
  const setDur = (d: number) => {
    let durSec = Math.round((d * 60) / 30) * 30;
    if (durSec < 30) durSec = 30;
    setSt((p) => {
      const max = rot.durations[p.qt] * 60;
      let end = p.start + durSec;
      let start = p.start;
      if (end > max) {
        end = max;
        start = Math.max(0, end - durSec);
      }
      return { ...p, start, end };
    });
  };
  const setQt = (qt: number) =>
    setSt((p) => {
      const max = rot.durations[qt] * 60;
      const start = Math.min(p.start, max);
      let end = Math.min(p.end, max);
      if (end <= start) end = Math.min(max, start + 30);
      return { ...p, qt, start, end };
    });

  const durMin = (st.end - st.start) / 60;
  const headColor = playerColor(st.playerId, team);
  const cur = team.players.find((p) => p.id === st.playerId);
  const initials =
    ((cur?.firstName || '?')[0] || '').toUpperCase() + ((cur?.lastName || '')[0] || '').toUpperCase();

  return (
    <div ref={menuRef} className="rot-menu" style={{ left: pos.left, top: pos.top }}>
      {/* En-tête */}
      <div className="rm-head">
        <span className="rm-ava" style={{ background: headColor }}>{initials || '?'}</span>
        <div>
          <div className="rm-title">
            {mode === 'place' ? '＋ Placer ' : '✏️ '}
            {cur?.firstName || ''} {cur?.lastName || ''}
          </div>
          <div className="rm-sub">
            {cur?.num ? '#' + cur.num + ' · ' : ''}
            {cur?.poste || '—'}
          </div>
        </div>
      </div>

      {/* Joueur (édition seulement, grille) */}
      {mode === 'edit' && (
        <div className="rm-field">
          <label>Joueur :</label>
          <div className="rm-players">
            {team.players.map((p) => {
              const sel = p.id === st.playerId;
              const col = playerColor(p.id, team);
              const ini = ((p.firstName || '?')[0] || '').toUpperCase() + ((p.lastName || '')[0] || '').toUpperCase();
              return (
                <button
                  key={p.id}
                  type="button"
                  className={'rm-pbtn' + (sel ? ' sel' : '')}
                  onClick={() => setSt((s) => ({ ...s, playerId: p.id }))}
                >
                  <span className="rm-dot" style={{ background: col }}>{ini || '?'}</span>
                  <span className="rm-pn">{p.num ? '#' + p.num + ' ' : ''}{p.firstName || ''}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* QT */}
      <div className="rm-row">
        <label>Quart-temps :</label>
        <div className="rm-seg-btns">
          {[0, 1, 2, 3].map((q) => (
            <button key={q} type="button" className={'rm-tab' + (st.qt === q ? ' on' : '')} onClick={() => setQt(q)}>
              Q{q + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Poste */}
      <div className="rm-row">
        <label>Poste :</label>
        <div className="rm-seg-btns">
          {ROT_POSTES.map((p, i) => (
            <button
              key={i}
              type="button"
              className={'rm-tab' + (st.pos === i ? ' on' : '')}
              title={p.label}
              onClick={() => setSt((s) => ({ ...s, pos: i }))}
            >
              {p.abbr}
            </button>
          ))}
        </div>
      </div>

      {/* Durée */}
      <div className="rm-slider rm-dur">
        <label>⏱ Durée :</label>
        <input type="range" min={0.5} max={rot.durations[st.qt]} step={0.5} value={durMin} onChange={(e) => setDur(parseFloat(e.target.value))} />
        <input type="number" min={0.5} max={rot.durations[st.qt]} step={0.5} value={durMin.toFixed(1)} onChange={(e) => setDur(parseFloat(e.target.value) || 0.5)} />
      </div>

      {/* Entrée */}
      <div className="rm-slider">
        <label>Entrée :</label>
        <input type="range" min={0} max={qtMaxSec} step={30} value={st.start} onChange={(e) => setStart(parseInt(e.target.value))} />
        <input type="number" min={0} max={rot.durations[st.qt]} step={0.5} value={(st.start / 60).toFixed(1)} onChange={(e) => setStart(Math.round((parseFloat(e.target.value) || 0) * 60))} />
      </div>

      {/* Sortie */}
      <div className="rm-slider">
        <label>Sortie :</label>
        <input type="range" min={0} max={qtMaxSec} step={30} value={st.end} onChange={(e) => setEnd(parseInt(e.target.value))} />
        <input type="number" min={0} max={rot.durations[st.qt]} step={0.5} value={(st.end / 60).toFixed(1)} onChange={(e) => setEnd(Math.round((parseFloat(e.target.value) || 0) * 60))} />
      </div>

      {!live.ok && <div className="rm-err">⚠ {live.reason}</div>}

      {/* Actions */}
      <div className="rm-actions">
        {mode === 'edit' && (
          <button type="button" className="rm-del" onClick={props.onDelete}>🗑 Supprimer</button>
        )}
        <div className="rm-right">
          <button type="button" className="rm-cancel" onClick={props.onCancel}>Annuler</button>
          <button type="button" className="rm-apply" onClick={() => props.onApply(st)}>
            {mode === 'place' ? '＋ Ajouter' : '✓ Appliquer'}
          </button>
        </div>
      </div>

      <style jsx>{menuCss}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────── Export CSV */

function exportCsv(team: Team, rot: Rotation) {
  const today = new Date().toISOString().split('T')[0];
  const { mins } = computeStats(team, rot);
  const lines: string[] = [];
  lines.push(`# Rotation - ${team.name} - ${today}`);
  lines.push('');
  lines.push('QT;Poste;Joueur;Entrée (min:sec);Sortie (min:sec);Durée (min)');
  rot.segments
    .slice()
    .sort((a, b) => a.qt - b.qt || a.pos - b.pos || a.start - b.start)
    .forEach((s) => {
      const p = team.players.find((x) => x.id === s.playerId);
      lines.push(
        [
          'QT' + (s.qt + 1),
          ROT_POSTES[s.pos].label,
          p ? `${p.num ? '#' + p.num + ' ' : ''}${p.firstName || ''} ${p.lastName || ''}`.trim() : '?',
          fmtSec(s.start),
          fmtSec(s.end),
          ((s.end - s.start) / 60).toFixed(2),
        ].join(';')
      );
    });
  lines.push('');
  lines.push('Joueur;N°;Poste;Minutes totales');
  team.players.forEach((p) => {
    lines.push([`${p.firstName || ''} ${p.lastName || ''}`.trim(), p.num || '', p.poste || '', (mins[p.id] || 0).toFixed(2)].join(';'));
  });
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rotation_${team.name.replace(/[^a-z0-9_-]/gi, '_')}_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

/* ─────────────────────────────────────────────────────────────────── CSS */

const rotCss = `
  .rot-root {
    --rot-bordeaux: #6B1A2C;
    --rot-or: #D4A24C;
    --rot-gris: #6f655c;
    --rot-med: #d9d2c7;
    font-family: 'Roboto', system-ui, sans-serif;
    color: #1a1a1a;
    width: 100%;
    min-width: 0;
  }

  .rot-empty {
    text-align: center;
    padding: 1.6rem;
    color: var(--rot-gris);
    background: #fff;
    border: 1px solid var(--rot-med);
    border-radius: 8px;
  }

  .rot-toolbar {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 0.75rem;
    background: #fff;
    border: 1px solid var(--rot-med);
    border-radius: 8px;
    padding: 0.55rem 0.75rem;
  }

  .rb {
    font-size: 0.78rem;
    padding: 0.28rem 0.6rem;
    border: 1px solid var(--rot-med);
    background: #fff;
    color: #333;
    border-radius: 6px;
    cursor: pointer;
    transition: 0.12s;
    white-space: nowrap;
  }

  .rb:hover { background: #faf6ee; border-color: var(--rot-or); }
  .rb-red { color: #E63946; border-color: #E63946; }
  .rb-red:hover { background: #fdeced; }
  .rsep { height: 18px; width: 1px; background: var(--rot-med); margin: 0 0.2rem; }

  .rot-tips {
    background: #FFF8E7;
    border: 1px solid var(--rot-or);
    border-radius: 6px;
    padding: 0.55rem 0.9rem;
    margin-bottom: 0.75rem;
    font-size: 0.78rem;
    color: var(--rot-bordeaux);
    line-height: 1.4;
  }

  .rot-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 220px;
    gap: 1rem;
    align-items: start;
    width: 100%;
    min-width: 0;
    overflow-x: auto;
  }

  .rot-planner {
    min-width: 620px;
  }

  .rot-qt {
    background: #fff;
    border: 1px solid var(--rot-med);
    border-radius: 8px;
    padding: 0.65rem 0.8rem 0.55rem;
    margin-bottom: 0.55rem;
    min-width: 0;
  }

  .rqt-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: .8rem;
    margin-bottom: 0.45rem;
  }

  .rqt-head h3 {
    margin: 0;
    font-size: 0.95rem;
    color: var(--rot-bordeaux);
    font-family: 'Alfa Slab One', var(--varsity, sans-serif);
    letter-spacing: 0.04em;
    white-space: nowrap;
  }

  .rqt-dur {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    color: var(--rot-gris);
    white-space: nowrap;
  }

  .rqt-dur input {
    width: 42px;
    padding: 0.15rem 0.25rem;
    font-size: 0.75rem;
    border: 1px solid var(--rot-med);
    border-radius: 3px;
    text-align: center;
  }

  .rqt-axis-row {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    gap: 0.35rem;
    margin-bottom: 0.2rem;
  }

  .rqt-axis {
    position: relative;
    height: 14px;
    font-size: 0.62rem;
    color: var(--rot-gris);
    user-select: none;
    min-width: 0;
  }

  .rqt-axis span {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
  }

  .rqt-rows {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .rqt-row {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    gap: 0.35rem;
    align-items: center;
    min-width: 0;
  }

  .rqt-poste {
    display: flex;
    justify-content: center;
    font-size: 0.65rem;
  }

  .rqt-poste span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    color: #fff;
    border-radius: 4px;
    font-weight: 700;
    font-size: 0.72rem;
  }

  .rqt-track {
    position: relative;
    height: 34px;
    border-radius: 4px;
    border: 1px solid #e5e5e5;
    cursor: copy;
    transition: background 0.1s;
    min-width: 0;
    overflow: hidden;
  }

  .rot-seg {
    position: absolute;
    top: 2px;
    bottom: 2px;
    color: #fff;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    font-size: 0.7rem;
    font-weight: 600;
    cursor: grab;
    user-select: none;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
    min-width: 18px;
    max-width: 100%;
  }

  .rot-seg:active { cursor: grabbing; }

  .rot-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 7px;
    cursor: ew-resize;
    z-index: 3;
  }

  .rot-handle[data-resize='left'] { left: 0; }
  .rot-handle[data-resize='right'] { right: 0; }

  .rot-seg-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.1;
    pointer-events: none;
    max-width: 100%;
  }

  .rot-seg-dur {
    font-size: 0.62rem;
    font-weight: 400;
    opacity: 0.85;
    margin-left: 0.3rem;
  }

  /* Fantôme de déplacement (suit la souris, rendu depuis le state) */
  .rot-ghost {
    position: fixed;
    pointer-events: none;
    color: #fff;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    font-size: 0.7rem;
    font-weight: 600;
    opacity: 0.78;
    z-index: 9999;
    border: 2px dashed #fff;
    overflow: hidden;
    white-space: nowrap;
  }

  .rot-summary {
    margin-top: 0.7rem;
    padding: 0.55rem 0.85rem;
    background: var(--rot-bordeaux);
    color: #fff;
    border-radius: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.82rem;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .rot-summary .dim {
    font-size: 0.75rem;
    opacity: 0.85;
  }

  .rot-sidebar {
    background: #fff;
    border: 1px solid var(--rot-med);
    border-radius: 8px;
    padding: 0.7rem;
    position: sticky;
    top: 0.6rem;
    width: 220px;
    min-width: 220px;
  }

  .rs-title {
    font-weight: 700;
    font-size: 0.85rem;
    margin-bottom: 0.55rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid #f0f0f0;
  }

  .rs-hint {
    font-size: 0.65rem;
    font-weight: 400;
    color: var(--rot-gris);
  }

  .rs-list {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    max-height: 65vh;
    overflow-y: auto;
    padding-right: 0.2rem;
  }

  .rs-player {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.35rem 0.5rem;
    background: #FFF8E7;
    border: 1px solid var(--rot-or);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.78rem;
    transition: 0.12s;
    min-width: 0;
  }

  .rs-player[data-bench='1'] {
    background: #FAFAFA;
    border-color: #e5e5e5;
  }

  .rs-player:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .rs-swatch {
    width: 8px;
    height: 34px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .rs-info {
    flex: 1;
    min-width: 0;
    line-height: 1.15;
  }

  .rs-name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rs-sub {
    font-size: 0.68rem;
    color: var(--rot-gris);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rs-plus {
    color: var(--rot-bordeaux);
    font-size: 0.9rem;
    flex-shrink: 0;
    opacity: 0.55;
  }

  .rs-legend {
    margin-top: 0.55rem;
    padding-top: 0.5rem;
    border-top: 1px solid #f0f0f0;
    font-size: 0.68rem;
    color: var(--rot-gris);
    text-align: center;
    line-height: 1.4;
  }

  .rot-toast {
    position: fixed;
    bottom: 1.2rem;
    left: 50%;
    transform: translateX(-50%);
    background: #1a1a1a;
    color: #fff;
    padding: 0.6rem 1.1rem;
    border-radius: 8px;
    font-size: 0.82rem;
    z-index: 10000;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
  }

  .rot-toast.err {
    background: #E63946;
  }

  @media (max-width: 760px) {
    .rot-layout {
      grid-template-columns: 1fr;
      min-width: 0;
    }

    .rot-sidebar {
      position: relative;
      top: auto;
      width: 100%;
      min-width: 0;
    }
  }
`;

const menuCss = `
  .rot-menu {
    position: fixed;
    z-index: 9999;
    background: #fff;
    border: 2px solid var(--rot-bordeaux, #6B1A2C);
    border-radius: 8px;
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.22);
    padding: 0.65rem 0.8rem;
    min-width: 340px;
    max-width: 380px;
    font-size: 0.82rem;
    --rot-bordeaux: #6B1A2C;
    --rot-or: #D4A24C;
    --rot-gris: #6f655c;
    --rot-med: #d9d2c7;
    font-family: 'Roboto', system-ui, sans-serif;
  }
  .rm-head { border-bottom: 1px solid #f0f0f0; padding-bottom: 0.45rem; margin-bottom: 0.55rem; display: flex; align-items: center; gap: 0.55rem; }
  .rm-ava { width: 30px; height: 30px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 0.75rem; flex-shrink: 0; }
  .rm-title { font-weight: 700; color: var(--rot-bordeaux); font-size: 0.88rem; }
  .rm-sub { font-size: 0.72rem; color: var(--rot-gris); }
  .rm-field { margin-bottom: 0.55rem; }
  .rm-field > label { font-size: 0.72rem; color: var(--rot-gris); font-weight: 600; display: block; margin-bottom: 0.25rem; }
  .rm-players { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 3px; max-height: 120px; overflow-y: auto; padding: 2px; }
  .rm-pbtn { display: flex; align-items: center; gap: 5px; padding: 0.25rem 0.4rem; border: 1.5px solid var(--rot-med); background: #fff; border-radius: 4px; cursor: pointer; text-align: left; font-size: 0.72rem; font-weight: 500; }
  .rm-pbtn.sel { border-color: var(--rot-bordeaux); background: rgba(107, 26, 44, 0.06); color: var(--rot-bordeaux); font-weight: 700; }
  .rm-dot { width: 14px; height: 14px; border-radius: 50%; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 0.55rem; font-weight: 800; flex-shrink: 0; }
  .rm-pn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rm-row { display: grid; grid-template-columns: 80px 1fr; gap: 0.4rem; align-items: center; margin-bottom: 0.4rem; }
  .rm-row > label { font-size: 0.72rem; color: var(--rot-gris); font-weight: 600; }
  .rm-seg-btns { display: flex; gap: 3px; }
  .rm-tab { flex: 1; padding: 0.25rem; border: 1px solid var(--rot-med); background: #fff; color: var(--rot-bordeaux); border-radius: 3px; font-size: 0.68rem; font-weight: 700; cursor: pointer; }
  .rm-tab.on { background: var(--rot-bordeaux); color: #fff; border-color: var(--rot-bordeaux); }
  .rm-slider { display: grid; grid-template-columns: 80px 1fr 50px; gap: 0.4rem; align-items: center; margin-bottom: 0.35rem; }
  .rm-slider > label { font-size: 0.72rem; color: var(--rot-gris); font-weight: 600; }
  .rm-slider input[type='range'] { width: 100%; }
  .rm-slider input[type='number'] { width: 50px; padding: 0.15rem; font-size: 0.72rem; border: 1px solid var(--rot-med); border-radius: 3px; text-align: right; }
  .rm-dur { background: rgba(212, 162, 76, 0.08); padding: 0.3rem 0.35rem; border-radius: 4px; border: 1px solid rgba(212, 162, 76, 0.3); }
  .rm-dur > label { color: var(--rot-bordeaux); font-weight: 700; }
  .rm-err { font-size: 0.72rem; color: #E63946; font-weight: 700; margin: 0.2rem 0 0.45rem; padding: 0.25rem 0.4rem; background: rgba(230, 57, 70, 0.08); border: 1px solid rgba(230, 57, 70, 0.3); border-radius: 4px; }
  .rm-actions { display: flex; gap: 0.3rem; justify-content: space-between; align-items: center; margin-top: 0.4rem; }
  .rm-right { display: flex; gap: 0.3rem; margin-left: auto; }
  .rm-del, .rm-cancel, .rm-apply { font-size: 0.72rem; padding: 0.32rem 0.65rem; border-radius: 5px; cursor: pointer; border: 1px solid var(--rot-med); background: #fff; }
  .rm-del { color: #E63946; border-color: #E63946; }
  .rm-apply { background: var(--rot-bordeaux); color: #fff; border-color: var(--rot-bordeaux); }
`;