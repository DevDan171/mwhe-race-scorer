import { createMemoryCredentialStore, type CredentialStore } from "../auth/credentials";
import { isTauri } from "../platform";
import type { SqlExecutor } from "./sql";
import { createHubStore, type HubStore } from "./store";

export interface LaptopBackend {
  store: HubStore;
  credentials: CredentialStore;
  db: SqlExecutor;
}

let opening: Promise<LaptopBackend> | null = null;

export function openLaptopBackend(): Promise<LaptopBackend> {
  if (!opening) opening = openOnce();
  return opening;
}

async function openOnce(): Promise<LaptopBackend> {
  if (isTauri()) {
    const [{ openTauriExecutor }, { createTauriCredentialStore }] = await Promise.all([
      import("./tauri-sql"),
      import("../auth/tauri-credentials"),
    ]);
    const db = await openTauriExecutor();
    return { store: createHubStore(db), credentials: createTauriCredentialStore(), db };
  }
  const { openBrowserDatabase, readBrowserVaultKey, writeBrowserVaultKey } =
    await import("./browser-db");
  const db = await openBrowserDatabase();
  const memory = createMemoryCredentialStore();
  return {
    store: createHubStore(db),
    db,
    credentials: {
      readToken: () => memory.readToken(),
      writeToken: (token) => memory.writeToken(token),
      clearToken: () => memory.clearToken(),
      readVaultKey: () => readBrowserVaultKey(),
      writeVaultKey: (value) => writeBrowserVaultKey(value),
    },
  };
}
