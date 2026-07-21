'use client';

/* ============================================================================
 * ActionClipsModal — popup clips COMMUNE et réutilisable (§25)
 * ----------------------------------------------------------------------------
 * Une seule popup pour toute l'application. Pour ce bloc elle est branchée sur :
 * Historique, Timeline, Matrice, Boxscore, Shot Chart. Les blocs suivants
 * (fiche équipe, fiche joueur, playbook, recherche) la réutiliseront telle quelle.
 *
 * UNE SEULE logique de lecture bornée, réutilisée partout (applyBoundedPlayback) :
 *   - démarre à (possessionStart ?? clipStart ?? videoTime) ;
 *   - s'arrête automatiquement à (possessionEnd ?? clipEnd) ;
 *   - ne lit jamais le reste du match ;
 *   - relançable, navigable précédent/suivant.
 * La popup possède son propre élément <video> (elle doit rester autonome et
 * réutilisable hors de la prise de stats), mais il lit la MÊME source (videoUrl)
 * entre les MÊMES bornes que le lecteur principal. Ce qui est unique, c'est la
 * logique de bornage, pas le nombre d'éléments <video> de l'application.
 *
 * Aucune dépendance à PriseStatsPro : tout arrive par props.
 * ========================================================================== */

import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type VideoSyncState, NATIVE_SYNC, resolveActionClipBounds } from '@/lib/video-sync';

/** Forme d'une action lisible en clip (compatible LiveMatchAction / StatA). */
export type ClipAction = {
  id?: string;
  matchId?: string | null;
  matchLabel?: string | null;
  date?: string | null;
  opponent?: string | null;
  q?: number;
  clock?: string;
  context?: string;
  playbookId?: string | null;
  systemeSlot?: string | null;
  systemeId?: string | null;
  systemeName?: string | null;
  systemeJeu?: string | null;
  tempsFort?: string | null;
  playerId?: string | null;
  opponentPlayerId?: string | null;
  opponentPlayerName?: string | null;
  opponentPlayerNumber?: string | null;
  actionType?: string | null;
  shotType?: string | null;
  shotResult?: string | null;
  zone?: string | null;
  courtX?: number | null;
  courtY?: number | null;
  clipStart?: number | null;
  clipEnd?: number | null;
  videoTime?: number | null;
  possessionStart?: number | null;
  possessionEnd?: number | null;
};

