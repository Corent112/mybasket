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

const restoreInFlight = new Map<string, Promise<RestoreResult>>();

function supabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/**
 * Enregistre la copie locale de CE navigateur pour un match commun au staff.
 * Les métadonnées/fingerprint sont partagées via Supabase ; le FileSystemHandle
 * reste volontairement dans IndexedDB, donc propre à cet ordinateur.
 */
export async function attachMatchVideoFile(
  matchId: string,
  teamId: string,
  file: File,
  handle?: FileSystemFileHandle | null,
): Promise<LocalMatchVideo> {
  if (!matchId) throw new Error("matchId manquant pour rattacher la vidéo.");

  const fingerprint = await fingerprintVideo(file);
  const supabase = supabaseClient();

  await saveMatchLocalMedia(supabase, {
    matchId,
    teamId,
    fingerprint,
  });

  if (handle) await savePersistentFileHandle(matchId, handle);

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
 * Résolveur UNIQUE de la vidéo locale d'un match.
 *
 * Ordre :
 * 1. registre mémoire de la session (instantané),
 * 2. métadonnées communes Supabase,
 * 3. handle local IndexedDB de CET ordinateur,
 * 4. réinjection dans le registre mémoire.
 *
 * Les appels concurrents pour le même match sont dédupliqués afin qu'une fiche
 * joueur/équipe ne relise pas plusieurs fois le même gros fichier.
 */
export async function restoreMatchVideoForClip(
  matchId: string,
  teamId?: string | null,
): Promise<RestoreResult> {
  if (!matchId) return { video: null, expected: null };

  const already = getLocalMatchVideo(matchId);
  if (already) return { video: already, expected: already.fingerprint };

  const running = restoreInFlight.get(matchId);
  if (running) return running;

  const task = (async (): Promise<RestoreResult> => {
    const supabase = supabaseClient();
    let expected: MatchProjectFingerprint | null = null;

    try {
      const row = await loadMatchLocalMedia(supabase, matchId);
      expected = fingerprintFromRow(row);
    } catch {
      // Ancien match : restorePersistentVideo sait encore migrer le registre
      // historique équipe + nom de fichier lorsqu'il dispose des métadonnées.
    }

    const restored = await restorePersistentVideo(matchId, expected, teamId);
    if (!restored) return { video: null, expected };

    setLocalMatchVideo(restored);
    return { video: restored, expected };
  })();

  restoreInFlight.set(matchId, task);
  try {
    return await task;
  } finally {
    restoreInFlight.delete(matchId);
  }
}

/**
 * Relocalisation manuelle. Le picker DOIT être la toute première opération
 * asynchrone appelée depuis le clic : Chrome exige encore l'activation utilisateur.
 */
export async function relinkMatchVideo(
  matchId: string,
  teamId: string,
  expected?: MatchProjectFingerprint | null,
): Promise<LocalMatchVideo | null> {
  if (!matchId) return null;

  // IMPORTANT : aucun await IndexedDB/Supabase avant cette ligne.
  const picked = await pickVideoFile();

  let expectedFingerprint = expected ?? null;
  if (!expectedFingerprint) {
    try {
      const row = await loadMatchLocalMedia(supabaseClient(), matchId);
      expectedFingerprint = fingerprintFromRow(row);
    } catch {
      // Premier rattachement / ancien match sans métadonnées.
    }
  }

  const fingerprint = await fingerprintVideo(picked.file);
  if (expectedFingerprint && !fingerprintsMatch(expectedFingerprint, fingerprint)) {
    const ok = window.confirm(
      `Ce fichier ne semble pas être la vidéo liée à ce match.\n\n` +
      `Attendu : ${expectedFingerprint.name}\n` +
      `Sélectionné : ${fingerprint.name}\n\n` +
      `Utiliser quand même ce fichier ?`,
    );
    if (!ok) return null;
  }

  const supabase = supabaseClient();
  await saveMatchLocalMedia(supabase, {
    matchId,
    teamId,
    fingerprint,
  });

  if (picked.handle) await savePersistentFileHandle(matchId, picked.handle);

  const video: LocalMatchVideo = {
    matchId,
    file: picked.file,
    url: URL.createObjectURL(picked.file),
    fingerprint,
  };

  setLocalMatchVideo(video);
  return video;
}
