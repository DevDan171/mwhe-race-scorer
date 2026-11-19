import { RIDER_CLASSES, type RiderClass } from "../classes.js";
import {
  changelogEntrySchema,
  createChangelogEntry,
  type ChangelogEntry,
} from "../schemas/changelog.js";
import { dayOfRegistrationSchema, type DayOfRegistration } from "../schemas/day-of.js";
import { isoTimestampSchema, schemaVersionSchema } from "../schemas/common.js";
import {
  racePackageSchema,
  sameRaceLength,
  type Check,
  type Race,
  type RaceLength,
  type RacePackage,
  type SeriesRider,
  type StartRow,
} from "../schemas/race-package.js";
import type { PhoneRosterRider } from "../schemas/rider.js";
import { rosterDeltaMessageSchema, type RosterDeltaMessage } from "../schemas/sync.js";
import { SCHEMA_VERSION } from "../version.js";
import { RegistrationError } from "./errors.js";
import { z } from "zod";

export const raceDayStateSchema = z
  .strictObject({
    schemaVersion: schemaVersionSchema,
    downloadedAt: isoTimestampSchema,
    rosterVersion: z.number().int().positive(),
    /** Package returned by the site, unchanged after download. */
    snapshot: racePackageSchema,
    /** Working package. Registration and race setup edit this copy. */
    race: racePackageSchema,
    dayOfRegistrations: z.array(dayOfRegistrationSchema),
    changelog: z.array(changelogEntrySchema),
    rosterDeltas: z.array(rosterDeltaMessageSchema),
  })
  .superRefine((state, ctx) => {
    const entryIds = new Set<string>();
    state.changelog.forEach((entry, index) => {
      if (entryIds.has(entry.id)) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate changelog entry id",
          path: ["changelog", index],
          input: state,
        });
      }
      entryIds.add(entry.id);
    });
    if (state.snapshot.event.id !== state.race.event.id) {
      ctx.addIssue({
        code: "custom",
        message: "Working race must stay on the downloaded event",
        path: ["race", "event", "id"],
        input: state,
      });
    }
    if (state.rosterDeltas.length !== state.rosterVersion) {
      ctx.addIssue({
        code: "custom",
        message: "rosterVersion must match the number of roster deltas",
        path: ["rosterVersion"],
        input: state,
      });
    }
    state.rosterDeltas.forEach((delta, index) => {
      if (delta.version !== index + 1 || delta.baseVersion !== index) {
        ctx.addIssue({
          code: "custom",
          message: "Roster deltas must be a contiguous sequence from version 1",
          path: ["rosterDeltas", index],
          input: state,
        });
      }
      if (delta.eventId !== state.race.event.id) {
        ctx.addIssue({
          code: "custom",
          message: "Roster delta event does not match the race",
          path: ["rosterDeltas", index, "eventId"],
          input: state,
        });
      }
    });
    state.dayOfRegistrations.forEach((dayOf, index) => {
      const seriesRider = state.race.riders.find(
        (rider) => rider.seriesId === dayOf.seriesId,
      );
      const registration = state.race.registrations.find(
        (entry) => entry.riderNumber === dayOf.number,
      );
      if (
        !seriesRider ||
        seriesRider.number !== dayOf.number ||
        seriesRider.name !== dayOf.name
      ) {
        ctx.addIssue({
          code: "custom",
          message: "A day-of registration must also be on the series list",
          path: ["dayOfRegistrations", index],
          input: state,
        });
      }
      if (
        !registration ||
        registration.seriesId !== dayOf.seriesId ||
        registration.name !== dayOf.name ||
        registration.class !== dayOf.class
      ) {
        ctx.addIssue({
          code: "custom",
          message: "A day-of registration must also be on the event roster",
          path: ["dayOfRegistrations", index],
          input: state,
        });
      }
    });
  });

export type RaceDayState = z.infer<typeof raceDayStateSchema>;

export interface ChangeAudit {
  who: string;
  when: string;
  why: string;
  entryId: string;
}

export interface RacePackageCounts {
  seriesRiders: number;
  eventRegistrations: number;
  races: number;
  checks: number;
}

export function packageCounts(race: RacePackage): RacePackageCounts {
  return {
    seriesRiders: race.riders.length,
    eventRegistrations: race.registrations.length,
    races: race.races.length,
    checks: race.races.reduce((sum, entry) => sum + entry.checks.length, 0),
  };
}

