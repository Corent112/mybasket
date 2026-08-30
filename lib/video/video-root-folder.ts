"use client";

/**
 * lib/video/video-root-folder.ts
 * ---------------------------------------------------------------------------
 * « Le dossier racine des matchs est ici. »
 *
 * Ce chemin est DÉCLARATIF : il est enregistré sur le compte MyBasket
 * (profiles.video_root_folder), donc il suit l'utilisateur d'un navigateur à
 * l'autre et d'une machine à l'autre. Le serveur ne lit jamais le disque.
 *
 * À ne pas confondre avec lib/video/video-library.ts, qui gère l'AUTORISATION
 * technique d'accès au dossier. Celle-ci ne peut pas traverser les navigateurs
 * (sécurité du système de fichiers). Séparer les deux permet d'afficher
 * exactement la même information partout, quel que soit le moteur.
 */

import { createClient } from "@/lib/supabase/client";

const CACHE_KEY = "mybasket_video_root_folder";

/** Lecture immédiate depuis le cache local, pour un affichage sans attente. */
export function readCachedVideoRootFolder(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(CACHE_KEY) || "";
  } catch {
    return "";
  }
}

function writeCache(value: string) {
  try {
    if (value) window.localStorage.setItem(CACHE_KEY, value);
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // navigation privée : le cache est un simple confort
  }
}

/** Valeur de référence, lue sur le compte. Retombe sur le cache en cas d'échec. */
export async function getVideoRootFolder(): Promise<string> {
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return readCachedVideoRootFolder();

    const { data, error } = await supabase
      .from("profiles")
      .select("video_root_folder")
      .eq("id", userId)
      .maybeSingle();

    if (error) return readCachedVideoRootFolder();

    const value = String((data as { video_root_folder?: string | null } | null)?.video_root_folder || "");
    writeCache(value);
    return value;
  } catch {
    return readCachedVideoRootFolder();
  }
}

/** Enregistre le dossier déclaré sur le compte. */
export async function setVideoRootFolder(value: string): Promise<boolean> {
  const clean = value.trim();
  writeCache(clean);
  try {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return false;

    const { error } = await supabase
      .from("profiles")
      .update({ video_root_folder: clean || null })
      .eq("id", userId);

    return !error;
  } catch {
    return false;
  }
}
