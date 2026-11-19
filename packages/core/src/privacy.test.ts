import { describe, expect, it } from "vitest";

import { scoreRace } from "./scoring/engine.js";
import { makeScoreInput, uuid } from "./test-support.js";
import { projectPhoneRoster } from "./roster/project.js";
import {
  exportPublicRacePackage,
  textContainsPrivateValue,
  type RiderContact,
} from "./privacy.js";
import { importRacePackage, registerRider } from "./registration/service.js";
import { createSampleRacePackage } from "./fixtures/sample-race-package.js";

const SECRET: RiderContact = {
  dateOfBirth: "1994-03-14",
  phone: "(555) 013-0109",
  email: "cole.hendricks@example.com",
  emergencyContactName: "Dana Hendricks",
  emergencyContactPhone: "(555) 013-0210",
  emergencyContactRelation: "Spouse",
  safetyAcknowledged: true,
  safetyAcknowledgedAt: "2026-11-18T19:12:00.000Z",
};

describe("private rider fields stay out of public projections", () => {
  it("omits them from results, the phone roster, and the public export", () => {
    const input = makeScoreInput({
      riders: [{ number: 109, name: "Cole Hendricks", class: "C" }],
    });
    const registration = input.race.registrations[0];
    const series = input.race.riders[0];
    if (!registration || !series) throw new Error("missing rider");
    Object.assign(registration, SECRET);
    Object.assign(series, SECRET);

    const results = JSON.stringify(scoreRace(input).payload);
    const phones = JSON.stringify(projectPhoneRoster(input.race));
    const exported = JSON.stringify(exportPublicRacePackage(input.race));
    expect(textContainsPrivateValue(results, [SECRET])).toBe(false);
    expect(textContainsPrivateValue(phones, [SECRET])).toBe(false);
    expect(textContainsPrivateValue(exported, [SECRET])).toBe(false);
    expect(exported).not.toContain("emergencyContact");
    expect(phones).not.toContain("phone");
  });

  it("records who added a rider without copying contact fields into the changelog", () => {
    const state = importRacePackage({
      racePackage: createSampleRacePackage(),
      downloadedAt: "2026-09-11T18:00:00.000Z",
    });
    const next = registerRider(state, {
      seriesId: "dayof-cole",
      firstName: "Cole",
      lastName: "Hendricks",
      number: 109,
      class: "C",
      payment: "unpaid",
      addToSeries: true,
      placements: [{ raceId: "gnaw-bone-championship", row: 5 }],
      contact: SECRET,
      audit: {
        who: "Dana Director",
        when: "2026-09-12T08:00:00.000Z",
        why: "Added at registration",
        entryId: uuid(9),
      },
    });
    const logged = JSON.stringify(next.changelog);
    expect(logged).toContain("Dana Director");
    expect(logged).toContain("Cole Hendricks");
    expect(textContainsPrivateValue(logged, [SECRET])).toBe(false);
    expect(
      next.race.registrations.find((entry) => entry.riderNumber === 109)?.phone,
    ).toBe(SECRET.phone);
    expect(next.dayOfRegistrations.map((entry) => entry.number)).toEqual([109]);
  });
});
