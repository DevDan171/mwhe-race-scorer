import { describe, expect, it } from "vitest";

import { createSampleRacePackage } from "../fixtures/sample-race-package.js";
import { uuid } from "../test-support.js";
import { RegistrationError } from "./errors.js";
import {
  addStartRow,
  assignRiderToRow,
  importRacePackage,
  racesOfferingClass,
  registerRider,
  removeStartRow,
  rowPlannedStart,
  setRiderPlacements,
  unassignedInRace,
  type ChangeAudit,
} from "./service.js";

const WHEN = "2026-09-12T08:00:00.000Z";

function audit(n: number, why = "Race setup"): ChangeAudit {
  return { who: "Dana Director", when: WHEN, why, entryId: uuid(n) };
}

function hub() {
  return importRacePackage({
    racePackage: createSampleRacePackage(),
    downloadedAt: "2026-09-11T18:00:00.000Z",
  });
}

describe("row and class placement", () => {
  it("rejects a row that does not hold the rider's class", () => {
    expect(() =>
      assignRiderToRow(hub(), {
        riderNumber: 88,
        raceId: "gnaw-bone-championship",
        row: 2,
        audit: audit(1),
      }),
    ).toThrow(RegistrationError);
    try {
      assignRiderToRow(hub(), {
        riderNumber: 88,
        raceId: "gnaw-bone-championship",
        row: 2,
        audit: audit(1),
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "row_class" });
    }
  });

  it("rejects a race that does not run the class", () => {
    expect(() =>
      setRiderPlacements(hub(), {
        riderNumber: 55,
        placements: [{ raceId: "gnaw-bone-youth", row: 1 }],
        audit: audit(2),
      }),
    ).toThrow(expect.objectContaining({ code: "race_class" }));
  });

  it("places a rider only on a row of their class and lists the others as unassigned", () => {
    const placed = assignRiderToRow(hub(), {
      riderNumber: 88,
      raceId: "gnaw-bone-championship",
      row: 5,
      audit: audit(3),
    });
    const erin = placed.race.registrations.find((entry) => entry.riderNumber === 88);
    expect(erin?.assignedRows).toEqual([{ raceId: "gnaw-bone-championship", row: 5 }]);
    const race = placed.race.races[0];
    if (!race) throw new Error("missing race");
    const unassigned = unassignedInRace(
      race,
      placed.race.registrations,
      placed.race.races,
    );
    expect(unassigned.map((entry) => entry.riderNumber)).not.toContain(88);
    expect(unassigned.map((entry) => entry.riderNumber)).toContain(90);
    expect(racesOfferingClass(placed.race.races, "B").map((entry) => entry.id)).toEqual([
      "gnaw-bone-championship",
    ]);
  });

  it("adds a row at the next race-wide number and removes one without dropping riders", () => {
    const added = addStartRow(hub(), {
      raceId: "gnaw-bone-championship",
      riderClass: "B",
      rowId: "row-b-extra",
      audit: audit(4),
    });
    const race = added.race.races.find((entry) => entry.id === "gnaw-bone-championship");
    expect(race?.startRows.at(-1)).toMatchObject({
      id: "row-b-extra",
      order: 6,
      classes: ["B"],
    });
    expect(rowPlannedStart(race!, 6)).toBe("2026-09-12T14:05:00.000Z");

    const seated = assignRiderToRow(added, {
      riderNumber: 90,
      raceId: "gnaw-bone-championship",
      row: 6,
      audit: audit(5),
    });
    const removed = removeStartRow(seated, {
      raceId: "gnaw-bone-championship",
      startRowId: "row-b-extra",
      audit: audit(6),
    });
    const after = removed.race.races.find(
      (entry) => entry.id === "gnaw-bone-championship",
    );
    expect(after?.startRows.map((row) => row.order)).toEqual([1, 2, 3, 4, 5]);
    const fran = removed.race.registrations.find((entry) => entry.riderNumber === 90);
    expect(
      fran?.assignedRows.filter((row) => row.raceId === "gnaw-bone-championship"),
    ).toEqual([]);
    expect(removed.race.registrations).toHaveLength(seated.race.registrations.length);
    expect(removed.changelog.at(-1)?.after).toMatchObject({ unassigned: [90] });
  });

  it("requires the safety acknowledgement before a new rider is saved", () => {
    expect(() =>
      registerRider(hub(), {
        seriesId: "dayof-cole",
        firstName: "Cole",
        lastName: "Hendricks",
        number: 109,
        class: "C",
        payment: "unpaid",
        addToSeries: true,
        placements: [{ raceId: "gnaw-bone-championship", row: 5 }],
        contact: { phone: "(555) 013-0109" },
        audit: audit(7, "Added at registration"),
      }),
    ).toThrow(expect.objectContaining({ code: "safety_required" }));
  });
});
