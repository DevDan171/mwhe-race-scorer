import type { RacePackage } from "../schemas/race-package.js";
import { phoneRosterSchema, type PhoneRoster } from "../schemas/rider.js";
import { SCHEMA_VERSION } from "../version.js";

/**
 * Checkpoint phones only receive name, number, and class. Series ids stay
 * on the laptop.
 */
export function projectPhoneRoster(race: RacePackage, version = 1): PhoneRoster {
  return phoneRosterSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    eventId: race.event.id,
    version,
    riders: race.registrations
      .map((registration) => ({
        name: registration.name,
        number: registration.riderNumber,
        class: registration.class,
      }))
      .sort((a, b) => a.number - b.number),
  });
}
