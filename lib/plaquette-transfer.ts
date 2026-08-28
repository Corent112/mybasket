const DB_NAME = "mybasket-transfers";
const STORE_NAME = "payloads";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB indisponible"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Ouverture IndexedDB impossible"));
  });
}

export async function setPlaquetteTransfer(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Écriture IndexedDB impossible"));
        tx.onabort = () => reject(tx.error || new Error("Écriture IndexedDB annulée"));
      });
    } finally { db.close(); }
    // Compatibilité avec les anciens écrans qui lisent encore localStorage :
    // on garde un miroir si le navigateur a assez de place. L’échec du miroir
    // n’empêche jamais le transfert IndexedDB.
    try {
      window.localStorage.removeItem(key);
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
    return;
  } catch {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}

export async function getPlaquetteTransfer<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    try {
      const value = await new Promise<T | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).get(key);
        request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
        request.onerror = () => reject(request.error || new Error("Lecture IndexedDB impossible"));
      });
      if (value !== null) return value;
    } finally { db.close(); }
  } catch {}

  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function removePlaquetteTransfer(key: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error("Suppression IndexedDB impossible"));
        tx.onabort = () => reject(tx.error || new Error("Suppression IndexedDB annulée"));
      });
    } finally { db.close(); }
  } catch {}
  try { window.localStorage.removeItem(key); } catch {}
}
