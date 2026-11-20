import {
  stationHelloAckSchema,
  syncErrorSchema,
  syncResultSchema,
  type StationHelloAck,
  type SyncResult,
} from "@mwhe/core";

import {
  applyHelloAck,
  applySyncResult,
  emptyRosterVersion,
  type StationState,
} from "./station-state";
import { APP_VERSION } from "./version";

export interface SyncOutcome {
  ok: boolean;
  state: StationState;
  message: string;
}

export async function syncWithHub(
  state: StationState,
  input: {
    deviceNow: string;
    batteryPercent: number | null;
    fetchImpl?: typeof fetch;
  },
): Promise<SyncOutcome> {
  const setup = state.setup;
  if (!setup) {
    return { ok: false, state, message: "Scan the laptop code before syncing." };
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const hello = await postJson(
      fetchImpl,
      `${setup.hubUrl}/sync/pair`,
      setup.pairingSecret,
      {
        schemaVersion: 1,
        type: "station_hello",
        deviceId: state.deviceId,
        eventId: setup.eventId,
        raceId: setup.raceId,
        checkId: setup.checkId,
        appVersion: APP_VERSION,
        deviceNow: input.deviceNow,
        batteryPercent: input.batteryPercent,
        rosterVersion: emptyRosterVersion(state),
      },
    );
    if (!hello.ok) return { ok: false, state, message: hello.message };
    const ack = stationHelloAckSchema.parse(hello.body);
    let next = applyHelloAck(state, ack);
    const pushed = await postJson(
      fetchImpl,
      `${setup.hubUrl}/sync/punches`,
      setup.pairingSecret,
      {
        schemaVersion: 1,
        type: "push_punches",
        deviceId: state.deviceId,
        eventId: setup.eventId,
        raceId: setup.raceId,
        checkId: setup.checkId,
        sentAt: input.deviceNow,
        deviceNow: input.deviceNow,
        appVersion: APP_VERSION,
        batteryPercent: input.batteryPercent,
        rosterVersion: emptyRosterVersion(next),
        punches: next.punches,
        ...(next.rowStarts.length > 0 ? { rowStarts: next.rowStarts } : {}),
        ...(next.riderStarts.length > 0 ? { riderStarts: next.riderStarts } : {}),
      },
    );
    if (!pushed.ok) return { ok: false, state: next, message: pushed.message };
    const result = syncResultSchema.parse(pushed.body);
    next = applySyncResult(next, result);
    return { ok: true, state: next, message: syncMessage(ack, result) };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not reach the laptop.";
    if (message.startsWith("Could not reach") || error instanceof TypeError) {
      return {
        ok: false,
        state,
        message: "Can't reach the laptop. Punches stay on this phone.",
      };
    }
    return {
      ok: false,
      state,
      message: message || "Can't reach the laptop. Punches stay on this phone.",
    };
  }
}

function syncMessage(ack: StationHelloAck, result: SyncResult): string {
  if (!result.goLiveAllowed) {
    return `Synced ${result.accepted} new punches. This phone's version does not match the laptop, so it cannot go live.`;
  }
  const offset = result.clockOffsetMs;
  const clock =
    Math.abs(offset) >= result.clockOffsetWarnMs
      ? ` Clock is off by ${(Math.abs(offset) / 1000).toFixed(1)} s.`
      : "";
  const count = result.accepted === 1 ? "1 new punch" : `${result.accepted} new punches`;
  return `Synced ${count}. Roster v${ack.rosterDeltas.at(-1)?.version ?? "current"}.${clock}`;
}

async function postJson(
  fetchImpl: typeof fetch,
  url: string,
  secret: string,
  body: unknown,
): Promise<{ ok: true; body: unknown } | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "Can't reach the laptop. Punches stay on this phone." };
  }
  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = syncErrorSchema.safeParse(parsed);
    return {
      ok: false,
      message: error.success ? error.data.message : "The laptop refused this sync.",
    };
  }
  return { ok: true, body: parsed };
}
