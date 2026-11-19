import { RIDER_CLASSES, type RiderClass } from "../classes.js";
import {
  createSampleRacePackage,
  SAMPLE_EVENT_ID,
} from "../fixtures/sample-race-package.js";
import {
  racePackageSchema,
  type EventRegistration,
  type RacePackage,
  type SeriesRider,
} from "../schemas/race-package.js";
import { SCHEMA_VERSION } from "../version.js";
import type { EventSummary } from "./client.js";

export const SCORING_TEST_EVENT_ID = "scoring-test";

export interface MockCatalogEvent {
  summary: EventSummary;
  racePackage: RacePackage;
}

/**
 * Events the local mock lists. Gnaw Bone is the documented sample package.
 * Scoring Test is the event the laptop screens are exercised against.
 */
export function mockCatalog(): MockCatalogEvent[] {
  return [
    {
      summary: summary({
        id: SCORING_TEST_EVENT_ID,
        name: "Scoring Test Event",
        date: "2026-11-19",
        endDate: null,
        locationName: "Midwest test grounds, IL",
        round: null,
        status: "published",
        updatedAt: "2026-11-18T18:00:00.000Z",
        raceCount: 3,
        registrationCount: 12,
      }),
      racePackage: scoringTestPackage(),
    },
    {
      summary: summary({
        id: SAMPLE_EVENT_ID,
        name: "Gnaw Bone Hard Enduro 2026",
        date: "2026-09-12",
        endDate: null,
        locationName: "Nashville, IN",
        round: 4,
        status: "published",
        updatedAt: "2026-11-01T15:00:00.000Z",
        raceCount: 2,
        registrationCount: 10,
      }),
      racePackage: createSampleRacePackage(),
    },
    simpleEvent({
      id: "winter-warrior-2026",
      name: "Winter Warrior Series Opener",
      date: "2026-12-12",
      locationName: "Rolla, MO",
      round: 5,
      updatedAt: "2026-11-10T15:00:00.000Z",
      riders: [
        ["ww-1", "Pat Winter", 11, "A"],
        ["ww-2", "Jo Winter", 12, "B"],
      ],
    }),
    simpleEvent({
      id: "season-finale-2026",
      name: "Season Finale Showdown",
      date: "2026-10-24",
      locationName: "Mineral Point, WI",
      round: 6,
      updatedAt: "2026-10-20T15:00:00.000Z",
      riders: [
        ["sf-1", "Morgan Hale", 21, "Pro"],
        ["sf-2", "Riley Hale", 22, "A"],
      ],
    }),
    simpleEvent({
      id: "backwoods-2026",
      name: "Backwoods Bash",
      date: "2026-09-19",
      locationName: "Cadiz, KY",
      round: 3,
      updatedAt: "2026-09-01T15:00:00.000Z",
      riders: [["bw-1", "Casey Woods", 31, "B"]],
    }),
    simpleEvent({
      id: "spring-thaw-2026",
      name: "Spring Thaw Enduro",
      date: "2026-04-11",
      locationName: "Hurricane Mills, TN",
      round: 1,
      updatedAt: "2026-04-01T15:00:00.000Z",
      riders: [["st-1", "Jamie Thaw", 41, "C"]],
    }),
  ];
}

function summary(input: EventSummary): EventSummary {
  return input;
}

function simpleEvent(input: {
  id: string;
  name: string;
  date: string;
  locationName: string;
  round: number;
  updatedAt: string;
  riders: [string, string, number, RiderClass][];
}): MockCatalogEvent {
  const riders: SeriesRider[] = input.riders.map(
    ([seriesId, name, number, riderClass]) => ({
      seriesId,
      name,
      number,
      class: riderClass,
      updatedAt: input.updatedAt,
    }),
  );
  const checks = [{ id: `${input.id}-finish`, order: 1, name: "Finish" }];
  const racePackage = racePackageSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    event: {
      id: input.id,
      name: input.name,
      date: input.date,
      length: { mode: "time", minutes: 120 },
      checks,
      updatedAt: input.updatedAt,
    },
    races: [
      {
        id: `${input.id}-race`,
        name: input.name,
        order: 1,
        length: { mode: "time", minutes: 120 },
        rowGapSeconds: 60,
        plannedStart: `${input.date}T15:00:00.000Z`,
        checks,
        updatedAt: input.updatedAt,
        startRows: [
          {
            id: `${input.id}-row-1`,
            order: 1,
            label: "Row 1",
            classes: [...RIDER_CLASSES],
          },
        ],
      },
    ],
    classes: [...RIDER_CLASSES],
    riders,
    registrations: riders.map((rider) => ({
      riderNumber: rider.number,
      name: rider.name,
      class: rider.class,
      seriesId: rider.seriesId,
      registeredAt: input.updatedAt,
      assignedRows: [],
      payment: "paid",
      updatedAt: input.updatedAt,
    })),
  });
  return {
    summary: {
      id: input.id,
      name: input.name,
      date: input.date,
      endDate: null,
      locationName: input.locationName,
      round: input.round,
      status: "published",
      updatedAt: input.updatedAt,
      raceCount: 1,
      registrationCount: riders.length,
    },
    racePackage,
  };
}