export function searchSeriesRiders(
  riders: readonly SeriesRider[],
  query: string,
): SeriesRider[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return riders
    .filter((rider) => {
      const number = String(rider.number);
      return rider.name.toLowerCase().includes(needle) || number.includes(needle);
    })
    .sort((a, b) => rankMatch(a, needle) - rankMatch(b, needle) || a.number - b.number);
}

export function isRiderNumberTaken(
  race: RacePackage,
  riderNumber: number,
  except?: number,
): boolean {
  if (except !== undefined && riderNumber === except) return false;
  return (
    race.riders.some((rider) => rider.number === riderNumber) ||
    race.registrations.some((registration) => registration.riderNumber === riderNumber)
  );
}

export function importRacePackage(input: {
  racePackage: RacePackage;
  downloadedAt: string;
}): RaceDayState {
  const snapshot = racePackageSchema.parse(structuredClone(input.racePackage));
  const race = structuredClone(snapshot);
  const delta = rosterDeltaMessageSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    type: "roster_delta",
    eventId: race.event.id,
    version: 1,
    baseVersion: 0,
    upserts: phoneRiders(race),
    removals: [],
  });
  return raceDayStateSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    downloadedAt: input.downloadedAt,
    rosterVersion: 1,
    snapshot,
    race,
    dayOfRegistrations: [],
    changelog: [],
    rosterDeltas: [delta],
  });
}

export function rosterChangesSince(
  state: RaceDayState,
  sinceVersion: number,
): RosterDeltaMessage[] {
  if (
    !Number.isInteger(sinceVersion) ||
    sinceVersion < 0 ||
    sinceVersion > state.rosterVersion
  ) {
    throw new RegistrationError(
      "roster_version",
      `Roster version ${sinceVersion} is outside 0..${state.rosterVersion}`,
    );
  }
  return state.rosterDeltas.filter((delta) => delta.version > sinceVersion);
}

export function addSeriesRiderToEvent(
  state: RaceDayState,
  input: { seriesId: string; audit: ChangeAudit },
): RaceDayState {
  const rider = state.race.riders.find((entry) => entry.seriesId === input.seriesId);
  if (!rider) {
    throw new RegistrationError(
      "rider_not_found",
      "That rider is not on the series list",
    );
  }
  if (
    state.race.registrations.some(
      (registration) =>
        registration.riderNumber === rider.number ||
        registration.seriesId === rider.seriesId,
    )
  ) {
    throw new RegistrationError(
      "already_registered",
      `${rider.name} is already on the event roster`,
    );
  }
  const registration = {
    riderNumber: rider.number,
    name: rider.name,
    class: rider.class,
    seriesId: rider.seriesId,
    registeredAt: input.audit.when,
    assignedRows: [],
  };
  return commitRoster(state, input.audit, {
    race: {
      ...state.race,
      registrations: [...state.race.registrations, registration],
    },
    action: "add",
    entityId: rider.seriesId,
    before: null,
    after: {
      number: rider.number,
      name: rider.name,
      class: rider.class,
      seriesId: rider.seriesId,
      dayOf: false,
    },
    upserts: [{ name: rider.name, number: rider.number, class: rider.class }],
    removals: [],
  });
}

export function registerNewRider(
  state: RaceDayState,
  input: {
    seriesId: string;
    name: string;
    number: number;
    class: RiderClass;
    audit: ChangeAudit;
  },
): RaceDayState {
  const name = input.name.trim();
  const seriesId = input.seriesId.trim();
  if (!name) {
    throw new RegistrationError("missing_field", "Name is required");
  }
  if (!seriesId) {
    throw new RegistrationError("missing_field", "A series id is required");
  }
  if (!RIDER_CLASSES.includes(input.class)) {
    throw new RegistrationError("missing_field", "Class is required");
  }
  assertValidNumber(input.number);
  if (isRiderNumberTaken(state.race, input.number)) {
    throw new RegistrationError(
      "number_taken",
      `Number ${input.number} is already used in the series`,
    );
  }
  if (state.race.riders.some((rider) => rider.seriesId === seriesId)) {
    throw new RegistrationError(
      "duplicate_series_id",
      "That series id is already in use",
    );
  }
  const seriesRider: SeriesRider = {
    seriesId,
    name,
    number: input.number,
    class: input.class,
  };
  const registration = {
    riderNumber: input.number,
    name,
    class: input.class,
    seriesId,
    registeredAt: input.audit.when,
    assignedRows: [],
  };
  const dayOf = dayOfRegistrationSchema.parse({
    seriesId,
    name,
    number: input.number,
    class: input.class,
    registeredAt: input.audit.when,
  });
  return commitRoster(state, input.audit, {
    race: {
      ...state.race,
      riders: [...state.race.riders, seriesRider],
      registrations: [...state.race.registrations, registration],
    },
    dayOfRegistrations: [...state.dayOfRegistrations, dayOf],
    action: "add",
    entityId: seriesId,
    before: null,
    after: { number: input.number, name, class: input.class, seriesId, dayOf: true },
    upserts: [{ name, number: input.number, class: input.class }],
    removals: [],
  });
}

