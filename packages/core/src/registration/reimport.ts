import { createChangelogEntry } from "../schemas/changelog.js";
import { contactFrom, privateValues, type RiderContact } from "../privacy.js";
import {
  primaryRace,
  racePackageSchema,
  sameRaceLength,
  type EventRegistration,
  type Race,
  type RaceLength,
  type RacePackage,
  type SeriesRider,
} from "../schemas/race-package.js";
import type { PhoneRosterRider } from "../schemas/rider.js";
import { rosterDeltaMessageSchema } from "../schemas/sync.js";
import { SCHEMA_VERSION } from "../version.js";
import { RegistrationError } from "./errors.js";
import { raceDayStateSchema, type RaceDayState } from "./service.js";

export interface ReimportRiderLine {
  riderNumber: number;
  name: string;
  detail: string;
  /** Set when a rider field change came from the site and will be applied. */
  apply: boolean;
  siteUpdatedAt: string | null;
}

export interface ReimportRaceLine {
  raceId: string;
  name: string;
  detail: string;
  apply: boolean;
}

export interface ReimportPreview {
  newRiders: ReimportRiderLine[];
  riderUpdates: ReimportRiderLine[];
  raceChanges: ReimportRaceLine[];
  raceDayKept: { riderNumber: number; name: string }[];
  /**
   * Site emergency contacts copied because the laptop copy could not be
   * unlocked. Names and numbers only. The contact values stay out of the preview.
   */
  contactsRestored: { riderNumber: number; name: string }[];
  /** Re-import does not remove riders. This stays 0. */
  removedCount: number;
  unchangedCount: number;
  applyCount: number;
}

interface AuditBatch {
  who: string;
  when: string;
  why: string;
  entryIds: string[];
}

/**
 * Newest site `updatedAt` wins against the laptop's last edit of that record.
 * Race-day registrations are never removed or overwritten. Contact values are
 * not included in the preview text.
 */
export function previewReimport(
  state: RaceDayState,
  incomingRaw: RacePackage,
  options?: { restoreUnreadableContacts?: boolean },
): ReimportPreview {
  const incoming = racePackageSchema.parse(incomingRaw);
  const dayOf = new Set(state.dayOfRegistrations.map((entry) => entry.number));
  const raceDayKept = state.dayOfRegistrations.map((entry) => ({
    riderNumber: entry.number,
    name: entry.name,
  }));
  const newRiders: ReimportRiderLine[] = [];
  const riderUpdates: ReimportRiderLine[] = [];
  let unchangedCount = 0;

  for (const registration of incoming.registrations) {
    const local = state.race.registrations.find(
      (entry) =>
        entry.riderNumber === registration.riderNumber ||
        (registration.seriesId !== null && entry.seriesId === registration.seriesId),
    );
    if (!local) {
      if (dayOf.has(registration.riderNumber)) continue;
      newRiders.push({
        riderNumber: registration.riderNumber,
        name: registration.name,
        detail: `#${registration.riderNumber} ${registration.name} (${registration.class})`,
        apply: true,
        siteUpdatedAt: registration.updatedAt ?? null,
      });
      continue;
    }
    if (dayOf.has(local.riderNumber) || dayOf.has(registration.riderNumber)) continue;
    if (
      local.seriesId !== registration.seriesId &&
      local.seriesId !== null &&
      registration.seriesId !== null
    ) {
      riderUpdates.push({
        riderNumber: local.riderNumber,
        name: local.name,
        detail: `#${local.riderNumber} ${local.name} stays on this laptop. The site has a different rider on that number.`,
        apply: false,
        siteUpdatedAt: registration.updatedAt ?? null,
      });
      continue;
    }
    const detail = registrationDiff(local, registration);
    if (!detail) {
      unchangedCount += 1;
      continue;
    }
    const apply = siteIsNewer(
      registration.updatedAt,
      state.localEdits[`registration:${local.riderNumber}`],
    );
    riderUpdates.push({
      riderNumber: local.riderNumber,
      name: local.name,
      detail: apply
        ? detail
        : `${detail}. The laptop edit is newer, so the site change is not applied.`,
      apply,
      siteUpdatedAt: registration.updatedAt ?? null,
    });
  }

  const raceChanges: ReimportRaceLine[] = [];
  for (const race of incoming.races) {
    const local = state.race.races.find((entry) => entry.id === race.id);
    if (!local) {
      raceChanges.push({
        raceId: race.id,
        name: race.name,
        detail: `${race.name} is new on the site`,
        apply: true,
      });
      continue;
    }
    const detail = raceDiff(local, race);
    if (!detail) continue;
    const apply = siteIsNewer(race.updatedAt, state.localEdits[`race:${race.id}`]);
    raceChanges.push({
      raceId: race.id,
      name: race.name,
      detail: apply
        ? detail
        : `${detail}. The laptop edit is newer, so the site change is not applied.`,
      apply,
    });
  }

  const applyCount =
    newRiders.length +
    riderUpdates.filter((line) => line.apply).length +
    raceChanges.filter((line) => line.apply).length;

  return {
    newRiders,
    riderUpdates,
    raceChanges,
    raceDayKept,
    contactsRestored: options?.restoreUnreadableContacts
      ? contactsToRestore(state, incoming)
      : [],
    removedCount: 0,
    unchangedCount,
    applyCount,
  };
}

