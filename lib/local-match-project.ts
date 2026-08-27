export type MatchProjectFingerprint = {
  name: string;
  size: number;
  duration: number;
  lastModified: number;
  mimeType: string;
  partialHash: string;
};

export type MatchProjectDescriptor = {
  version: 1;
  projectId: string;
  matchId: string;
  teamId: string;
  opponent?: string | null;
  matchDate?: string | null;
  createdAt: string;
  updatedAt: string;
  video: MatchProjectFingerprint | null;
};

export type LocalMatchVideo = {
  matchId: string;
  file: File;
  url: string;
  fingerprint: MatchProjectFingerprint;
};

const DB_NAME = "mybasket-local-projects";
const DB_VERSION = 1;
const HANDLE_STORE = "file-handles";
const META_STORE = "project-meta";

// Ancien registre utilisé par PriseStatsPro avant l'unification.
// On le lit encore pour migrer automatiquement les projets déjà créés.
const LEGACY_DB_NAME = "mybasket-local-video-handles";
const LEGACY_STORE = "handles";

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
  });

export const idbPut = async (store: string, key: string, value: unknown) => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

export const idbGet = async <T,>(store: string, key: string): Promise<T | null> => {
  const db = await openDb();
  const value = await new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve((req.result ?? null) as T | null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return value;
};

export const idbDelete = async (store: string, key: string) => {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
};

export const createPartialHash = async (file: File): Promise<string> => {
  const sampleSize = Math.min(1024 * 1024, file.size);
  const head = await file.slice(0, sampleSize).arrayBuffer();
  const tail =
    file.size > sampleSize
      ? await file.slice(Math.max(0, file.size - sampleSize), file.size).arrayBuffer()
      : new ArrayBuffer(0);

  const merged = new Uint8Array(head.byteLength + tail.byteLength + 16);
  merged.set(new Uint8Array(head), 0);
  merged.set(new Uint8Array(tail), head.byteLength);

  const view = new DataView(merged.buffer);
  view.setBigUint64(merged.length - 16, BigInt(file.size), true);
  view.setBigUint64(merged.length - 8, BigInt(file.lastModified || 0), true);

  const digest = await crypto.subtle.digest("SHA-256", merged.buffer);
  return [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("");
};

export const getVideoDuration = (file: File): Promise<number> =>
  new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Impossible de lire les métadonnées de cette vidéo."));
    };
    video.src = url;
  });

export const fingerprintVideo = async (file: File): Promise<MatchProjectFingerprint> => ({
  name: file.name,
  size: file.size,
  duration: await getVideoDuration(file),
  lastModified: file.lastModified || 0,
  mimeType: file.type || "video/mp4",
  partialHash: await createPartialHash(file),
});

export const fingerprintsMatch = (
  expected: MatchProjectFingerprint | null | undefined,
  actual: MatchProjectFingerprint,
) => {
  if (!expected) return true;
  if (expected.partialHash && expected.partialHash === actual.partialHash) return true;

  const durationOk = Math.abs(Number(expected.duration || 0) - actual.duration) < 0.75;
  const sizeOk = Math.abs(Number(expected.size || 0) - actual.size) <= 16;
  return durationOk && sizeOk;
};

export const supportsPersistentFileHandles = () =>
  typeof window !== "undefined" && "showOpenFilePicker" in window;

export const pickVideoFile = async (): Promise<{ file: File; handle?: FileSystemFileHandle }> => {
  if (supportsPersistentFileHandles()) {
    const picker = (window as any).showOpenFilePicker as (opts: unknown) => Promise<FileSystemFileHandle[]>;
    const [handle] = await picker({
      multiple: false,
      types: [
        {
          description: "Vidéo du match",
          accept: {
            "video/*": [".mp4", ".mov", ".m4v", ".webm"],
          },
        },
      ],
    });
    const file = await handle.getFile();
    return { file, handle };
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "video/*,.mp4,.mov,.m4v,.webm";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) resolve({ file });
      else reject(new Error("Aucun fichier sélectionné."));
    };
    input.click();
  });
};

export const savePersistentFileHandle = async (matchId: string, handle: FileSystemFileHandle) => {
  try {
    await idbPut(HANDLE_STORE, matchId, handle);
  } catch {
    // Safari and private browsing may refuse structured cloning of handles.
  }
};

