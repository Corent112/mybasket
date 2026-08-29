"use client";

import { createBrowserClient } from "@supabase/ssr";
import {
  fingerprintVideo,
  fingerprintsMatch,
  pickVideoFile,
  restorePersistentVideo,
  savePersistentFileHandle,
  type LocalMatchVideo,
  type MatchProjectFingerprint,
} from "@/lib/local-match-project";
import {
  fingerprintFromRow,
  loadMatchLocalMedia,
  saveMatchLocalMedia,
} from "@/lib/local-match-project-supabase";
import {
  getLocalMatchVideo,
  setLocalMatchVideo,
} from "@/lib/local-video-registry";

type RestoreResult = {
  video: LocalMatchVideo | null;
  expected: MatchProjectFingerprint | null;
};

function supabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Résolveur UNIQUE pour une vidéo locale de match.
 *
 * Règle :
 * matchId -> métadonnées Supabase -> handle local IndexedDB -> fichier.
 *
 * Le fichier vidéo lui-même n'est jamais uploadé.
 * Si le handle est encore valable, la vidéo est remise dans le registre mémoire.
 * Les fiches joueur / équipe / clips retrouvent donc la même source par matchId.
 */
export async function restoreMatchVideoForClip(
  matchId: string,
  teamId?: string | null,
): Promise<RestoreResult> {
  if (!matchId) return { video: null, expected: null };

  const already = getLocalMatchVideo(matchId);
  if (already) {
    return { video: already, expected: already.fingerprint };
  }

  const supabase = supabaseClient();

  let expected: MatchProjectFingerprint | null = null;
  try {
    const row = await loadMatchLocalMedia(supabase, matchId);
    expected = fingerprintFromRow(row);
  } catch {
    // Les métadonnées peuvent manquer sur un ancien match.
    // On tente quand même le handle local lié au matchId.
  }

  const restored = await restorePersistentVideo(matchId, expected, teamId);
  if (restored) {
    setLocalMatchVideo(restored);
    return { video: restored, expected };
  }

  return { video: null, expected };
}

/**
 * Enregistre/rattache un fichier déjà sélectionné à la source vidéo UNIQUE du match.
 * Cette fonction centralise le fingerprint, les métadonnées Supabase, le handle
 * persistant (quand le navigateur en fournit un) et le registre mémoire.
 * Elle ne touche jamais aux actions, clips, stats ou timecodes.
 */
export async function attachMatchVideoFile(
  matchId: string,
  teamId: string,
  file: File,
  handle?: FileSystemFileHandle | null,
): Promise<LocalMatchVideo> {
  if (!matchId) throw new Error("matchId manquant pour rattacher la vidéo.");

  const supabase = supabaseClient();
  const fingerprint = await fingerprintVideo(file);

  await saveMatchLocalMedia(supabase, {
    matchId,
    teamId,
    fingerprint,
  });

  if (handle) {
    await savePersistentFileHandle(matchId, handle);
  }

  const video: LocalMatchVideo = {
    matchId,
    file,
    url: URL.createObjectURL(file),
    fingerprint,
  };

  setLocalMatchVideo(video);
  return video;
}

/**
 * Relocalise UNE FOIS la vidéo d'un match.
 * Une fois le bon fichier choisi, le nouveau handle est mémorisé sous le même
 * matchId : toutes les actions/clips déjà codés restent valables.
 */
export async function relinkMatchVideo(
  matchId: string,
  teamId: string,
  expected?: MatchProjectFingerprint | null,
): Promise<LocalMatchVideo | null> {
  if (!matchId) return null;

  const picked = await pickVideoFile();
  const fingerprint = await fingerprintVideo(picked.file);

  if (expected && !fingerprintsMatch(expected, fingerprint)) {
    const ok = window.confirm(
      `Ce fichier ne semble pas être la vidéo liée à ce match.\n\n` +
      `Attendu : ${expected.name}\n` +
      `Sélectionné : ${fingerprint.name}\n\n` +
      `Utiliser quand même ce fichier ?`,
    );
    if (!ok) return null;
  }

  return attachMatchVideoFile(matchId, teamId, picked.file, picked.handle ?? null);
}
