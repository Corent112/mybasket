"use client";

import { useEffect, useState } from "react";
import type { MatchProjectFingerprint } from "@/lib/local-match-project";
import {
  getLocalMatchVideo,
} from "@/lib/local-video-registry";
import useLocalMatchVideoVersion from "@/hooks/useLocalMatchVideoVersion";
import {
  relinkMatchVideo,
  restoreMatchVideoForClip,
} from "@/lib/video/match-video-resolver";

type Props = {
  matchId: string;
  teamId: string;
  compact?: boolean;
  onConnected?: (url: string) => void;
};

export default function LocalMatchVideoButton({
  matchId,
  teamId,
  compact = false,
  onConnected,
}: Props) {
  useLocalMatchVideoVersion();

  const [expected, setExpected] = useState<MatchProjectFingerprint | null>(null);
  const [busy, setBusy] = useState(false);
  const [autoTried, setAutoTried] = useState(false);
  const connected = getLocalMatchVideo(matchId);

  useEffect(() => {
    let active = true;

    (async () => {
      if (!matchId || getLocalMatchVideo(matchId)) {
        setAutoTried(true);
        return;
      }

      try {
        const result = await restoreMatchVideoForClip(matchId, teamId);
        if (!active) return;

        setExpected(result.expected);
        if (result.video) onConnected?.(result.video.url);
      } catch {
        // Aucun popup d'erreur ici : si le fichier a bougé, le bouton de
        // relocalisation reste disponible.
      } finally {
        if (active) setAutoTried(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [matchId, teamId, onConnected]);

  const connect = async () => {
    setBusy(true);
    try {
      const result = await relinkMatchVideo(matchId, teamId, expected);
      if (!result) return;
      setExpected(result.fingerprint);
      onConnected?.(result.url);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      window.alert(
        error instanceof Error
          ? error.message
          : "Impossible de reconnecter la vidéo.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (connected) {
    return (
      <button
        type="button"
        onClick={connect}
        title={`Vidéo locale connectée : ${connected.file.name}`}
        className="local-video-connected"
      >
        ✓ {compact ? "Vidéo" : connected.file.name}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={connect}
      disabled={busy || !autoTried}
      className="local-video-reconnect"
    >
      🎥{" "}
      {busy
        ? "Relocalisation…"
        : !autoTried
          ? "Recherche de la vidéo…"
          : expected
            ? `Resélectionner ${expected.name}`
            : "Relier la vidéo du match"}
    </button>
  );
}