export function applyReimport(
  state: RaceDayState,
  incomingRaw: RacePackage,
  audit: AuditBatch,
  options?: { restoreUnreadableContacts?: boolean },
): RaceDayState {
  const incoming = racePackageSchema.parse(structuredClone(incomingRaw));
  const preview = previewReimport(state, incoming, options);
  const who = audit.who.trim();
  const why = audit.why.trim();
  if (!who) {
    throw new RegistrationError("missing_field", "Who is making this change is required");
  }
  if (!why) {
    throw new RegistrationError("missing_field", "A reason is required");
  }
  if (preview.applyCount === 0) {
    return finishReimport(
      raceDayStateSchema.parse({
        ...state,
        snapshot: incoming,
        sourceUpdatedAt: incoming.event.updatedAt ?? state.sourceUpdatedAt ?? null,
      }),
      incoming,
      options?.restoreUnreadableContacts === true,
    );
  }
  if (audit.entryIds.length < preview.applyCount) {
    throw new RegistrationError("missing_field", "A changelog id is required");
  }

  let registrations = state.race.registrations.map((entry) => ({ ...entry }));
  let riders = state.race.riders.map((entry) => ({ ...entry }));
  let races = state.race.races.map((entry) => ({
    ...entry,
    checks: entry.checks.map((check) => ({ ...check })),
    startRows: entry.startRows.map((row) => ({ ...row, classes: [...row.classes] })),
  }));
  const changelog = [...state.changelog];
  const upserts: PhoneRosterRider[] = [];
  let idCursor = 0;
  const nextId = () => {
    const id = audit.entryIds[idCursor];
    idCursor += 1;
    if (!id) throw new RegistrationError("missing_field", "A changelog id is required");
    return id;
  };

  for (const line of preview.raceChanges) {
    if (!line.apply) continue;
    const siteRace = incoming.races.find((race) => race.id === line.raceId);
    if (!siteRace) continue;
    const index = races.findIndex((race) => race.id === line.raceId);
    const previous = index < 0 ? undefined : races[index];
    if (!previous) races.push(cloneRace(siteRace));
    else races[index] = cloneRace(siteRaceFields(siteRace));
    changelog.push(
      createChangelogEntry({
        id: nextId(),
        who,
        when: audit.when,
        why,
        entity: { type: "race", id: line.raceId },
        action: previous ? "change" : "add",
        before: previous ? { name: previous.name } : null,
        after: { detail: line.detail },
      }),
    );
  }

  races = renumberRaceOrders(races);
  registrations = registrations.map((registration) =>
    clearInvalidRows(registration, races),
  );

  for (const line of preview.newRiders) {
    const site = incoming.registrations.find(
      (entry) => entry.riderNumber === line.riderNumber,
    );
    if (!site) continue;
    const series = siteSeriesRider(incoming, site);
    if (series && !riders.some((rider) => rider.seriesId === series.seriesId)) {
      if (!riders.some((rider) => rider.number === series.number))
        riders.push({ ...series });
    }
    registrations.push(clearInvalidRows({ ...site }, races));
    upserts.push({ name: site.name, number: site.riderNumber, class: site.class });
    changelog.push(
      createChangelogEntry({
        id: nextId(),
        who,
        when: audit.when,
        why,
        entity: {
          type: "registration",
          id: site.seriesId ?? `number:${site.riderNumber}`,
        },
        action: "add",
        before: null,
        after: publicRider(site),
      }),
    );
  }

  for (const line of preview.riderUpdates) {
    if (!line.apply) continue;
    const site = incoming.registrations.find(
      (entry) => entry.riderNumber === line.riderNumber,
    );
    const index = registrations.findIndex(
      (entry) => entry.riderNumber === line.riderNumber,
    );
    if (!site || index < 0) continue;
    const local = registrations[index];
    if (!local) continue;
    const next = clearInvalidRows(
      {
        ...local,
        name: site.name,
        class: site.class,
        seriesId: site.seriesId ?? local.seriesId,
        registeredAt: site.registeredAt ?? local.registeredAt,
        assignedRows: site.assignedRows.map((assignment) => ({ ...assignment })),
        ...(site.enteredRaceIds ? { enteredRaceIds: [...site.enteredRaceIds] } : {}),
        ...(site.payment ? { payment: site.payment } : {}),
        ...(site.updatedAt ? { updatedAt: site.updatedAt } : {}),
        ...contactFrom(site),
      },
      races,
    );
    registrations[index] = next;
    if (next.seriesId) {
      const series = incoming.riders.find((rider) => rider.seriesId === next.seriesId);
      riders = riders.map((rider) =>
        rider.seriesId === next.seriesId
          ? {
              ...rider,
              name: series?.name ?? next.name,
              class: series?.class ?? rider.class,
              ...(series?.updatedAt ? { updatedAt: series.updatedAt } : {}),
              ...contactFrom(series ?? site),
            }
          : rider,
      );
    }
    if (local.name !== next.name || local.class !== next.class) {
      upserts.push({ name: next.name, number: next.riderNumber, class: next.class });
    }
    changelog.push(
      createChangelogEntry({
        id: nextId(),
        who,
        when: audit.when,
        why,
        entity: {
          type: "registration",
          id: next.seriesId ?? `number:${next.riderNumber}`,
        },
        action: "change",
        before: publicRider(local),
        after: { ...publicRider(next), detail: line.detail },
      }),
    );
  }

  const merged = syncEvent({ ...state.race, riders, registrations, races });
  const race = racePackageSchema.parse(merged);
  let rosterVersion = state.rosterVersion;
  let rosterDeltas = state.rosterDeltas;
  if (upserts.length > 0) {
    rosterVersion += 1;
    rosterDeltas = [
      ...rosterDeltas,
      rosterDeltaMessageSchema.parse({
        schemaVersion: SCHEMA_VERSION,
        type: "roster_delta",
        eventId: race.event.id,
        version: rosterVersion,
        baseVersion: state.rosterVersion,
        upserts,
        removals: [],
      }),
    ];
  }

  return finishReimport(
    raceDayStateSchema.parse({
      ...state,
      downloadedAt: audit.when,
      rosterVersion,
      snapshot: incoming,
      race,
      changelog,
      rosterDeltas,
      sourceUpdatedAt: incoming.event.updatedAt ?? state.sourceUpdatedAt ?? null,
    }),
    incoming,
    options?.restoreUnreadableContacts === true,
  );
}