export function changeRiderNumber(
  state: RaceDayState,
  input: { riderNumber: number; nextNumber: number; audit: ChangeAudit },
): RaceDayState {
  const registration = findRegistration(state, input.riderNumber);
  if (input.nextNumber === registration.riderNumber) {
    throw new RegistrationError("no_change", "That is already this rider's number");
  }
  assertValidNumber(input.nextNumber);
  if (isRiderNumberTaken(state.race, input.nextNumber, registration.riderNumber)) {
    throw new RegistrationError(
      "number_taken",
      `Number ${input.nextNumber} is already used in the series`,
    );
  }
  const before = registrationView(registration);
  const after = { ...before, number: input.nextNumber };
  return commitRoster(state, input.audit, {
    race: {
      ...state.race,
      riders: state.race.riders.map((rider) =>
        registration.seriesId !== null && rider.seriesId === registration.seriesId
          ? { ...rider, number: input.nextNumber }
          : rider,
      ),
      registrations: state.race.registrations.map((entry) =>
        entry.riderNumber === registration.riderNumber
          ? { ...entry, riderNumber: input.nextNumber }
          : entry,
      ),
    },
    dayOfRegistrations: state.dayOfRegistrations.map((dayOf) =>
      dayOf.seriesId === registration.seriesId
        ? { ...dayOf, number: input.nextNumber }
        : dayOf,
    ),
    action: "change",
    entityId: registration.seriesId ?? `number:${registration.riderNumber}`,
    before,
    after,
    upserts: [
      { name: registration.name, number: input.nextNumber, class: registration.class },
    ],
    removals: [registration.riderNumber],
  });
}

export function changeRiderClass(
  state: RaceDayState,
  input: { riderNumber: number; nextClass: RiderClass; audit: ChangeAudit },
): RaceDayState {
  const registration = findRegistration(state, input.riderNumber);
  if (!RIDER_CLASSES.includes(input.nextClass)) {
    throw new RegistrationError("missing_field", "Class is required");
  }
  if (registration.class === input.nextClass) {
    throw new RegistrationError("no_change", "That is already this rider's class");
  }
  const before = registrationView(registration);
  const after = { ...before, class: input.nextClass };
  return commitRoster(state, input.audit, {
    race: {
      ...state.race,
      registrations: state.race.registrations.map((entry) =>
        entry.riderNumber === registration.riderNumber
          ? { ...entry, class: input.nextClass }
          : entry,
      ),
    },
    dayOfRegistrations: state.dayOfRegistrations.map((dayOf) =>
      dayOf.seriesId === registration.seriesId
        ? { ...dayOf, class: input.nextClass }
        : dayOf,
    ),
    action: "change",
    entityId: registration.seriesId ?? `number:${registration.riderNumber}`,
    before,
    after,
    upserts: [
      {
        name: registration.name,
        number: registration.riderNumber,
        class: input.nextClass,
      },
    ],
    removals: [],
  });
}

export function setRaceLength(
  state: RaceDayState,
  input: { raceId: string; length: RaceLength; audit: ChangeAudit },
): RaceDayState {
  assertRaceLength(input.length);
  const current = findRace(state, input.raceId);
  if (sameRaceLength(current.length, input.length)) {
    throw new RegistrationError("no_change", "That is already the race length");
  }
  return commitRace(state, input.audit, input.raceId, {
    before: { length: current.length },
    after: { length: input.length },
    update: (race) => ({ ...race, length: input.length }),
  });
}

