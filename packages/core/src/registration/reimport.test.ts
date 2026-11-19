import { describe, expect, it } from "vitest";

import { createSampleRacePackage } from "../fixtures/sample-race-package.js";
import { textContainsPrivateValue } from "../privacy.js";
import type { RacePackage } from "../schemas/race-package.js";
import { uuid } from "../test-support.js";
import { contactSecrets, applyReimport, previewReimport } from "./reimport.js";
import { importRacePackage, registerNewRider, setRaceLength } from "./service.js";

const DOWNLOADED = "2026-09-11T18:00:00.000Z";
const LOCAL_EDIT = "2026-09-12T08:00:00.000Z";
const SITE_NEWER = "2026-09-13T12:00:00.000Z";
const SITE_OLDER = "2026-09-10T12:00:00.000Z";
const PHONE = "(555) 013-0210";
const EMAIL = "cole.hendricks@example.com";

function hub() {
  return importRacePackage({
    racePackage: createSampleRacePackage(),
    downloadedAt: DOWNLOADED,
  });
}

function withSiteChange(
  change: (race: RacePackage) => void,
  updatedAt = SITE_NEWER,
): RacePackage {
  const race = structuredClone(createSampleRacePackage());
  change(race);
  race.event.updatedAt = updatedAt;
  return race;
}

