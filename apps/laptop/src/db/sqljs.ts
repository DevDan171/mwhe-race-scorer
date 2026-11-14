import initSqlJs, { type Database, type SqlValue } from "sql.js";

import type { SqlExecutor, SqlParam, SqlRow } from "./sql.js";

export interface SqlJsExecutor extends SqlExecutor {
  exportBytes(): Uint8Array;
}

export async function createSqlJsExecutor(options?: {
  bytes?: Uint8Array;
  locateFile?: (file: string) => string;
  persist?: (bytes: Uint8Array) => Promise<void>;
}): Promise<SqlJsExecutor> {
  const SQL = await initSqlJs(
    options?.locateFile ? { locateFile: options.locateFile } : undefined,
  );
  const database = options?.bytes ? new SQL.Database(options.bytes) : new SQL.Database();
  let depth = 0;

  async function persist(): Promise<void> {
    if (options?.persist) await options.persist(database.export());
  }

  return {
    async exec(sql: string) {
      database.exec(sql);
      if (depth === 0) await persist();
    },
    async run(sql: string, params: readonly SqlParam[] = []) {
      database.run(sql, params as SqlValue[]);
      if (depth === 0) await persist();
    },
    async all(sql: string, params: readonly SqlParam[] = []) {
      return queryAll(database, sql, params);
    },
    async transaction<T>(work: () => Promise<T>): Promise<T> {
      if (depth > 0) return work();
      depth += 1;
      database.run("BEGIN");
      try {
        const result = await work();
        database.run("COMMIT");
        depth -= 1;
        await persist();
        return result;
      } catch (error) {
        try {
          database.run("ROLLBACK");
        } catch {
          // The transaction is already closed.
        }
        depth -= 1;
        throw error;
      }
    },
    exportBytes() {
      return database.export();
    },
  };
}

function queryAll(
  database: Database,
  sql: string,
  params: readonly SqlParam[],
): SqlRow[] {
  const statement = database.prepare(sql);
  statement.bind(params as SqlValue[]);
  const rows: SqlRow[] = [];
  while (statement.step()) {
    const row = statement.getAsObject();
    const typed: SqlRow = {};
    for (const [key, value] of Object.entries(row)) {
      typed[key] = value as SqlParam;
    }
    rows.push(typed);
  }
  statement.free();
  return rows;
}
