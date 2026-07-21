'use client';

/* ============================================================================
 * VideoSyncModal — « Synchroniser la vidéo avec le codage »
 * ----------------------------------------------------------------------------
 * Quand une vidéo est ajoutée APRÈS le codage, elle est souvent plus longue que
 * le match (échauffement, présentation, temps mort avant l'entre-deux…). Cette
 * fenêtre permet de dire à MyBasket : « le début de mon codage correspond à CET
 * instant de la vidéo ». Elle ne modifie JAMAIS les temps bruts des actions :
 * elle ne produit qu'un VideoSyncState (offset / rate / mode) au niveau du match.
 *
 * Trois façons de synchroniser :
 *   1. « Le codage commence ici »          → offset = tVideo - 0        (mode offset)
 *   2. « Synchroniser à partir d'une action » → offset = tVideo - tSource (mode offset)
 *   3. « Corriger une dérive » (2e point)   → rate + offset             (mode calibrated)
 * Plus un ajustement manuel fin (± 0,1 / 1 / 5 s) et un test de lecture.
 * ========================================================================== */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LiveMatchAction } from '@/lib/stats-supabase';
import {
  type VideoSyncState,
  resolveActionClipBounds,
  computeOffsetSync,
  computeCalibratedSync,
  formatOffset,
} from '@/lib/video-sync';

export type VideoSyncModalProps = {
  open: boolean;
  /** Source vidéo locale (objectURL). Sans elle, la fenêtre invite à choisir un fichier. */
  videoUrl?: string | null;
  actions: LiveMatchAction[];
  sync: VideoSyncState;
  expectedFilename?: string | null;
  onChange: (sync: VideoSyncState) => void;
  onValidate: () => void;
  onClose: () => void;
  /** Optionnel : rattache le fichier vidéo si l'utilisateur le sélectionne ici. */
  onPickVideoFile?: (file: File) => void;
};

const fmt = (s: number | null | undefined) =>
  s == null
    ? '—'
    : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const periodLabel = (q?: number | null) =>
  q == null ? '' : q <= 4 ? `Q${q}` : `OT${q - 4}`;

/** Temps « source » (codage brut) d'une action, indépendamment de la synchro. */
const sourceTimeOf = (a: LiveMatchAction): number | null =>
  (a?.possessionStart ?? a?.clipStart ?? a?.videoTime ?? null) as number | null;

/** Libellé compact : « Q1 09:42 — Horn 4 — 2PTS marqué ». */
function actionLabel(a: LiveMatchAction): string {
  const head = `${periodLabel(a.q)} ${a.clock ?? ''}`.trim();
  const sys = a.systemeName ?? a.systemeSlot ?? '';
  let outcome = a.actionType ?? '';
  if (a.actionType === 'tir') {
    const t = a.shotType ?? 'tir';
    const r = a.shotResult === 'made' ? 'marqué' : a.shotResult === 'missed' ? 'raté' : '';
    outcome = `${t} ${r}`.trim();
  }
  return [head, sys, outcome].filter(Boolean).join(' — ');
}

