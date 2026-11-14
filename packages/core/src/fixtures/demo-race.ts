import { RIDER_CLASSES, type RiderClass } from "../classes.js";
import type { Punch } from "../schemas/punch.js";
import type { ScoreRaceInput } from "../scoring/types.js";
import { scoreRaceInputSchema } from "../scoring/types.js";
import { SCHEMA_VERSION } from "../version.js";

/**
 * A fictional round used by tests and the Phase 0 app scaffolds.
 * Times are seconds after 2026-06-14T14:00:00.000Z. The assertions live in
 * demo-race.test.ts so this file stays input-only.
 *
 * Included on purpose:
 * - several classes
 * - a duplicate punch uuid (Alex, CP2)
 * - a second punch at the same check with a new uuid (Dana, CP1)
 * - a voided punch (Fran, and Dana's CP4)
 * - an unknown rider number (999)
 * - an over-limit punch (Gale, CP4, past the 180 minute limit)
 * - a check penalty and an overall penalty (Dana)
 * - a DNF with a start and no valid punches (Fran, Indigo)
 * - a registered rider with no start (Jules) — also DNF
 * - a manual DQ (Harper) who would otherwise have been fast
 */

const RACE_START_MS = Date.parse("2026-06-14T14:00:00.000Z");

function at(offsetSeconds: number): string {
  return new Date(RACE_START_MS + offsetSeconds * 1000).toISOString();
}

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function punch(args: {
  n: number;
  checkId: string;
  riderNumber: number;
  offsetSeconds: number;
  voided?: boolean;
  deviceId?: string;
}): Punch {
  const timestamp = at(args.offsetSeconds);
  return {
    schemaVersion: SCHEMA_VERSION,
    uuid: uuid(args.n),
    checkId: args.checkId,
    deviceId: args.deviceId ?? `station-${args.checkId}`,
    riderNumber: args.riderNumber,
    timestamp,
    createdAt: timestamp,
    voided: args.voided ?? false,
  };
}

function seriesRider(
  seriesId: string,
  name: string,
  number: number,
  riderClass: RiderClass,
) {
  return { seriesId, name, number, class: riderClass };
}

function registration(
  seriesId: string,
  name: string,
  number: number,
  riderClass: RiderClass,
) {
  return { seriesId, name, riderNumber: number, class: riderClass };
}

