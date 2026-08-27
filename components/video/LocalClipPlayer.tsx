 "use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LocalMatchVideoButton from "./LocalMatchVideoButton";
import { getLocalMatchVideoUrl } from "@/lib/local-video-registry";
import useLocalMatchVideoVersion from "@/hooks/useLocalMatchVideoVersion";

type Clip = {
  id?: string;
  match_id?: string | null;
  matchId?: string | null;
  clip_start?: number | null;
  clip_end?: number | null;
  clipStart?: number | null;
  clipEnd?: number | null;
  possessionStart?: number | null;
  possessionEnd?: number | null;
  video_time?: number | null;
  videoTime?: number | null;
  /** Bornes média déjà converties avec la synchro du match. */
  resolved_clip_start?: number | null;
  resolved_clip_end?: number | null;
};

type Props = {
  clip: Clip;
  teamId: string;
  autoPlay?: boolean;
};

const startOf = (clip: Clip) =>
  Number(
    clip.resolved_clip_start ??
      clip.clip_start ??
      clip.clipStart ??
      clip.video_time ??
      clip.videoTime ??
      clip.possessionStart ??
      0,
  );

const endOf = (clip: Clip) => {
  const start = startOf(clip);
  return Math.max(
    start + 0.1,
    Number(
      clip.resolved_clip_end ??
        clip.clip_end ??
        clip.clipEnd ??
        clip.possessionEnd ??
        start + 4,
    ),
  );
};

export default function LocalClipPlayer({ clip, teamId, autoPlay = true }: Props) {
  useLocalMatchVideoVersion();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [relative, setRelative] = useState(0);

  const matchId = String(clip.match_id ?? clip.matchId ?? "");
  const source = getLocalMatchVideoUrl(matchId);
  const start = startOf(clip);
  const end = endOf(clip);
  const duration = Math.max(0.1, end - start);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    const seek = () => {
      video.currentTime = start;
      setRelative(0);
      if (autoPlay) video.play().catch(() => {});
    };

    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });

    const onTime = () => {
      const value = Math.max(0, Math.min(duration, video.currentTime - start));
      setRelative(value);
      if (video.currentTime >= end - 0.03) {
        video.pause();
        video.currentTime = end;
        setRelative(duration);
      }
    };

    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [source, start, end, duration, autoPlay]);

  if (!matchId) return <div>Clip sans match lié.</div>;

  if (!source) {
    return (
      <div className="local-clip-missing">
        <strong>Vidéo locale non connectée</strong>
        <LocalMatchVideoButton matchId={matchId} teamId={teamId} />
      </div>
    );
  }

  return (
    <div className="local-clip-player">
      <video ref={videoRef} src={source} playsInline preload="metadata" />
      <div className="local-clip-controls">
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;
            if (video.paused) {
              if (video.currentTime >= end - 0.05) video.currentTime = start;
              video.play().catch(() => {});
            } else {
              video.pause();
            }
          }}
        >
          ▶ / ❚❚
        </button>
        <span>{relative.toFixed(1)}s</span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.05}
          value={relative}
          onChange={(e) => {
            const next = Number(e.target.value);
            setRelative(next);
            if (videoRef.current) videoRef.current.currentTime = start + next;
          }}
        />
        <span>{duration.toFixed(1)}s</span>
      </div>
    </div>
  );
}