function finishReimport(
  state: RaceDayState,
  incoming: RacePackage,
  restoreUnreadableContacts: boolean,
): RaceDayState {
  if (!restoreUnreadableContacts) return state;
  return restoreUnreadableContactsFromSite(state, incoming);
}

/**
 * Copy site contact fields onto riders whose laptop copy could not be
 * unlocked. Race-day riders added on the laptop are left alone: the site
 * does not have the emergency info that was typed here.
 */
function restoreUnreadableContactsFromSite(
  state: RaceDayState,
  incoming: RacePackage,
): RaceDayState {
  const dayOfNumbers = new Set(state.dayOfRegistrations.map((entry) => entry.number));
  const dayOfSeries = new Set(state.dayOfRegistrations.map((entry) => entry.seriesId));
  const registrations = state.race.registrations.map((registration) => {
    const site = siteContactSource(registration, incoming, dayOfNumbers, dayOfSeries);
    if (!site || privateValues(site).length === 0) return registration;
    return { ...registration, ...contactFrom(site) };
  });
  const riders = state.race.riders.map((rider) => {
    if (dayOfSeries.has(rider.seriesId)) return rider;
    const site = incoming.riders.find((entry) => entry.seriesId === rider.seriesId);
    if (!site || privateValues(site).length === 0) return rider;
    return { ...rider, ...contactFrom(site) };
  });
  return raceDayStateSchema.parse({
    ...state,
    race: { ...state.race, registrations, riders },
  });
}

