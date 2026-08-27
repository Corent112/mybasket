 "use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  fingerprintVideo,
  fingerprintsMatch,
  pickVideoFile,
  restorePersistentVideo,
  savePersistentFileHandle,
  type MatchProjectFingerprint,
} from "@/lib/local-match-project";
import {
  getLocalMatchVideo,
  setLocalMatchVideo,
} from "@/lib/local-video-registry";
import {
  fingerprintFromRow,
  loadMatchLocalMedia,
  saveMatchLocalMedia,
} from "@/lib/local-match-project-supabase";
import useLocalMatchVideoVersion from "@/hooks/useLocalMatchVideoVersion";

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

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [expected, setExpected] = useState<MatchProjectFingerprint | null>(null);
  const [busy, setBusy] = useState(false);
  const connected = getLocalMatchVideo(matchId);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const row = await loadMatchLocalMedia(supabase, matchId);
        if (!active) return;
        const fp = fingerprintFromRow(row);
        setExpected(fp);

        if (!getLocalMatchVideo(matchId)) {
          const restored = await restorePersistentVideo(matchId, fp, teamId);
          if (restored && active) {
            setLocalMatchVideo(restored);
            onConnected?.(restored.url);
          }
        }
      } catch {
        // The button remains usable even if metadata is unavailable.
      }
    })();

    return () => {
      active = false;
    };
  }, [matchId]);

  const connect = async () => {
    setBusy(true);
    try {
      const picked = await pickVideoFile();
      const fingerprint = await fingerprintVideo(picked.file);

      if (expected && !fingerprintsMatch(expected, fingerprint)) {
        const ok = window.confirm(
          `Ce fichier ne semble pas être la vidéo liée à ce match.\n\nAttendu : ${expected.name}\nSélectionné : ${fingerprint.name}\n\nUtiliser quand même ce fichier ?`,
        );
        if (!ok) return;
      }

      await saveMatchLocalMedia(supabase, {
        matchId,
        teamId,
        fingerprint,
      });

      if (picked.handle) await savePersistentFileHandle(matchId, picked.handle);

      const url = URL.createObjectURL(picked.file);
      setLocalMatchVideo({
        matchId,
        file: picked.file,
        url,
        fingerprint,
      });
      setExpected(fingerprint);
      onConnected?.(url);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      window.alert(error instanceof Error ? error.message : "Impossible de connecter la vidéo.");
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
      disabled={busy}
      className="local-video-reconnect"
    >
      🎥 {busy ? "Connexion…" : expected ? "Relocaliser la vidéo" : "Connecter la vidéo"}
    </button>
  );
}
