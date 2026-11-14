declare module "sql.js" {
  export type SqlValue = string | number | null | Uint8Array;

  export interface Statement {
    bind(values?: readonly SqlValue[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, SqlValue>;
    free(): boolean;
  }

  export interface Database {
    run(sql: string, params?: readonly SqlValue[]): Database;
    exec(sql: string): unknown;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | null) => Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}
