"use client";

/**
 * lib/video/video-library.ts
 * ---------------------------------------------------------------------------
 * BIBLIOTHÈQUE VIDÉO LOCALE — autoriser un DOSSIER une fois, retrouver toutes
 * les vidéos de match à l'intérieur.
 *
 * Pourquoi ce module existe
 * -------------------------
 * Jusqu'ici MyBasket mémorisait un FileSystemFileHandle PAR MATCH. Deux limites :
 *
 *  1. la permission d'un handle ne survit pas au redémarrage du navigateur :
 *     au rechargement, queryPermission() renvoie "prompt" et requestPermission()
 *     exige une activation utilisateur. Appelé depuis un useEffect (donc sans
 *     clic), il échoue et la vidéo reste introuvable ;
 *  2. l'autorisation était à redonner match par match.
 *
 * Un handle de DOSSIER règle les deux : l'autorisation est RÉCURSIVE (elle
 * couvre les sous-dossiers, donc l'organisation par saison ou par équipe reste
 * libre) et elle couvre les matchs futurs sans rien re-sélectionner.
 *
 * Ce que ce module ne fait pas
 * ----------------------------
 * Aucune vidéo n'est copiée, déplacée ni envoyée sur un serveur. IndexedDB ne
 * garde que le handle accordé par le navigateur, sur cet ordinateur.
 *
 * Cloisonnement par utilisateur
 * -----------------------------
 * IndexedDB est propre à un navigateur, PAS à un compte MyBasket : deux coachs
 * partageant un ordinateur et une session Chrome verraient sinon la même
 * bibliothèque. Chaque dossier est donc enregistré avec l'`ownerId` du compte
 * connecté, et les lectures sont filtrées dessus. Chacun autorise son propre
 * dossier, sur son propre ordinateur, et ne voit que le sien.
 *
 * À l'inverse, l'empreinte du fichier (nom, taille, durée) reste partagée via
 * Supabase : un collègue qui ouvre le même match cherchera le même nom de
 * fichier dans SON dossier à lui. C'est exactement le comportement voulu.
 *
 * Compatibilité
 * -------------
 * Chrome / Edge (bureau) : supporté. Safari et Firefox n'implémentent pas
 * l'API File System Access — supportsVideoLibrary() renvoie false et les
 * appelants gardent leur repli <input type="file">.
 *
 * Zéro clic
 * ---------
 * Dans un onglet classique, Chrome redemande l'autorisation une fois par
 * session. Installée en application (menu ⋮ → « Installer MyBasket »), Chrome
 * peut conserver la permission d'un lancement à l'autre : la vidéo se recharge
 * alors sans aucun clic.
 */

import type { MatchProjectFingerprint } from "@/lib/local-match-project";

export type LibraryPermission = "granted" | "prompt" | "denied";

export type VideoLibraryFolder = {
  id: string;
  name: string;
  addedAt: number;
};

/**
 * Identifiant du propriétaire de la bibliothèque : l'id du compte MyBasket
 * connecté. `local` sert de repli quand aucun compte n'est connu (hors ligne,
 * page publique) : la bibliothèque reste alors utilisable mais isolée.
 */
export type LibraryOwner = string;

const DEFAULT_OWNER: LibraryOwner = "local";

const normalizeOwner = (owner?: LibraryOwner | null): LibraryOwner =>
  owner && String(owner).trim() ? String(owner).trim() : DEFAULT_OWNER;

export type VideoLibraryStatus =
  | { state: "unsupported" }
  | { state: "empty" }
  | { state: "granted"; folders: VideoLibraryFolder[] }
  | { state: "prompt"; folders: VideoLibraryFolder[] };

type DirectoryHandle = {
  kind: "directory";
  name: string;
  values: () => AsyncIterable<DirectoryHandle | FileHandleLike>;
  queryPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<LibraryPermission>;
  requestPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<LibraryPermission>;
};

type FileHandleLike = {
  kind: "file";
  name: string;
  getFile: () => Promise<File>;
};

