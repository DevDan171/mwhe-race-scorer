import { RIDER_CLASSES, type RiderClass } from "../classes.js";
import {
  racePackageSchema,
  type RacePackage,
  type SeriesRider,
} from "../schemas/race-package.js";
import { SCHEMA_VERSION } from "../version.js";

/** Event id the local mock site serves. */
export const SAMPLE_EVENT_ID = "gnaw-bone-2026";

function rider(
  seriesId: string,
  name: string,
  number: number,
  riderClass: RiderClass,
): SeriesRider {
  return { seriesId, name, number, class: riderClass };
}

/**
 * A full race package used by the mock site and download tests.
 * Nina, Omar, and Liam are on the series list and not yet in the event,
 * so offline registration has someone to add. 18, 500, and 305 are taken
 * series-wide even though they are not on the event roster.
 */
export function createSampleRacePackage(): RacePackage {
  const championshipChecks = [
    { id: "cp1", order: 1, name: "CP1 Start Hill" },
    { id: "cp2", order: 2, name: "CP2 Ridge" },
    { id: "cp3", order: 3, name: "CP3 Creek" },
    { id: "cp4", order: 4, name: "CP4 Finish" },
  ];
  const riders = [
    rider("s-alex", "Alex Hargrove", 1, "Pro"),
    rider("s-blake", "Blake Iverson", 7, "Pro"),
    rider("s-avery", "Avery Quinn", 33, "A"),
    rider("s-casey", "Casey Nguyen", 42, "A"),
    rider("s-dana", "Dana Brooks", 55, "A"),
    rider("s-erin", "Erin Vasquez", 88, "B"),
    rider("s-fran", "Fran Okonkwo", 90, "B"),
    rider("s-gale", "Gale Petrov", 120, "+40A"),
    rider("s-jules", "Jules Marin", 64, "C"),
    rider("s-kira", "Kira Holt", 214, "Womens"),
    rider("s-nina", "Nina Cho", 18, "Womens Pro"),
    rider("s-omar", "Omar Shah", 500, "Electric Pro"),
    rider("s-liam", "Liam Ortega", 305, "65/85"),
  ];
  // Nina, Omar, and Liam stay on the series list and off the event roster.
  const entered = riders.filter(
    (entry) => !["s-nina", "s-omar", "s-liam"].includes(entry.seriesId),
  );

  return racePackageSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    event: {
      id: SAMPLE_EVENT_ID,
      name: "Round 4 — Gnaw Bone",
      date: "2026-09-12",
      length: { mode: "time", minutes: 180 },
      checks: championshipChecks,
    },
    races: [
      {
        id: "gnaw-bone-championship",
        name: "Championship",
        order: 1,
        length: { mode: "time", minutes: 180 },
        rowGapSeconds: 60,
        plannedStart: "2026-09-12T14:00:00.000Z",
        checks: championshipChecks,
        // Row numbers run across the race. A uses rows 2, 3, and 4.
        startRows: [
          {
            id: "row-pro",
            order: 1,
            label: "Pro",
            classes: ["Pro", "Womens Pro", "Electric Pro"],
          },
          { id: "row-a-2", order: 2, label: "A", classes: ["A"] },
          { id: "row-a-3", order: 3, label: "A", classes: ["A"] },
          { id: "row-a-4", order: 4, label: "A", classes: ["A"] },
          {
            id: "row-sportsman",
            order: 5,
            label: "Sportsman",
            classes: ["B", "C", "+40A", "+40B", "+40C", "Womens", "Electric Sportsman"],
          },
        ],
      },
      {
        id: "gnaw-bone-youth",
        name: "Youth",
        order: 2,
        length: { mode: "laps", laps: 2 },
        rowGapSeconds: 0,
        plannedStart: null,
        checks: [
          { id: "y1", order: 1, name: "Youth 1" },
          { id: "y2", order: 2, name: "Youth 2" },
        ],
        startRows: [
          {
            id: "row-youth",
            order: 1,
            label: "Youth row",
            classes: ["65/85", "50cc"],
          },
        ],
      },
    ],
    classes: [...RIDER_CLASSES],
    riders,
    registrations: entered.map((entry) => ({
      riderNumber: entry.number,
      name: entry.name,
      class: entry.class,
      seriesId: entry.seriesId,
      // Dana is assigned to A's last row. The others are placed by number.
      startRow: entry.number === 55 ? 4 : null,
    })),
  });
}