export function setRowGapSeconds(
  state: RaceDayState,
  input: { raceId: string; rowGapSeconds: number; audit: ChangeAudit },
): RaceDayState {
  if (!Number.isInteger(input.rowGapSeconds) || input.rowGapSeconds < 0) {
    throw new RegistrationError(
      "invalid_number",
      "Row gap must be a whole number of seconds, 0 or more",
    );
  }
  const current = findRace(state, input.raceId);
  if (current.rowGapSeconds === input.rowGapSeconds) {
    throw new RegistrationError("no_change", "That is already the row gap");
  }
  return commitRace(state, input.audit, input.raceId, {
    before: { rowGapSeconds: current.rowGapSeconds },
    after: { rowGapSeconds: input.rowGapSeconds },
    update: (race) => ({ ...race, rowGapSeconds: input.rowGapSeconds }),
  });
}

export function setPlannedStart(
  state: RaceDayState,
  input: { raceId: string; plannedStart: string | null; audit: ChangeAudit },
): RaceDayState {
  if (
    input.plannedStart !== null &&
    !isoTimestampSchema.safeParse(input.plannedStart).success
  ) {
    throw new RegistrationError(
      "invalid_number",
      "Planned start must be a date and time with a timezone",
    );
  }
  const current = findRace(state, input.raceId);
  if (current.plannedStart === input.plannedStart) {
    throw new RegistrationError("no_change", "That is already the planned start");
  }
  return commitRace(state, input.audit, input.raceId, {
    before: { plannedStart: current.plannedStart },
    after: { plannedStart: input.plannedStart },
    update: (race) => ({ ...race, plannedStart: input.plannedStart }),
  });
}

export function renameCheck(
  state: RaceDayState,
  input: { raceId: string; checkId: string; name: string; audit: ChangeAudit },
): RaceDayState {
  const name = input.name.trim();
  if (!name) throw new RegistrationError("missing_field", "Check name is required");
  const current = findRace(state, input.raceId);
  const check = current.checks.find((entry) => entry.id === input.checkId);
  if (!check)
    throw new RegistrationError("check_not_found", "That check is not on this race");
  if (check.name === name)
    throw new RegistrationError("no_change", "That is already the check name");
  return commitRace(state, input.audit, input.raceId, {
    before: { checkId: check.id, name: check.name },
    after: { checkId: check.id, name },
    update: (race) => ({
      ...race,
      checks: race.checks.map((entry) =>
        entry.id === check.id ? { ...entry, name } : entry,
      ),
    }),
  });
}

export function moveCheck(
  state: RaceDayState,
  input: {
    raceId: string;
    checkId: string;
    direction: "up" | "down";
    audit: ChangeAudit;
  },
): RaceDayState {
  const current = findRace(state, input.raceId);
  const checks = sortChecks(current.checks);
  const index = checks.findIndex((check) => check.id === input.checkId);
  if (index < 0)
    throw new RegistrationError("check_not_found", "That check is not on this race");
  const neighbor = input.direction === "up" ? index - 1 : index + 1;
  const currentCheck = checks[index];
  const other = checks[neighbor];
  if (!currentCheck || !other) {
    throw new RegistrationError(
      "no_change",
      "That check is already at the end of the order",
    );
  }
  const reordered = sortChecks(
    checks.map((check) => {
      if (check.id === currentCheck.id) return { ...check, order: other.order };
      if (check.id === other.id) return { ...check, order: currentCheck.order };
      return check;
    }),
  );
  return commitRace(state, input.audit, input.raceId, {
    before: { checks: checks.map(checkView) },
    after: { checks: reordered.map(checkView) },
    update: (race) => ({ ...race, checks: reordered }),
  });
}

export function renameStartRow(
  state: RaceDayState,
  input: { raceId: string; startRowId: string; label: string; audit: ChangeAudit },
): RaceDayState {
  const label = input.label.trim();
  if (!label) throw new RegistrationError("missing_field", "Start row label is required");
  const current = findRace(state, input.raceId);
  const row = current.startRows.find((entry) => entry.id === input.startRowId);
  if (!row)
    throw new RegistrationError(
      "start_row_not_found",
      "That start row is not on this race",
    );
  if (row.label === label)
    throw new RegistrationError("no_change", "That is already the row label");
  return commitRace(state, input.audit, input.raceId, {
    before: { startRowId: row.id, label: row.label },
    after: { startRowId: row.id, label },
    update: (race) => ({
      ...race,
      startRows: race.startRows.map((entry) =>
        entry.id === row.id ? { ...entry, label } : entry,
      ),
    }),
  });
}

