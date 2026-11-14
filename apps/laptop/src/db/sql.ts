export type SqlParam = string | number | null | Uint8Array;

export interface SqlRow {
  [column: string]: SqlParam;
}

/**
 * The laptop speaks SQL through this interface. Tests and the browser use
 * sql.js. The Tauri shell uses the SQL plugin, which writes a real file.
 */
/** sql.js binds `?`. The Tauri SQL plugin binds `$1`, `$2`, ... on SQLite. */
export function toNumberedPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

export interface SqlExecutor {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlParam[]): Promise<void>;
  all(sql: string, params?: readonly SqlParam[]): Promise<SqlRow[]>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
}
