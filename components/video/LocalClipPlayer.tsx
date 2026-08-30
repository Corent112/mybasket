"use client";

import { useEffect, useRef, useState } from "react";
import LocalMatchVideoButton from "./LocalMatchVideoButton";
import { getLocalMatchVideoUrl } from "@/lib/local-video-registry";
import useLocalMatchVideoVersion from "@/hooks/useLocalMatchVideoVersion";
import { restoreMatchVideoForClip } from "@/lib/video/match-video-resolver";
import VideoLibraryButton from "@/components/video/VideoLibraryButton";

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
  const restoreKeyRef = useRef("");
  const [relative, setRelative] = useState(0);
  const [restoring, setRestoring] = useState(false);
  const [restoreDone, setRestoreDone] = useState(false);

  const matchId = String(clip.match_id ?? clip.matchId ?? "");
  const source = getLocalMatchVideoUrl(matchId);
  const start = startOf(clip);
  const end = endOf(clip);
  const duration = Math.max(0.1, end - start);

  /**
   * Point important :
   * la fiche joueur ne doit pas attendre que l'utilisateur retourne dans
   * LiveStats. Dès que le clip s'ouvre, on résout sa vidéo par matchId.
   */
  useEffect(() => {
    if (!matchId || source) {
      setRestoreDone(true);
      return;
    }

    const key = `${matchId}:${teamId}`;
    if (restoreKeyRef.current === key) return;
    restoreKeyRef.current = key;

    let active = true;
    setRestoring(true);
    setRestoreDone(false);

    void restoreMatchVideoForClip(matchId, teamId)
      .catch(() => null)
      .finally(() => {
        if (!active) return;
        setRestoring(false);
        setRestoreDone(true);
      });

    return () => {
      active = false;
    };
  }, [matchId, teamId, source]);

  /**
   * Dès que la source est retrouvée, le lecteur se place DIRECTEMENT sur les
   * bornes de l'action et lance le clip. Pas le match depuis le début.
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    let disposed = false;

    const seekAndPlay = () => {
      if (disposed) return;
      try {
        video.currentTime = start;
      } catch {
        return;
      }
      setRelative(0);
      if (autoPlay) {
        void video.play().catch(() => {
          // Certains navigateurs peuvent bloquer l'autoplay avec son.
          // Le clip est malgré tout déjà positionné au bon timecode.
        });
      }
    };

    if (video.readyState >= 1) seekAndPlay();
    else video.addEventListener("loadedmetadata", seekAndPlay, { once: true });

    const onTime = () => {
      const value = Math.max(0, Math.min(duration, video.currentTime - start));
      setRelative(value);

      if (video.currentTime >= end - 0.03) {
        video.pause();
        try {
          video.currentTime = end;
        } catch {}
        setRelative(duration);
      }
    };

    video.addEventListener("timeupdate", onTime);

    return () => {
      disposed = true;
      video.removeEventListener("loadedmetadata", seekAndPlay);
      video.removeEventListener("timeupdate", onTime);
    };
  }, [source, start, end, duration, autoPlay]);

  if (!matchId) return <div>Clip sans match lié.</div>;

  if (!source && restoring) {
    return (
      <div className="local-clip-missing">
        <strong>🎬 Ouverture du clip…</strong>
        <span>MyBasket recherche automatiquement la vidéo liée à ce match.</span>
      </div>
    );
  }

  if (!source && restoreDone) {
    return (
      <div className="local-clip-missing">
        <strong>Vidéo du match introuvable à son emplacement mémorisé</strong>
        <span>
          Les actions et les clips sont conservés. Autorise ton dossier vidéos
          une fois : tous tes projets la retrouveront ensuite automatiquement.
        </span>

        {/* Chemin recommandé : un dossier autorisé couvre tous les matchs. */}
        <VideoLibraryButton
          onReconnected={() => {
            restoreKeyRef.current = "";
            setRestoreDone(false);
            setRestoring(true);
            void restoreMatchVideoForClip(matchId, teamId, { interactive: true })
              .catch(() => null)
              .finally(() => {
                setRestoring(false);
                setRestoreDone(true);
              });
          }}
        />

        {/* Repli historique : sélection du fichier de CE match uniquement. */}
        <LocalMatchVideoButton matchId={matchId} teamId={teamId} />
      </div>
    );
  }

  if (!source) {
    return (
      <div className="local-clip-missing">
        <strong>🎬 Préparation du clip…</strong>
      </div>
    );
  }

  return (
    <div className="local-clip-player">
      <video
        ref={videoRef}
        src={source}
        controls
        playsInline
        preload="metadata"
      />
      <div className="local-clip-controls">
        <button
          type="button"
          onClick={() => {
            const video = videoRef.current;
            if (!video) return;

            if (video.paused) {
              if (video.currentTime >= end - 0.05) video.currentTime = start;
              void video.play().catch(() => {});
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
          onChange={(event) => {
            const next = Number(event.target.value);
            setRelative(next);
            if (videoRef.current) {
              videoRef.current.currentTime = start + next;
            }
          }}
        />

        <span>{duration.toFixed(1)}s</span>
      </div>
    </div>
  );
}
