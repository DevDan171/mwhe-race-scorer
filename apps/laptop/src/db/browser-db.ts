import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

import { createSqlJsExecutor, type SqlJsExecutor } from "./sqljs";

const DB_NAME = "mwhe-race-scorer";
const STORE = "files";
const KEY = "hub.sqlite";

/**
 * Browser preview keeps the SQLite file in IndexedDB so a refresh does not
 * drop the race. The Windows app uses the Tauri SQL plugin instead.
 */
export async function openBrowserDatabase(): Promise<SqlJsExecutor> {
  const bytes = await loadFile();
  return createSqlJsExecutor({
    bytes: bytes ?? undefined,
    locateFile: () => wasmUrl,
    persist: saveFile,
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open IndexedDB"));
  });
}

async function loadFile(): Promise<Uint8Array | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      request.onsuccess = () => {
        const value = request.result as ArrayBuffer | Uint8Array | undefined;
        if (!value) {
          resolve(null);
          return;
        }
        resolve(value instanceof Uint8Array ? value : new Uint8Array(value));
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Could not read the race file"));
    });
  } finally {
    db.close();
  }
}

const VAULT_KEY = "vault.key";

/** Browser preview only. The Windows app stores this key in Credential Manager. */
export async function readBrowserVaultKey(): Promise<string | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(VAULT_KEY);
      request.onsuccess = () => {
        resolve(typeof request.result === "string" ? request.result : null);
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Could not read the vault key"));
    });
  } finally {
    db.close();
  }
}

export async function writeBrowserVaultKey(value: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .put(value, VAULT_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error("Could not save the vault key"));
    });
  } finally {
    db.close();
  }
}

async function saveFile(bytes: Uint8Array): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .put(bytes, KEY);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error("Could not save the race file"));
    });
  } finally {
    db.close();
  }
}
