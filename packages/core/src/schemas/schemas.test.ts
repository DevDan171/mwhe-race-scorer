import { describe, expect, it } from "vitest";

import { createDemoRace } from "../fixtures/demo-race.js";
import { clone } from "../test-support.js";
import { racePackageSchema } from "./race-package.js";
import { phoneRosterRiderSchema } from "./rider.js";
import { punchSchema } from "./punch.js";
import { penaltySchema } from "./penalty.js";
import { createChangelogEntry } from "./changelog.js";
import { qrCheckpointExportSchema } from "./sync.js";
import { SCHEMA_VERSION } from "../version.js";

describe("race package", () => {
  it("accepts the demo package", () => {
    const race = createDemoRace().race;
    expect(racePackageSchema.parse(race).event.id).toBe("timber-ridge-2026");
  });

  it("rejects a duplicate series rider number", () => {
    const race = clone(createDemoRace().race);
    const first = race.riders[0];
    if (!first) throw new Error("fixture has no riders");
    race.riders.push({ ...first, seriesId: "s-copy" });
    expect(() => racePackageSchema.parse(race)).toThrow(/unique series-wide/i);
  });

  it("rejects a day-of number that belongs to a series rider", () => {
    const race = clone(createDemoRace().race);
    const first = race.riders[0];
    if (!first) throw new Error("fixture has no riders");
    race.registrations.push({
      riderNumber: first.number,
      name: "Day Of",
      class: "C",
      seriesId: null,
      startRow: null,
    });
    expect(() => racePackageSchema.parse(race)).toThrow(/day-of/i);
  });

  it("rejects a registration whose series id does not match the number", () => {
    const race = clone(createDemoRace().race);
    const registration = race.registrations[0];
    if (!registration) throw new Error("fixture has no registrations");
    registration.seriesId = "somebody-else";
    expect(() => racePackageSchema.parse(race)).toThrow(/seriesId does not match/i);
  });

  it("rejects a class list that is not the official set", () => {
    const race = clone(createDemoRace().race);
    race.classes = race.classes.slice(0, -1);
    expect(() => racePackageSchema.parse(race)).toThrow(/official MWHE class list/i);
  });

  it("rejects a package with no races", () => {
    const race = clone(createDemoRace().race);
    const broken = { ...race, races: [] };
    expect(() => racePackageSchema.parse(broken)).toThrow();
  });

  it("rejects a primary race that disagrees with the event course", () => {
    const race = clone(createDemoRace().race);
    race.event.length = { mode: "time", minutes: 90 };
    expect(() => racePackageSchema.parse(race)).toThrow(/primary race/i);
  });

  it("accepts one class on several start rows", () => {
    const race = clone(createDemoRace().race);
    const course = race.races[0];
    if (!course) throw new Error("fixture has no race");
    course.startRows.push({
      id: "timber-row-a",
      order: 3,
      label: "A",
      classes: ["A"],
    });
    const parsed = racePackageSchema.parse(race);
    const rows = parsed.races[0]?.startRows.filter((row) => row.classes.includes("A"));
    expect(rows).toHaveLength(2);
  });

  it("reads an older package that stored a time limit instead of a length", () => {
    const race = clone(createDemoRace().race);
    const legacyEvent = {
      id: race.event.id,
      name: race.event.name,
      date: race.event.date,
      timeLimitMinutes: 180,
      checks: race.event.checks,
    };
    const legacyRaces = race.races.map((entry) => ({
      id: entry.id,
      name: entry.name,
      order: entry.order,
      timeLimitMinutes: 180,
      laps: 1,
      checks: entry.checks,
      startRows: entry.startRows,
    }));
    const parsed = racePackageSchema.parse({
      ...race,
      event: legacyEvent,
      races: legacyRaces,
    });
    expect(parsed.event.length).toEqual({ mode: "time", minutes: 180 });
    expect(parsed.races[0]?.length).toEqual({ mode: "time", minutes: 180 });
    expect(parsed.event).not.toHaveProperty("timeLimitMinutes");
    expect(parsed.races[0]).not.toHaveProperty("laps");
    expect(parsed.registrations[0]?.startRow).toBeNull();
    expect(parsed.races[0]?.rowGapSeconds).toBe(0);
    expect(parsed.races[0]?.plannedStart).toBeNull();
  });

  it("keeps a lap race with no lap count from gaining a time limit", () => {
    const race = clone(createDemoRace().race);
    race.event.length = { mode: "laps", laps: null };
    const course = race.races[0];
    if (!course) throw new Error("fixture has no race");
    course.length = { mode: "laps", laps: null };
    const parsed = racePackageSchema.parse(race);
    expect(parsed.event.length).toEqual({ mode: "laps", laps: null });
    expect(parsed.event).not.toHaveProperty("timeLimitMinutes");
  });

  it("rejects the wrong schema version", () => {
    const race = clone(createDemoRace().race);
    const broken = { ...race, schemaVersion: 2 };
    expect(() => racePackageSchema.parse(broken)).toThrow();
  });
});

describe("phone roster rider", () => {
  it("rejects anything beyond name, number, and class", () => {
    expect(() =>
      phoneRosterRiderSchema.parse({
        name: "Alex Hargrove",
        number: 1,
        class: "Pro",
        seriesId: "s-alex",
      }),
    ).toThrow();
  });
});

describe("punch", () => {
  it("allows a rider number that is not on a roster", () => {
    const punch = punchSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      uuid: "00000000-0000-4000-8000-000000000099",
      checkId: "cp1",
      deviceId: "station-1",
      riderNumber: 9999,
      timestamp: "2026-06-14T15:00:00.000Z",
      createdAt: "2026-06-14T15:00:00.100Z",
      voided: false,
    });
    expect(punch.riderNumber).toBe(9999);
  });
});

describe("penalty", () => {
  it("accepts an overall scope and a check scope", () => {
    expect(
      penaltySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        id: "00000000-0000-4000-8000-0000000000aa",
        riderNumber: 1,
        seconds: 30,
        scope: { type: "overall" },
        appliedBy: "admin",
        reason: "Late to the line",
        createdAt: "2026-06-14T14:00:00.000Z",
      }).scope,
    ).toEqual({ type: "overall" });

    expect(() =>
      penaltySchema.parse({
        schemaVersion: SCHEMA_VERSION,
        id: "00000000-0000-4000-8000-0000000000ab",
        riderNumber: 1,
        seconds: 30,
        scope: { type: "overall", checkId: "cp1" },
        appliedBy: "race_director",
        reason: "No",
        createdAt: "2026-06-14T14:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("changelog", () => {
  it("stamps the schema version", () => {
    const entry = createChangelogEntry({
      id: "00000000-0000-4000-8000-0000000000cc",
      who: "race-director",
      when: "2026-06-14T16:00:00.000Z",
      entity: { type: "penalty", id: "pen-1" },
      action: "add",
      before: null,
      after: { seconds: 60 },
      why: "Missed gate",
    });
    expect(entry.schemaVersion).toBe(SCHEMA_VERSION);
  });
});

describe("qr export", () => {
  it("rejects a part past the end of the set", () => {
    expect(() =>
      qrCheckpointExportSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        type: "qr_checkpoint_export",
        eventId: "evt",
        checkId: "cp1",
        deviceId: "station-1",
        exportedAt: "2026-06-14T16:00:00.000Z",
        part: 3,
        parts: 2,
        punches: [],
      }),
    ).toThrow(/part/i);
  });
});
