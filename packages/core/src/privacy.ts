import {
  PRIVATE_RIDER_FIELDS,
  racePackageSchema,
  type EventRegistration,
  type PrivateRiderField,
  type RacePackage,
  type SeriesRider,
} from "./schemas/race-package.js";

/**
 * Shown above the safety checkbox when a rider is added on the laptop.
 * The wording is the series' acknowledgement. Do not paraphrase it.
 */
export const SAFETY_ACKNOWLEDGEMENT =
  "I understand that hard enduro racing is an inherently dangerous activity that can result in serious injury or death. I assume all risks and release the series, its directors, clubs, and officials from liability. I will comply with all AMA and series rules.";

export const SAFETY_CHECKBOX_LABEL = "I have read and accept the safety requirements.";

export interface RiderContact {
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
  safetyAcknowledged?: boolean;
  safetyAcknowledgedAt?: string | null;
}

/** One rider's contact fields, detached from the public race package. */
export interface RiderPrivateRecord extends RiderContact {
  seriesId: string | null;
  riderNumber: number | null;
  name: string;
}

const PRIVATE_SET = new Set<string>(PRIVATE_RIDER_FIELDS);

export function contactFrom(
  source: RiderContact | SeriesRider | EventRegistration,
): RiderContact {
  const contact: RiderContact = {};
  for (const field of PRIVATE_RIDER_FIELDS) {
    const value = source[field];
    if (value !== undefined) contact[field] = value as never;
  }
  return contact;
}

export function hasEmergencyContact(contact: RiderContact): boolean {
  return Boolean(
    clean(contact.emergencyContactName) || clean(contact.emergencyContactPhone),
  );
}

/** Non-empty contact values. Tests use this list to prove a projection is public. */
export function privateValues(contact: RiderContact): string[] {
  const values: string[] = [];
  for (const field of PRIVATE_RIDER_FIELDS) {
    const value = contact[field];
    if (typeof value === "string" && value.trim()) values.push(value.trim());
  }
  return values;
}

export function collectPrivateRecords(race: RacePackage): RiderPrivateRecord[] {
  const records: RiderPrivateRecord[] = [];
  for (const rider of race.riders) {
    if (!hasStoredContact(rider)) continue;
    records.push({
      seriesId: rider.seriesId,
      riderNumber: rider.number,
      name: rider.name,
      ...contactFrom(rider),
    });
  }
  for (const registration of race.registrations) {
    if (!hasStoredContact(registration)) continue;
    const seriesId = registration.seriesId;
    const existing = records.find(
      (record) =>
        (seriesId !== null && record.seriesId === seriesId) ||
        record.riderNumber === registration.riderNumber,
    );
    if (existing) {
      Object.assign(existing, contactFrom(registration));
      existing.riderNumber = registration.riderNumber;
      existing.name = registration.name;
      continue;
    }
    records.push({
      seriesId,
      riderNumber: registration.riderNumber,
      name: registration.name,
      ...contactFrom(registration),
    });
  }
  return records;
}

/** Race package with contact fields removed. Safe to put in results tooling or on disk. */
export function exportPublicRacePackage(race: RacePackage): RacePackage {
  return racePackageSchema.parse({
    ...race,
    riders: race.riders.map(stripContact),
    registrations: race.registrations.map(stripContact),
  });
}

export function restorePrivateRecords(
  race: RacePackage,
  records: readonly RiderPrivateRecord[],
): RacePackage {
  return racePackageSchema.parse({
    ...race,
    riders: race.riders.map((rider) => {
      const record = records.find((entry) => entry.seriesId === rider.seriesId);
      return record ? { ...rider, ...contactFrom(record) } : rider;
    }),
    registrations: race.registrations.map((registration) => {
      const record = records.find(
        (entry) =>
          (registration.seriesId !== null && entry.seriesId === registration.seriesId) ||
          entry.riderNumber === registration.riderNumber,
      );
      return record ? { ...registration, ...contactFrom(record) } : registration;
    }),
  });
}

/** True when a JSON text contains a contact value. Keys alone do not count. */
export function textContainsPrivateValue(
  text: string,
  contacts: readonly RiderContact[],
): boolean {
  return contacts.some((contact) =>
    privateValues(contact).some((value) => value.length >= 3 && text.includes(value)),
  );
}

function hasStoredContact(source: RiderContact): boolean {
  return PRIVATE_RIDER_FIELDS.some((field) => {
    const value = source[field];
    return value !== undefined && value !== null && value !== "";
  });
}

function stripContact<T extends RiderContact>(record: T): T {
  const copy = { ...record };
  for (const key of Object.keys(copy)) {
    if (PRIVATE_SET.has(key)) delete copy[key as PrivateRiderField];
  }
  return copy;
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}