export function createDemoRace(): ScoreRaceInput {
  const riders = [
    seriesRider("s-alex", "Alex Hargrove", 1, "Pro"),
    seriesRider("s-blake", "Blake Iverson", 7, "Pro"),
    seriesRider("s-indigo", "Indigo Shaw", 3, "Pro"),
    seriesRider("s-casey", "Casey Nguyen", 42, "A"),
    seriesRider("s-dana", "Dana Brooks", 55, "A"),
    seriesRider("s-harper", "Harper Quinn", 77, "A"),
    seriesRider("s-erin", "Erin Vasquez", 88, "B"),
    seriesRider("s-fran", "Fran Okonkwo", 90, "B"),
    seriesRider("s-gale", "Gale Petrov", 120, "+40A"),
    seriesRider("s-jules", "Jules Marin", 64, "C"),
  ];

  const alexCp2 = punch({
    n: 2,
    checkId: "cp2",
    riderNumber: 1,
    offsetSeconds: 2700,
  });

  return scoreRaceInputSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    resultsVersion: 1,
    resultsStatus: "provisional",
    publishedAt: "2026-06-14T18:00:00.000Z",
    race: {
      schemaVersion: SCHEMA_VERSION,
      classes: [...RIDER_CLASSES],
      event: {
        id: "timber-ridge-2026",
        name: "Round 3 — Timber Ridge",
        date: "2026-06-14",
        timeLimitMinutes: 180,
        checks: [
          { id: "cp1", order: 1, name: "CP1 Start Hill" },
          { id: "cp2", order: 2, name: "CP2 Ridge" },
          { id: "cp3", order: 3, name: "CP3 Creek" },
          { id: "cp4", order: 4, name: "CP4 Finish" },
        ],
      },
      riders,
      registrations: riders.map((rider) =>
        registration(rider.seriesId, rider.name, rider.number, rider.class),
      ),
    },
    startTimes: [
      { schemaVersion: SCHEMA_VERSION, riderNumber: 1, startedAt: at(0) },
      { schemaVersion: SCHEMA_VERSION, riderNumber: 7, startedAt: at(0) },
      { schemaVersion: SCHEMA_VERSION, riderNumber: 3, startedAt: at(300) },
      { schemaVersion: SCHEMA_VERSION, riderNumber: 42, startedAt: at(30) },
      { schemaVersion: SCHEMA_VERSION, riderNumber: 55, startedAt: at(0) },
      { schemaVersion: SCHEMA_VERSION, riderNumber: 77, startedAt: at(0) },
      { schemaVersion: SCHEMA_VERSION, riderNumber: 88, startedAt: at(0) },
      { schemaVersion: SCHEMA_VERSION, riderNumber: 90, startedAt: at(0) },
      { schemaVersion: SCHEMA_VERSION, riderNumber: 120, startedAt: at(0) },
      { schemaVersion: SCHEMA_VERSION, riderNumber: 999, startedAt: at(0) },
    ],
    penalties: [
      {
        schemaVersion: SCHEMA_VERSION,
        id: uuid(501),
        riderNumber: 55,
        seconds: 60,
        scope: { type: "overall" },
        appliedBy: "race_director",
        reason: "Course cut on the ridge trail",
        createdAt: at(7000),
      },
      {
        schemaVersion: SCHEMA_VERSION,
        id: uuid(502),
        riderNumber: 55,
        seconds: 120,
        scope: { type: "check", checkId: "cp2" },
        appliedBy: "race_director",
        reason: "Missed gate at CP2",
        createdAt: at(7001),
      },
    ],
    disqualifications: [
      {
        schemaVersion: SCHEMA_VERSION,
        riderNumber: 77,
        reason: "Outside assistance",
        appliedBy: "race_director",
        createdAt: at(8000),
      },
    ],
    punches: [
      punch({ n: 1, checkId: "cp1", riderNumber: 1, offsetSeconds: 1200 }),
      alexCp2,
      // Same uuid, different timestamp. Scoring keeps the first copy.
      { ...alexCp2, timestamp: at(2800), createdAt: at(2800) },
      punch({ n: 3, checkId: "cp3", riderNumber: 1, offsetSeconds: 4200 }),
      punch({ n: 4, checkId: "cp4", riderNumber: 1, offsetSeconds: 6000 }),
      punch({ n: 5, checkId: "not-a-check", riderNumber: 1, offsetSeconds: 5000 }),

      punch({ n: 11, checkId: "cp1", riderNumber: 7, offsetSeconds: 1320 }),
      punch({ n: 12, checkId: "cp2", riderNumber: 7, offsetSeconds: 3000 }),
      punch({ n: 13, checkId: "cp3", riderNumber: 7, offsetSeconds: 4800 }),
      punch({ n: 14, checkId: "cp4", riderNumber: 7, offsetSeconds: 6900 }),

      punch({ n: 21, checkId: "cp1", riderNumber: 42, offsetSeconds: 1500 }),
      punch({ n: 22, checkId: "cp2", riderNumber: 42, offsetSeconds: 3300 }),
      punch({ n: 23, checkId: "cp3", riderNumber: 42, offsetSeconds: 5400 }),
      punch({ n: 24, checkId: "cp4", riderNumber: 42, offsetSeconds: 7500 }),

      punch({ n: 31, checkId: "cp1", riderNumber: 55, offsetSeconds: 1800 }),
      punch({ n: 32, checkId: "cp1", riderNumber: 55, offsetSeconds: 1860 }),
      punch({ n: 33, checkId: "cp2", riderNumber: 55, offsetSeconds: 3900 }),
      punch({ n: 34, checkId: "cp3", riderNumber: 55, offsetSeconds: 6600 }),
      punch({
        n: 35,
        checkId: "cp4",
        riderNumber: 55,
        offsetSeconds: 7200,
        voided: true,
      }),

      punch({ n: 41, checkId: "cp1", riderNumber: 77, offsetSeconds: 1400 }),
      punch({ n: 42, checkId: "cp2", riderNumber: 77, offsetSeconds: 2800 }),
      punch({ n: 43, checkId: "cp3", riderNumber: 77, offsetSeconds: 4200 }),
      punch({ n: 44, checkId: "cp4", riderNumber: 77, offsetSeconds: 5600 }),

      punch({ n: 51, checkId: "cp1", riderNumber: 88, offsetSeconds: 2400 }),
      punch({ n: 52, checkId: "cp2", riderNumber: 88, offsetSeconds: 5400 }),

      punch({
        n: 61,
        checkId: "cp1",
        riderNumber: 90,
        offsetSeconds: 3000,
        voided: true,
      }),

      punch({ n: 71, checkId: "cp1", riderNumber: 120, offsetSeconds: 2100 }),
      punch({ n: 72, checkId: "cp2", riderNumber: 120, offsetSeconds: 4800 }),
      punch({ n: 73, checkId: "cp3", riderNumber: 120, offsetSeconds: 9600 }),
      // 190 minutes. The limit is 180, so this is shown and not scored.
      punch({ n: 74, checkId: "cp4", riderNumber: 120, offsetSeconds: 11400 }),

      punch({ n: 81, checkId: "cp1", riderNumber: 999, offsetSeconds: 1680 }),
      punch({ n: 82, checkId: "cp2", riderNumber: 999, offsetSeconds: 3600 }),
    ],
  });
}
