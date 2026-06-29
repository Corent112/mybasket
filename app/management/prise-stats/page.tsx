'use client';

/**
 * Prise de stats LIVE — wizard une-étape-à-la-fois (Sportscode / FIBA LiveStats)
 * Intégré au Management ("Stats Live"). Choix de l'équipe depuis "Mes équipes"
 * (clé localStorage `mybasket_equipes`). Joueurs + photos issus de l'équipe.
 *
 * Étapes : Création du match (date / adversaire / équipe / 5 majeur) puis saisie :
 *  - 1 seul choix attaque/défense au début de chaque quart-temps, ensuite bascule auto
 *  - chrono live, scores par quart-temps, changements
 *  - aucune validation (auto-enregistrement), shot chart au clic
 *  - box-score consultable + analyses (temps forts/joueur, lineups, stops, possessions)
 */

import { useEffect, useRef, useState } from 'react';

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
  const num = Number(p.num ?? p.numero ?? p.number ?? p.maillot ?? 0) || 0;
  const name =
    p.name || [p.prenom, p.nom].filter(Boolean).join(' ').trim() || p.nom || p.fullName || p.displayName ||
    (num ? `Joueur ${num}` : 'Joueur');
  const pos = p.pos || p.poste || p.postePrincipal || p.position || '';
  const photo = p.photo || p.avatar || p.image || p.photoUrl || p.url || '';
  const id = String(p.id ?? p.playerId ?? `${num}-${name}`);
  return { id, num, name, pos, photo };
}
function readTeams(): { id: string; name: string; players: Player[] }[] {
  if (typeof window === 'undefined') return DEFAULT_TEAMS as any;
  try {
    const raw = window.localStorage.getItem(TEAMS_KEY);
    if (!raw) return DEFAULT_TEAMS as any;
    const data = JSON.parse(raw);
    const list: any[] = Array.isArray(data) ? data : data?.teams || data?.equipes || [];
    const mapped = list.map((t) => ({
      id: String(t.id ?? ''),
      name: String(t.nom || t.name || t.teamName || 'Équipe').toUpperCase(),
      players: (t.players || t.joueurs || t.effectif || t.roster || []).map(normalizePlayer).filter((p: Player) => p.id),
    })).filter((t) => t.id && t.players.length);
    return mapped.length ? mapped : (DEFAULT_TEAMS as any);
  } catch {
    return DEFAULT_TEAMS as any;
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
  { id: 'tir', label: 'Panier adverse', ic: '🏀' }, { id: 'interception', label: 'Interception', ic: '🖐' },
  { id: 'contre', label: 'Contre', ic: '🛑' }, { id: 'rebond-def', label: 'Rebond défensif', ic: '↺' },
  { id: 'faute-provoquee', label: 'Faute provoquée', ic: '🔔' }, { id: 'faute-commise', label: 'Faute commise', ic: '🟨' },
];
const NEEDS_PLAYER_DEF = ['interception', 'contre', 'rebond-def'];
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
const uid = () => Math.random().toString(36).slice(2, 9);

function describe(a: StatA, find: (id: string | null) => Player | undefined) {
  if (a.actionType === 'tir') {
    if (a.context === 'defense') { const m = a.shotResult === 'made'; return { b: 'ADV', c: m ? 'b-neutral' : 'b-def', t: m ? `Panier adverse (${a.shotType === '3PTS' ? 3 : a.shotType === 'LF' ? 1 : 2})` : 'Tir adverse manqué' }; }
    if (a.shotType === 'LF') return { b: 'LF', c: a.ftMade > 0 ? 'b-ft' : 'b-miss', t: `${a.ftMade || 0}/${a.ftAttempts || 0} LF` };
    const m = a.shotResult === 'made'; return { b: a.shotType, c: m ? 'b-made' : 'b-miss', t: m ? `${a.shotType === '3PTS' ? 3 : 2} pts marqués` : `${a.shotType === '3PTS' ? 3 : 2} pts raté` };
  }
  if (a.actionType === 'passe') return { b: 'AST', c: 'b-ast', t: 'Passe décisive' };
  if (a.actionType === 'rebond-def') return { b: 'DEF REB', c: 'b-def', t: 'Rebond défensif' };
  if (a.actionType === 'interception') return { b: 'STL', c: 'b-stl', t: 'Interception' };
  if (a.actionType === 'contre') return { b: 'BLK', c: 'b-def', t: 'Contre' };
  if (a.actionType === 'perte') return { b: 'TO', c: 'b-to', t: 'Perte de balle' };
  if (a.actionType === 'touche') return { b: 'IN', c: 'b-neutral', t: `Remise en jeu${a.inbound ? ' (' + a.inbound.toUpperCase() + ')' : ''}` };
  if (a.actionType === 'faute-provoquee') return { b: 'FP', c: 'b-foul', t: `Faute provoquée${a.foulOutcome === 'touche' ? ' · touche' : a.shotType === 'LF' ? ` · ${a.ftMade}/${a.ftAttempts} LF` : ''}` };
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
  const blank = (p: Player) => ({ p, p2m: 0, p2a: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 });
  roster.forEach((p) => (map[p.id] = blank(p)));
  const ens = (id: string | null) => { if (id && !map[id]) { const p = roster.find((x) => x.id === id) || { id, num: 0, name: id, pos: '' }; map[id] = blank(p as Player); } return id ? map[id] : null; };
  actions.forEach((a) => {
    const L = ens(a.playerId);
    if (a.actionType === 'tir' && L && a.context !== 'defense') {
      if (a.shotType === '2PTS') { L.p2a++; if (a.shotResult === 'made') L.p2m++; }
      else if (a.shotType === '3PTS') { L.p3a++; if (a.shotResult === 'made') L.p3m++; }
      else if (a.shotType === 'LF') { L.fta += a.ftAttempts; L.ftm += a.ftMade; }
      if (a.shotType !== 'LF' && a.shotResult === 'made' && a.specialCase !== 'aucun') { L.fta += a.ftAttempts; L.ftm += a.ftMade; }
    } else if (a.actionType === 'interception' && L) L.stl++;
    else if (a.actionType === 'contre' && L) L.blk++;
    else if (a.actionType === 'perte' && L) L.to++;
    else if (a.actionType === 'rebond-def' && L) L.reb++;
    else if (a.actionType === 'faute-commise' && L) L.pf++;
    else if (a.actionType === 'faute-provoquee' && L && a.shotType === 'LF') { L.fta += a.ftAttempts; L.ftm += a.ftMade; }
    if (a.assist && a.assistPlayerId) { const x = ens(a.assistPlayerId); if (x) x.ast++; }
    if (a.reboundPlayerId) { const x = ens(a.reboundPlayerId); if (x) x.reb++; }
  });
  return Object.values(map).filter((l: any) => l.p2a + l.p3a + l.fta + l.reb + l.ast + l.stl + l.blk + l.to + l.pf > 0).sort((a: any, b: any) => a.p.num - b.p.num);
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
  const [opponent, setOpponent] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [starters, setStarters] = useState<string[]>([]);

  const [roster, setRoster] = useState<Player[]>([]);
  const [teamName, setTeamName] = useState('');
  const [onCourt, setOnCourt] = useState<string[]>([]);
  const [stage, setStage] = useState('context');
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [actions, setActions] = useState<StatA[]>([]);
  const [q, setQ] = useState(1);
  const [secs, setSecs] = useState(600);
  const [running, setRunning] = useState(false);
  const [perQ, setPerQ] = useState<Record<number, { us: number; them: number }>>({ 1: { us: 0, them: 0 } });
  const [subSel, setSubSel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const find = (id: string | null) => roster.find((p) => p.id === id);
  const floor = roster.filter((p) => onCourt.includes(p.id));
  const bench = roster.filter((p) => !onCourt.includes(p.id));

  useEffect(() => { setTeams(readTeams()); }, []);
  useEffect(() => { if (teams.length && !teamId) { setTeamId(teams[0].id); } }, [teams, teamId]);

  // chrono
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSecs((s) => (s > 0 ? s - 1 : (setRunning(false), 0))), 1000);
    return () => clearInterval(t);
  }, [running]);

  // persistance par équipe
  useEffect(() => {
    if (screen === 'setup' || !teamId) return;
    try { window.localStorage.setItem(SESSION_KEY(teamId), JSON.stringify({ actions, perQ, q, onCourt, opponent, teamName })); } catch { /* noop */ }
  }, [actions, perQ, q, onCourt, screen, teamId, opponent, teamName]);

  const flash = (m: string) => { setToast(m); window.clearTimeout((flash as any)._t); (flash as any)._t = window.setTimeout(() => setToast(null), 1500); };

  /* -------- création du match -------- */
  const selTeam = teams.find((t) => t.id === teamId);
  const setupRoster = selTeam?.players || [];
  const canStart = !!opponent.trim() && starters.length === 5;
  const toggleStarter = (id: string) => setStarters((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 5 ? [...s, id] : s));
  const startMatch = () => {
    if (!selTeam) return;
    setRoster(selTeam.players); setTeamName(selTeam.name); setOnCourt(starters.slice());
    setActions([]); setPerQ({ 1: { us: 0, them: 0 } }); setQ(1); setSecs(600); setRunning(false);
    setDraft(emptyDraft()); setStage('context'); setScreen('live');
  };

  /* -------- horloge / quart-temps -------- */
  const changeQ = (d: number) => {
    const nq = Math.max(1, q + d);
    setQ(nq); setPerQ((p) => (p[nq] ? p : { ...p, [nq]: { us: 0, them: 0 } }));
    setSecs(600); setRunning(false); setDraft(emptyDraft()); setStage('context');
  };

  /* -------- enregistrement (auto, sans validation) -------- */
  const commit = (d: Draft) => {
    const a: StatA = { ...d, id: uid(), clock: fmt(secs), q, lineup: onCourt.slice() };
    setActions((arr) => [...arr, a]);
    setPerQ((p) => { const cur = p[q] || { us: 0, them: 0 }; return { ...p, [q]: { us: cur.us + ptsOf(a), them: cur.them + themPtsOf(a) } }; });
    flash('Enregistré : ' + describe(a, find).t);
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
    const anyMade = d.ftMade > 0; const lastMiss = d.ftResults[d.ftResults.length - 1] === 'miss';
    if (d.actionType === 'faute-commise') { commit({ ...d, shotResult: anyMade ? 'made' : 'missed' }); return; }
    if (d.specialCase === '2pts+1lf' || d.specialCase === '3pts+1lf') { if (lastMiss) { setDraft(d); setStage('rebound'); } else commit(d); return; }
    if (d.actionType === 'faute-provoquee') {
      const nd = { ...d, shotResult: anyMade ? 'made' : 'missed' };
      if (anyMade) { setDraft(nd); setStage('assist'); return; }
      if (lastMiss) { setDraft(nd); setStage('rebound'); return; }
      commit(nd); return;
    }
    const nd = { ...d, shotResult: anyMade ? 'made' : 'missed' };
    if (lastMiss) { setDraft(nd); setStage('rebound'); } else commit(nd);
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
    if (d.context === 'defense') {
      if (id === 'tir') { setDraft(d); setStage('result'); }
      else if (id === 'faute-commise') { setDraft(d); setStage('player'); }
      else if (NEEDS_PLAYER_DEF.includes(id)) { setDraft(d); setStage('player'); }
      else commit(d);
      return;
    }
    if (id === 'tir') { setDraft(d); setStage('result'); }
    else if (id === 'faute-provoquee') { setDraft(d); setStage('faute'); }
    else if (id === 'touche') { setDraft(d); setStage('inbound'); }
    else commit(d);
  };
  const playerPick = (id: string) => {
    if (draft.context === 'defense' && draft.actionType === 'faute-commise') { setDraft({ ...draft, playerId: id }); setStage('faute'); return; }
    if (draft.context === 'defense' && NEEDS_PLAYER_DEF.includes(draft.actionType)) { commit({ ...draft, playerId: id }); return; }
    setDraft({ ...draft, playerId: id }); setStage('action');
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
  const courtClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (stage !== 'zone') return;
    const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const d = { ...draft, courtX: (e.clientX - r.left) / r.width, courtY: (e.clientY - r.top) / r.height };
    if (d.shotResult === 'missed') { setDraft(d); setStage('rebound'); } else { setDraft(d); setStage('assist'); }
  };
  const rebPick = (id: string) => { const d = { ...draft, reboundType: id }; if (isMyRebound(d.context, id)) { setDraft(d); } else commit(d); };
  const rebWho = (id: string) => commit({ ...draft, reboundPlayerId: id });
  const passer = (id: string) => { if (id) afterPD({ ...draft, assist: true, assistPlayerId: id }); else afterPD({ ...draft, assist: false, assistPlayerId: null }); };
  const themBtn = (d: number) => setPerQ((p) => { const cur = p[q] || { us: 0, them: 0 }; return { ...p, [q]: { ...cur, them: Math.max(0, cur.them + d) } }; });
  const undo = () => {
    if (!actions.length) return;
    const a = actions[actions.length - 1];
    setActions((arr) => arr.slice(0, -1));
    setPerQ((p) => { const cur = p[a.q] || { us: 0, them: 0 }; return { ...p, [a.q]: { us: cur.us - ptsOf(a), them: cur.them - themPtsOf(a) } }; });
    flash('Dernière action annulée');
  };
  const resetDraft = () => { setDraft(emptyDraft()); setStage('context'); };
  const swap = (outId: string) => { if (!subSel) { flash('Choisis un remplaçant'); return; } setOnCourt((arr) => arr.map((x) => (x === outId ? subSel : x))); setSubSel(null); flash('Changement effectué'); };

  const scoreUs = Object.values(perQ).reduce((s, x) => s + x.us, 0);
  const scoreThem = Object.values(perQ).reduce((s, x) => s + x.them, 0);

  /* ============================ Rendu ============================ */
  if (screen === 'setup') {
    return (
      <div className="ps-root">
        <div className="setup"><div className="setup-card">
          <div className="setup-head"><div className="kicker">PRISE DE STATS · NOUVEAU MATCH</div><h1>Créer le match</h1></div>
          <div className="setup-body">
            <div className="row">
              <label className="fld"><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label className="fld"><span>Équipe (Mes équipes)</span>
                <select value={teamId} onChange={(e) => { setTeamId(e.target.value); setStarters([]); }}>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="fld"><span>Adversaire</span><input placeholder="Nom de l'adversaire" value={opponent} onChange={(e) => setOpponent(e.target.value)} /></label>
            </div>
            <div>
              <p className="sub-h">5 majeur <span className="cnt">— {starters.length}/5 sélectionnés</span></p>
              <div className="starters">
                {setupRoster.map((p) => (
                  <button key={p.id} type="button" className={`scard ${starters.includes(p.id) ? 'on' : ''}`} onClick={() => toggleStarter(p.id)}>
                    <Av p={p} /><span className="n">{p.num}</span><span>{p.name}<br /><small>{p.pos}</small></span>
                  </button>
                ))}
                {setupRoster.length === 0 && <span className="cnt">Aucun joueur dans cette équipe (ajoute-les dans « Mes équipes »).</span>}
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
            <div className="qtag">Q{q}</div><div className="clk">{fmt(secs)}</div>
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
          <button className={`ghost ${screen === 'box' ? 'on' : ''}`} onClick={() => setScreen((s) => (s === 'box' ? 'live' : 'box'))}>📊 Box-score</button>
          <button className="ghost" onClick={() => setScreen('setup')}>⚙ Match</button>
        </div>
      </header>

      <div className="qstrip">{Object.keys(perQ).map((k) => <span key={k} className={`qbox ${+k === q ? 'cur' : ''}`}>Q{k} <b>{perQ[+k].us}-{perQ[+k].them}</b></span>)}</div>

      {screen === 'box' ? (
        <BoxView actions={actions} roster={roster} />
      ) : (
        <>
          <nav className="steps">{NAV.map((s, i) => <span key={i} className={`step ${i === navIdx ? 'active' : i < navIdx ? 'done' : ''}`}><span className="n">{i + 1}</span>{s}</span>)}</nav>
          <div className="wrap">
            <aside className="pane">
              <h3>Historique des actions</h3>
              <div className="hist">
                {actions.length === 0 && <div className="hist-empty">Aucune action.</div>}
                {actions.slice().reverse().map((a) => { const d = describe(a, find); const p = find(a.playerId); return (
                  <div className="hrow" key={a.id}><span className="htime">{a.clock}</span><span className={`badge ${d.c}`}>{d.b}</span><span className="hbody"><b>{p ? `#${p.num} ${p.name}` : '—'}</b><em>{d.t}</em></span></div>
                ); })}
              </div>
            </aside>

            <section className="pane center">{renderStage()}</section>

            <aside className="pane">
              <h3>Terrain</h3>
              <div className={`courtbox ${liveCourt ? 'live' : ''}`} onClick={courtClick}>
                <Court />
                {actions.filter((a) => a.courtX != null).map((a) => <span key={a.id} className="shotdot" style={{ left: `${(a.courtX as number) * 100}%`, top: `${(a.courtY as number) * 100}%`, background: a.shotResult === 'made' ? 'var(--green)' : 'var(--red)' }} />)}
                {draft.courtX != null && <span className={`mark ${draft.shotResult === 'made' ? 'made' : 'miss'}`} style={{ left: `${draft.courtX * 100}%`, top: `${(draft.courtY as number) * 100}%` }} />}
              </div>
              <p className="courthint">{liveCourt ? "Cliquez sur le terrain (shot chart, sans étiquette)" : "Le terrain s'active à l'étape Où ?"}</p>
            </aside>
          </div>

          <div className="bottom">
            <div className="pane">
              <h3>Joueurs sur le terrain <button className={`ghost ${subSel !== null ? 'on' : ''}`} style={{ padding: '5px 10px' }} onClick={() => setSubSel((s) => (s === null ? '' : null))}>⇄ Changements</button></h3>
              <div className="floor">
                {floor.map((p) => <div key={p.id} className={`fc ${draft.playerId === p.id ? 'active' : ''} ${subSel !== null ? 'swap' : ''}`} onClick={subSel !== null ? () => swap(p.id) : undefined}><Av p={p} /><span className="num">{p.num}</span><span className="nm">{p.name}</span><span className="pos">{p.pos}</span></div>)}
              </div>
              {subSel !== null && (
                <div className="bench">
                  {bench.map((p) => <button key={p.id} className={`bchip ${subSel === p.id ? 'sel' : ''}`} onClick={() => setSubSel(p.id)}><Av p={p} /> #{p.num} {p.name}</button>)}
                  {bench.length === 0 && <span className="hist-empty">Banc vide.</span>}
                  <span className="hist-empty" style={{ width: '100%' }}>Choisis un remplaçant puis clique le joueur à sortir.</span>
                </div>
              )}
            </div>
            <div className="pane">
              <h3>Actions rapides</h3>
              <div className="quick">
                <button className="qbtn" onClick={undo}>↺ Annuler<small>Dernière action</small></button>
                <button className="qbtn" onClick={resetDraft}>🗑 Réinitialiser<small>Action en cours</small></button>
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
      case 'player':
        return <>{head('Joueur', draft.actionType === 'faute-commise' ? 'Qui a commis la faute ?' : "Qui réalise l'action ?")}{players3(draft.playerId, playerPick)}</>;
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
function BoxView({ actions, roster }: { actions: StatA[]; roster: Player[] }) {
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
  const Card = ({ t, v, c }: { t: string; v: any; c?: string }) => <div className="boxcard"><div className="bt-lbl2">{t}</div><div className="bt-val" style={{ color: c || 'var(--txt)' }}>{v}</div></div>;
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
            <td>{tot.pts}</td>
            <td>
              {tot.p2m}/{tot.p2a}
            </td>
            <td>
              {tot.p3m}/{tot.p3a}
            </td>
            <td>
              {tot.ftm}/{tot.fta}
            </td>
            <td>{tot.offReb || 0}</td>
            <td>{tot.defReb || 0}</td>
            <td>{(tot.offReb || 0) + (tot.defReb || 0)}</td>
            <td>{tot.ast}</td>
            <td>{tot.stl}</td>
            <td>{tot.blk}</td>
            <td>{tot.to}</td>
            <td>{tot.pf}</td>
          </tr>
        )}
      </tbody>
    </table>

      <Sec t="Possessions & stops" />
      <div className="cardrow"><Card t="Possessions offensives" v={A.offPoss} /><Card t="Possessions défensives" v={A.defPoss} /><Card t="Stops d'affilé (max)" v={A.maxStreak} c="var(--green)" /><Card t="Stops d'affilé (en cours)" v={A.curStreak} c="var(--green)" /></div>
      <div className="tip" style={{ marginTop: 8 }}>Possession = de la récupération du ballon jusqu'à ce que l'adversaire le récupère. Un « stop » = possession défensive sans point adverse encaissé.</div>

      <Sec t="Box-score des temps forts par joueur (points)" />
      {A.tfUsed.length ? (
        <div style={{ overflow: 'auto' }}><table><thead><tr><th className="l">Joueur</th>{A.tfUsed.map((t) => <th key={t.id}>{t.label}</th>)}<th>Tot.</th></tr></thead>
          <tbody>{box.map((l: any) => { const row = A.tfMatrix[l.p.id] || {}; const tt = A.tfUsed.reduce((s, t) => s + (row[t.id] || 0), 0); return <tr key={l.p.id}><td className="l">#{l.p.num} {l.p.name}</td>{A.tfUsed.map((t) => <td key={t.id}>{row[t.id] || 0}</td>)}<td><b>{tt}</b></td></tr>; })}</tbody></table></div>
      ) : <div className="tip">Aucune action rattachée à un temps fort.</div>}

      <Sec t="Analyse des 5 sur le terrain (lineups)" />
      {A.lineups.length ? (
        <table><thead><tr><th className="l">5 sur le terrain</th><th>Actions</th><th>Pts pour</th><th>Pts contre</th><th>+/-</th></tr></thead>
          <tbody>{A.lineups.slice().sort((a: any, b: any) => (b.us - b.them) - (a.us - a.them)).map((L: any, i: number) => { const names = L.ids.map((id: string) => { const p = roster.find((x) => x.id === id); return p ? '#' + p.num : '?'; }).join(' '); const diff = L.us - L.them; return <tr key={i}><td className="l">{names}</td><td>{L.n}</td><td>{L.us}</td><td>{L.them}</td><td><b style={{ color: diff >= 0 ? 'var(--green)' : 'var(--red)' }}>{diff >= 0 ? '+' : ''}{diff}</b></td></tr>; })}</tbody></table>
      ) : <div className="tip">Pas encore de données de lineup.</div>}
    </div>
  );
}

/* ============================ Terrain ============================ */
function Court() {
  return (
    <svg viewBox="0 0 400 280" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      <defs><linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#caa06a" /><stop offset="1" stopColor="#b07f3e" /></linearGradient></defs>
      <rect width="400" height="280" fill="url(#wood)" />
      <g stroke="#fff" strokeWidth="2" fill="none" opacity=".92">
        <rect x="8" y="8" width="384" height="264" rx="4" />
        <rect x="150" y="8" width="100" height="104" fill="rgba(158,27,50,.40)" />
        <circle cx="200" cy="112" r="36" /><path d="M40 8 L40 64 A170 170 0 0 0 360 64 L360 8" />
        <circle cx="200" cy="34" r="9" stroke="#ff5a3c" strokeWidth="3" /><line x1="172" y1="20" x2="228" y2="20" strokeWidth="3" />
        <circle cx="200" cy="272" r="30" />
      </g>
    </svg>
  );
}

/* ============================ Styles ============================ */
function Style() {
  return (
    <style jsx global>{`
      .ps-root{--bg:#0a0e1a;--panel:#10131f;--panel2:#171b29;--card:#1b2030;--border:#2a3142;--txt:#eef1f7;--mute:#8a93a8;--bordeaux:#9e1b32;--bordeaux2:#c12a44;--gold:#d9a441;--green:#36b37e;--red:#e5484d;--blue:#3f7bd1;--orange:#d9772f;
        min-height:100vh;background:radial-gradient(1200px 600px at 50% -10%,#141a2b 0%,var(--bg) 60%);color:var(--txt);font-family:'Roboto','Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column}
      .ps-root *{box-sizing:border-box}
      .ps-root button{font:inherit;cursor:pointer}
      .ps-root h1,.ps-root h2,.ps-root h3,.wztitle,.num,.clk,.qtag{font-family:'Oswald','Roboto',sans-serif}
      /* setup */
      .setup{flex:1;display:grid;place-items:center;padding:30px}
      .setup-card{width:min(820px,100%);background:linear-gradient(180deg,#0e1730,#0a1224);border:1px solid var(--border);border-radius:16px;overflow:hidden;box-shadow:0 30px 80px -20px #000}
      .setup-head{padding:18px 22px;border-bottom:1px solid var(--border);background:linear-gradient(90deg,rgba(158,27,50,.25),transparent)}
      .kicker{font-size:11px;letter-spacing:.16em;color:var(--gold);font-weight:700}.setup-head h1{font-size:23px;margin:4px 0 0}
      .setup-body{padding:20px 22px;display:flex;flex-direction:column;gap:18px}
      .row{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
      .fld{display:flex;flex-direction:column;gap:6px;font-size:12px;color:var(--mute)}
      .fld input,.fld select{background:#0a1224;border:1px solid var(--border);border-radius:9px;color:var(--txt);padding:10px 11px;font-size:14px}
      .sub-h{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--gold);margin:0}.cnt{font-size:12px;color:var(--mute)}
      .starters{display:flex;gap:8px;flex-wrap:wrap}
      .scard{display:flex;align-items:center;gap:9px;padding:9px 11px;background:var(--card);border:1px solid var(--border);border-radius:11px;color:var(--txt)}
      .scard.on{background:#1f7a44;border-color:#25a05a}.scard .n{font-weight:700;font-size:17px;width:22px;text-align:center}.scard small{color:var(--gold)}.scard.on small{color:#cdeede}
      .setup-foot{display:flex;justify-content:flex-end;padding:16px 22px;border-top:1px solid var(--border);background:#0e1730}
      .btn{padding:11px 18px;border-radius:10px;border:1px solid var(--border);background:var(--panel2);color:var(--txt)}
      .btn.primary{background:var(--bordeaux);border-color:var(--bordeaux2);font-weight:700}.btn.primary:disabled{opacity:.45;cursor:not-allowed}
      /* header */
      .h{display:flex;align-items:center;gap:16px;padding:10px 18px;border-bottom:1px solid var(--border);background:#0c1020}
      .h-l{display:flex;align-items:center;gap:11px;min-width:200px}.h-ic{width:34px;height:34px;border-radius:8px;background:var(--panel2);display:grid;place-items:center;color:var(--gold)}
      .h-tt{font-size:16px;font-weight:700}.h-sub{font-size:11px;color:var(--mute)}
      .h-c{flex:1;display:flex;align-items:center;justify-content:center;gap:14px}
      .team{display:flex;align-items:center;gap:9px;font-weight:700;font-size:14px}.logo{width:28px;height:28px;border-radius:50%;background:var(--panel2);display:grid;place-items:center;font-size:11px;color:var(--gold)}
      .score{font-weight:700;font-size:27px;min-width:64px;text-align:center;border-radius:10px;padding:5px 0}.score.us{background:var(--bordeaux);color:#fff}
      .score.them{background:#141a2b;border:1px solid var(--border);display:flex;align-items:center;gap:8px;justify-content:center}
      .clockbox{display:flex;flex-direction:column;align-items:center;gap:3px}.clk{font-size:20px;font-weight:700}.qtag{font-size:11px;color:var(--gold)}
      .clk-ctrl{display:flex;gap:4px}.mini{width:24px;height:22px;border-radius:6px;border:1px solid var(--border);background:#222a3a;color:var(--txt);font-size:11px}.mini.play{background:var(--bordeaux);border-color:var(--bordeaux2)}
      .h-r{min-width:160px;display:flex;justify-content:flex-end;gap:8px}
      .ghost{display:flex;align-items:center;gap:7px;background:var(--panel2);border:1px solid var(--border);color:var(--txt);border-radius:9px;padding:9px 12px;font-size:12.5px}.ghost.on{border-color:var(--gold);color:var(--gold)}
      .qstrip{display:flex;gap:6px;justify-content:center;padding:7px 10px;background:#0b0f1d;border-bottom:1px solid var(--border);flex-wrap:wrap}
      .qbox{font-size:11px;color:var(--mute);background:var(--card);border:1px solid var(--border);border-radius:7px;padding:3px 9px}.qbox b{color:var(--txt)}.qbox.cur{border-color:var(--gold)}
      /* steps */
      .steps{display:flex;gap:4px;padding:9px 16px;background:#0c1020;border-bottom:1px solid var(--border);overflow-x:auto}
      .step{display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:20px;white-space:nowrap;color:var(--mute);font-size:12px}
      .step .n{width:19px;height:19px;border-radius:50%;border:1px solid currentColor;display:grid;place-items:center;font-size:10px}
      .step.done{color:var(--gold)}.step.active{color:#fff;background:var(--bordeaux)}.step.active .n{background:#fff;color:var(--bordeaux);border-color:#fff}
      /* layout */
      .wrap{flex:1;display:grid;grid-template-columns:290px 1fr 380px;gap:12px;padding:12px 16px;min-height:0}
      .pane{background:var(--panel);border:1px solid var(--border);border-radius:13px;padding:13px;display:flex;flex-direction:column;min-height:0}
      .pane h3{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--mute);margin:0 0 10px;display:flex;justify-content:space-between;align-items:center}
      .center{padding:24px 28px;gap:14px;overflow:auto}
      .hist{flex:1;overflow:auto;display:flex;flex-direction:column;gap:6px}
      .hrow{display:flex;align-items:center;gap:8px;padding:7px 8px;background:var(--card);border:1px solid var(--border);border-radius:9px}
      .htime{font-size:11px;color:var(--mute);width:36px}
      .badge{font-size:9px;font-weight:800;padding:2px 6px;border-radius:5px}
      .b-made{background:#1f7a44;color:#fff}.b-miss{background:var(--red);color:#fff}.b-ast{background:#1f7a44;color:#fff}.b-stl{background:var(--blue);color:#fff}.b-def{background:var(--blue);color:#fff}.b-to{background:var(--gold);color:#1a1a1a}.b-foul{background:#7a4fb5;color:#fff}.b-neutral{background:#3a4256;color:#fff}.b-reb{background:var(--orange);color:#fff}.b-ft{background:#1f7a44;color:#fff}
      .hbody{display:flex;flex-direction:column;min-width:0}.hbody b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hbody em{font-size:10.5px;color:var(--mute);font-style:normal}
      .hist-empty{color:var(--mute);font-size:12.5px;padding:8px 2px}
      .wzhead{text-align:center}.wzstep{font-size:11px;letter-spacing:.14em;color:var(--bordeaux2);font-weight:700}.wztitle{font-size:24px;font-weight:700;margin:5px 0}.wzsub{color:var(--mute);font-size:13px;margin:4px 0}
      .grid{display:grid;gap:10px}.c2{grid-template-columns:repeat(2,1fr)}.c3{grid-template-columns:repeat(3,1fr)}
      .bt{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:18px 10px;background:var(--card);border:1px solid var(--border);border-radius:12px;color:var(--txt);transition:.12s}
      .bt:hover{border-color:#3a4459;transform:translateY(-1px)}.bt .ic{font-size:24px;color:var(--gold)}.bt .lbl{font-size:13px;font-weight:600;text-align:center}.bt .mut{color:var(--mute);font-size:10px}
      .bt.active{background:linear-gradient(180deg,var(--bordeaux2),var(--bordeaux));border-color:var(--bordeaux2);color:#fff}.bt.active .ic{color:#fff}
      .grid.big .bt{padding:46px 10px}.grid.big .bt .ic{font-size:34px}.bt.def.active{background:linear-gradient(180deg,#3f7bd1,#27518c);border-color:#3f7bd1}
      .pl{display:flex;flex-direction:column;align-items:center;gap:3px;padding:14px 8px;background:var(--card);border:1px solid var(--border);border-radius:11px;color:var(--txt)}
      .pl:hover{border-color:#3a4459}.pl.active{background:var(--bordeaux);border-color:var(--bordeaux2);color:#fff}
      .pl .num{font-weight:700;font-size:20px}.pl .nm{font-size:12px}.pl .pos{font-size:10.5px;color:var(--gold);font-weight:700}.pl.active .pos{color:#fff}.pl.sm{padding:9px 6px}.pl.sm .num{font-size:15px}
      .av{width:26px;height:26px;border-radius:50%;background:#2a3142;display:inline-grid;place-items:center;font-size:9.5px;font-weight:700;color:var(--gold);object-fit:cover;margin-bottom:3px}
      .av.none{color:var(--mute);background:#1b2030}.bchip .av{width:18px;height:18px;margin:0 4px 0 0;vertical-align:middle}.fc .av{width:24px;height:24px}.scard .av{width:30px;height:30px;margin:0}
      .chip{padding:13px 10px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--txt);font-size:13px;font-weight:600}.chip:hover{border-color:#3a4459}.chip.active{background:var(--bordeaux);border-color:var(--bordeaux2);color:#fff}
      .seg{display:flex;gap:6px}.segb{flex:1;padding:14px;background:var(--card);border:1px solid var(--border);border-radius:9px;color:var(--txt);font-weight:700;font-size:14px}.segb.active{background:var(--bordeaux);border-color:var(--bordeaux2);color:#fff}
      .res{display:block;width:100%;padding:15px;border-radius:9px;border:1px solid var(--border);background:var(--card);color:var(--txt);font-weight:700;font-size:15px;margin-bottom:8px}
      .res.made:hover{background:#1f7a44;border-color:#25a05a;color:#fff}.res.miss:hover{background:var(--bordeaux);border-color:var(--bordeaux2);color:#fff}
      .sublbl{color:var(--mute);font-size:12px;margin:8px 0 2px;text-align:center}.tip{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;color:var(--mute);font-size:12.5px}
      .courtbox{position:relative;width:100%;aspect-ratio:16/11;border-radius:10px;overflow:hidden;border:1px solid var(--border)}
      .courtbox.live{box-shadow:0 0 0 2px var(--gold);cursor:crosshair}.courtbox:not(.live){opacity:.9}
      .mark{position:absolute;width:15px;height:15px;transform:translate(-50%,-50%);border-radius:50%;border:2px solid #fff;pointer-events:none}.mark.made{background:var(--green)}.mark.miss{background:var(--red)}
      .shotdot{position:absolute;width:9px;height:9px;border-radius:50%;transform:translate(-50%,-50%);border:1px solid rgba(0,0,0,.4);pointer-events:none}
      .courthint{color:var(--mute);font-size:11.5px;margin:8px 0 0;text-align:center}
      .bottom{display:grid;grid-template-columns:1fr 330px;gap:12px;padding:0 16px 12px}
      .floor{display:flex;gap:8px;flex-wrap:wrap}
      .fc{display:flex;flex-direction:column;align-items:center;gap:1px;padding:8px 14px;background:var(--card);border:1px solid var(--border);border-radius:10px;min-width:78px}
      .fc.active{background:var(--bordeaux);border-color:var(--bordeaux2)}.fc.swap{cursor:pointer;border-color:var(--gold)}
      .fc .num{font-weight:700;font-size:18px}.fc .nm{font-size:11px}.fc .pos{font-size:10px;color:var(--gold)}.fc.active .pos{color:#fff}
      .bench{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px dashed var(--border)}
      .bchip{padding:7px 11px;border-radius:9px;border:1px solid var(--border);background:var(--panel2);color:var(--txt);font-size:12px}.bchip.sel{border-color:var(--gold);color:var(--gold)}
      .quick{display:flex;gap:8px}.qbtn{flex:1;display:flex;flex-direction:column;gap:2px;align-items:flex-start;padding:11px 13px;background:var(--card);border:1px solid var(--border);border-radius:10px;color:var(--txt);font-size:13px;font-weight:700}.qbtn small{font-weight:400;color:var(--mute);font-size:10.5px}.qbtn:hover{border-color:var(--gold)}
      .box{flex:1;padding:16px;overflow:auto}
      .box table{width:100%;border-collapse:collapse;font-size:13px}.box th,.box td{padding:8px 9px;text-align:center;border-bottom:1px solid #20273a}.box th{color:var(--gold);font-weight:600;text-transform:uppercase;font-size:11px}.box td.l,.box th.l{text-align:left}
      .box tr.tot td{border-top:2px solid var(--border);font-weight:700;background:#0e1424}
      .boxsec{color:var(--gold);text-transform:uppercase;font-size:13px;letter-spacing:.05em;margin:24px 0 10px;font-weight:700}
      .cardrow{display:flex;gap:10px;flex-wrap:wrap}.boxcard{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 14px;min-width:155px}.bt-lbl2{color:var(--mute);font-size:11px}.bt-val{font-size:22px;font-weight:700}
      .toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#000;border:1px solid var(--gold);color:var(--gold);padding:10px 18px;border-radius:10px;font-size:13px;z-index:50}
      @media(max-width:1200px){.wrap{grid-template-columns:240px 1fr 320px}.bottom{grid-template-columns:1fr}}
      @media(max-width:920px){.wrap{grid-template-columns:1fr}.row{grid-template-columns:1fr 1fr}}
    `}</style>
  );
}