import Database from "@tauri-apps/plugin-sql";

import {
  toNumberedPlaceholders,
  type SqlExecutor,
  type SqlParam,
  type SqlRow,
} from "./sql";

/**
 * Opens sqlite:mwhe-hub.db in the Tauri app data directory.
 * Each statement commits on its own. store.ts writes the race JSON first
 * and rebuilds the changelog table from that JSON if a save is interrupted.
 */
export async function openTauriExecutor(): Promise<SqlExecutor> {
  const db = await Database.load("sqlite:mwhe-hub.db");
  return {
    async exec(sql: string) {
      for (const statement of splitSql(sql)) {
        await db.execute(statement);
      }
    },
    async run(sql: string, params: readonly SqlParam[] = []) {
      await db.execute(toNumberedPlaceholders(sql), [...params]);
    },
    async all(sql: string, params: readonly SqlParam[] = []) {
      return db.select<SqlRow[]>(toNumberedPlaceholders(sql), [...params]);
    },
    async transaction<T>(work: () => Promise<T>): Promise<T> {
      return work();
    },
  };
}

function splitSql(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
