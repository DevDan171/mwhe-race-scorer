export interface Migration {
  version: number;
  sql: string;
}

/**
 * schema_migrations is created by the migrator before these run.
 * Version 1 is the race-day hub: one saved race, plus a changelog table.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE hub (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        operator_name TEXT,
        base_url TEXT NOT NULL,
        state_json TEXT
      );

      CREATE TABLE changelog_entry (
        id TEXT PRIMARY KEY,
        seq INTEGER NOT NULL,
        who TEXT NOT NULL,
        changed_at TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        before_json TEXT,
        after_json TEXT,
        entry_json TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    sql: `
      ALTER TABLE hub ADD COLUMN app_id TEXT;
      ALTER TABLE hub ADD COLUMN session_json TEXT;
    `,
  },
  {
    version: 3,
    sql: `
      ALTER TABLE hub ADD COLUMN private_json TEXT;
    `,
  },
];
