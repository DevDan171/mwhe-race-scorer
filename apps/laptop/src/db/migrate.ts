import { MIGRATIONS } from "./migrations.js";
import type { SqlExecutor } from "./sql.js";

export async function migrate(
  db: SqlExecutor,
  appliedAt = new Date().toISOString(),
): Promise<void> {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const rows = await db.all("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((row) => Number(row.version)));
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    await db.transaction(async () => {
      await db.exec(migration.sql);
      await db.run("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)", [
        migration.version,
        appliedAt,
      ]);
    });
  }
}