describe("re-import merge", () => {
  it("applies a newer site class and race length, and logs the change without contact data", () => {
    const incoming = withSiteChange((race) => {
      const dana = race.registrations.find((entry) => entry.riderNumber === 55);
      if (!dana) throw new Error("missing Dana");
      dana.class = "B";
      dana.updatedAt = SITE_NEWER;
      dana.phone = PHONE;
      dana.email = EMAIL;
      dana.emergencyContactName = "Dana Hendricks";
      dana.emergencyContactPhone = PHONE;
      const championship = race.races[0];
      if (!championship || championship.length.mode !== "time") throw new Error("race");
      championship.length = { mode: "time", minutes: 150 };
      championship.updatedAt = SITE_NEWER;
      race.event.length = championship.length;
    });
    const state = hub();
    const preview = previewReimport(state, incoming);
    expect(
      preview.riderUpdates.some(
        (line) => line.apply && line.detail.includes("class A → B"),
      ),
    ).toBe(true);
    expect(
      preview.raceChanges.some(
        (line) => line.apply && line.detail.includes("180 min → 150 min"),
      ),
    ).toBe(true);
    expect(preview.removedCount).toBe(0);
    expect(
      textContainsPrivateValue(JSON.stringify(preview), [{ phone: PHONE, email: EMAIL }]),
    ).toBe(false);

    const next = applyReimport(state, incoming, {
      who: "Dana Director",
      when: "2026-09-13T13:00:00.000Z",
      why: "Re-import from the site",
      entryIds: [uuid(1), uuid(2)],
    });
    expect(next.race.registrations.find((entry) => entry.riderNumber === 55)?.class).toBe(
      "B",
    );
    expect(next.race.races[0]?.length).toEqual({ mode: "time", minutes: 150 });
    expect(next.rosterVersion).toBe(2);
    const logged = JSON.stringify(next.changelog);
    expect(logged).toContain("Re-import from the site");
    expect(logged).not.toContain(PHONE);
    expect(logged).not.toContain(EMAIL);
    expect(contactSecrets(next.race)).toContain(PHONE);
  });

  it("keeps a newer laptop edit and never overwrites or removes a race-day rider", () => {
    const edited = setRaceLength(hub(), {
      raceId: "gnaw-bone-championship",
      length: { mode: "time", minutes: 200 },
      audit: {
        who: "Dana Director",
        when: LOCAL_EDIT,
        why: "Course is longer this year",
        entryId: uuid(3),
      },
    });
    const withDayOf = registerNewRider(edited, {
      seriesId: "dayof-sam",
      name: "Sam Ellis",
      number: 501,
      class: "C",
      audit: {
        who: "Dana Director",
        when: LOCAL_EDIT,
        why: "Added at registration",
        entryId: uuid(4),
      },
    });
    const incoming = withSiteChange((race) => {
      const championship = race.races[0];
      if (!championship) throw new Error("race");
      championship.length = { mode: "time", minutes: 90 };
      championship.updatedAt = SITE_OLDER;
      race.event.length = championship.length;
      race.registrations = race.registrations.filter((entry) => entry.riderNumber !== 55);
      const erin = race.registrations.find((entry) => entry.riderNumber === 88);
      if (!erin) throw new Error("erin");
      erin.class = "A";
      erin.updatedAt = SITE_OLDER;
      race.registrations.push({
        riderNumber: 501,
        name: "Someone Else",
        class: "Pro",
        seriesId: null,
        registeredAt: SITE_OLDER,
        assignedRows: [],
        updatedAt: SITE_NEWER,
      });
    }, SITE_OLDER);
    incoming.event.updatedAt = SITE_OLDER;

    const preview = previewReimport(withDayOf, incoming);
    expect(preview.raceChanges.some((line) => line.apply)).toBe(false);
    expect(
      preview.raceChanges.some((line) => line.detail.includes("laptop edit is newer")),
    ).toBe(true);
    expect(preview.removedCount).toBe(0);
    expect(preview.raceDayKept.map((entry) => entry.riderNumber)).toEqual([501]);

    const next = applyReimport(withDayOf, incoming, {
      who: "Dana Director",
      when: "2026-09-13T13:00:00.000Z",
      why: "Re-import from the site",
      entryIds: [uuid(5)],
    });
    expect(next.race.races[0]?.length).toEqual({ mode: "time", minutes: 200 });
    const sam = next.race.registrations.find((entry) => entry.riderNumber === 501);
    expect(sam).toMatchObject({ name: "Sam Ellis", class: "C" });
    expect(next.race.registrations.some((entry) => entry.riderNumber === 55)).toBe(true);
    expect(next.dayOfRegistrations.map((entry) => entry.number)).toEqual([501]);
  });

  it("adds riders that are only on the site", () => {
    const incoming = withSiteChange((race) => {
      race.riders.push({
        seriesId: "s-new",
        name: "New Rider",
        number: 777,
        class: "C",
        updatedAt: SITE_NEWER,
      });
      race.registrations.push({
        riderNumber: 777,
        name: "New Rider",
        class: "C",
        seriesId: "s-new",
        registeredAt: SITE_NEWER,
        assignedRows: [],
        updatedAt: SITE_NEWER,
      });
    });
    const preview = previewReimport(hub(), incoming);
    expect(preview.newRiders.map((line) => line.riderNumber)).toEqual([777]);
    const next = applyReimport(hub(), incoming, {
      who: "Dana Director",
      when: "2026-09-13T13:00:00.000Z",
      why: "Re-import from the site",
      entryIds: [uuid(6)],
    });
    expect(next.race.registrations.some((entry) => entry.riderNumber === 777)).toBe(true);
    expect(next.race.riders.some((entry) => entry.seriesId === "s-new")).toBe(true);
  });

  it("restores unreadable site emergency contacts without touching a newer laptop edit or a rider added here", () => {
    const edited = setRaceLength(hub(), {
      raceId: "gnaw-bone-championship",
      length: { mode: "time", minutes: 200 },
      audit: {
        who: "Dana Director",
        when: LOCAL_EDIT,
        why: "Course is longer this year",
        entryId: uuid(7),
      },
    });
    const withDayOf = registerNewRider(edited, {
      seriesId: "dayof-sam",
      name: "Sam Ellis",
      number: 501,
      class: "C",
      audit: {
        who: "Dana Director",
        when: LOCAL_EDIT,
        why: "Added at registration",
        entryId: uuid(8),
      },
    });
    const locked = {
      ...withDayOf,
      localEdits: {
        ...withDayOf.localEdits,
        "registration:55": LOCAL_EDIT,
      },
    };
    const incoming = withSiteChange((race) => {
      const dana = race.registrations.find((entry) => entry.riderNumber === 55);
      const series = race.riders.find((entry) => entry.seriesId === "s-dana");
      if (!dana || !series) throw new Error("missing Dana");
      dana.class = "B";
      dana.updatedAt = SITE_OLDER;
      dana.phone = PHONE;
      dana.emergencyContactName = "Pat Brooks";
      dana.emergencyContactPhone = PHONE;
      series.phone = PHONE;
      series.emergencyContactName = "Pat Brooks";
      series.emergencyContactPhone = PHONE;
      race.registrations.push({
        riderNumber: 501,
        name: "Someone Else",
        class: "Pro",
        seriesId: null,
        registeredAt: SITE_OLDER,
        assignedRows: [],
        phone: "(555) 010-0501",
        emergencyContactName: "Not Sam",
        emergencyContactPhone: "(555) 010-0501",
        updatedAt: SITE_NEWER,
      });
    }, SITE_OLDER);

    const preview = previewReimport(locked, incoming, {
      restoreUnreadableContacts: true,
    });
    expect(preview.contactsRestored).toEqual([{ riderNumber: 55, name: "Dana Brooks" }]);
    expect(preview.riderUpdates.find((line) => line.riderNumber === 55)?.apply).toBe(
      false,
    );
    expect(textContainsPrivateValue(JSON.stringify(preview), [{ phone: PHONE }])).toBe(
      false,
    );

    const next = applyReimport(
      locked,
      incoming,
      {
        who: "Dana Director",
        when: "2026-09-13T13:00:00.000Z",
        why: "Re-import from the site",
        entryIds: [uuid(9)],
      },
      { restoreUnreadableContacts: true },
    );
    const dana = next.race.registrations.find((entry) => entry.riderNumber === 55);
    expect(dana).toMatchObject({
      class: "A",
      phone: PHONE,
      emergencyContactName: "Pat Brooks",
      emergencyContactPhone: PHONE,
    });
    expect(next.race.riders.find((entry) => entry.seriesId === "s-dana")).toMatchObject({
      phone: PHONE,
      emergencyContactPhone: PHONE,
    });
    expect(next.race.races[0]?.length).toEqual({ mode: "time", minutes: 200 });
    const sam = next.race.registrations.find((entry) => entry.riderNumber === 501);
    expect(sam).toMatchObject({ name: "Sam Ellis", class: "C" });
    expect(sam?.phone ?? null).toBeNull();
    expect(sam?.emergencyContactPhone ?? null).toBeNull();
    expect(JSON.stringify(next.changelog)).not.toContain(PHONE);
    expect(contactSecrets(next.race)).toContain(PHONE);
  });
});
