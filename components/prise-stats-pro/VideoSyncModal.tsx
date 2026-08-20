'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  const d = Math.floor((s - Math.floor(s)) * 10);
  return h > 0
    ? `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${d}`
    : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}.${d}`;
};

const rawActionTime = (a: LiveMatchAction): number | null => {
  const v = a.possessionStart ?? a.clipStart ?? a.videoTime ?? null;
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
};

export default function VideoSyncModal(props: VideoSyncModalProps) {
  const { open, videoUrl, expectedFilename, sync, onChange, onValidate, onClose, actions } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mediaTime, setMediaTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const periods = useMemo(() => {
    const maxQ = Math.max(4, ...actions.map((a) => Number(a.q || 0)).filter((n) => Number.isFinite(n)));
    return Array.from({ length: Math.max(4, maxQ) }, (_, i) => i + 1);
  }, [actions]);

  const sourceStartFor = (period: number): number | null => {
    const existing = sync.periodMarkers?.[String(period)]?.sourceStart;
    if (existing != null && Number.isFinite(Number(existing))) return Number(existing);
    if (period === 1) return 0;
    const times = actions
      .filter((a) => Number(a.q || 0) === period)
      .map(rawActionTime)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);
    return times[0] ?? null;
  };

  useEffect(() => {
    if (!open) return;
    const v = videoRef.current;
    if (!v) return;
    const update = () => {
      setMediaTime(v.currentTime || 0);
      if (Number.isFinite(v.duration)) setDuration(v.duration || 0);
    };
    v.addEventListener('timeupdate', update);
    v.addEventListener('seeked', update);
    v.addEventListener('loadedmetadata', update);
    update();
    return () => {
      v.removeEventListener('timeupdate', update);
      v.removeEventListener('seeked', update);
      v.removeEventListener('loadedmetadata', update);
    };
  }, [open, videoUrl]);

  if (!open) return null;

  const seek = (value: number) => {
    const v = videoRef.current;
    if (!v) return;
    const safe = Math.max(0, Math.min(Number.isFinite(v.duration) ? v.duration : value, value));
    try { v.currentTime = safe; } catch { /* noop */ }
    setMediaTime(safe);
  };

  const nudge = (delta: number) => seek(mediaTime + delta);

  const setPeriodStart = (period: number) => {
    const current = videoRef.current?.currentTime ?? mediaTime;
    const sourceStart = sourceStartFor(period);
    const currentMarkers = sync.periodMarkers ?? {};
    const nextMarkers = {
      ...currentMarkers,
      [String(period)]: {
        ...(currentMarkers[String(period)] ?? {}),
        start: current,
        sourceStart,
      },
    };

    const q1 = period === 1 ? current : nextMarkers['1']?.start;
    onChange({
      ...sync,
      mode: q1 != null ? 'offset' : sync.mode,
      offset: q1 != null ? Number(q1) : sync.offset,
      rate: sync.rate || 1,
      anchorSourceTime: q1 != null ? 0 : sync.anchorSourceTime,
      anchorMediaTime: q1 != null ? Number(q1) : sync.anchorMediaTime,
      validated: false,
      periodMarkers: nextMarkers,
    });
  };

  const clearPeriodStart = (period: number) => {
    const key = String(period);
    const next = { ...(sync.periodMarkers ?? {}) };
    next[key] = { ...(next[key] ?? {}), start: null };
    onChange({ ...sync, validated: false, periodMarkers: next });
  };

  const q1Ready = sync.periodMarkers?.['1']?.start != null;

  return (
    <div className="vmark-backdrop" onClick={onClose}>
      <div className="vmark-card" onClick={(e) => e.stopPropagation()}>
        <div className="vmark-head">
          <div>
            <b>⚙ Synchroniser la vidéo avec le LiveStat</b>
            <span>Déplace le curseur vidéo puis pose les débuts de Q1, Q2, Q3 et Q4.</span>
          </div>
          <button onClick={onClose}>×</button>
        </div>

        <div className="vmark-body">
          {!videoUrl ? (
            <div className="vmark-empty">
              <div className="vmark-empty-icon">🎬</div>
              <b>Ajoute la vidéo du match</b>
              <span>Le projet, les actions et les temps LiveStat restent inchangés.</span>
              <label className="vmark-file">
                <input type="file" accept="video/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) props.onPickVideoFile?.(f); }} />
                + Ajouter une vidéo locale
              </label>
            </div>
          ) : (
            <>
              <video ref={videoRef} src={videoUrl} controls className="vmark-video" />
              <div className="vmark-file-name">
                <span>🟢 {expectedFilename || 'Vidéo associée'}</span>
                <strong>{fmt(mediaTime)}</strong>
              </div>

              <div className="vmark-timeline">
                <input
                  aria-label="Position dans la vidéo"
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.1}
                  value={Math.min(mediaTime, duration || 1)}
                  onChange={(e) => seek(Number(e.target.value))}
                />
                <div className="vmark-nudges">
                  <button onClick={() => nudge(-1)}>−1 s</button>
                  <button onClick={() => nudge(-0.1)}>−0,1 s</button>
                  <b>CURSEUR {fmt(mediaTime)}</b>
                  <button onClick={() => nudge(0.1)}>+0,1 s</button>
                  <button onClick={() => nudge(1)}>+1 s</button>
                </div>
                {duration > 0 && (
                  <div className="vmark-dots" aria-hidden="true">
                    {periods.map((period) => {
                      const t = sync.periodMarkers?.[String(period)]?.start;
                      if (t == null) return null;
                      return <span key={period} style={{ left: `${Math.max(0, Math.min(100, Number(t) / duration * 100))}%` }}>Q{period}</span>;
                    })}
                  </div>
                )}
              </div>

              <div className="vmark-help">
                Q1 est obligatoire. Les autres repères sont recommandés : ils permettent de recaler chaque quart-temps indépendamment si la vidéo contient une mi-temps, une coupure ou un décalage de captation.
              </div>

              <div className="vmark-periods">
                {periods.map((period) => {
                  const marker = sync.periodMarkers?.[String(period)];
                  const sourceStart = sourceStartFor(period);
                  return (
                    <div className={`vmark-period ${marker?.start != null ? 'set' : ''}`} key={period}>
                      <div className="vmark-q"><b>{period <= 4 ? `Q${period}` : `OT${period - 4}`}</b><small>début de période</small></div>
                      <div className="vmark-time"><small>VIDÉO</small><strong>{fmt(marker?.start)}</strong></div>
                      <div className="vmark-source"><small>LIVE</small><span>{fmt(sourceStart)}</span></div>
                      <button className="place" onClick={() => setPeriodStart(period)}>📍 Placer ici</button>
                      {marker?.start != null && <button className="clear" onClick={() => clearPeriodStart(period)} title="Effacer ce repère">×</button>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="vmark-foot">
          <button className="secondary" onClick={onClose}>Fermer</button>
          <button className="primary" disabled={!videoUrl || !q1Ready} onClick={onValidate}>✓ Enregistrer les repères et synchroniser</button>
        </div>
      </div>

      <style jsx>{`
        .vmark-backdrop{position:fixed;inset:0;z-index:5000;background:rgba(2,5,12,.78);display:grid;place-items:center;padding:18px;backdrop-filter:blur(8px)}
        .vmark-card{width:min(1040px,97vw);max-height:95vh;overflow:auto;background:#0b1120;border:1px solid #25324a;border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.55);color:#fff}
        .vmark-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #202d43;background:#0d1525}.vmark-head b{display:block;font-size:16px}.vmark-head span{display:block;margin-top:3px;color:#8b98ad;font-size:11px}.vmark-head>button{width:34px;height:34px;border:0;border-radius:9px;background:#151f31;color:#fff;font-size:22px;cursor:pointer}
        .vmark-body{padding:16px}.vmark-video{width:100%;max-height:470px;background:#000;border-radius:14px;border:1px solid #26344d}.vmark-file-name{display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:9px 12px;border:1px solid #25324a;background:#111a2a;border-radius:10px;font-size:11px;color:#cbd5e1}.vmark-file-name strong{color:#d4a24c}
        .vmark-timeline{position:relative;margin-top:13px;padding:12px;border:1px solid #25324a;border-radius:12px;background:#0e1727}.vmark-timeline input{width:100%;accent-color:#d4a24c}.vmark-nudges{display:flex;align-items:center;justify-content:center;gap:7px;flex-wrap:wrap;margin-top:8px}.vmark-nudges button{border:1px solid #33445f;background:#151f31;color:#fff;border-radius:8px;padding:6px 9px;cursor:pointer}.vmark-nudges b{min-width:145px;text-align:center;color:#d4a24c;font-size:11px}.vmark-dots{position:relative;height:20px;margin:2px 7px 0}.vmark-dots span{position:absolute;top:2px;transform:translateX(-50%);font-size:9px;font-weight:950;color:#d4a24c}
        .vmark-help{margin:14px 0;padding:12px;border:1px solid rgba(212,162,76,.25);border-radius:10px;background:rgba(212,162,76,.07);color:#d6deea;font-size:12px;line-height:1.5}
        .vmark-periods{display:grid;gap:8px}.vmark-period{display:grid;grid-template-columns:90px 120px 120px 1fr 34px;align-items:center;gap:9px;padding:10px;border:1px solid #26344d;border-radius:12px;background:#101827}.vmark-period.set{border-color:rgba(212,162,76,.55)}.vmark-q b{display:block;font-size:16px}.vmark-q small,.vmark-time small,.vmark-source small{display:block;color:#77849a;font-size:8px;font-weight:950}.vmark-time strong{color:#d4a24c}.vmark-source span{font-size:12px;color:#cbd5e1}.vmark-period button{height:36px;border-radius:9px;font-weight:900;cursor:pointer}.vmark-period .place{border:1px solid #d4a24c;background:rgba(212,162,76,.10);color:#fff}.vmark-period .clear{border:1px solid #34435e;background:#151f31;color:#fff}
        .vmark-foot{display:flex;justify-content:flex-end;gap:9px;padding:14px 18px;border-top:1px solid #202d43;background:#0d1525}.vmark-foot button{height:40px;padding:0 16px;border-radius:10px;font-size:11px;font-weight:950;cursor:pointer}.vmark-foot .secondary{border:1px solid #34435e;background:#131d2e;color:#fff}.vmark-foot .primary{border:1px solid #8c1d34;background:#8c1d34;color:#fff}.vmark-foot .primary:disabled{opacity:.4;cursor:not-allowed}
        .vmark-empty{min-height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;border:1px dashed #34435e;border-radius:14px;background:#0e1727}.vmark-empty-icon{font-size:34px}.vmark-empty b{margin-top:8px}.vmark-empty span{margin-top:5px;color:#8492a7;font-size:11px}.vmark-file{margin-top:14px;padding:10px 14px;border:1px solid #d4a24c;border-radius:10px;background:rgba(212,162,76,.1);color:#d4a24c;font-size:11px;font-weight:950;cursor:pointer}.vmark-file input{display:none}
        @media(max-width:760px){.vmark-period{grid-template-columns:70px 1fr 1fr}.vmark-period .place{grid-column:1 / -2}.vmark-period .clear{grid-column:-2}.vmark-nudges b{order:-1;width:100%}}
      `}</style>
    </div>
  );
}
