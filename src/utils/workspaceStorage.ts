export const STORAGE_KEY = 'dancevault_workspace_v2_3';
export const STORAGE_META_KEY = 'dancevault_workspace_meta_v1';
export const MAX_PERSISTED_BYTES = 25 * 1024 * 1024; // 25 MB
const LOCAL_STORAGE_MIRROR_LIMIT_BYTES = 3_600_000; // Safe margin under ~5 MB WebView localStorage cap

const DB_NAME = 'dancevault_workspace_db';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';
const RECORD_KEY = 'primary';

export interface StoredWorkspaceMeta {
  updatedAt: number;
  bytes: number;
  indexedDbPrimary: boolean;
}

interface IndexedDbRecord<T> {
  id: string;
  updatedAt: number;
  bytes: number;
  payload: T;
}

export interface SaveWorkspaceResult {
  ok: boolean;
  bytes: number;
  reason?: 'quota_25mb' | 'write_error';
}

function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function readIndexedDbWorkspace<T>(): Promise<IndexedDbRecord<T> | null> {
  try {
    const db = await openWorkspaceDb();
    return await new Promise<IndexedDbRecord<T> | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(RECORD_KEY);
      req.onsuccess = () => {
        resolve((req.result as IndexedDbRecord<T> | undefined) ?? null);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  } catch {
    return null;
  }
}

async function writeIndexedDbWorkspace<T>(
  record: IndexedDbRecord<T>
): Promise<boolean> {
  try {
    const db = await openWorkspaceDb();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
      tx.onabort = () => {
        db.close();
        resolve(false);
      };
    });
  } catch {
    return false;
  }
}

export function readLocalStorageMeta(): StoredWorkspaceMeta | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredWorkspaceMeta>;
    if (typeof parsed?.updatedAt !== 'number') return null;
    return {
      updatedAt: parsed.updatedAt,
      bytes: typeof parsed.bytes === 'number' ? parsed.bytes : 0,
      indexedDbPrimary: Boolean(parsed.indexedDbPrimary),
    };
  } catch {
    return null;
  }
}

export function estimateJsonBytes(payload: unknown): number {
  const json = JSON.stringify(payload);
  return typeof Blob !== 'undefined' ? new Blob([json]).size : json.length * 2;
}

export async function requestPersistentStoragePermission(): Promise<void> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function'
    ) {
      await navigator.storage.persist();
    }
  } catch {
    // Best-effort hint for browser/WebView persistence
  }
}

export async function saveWorkspaceWith25MbQuota<T>(
  payload: T
): Promise<SaveWorkspaceResult> {
  if (typeof window === 'undefined') {
    return { ok: true, bytes: 0 };
  }

  let json = '';
  let bytes = 0;
  try {
    json = JSON.stringify(payload);
    bytes = typeof Blob !== 'undefined' ? new Blob([json]).size : json.length * 2;
  } catch {
    return { ok: false, bytes: 0, reason: 'write_error' };
  }

  if (bytes > MAX_PERSISTED_BYTES) {
    return { ok: false, bytes, reason: 'quota_25mb' };
  }

  const updatedAt = Date.now();
  const idbOk = await writeIndexedDbWorkspace({
    id: RECORD_KEY,
    updatedAt,
    bytes,
    payload,
  });

  if (bytes <= LOCAL_STORAGE_MIRROR_LIMIT_BYTES) {
    try {
      window.localStorage.setItem(STORAGE_KEY, json);
      window.localStorage.setItem(
        STORAGE_META_KEY,
        JSON.stringify({ updatedAt, bytes, indexedDbPrimary: false })
      );
      return { ok: true, bytes };
    } catch {
      // If localStorage still hits its ~5 MB browser ceiling, drop the mirror and rely on IndexedDB
    }
  }

  if (idbOk) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.setItem(
        STORAGE_META_KEY,
        JSON.stringify({ updatedAt, bytes, indexedDbPrimary: true })
      );
    } catch {
      // Ignore secondary metadata write failure
    }
    return { ok: true, bytes };
  }

  return { ok: false, bytes, reason: 'write_error' };
}
