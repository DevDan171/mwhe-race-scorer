import { describe, expect, it } from "vitest";

import { createSampleRacePackage } from "../fixtures/sample-race-package.js";
import { projectPhoneRoster } from "../roster/project.js";
import type { PhoneRoster } from "../schemas/rider.js";
import { applyRosterDelta } from "../sync/apply-delta.js";
import { uuid } from "../test-support.js";
import { SCHEMA_VERSION } from "../version.js";
import { RegistrationError } from "./errors.js";
import {
  addSeriesRiderToEvent,
  changeRiderClass,
  changeRiderNumber,
  importRacePackage,
  isRiderNumberTaken,
  moveCheck,
  addClassToStartRow,
  moveClassToStartRow,
  packageCounts,
  registerNewRider,
  removeClassFromStartRow,
  rosterChangesSince,
  searchSeriesRiders,
  setPlannedStart,
  setRaceLength,
  setRowGapSeconds,
  type ChangeAudit,
  type RaceDayState,
} from "./service.js";

const DOWNLOADED_AT = "2026-09-11T18:00:00.000Z";
const WHEN = "2026-09-12T08:00:00.000Z";

function audit(n: number, why = "Signed up at the trailer"): ChangeAudit {
  return {
    who: "Dana Director",
    when: WHEN,
    why,
    entryId: uuid(n),
  };
}

function hub(): RaceDayState {
  return importRacePackage({
    racePackage: createSampleRacePackage(),
    downloadedAt: DOWNLOADED_AT,
  });
}

describe("race package import", () => {
  it("freezes a snapshot at roster version 1", () => {
    const state = hub();
    expect(state.schemaVersion).toBe(SCHEMA_VERSION);
    expect(state.downloadedAt).toBe(DOWNLOADED_AT);
    expect(state.rosterVersion).toBe(1);
    expect(state.changelog).toEqual([]);
    expect(state.dayOfRegistrations).toEqual([]);
    expect(state.snapshot).toEqual(state.race);
    expect(state.snapshot).not.toBe(state.race);
    expect(packageCounts(state.snapshot)).toEqual({
      seriesRiders: 13,
      eventRegistrations: 10,
      races: 2,
      checks: 6,
    });
    expect(state.rosterDeltas).toHaveLength(1);
    expect(state.rosterDeltas[0]).toMatchObject({ version: 1, baseVersion: 0 });
  });
});

describe("series search", () => {
  it("matches name or number and returns nothing for a blank query", () => {
    const riders = createSampleRacePackage().riders;
    expect(searchSeriesRiders(riders, "   ")).toEqual([]);
    expect(searchSeriesRiders(riders, "nina").map((rider) => rider.number)).toEqual([18]);
    expect(searchSeriesRiders(riders, "HAR").map((rider) => rider.name)).toEqual([
      "Alex Hargrove",
    ]);
    const byNumber = searchSeriesRiders(riders, "18");
    expect(byNumber[0]?.number).toBe(18);
  });
});

describe("event registration", () => {
  it("adds a series rider and bumps the roster version", () => {
    const state = addSeriesRiderToEvent(hub(), {
      seriesId: "s-nina",
      audit: audit(1, "Paid at the trailer"),
    });
    const added = state.race.registrations.find((entry) => entry.riderNumber === 18);
    expect(added).toEqual({
      riderNumber: 18,
      name: "Nina Cho",
      class: "Womens Pro",
      seriesId: "s-nina",
      registeredAt: WHEN,
      assignedRows: [],
    });
    expect(state.rosterVersion).toBe(2);
    expect(state.dayOfRegistrations).toEqual([]);
    expect(state.snapshot.registrations).toHaveLength(10);
    expect(state.changelog).toHaveLength(1);
    expect(state.changelog[0]).toMatchObject({
      who: "Dana Director",
      when: WHEN,
      action: "add",
      before: null,
      why: "Paid at the trailer",
      entity: { type: "registration", id: "s-nina" },
    });
    expect(state.rosterDeltas[1]).toMatchObject({
      version: 2,
      baseVersion: 1,
      removals: [],
      upserts: [{ name: "Nina Cho", number: 18, class: "Womens Pro" }],
    });
  });

  it("does not add the same rider twice", () => {
    const once = addSeriesRiderToEvent(hub(), { seriesId: "s-nina", audit: audit(2) });
    expect(() =>
      addSeriesRiderToEvent(once, { seriesId: "s-nina", audit: audit(3) }),
    ).toThrow(RegistrationError);
  });
});

