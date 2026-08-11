'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LiveMatchAction } from '@/lib/stats-supabase';
import type { PeriodVideoMarkers, VideoSyncState } from '@/lib/video-sync';

export type VideoSyncModalProps = {
  open: boolean;
  videoUrl?: string | null;
  actions: LiveMatchAction[];
  sync: VideoSyncState;
  expectedFilename?: string | null;
  onChange: (sync: VideoSyncState) => void;
  onValidate: () => void;
  onClose: () => void;
  onPickVideoFile?: (file: File) => void;
};

const fmt = (s: number | null | undefined) => {
  if (s == null || !Number.isFinite(s)) return '—';
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const tenth = Math.floor((s % 1) * 10);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${tenth}`;
};

const PERIODS = [1, 2, 3, 4] as const;

export default function VideoSyncModal(props: VideoSyncModalProps) {
  const { open, videoUrl, expectedFilename, sync, onChange, onValidate, onClose } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mediaTime, setMediaTime] = useState(0);

  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (!v) return;
    const update = () => setMediaTime(v.currentTime || 0);
    v.addEventListener('timeupdate', update);
    v.addEventListener('seeked', update);
    update();
    return () => {
      v.removeEventListener('timeupdate', update);
      v.removeEventListener('seeked', update);
    };
  }, [open, videoUrl]);

  const markers: PeriodVideoMarkers = useMemo(() => sync.periodMarkers ?? {}, [sync.periodMarkers]);

  if (!open) return null;

  const setMarker = (q: number, edge: 'start' | 'end') => {
    const current = videoRef.current?.currentTime ?? mediaTime;
    const nextMarkers: PeriodVideoMarkers = {
      ...markers,
      [String(q)]: {
        ...(markers[String(q)] ?? {}),
        [edge]: current,
      },
    };

    // Le premier repère (début Q1 / début du match) suffit pour créer le décalage
    // global de base. Les autres repères sont conservés pour le rattachement fin
    // par période et les évolutions futures, sans exposer de jargon technique.
    const isMatchStart = q === 1 && edge === 'start';
    onChange({
      ...sync,
      mode: isMatchStart ? 'offset' : sync.mode,
      offset: isMatchStart ? current : sync.offset,
      rate: 1,
      anchorSourceTime: isMatchStart ? 0 : sync.anchorSourceTime,
      anchorMediaTime: isMatchStart ? current : sync.anchorMediaTime,
      validated: true,
      periodMarkers: nextMarkers,
    });
  };

  const clearMarker = (q: number, edge: 'start' | 'end') => {
    const existing = { ...(markers[String(q)] ?? {}) };
    delete existing[edge];
    onChange({
      ...sync,
      periodMarkers: { ...markers, [String(q)]: existing },
    });
  };

  const hasStart = markers['1']?.start != null;

  return (
    <div className="vmark-backdrop" onClick={onClose}>
      <div className="vmark-card" onClick={(e) => e.stopPropagation()}>
        <div className="vmark-head">
          <div>
            <b>⚙ Repères vidéo</b>
            <span>Associe simplement la vidéo au match.</span>
          </div>
          <button onClick={onClose}>×</button>
        </div>

        <div className="vmark-body">
          {!videoUrl ? (
            <div className="vmark-empty">
              <div className="vmark-empty-icon">🎬</div>
              <b>Ajoute d’abord le fichier vidéo du match</b>
              <span>Le codage et les actions déjà enregistrées restent intacts.</span>
              <label className="vmark-file">
                <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onPickVideoFile?.(f); }} />
                + Ajouter une vidéo
              </label>
            </div>
          ) : (
            <>
              <div className="vmark-video-wrap">
                <video ref={videoRef} src={videoUrl} controls className="vmark-video" />
                <div className="vmark-file-name">🟢 {expectedFilename || 'Vidéo associée'} <span>{fmt(mediaTime)}</span></div>
              </div>

              <div className="vmark-help">
                Place la tête de lecture au bon instant, puis clique sur le repère correspondant. Aucun réglage technique à faire.
              </div>

              <div className="vmark-grid">
                {PERIODS.map((q) => {
                  const m = markers[String(q)] ?? {};
                  return (
                    <div className="vmark-period" key={q}>
                      <div className="vmark-period-title">Q{q}</div>
                      <div className="vmark-row">
                        <div><small>DÉBUT</small><strong>{fmt(m.start)}</strong></div>
                        <button onClick={() => setMarker(q, 'start')}>{q === 1 ? '🏁 Début du match ici' : `▶ Début Q${q} ici`}</button>
                        {m.start != null && <button className="mini" onClick={() => clearMarker(q, 'start')}>×</button>}
                      </div>
                      <div className="vmark-row">
                        <div><small>FIN</small><strong>{fmt(m.end)}</strong></div>
                        <button onClick={() => setMarker(q, 'end')}>■ Fin Q{q} ici</button>
                        {m.end != null && <button className="mini" onClick={() => clearMarker(q, 'end')}>×</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="vmark-foot">
          <button className="secondary" onClick={onClose}>Annuler</button>
          <button className="primary" disabled={!videoUrl || !hasStart} onClick={onValidate}>✓ Enregistrer les repères</button>
        </div>
      </div>

      <style jsx>{`
        .vmark-backdrop{position:fixed;inset:0;z-index:5000;background:rgba(2,5,12,.76);display:grid;place-items:center;padding:18px;backdrop-filter:blur(8px)}
        .vmark-card{width:min(1080px,96vw);max-height:94vh;overflow:auto;background:#0b1120;border:1px solid #25324a;border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.55);color:#fff}
        .vmark-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #202d43;background:#0d1525;position:sticky;top:0;z-index:2}
        .vmark-head b{display:block;font-size:16px}.vmark-head span{display:block;margin-top:3px;color:#8b98ad;font-size:11px}.vmark-head>button{width:34px;height:34px;border:0;border-radius:9px;background:#151f31;color:#fff;font-size:22px;cursor:pointer}
        .vmark-body{padding:16px}.vmark-video-wrap{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}.vmark-video{width:100%;max-height:430px;background:#000;border-radius:14px;border:1px solid #26344d}.vmark-file-name{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border:1px solid #25324a;background:#111a2a;border-radius:10px;font-size:11px;color:#cbd5e1}.vmark-file-name span{color:#d4a24c;font-weight:900}
        .vmark-help{margin:14px 0 10px;padding:10px 12px;border:1px solid rgba(212,162,76,.25);border-radius:10px;background:rgba(212,162,76,.07);color:#d6deea;font-size:11px}
        .vmark-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.vmark-period{padding:12px;border:1px solid #26344d;border-radius:12px;background:#101827}.vmark-period-title{color:#d4a24c;font-weight:950;font-size:13px;margin-bottom:8px}.vmark-row{display:grid;grid-template-columns:78px minmax(0,1fr) 28px;align-items:center;gap:7px;margin-top:7px}.vmark-row>div small{display:block;color:#77849a;font-size:8px;font-weight:900}.vmark-row>div strong{display:block;margin-top:2px;font-size:12px}.vmark-row button{height:34px;border:1px solid #34435e;border-radius:9px;background:#172135;color:#fff;font-size:10px;font-weight:900;cursor:pointer}.vmark-row button:hover{border-color:#d4a24c;background:#1d2a42}.vmark-row .mini{width:28px;color:#fda4af;background:#2a1620;border-color:#5c2535}
        .vmark-foot{display:flex;justify-content:flex-end;gap:9px;padding:14px 18px;border-top:1px solid #202d43;position:sticky;bottom:0;background:#0d1525}.vmark-foot button{height:40px;padding:0 16px;border-radius:10px;font-size:11px;font-weight:950;cursor:pointer}.vmark-foot .secondary{border:1px solid #34435e;background:#131d2e;color:#fff}.vmark-foot .primary{border:1px solid #8c1d34;background:#8c1d34;color:#fff}.vmark-foot .primary:disabled{opacity:.4;cursor:not-allowed}
        .vmark-empty{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border:1px dashed #34435e;border-radius:14px;background:#0e1727}.vmark-empty-icon{font-size:34px}.vmark-empty b{margin-top:8px}.vmark-empty span{margin-top:5px;color:#8492a7;font-size:11px}.vmark-file{margin-top:14px;padding:10px 14px;border:1px solid #d4a24c;border-radius:10px;background:rgba(212,162,76,.1);color:#d4a24c;font-size:11px;font-weight:950;cursor:pointer}.vmark-file input{display:none}
        @media(max-width:760px){.vmark-grid{grid-template-columns:1fr}.vmark-row{grid-template-columns:70px minmax(0,1fr) 28px}}
      `}</style>
    </div>
  );
}