type StoredFolder = { id: string; ownerId: LibraryOwner; handle: DirectoryHandle; addedAt: number };

const DB_NAME = "mybasket-video-library";
const DB_VERSION = 1;
const STORE = "folders";

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"];

/* -------------------------------------------------------------------------- */
/* Support navigateur                                                         */
/* -------------------------------------------------------------------------- */

export function supportsVideoLibrary(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/* -------------------------------------------------------------------------- */
/* Stockage IndexedDB                                                         */
/* -------------------------------------------------------------------------- */

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readFolders(owner?: LibraryOwner | null): Promise<StoredFolder[]> {
  const db = await openDb();
  if (!db) return [];
  const ownerId = normalizeOwner(owner);
  try {
    const all = await new Promise<StoredFolder[]>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as StoredFolder[]) ?? []);
      request.onerror = () => resolve([]);
    });
    // Les enregistrements créés avant le cloisonnement n'ont pas d'ownerId :
    // on les rattache au compte courant plutôt que de les perdre.
    return all.filter((item) => normalizeOwner(item.ownerId) === ownerId || !item.ownerId);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

async function writeFolder(folder: StoredFolder): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(folder);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
}

/** Retire un dossier de la bibliothèque. Le dossier lui-même n'est pas touché. */
export async function forgetVideoFolder(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } finally {
    db.close();
  }
  cache.clear();
}

/* -------------------------------------------------------------------------- */
/* Permissions                                                                */
/* -------------------------------------------------------------------------- */

/** Interroge la permission SANS jamais la demander : ne requiert aucun clic. */
async function peekPermission(handle: DirectoryHandle): Promise<LibraryPermission> {
  try {
    return (await handle.queryPermission?.({ mode: "read" })) ?? "prompt";
  } catch {
    return "prompt";
  }
}

/**
 * État de la bibliothèque, sans effet de bord et sans clic.
 * `granted` = au moins un dossier est immédiatement lisible.
 */
export async function videoLibraryStatus(owner?: LibraryOwner | null): Promise<VideoLibraryStatus> {
  if (!supportsVideoLibrary()) return { state: "unsupported" };

  const stored = await readFolders(owner);
  if (!stored.length) return { state: "empty" };

  const folders = stored.map((item) => ({
    id: item.id,
    name: item.handle?.name || "Dossier vidéos",
    addedAt: item.addedAt,
  }));

  for (const item of stored) {
    if ((await peekPermission(item.handle)) === "granted") {
      return { state: "granted", folders };
    }
  }
  return { state: "prompt", folders };
}

/**
 * Redonne l'accès aux dossiers mémorisés.
 * DOIT être appelé depuis un gestionnaire de clic : Chrome exige une
 * activation utilisateur pour requestPermission().
 */
export async function grantVideoLibraryAccess(owner?: LibraryOwner | null): Promise<boolean> {
  if (!supportsVideoLibrary()) return false;
  const stored = await readFolders(owner);
  let any = false;
  for (const item of stored) {
    try {
      const current = await peekPermission(item.handle);
      const next =
        current === "granted"
          ? "granted"
          : ((await item.handle.requestPermission?.({ mode: "read" })) ?? "denied");
      if (next === "granted") any = true;
    } catch {
      // dossier supprimé/déplacé : on l'ignore, l'utilisateur pourra le réajouter
    }
  }
  if (any) cache.clear();
  return any;
}

/**
 * Ajoute un dossier à la bibliothèque.
 * DOIT être appelé depuis un gestionnaire de clic.
 */