describe("new riders", () => {
  it("writes the series list and the event roster together and marks day-of", () => {
    const state = registerNewRider(hub(), {
      seriesId: "dayof-sam",
      name: "Sam Ellis",
      number: 501,
      class: "C",
      audit: audit(4, "New series and event registration"),
    });
    expect(
      state.race.riders.find((rider) => rider.seriesId === "dayof-sam"),
    ).toMatchObject({
      name: "Sam Ellis",
      number: 501,
      class: "C",
    });
    expect(
      state.race.registrations.find((entry) => entry.riderNumber === 501),
    ).toMatchObject({
      seriesId: "dayof-sam",
      class: "C",
    });
    expect(state.dayOfRegistrations).toEqual([
      {
        seriesId: "dayof-sam",
        name: "Sam Ellis",
        number: 501,
        class: "C",
        registeredAt: WHEN,
      },
    ]);
    expect(state.rosterVersion).toBe(2);
    expect(state.changelog[0]?.after).toMatchObject({ dayOf: true, number: 501 });
  });

  it("refuses to save when the name is missing and leaves the roster alone", () => {
    const before = hub();
    expect(() =>
      registerNewRider(before, {
        seriesId: "dayof-sam",
        name: "  ",
        number: 501,
        class: "C",
        audit: audit(5),
      }),
    ).toThrow(/name is required/i);
    expect(before.race.riders).toHaveLength(13);
    expect(before.rosterVersion).toBe(1);
  });

  it("blocks a number already used series-wide, including riders not in this event", () => {
    const before = hub();
    expect(isRiderNumberTaken(before.race, 18)).toBe(true);
    expect(before.race.registrations.some((entry) => entry.riderNumber === 18)).toBe(
      false,
    );
    expect(() =>
      registerNewRider(before, {
        seriesId: "dayof-sam",
        name: "Sam Ellis",
        number: 18,
        class: "C",
        audit: audit(6),
      }),
    ).toThrow(RegistrationError);
    let caught: unknown;
    try {
      registerNewRider(before, {
        seriesId: "dayof-sam",
        name: "Sam Ellis",
        number: 500,
        class: "C",
        audit: audit(7),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(RegistrationError);
    expect((caught as RegistrationError).code).toBe("number_taken");
    expect(before.dayOfRegistrations).toEqual([]);
  });
});

describe("number and class changes", () => {
  it("logs a number change, frees the old number, and bumps the roster version", () => {
    const registered = registerNewRider(hub(), {
      seriesId: "dayof-sam",
      name: "Sam Ellis",
      number: 501,
      class: "C",
      audit: audit(8),
    });
    const changed = changeRiderNumber(registered, {
      riderNumber: 501,
      nextNumber: 502,
      audit: audit(9, "Plate was printed wrong"),
    });
    expect(changed.rosterVersion).toBe(3);
    expect(isRiderNumberTaken(changed.race, 501)).toBe(false);
    expect(isRiderNumberTaken(changed.race, 502)).toBe(true);
    expect(
      changed.race.riders.find((rider) => rider.seriesId === "dayof-sam")?.number,
    ).toBe(502);
    expect(changed.dayOfRegistrations[0]?.number).toBe(502);
    expect(changed.changelog[1]).toMatchObject({
      who: "Dana Director",
      action: "change",
      why: "Plate was printed wrong",
      before: { number: 501, class: "C" },
      after: { number: 502, class: "C" },
    });
    expect(changed.rosterDeltas[2]).toMatchObject({
      version: 3,
      baseVersion: 2,
      removals: [501],
      upserts: [{ number: 502, name: "Sam Ellis", class: "C" }],
    });
    expect(() =>
      registerNewRider(changed, {
        seriesId: "dayof-other",
        name: "Other Rider",
        number: 502,
        class: "B",
        audit: audit(10),
      }),
    ).toThrow(/already used/i);
  });

  it("logs a class change without rewriting the series class", () => {
    const registered = addSeriesRiderToEvent(hub(), {
      seriesId: "s-nina",
      audit: audit(11),
    });
    const changed = changeRiderClass(registered, {
      riderNumber: 18,
      nextClass: "A",
      audit: audit(12, "Moving up for this round"),
    });
    expect(changed.rosterVersion).toBe(3);
    expect(changed.race.riders.find((rider) => rider.seriesId === "s-nina")?.class).toBe(
      "Womens Pro",
    );
    expect(
      changed.race.registrations.find((entry) => entry.riderNumber === 18)?.class,
    ).toBe("A");
    expect(changed.changelog[1]).toMatchObject({
      action: "change",
      before: { class: "Womens Pro", number: 18 },
      after: { class: "A", number: 18 },
      why: "Moving up for this round",
    });
    expect(changed.snapshot.registrations.some((entry) => entry.riderNumber === 18)).toBe(
      false,
    );
  });
});

describe("race setup changes", () => {
  it("logs a length edit and keeps the event course in step with the primary race", () => {
    const state = setRaceLength(hub(), {
      raceId: "gnaw-bone-championship",
      length: { mode: "time", minutes: 200 },
      audit: audit(13, "Course is longer this year"),
    });
    expect(state.rosterVersion).toBe(1);
    expect(state.race.event.length).toEqual({ mode: "time", minutes: 200 });
    expect(
      state.race.races.find((race) => race.id === "gnaw-bone-championship")?.length,
    ).toEqual({ mode: "time", minutes: 200 });
    expect(state.snapshot.event.length).toEqual({ mode: "time", minutes: 180 });
    expect(state.changelog[0]).toMatchObject({
      entity: { type: "race", id: "gnaw-bone-championship" },
      action: "change",
      before: { length: { mode: "time", minutes: 180 } },
      after: { length: { mode: "time", minutes: 200 } },
      why: "Course is longer this year",
    });
  });

  it("logs a row gap and a planned start without bumping the roster", () => {
    const gapped = setRowGapSeconds(hub(), {
      raceId: "gnaw-bone-championship",
      rowGapSeconds: 90,
      audit: audit(22, "Give the rows more room"),
    });
    expect(
      gapped.race.races.find((race) => race.id === "gnaw-bone-championship")
        ?.rowGapSeconds,
    ).toBe(90);
    expect(gapped.rosterVersion).toBe(1);
    const started = setPlannedStart(gapped, {
      raceId: "gnaw-bone-championship",
      plannedStart: "2026-09-12T15:30:00.000Z",
      audit: audit(23, "Start moved back"),
    });
    expect(
      started.race.races.find((race) => race.id === "gnaw-bone-championship")
        ?.plannedStart,
    ).toBe("2026-09-12T15:30:00.000Z");
  });

  it("does not copy a non-primary length onto the event", () => {
    const state = setRaceLength(hub(), {
      raceId: "gnaw-bone-youth",
      length: { mode: "laps", laps: null },
      audit: audit(14, "Youth runs until the finish"),
    });
    expect(state.race.event.length).toEqual({ mode: "time", minutes: 180 });
    expect(
      state.race.races.find((race) => race.id === "gnaw-bone-youth")?.length,
    ).toEqual({
      mode: "laps",
      laps: null,
    });
  });

  it("logs check order and start-row class moves", () => {
    const moved = moveCheck(hub(), {
      raceId: "gnaw-bone-championship",
      checkId: "cp2",
      direction: "up",
      audit: audit(15, "Ridge is before the hill"),
    });
    expect(moved.race.event.checks.map((check) => check.id)).toEqual([
      "cp2",
      "cp1",
      "cp3",
      "cp4",
    ]);
    expect(moved.changelog[0]?.entity).toEqual({
      type: "race",
      id: "gnaw-bone-championship",
    });
    const row = moveClassToStartRow(moved, {
      raceId: "gnaw-bone-championship",
      startRowId: "row-sportsman",
      riderClass: "Pro",
      audit: audit(16, "Pro starts with row 2 today"),
    });
    const sportsman = row.race.races
      .find((race) => race.id === "gnaw-bone-championship")
      ?.startRows.find((startRow) => startRow.id === "row-sportsman");
    expect(sportsman?.classes).toContain("Pro");
    expect(row.changelog[1]?.why).toBe("Pro starts with row 2 today");
    expect(row.rosterVersion).toBe(1);
  });

  it("adds a class to another row without taking it off the rows it already uses", () => {
    const state = addClassToStartRow(hub(), {
      raceId: "gnaw-bone-championship",
      startRowId: "row-sportsman",
      riderClass: "A",
      audit: audit(20, "A also leaves with sportsman"),
    });
    const rows =
      state.race.races.find((race) => race.id === "gnaw-bone-championship")?.startRows ??
      [];
    expect(rows.filter((startRow) => startRow.classes.includes("A"))).toHaveLength(4);
    const removed = removeClassFromStartRow(state, {
      raceId: "gnaw-bone-championship",
      startRowId: "row-a-3",
      riderClass: "A",
      audit: audit(21, "Drop the middle A row"),
    });
    const after =
      removed.race.races.find((race) => race.id === "gnaw-bone-championship")
        ?.startRows ?? [];
    expect(after.find((startRow) => startRow.id === "row-a-3")?.classes).toEqual([]);
    expect(after.filter((startRow) => startRow.classes.includes("A"))).toHaveLength(3);
  });
});

describe("roster deltas", () => {
  it("replays from version 0 into the phone roster", () => {
    let state = registerNewRider(hub(), {
      seriesId: "dayof-sam",
      name: "Sam Ellis",
      number: 501,
      class: "C",
      audit: audit(17),
    });
    state = changeRiderNumber(state, {
      riderNumber: 501,
      nextNumber: 502,
      audit: audit(18, "Plate change"),
    });
    state = changeRiderClass(state, {
      riderNumber: 502,
      nextClass: "B",
      audit: audit(19, "Class change"),
    });

    expect(rosterChangesSince(state, state.rosterVersion)).toEqual([]);
    const deltas = rosterChangesSince(state, 0);
    expect(deltas.map((delta) => delta.version)).toEqual([1, 2, 3, 4]);

    let roster: PhoneRoster = {
      schemaVersion: SCHEMA_VERSION,
      eventId: state.race.event.id,
      version: 0,
      riders: [],
    };
    for (const delta of deltas) {
      roster = applyRosterDelta(roster, delta);
    }
    expect(roster).toEqual(projectPhoneRoster(state.race, state.rosterVersion));
    expect(roster.riders.find((rider) => rider.number === 502)).toEqual({
      name: "Sam Ellis",
      number: 502,
      class: "B",
    });
    expect(roster.riders.some((rider) => rider.number === 501)).toBe(false);
  });
});
