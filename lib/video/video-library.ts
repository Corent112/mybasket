"use client";

/**
 * lib/video/video-library.ts
 * ---------------------------------------------------------------------------
 * BIBLIOTHÈQUE VIDÉO LOCALE — retrouver toute seule la vidéo d'un match, quel
 * que soit le navigateur.
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
 * TROIS MODES, UNE SEULE LOGIQUE
 * ------------------------------
 * Le navigateur ne décide QUE de la façon de désigner les fichiers. La logique
 * MyBasket (dossier racine déclaré + recherche par empreinte) est la même
 * partout, ce qui permet de changer de moteur sans changer d'habitude.
 *
 *   - "directory" (Chrome, Edge) : l'utilisateur autorise UN DOSSIER racine.
 *     L'autorisation est récursive (sous-dossiers saison/équipe libres) et
 *     couvre les matchs futurs sans rien re-sélectionner. C'est le mode idéal.
 *
 *   - "files" : pas de showDirectoryPicker() mais showOpenFilePicker() existe.
 *     L'utilisateur sélectionne SES VIDÉOS ; les handles sont mémorisés
 *     durablement, exactement comme un dossier, fichier par fichier.
 *
 *   - "manual" (Safari, Firefox aujourd'hui) : aucune API de handle. On garde
 *     les fichiers choisis EN MÉMOIRE pour la session : une seule sélection
 *     suffit ensuite pour tous les projets ouverts dans cet onglet. Le dossier
 *     racine déclaré (voir video-root-folder.ts) indique où aller les chercher.
 *
 * Ce que ce module ne fait pas
 * ----------------------------
 * Aucune vidéo n'est copiée, déplacée ni envoyée sur un serveur. IndexedDB ne
 * garde que les handles accordés par le navigateur, sur cet ordinateur.
 *
 * Cloisonnement par utilisateur
 * -----------------------------
 * IndexedDB est propre à un navigateur, PAS à un compte MyBasket : deux coachs
 * partageant un ordinateur et une session Chrome verraient sinon la même
 * bibliothèque. Chaque entrée est donc enregistrée avec l'`ownerId` du compte
 * connecté, et les lectures sont filtrées dessus.
 *
 * À l'inverse, l'empreinte du fichier (nom, taille, durée) reste partagée via
 * Supabase : un collègue qui ouvre le même match cherchera le même nom de
 * fichier dans SON dossier à lui. C'est exactement le comportement voulu.
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
 * Façon dont CE navigateur sait désigner des vidéos locales.
 * Voir l'en-tête du fichier : la logique produit ne change pas, seul le
 * sélecteur change.
 */
export type VideoLibraryMode = "directory" | "files" | "manual";

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
  | { state: "unsupported"; mode: VideoLibraryMode }
  | { state: "empty"; mode: VideoLibraryMode }
  | { state: "granted"; mode: VideoLibraryMode; folders: VideoLibraryFolder[] }
  | { state: "prompt"; mode: VideoLibraryMode; folders: VideoLibraryFolder[] };

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
  queryPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<LibraryPermission>;
  requestPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<LibraryPermission>;
};

type AnyHandle = DirectoryHandle | FileHandleLike;

/**
 * `kind` est facultatif : les enregistrements créés avant l'ajout du mode
 * « fichiers » sont tous des dossiers. On ne migre rien.
 */
type StoredEntry = {
  id: string;
  ownerId: LibraryOwner;
  kind?: "directory" | "file";
  handle: AnyHandle;
  addedAt: number;
};

const DB_NAME = "mybasket-video-library";
const DB_VERSION = 1;
const STORE = "folders";

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"];

const entryKind = (entry: StoredEntry): "directory" | "file" =>
  entry.kind === "file" || entry.handle?.kind === "file" ? "file" : "directory";

/* -------------------------------------------------------------------------- */
/* Support navigateur                                                         */
/* -------------------------------------------------------------------------- */

/** Mode de sélection disponible ici. Ne dépend d'aucun user-agent : on teste l'API. */
export function videoLibraryMode(): VideoLibraryMode {
  if (typeof window === "undefined") return "manual";
  if ("showDirectoryPicker" in window) return "directory";
  if ("showOpenFilePicker" in window) return "files";
  return "manual";
}

/** true quand le navigateur sait mémoriser un DOSSIER entier (Chrome, Edge). */
export function supportsVideoLibrary(): boolean {
  return videoLibraryMode() === "directory";
}