export async function addVideoFolder(owner?: LibraryOwner | null): Promise<VideoLibraryFolder | null> {
  if (!supportsVideoLibrary()) return null;

  const picker = (
    window as unknown as {
      showDirectoryPicker?: (options?: { mode?: "read" | "readwrite"; id?: string }) => Promise<DirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (typeof picker !== "function") return null;

  let handle: DirectoryHandle;
  try {
    handle = await picker({ mode: "read", id: "mybasket-videos" });
  } catch {
    return null; // l'utilisateur a annulé
  }
  if (!handle) return null;

  const existing = await readFolders(owner);
  const duplicate = existing.find((item) => item.handle?.name === handle.name);
  const id = duplicate?.id ?? `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  await writeFolder({ id, ownerId: normalizeOwner(owner), handle, addedAt: Date.now() });
  cache.clear();

  return { id, name: handle.name, addedAt: Date.now() };
}

/* -------------------------------------------------------------------------- */
/* Recherche d'une vidéo dans la bibliothèque                                  */
/* -------------------------------------------------------------------------- */

type IndexedFile = { name: string; handle: FileHandleLike };

/** Index par dossier, valable le temps de la session : un dossier vidéos bouge peu. */
const cache = new Map<string, IndexedFile[]>();

const isVideoName = (name: string) => {
  const lower = name.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

/** Parcours récursif borné : suffisant pour une arborescence saison/équipe. */
async function indexFolder(handle: DirectoryHandle, depth = 0, budget = { left: 4000 }): Promise<IndexedFile[]> {
  if (depth > 4 || budget.left <= 0) return [];
  const out: IndexedFile[] = [];
  try {
    for await (const entry of handle.values()) {
      if (budget.left <= 0) break;
      budget.left -= 1;
      if (entry.kind === "file") {
        if (isVideoName(entry.name)) out.push({ name: entry.name, handle: entry as FileHandleLike });
      } else if (entry.kind === "directory") {
        if (entry.name.startsWith(".")) continue;
        out.push(...(await indexFolder(entry as DirectoryHandle, depth + 1, budget)));
      }
    }
  } catch {
    // permission retirée entre-temps, ou dossier déplacé
  }
  return out;
}

/**
 * Retrouve le fichier correspondant à une empreinte, dans les dossiers déjà
 * autorisés. N'ouvre AUCUNE fenêtre et ne demande AUCUNE permission : si aucun
 * dossier n'est lisible, renvoie null et l'appelant affiche son bouton.
 *
 * Ordre de correspondance :
 *   1. même nom de fichier (cas normal) ;
 *   2. même taille + même date de modification (fichier renommé) ;
 *   3. même taille seule, si un seul candidat (dernier recours prudent).
 */
export async function findVideoInLibrary(
  expected: MatchProjectFingerprint | null | undefined,
  owner?: LibraryOwner | null,
): Promise<File | null> {
  if (!expected || !supportsVideoLibrary()) return null;

  const stored = await readFolders(owner);
  if (!stored.length) return null;

  const wantedName = String(expected.name || "").trim().toLowerCase();
  const wantedSize = Number(expected.size || 0);
  const wantedModified = Number(expected.lastModified || 0);

  for (const item of stored) {
    if ((await peekPermission(item.handle)) !== "granted") continue;

    let files = cache.get(item.id);
    if (!files) {
      files = await indexFolder(item.handle);
      cache.set(item.id, files);
    }
    if (!files.length) continue;

    // 1. par nom
    if (wantedName) {
      const byName = files.find((f) => f.name.trim().toLowerCase() === wantedName);
      if (byName) {
        try {
          return await byName.handle.getFile();
        } catch {
          // fichier supprimé : on continue avec les autres stratégies
        }
      }
    }

    // 2. et 3. par taille (+ date si disponible)
    if (wantedSize > 0) {
      const sized: File[] = [];
      for (const candidate of files) {
        try {
          const file = await candidate.handle.getFile();
          if (file.size !== wantedSize) continue;
          if (wantedModified && Number(file.lastModified || 0) === wantedModified) return file;
          sized.push(file);
        } catch {
          // ignore
        }
      }
      if (sized.length === 1) return sized[0];
    }
  }

  return null;
}

/** Vide l'index de session (après ajout de fichiers dans le dossier). */
export function refreshVideoLibraryIndex(): void {
  cache.clear();
}
