import {drawingSessionStorage} from "./drawing-session-storage";
const DB_NAME = "mybasket-transfers";
const STORE_NAME = "payloads";
const DB_VERSION = 1;
const fallbackKey=(key:string)=>`mybasket-transfer-fallback:${key}`;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB indisponible"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    let settled=false;
    const timeout=window.setTimeout(()=>{if(!settled){settled=true;reject(new Error("Ouverture IndexedDB trop longue"));}},3000);
    const fail=(error:Error)=>{if(!settled){settled=true;window.clearTimeout(timeout);reject(error)}};
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {if(settled){request.result.close();return;}settled=true;window.clearTimeout(timeout);resolve(request.result);};
    request.onerror = () => fail(request.error || new Error("Ouverture IndexedDB impossible"));
    request.onblocked = () => fail(new Error("IndexedDB bloquée par un autre onglet"));
  });
}

// Safari can open the database but leave an individual transaction pending.
// Bound reads/writes/deletes too, so the existing same-tab fallback can run.
function transferTransaction<T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest, read = false): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    let settled = false;
    let value: T;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = window.setTimeout(() => {
      finish(new Error("Transfert du dessin trop long"));
      try { tx.abort(); } catch {}
    }, 5000);
    tx.oncomplete = () => finish();
    tx.onerror = () => finish(tx.error || new Error("Transfert du dessin impossible"));
    tx.onabort = () => finish(tx.error || new Error("Transfert du dessin annulé"));
    try {
      const request = run(tx.objectStore(STORE_NAME));
      request.onsuccess = () => { value = (request.result ?? null) as T; if (read) finish(); };
      request.onerror = () => finish(request.error || new Error("Transfert du dessin impossible"));
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Dessin non transférable"));
      try { tx.abort(); } catch {}
    }
  });
}

export async function setPlaquetteTransfer(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    try {
      await transferTransaction<void>(db, "readwrite", store => store.put(value, key));
    } finally { db.close(); }
    try { drawingSessionStorage.removeItem(fallbackKey(key)); } catch {}
    // Compatibilité avec les anciens écrans qui lisent encore localStorage :
    // on garde un miroir si le navigateur a assez de place. L’échec du miroir
    // n’empêche jamais le transfert IndexedDB.
    try {
      drawingSessionStorage.removeItem(key);
      drawingSessionStorage.setItem(key, JSON.stringify(value));
    } catch {}
    return;
  } catch {
    drawingSessionStorage.setItem(key, JSON.stringify(value));
    drawingSessionStorage.setItem(fallbackKey(key),"1");
  }
}

export async function getPlaquetteTransfer<T>(key: string): Promise<T | null> {
  try {if(drawingSessionStorage.getItem(fallbackKey(key))){const raw=drawingSessionStorage.getItem(key);if(raw)return JSON.parse(raw) as T;}}catch{}
  try {
    const db = await openDb();
    try {
      const value = await transferTransaction<T | null>(db, "readonly", store => store.get(key), true);
      if (value !== null) return value;
    } finally { db.close(); }
  } catch {}

  if (typeof window === "undefined") return null;
  const raw = drawingSessionStorage.getItem(key);
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function removePlaquetteTransfer(key: string): Promise<void> {
  try {
    const db = await openDb();
    try {
      await transferTransaction<void>(db, "readwrite", store => store.delete(key));
    } finally { db.close(); }
  } catch {}
  try { drawingSessionStorage.removeItem(key); drawingSessionStorage.removeItem(fallbackKey(key)); } catch {}
}

/** Save the current form before navigation; release only its redundant browser mirrors. */
export async function preparePlaquetteNavigation(draftKey:string,draft:unknown,context:Record<string,string|null>,extra:Record<string,unknown>={}){
  let stored=false;
  try {
    const db=await openDb();
    try {
      await new Promise<void>((resolve,reject)=>{
        const tx=db.transaction(STORE_NAME,"readwrite");let settled=false;
        const done=(error?:Error)=>{if(settled)return;settled=true;window.clearTimeout(timeout);error?reject(error):resolve()};
        const timeout=window.setTimeout(()=>{done(new Error("Sauvegarde du brouillon trop longue"));try{tx.abort()}catch{}},5000);
        try{tx.objectStore(STORE_NAME).put(draft,draftKey);
        for(const [key,value]of Object.entries(extra))tx.objectStore(STORE_NAME).put(value,key);}catch(error){try{tx.abort()}catch{}done(error instanceof Error?error:new Error("Brouillon non transférable"));}
        tx.oncomplete=()=>done();tx.onerror=()=>done(tx.error||new Error("Sauvegarde du brouillon impossible"));tx.onabort=()=>done(new Error("Sauvegarde du brouillon annulée"));
      });
      stored=true;
    } finally {db.close()}
  } catch(error) {
    // Without IndexedDB, preserve the freshest form in the existing sync fallback.
    drawingSessionStorage.setItem(`${draftKey}_sync`,JSON.stringify(draft));
    for(const [key,value]of Object.entries(extra)){
      drawingSessionStorage.setItem(key,JSON.stringify(value));
      drawingSessionStorage.setItem(fallbackKey(key),'1');
    }
  }
  if(stored){
    drawingSessionStorage.removeItem(draftKey);
    drawingSessionStorage.removeItem(fallbackKey(draftKey));
    drawingSessionStorage.removeItem(`${draftKey}_sync`);
    for(const key of Object.keys(extra)){drawingSessionStorage.removeItem(key);drawingSessionStorage.removeItem(fallbackKey(key));}
  }
  const previous=new Map(Object.keys(context).map(key=>[key,drawingSessionStorage.getItem(key)]));
  try {for(const [key,value]of Object.entries(context))value===null?drawingSessionStorage.removeItem(key):drawingSessionStorage.setItem(key,value)}
  catch(error){for(const [key,value]of previous){try{value===null?drawingSessionStorage.removeItem(key):drawingSessionStorage.setItem(key,value)}catch{}}throw error}
}