function scoringTestPackage(): RacePackage {
  const updatedAt = "2026-11-18T18:00:00.000Z";
  const checks = [
    { id: "goblin", order: 1, name: "Goblin" },
    { id: "nut", order: 2, name: "Nut Cracker" },
    { id: "face", order: 3, name: "Face Slapper" },
  ];
  const amateurChecks = [
    { id: "am-1", order: 1, name: "Amateur 1" },
    { id: "am-2", order: 2, name: "Amateur finish" },
  ];
  const proChecks = [{ id: "pro-1", order: 1, name: "Pro loop" }];
  const riders: SeriesRider[] = [
    person("st-101", "Ira", "Cole", 101, "Pro", updatedAt, true),
    person("st-171", "Maya", "Ortiz", 171, "Pro", updatedAt, true),
    person("st-102", "Noah", "Bennett", 102, "A", updatedAt, true),
    person("st-103", "Eli", "Foster", 103, "A", updatedAt, false),
    person("st-110", "Eli", "Foster", 110, "A", updatedAt, true),
    person("st-289", "Sam", "Reyes", 289, "A", updatedAt, true),
    person("st-105", "June", "Park", 105, "+40A", updatedAt, true),
    person("st-106", "Ben", "Walsh", 106, "B", updatedAt, true),
    person("st-107", "Ben", "Walsh", 107, "B", "2026-11-18T19:15:00.000Z", true),
    person("st-109", "Cole", "Hendricks", 109, "B", updatedAt, true, {
      dateOfBirth: "1994-03-14",
      phone: "(555) 013-0109",
      email: "cole.hendricks@example.com",
      emergencyContactName: "Dana Hendricks",
      emergencyContactPhone: "(555) 013-0210",
      emergencyContactRelation: "Spouse",
      safetyAcknowledged: true,
      safetyAcknowledgedAt: "2026-11-18T19:12:00.000Z",
    }),
    person("st-108", "Owen", "Hart", 108, "C", updatedAt, false),
    person("st-104", "Kara", "Lin", 104, "Womens", updatedAt, true),
  ];
  // #107 is Ben Walsh in the re-import story. #106 is a different B rider.
  const named = riders.map((rider) => {
    if (rider.number === 101) return { ...rider, name: "Alex Proctor" };
    if (rider.number === 102) return { ...rider, name: "Avery Quinn" };
    if (rider.number === 103) return { ...rider, name: "Casey Nguyen" };
    if (rider.number === 106) return { ...rider, name: "Fran Okonkwo" };
    return rider;
  });
  const row = (
    raceId: string,
    order: number,
    riderClass: RiderClass,
  ): { id: string; order: number; label: string; classes: [RiderClass] } => ({
    id: `${raceId}-row-${order}`,
    order,
    label: riderClass,
    classes: [riderClass],
  });
  const testRows = [
    row("test-race-1", 1, "Pro"),
    row("test-race-1", 2, "A"),
    row("test-race-1", 3, "A"),
    row("test-race-1", 4, "A"),
    row("test-race-1", 5, "+40A"),
    row("test-race-1", 6, "B"),
    row("test-race-1", 7, "+40B"),
    row("test-race-1", 8, "C"),
    row("test-race-1", 9, "Womens"),
  ];
  const registrations: EventRegistration[] = named.map((rider) => ({
    riderNumber: rider.number,
    name: rider.name,
    class: rider.class,
    seriesId: rider.seriesId,
    registeredAt: "2026-11-01T12:00:00.000Z",
    assignedRows: assignmentFor(rider.number),
    enteredRaceIds: racesFor(rider.class),
    payment: rider.number === 109 ? "unpaid" : "paid",
    updatedAt: rider.updatedAt ?? updatedAt,
    ...(rider.number === 109
      ? {
          dateOfBirth: "1994-03-14",
          phone: "(555) 013-0109",
          email: "cole.hendricks@example.com",
          emergencyContactName: "Dana Hendricks",
          emergencyContactPhone: "(555) 013-0210",
          emergencyContactRelation: "Spouse",
          safetyAcknowledged: true,
          safetyAcknowledgedAt: "2026-11-18T19:12:00.000Z",
        }
      : {}),
  }));
  return racePackageSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    event: {
      id: SCORING_TEST_EVENT_ID,
      name: "Scoring Test Event",
      date: "2026-11-19",
      length: { mode: "time", minutes: 120 },
      checks,
      updatedAt,
    },
    races: [
      {
        id: "test-race-1",
        name: "Test Race 1",
        order: 1,
        length: { mode: "time", minutes: 120 },
        rowGapSeconds: 60,
        plannedStart: "2026-11-19T10:00:00.000Z",
        checks,
        startRows: testRows,
        updatedAt,
      },
      {
        id: "amateur-race",
        name: "Amateur Race",
        order: 2,
        length: { mode: "laps", laps: 2 },
        rowGapSeconds: 60,
        plannedStart: "2026-11-19T18:00:00.000Z",
        checks: amateurChecks,
        updatedAt,
        startRows: [
          row("amateur-race", 1, "A"),
          row("amateur-race", 2, "B"),
          row("amateur-race", 3, "B"),
          row("amateur-race", 4, "C"),
        ],
      },
      {
        id: "pro-race",
        name: "Pro/A",
        order: 3,
        length: { mode: "time", minutes: 90 },
        rowGapSeconds: 30,
        plannedStart: "2026-11-19T20:00:00.000Z",
        checks: proChecks,
        updatedAt,
        startRows: [row("pro-race", 1, "Pro"), row("pro-race", 2, "A")],
      },
    ],
    classes: [...RIDER_CLASSES],
    riders: named,
    registrations,
  });
}

