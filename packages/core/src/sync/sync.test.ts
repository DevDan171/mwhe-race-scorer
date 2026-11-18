import { describe, expect, it } from "vitest";

import { createDemoRace } from "../fixtures/demo-race.js";
import { clone } from "../test-support.js";
import { projectPhoneRoster } from "../roster/project.js";
import { SCHEMA_VERSION } from "../version.js";
import {
  importQrCheckpointExport,
  rosterDeltaMessageSchema,
  type RosterDeltaMessage,
} from "../schemas/sync.js";
import { applyRosterDelta } from "./apply-delta.js";

function delta(overrides: Partial<RosterDeltaMessage> = {}): RosterDeltaMessage {
  return {
    schemaVersion: SCHEMA_VERSION,
    type: "roster_delta",
    eventId: "timber-ridge-2026",
    version: 2,
    baseVersion: 1,
    upserts: [],
    removals: [],
    ...overrides,
  };
}

describe("phone roster and sync", () => {
  it("drops series-only riders and keeps day-of entries", () => {
    const race = clone(createDemoRace().race);
    race.riders.push({
      seriesId: "s-sam",
      name: "Sam Ellis",
      number: 500,
      class: "B",
    });
    race.registrations.push({
      riderNumber: 510,
      name: "Riley Cole",
      class: "C",
      seriesId: null,
      registeredAt: null,
      assignedRows: [],
    });
    const roster = projectPhoneRoster(race, 4);
    expect(roster.version).toBe(4);
    expect(roster.riders.some((rider) => rider.number === 500)).toBe(false);
    expect(roster.riders.find((rider) => rider.number === 510)).toEqual({
      name: "Riley Cole",
      number: 510,
      class: "C",
    });
  });

  it("applies a sequential roster delta", () => {
    const roster = projectPhoneRoster(createDemoRace().race);
    const updated = applyRosterDelta(
      roster,
      delta({
        upserts: [
          { name: "Alex Hargrove", number: 1, class: "A" },
          { name: "Riley Cole", number: 510, class: "C" },
        ],
        removals: [64],
      }),
    );
    expect(updated.version).toBe(2);
    expect(updated.riders.find((rider) => rider.number === 1)?.class).toBe("A");
    expect(updated.riders.find((rider) => rider.number === 510)?.name).toBe("Riley Cole");
    expect(updated.riders.some((rider) => rider.number === 64)).toBe(false);
  });

  it("rejects a delta that skips a version, a base, or another event", () => {
    const roster = projectPhoneRoster(createDemoRace().race);
    expect(() => applyRosterDelta(roster, delta({ version: 3 }))).toThrow(/version 3/i);
    expect(() => applyRosterDelta(roster, delta({ baseVersion: 0 }))).toThrow(
      /baseVersion 0/i,
    );
    expect(() => applyRosterDelta(roster, delta({ eventId: "other" }))).toThrow(
      /does not match/i,
    );
  });

  it("rejects a delta that lists a rider twice", () => {
    expect(() =>
      rosterDeltaMessageSchema.parse(
        delta({
          upserts: [
            { name: "Alex", number: 1, class: "Pro" },
            { name: "Alex Again", number: 1, class: "A" },
          ],
        }),
      ),
    ).toThrow(/upserts/i);
    expect(() => rosterDeltaMessageSchema.parse(delta({ removals: [4, 4] }))).toThrow(
      /removals/i,
    );
    expect(() =>
      rosterDeltaMessageSchema.parse(
        delta({
          upserts: [{ name: "Alex", number: 1, class: "Pro" }],
          removals: [1],
        }),
      ),
    ).toThrow(/upserted and removed/i);
  });

  it("imports a QR frame as punches locked to that station", () => {
    const punches = importQrCheckpointExport({
      schemaVersion: SCHEMA_VERSION,
      type: "qr_checkpoint_export",
      eventId: "timber-ridge-2026",
      checkId: "cp3",
      deviceId: "station-out-of-range",
      exportedAt: "2026-06-14T16:30:00.000Z",
      part: 1,
      parts: 2,
      punches: [
        {
          uuid: "00000000-0000-4000-8000-000000000111",
          riderNumber: 42,
          timestamp: "2026-06-14T15:30:00.000Z",
          createdAt: "2026-06-14T15:30:01.000Z",
          voided: false,
        },
      ],
    });
    expect(punches).toEqual([
      {
        schemaVersion: SCHEMA_VERSION,
        uuid: "00000000-0000-4000-8000-000000000111",
        checkId: "cp3",
        deviceId: "station-out-of-range",
        riderNumber: 42,
        timestamp: "2026-06-14T15:30:00.000Z",
        createdAt: "2026-06-14T15:30:01.000Z",
        voided: false,
      },
    ]);
  });
});
