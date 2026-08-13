 "use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import {
  downloadMatchProjectFile,
  fingerprintVideo,
  pickVideoFile,
  savePersistentFileHandle,
  type MatchProjectDescriptor,
} from "@/lib/local-match-project";
import { setLocalMatchVideo } from "@/lib/local-video-registry";
import { saveMatchLocalMedia } from "@/lib/local-match-project-supabase";

type Props = {
  matchId: string;
  teamId: string;
  opponent?: string | null;
  matchDate?: string | null;
  onReady?: (url: string) => void;
};

export default function MatchProjectManager(props: Props) {
  const [busy, setBusy] = useState(false);
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const createProject = async () => {
    setBusy(true);
    try {
      const picked = await pickVideoFile();
      const fingerprint = await fingerprintVideo(picked.file);

      await saveMatchLocalMedia(supabase, {
        matchId: props.matchId,
        teamId: props.teamId,
        fingerprint,
      });

      if (picked.handle) {
        await savePersistentFileHandle(props.matchId, picked.handle);
      }

      const url = URL.createObjectURL(picked.file);
      setLocalMatchVideo({
        matchId: props.matchId,
        file: picked.file,
        url,
        fingerprint,
      });

      const now = new Date().toISOString();
      const descriptor: MatchProjectDescriptor = {
        version: 1,
        projectId: crypto.randomUUID(),
        matchId: props.matchId,
        teamId: props.teamId,
        opponent: props.opponent,
        matchDate: props.matchDate,
        createdAt: now,
        updatedAt: now,
        video: fingerprint,
      };

      downloadMatchProjectFile(descriptor);
      props.onReady?.(url);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      window.alert(error instanceof Error ? error.message : "Création du projet impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={createProject} disabled={busy}>
      📦 {busy ? "Création…" : "Créer / associer le Projet Match"}
    </button>
  );
}