function person(
  seriesId: string,
  first: string,
  last: string,
  number: number,
  riderClass: RiderClass,
  updatedAt: string,
  acknowledged: boolean,
  contact?: Partial<SeriesRider>,
): SeriesRider {
  return {
    seriesId,
    name: `${first} ${last}`,
    number,
    class: riderClass,
    updatedAt,
    safetyAcknowledged: acknowledged,
    ...(acknowledged ? { safetyAcknowledgedAt: updatedAt } : {}),
    ...contact,
  };
}

function assignmentFor(number: number): { raceId: string; row: number }[] {
  const test: Record<number, number> = {
    101: 1,
    171: 1,
    102: 2,
    103: 2,
    105: 5,
    106: 6,
    107: 6,
    109: 6,
  };
  const row = test[number];
  return row ? [{ raceId: "test-race-1", row }] : [];
}

function racesFor(riderClass: RiderClass): string[] {
  const races = ["test-race-1"];
  if (["A", "B", "C"].includes(riderClass)) races.push("amateur-race");
  if (riderClass === "Pro" || riderClass === "A") races.push("pro-race");
  return races;
}

/**
 * A site-side change used by the mock's touch route and by re-import tests.
 * Length moves, one class moves, and three riders are added. Contact values
 * on the new riders are present so the lookup screen can show them.
 */
export function touchRacePackage(race: RacePackage, updatedAt: string): RacePackage {
  const next = structuredClone(race);
  next.event.updatedAt = updatedAt;
  const primary = next.races[0];
  if (primary) {
    primary.updatedAt = updatedAt;
    if (primary.length.mode === "time")
      primary.length = { mode: "time", minutes: primary.length.minutes + 30 };
    next.event.length = primary.length;
  }
  const target = next.registrations.find((entry) => entry.riderNumber === 107);
  if (target && target.class === "B") {
    target.class = "A";
    target.updatedAt = updatedAt;
    target.assignedRows = target.assignedRows.map((assignment) =>
      assignment.raceId === "test-race-1" ? { ...assignment, row: 3 } : assignment,
    );
    const series = next.riders.find((rider) => rider.seriesId === target.seriesId);
    if (series) {
      series.class = "A";
      series.updatedAt = updatedAt;
    }
  }
  const additions = [
    { seriesId: "st-new-210", name: "Eli Foster", number: 210, class: "A" as const },
    { seriesId: "st-new-211", name: "Maya Ortiz", number: 211, class: "Pro" as const },
    { seriesId: "st-new-299", name: "Sam Reyes", number: 299, class: "A" as const },
  ];
  for (const addition of additions) {
    if (next.riders.some((rider) => rider.number === addition.number)) continue;
    if (next.registrations.some((entry) => entry.riderNumber === addition.number))
      continue;
    next.riders.push({ ...addition, updatedAt });
    next.registrations.push({
      riderNumber: addition.number,
      name: addition.name,
      class: addition.class,
      seriesId: addition.seriesId,
      registeredAt: updatedAt,
      assignedRows: [],
      payment: "paid",
      updatedAt,
      phone: "(555) 010-0199",
      emergencyContactName: "Pat Foster",
      emergencyContactPhone: "(555) 010-0200",
      emergencyContactRelation: "Parent",
      safetyAcknowledged: true,
      safetyAcknowledgedAt: updatedAt,
    });
  }
  return racePackageSchema.parse(next);
}