/** true quand le navigateur sait mémoriser durablement des FICHIERS choisis. */
export function supportsVideoFileHandles(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/* -------------------------------------------------------------------------- */
/* Repli mémoire (mode "manual" : Safari, Firefox)                            */
/* -------------------------------------------------------------------------- */

/**
 * Vidéos choisies à la main pendant CETTE session d'onglet. Rien n'est
 * persisté : aucune API ne le permet dans ce mode. L'intérêt reste réel — une
 * seule sélection alimente ensuite tous les projets, fiches équipe et fiches
 * individuelles ouverts sans recharger la page.
 */
const sessionVideos = new Map<string, File>();

const sessionKey = (file: File) => `${file.name}::${file.size}::${file.lastModified || 0}`;

/** Mémorise pour la session les vidéos choisies via <input type="file">. */
export function rememberSessionVideos(files: FileList | File[] | null | undefined): number {
  const list = files ? Array.from(files as ArrayLike<File>) : [];
  for (const file of list) {
    if (!file || !isVideoName(file.name)) continue;
    sessionVideos.set(sessionKey(file), file);
  }
  return sessionVideos.size;
}

/**
 * Sélection d'un dossier via <input webkitdirectory> (Safari/Firefox/anciens
 * moteurs). Le navigateur ne fournit pas de handle persistant, mais tous les
 * fichiers du dossier deviennent disponibles pour la session en un seul clic.
 */
export function sessionDirectoryName(files: FileList | File[] | null | undefined): string | null {
  const first = files ? Array.from(files as ArrayLike<File>)[0] : null;
  if (!first) return null;
  const relative = String((first as File & { webkitRelativePath?: string }).webkitRelativePath || "");
  const root = relative.split("/").filter(Boolean)[0];
  return root || null;
}

/** Nombre de vidéos mémorisées pour la session (mode manuel). */
export function sessionVideoCount(): number {
  return sessionVideos.size;
}

/** Oublie les vidéos mémorisées pour la session. */
export function forgetSessionVideos(): void {
  sessionVideos.clear();
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

async function readEntries(owner?: LibraryOwner | null): Promise<StoredEntry[]> {
  const db = await openDb();
  if (!db) return [];
  const ownerId = normalizeOwner(owner);
  try {
    const all = await new Promise<StoredEntry[]>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as StoredEntry[]) ?? []);
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

async function writeEntry(entry: StoredEntry): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
}

/** Retire un dossier (ou un fichier) de la bibliothèque. Le disque n'est pas touché. */
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

/**
 * Interroge la permission SANS jamais la demander : ne requiert aucun clic.
 * Quand l'API de permission n'existe pas (Safari), on considère le handle
 * comme lisible : c'est getFile() qui tranchera.
 */
async function peekPermission(handle: AnyHandle): Promise<LibraryPermission> {
  if (typeof handle?.queryPermission !== "function") return "granted";
  try {
    return (await handle.queryPermission({ mode: "read" })) ?? "prompt";
  } catch {
    return "prompt";
  }
}

const entryLabel = (entry: StoredEntry): string =>
  entry.handle?.name || (entryKind(entry) === "file" ? "Vidéo" : "Dossier vidéos");

/**
 * État de la bibliothèque, sans effet de bord et sans clic.
 * `granted` = au moins une entrée est immédiatement lisible.
 */
export async function videoLibraryStatus(owner?: LibraryOwner | null): Promise<VideoLibraryStatus> {
  const mode = videoLibraryMode();
  if (typeof window === "undefined") return { state: "unsupported", mode };

  if (mode === "manual") {
    if (!sessionVideos.size) return { state: "empty", mode };
    return {
      state: "granted",
      mode,
      folders: Array.from(sessionVideos.values()).map((file, index) => ({
        id: `session-${index}`,
        name: file.name,
        addedAt: file.lastModified || Date.now(),
      })),
    };
  }

  const stored = await readEntries(owner);
  if (!stored.length) return { state: "empty", mode };

  const folders = stored.map((item) => ({
    id: item.id,
    name: entryLabel(item),
    addedAt: item.addedAt,
  }));

  for (const item of stored) {
    if ((await peekPermission(item.handle)) === "granted") {
      return { state: "granted", mode, folders };
    }
  }
  return { state: "prompt", mode, folders };
}

/**
 * Redonne l'accès aux entrées mémorisées.
 * DOIT être appelé depuis un gestionnaire de clic : Chrome exige une
 * activation utilisateur pour requestPermission().
 */
export async function grantVideoLibraryAccess(owner?: LibraryOwner | null): Promise<boolean> {
  if (videoLibraryMode() === "manual") return false;
  const stored = await readEntries(owner);
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
      // entrée supprimée/déplacée : on l'ignore, l'utilisateur pourra la réajouter
    }
  }
  if (any) cache.clear();
  return any;
}