export function moveClassToStartRow(
  state: RaceDayState,
  input: {
    raceId: string;
    startRowId: string;
    riderClass: RiderClass;
    audit: ChangeAudit;
  },
): RaceDayState {
  if (!RIDER_CLASSES.includes(input.riderClass)) {
    throw new RegistrationError("missing_field", "Class is required");
  }
  const current = findRace(state, input.raceId);
  const target = current.startRows.find((row) => row.id === input.startRowId);
  if (!target) {
    throw new RegistrationError(
      "start_row_not_found",
      "That start row is not on this race",
    );
  }
  const alreadyThere = current.startRows.every((row) =>
    row.id === target.id
      ? row.classes.includes(input.riderClass)
      : !row.classes.includes(input.riderClass),
  );
  if (alreadyThere) {
    throw new RegistrationError("no_change", "That class is already on this start row");
  }
  const startRows = current.startRows.map((row) => ({
    ...row,
    classes:
      row.id === target.id
        ? [
            ...row.classes.filter((riderClass) => riderClass !== input.riderClass),
            input.riderClass,
          ]
        : row.classes.filter((riderClass) => riderClass !== input.riderClass),
  }));
  return commitRace(state, input.audit, input.raceId, {
    before: { startRows: current.startRows.map(startRowView) },
    after: { startRows: startRows.map(startRowView) },
    update: (race) => ({ ...race, startRows }),
  });
}

/** Puts the class on this row and leaves it on any other rows it already uses. */
export function addClassToStartRow(
  state: RaceDayState,
  input: {
    raceId: string;
    startRowId: string;
    riderClass: RiderClass;
    audit: ChangeAudit;
  },
): RaceDayState {
  return changeClassOnStartRow(state, input, "add");
}

/** Takes the class off this row only. Other rows of the same class stay. */
export function removeClassFromStartRow(
  state: RaceDayState,
  input: {
    raceId: string;
    startRowId: string;
    riderClass: RiderClass;
    audit: ChangeAudit;
  },
): RaceDayState {
  return changeClassOnStartRow(state, input, "remove");
}

function changeClassOnStartRow(
  state: RaceDayState,
  input: {
    raceId: string;
    startRowId: string;
    riderClass: RiderClass;
    audit: ChangeAudit;
  },
  action: "add" | "remove",
): RaceDayState {
  if (!RIDER_CLASSES.includes(input.riderClass)) {
    throw new RegistrationError("missing_field", "Class is required");
  }
  const current = findRace(state, input.raceId);
  const target = current.startRows.find((row) => row.id === input.startRowId);
  if (!target) {
    throw new RegistrationError(
      "start_row_not_found",
      "That start row is not on this race",
    );
  }
  const already = target.classes.includes(input.riderClass);
  if (action === "add" && already) {
    throw new RegistrationError("no_change", "That class is already on this start row");
  }
  if (action === "remove" && !already) {
    throw new RegistrationError("no_change", "That class is not on this start row");
  }
  const startRows = current.startRows.map((row) => {
    if (row.id !== target.id) return row;
    return {
      ...row,
      classes:
        action === "add"
          ? [...row.classes, input.riderClass]
          : row.classes.filter((riderClass) => riderClass !== input.riderClass),
    };
  });
  return commitRace(state, input.audit, input.raceId, {
    before: { startRows: current.startRows.map(startRowView) },
    after: { startRows: startRows.map(startRowView) },
    update: (race) => ({ ...race, startRows }),
  });
}

function assertRaceLength(length: RaceLength): void {
  if (length.mode === "time") {
    if (!Number.isInteger(length.minutes) || length.minutes < 1) {
      throw new RegistrationError(
        "invalid_number",
        "Time limit must be a whole number of minutes, at least 1",
      );
    }
    return;
  }
  if (length.laps !== null && (!Number.isInteger(length.laps) || length.laps < 1)) {
    throw new RegistrationError(
      "invalid_number",
      "Laps must be a whole number, at least 1, or blank to run until the finish",
    );
  }
}

function rankMatch(rider: SeriesRider, needle: string): number {
  const number = String(rider.number);
  if (number === needle) return 0;
  if (number.startsWith(needle)) return 1;
  if (rider.name.toLowerCase().startsWith(needle)) return 2;
  return 3;
}

function phoneRiders(race: RacePackage): PhoneRosterRider[] {
  return race.registrations
    .map((registration) => ({
      name: registration.name,
      number: registration.riderNumber,
      class: registration.class,
    }))
    .sort((a, b) => a.number - b.number);
}

function registrationView(registration: RacePackage["registrations"][number]) {
  return {
    number: registration.riderNumber,
    name: registration.name,
    class: registration.class,
    seriesId: registration.seriesId,
  };
}