export type ActionClipsModalProps = {
  open: boolean;
  actions: ClipAction[];
  title: string;
  videoUrl?: string | null;
  /** Synchro vidéo du match auquel appartiennent les clips (défaut : native). */
  sync?: VideoSyncState;
  startIndex?: number;
  onClose: () => void;
  onAddToMontage?: (action: ClipAction) => void;
  onSaveNote?: (action: ClipAction, note: string) => void;
  onTrim?: (action: ClipAction, clipStart: number, clipEnd: number) => void;
  /** Fournit note + bornes rognées déjà enregistrées pour une action (préchargement). */
  getEdit?: (action: ClipAction) => { note?: string; trimStart?: number | null; trimEnd?: number | null } | undefined;
  describe?: (action: ClipAction) => string;
  playerName?: (id: string | null | undefined) => string | undefined;
  tempsFortLabel?: (id: string | null | undefined) => string | undefined;
};

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s) % 60).padStart(2, '0')}`;

const periodLabel = (q?: number) => (q == null ? '' : q <= 4 ? `Q${q}` : `OT${q - 4}`);

const systemLabelOf = (a?: ClipAction): string =>
  (a?.systemeName ?? a?.systemeSlot ?? a?.systemeJeu ?? '') as string;

export default function ActionClipsModal(props: ActionClipsModalProps) {
  const { open, actions, title, videoUrl, onClose, onAddToMontage, onSaveNote, onTrim } = props;
  const [index, setIndex] = useState(props.startIndex ?? 0);
  const [full, setFull] = useState(false);
  const [note, setNote] = useState('');
  const [draw, setDraw] = useState(false);
  const [trimStart, setTrimStart] = useState<number | null>(null);
  const [trimEnd, setTrimEnd] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const drawing = useRef(false);

  const current: ClipAction | undefined = actions[index];

  // Synchro du match : convertit les temps bruts de codage (source) en position
  // réelle dans la vidéo (média). Défaut = native (aucun décalage).
  const sync = props.sync ?? NATIVE_SYNC;
  // Bornes DÉJÀ synchronisées d'une action (jamais de lecture directe de
  // clipStart/clipEnd sans passer par la synchro).
  const syncedStartOf = useCallback(
    (a?: ClipAction): number | null => resolveActionClipBounds(a, sync).start,
    [sync]
  );
  const syncedEndOf = useCallback(
    (a?: ClipAction): number | null => resolveActionClipBounds(a, sync).end,
    [sync]
  );

  useEffect(() => {
    if (!open) return;
    setIndex(Math.min(props.startIndex ?? 0, Math.max(0, actions.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.startIndex, actions.length]);

  useEffect(() => {
    const edit = current ? props.getEdit?.(current) : undefined;
    setNote(edit?.note ?? '');
    setTrimStart(edit?.trimStart ?? syncedStartOf(current));
    setTrimEnd(edit?.trimEnd ?? syncedEndOf(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, current?.id, sync]);

  const applyBoundedPlayback = useCallback(() => {
    const v = videoRef.current;
    const start = syncedStartOf(current);
    const end = syncedEndOf(current);
    stopRef.current?.();
    stopRef.current = null;
    if (!v || start == null) return;
    try { v.currentTime = Math.max(0, start); v.play().catch(() => {}); } catch { /* noop */ }
    if (end != null) {
      const onTick = () => {
        if (v.currentTime >= end) { v.pause(); v.removeEventListener('timeupdate', onTick); stopRef.current = null; }
      };
      v.addEventListener('timeupdate', onTick);
      stopRef.current = () => v.removeEventListener('timeupdate', onTick);
    }
  }, [current, syncedStartOf, syncedEndOf]);

  useEffect(() => {
    if (!open || !current) return;
    applyBoundedPlayback();
    return () => { stopRef.current?.(); stopRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, current?.id]);

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.max(0, Math.min(actions.length - 1, i + delta)));
  }, [actions.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'r' || e.key === 'R') applyBoundedPlayback();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, go, onClose, applyBoundedPlayback]);

  const canvasPos = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const onDrawDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!draw) return;
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = canvasPos(e);
    ctx.strokeStyle = '#D4A24C'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
  };
  const onDrawMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!draw || !drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const { x, y } = canvasPos(e);
    ctx.lineTo(x, y); ctx.stroke();
  };
  const onDrawUp = () => { drawing.current = false; };
  const clearDraw = () => {
    const c = canvasRef.current; if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  };

  const label = useMemo(() => {
    if (!current) return '';
    if (props.describe) return props.describe(current);
    return [`${periodLabel(current.q)} ${current.clock ?? ''}`.trim(), systemLabelOf(current)].filter(Boolean).join(' · ');
  }, [current, props]);

  const whoLabel = (a: ClipAction): string => {
    if (a.opponentPlayerName) return `#${a.opponentPlayerNumber ?? ''} ${a.opponentPlayerName}`.trim();
    return props.playerName?.(a.playerId) ?? (a.context === 'defense' ? 'Adversaire' : '—');
  };

  const markTrim = (which: 'start' | 'end') => {
    const v = videoRef.current; if (!v) return;
    const t = Math.max(0, Math.round(v.currentTime));
    if (which === 'start') setTrimStart(t); else setTrimEnd(t);
  };
  const saveTrim = () => {
    if (current && onTrim && trimStart != null && trimEnd != null && trimEnd > trimStart) {
      onTrim(current, trimStart, trimEnd);
    }
  };

  if (!open || actions.length === 0 || !current) return null;
  const hasVideo = !!videoUrl;
  const cur = current;

  const Info = ({ k, v }: { k: string; v: ReactNode }) =>
    (v == null || v === '') ? null : <div className="acm-info"><span>{k}</span><b>{v}</b></div>;

  return (
    <div className="acm-backdrop" onClick={onClose}>
      <div className={`acm-card ${full ? 'acm-full' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="acm-head">
          <b>🎬 {title}</b>
          <span className="acm-count">{index + 1} / {actions.length}</span>
          <div className="acm-head-btns">
            <button onClick={() => setFull((f) => !f)} title="Plein écran">{full ? '🗗' : '⛶'}</button>
            <button onClick={onClose} title="Fermer">×</button>
          </div>
        </div>

        <div className="acm-body">
          <div className="acm-title">{label}</div>

          <div className="acm-videowrap">
            {hasVideo ? (
              <video ref={videoRef} className="acm-video" src={videoUrl!} controls playsInline />
            ) : (
              <div className="acm-novideo">
                {syncedStartOf(cur) != null
                  ? `Clip enregistré · ${fmt(syncedStartOf(cur)!)}${syncedEndOf(cur) != null ? ` → ${fmt(syncedEndOf(cur)!)}` : ''}`
                  : 'Repère vidéo indisponible'}
              </div>
            )}
            {hasVideo && draw && (
              <canvas
                ref={canvasRef}
                width={640}
                height={360}
                className="acm-canvas"
                onPointerDown={onDrawDown}
                onPointerMove={onDrawMove}
                onPointerUp={onDrawUp}
                onPointerLeave={onDrawUp}
              />
            )}
          </div>

          <div className="acm-nav">
            <button disabled={index === 0} onClick={() => go(-1)}>← Précédent</button>
            <button onClick={applyBoundedPlayback}>↻ Rejouer</button>
            <button disabled={index === actions.length - 1} onClick={() => go(1)}>Suivant →</button>
          </div>

          <div className="acm-infos">
            <Info k="Match" v={cur.matchLabel} />
            <Info k="Date" v={cur.date} />
            <Info k="Adversaire" v={cur.opponent} />
            <Info k="Quart-temps" v={periodLabel(cur.q)} />
            <Info k="Chrono" v={cur.clock} />
            <Info k="Contexte" v={cur.context === 'defense' ? 'Défense' : cur.context === 'attaque' ? 'Attaque' : cur.context} />
            <Info k="Système" v={systemLabelOf(cur)} />
            <Info k="Temps fort" v={props.tempsFortLabel?.(cur.tempsFort) ?? cur.tempsFort} />
            <Info k="Joueur" v={whoLabel(cur)} />
            <Info k="Action" v={cur.actionType} />
            <Info k="Résultat" v={cur.shotResult === 'made' ? 'Marqué' : cur.shotResult === 'missed' ? 'Raté' : cur.shotResult} />
            <Info k="Zone" v={cur.zone} />
            <Info k="Clip début" v={syncedStartOf(cur) != null ? fmt(syncedStartOf(cur)!) : null} />
            <Info k="Clip fin" v={syncedEndOf(cur) != null ? fmt(syncedEndOf(cur)!) : null} />
          </div>

          <div className="acm-tools">
            {onAddToMontage && <button onClick={() => onAddToMontage(cur)}>⭐ Ajouter au montage</button>}
            <button className={draw ? 'on' : ''} onClick={() => setDraw((d) => !d)}>✏ Dessiner</button>
            {draw && <button onClick={clearDraw}>🧽 Effacer</button>}
          </div>

          {hasVideo && (
            <div className="acm-trim">
              <button onClick={() => markTrim('start')}>⏱ Début = {trimStart != null ? fmt(trimStart) : '—'}</button>
              <button onClick={() => markTrim('end')}>⏱ Fin = {trimEnd != null ? fmt(trimEnd) : '—'}</button>
              {onTrim && <button className="acm-trim-save" disabled={trimStart == null || trimEnd == null || (trimEnd ?? 0) <= (trimStart ?? 0)} onClick={saveTrim}>✂ Enregistrer le rognage</button>}
            </div>
          )}

          <textarea className="acm-note" placeholder="Note coach / commentaire…" value={note} onChange={(e) => setNote(e.target.value)} />
          {onSaveNote && <button className="acm-note-save" onClick={() => onSaveNote(cur, note)}>💾 Enregistrer la note</button>}
        </div>
      </div>

      <style>{`
        .acm-backdrop { position: fixed; inset: 0; z-index: 4000; background: rgba(4,7,15,.72); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .acm-card { width: min(820px, 96vw); max-height: 92vh; overflow: auto; background: #12131c; color: #eef1f7; border: 1px solid #2a3142; border-radius: 16px; box-shadow: 0 24px 60px -20px rgba(0,0,0,.7); }
        .acm-card.acm-full { position: fixed; inset: 12px; width: auto; max-height: none; }
        .acm-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid #2a3142; position: sticky; top: 0; background: #12131c; }
        .acm-head b { font-size: 14px; }
        .acm-count { font-size: 12px; color: #8a93a8; }
        .acm-head-btns { margin-left: auto; display: flex; gap: 6px; }
        .acm-head-btns button { width: 30px; height: 30px; border-radius: 8px; border: 1px solid #2a3142; background: #171b29; color: #eef1f7; font-size: 15px; cursor: pointer; }
        .acm-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 12px; }
        .acm-title { font-size: 13px; font-weight: 800; color: #D4A24C; }
        .acm-videowrap { position: relative; }
        .acm-video { width: 100%; max-height: 58vh; background: #000; border-radius: 10px; display: block; }
        .acm-card.acm-full .acm-video { max-height: calc(100vh - 320px); }
        .acm-canvas { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
        .acm-novideo { padding: 28px; text-align: center; color: #8a93a8; background: #0c0f1a; border: 1px dashed #2a3142; border-radius: 10px; font-weight: 700; }
        .acm-nav { display: flex; gap: 8px; }
        .acm-nav button { flex: 1; border: 1px solid #2a3142; background: #171b29; color: #eef1f7; border-radius: 9px; padding: 9px; font-size: 12.5px; font-weight: 800; cursor: pointer; }
        .acm-nav button:disabled { opacity: .4; cursor: not-allowed; }
        .acm-infos { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; background: #0c0f1a; border: 1px solid #2a3142; border-radius: 10px; padding: 10px; }
        .acm-info { display: flex; flex-direction: column; gap: 1px; }
        .acm-info span { font-size: 10px; color: #8a93a8; text-transform: uppercase; letter-spacing: .04em; }
        .acm-info b { font-size: 12.5px; }
        .acm-tools, .acm-trim { display: flex; flex-wrap: wrap; gap: 6px; }
        .acm-tools button, .acm-trim button { border: 1px solid #2a3142; background: #171b29; color: #eef1f7; border-radius: 8px; padding: 7px 11px; font-size: 11.5px; font-weight: 800; cursor: pointer; }
        .acm-tools button.on { border-color: #D4A24C; color: #D4A24C; }
        .acm-trim-save { border-color: #D4A24C !important; color: #D4A24C !important; }
        .acm-trim-save:disabled { opacity: .45; cursor: not-allowed; }
        .acm-note { width: 100%; min-height: 56px; resize: vertical; border: 1px solid #2a3142; background: #0c0f1a; color: #eef1f7; border-radius: 9px; padding: 9px 11px; font: inherit; font-size: 12.5px; }
        .acm-note-save { align-self: flex-start; border: 1px solid #2a3142; background: #171b29; color: #eef1f7; border-radius: 8px; padding: 7px 12px; font-size: 11.5px; font-weight: 800; cursor: pointer; }
        @media (max-width: 640px) { .acm-card { width: 100vw; height: 100vh; max-height: none; border-radius: 0; } }
      `}</style>
    </div>
  );
}