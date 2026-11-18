import {
  MOCK_SITE_ORIGIN,
  raceDayStateSchema,
  siteAccountSchema,
  type ChangelogEntry,
  type RaceDayState,
  type SiteAccount,
} from "@mwhe/core";

import { migrate } from "./migrate.js";
import type { SqlExecutor } from "./sql.js";

export const LIVE_SITE_ORIGIN = "https://midwesthardenduro.com";

/** Dev builds start on the mock site. A packaged build starts on the live site. */
export function defaultSiteOrigin(dev = import.meta.env.DEV): string {
  return dev ? MOCK_SITE_ORIGIN : LIVE_SITE_ORIGIN;
}

export interface HubRecord {
  operatorName: string | null;
  baseUrl: string;
  appId: string;
  account: SiteAccount | null;
  state: RaceDayState | null;
}

export interface HubStore {
  load(): Promise<HubRecord>;
  save(record: HubRecord): Promise<void>;
}

/**
 * SQLite is the source of truth. `state_json` is the document. The changelog
 * table is written in the same save so a crash cannot leave a race without
 * its audit rows: on the next open, a short table is rebuilt from the JSON.
 */
export function createHubStore(db: SqlExecutor): HubStore {
  return {
    async load() {
      await migrate(db);
      const rows = await db.all(
        "SELECT operator_name, base_url, app_id, session_json, state_json FROM hub WHERE id = 1",
      );
      const row = rows[0];
      if (!row) {
        return {
          operatorName: null,
          baseUrl: defaultSiteOrigin(),
          appId: "",
          account: null,
          state: null,
        };
      }
      const state = parseState(row.state_json);
      if (state) await repairChangelog(db, state);
      return {
        operatorName: textOrNull(row.operator_name),
        baseUrl: textOrNull(row.base_url) ?? defaultSiteOrigin(),
        appId: textOrNull(row.app_id) ?? "",
        account: parseAccount(row.session_json),
        state,
      };
    },
    async save(record) {
      await migrate(db);
      const state = record.state ? raceDayStateSchema.parse(record.state) : null;
      const operatorName = record.operatorName?.trim() || null;
      const appId = record.appId.trim() || null;
      const account = record.account ? siteAccountSchema.parse(record.account) : null;
      await db.transaction(async () => {
        await db.run(
          `INSERT INTO hub (id, operator_name, base_url, app_id, session_json, state_json)
           VALUES (1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             operator_name = excluded.operator_name,
             base_url = excluded.base_url,
             app_id = excluded.app_id,
             session_json = excluded.session_json,
             state_json = excluded.state_json`,
          [
            operatorName,
            record.baseUrl,
            appId,
            account ? JSON.stringify(account) : null,
            state ? JSON.stringify(state) : null,
          ],
        );
        await replaceChangelog(db, state);
      });
    },
  };
}

function parseState(value: unknown): RaceDayState | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return raceDayStateSchema.parse(JSON.parse(value));
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseAccount(value: unknown): SiteAccount | null {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const parsed = siteAccountSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function repairChangelog(db: SqlExecutor, state: RaceDayState): Promise<void> {
  const rows = await db.all("SELECT COUNT(*) AS n FROM changelog_entry");
  const count = Number(rows[0]?.n ?? 0);
  if (count === state.changelog.length) return;
  await replaceChangelog(db, state);
}

async function replaceChangelog(
  db: SqlExecutor,
  state: RaceDayState | null,
): Promise<void> {
  await db.run("DELETE FROM changelog_entry");
  if (!state) return;
  for (const [index, entry] of state.changelog.entries()) {
    await insertChangelog(db, index + 1, entry);
  }
}

async function insertChangelog(
  db: SqlExecutor,
  seq: number,
  entry: ChangelogEntry,
): Promise<void> {
  await db.run(
    `INSERT INTO changelog_entry (
       id, seq, who, changed_at, entity_type, entity_id, action, reason,
       before_json, after_json, entry_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      seq,
      entry.who,
      entry.when,
      entry.entity.type,
      entry.entity.id,
      entry.action,
      entry.why,
      entry.before === null || entry.before === undefined
        ? null
        : JSON.stringify(entry.before),
      entry.after === null || entry.after === undefined
        ? null
        : JSON.stringify(entry.after),
      JSON.stringify(entry),
    ],
  );
}