function checkView(check: Check) {
  return { id: check.id, order: check.order, name: check.name };
}

function startRowView(row: StartRow) {
  return { id: row.id, order: row.order, label: row.label, classes: [...row.classes] };
}

function sortChecks(checks: readonly Check[]): Check[] {
  return [...checks].sort((a, b) => a.order - b.order);
}

function assertValidNumber(value: number): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RegistrationError(
      "invalid_number",
      "Rider numbers are whole numbers, 1 or greater",
    );
  }
}

function findRegistration(state: RaceDayState, riderNumber: number) {
  const registration = state.race.registrations.find(
    (entry) => entry.riderNumber === riderNumber,
  );
  if (!registration) {
    throw new RegistrationError(
      "not_registered",
      `Number ${riderNumber} is not on the event roster`,
    );
  }
  return registration;
}

function findRace(state: RaceDayState, raceId: string): Race {
  const race = state.race.races.find((entry) => entry.id === raceId);
  if (!race) throw new RegistrationError("race_not_found", `No race with id ${raceId}`);
  return race;
}

function requireAudit(audit: ChangeAudit): ChangeAudit {
  const who = audit.who.trim();
  const why = audit.why.trim();
  if (!who) {
    throw new RegistrationError("missing_field", "Who is making this change is required");
  }
  if (!why) {
    throw new RegistrationError("missing_field", "A reason is required");
  }
  if (audit.entryId.trim().length === 0) {
    throw new RegistrationError("missing_field", "A changelog id is required");
  }
  return { ...audit, who, why };
}

function syncEventCourse(race: RacePackage): RacePackage {
  const primary = race.races.reduce((best, entry) =>
    entry.order < best.order ? entry : best,
  );
  return {
    ...race,
    event: {
      ...race.event,
      length: primary.length,
      checks: primary.checks.map((check) => ({ ...check })),
    },
  };
}

function commitRoster(
  state: RaceDayState,
  auditInput: ChangeAudit,
  change: {
    race: RacePackage;
    dayOfRegistrations?: DayOfRegistration[];
    action: ChangelogEntry["action"];
    entityId: string;
    before: unknown;
    after: unknown;
    upserts: PhoneRosterRider[];
    removals: number[];
  },
): RaceDayState {
  const audit = requireAudit(auditInput);
  assertNewEntry(state, audit.entryId);
  const race = racePackageSchema.parse(change.race);
  const delta = rosterDeltaMessageSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    type: "roster_delta",
    eventId: race.event.id,
    version: state.rosterVersion + 1,
    baseVersion: state.rosterVersion,
    upserts: change.upserts,
    removals: change.removals,
  });
  const entry = createChangelogEntry({
    id: audit.entryId,
    who: audit.who,
    when: audit.when,
    why: audit.why,
    entity: { type: "registration", id: change.entityId },
    action: change.action,
    before: change.before,
    after: change.after,
  });
  return raceDayStateSchema.parse({
    ...state,
    race,
    dayOfRegistrations: change.dayOfRegistrations ?? state.dayOfRegistrations,
    changelog: [...state.changelog, entry],
    rosterDeltas: [...state.rosterDeltas, delta],
    rosterVersion: state.rosterVersion + 1,
  });
}

function commitRace(
  state: RaceDayState,
  auditInput: ChangeAudit,
  raceId: string,
  change: {
    before: unknown;
    after: unknown;
    update: (race: Race) => Race;
  },
): RaceDayState {
  const audit = requireAudit(auditInput);
  assertNewEntry(state, audit.entryId);
  let found = false;
  const races = state.race.races.map((entry) => {
    if (entry.id !== raceId) return entry;
    found = true;
    return change.update(entry);
  });
  if (!found) throw new RegistrationError("race_not_found", `No race with id ${raceId}`);
  const race = racePackageSchema.parse(syncEventCourse({ ...state.race, races }));
  const entry = createChangelogEntry({
    id: audit.entryId,
    who: audit.who,
    when: audit.when,
    why: audit.why,
    entity: { type: "race", id: raceId },
    action: "change",
    before: change.before,
    after: change.after,
  });
  return raceDayStateSchema.parse({
    ...state,
    race,
    changelog: [...state.changelog, entry],
  });
}

function assertNewEntry(state: RaceDayState, entryId: string): void {
  if (state.changelog.some((entry) => entry.id === entryId)) {
    throw new RegistrationError("duplicate_entry", "Changelog entry id was already used");
  }
}