function contactsToRestore(
  state: RaceDayState,
  incoming: RacePackage,
): { riderNumber: number; name: string }[] {
  const dayOfNumbers = new Set(state.dayOfRegistrations.map((entry) => entry.number));
  const dayOfSeries = new Set(state.dayOfRegistrations.map((entry) => entry.seriesId));
  const lines: { riderNumber: number; name: string }[] = [];
  for (const registration of state.race.registrations) {
    const site = siteContactSource(registration, incoming, dayOfNumbers, dayOfSeries);
    if (!site || privateValues(site).length === 0) continue;
    lines.push({ riderNumber: registration.riderNumber, name: registration.name });
  }
  return lines;
}

function siteContactSource(
  registration: EventRegistration,
  incoming: RacePackage,
  dayOfNumbers: ReadonlySet<number>,
  dayOfSeries: ReadonlySet<string>,
): EventRegistration | null {
  if (
    dayOfNumbers.has(registration.riderNumber) ||
    (registration.seriesId !== null && dayOfSeries.has(registration.seriesId))
  ) {
    return null;
  }
  const site = incoming.registrations.find(
    (entry) =>
      entry.riderNumber === registration.riderNumber ||
      (registration.seriesId !== null && entry.seriesId === registration.seriesId),
  );
  if (!site) return null;
  if (
    registration.seriesId !== site.seriesId &&
    registration.seriesId !== null &&
    site.seriesId !== null
  ) {
    return null;
  }
  return site;
}

function siteIsNewer(
  siteUpdatedAt: string | null | undefined,
  localEditedAt: string | undefined,
): boolean {
  if (!localEditedAt) return true;
  if (!siteUpdatedAt) return false;
  const site = Date.parse(siteUpdatedAt);
  const local = Date.parse(localEditedAt);
  if (!Number.isFinite(site) || !Number.isFinite(local)) return false;
  return site > local;
}

function registrationDiff(local: EventRegistration, site: EventRegistration): string {
  const parts: string[] = [];
  if (local.name !== site.name) parts.push(`name ${local.name} → ${site.name}`);
  if (local.class !== site.class) parts.push(`class ${local.class} → ${site.class}`);
  if (local.payment !== site.payment && site.payment) {
    parts.push(`payment ${local.payment ?? "unset"} → ${site.payment}`);
  }
  if (!sameRows(local.assignedRows, site.assignedRows)) parts.push("start row changed");
  if (contactChanged(local, site)) parts.push("emergency info updated");
  if (parts.length === 0) return "";
  return `#${local.riderNumber} ${local.name}: ${parts.join(", ")}`;
}

