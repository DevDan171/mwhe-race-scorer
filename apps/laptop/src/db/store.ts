import {
  exportPublicRacePackage,
  MOCK_SITE_ORIGIN,
  raceDayStateSchema,
  siteAccountSchema,
  LIVE_SITE_ORIGIN,
  type ChangelogEntry,
  type RaceDayState,
  type SiteAccount,
} from "@mwhe/core";

import { migrate } from "./migrate.js";
import type { SqlExecutor } from "./sql.js";

export { LIVE_SITE_ORIGIN };

/** Dev builds start on the mock site. A packaged build starts on the live site. */
export function defaultSiteOrigin(dev = import.meta.env.DEV): string {
  return dev ? MOCK_SITE_ORIGIN : LIVE_SITE_ORIGIN;
}

export interface HubRecord {
  operatorName: string | null;
  baseUrl: string;
  appId: string;
  account: SiteAccount | null;
  /** The event open in the hub. Also present in `events`. */
  state: RaceDayState | null;
  events: Record<string, RaceDayState>;
  activeEventId: string | null;
  /** AES-GCM payload for contact fields. Null when there is nothing to seal. */
  privateCipher: string | null;
  /**
   * Events whose emergency contacts could not be unlocked. Re-import clears
   * an id after the site contacts are saved under the new key.
   */
  lockedContactEventIds: string[];
}

interface HubSave extends Omit<
  HubRecord,
  "events" | "activeEventId" | "privateCipher" | "lockedContactEventIds"
> {
  events?: Record<string, RaceDayState>;
  activeEventId?: string | null;
  privateCipher?: string | null;
  lockedContactEventIds?: string[];
}

export interface HubStore {
  load(): Promise<HubRecord>;
  save(record: HubSave): Promise<void>;
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
        "SELECT operator_name, base_url, app_id, session_json, state_json, private_json FROM hub WHERE id = 1",
      );
      const row = rows[0];
      if (!row) {
        return emptyRecord();
      }
      const library = parseLibrary(row.state_json);
      if (library.state) await repairChangelog(db, library.state);
      return {
        operatorName: textOrNull(row.operator_name),
        baseUrl: textOrNull(row.base_url) ?? defaultSiteOrigin(),
        appId: textOrNull(row.app_id) ?? "",
        account: parseAccount(row.session_json),
        privateCipher: textOrNull(row.private_json),
        ...library,
      };
    },
    async save(record) {
      await migrate(db);
      const library = normalizeLibrary(record);
      const operatorName = record.operatorName?.trim() || null;
      const appId = record.appId.trim() || null;
      const account = record.account ? siteAccountSchema.parse(record.account) : null;
      const privateCipher = record.privateCipher?.trim() || null;
      await db.transaction(async () => {
        await db.run(
          `INSERT INTO hub (
             id, operator_name, base_url, app_id, session_json, state_json, private_json
           )
           VALUES (1, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             operator_name = excluded.operator_name,
             base_url = excluded.base_url,
             app_id = excluded.app_id,
             session_json = excluded.session_json,
             state_json = excluded.state_json,
             private_json = excluded.private_json`,
          [
            operatorName,
            record.baseUrl,
            appId,
            account ? JSON.stringify(account) : null,
            JSON.stringify({
              version: 2,
              activeEventId: library.activeEventId,
              events: library.events,
              lockedContactEventIds: record.lockedContactEventIds ?? [],
            }),
            privateCipher,
          ],
        );
        await replaceChangelog(db, library.state);
      });
    },
  };
}

function emptyRecord(): HubRecord {
  return {
    operatorName: null,
    baseUrl: defaultSiteOrigin(),
    appId: "",
    account: null,
    state: null,
    events: {},
    activeEventId: null,
    privateCipher: null,
    lockedContactEventIds: [],
  };
}

function normalizeLibrary(record: HubSave): {
  state: RaceDayState | null;
  events: Record<string, RaceDayState>;
  activeEventId: string | null;
} {
  const source =
    record.events ?? (record.state ? { [record.state.race.event.id]: record.state } : {});
  const events: Record<string, RaceDayState> = {};
  for (const [id, state] of Object.entries(source)) {
    events[id] = redactState(raceDayStateSchema.parse(state));
  }
  const activeEventId =
    record.activeEventId ?? record.state?.race.event.id ?? Object.keys(events)[0] ?? null;
  const state = activeEventId ? (events[activeEventId] ?? null) : null;
  return { state, events, activeEventId: state ? activeEventId : null };
}

function redactState(state: RaceDayState): RaceDayState {
  return raceDayStateSchema.parse({
    ...state,
    snapshot: exportPublicRacePackage(state.snapshot),
    race: exportPublicRacePackage(state.race),
  });
}

function parseLibrary(value: unknown): {
  state: RaceDayState | null;
  events: Record<string, RaceDayState>;
  activeEventId: string | null;
  lockedContactEventIds: string[];
} {
  if (typeof value !== "string" || value.length === 0) {
    return { state: null, events: {}, activeEventId: null, lockedContactEventIds: [] };
  }
  const parsed: unknown = JSON.parse(value);
  if (isRecord(parsed) && parsed.snapshot) {
    const state = raceDayStateSchema.parse(parsed);
    return {
      state,
      events: { [state.race.event.id]: state },
      activeEventId: state.race.event.id,
      lockedContactEventIds: lockedIds(parsed.lockedContactEventIds),
    };
  }
  if (!isRecord(parsed) || !isRecord(parsed.events)) {
    return { state: null, events: {}, activeEventId: null, lockedContactEventIds: [] };
  }
  const events: Record<string, RaceDayState> = {};
  for (const [id, entry] of Object.entries(parsed.events)) {
    events[id] = raceDayStateSchema.parse(entry);
  }
  const requested =
    typeof parsed.activeEventId === "string" ? parsed.activeEventId : null;
  const activeEventId = requested && events[requested] ? requested : null;
  return {
    state: activeEventId ? (events[activeEventId] ?? null) : null,
    events,
    activeEventId,
    lockedContactEventIds: lockedIds(parsed.lockedContactEventIds),
  };
}

function lockedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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