/**
 * Ajoute un DOSSIER racine à la bibliothèque (Chrome, Edge).
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

  const existing = await readEntries(owner);
  const duplicate = existing.find(
    (item) => entryKind(item) === "directory" && item.handle?.name === handle.name,
  );
  const id = duplicate?.id ?? `folder-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  await writeEntry({ id, ownerId: normalizeOwner(owner), kind: "directory", handle, addedAt: Date.now() });
  cache.clear();

  return { id, name: handle.name, addedAt: Date.now() };
}

/**
 * Ajoute des FICHIERS vidéo à la bibliothèque, quand le navigateur sait
 * mémoriser des handles de fichier mais pas de dossier.
 * DOIT être appelé depuis un gestionnaire de clic.
 */
export async function addVideoFiles(owner?: LibraryOwner | null): Promise<VideoLibraryFolder[]> {
  if (!supportsVideoFileHandles()) return [];

  const picker = (
    window as unknown as {
      showOpenFilePicker?: (options?: Record<string, unknown>) => Promise<FileHandleLike[]>;
    }
  ).showOpenFilePicker;
  if (typeof picker !== "function") return [];

  let handles: FileHandleLike[];
  try {
    handles = await picker({
      multiple: true,
      types: [
        {
          description: "Vidéos de match",
          accept: { "video/*": VIDEO_EXTENSIONS },
        },
      ],
    });
  } catch {
    return []; // l'utilisateur a annulé
  }
  if (!handles?.length) return [];

  const existing = await readEntries(owner);
  const added: VideoLibraryFolder[] = [];

  for (const handle of handles) {
    if (!handle?.name) continue;
    const duplicate = existing.find(
      (item) => entryKind(item) === "file" && item.handle?.name === handle.name,
    );
    const id = duplicate?.id ?? `file-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const addedAt = Date.now();
    await writeEntry({ id, ownerId: normalizeOwner(owner), kind: "file", handle, addedAt });
    added.push({ id, name: handle.name, addedAt });
  }

  cache.clear();
  return added;
}

/* -------------------------------------------------------------------------- */
/* Recherche d'une vidéo dans la bibliothèque                                  */
/* -------------------------------------------------------------------------- */

type IndexedFile = { name: string; handle: FileHandleLike };

/** Index par dossier, valable le temps de la session : un dossier vidéos bouge peu. */
const cache = new Map<string, IndexedFile[]>();

const isVideoName = (name: string) => {
  const lower = String(name || "").toLowerCase();
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

/** Le fichier correspond-il à l'empreinte attendue ? (nom, puis taille + date) */
function fileMatches(
  file: File,
  wantedName: string,
  wantedSize: number,
  wantedModified: number,
): boolean {
  if (wantedName && file.name.trim().toLowerCase() === wantedName) return true;
  if (wantedSize > 0 && file.size === wantedSize) {
    if (!wantedModified) return true;
    return Number(file.lastModified || 0) === wantedModified;
  }
  return false;
}

/**
 * Retrouve le fichier correspondant à une empreinte, dans ce qui est déjà
 * autorisé. N'ouvre AUCUNE fenêtre et ne demande AUCUNE permission : si rien
 * n'est lisible, renvoie null et l'appelant affiche son bouton.
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
  if (!expected || typeof window === "undefined") return null;

  const wantedName = String(expected.name || "").trim().toLowerCase();
  const wantedSize = Number(expected.size || 0);
  const wantedModified = Number(expected.lastModified || 0);

  // 0. Vidéos choisies à la main pendant cette session (Safari, Firefox).
  for (const file of sessionVideos.values()) {
    if (fileMatches(file, wantedName, wantedSize, wantedModified)) return file;
  }

  if (videoLibraryMode() === "manual") return null;

  const stored = await readEntries(owner);
  if (!stored.length) return null;

  // 1. Fichiers mémorisés un par un.
  for (const item of stored) {
    if (entryKind(item) !== "file") continue;
    if ((await peekPermission(item.handle)) !== "granted") continue;
    try {
      const file = await (item.handle as FileHandleLike).getFile();
      if (fileMatches(file, wantedName, wantedSize, wantedModified)) return file;
    } catch {
      // fichier supprimé ou déplacé
    }
  }

  // 2. Dossiers racine.
  for (const item of stored) {
    if (entryKind(item) !== "directory") continue;
    if ((await peekPermission(item.handle)) !== "granted") continue;

    let files = cache.get(item.id);
    if (!files) {
      files = await indexFolder(item.handle as DirectoryHandle);
      cache.set(item.id, files);
    }
    if (!files.length) continue;

    // 2.a par nom
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

    // 2.b et 2.c par taille (+ date si disponible)
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

    // Le dossier peut avoir reçu une nouvelle vidéo depuis son premier index.
    // On invalide uniquement CE cache et on refait une passe au prochain appel.
    cache.delete(item.id);
  }

  return null;
}

/** Vide l'index de session (après ajout de fichiers dans le dossier). */
export function refreshVideoLibraryIndex(): void {
  cache.clear();
}