const openLegacyDb = (): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    try {
      const req = indexedDB.open(LEGACY_DB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onupgradeneeded = () => {
        // Ne crée rien volontairement : une DB absente signifie simplement
        // qu'aucun ancien handle n'est disponible.
      };
    } catch {
      resolve(null);
    }
  });

const findLegacyHandle = async (
  expected?: MatchProjectFingerprint | null,
  teamId?: string | null,
): Promise<FileSystemFileHandle | null> => {
  if (typeof indexedDB === "undefined") return null;
  const db = await openLegacyDb();
  if (!db || !db.objectStoreNames.contains(LEGACY_STORE)) {
    db?.close();
    return null;
  }

  const fileName = String(expected?.name || "").trim().toLowerCase();
  const exactKey =
    teamId && fileName
      ? `team:${String(teamId)}::${fileName}`
      : null;

  try {
    const result = await new Promise<FileSystemFileHandle | null>((resolve) => {
      const tx = db.transaction(LEGACY_STORE, "readonly");
      const store = tx.objectStore(LEGACY_STORE);

      if (exactKey) {
        const exact = store.get(exactKey);
        exact.onsuccess = () => {
          if (exact.result) {
            resolve(exact.result as FileSystemFileHandle);
            return;
          }

          const all = store.getAll();
          all.onsuccess = () => {
            const handles = (all.result ?? []) as FileSystemFileHandle[];
            resolve(
              handles.find(
                (handle) =>
                  !fileName ||
                  String((handle as any)?.name || "").trim().toLowerCase() === fileName,
              ) ?? null,
            );
          };
          all.onerror = () => resolve(null);
        };
        exact.onerror = () => resolve(null);
        return;
      }

      const all = store.getAll();
      all.onsuccess = () => {
        const handles = (all.result ?? []) as FileSystemFileHandle[];
        resolve(
          handles.find(
            (handle) =>
              !fileName ||
              String((handle as any)?.name || "").trim().toLowerCase() === fileName,
          ) ?? null,
        );
      };
      all.onerror = () => resolve(null);
    });

    db.close();
    return result;
  } catch {
    db.close();
    return null;
  }
};

export const restorePersistentVideo = async (
  matchId: string,
  expected?: MatchProjectFingerprint | null,
  teamId?: string | null,
): Promise<LocalMatchVideo | null> => {
  // 1. Nouveau registre : clé durable = matchId.
  let handle = await idbGet<FileSystemFileHandle>(HANDLE_STORE, matchId);

  // 2. Compatibilité projets existants : ancien registre PriseStatsPro
  //    clé = équipe + nom du fichier. Si trouvé, on le migre immédiatement.
  if (!handle) {
    handle = await findLegacyHandle(expected, teamId);
    if (handle) {
      await savePersistentFileHandle(matchId, handle);
    }
  }

  if (!handle) return null;

  try {
    let permission = await (handle as any).queryPermission?.({ mode: "read" });

    // Certains navigateurs renvoient "prompt". requestPermission peut nécessiter
    // un geste utilisateur ; si le navigateur l'autorise ici, on restaure sans
    // demander de rechoisir le fichier.
    if (permission !== "granted") {
      permission = await (handle as any).requestPermission?.({ mode: "read" });
    }
    if (permission !== "granted") return null;

    const file = await handle.getFile();
    const fingerprint = await fingerprintVideo(file);
    if (!fingerprintsMatch(expected, fingerprint)) return null;

    return {
      matchId,
      file,
      fingerprint,
      url: URL.createObjectURL(file),
    };
  } catch {
    return null;
  }
};

export const downloadMatchProjectFile = (descriptor: MatchProjectDescriptor) => {
  const blob = new Blob([JSON.stringify(descriptor, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeOpponent = (descriptor.opponent || "match").replace(/[^a-zA-Z0-9_-]+/g, "-");
  a.href = url;
  a.download = `${descriptor.matchDate || "match"}-${safeOpponent}.mybasket-match`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const readMatchProjectFile = async (file: File): Promise<MatchProjectDescriptor> => {
  const raw = await file.text();
  const parsed = JSON.parse(raw) as MatchProjectDescriptor;
  if (parsed.version !== 1 || !parsed.matchId || !parsed.teamId) {
    throw new Error("Projet Match MyBasket invalide.");
  }
  return parsed;
};
