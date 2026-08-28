/**
 * Persistance du FileSystemFileHandle de la vidéo d'un projet LiveStats.
 *
 * Le fichier vidéo n'est jamais copié ni uploadé dans MyBasket.
 * IndexedDB ne conserve que le handle accordé par le navigateur.
 *
 * Sur les navigateurs qui ne supportent pas window.showOpenFilePicker,
 * le composant appelant conserve son fallback <input type="file">.
 */

export type StoredLocalVideoHandle = {
  kind?: string;
  name?: string;
  getFile: () => Promise<File>;
  queryPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<
    "granted" | "denied" | "prompt"
  >;
  requestPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<
    "granted" | "denied" | "prompt"
  >;
};

const DB_NAME = "mybasket-local-video-access";
const DB_VERSION = 1;
const STORE_NAME = "project-video-handles";

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function openDb(): Promise<IDBDatabase | null> {
  if (!canUseIndexedDb()) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function rememberLocalVideoHandle(
  projectId: string,
  handle: StoredLocalVideoHandle,
) {
  const db = await openDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(handle, projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getLocalVideoHandle(
  projectId: string,
): Promise<StoredLocalVideoHandle | null> {
  const db = await openDb();
  if (!db) return null;

  try {
    return await new Promise<StoredLocalVideoHandle | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(projectId);

        request.onsuccess = () =>
          resolve((request.result as StoredLocalVideoHandle | undefined) ?? null);
        request.onerror = () => reject(request.error);
      },
    );
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function clearLocalVideoHandle(projectId: string) {
  const db = await openDb();
  if (!db) return;

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: {
    multiple?: boolean;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
  }) => Promise<StoredLocalVideoHandle[]>;
};

export async function openAndRememberLocalVideo(
  projectId: string,
): Promise<{ handle: StoredLocalVideoHandle; file: File } | null> {
  if (typeof window === "undefined") return null;

  const picker = (window as FilePickerWindow).showOpenFilePicker;
  if (typeof picker !== "function") return null;

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

  if (!handle) return null;

  const file = await handle.getFile();
  await rememberLocalVideoHandle(projectId, handle);

  return { handle, file };
}
