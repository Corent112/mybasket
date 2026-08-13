'use client';

import { useEffect, useRef, useState } from 'react';
import type { LiveMatchAction } from '@/lib/stats-supabase';
import type { VideoSyncState } from '@/lib/video-sync';

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
  const h = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
};

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

  if (!open) return null;

  const matchStart = sync.anchorMediaTime ?? (sync.mode === 'offset' ? sync.offset : null);

  const setMatchStart = () => {
    const current = videoRef.current?.currentTime ?? mediaTime;
    onChange({
      ...sync,
      mode: 'offset',
      offset: current,
      rate: 1,
      anchorSourceTime: 0,
      anchorMediaTime: current,
      validated: true,
      periodMarkers: {
        ...(sync.periodMarkers ?? {}),
        '1': { ...(sync.periodMarkers?.['1'] ?? {}), start: current },
      },
    });
  };

  return (
    <div className="vmark-backdrop" onClick={onClose}>
      <div className="vmark-card" onClick={(e) => e.stopPropagation()}>
        <div className="vmark-head">
          <div><b>⚙ Synchroniser la vidéo</b><span>Pour un match codé sans vidéo : un seul repère suffit.</span></div>
          <button onClick={onClose}>×</button>
        </div>

        <div className="vmark-body">
          {!videoUrl ? (
            <div className="vmark-empty">
              <div className="vmark-empty-icon">🎬</div>
              <b>Ajoute la vidéo du match</b>
              <span>Les stats, tags et temps réels déjà enregistrés ne bougent pas.</span>
              <label className="vmark-file">
                <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onPickVideoFile?.(f); }} />
                + Ajouter une vidéo locale
              </label>
            </div>
          ) : (
            <>
              <video ref={videoRef} src={videoUrl} controls className="vmark-video" />
              <div className="vmark-file-name">🟢 {expectedFilename || 'Vidéo associée'} <span>{fmt(mediaTime)}</span></div>

              <div className="vmark-help">
                Place la vidéo exactement au coup d'envoi, au même instant où ESPACE a été pressé pendant le codage sans vidéo. MyBasket recale ensuite automatiquement tous les tags, y compris les temps morts et arrêts de jeu.
              </div>

              <div className="vmark-one">
                <div><small>DÉBUT RÉEL DU MATCH</small><strong>{fmt(matchStart)}</strong></div>
                <button onClick={setMatchStart}>🏁 Le match commence ici</button>
              </div>
            </>
          )}
        </div>

        <div className="vmark-foot">
          <button className="secondary" onClick={onClose}>Annuler</button>
          <button className="primary" disabled={!videoUrl || matchStart == null} onClick={onValidate}>✓ Synchroniser tous les clips</button>
        </div>
      </div>

      <style jsx>{`
        .vmark-backdrop{position:fixed;inset:0;z-index:5000;background:rgba(2,5,12,.76);display:grid;place-items:center;padding:18px;backdrop-filter:blur(8px)}
        .vmark-card{width:min(960px,96vw);max-height:94vh;overflow:auto;background:#0b1120;border:1px solid #25324a;border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.55);color:#fff}
        .vmark-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #202d43;background:#0d1525}.vmark-head b{display:block;font-size:16px}.vmark-head span{display:block;margin-top:3px;color:#8b98ad;font-size:11px}.vmark-head>button{width:34px;height:34px;border:0;border-radius:9px;background:#151f31;color:#fff;font-size:22px;cursor:pointer}
        .vmark-body{padding:16px}.vmark-video{width:100%;max-height:520px;background:#000;border-radius:14px;border:1px solid #26344d}.vmark-file-name{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:9px 12px;border:1px solid #25324a;background:#111a2a;border-radius:10px;font-size:11px;color:#cbd5e1}.vmark-file-name span{color:#d4a24c;font-weight:900}
        .vmark-help{margin:14px 0;padding:12px;border:1px solid rgba(212,162,76,.25);border-radius:10px;background:rgba(212,162,76,.07);color:#d6deea;font-size:12px;line-height:1.5}.vmark-one{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px;border:1px solid #26344d;border-radius:14px;background:#101827}.vmark-one small{display:block;color:#77849a;font-size:9px;font-weight:900}.vmark-one strong{display:block;margin-top:3px;font-size:18px;color:#d4a24c}.vmark-one button{min-height:42px;padding:0 18px;border:1px solid #d4a24c;border-radius:10px;background:rgba(212,162,76,.12);color:#fff;font-weight:950;cursor:pointer}
        .vmark-foot{display:flex;justify-content:flex-end;gap:9px;padding:14px 18px;border-top:1px solid #202d43;background:#0d1525}.vmark-foot button{height:40px;padding:0 16px;border-radius:10px;font-size:11px;font-weight:950;cursor:pointer}.vmark-foot .secondary{border:1px solid #34435e;background:#131d2e;color:#fff}.vmark-foot .primary{border:1px solid #8c1d34;background:#8c1d34;color:#fff}.vmark-foot .primary:disabled{opacity:.4;cursor:not-allowed}
        .vmark-empty{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border:1px dashed #34435e;border-radius:14px;background:#0e1727}.vmark-empty-icon{font-size:34px}.vmark-empty b{margin-top:8px}.vmark-empty span{margin-top:5px;color:#8492a7;font-size:11px}.vmark-file{margin-top:14px;padding:10px 14px;border:1px solid #d4a24c;border-radius:10px;background:rgba(212,162,76,.1);color:#d4a24c;font-size:11px;font-weight:950;cursor:pointer}.vmark-file input{display:none}
        @media(max-width:680px){.vmark-one{align-items:stretch;flex-direction:column}.vmark-one button{width:100%}}
      `}</style>
    </div>
  );
}