export default function VideoSyncModal(props: VideoSyncModalProps) {
  const { open, videoUrl, actions, sync, expectedFilename, onChange, onValidate, onClose } = props;

  // Lecteur PROPRE à la fenêtre de synchro : jamais la même React ref que le
  // lecteur principal (une ref ne doit pas être attachée à deux <video>).
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);

  const [mediaTime, setMediaTime] = useState(0);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [driftOpen, setDriftOpen] = useState(false);
  const [driftActionId, setDriftActionId] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const testStopRef = useRef<(() => void) | null>(null);

  // Actions ordonnées par temps de codage (pour choisir un point d'ancrage).
  const codedActions = useMemo(
    () =>
      actions
        .filter((a) => sourceTimeOf(a) != null && a.id)
        .slice()
        .sort((x, y) => (sourceTimeOf(x)! - sourceTimeOf(y)!)),
    [actions]
  );

  const firstActions = useMemo(() => codedActions.slice(0, 8), [codedActions]);
  const firstAction = codedActions[0] ?? null;

  // Actions « éloignées » proposées comme 2e point (2e moitié du match).
  const driftCandidates = useMemo(
    () => codedActions.slice(Math.ceil(codedActions.length / 2)),
    [codedActions]
  );

  // Suivi du timecode vidéo courant.
  useEffect(() => {
    if (!open) return;
    const v = modalVideoRef.current;
    if (!v) return;
    const onTime = () => setMediaTime(v.currentTime || 0);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('seeked', onTime);
    setMediaTime(v.currentTime || 0);
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('seeked', onTime);
    };
  }, [open, videoUrl]);

  const stopTest = useCallback(() => {
    testStopRef.current?.();
    testStopRef.current = null;
    setTesting(false);
  }, []);

  useEffect(() => {
    if (!open) stopTest();
    return () => stopTest();
  }, [open, stopTest]);

  if (!open) return null;

  const hasVideo = !!videoUrl;

  // ---- Actions de synchro -------------------------------------------------

  const validated = sync.validated ?? sync.mode !== 'native';

  const setSyncFromOffset = (sourceTime: number, media: number) => {
    onChange(computeOffsetSync(sourceTime, media));
  };

  const onCodingStartsHere = () => {
    const v = modalVideoRef.current;
    if (!v) return;
    const selectedMediaTime = v.currentTime;
    const sourceTime = 0;
    setSyncFromOffset(sourceTime, selectedMediaTime);
  };

  const onMatchAction = () => {
    const v = modalVideoRef.current;
    const a = codedActions.find((x) => x.id === selectedActionId) ?? firstAction;
    if (!v || !a) return;
    const sourceTime = sourceTimeOf(a) ?? 0;
    const media = v.currentTime;
    onChange({
      mode: 'offset',
      offset: media - sourceTime,
      rate: 1,
      anchorActionId: a.id ?? null,
      anchorSourceTime: sourceTime,
      anchorMediaTime: media,
      validated: true,
    });
  };

  const nudge = (delta: number) => {
    const nextOffset = (Number.isFinite(sync.offset) ? sync.offset : 0) + delta;
    onChange({
      ...sync,
      // un ajustement manuel implique qu'un décalage est nécessaire.
      mode: sync.mode === 'native' ? 'offset' : sync.mode,
      offset: nextOffset,
      rate: Number.isFinite(sync.rate) ? sync.rate : 1,
      validated: true,
    });
  };

  const applyDrift = () => {
    const v = modalVideoRef.current;
    const a2 = driftCandidates.find((x) => x.id === driftActionId);
    if (!v || !a2) return;
    // Premier point : l'ancrage courant, sinon (source 0 / media = offset).
    const source1 = sync.anchorSourceTime ?? 0;
    const media1 = sync.anchorMediaTime ?? sync.offset;
    const source2 = sourceTimeOf(a2) ?? 0;
    const media2 = v.currentTime;

    const res = computeCalibratedSync(source1, media1, source2, media2);
    if (!res.ok) {
      window.alert(res.reason);
      return;
    }
    if (Math.abs(res.rate - 1) > 0.05) {
      const keep = window.confirm(
        `Le facteur d'échelle calculé (${res.rate.toFixed(4)}) est éloigné de 1. ` +
          `Cela peut indiquer une erreur de pointage.\n\n` +
          `OK = appliquer quand même la correction de dérive.\n` +
          `Annuler = revenir au mode décalage simple.`
      );
      if (!keep) {
        setSyncFromOffset(source1, media1);
        return;
      }
    }
    onChange({ ...res.sync, anchorActionId: sync.anchorActionId ?? null });
  };

  // ---- Test de lecture (3 actions : début / milieu / fin) -----------------

  const runTest = () => {
    const v = modalVideoRef.current;
    if (!v || codedActions.length === 0) return;
    stopTest();

    const picks: LiveMatchAction[] = [];
    picks.push(codedActions[0]);
    if (codedActions.length > 2) picks.push(codedActions[Math.floor(codedActions.length / 2)]);
    picks.push(codedActions[codedActions.length - 1]);

    const segments = picks
      .map((a) => resolveActionClipBounds(a, sync))
      .filter((b) => b.start != null) as { start: number; end: number | null }[];
    if (!segments.length) return;

    setTesting(true);
    let i = 0;
    let cancelled = false;

    const playSeg = () => {
      if (cancelled || i >= segments.length) { stopTest(); return; }
      const seg = segments[i];
      try { v.currentTime = Math.max(0, seg.start); v.play().catch(() => {}); } catch { /* noop */ }
      const onTick = () => {
        const end = seg.end ?? seg.start + 6;
        if (v.currentTime >= end) {
          v.removeEventListener('timeupdate', onTick);
          i += 1;
          // petite pause entre extraits
          window.setTimeout(playSeg, 350);
        }
      };
      v.addEventListener('timeupdate', onTick);
      testStopRef.current = () => {
        cancelled = true;
        v.removeEventListener('timeupdate', onTick);
        try { v.pause(); } catch { /* noop */ }
      };
    };
    playSeg();
  };

  return (
    <div className="vsm-backdrop" onClick={onClose}>
      <div className="vsm-card" onClick={(e) => e.stopPropagation()}>
        <header className="vsm-head">
          <div>
            <b>Synchroniser la vidéo avec le codage</b>
            {expectedFilename && (
              <span className="vsm-expected">Vidéo attendue : {expectedFilename}</span>
            )}
          </div>
          <button className="vsm-x" onClick={onClose} title="Fermer">×</button>
        </header>

        <div className="vsm-body">
          {/* Lecteur */}
          <div className="vsm-videocol">
            <div className="vsm-videowrap">
              {hasVideo ? (
                <video ref={modalVideoRef} className="vsm-video" src={videoUrl!} controls playsInline />
              ) : (
                <div className="vsm-novideo">
                  <p>Sélectionne le fichier vidéo local pour lancer la synchronisation.</p>
                  {props.onPickVideoFile && (
                    <label className="vsm-file">
                      <input
                        type="file"
                        accept="video/*"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) props.onPickVideoFile!(f);
                        }}
                      />
                      📁 Choisir la vidéo
                    </label>
                  )}
                </div>
              )}
            </div>

            <div className="vsm-timerow">
              <span className="vsm-tc">⏱ Vidéo : <b>{fmt(mediaTime)}</b></span>
              <span className={`vsm-offset ${validated ? 'ok' : ''}`}>
                Décalage actuel : <b>{formatOffset(sync.offset)}</b>
                {sync.mode === 'calibrated' && <em> · dérive {sync.rate.toFixed(4)}×</em>}
              </span>
            </div>

            <p className="vsm-instr">
              Avance dans la vidéo jusqu'au moment exact où ton codage MyBasket a commencé,
              puis clique sur <b>Le codage commence ici</b>.
            </p>

            <button className="vsm-primary" disabled={!hasVideo} onClick={onCodingStartsHere}>
              Le codage commence ici
            </button>

            {/* Ajustement manuel fin */}
            <div className="vsm-nudge">
              <span className="vsm-nudge-lbl">Ajustement manuel</span>
              <div className="vsm-nudge-btns">
                {[-5, -1, -0.1, 0.1, 1, 5].map((d) => (
                  <button key={d} disabled={!hasVideo} onClick={() => nudge(d)}>
                    {d > 0 ? '+' : ''}{d} s
                  </button>
                ))}
              </div>
            </div>

            <div className="vsm-testrow">
              <button className="vsm-test" disabled={!hasVideo || codedActions.length === 0} onClick={testing ? stopTest : runTest}>
                {testing ? '⏹ Arrêter le test' : '▶ Tester la synchronisation'}
              </button>
              <span className="vsm-test-hint">Lit 3 actions : début, milieu, fin.</span>
            </div>
          </div>

          {/* Actions & réglages */}
          <div className="vsm-sidecol">
            {/* Première action codée */}
            <section className="vsm-sec">
              <h4>Première action codée</h4>
              {firstAction ? (
                <div className="vsm-firstaction">
                  <div className="vsm-fa-line"><span>Repère chrono</span><b>{periodLabel(firstAction.q)} {firstAction.clock}</b></div>
                  <div className="vsm-fa-line"><span>Système</span><b>{firstAction.systemeName ?? firstAction.systemeSlot ?? '—'}</b></div>
                  <div className="vsm-fa-line"><span>Temps fort</span><b>{firstAction.tempsFort ?? '—'}</b></div>
                  <div className="vsm-fa-line"><span>Résultat</span><b>{firstAction.actionType === 'tir' ? `${firstAction.shotType ?? ''} ${firstAction.shotResult === 'made' ? 'marqué' : firstAction.shotResult === 'missed' ? 'raté' : ''}`.trim() : (firstAction.actionType ?? '—')}</b></div>
                  <div className="vsm-fa-line"><span>Temps de codage</span><b>{fmt(sourceTimeOf(firstAction))}</b></div>
                </div>
              ) : (
                <p className="vsm-muted">Aucune action codée avec un repère temporel.</p>
              )}
            </section>

            {/* Synchro à partir d'une action */}
            <section className="vsm-sec">
              <h4>Synchroniser à partir d'une action</h4>
              <p className="vsm-muted">
                Choisis une action, avance la vidéo jusqu'à l'image exacte, puis valide.
              </p>
              <div className="vsm-actionlist">
                {firstActions.map((a) => (
                  <button
                    key={a.id}
                    className={selectedActionId === a.id ? 'on' : ''}
                    onClick={() => setSelectedActionId(a.id ?? null)}
                  >
                    {actionLabel(a)}
                  </button>
                ))}
              </div>
              <button
                className="vsm-secondary"
                disabled={!hasVideo || !(selectedActionId ?? firstAction?.id)}
                onClick={onMatchAction}
              >
                Cette image correspond à cette action
              </button>
            </section>

            {/* Second point (dérive) */}
            <section className="vsm-sec">
              <button className="vsm-collapse" onClick={() => setDriftOpen((o) => !o)}>
                {driftOpen ? '▾' : '▸'} Corriger une dérive de synchronisation
              </button>
              {driftOpen && (
                <div className="vsm-drift">
                  <p className="vsm-muted">
                    Choisis une seconde action éloignée (ex. 3e quart-temps), place la vidéo
                    sur son image exacte, puis applique la correction.
                  </p>
                  <div className="vsm-actionlist">
                    {driftCandidates.slice(0, 10).map((a) => (
                      <button
                        key={a.id}
                        className={driftActionId === a.id ? 'on' : ''}
                        onClick={() => setDriftActionId(a.id ?? null)}
                      >
                        {actionLabel(a)}
                      </button>
                    ))}
                  </div>
                  <button className="vsm-secondary" disabled={!hasVideo || !driftActionId} onClick={applyDrift}>
                    Appliquer la correction de dérive
                  </button>
                  {sync.mode === 'calibrated' && (
                    <button className="vsm-link" onClick={() => setSyncFromOffset(sync.anchorSourceTime ?? 0, sync.anchorMediaTime ?? sync.offset)}>
                      ↩ Revenir au décalage simple
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>

        <footer className="vsm-foot">
          <span className={`vsm-status ${validated ? 'ok' : ''}`}>
            {validated ? '✓ Synchronisation prête' : 'Non synchronisé'} · mode {sync.mode}
          </span>
          <div className="vsm-foot-btns">
            <button className="vsm-ghost" onClick={onClose}>Fermer</button>
            <button className="vsm-validate" disabled={!validated} onClick={onValidate}>
              Valider la synchronisation
            </button>
          </div>
        </footer>
      </div>

      <style>{`
        .vsm-backdrop { position: fixed; inset: 0; z-index: 4200; background: rgba(43,15,22,.55); display: flex; align-items: center; justify-content: center; padding: 18px; }
        .vsm-card { width: min(1080px, 97vw); max-height: 94vh; overflow: auto; background: #fff; color: #2b2b2b; border-radius: 20px; box-shadow: 0 30px 80px -24px rgba(107,26,44,.55); border: 1px solid #efe4e7; }
        .vsm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 18px 20px; border-bottom: 1px solid #f0e7ea; background: linear-gradient(180deg,#fbf6f7,#fff); border-radius: 20px 20px 0 0; }
        .vsm-head b { color: #6B1A2C; font-size: 17px; display: block; }
        .vsm-expected { display: block; margin-top: 4px; font-size: 12px; color: #9a8f93; }
        .vsm-x { width: 34px; height: 34px; border-radius: 10px; border: 1px solid #e9dde1; background: #fff; color: #6B1A2C; font-size: 20px; cursor: pointer; }
        .vsm-body { display: grid; grid-template-columns: 1.25fr 1fr; gap: 18px; padding: 18px 20px; }
        @media (max-width: 860px) { .vsm-body { grid-template-columns: 1fr; } }
        .vsm-videocol { display: flex; flex-direction: column; gap: 12px; }
        .vsm-videowrap { border-radius: 14px; overflow: hidden; background: #000; border: 1px solid #ece3e6; }
        .vsm-video { width: 100%; max-height: 46vh; display: block; background: #000; }
        .vsm-novideo { background: #faf6f7; color: #9a8f93; padding: 34px 18px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center; }
        .vsm-file, .vsm-file input { cursor: pointer; }
        .vsm-file { display: inline-block; background: #6B1A2C; color: #fff; padding: 9px 16px; border-radius: 10px; font-weight: 800; font-size: 13px; }
        .vsm-file input { display: none; }
        .vsm-timerow { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
        .vsm-tc { font-size: 13px; color: #6b5f63; }
        .vsm-tc b { color: #2b2b2b; }
        .vsm-offset { font-size: 13px; color: #6b5f63; background: #faf6f7; border: 1px solid #efe4e7; border-radius: 10px; padding: 6px 10px; }
        .vsm-offset.ok { border-color: #D4A24C; }
        .vsm-offset b { color: #6B1A2C; font-variant-numeric: tabular-nums; }
        .vsm-offset em { color: #a9772a; font-style: normal; }
        .vsm-instr { font-size: 13px; color: #5b5054; margin: 0; line-height: 1.5; }
        .vsm-instr b { color: #6B1A2C; }
        .vsm-primary { border: none; background: #6B1A2C; color: #fff; border-radius: 12px; padding: 14px; font-size: 15px; font-weight: 900; cursor: pointer; box-shadow: 0 10px 24px -12px rgba(107,26,44,.7); }
        .vsm-primary:disabled { opacity: .4; cursor: not-allowed; box-shadow: none; }
        .vsm-nudge { background: #faf6f7; border: 1px solid #efe4e7; border-radius: 12px; padding: 12px; }
        .vsm-nudge-lbl { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9a8f93; font-weight: 800; }
        .vsm-nudge-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        .vsm-nudge-btns button { flex: 1 1 auto; min-width: 62px; border: 1px solid #e6d6b8; background: #fff; color: #6B1A2C; border-radius: 10px; padding: 10px 8px; font-size: 13.5px; font-weight: 800; cursor: pointer; }
        .vsm-nudge-btns button:hover:not(:disabled) { background: #fbf3e2; border-color: #D4A24C; }
        .vsm-nudge-btns button:disabled { opacity: .4; cursor: not-allowed; }
        .vsm-testrow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .vsm-test { border: 1px solid #D4A24C; background: #fff; color: #a9772a; border-radius: 10px; padding: 10px 14px; font-size: 13px; font-weight: 800; cursor: pointer; }
        .vsm-test:disabled { opacity: .4; cursor: not-allowed; }
        .vsm-test-hint { font-size: 12px; color: #9a8f93; }
        .vsm-sidecol { display: flex; flex-direction: column; gap: 14px; }
        .vsm-sec { background: #fff; border: 1px solid #ece3e6; border-radius: 14px; padding: 14px; }
        .vsm-sec h4 { margin: 0 0 8px; font-size: 13px; color: #6B1A2C; }
        .vsm-muted { font-size: 12px; color: #9a8f93; margin: 0 0 8px; line-height: 1.5; }
        .vsm-firstaction { display: flex; flex-direction: column; gap: 4px; }
        .vsm-fa-line { display: flex; justify-content: space-between; gap: 10px; font-size: 12.5px; }
        .vsm-fa-line span { color: #9a8f93; }
        .vsm-fa-line b { color: #2b2b2b; text-align: right; }
        .vsm-actionlist { display: flex; flex-direction: column; gap: 6px; max-height: 190px; overflow: auto; margin-bottom: 10px; }
        .vsm-actionlist button { text-align: left; border: 1px solid #ece3e6; background: #faf6f7; color: #4b4145; border-radius: 9px; padding: 8px 10px; font-size: 12.5px; cursor: pointer; }
        .vsm-actionlist button.on { border-color: #6B1A2C; background: #6B1A2C; color: #fff; font-weight: 700; }
        .vsm-secondary { width: 100%; border: 1px solid #6B1A2C; background: #fff; color: #6B1A2C; border-radius: 10px; padding: 11px; font-size: 13px; font-weight: 800; cursor: pointer; }
        .vsm-secondary:disabled { opacity: .4; cursor: not-allowed; }
        .vsm-collapse { border: none; background: transparent; color: #6B1A2C; font-size: 13px; font-weight: 800; cursor: pointer; padding: 0; }
        .vsm-drift { margin-top: 10px; }
        .vsm-link { border: none; background: transparent; color: #a9772a; font-size: 12px; font-weight: 800; cursor: pointer; margin-top: 8px; padding: 0; }
        .vsm-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-top: 1px solid #f0e7ea; background: #fbf6f7; border-radius: 0 0 20px 20px; flex-wrap: wrap; }
        .vsm-status { font-size: 12.5px; color: #9a8f93; font-weight: 700; }
        .vsm-status.ok { color: #1c7c46; }
        .vsm-foot-btns { display: flex; gap: 10px; }
        .vsm-ghost { border: 1px solid #e9dde1; background: #fff; color: #6b5f63; border-radius: 10px; padding: 10px 16px; font-size: 13px; font-weight: 800; cursor: pointer; }
        .vsm-validate { border: none; background: #D4A24C; color: #3a2410; border-radius: 10px; padding: 10px 20px; font-size: 13.5px; font-weight: 900; cursor: pointer; }
        .vsm-validate:disabled { opacity: .45; cursor: not-allowed; }
      `}</style>
    </div>
  );
}