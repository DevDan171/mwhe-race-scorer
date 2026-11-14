import { createMemoryCredentialStore, type CredentialStore } from "../auth/credentials";
import { isTauri } from "../platform";
import { createHubStore, type HubStore } from "./store";

export interface LaptopBackend {
  store: HubStore;
  credentials: CredentialStore;
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
    return { store: createHubStore(db), credentials: createTauriCredentialStore() };
  }
  const { openBrowserDatabase } = await import("./browser-db");
  const db = await openBrowserDatabase();
  return { store: createHubStore(db), credentials: createMemoryCredentialStore() };
}
