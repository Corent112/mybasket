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
import { getLocalMatchVideoUrl } from '@/lib/local-video-registry';
import useLocalMatchVideoVersion from '@/hooks/useLocalMatchVideoVersion';
import { restoreMatchVideoForClip } from '@/lib/video/match-video-resolver';
import LocalMatchVideoButton from '@/components/video/LocalMatchVideoButton';

/** Forme d'une action lisible en clip (compatible LiveMatchAction / StatA). */
export type ClipAction = {
  id?: string;
  matchId?: string | null;
  match_id?: string | null;
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
  /** Équipe utilisée pour résoudre la copie vidéo locale de cet ordinateur. */
  teamId?: string;
  videoUrl?: string | null;
  /** Source vidéo spécifique à l'action (utile quand une liste contient plusieurs matchs). */
  videoUrlForAction?: (action: ClipAction) => string | null;
  /** Synchro vidéo du match auquel appartiennent les clips (défaut : native). */
  sync?: VideoSyncState;
  /** Synchro spécifique à l'action / au match source. */
  syncForAction?: (action: ClipAction) => VideoSyncState;
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

const fmt = (s: number) => {
  const safe = Math.max(0, Number.isFinite(s) ? s : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
};

const periodLabel = (q?: number) => (q == null ? '' : q <= 4 ? `Q${q}` : `OT${q - 4}`);

const systemLabelOf = (a?: ClipAction): string =>
  (a?.systemeName ?? a?.systemeSlot ?? a?.systemeJeu ?? '') as string;

export default function ActionClipsModal(props: ActionClipsModalProps) {
  useLocalMatchVideoVersion();
  const { open, actions, title, videoUrl, onClose, onAddToMontage, onSaveNote, onTrim } = props;
  const [index, setIndex] = useState(props.startIndex ?? 0);
  const [full, setFull] = useState(false);
  const [note, setNote] = useState('');
  const [draw, setDraw] = useState(false);
  const [trimStart, setTrimStart] = useState<number | null>(null);
  const [trimEnd, setTrimEnd] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [playhead, setPlayhead] = useState(0);
  const [precisionZoom, setPrecisionZoom] = useState<2 | 5 | 10>(5);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const drawing = useRef(false);

  const current: ClipAction | undefined = actions[index];

  // Une liste peut contenir des actions provenant de plusieurs matchs.
  // Priorité absolue à la copie LOCALE de cet ordinateur ; Google Drive / URL
  // distante reste un fallback sans être cassé.
  const currentMatchId = current
    ? String(current.matchId ?? current.match_id ?? '')
    : '';
  const localVideoUrl = getLocalMatchVideoUrl(currentMatchId);
  const currentVideoUrl = current
    ? (localVideoUrl ?? props.videoUrlForAction?.(current) ?? videoUrl ?? null)
    : (videoUrl ?? null);

  useEffect(() => {
    if (!open || !currentMatchId || !props.teamId || localVideoUrl) return;
    void restoreMatchVideoForClip(currentMatchId, props.teamId).catch(() => null);
  }, [open, currentMatchId, props.teamId, localVideoUrl]);

  // Synchro du match : convertit les temps bruts de codage (source) en position
  // réelle dans la vidéo (média). Défaut = native (aucun décalage).
  const sync = current
    ? (props.syncForAction?.(current) ?? props.sync ?? NATIVE_SYNC)
    : (props.sync ?? NATIVE_SYNC);
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

  // Les bornes rognées sont déjà exprimées dans le temps MEDIA de la vidéo.
  // Elles doivent donc prendre la priorité sur les bornes automatiques de l'action
  // et ne doivent surtout pas repasser dans resolveActionClipBounds (sinon la
  // synchronisation serait appliquée une deuxième fois).
  const savedEditOf = useCallback(
    (a?: ClipAction) => (a ? props.getEdit?.(a) : undefined),
    [props.getEdit]
  );
  const effectiveStartOf = useCallback(
    (a?: ClipAction): number | null => savedEditOf(a)?.trimStart ?? syncedStartOf(a),
    [savedEditOf, syncedStartOf]
  );
  const effectiveEndOf = useCallback(
    (a?: ClipAction): number | null => savedEditOf(a)?.trimEnd ?? syncedEndOf(a),
    [savedEditOf, syncedEndOf]
  );

  useEffect(() => {
    if (!open) return;
    setIndex(Math.min(props.startIndex ?? 0, Math.max(0, actions.length - 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, props.startIndex, actions.length]);

  useEffect(() => {
    if (!open) return;
    const edit = current ? savedEditOf(current) : undefined;
    setNote(edit?.note ?? '');
    setTrimStart(edit?.trimStart ?? syncedStartOf(current));
    setTrimEnd(edit?.trimEnd ?? syncedEndOf(current));
  }, [open, index, current?.id, sync, savedEditOf, syncedStartOf, syncedEndOf]);

  const applyBoundedPlayback = useCallback(() => {
    const v = videoRef.current;
    const start = effectiveStartOf(current);
    const end = effectiveEndOf(current);
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
  }, [current, effectiveStartOf, effectiveEndOf]);

  useEffect(() => {
    if (!open || !current) return;
    applyBoundedPlayback();
    return () => { stopRef.current?.(); stopRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index, current?.id, currentVideoUrl, sync]);

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.max(0, Math.min(actions.length - 1, i + delta)));
  }, [actions.length]);

  const seekTo = useCallback((time: number) => {
    const v = videoRef.current;
    const max = videoDuration > 0 ? videoDuration : Number.POSITIVE_INFINITY;
    const next = Math.max(0, Math.min(time, max));
    setPlayhead(next);
    if (v) { try { v.currentTime = next; } catch { /* noop */ } }
  }, [videoDuration]);

  const nudge = useCallback((delta: number) => {
    const v = videoRef.current;
    seekTo((v?.currentTime ?? playhead) + delta);
  }, [playhead, seekTo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT')) return;
      if (e.key === 'Escape') onClose();
      else if (e.key === ' ') { e.preventDefault(); const v = videoRef.current; if (v) v.paused ? v.play().catch(() => {}) : v.pause(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(e.shiftKey ? .1 : .01); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(e.shiftKey ? -.1 : -.01); }
      else if (e.key === 'd' || e.key === 'D') markTrim('start');
      else if (e.key === 'f' || e.key === 'F') markTrim('end');
      else if (e.key === 'r' || e.key === 'R') applyBoundedPlayback();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, applyBoundedPlayback, nudge]);

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
    const t = Math.max(0, v.currentTime);
    if (which === 'start') {
      setTrimStart((trimEnd != null && t >= trimEnd) ? Math.max(0, trimEnd - .01) : t);
    } else {
      setTrimEnd((trimStart != null && t <= trimStart) ? trimStart + .01 : t);
    }
  };
  const saveTrim = () => {
    if (!current || !onTrim || trimStart == null || trimEnd == null || trimEnd <= trimStart) return;

    // Conserve immédiatement les valeurs dans l'éditeur puis délègue la
    // persistance au parent. Le prochain Rejouer et la prochaine ouverture
    // utilisent ces bornes sauvegardées, pas les bornes automatiques d'origine.
    const nextStart = trimStart;
    const nextEnd = trimEnd;
    setTrimStart(nextStart);
    setTrimEnd(nextEnd);
    onTrim(current, nextStart, nextEnd);
  };
  const previewEditedTrim = () => {
    const v = videoRef.current;
    if (!v || trimStart == null || trimEnd == null || trimEnd <= trimStart) return;
    stopRef.current?.(); stopRef.current = null;
    try { v.currentTime = Math.max(0, trimStart); v.play().catch(() => {}); } catch { /* noop */ }
    const onTick = () => {
      if (v.currentTime >= trimEnd) {
        v.currentTime = trimEnd; v.pause(); v.removeEventListener('timeupdate', onTick); stopRef.current = null;
      }
    };
    v.addEventListener('timeupdate', onTick);
    stopRef.current = () => v.removeEventListener('timeupdate', onTick);
  };

  if (!open || actions.length === 0 || !current) return null;
  const hasVideo = !!currentVideoUrl;
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
              <video
                key={`${String(cur.matchId ?? '')}:${currentVideoUrl ?? ''}`}
                ref={videoRef}
                className="acm-video"
                src={currentVideoUrl!}
                controls
                playsInline
                onLoadedMetadata={(e) => {
                  const duration = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0;
                  setVideoDuration(duration);
                  setPlayhead(e.currentTarget.currentTime || effectiveStartOf(cur) || 0);
                }}
                onTimeUpdate={(e) => setPlayhead(e.currentTarget.currentTime)}
                onSeeked={(e) => setPlayhead(e.currentTarget.currentTime)} />
            ) : (
              <div className="acm-novideo">
                <div>
                  {syncedStartOf(cur) != null
                    ? `Clip enregistré · ${fmt(syncedStartOf(cur)!)}${syncedEndOf(cur) != null ? ` → ${fmt(syncedEndOf(cur)!)}` : ''}`
                    : 'Repère vidéo indisponible'}
                </div>
                {currentMatchId && props.teamId && (
                  <LocalMatchVideoButton
                    matchId={currentMatchId}
                    teamId={props.teamId}
                    compact
                  />
                )}
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
            <Info k="Clip début" v={(trimStart ?? effectiveStartOf(cur)) != null ? fmt((trimStart ?? effectiveStartOf(cur))!) : null} />
            <Info k="Clip fin" v={(trimEnd ?? effectiveEndOf(cur)) != null ? fmt((trimEnd ?? effectiveEndOf(cur))!) : null} />
          </div>

          <div className="acm-tools">
            {onAddToMontage && <button onClick={() => onAddToMontage(cur)}>⭐ Ajouter au montage</button>}
            <button className={draw ? 'on' : ''} onClick={() => setDraw((d) => !d)}>✏ Dessiner</button>
            {draw && <button onClick={clearDraw}>🧽 Effacer</button>}
          </div>

          {hasVideo && (() => {
            const autoStart = syncedStartOf(cur) ?? 0;
            const autoEnd = syncedEndOf(cur) ?? autoStart + 6;
            const savedStart = effectiveStartOf(cur) ?? autoStart;
            const savedEnd = effectiveEndOf(cur) ?? autoEnd;
            const startValue = trimStart ?? savedStart;
            const endValue = trimEnd ?? savedEnd;
            const duration = videoDuration > 0 ? videoDuration : Math.max(autoEnd, savedEnd, endValue) + 15;
            const coarseMin = Math.max(0, Math.min(autoStart, savedStart, startValue) - 15);
            const coarseMax = Math.max(coarseMin + .1, duration);
            const precisionSpan = precisionZoom === 10 ? .5 : precisionZoom === 5 ? 1.5 : 4;
            const precisionMin = Math.max(0, Math.min(duration, playhead) - precisionSpan / 2);
            const precisionMax = Math.min(duration, Math.max(precisionMin + .05, precisionMin + precisionSpan));
            const clipDuration = Math.max(0, endValue - startValue);
            const dirty = Math.abs(startValue - savedStart) > .0005 || Math.abs(endValue - savedEnd) > .0005;
            return <div className="acm-trim-editor">
              <div className="acm-trim-title">
                <b>✂ Découper précisément le clip</b>
                <span>Lis la vidéo, place la tête de lecture puis utilise « Début ici » et « Fin ici ». Affine ensuite au centième avec la timeline de précision.</span>
              </div>

              <div className="acm-playhead-readout">
                <span>TÊTE DE LECTURE</span><b>{fmt(playhead)}</b>
                <span className="acm-shortcuts">Espace lecture/pause · D début · F fin · ←/→ 0,01 s · Maj 0,10 s</span>
              </div>

              <div className="acm-main-timeline">
                <div className="acm-timeline-labels"><span>{fmt(coarseMin)}</span><span>Timeline complète</span><span>{fmt(coarseMax)}</span></div>
                <input aria-label="Position dans la vidéo" type="range" min={coarseMin} max={coarseMax} step={0.01}
                  value={Math.max(coarseMin, Math.min(playhead, coarseMax))}
                  onChange={(e) => seekTo(Number(e.target.value))} />
                <div className="acm-bound-row">
                  <button className="acm-bound-start" onClick={() => markTrim('start')}>⟦ Début ici <b>{fmt(startValue)}</b></button>
                  <div className="acm-clip-duration">Clip · <b>{clipDuration.toFixed(3)} s</b></div>
                  <button className="acm-bound-end" onClick={() => markTrim('end')}>Fin ici <b>{fmt(endValue)}</b> ⟧</button>
                </div>
              </div>

              <div className="acm-precision-box">
                <div className="acm-precision-head"><b>Précision</b><div className="acm-zoom">Zoom
                  {([2, 5, 10] as const).map((z) => <button key={z} className={precisionZoom === z ? 'on' : ''} onClick={() => setPrecisionZoom(z)}>{z}×</button>)}
                </div></div>
                <div className="acm-timeline-labels"><span>{fmt(precisionMin)}</span><span>{fmt(playhead)}</span><span>{fmt(precisionMax)}</span></div>
                <input className="acm-precision-range" aria-label="Timeline de précision" type="range" min={precisionMin} max={precisionMax} step={0.005}
                  value={Math.max(precisionMin, Math.min(playhead, precisionMax))}
                  onChange={(e) => seekTo(Number(e.target.value))} />
                <div className="acm-nudges">
                  <button onClick={() => nudge(-.1)}>− 0,10</button><button onClick={() => nudge(-.01)}>− 0,01</button>
                  <span>{fmt(playhead)}</span>
                  <button onClick={() => nudge(.01)}>+ 0,01</button><button onClick={() => nudge(.1)}>+ 0,10</button>
                </div>
              </div>

              <div className="acm-trim-summary">
                <div><span>DÉBUT</span><b>{fmt(startValue)}</b></div>
                <div><span>DURÉE</span><b>{clipDuration.toFixed(3)} s</b></div>
                <div><span>FIN</span><b>{fmt(endValue)}</b></div>
              </div>
              <div className="acm-trim-actions">
                <button onClick={() => { setTrimStart(autoStart); setTrimEnd(autoEnd); seekTo(autoStart); }}>↺ Revenir en Auto</button>
                <button onClick={previewEditedTrim}>▶ Tester le clip</button>
                {onTrim && <button className="acm-trim-save" disabled={trimStart == null || trimEnd == null || endValue <= startValue} onClick={saveTrim}>{dirty ? '✓ Enregistrer' : '✓ Enregistré'}</button>}
              </div>
            </div>;
          })()}

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
        .acm-novideo { padding: 28px; text-align: center; color: #8a93a8; background: #0c0f1a; border: 1px dashed #2a3142; border-radius: 10px; font-weight: 700; display: grid; gap: 12px; justify-items: center; }
        .acm-nav { display: flex; gap: 8px; }
        .acm-nav button { flex: 1; border: 1px solid #2a3142; background: #171b29; color: #eef1f7; border-radius: 9px; padding: 9px; font-size: 12.5px; font-weight: 800; cursor: pointer; }
        .acm-nav button:disabled { opacity: .4; cursor: not-allowed; }
        .acm-infos { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; background: #0c0f1a; border: 1px solid #2a3142; border-radius: 10px; padding: 10px; }
        .acm-info { display: flex; flex-direction: column; gap: 1px; }
        .acm-info span { font-size: 10px; color: #8a93a8; text-transform: uppercase; letter-spacing: .04em; }
        .acm-info b { font-size: 12.5px; }
        .acm-tools { display: flex; flex-wrap: wrap; gap: 6px; }
        .acm-tools button { border: 1px solid #2a3142; background: #171b29; color: #eef1f7; border-radius: 8px; padding: 7px 11px; font-size: 11.5px; font-weight: 800; cursor: pointer; }
        .acm-tools button.on { border-color: #D4A24C; color: #D4A24C; }
        .acm-trim-editor{display:grid;gap:12px;padding:13px;border:1px solid #2f3a50;background:#0c111b;border-radius:12px}.acm-trim-title{display:grid;gap:3px}.acm-trim-title b{font-size:13px}.acm-trim-title span{color:#8a93a8;font-size:10.5px;line-height:1.45}.acm-playhead-readout{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:8px;padding:9px 11px;background:#111827;border:1px solid #263149;border-radius:9px}.acm-playhead-readout>span:first-child{font-size:9px;color:#8a93a8;font-weight:900;letter-spacing:.08em}.acm-playhead-readout>b{font-variant-numeric:tabular-nums;color:#D4A24C;font-size:15px}.acm-shortcuts{text-align:right;color:#6f7b91!important;font-size:9.5px!important}.acm-main-timeline,.acm-precision-box{display:grid;gap:7px;padding:10px;border:1px solid #263149;background:#0a0e17;border-radius:10px}.acm-timeline-labels{display:flex;justify-content:space-between;gap:10px;color:#738097;font-size:9px;font-variant-numeric:tabular-nums}.acm-timeline-labels span:nth-child(2){color:#aab3c3;font-weight:800}.acm-trim-editor input[type=range]{width:100%;accent-color:#D4A24C;cursor:ew-resize}.acm-main-timeline input[type=range]{height:24px}.acm-bound-row{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}.acm-bound-row button{border:1px solid #34415a;background:#151c2b;color:#eef1f7;border-radius:8px;padding:8px;font-size:10.5px;font-weight:850;cursor:pointer;font-variant-numeric:tabular-nums}.acm-bound-start{text-align:left}.acm-bound-end{text-align:right}.acm-bound-row button b{color:#D4A24C}.acm-clip-duration{font-size:9.5px;color:#8793a8;text-align:center}.acm-clip-duration b{color:#cbd3df}.acm-precision-head{display:flex;justify-content:space-between;align-items:center;font-size:11px}.acm-zoom{display:flex;gap:4px;align-items:center;color:#7f8ba0;font-size:9px}.acm-zoom button{border:1px solid #2a3142;background:#151a27;color:#aab3c3;border-radius:6px;padding:4px 7px;font-size:9px;font-weight:900;cursor:pointer}.acm-zoom button.on{border-color:#D4A24C;color:#D4A24C;background:#201b13}.acm-precision-range{height:30px}.acm-nudges{display:grid;grid-template-columns:auto auto 1fr auto auto;gap:5px;align-items:center}.acm-nudges button{border:1px solid #2a3142;background:#151a27;color:#dce2ec;border-radius:7px;padding:6px 8px;font-size:9.5px;font-weight:850;cursor:pointer}.acm-nudges span{text-align:center;color:#D4A24C;font-size:11px;font-weight:900;font-variant-numeric:tabular-nums}.acm-trim-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.acm-trim-summary>div{display:grid;gap:2px;text-align:center;padding:8px;background:#111722;border:1px solid #263149;border-radius:8px}.acm-trim-summary span{font-size:8.5px;color:#768298;font-weight:900;letter-spacing:.07em}.acm-trim-summary b{font-size:12px;font-variant-numeric:tabular-nums}.acm-trim-actions{display:flex;flex-wrap:wrap;gap:6px}.acm-trim-actions button{border:1px solid #2a3142;background:#171b29;color:#eef1f7;border-radius:8px;padding:8px 10px;font-size:10.5px;font-weight:800;cursor:pointer}.acm-trim-save{margin-left:auto;border-color:#D4A24C!important;background:#D4A24C!important;color:#221c13!important}.acm-trim-save:disabled{opacity:.45;cursor:not-allowed}
        .acm-note { width: 100%; min-height: 56px; resize: vertical; border: 1px solid #2a3142; background: #0c0f1a; color: #eef1f7; border-radius: 9px; padding: 9px 11px; font: inherit; font-size: 12.5px; }
        .acm-note-save { align-self: flex-start; border: 1px solid #2a3142; background: #171b29; color: #eef1f7; border-radius: 8px; padding: 7px 12px; font-size: 11.5px; font-weight: 800; cursor: pointer; }
        @media (max-width: 640px) { .acm-card { width: 100vw; height: 100vh; max-height: none; border-radius: 0; } }
      `}</style>
    </div>
  );
}