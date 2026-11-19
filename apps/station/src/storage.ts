import { Capacitor } from "@capacitor/core";

export interface KvStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export function memoryStorage(seed: Record<string, string> = {}): KvStorage & {
  dump(): Record<string, string>;
} {
  const values = { ...seed };
  return {
    async get(key) {
      return values[key] ?? null;
    },
    async set(key, value) {
      values[key] = value;
    },
    dump() {
      return { ...values };
    },
  };
}

export function localStorageKv(storage: Pick<Storage, "getItem" | "setItem">): KvStorage {
  return {
    async get(key) {
      return storage.getItem(key);
    },
    async set(key, value) {
      storage.setItem(key, value);
    },
  };
}

export async function openStationStorage(): Promise<KvStorage> {
  if (Capacitor.isNativePlatform()) return filesystemStorage();
  return localStorageKv(localStorage);
}

async function filesystemStorage(): Promise<KvStorage> {
  const { Directory, Encoding, Filesystem } = await import("@capacitor/filesystem");
  return {
    async get(key) {
      try {
        const file = await Filesystem.readFile({
          path: fileName(key),
          directory: Directory.Data,
          encoding: Encoding.UTF8,
        });
        return typeof file.data === "string" ? file.data : null;
      } catch {
        return null;
      }
    },
    async set(key, value) {
      await Filesystem.writeFile({
        path: fileName(key),
        data: value,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true,
      });
    },
  };
}

function fileName(key: string): string {
  return `${key}.json`;
}