function raceDiff(local: Race, site: Race): string {
  const parts: string[] = [];
  if (local.name !== site.name) parts.push(`name ${local.name} → ${site.name}`);
  if (!sameRaceLength(local.length, site.length)) {
    parts.push(`length: ${lengthText(local.length)} → ${lengthText(site.length)}`);
  }
  if (local.rowGapSeconds !== site.rowGapSeconds) {
    parts.push(`row gap ${local.rowGapSeconds} → ${site.rowGapSeconds} s`);
  }
  if (local.plannedStart !== site.plannedStart) parts.push("row 1 start changed");
  if (JSON.stringify(local.checks) !== JSON.stringify(site.checks))
    parts.push("checks changed");
  if (rowShape(local) !== rowShape(site)) parts.push("rows changed");
  if (parts.length === 0) return "";
  return `${local.name} ${parts.join(", ")}`;
}

function contactChanged(local: RiderContact, site: RiderContact): boolean {
  return JSON.stringify(contactFrom(local)) !== JSON.stringify(contactFrom(site));
}

function sameRows(
  left: readonly { raceId: string; row: number }[],
  right: readonly { raceId: string; row: number }[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every(
    (assignment, index) =>
      assignment.raceId === right[index]?.raceId && assignment.row === right[index]?.row,
  );
}

function lengthText(length: RaceLength): string {
  if (length.mode === "time") return `${length.minutes} min`;
  if (length.laps === null) return "until the finish";
  return `${length.laps} laps`;
}

function rowShape(race: Race): string {
  return JSON.stringify(
    race.startRows.map((row) => ({
      order: row.order,
      label: row.label,
      classes: row.classes,
    })),
  );
}

function siteRaceFields(race: Race): Race {
  return {
    id: race.id,
    name: race.name,
    order: race.order,
    length: race.length,
    checks: race.checks.map((check) => ({ ...check })),
    startRows: race.startRows.map((row) => ({ ...row, classes: [...row.classes] })),
    rowGapSeconds: race.rowGapSeconds,
    plannedStart: race.plannedStart,
    ...(race.updatedAt ? { updatedAt: race.updatedAt } : {}),
  };
}

function cloneRace(race: Race): Race {
  return siteRaceFields(race);
}

function renumberRaceOrders(races: Race[]): Race[] {
  return [...races]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((race, index) => ({ ...race, order: index + 1 }));
}

function clearInvalidRows(
  registration: EventRegistration,
  races: readonly Race[],
): EventRegistration {
  const assignedRows = registration.assignedRows.filter((assignment) => {
    const race = races.find((entry) => entry.id === assignment.raceId);
    if (!race) return false;
    const row = race.startRows.find((entry) => entry.order === assignment.row);
    return Boolean(row && row.classes.includes(registration.class));
  });
  return { ...registration, assignedRows };
}

function siteSeriesRider(
  incoming: RacePackage,
  registration: EventRegistration,
): SeriesRider | null {
  if (!registration.seriesId) return null;
  return (
    incoming.riders.find((rider) => rider.seriesId === registration.seriesId) ?? null
  );
}

function publicRider(registration: EventRegistration) {
  return {
    number: registration.riderNumber,
    name: registration.name,
    class: registration.class,
    seriesId: registration.seriesId,
    rows: registration.assignedRows.map((assignment) => ({ ...assignment })),
  };
}

function syncEvent(race: RacePackage): RacePackage {
  const primary = primaryRace(race.races);
  return {
    ...race,
    event: {
      ...race.event,
      length: primary.length,
      checks: primary.checks.map((check) => ({ ...check })),
    },
  };
}

/** Guard used by tests: preview and changelog text must not carry contact values. */
export function reimportText(preview: ReimportPreview): string {
  return JSON.stringify(preview);
}

export function contactSecrets(race: RacePackage): string[] {
  const secrets: string[] = [];
  for (const rider of race.riders) secrets.push(...privateValues(rider));
  for (const registration of race.registrations)
    secrets.push(...privateValues(registration));
  return [...new Set(secrets)];
}
