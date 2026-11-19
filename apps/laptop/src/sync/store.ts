import { storedSyncStateSchema, type StoredSyncState } from "@mwhe/core";

import { migrate } from "../db/migrate";
import type { SqlExecutor } from "../db/sql";

export interface SyncStore {
  load(): Promise<StoredSyncState | null>;
  save(state: StoredSyncState): Promise<void>;
}

export function createSyncStore(db: SqlExecutor): SyncStore {
  return {
    async load() {
      await migrate(db);
      const rows = await db.all("SELECT payload_json FROM sync_state WHERE id = 1");
      const raw = rows[0]?.payload_json;
      if (typeof raw !== "string" || raw.length === 0) return null;
      return storedSyncStateSchema.parse(JSON.parse(raw));
    },
    async save(state) {
      await migrate(db);
      const parsed = storedSyncStateSchema.parse(state);
      await db.run(
        `INSERT INTO sync_state (id, payload_json) VALUES (1, ?)
         ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json`,
        [JSON.stringify(parsed)],
      );
    },
  };
}
