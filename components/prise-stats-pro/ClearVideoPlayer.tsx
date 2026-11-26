"use client";

import { useRef, useState, type RefObject, type VideoHTMLAttributes } from "react";

type Props = Pick<VideoHTMLAttributes<HTMLVideoElement>, "src" | "onWheel" | "onLoadedMetadata" | "title"> & {
  videoRef: RefObject<HTMLVideoElement | null>;
  playbackRate?: number;
};

function formatTime(value: number) {
  const seconds = Math.floor(Number.isFinite(value) ? Math.max(0, value) : 0);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return [hours ? String(hours) : null, String(minutes).padStart(2, "0"), String(seconds % 60).padStart(2, "0")].filter(Boolean).join(":");
}

/** Safari dims the entire picture when native media controls appear.
 * Keep playback controls outside the picture, including while paused. */
export default function ClearVideoPlayer({ videoRef, playbackRate, onLoadedMetadata, ...props }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const lastAudibleVolume = useRef(1);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  }
  function toggleSound() {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || video.volume === 0) {
      if (video.volume === 0) video.volume = lastAudibleVolume.current;
      video.muted = false;
    } else {
      video.muted = true;
    }
  }

  async function fullscreen() {
    if (document.fullscreenElement === container.current) { await document.exitFullscreen().catch(() => {}); return; }
    await container.current?.requestFullscreen?.().catch(() => {});
  }

  return <div ref={container} className="clear-player">
    <video {...props} ref={videoRef} className="clear-player-picture" playsInline preload="auto"
      onClick={toggle}
      onLoadedMetadata={event => {
        const video = event.currentTarget;
        setDuration(Number.isFinite(video.duration) ? video.duration : 0);
        if (playbackRate) video.playbackRate = playbackRate;
        onLoadedMetadata?.(event);
        setTime(video.currentTime);
      }}
      onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
      onTimeUpdate={event => setTime(event.currentTarget.currentTime)}
      onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onVolumeChange={event => {
        const video = event.currentTarget;
        if (video.volume > 0) lastAudibleVolume.current = video.volume;
        setMuted(video.muted || video.volume === 0);
        setVolume(video.volume);
      }}
    />
    <div className="clear-player-controls" aria-label="Commandes vidéo" onKeyDown={event => event.stopPropagation()}>
      <button type="button" onClick={toggle} aria-label={playing ? "Pause" : "Lecture"} title={playing ? "Pause" : "Lecture"}>{playing ? "Ⅱ" : "▶"}</button>
      <span>{formatTime(time)}</span>
      <input type="range" aria-label="Position de lecture" min={0} max={duration || 1} step={0.1} value={Math.min(time, duration || 1)} disabled={!duration}
        onChange={event => { const next = Number(event.target.value); if (videoRef.current) videoRef.current.currentTime = next; setTime(next); }} />
      <span>{formatTime(duration)}</span>
      <button type="button" aria-label={muted ? "Activer le son" : "Couper le son"} title={muted ? "Activer le son" : "Couper le son"}
        onClick={toggleSound}>{muted ? "🔇" : "🔊"}</button>
      <input className="clear-player-volume" type="range" aria-label="Volume de la vidéo" title="Volume de la vidéo" min={0} max={1} step={0.05} value={muted ? 0 : volume}
        onChange={event => { const video = videoRef.current; if (video) { video.volume = Number(event.target.value); video.muted = video.volume === 0; } }} />
      <button type="button" aria-label="Plein écran" title="Plein écran" onClick={() => void fullscreen()}>⛶</button>
    </div>
    <style jsx>{`
      .clear-player { display:flex; flex-direction:column; flex:1 1 0; width:100%; min-height:0; background:#000; overflow:hidden; }
      .clear-player-picture { display:block; flex:1 1 0; width:100%; height:0; min-height:0; object-fit:contain; background:#000; opacity:1!important; filter:none!important; mix-blend-mode:normal!important; }
      .clear-player-controls { display:flex; flex:0 0 auto; align-items:center; gap:7px; padding:5px 8px; min-height:32px; background:#171c2a; color:#fff; font-size:11px; font-variant-numeric:tabular-nums; white-space:nowrap; }
      .clear-player-controls button { flex-shrink:0; min-width:25px; min-height:25px; border:0; border-radius:5px; background:transparent; color:#fff; font-size:14px; cursor:pointer; }
      .clear-player-controls button:hover { background:#333b4d; }
      .clear-player-controls input { flex:1; min-width:20px; width:0; accent-color:#d4a24c; cursor:pointer; }
      .clear-player-controls .clear-player-volume { flex:0 1 52px; }
      .clear-player:fullscreen { width:100vw; height:100vh; }
      @media(max-width:500px) { .clear-player-controls { gap:4px; padding-inline:4px; } .clear-player-controls .clear-player-volume { flex-basis:42px; } }
    `}</style>
  </div>;
}
