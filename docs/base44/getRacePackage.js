import { createClientFromRequest } from "npm:@base44/sdk";

// ---------------------------------------------------------------------------
// getRacePackage: builds the race download for the MWHE laptop.
// Reads these entities (read only): Event, Race, ScoringRoster,
// EventRegistration, Rider. Contact and emergency fields come from Rider
// and are copied onto the matching series rider and registration.
// ScoringRoster has no contact fields. Each record includes updatedAt
// from updated_date so the laptop can merge a re-import.
// Race length comes from length_type, length_laps, and length_minutes.
// A class may start on several rows (Race.classes[].rows). Row numbers
// run across the race. Row N leaves at start_at plus row_gap_seconds
// times (N - 1). A start row is per race. start_rows is
// [{ race_id, row }]. The single start_row number is used only when
// the rider's class is on exactly one race.
// ---------------------------------------------------------------------------

const HUB_ROLES = new Set(["race_director", "admin"]);

// Official class list, in the order the laptop requires.
const RIDER_CLASSES = [
  "Pro",
  "A",
  "B",
  "C",
  "+40A",
  "+40B",
  "+40C",
  "Womens",
  "Womens Pro",
  "Electric Sportsman",
  "Electric Pro",
  "65/85",
  "50cc",
];

// Race length is read in readRaceLength. The Edit Race form uses
// length_type, length_laps, and length_minutes. A lap race with no lap
// count runs until the finish and is not given a time limit.
const MAX_CLASS_ROWS = 30;

// true  = riders marked unpaid are still sent (the laptop has no paid flag).
// false = unpaid riders are left out of the download.
const INCLUDE_UNPAID = true;

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return fail(405, "method_not_allowed", "Use GET");
  }

  let user = null;
  try {
    const base44 = createClientFromRequest(req);
    user = await base44.auth.me();
    if (!user) return fail(401, "unauthorized", "Sign in as a race director or admin");

    const role = String(user.role || "")
      .trim()
      .toLowerCase();
    if (!HUB_ROLES.has(role)) {
      return fail(403, "forbidden", "This account is not a race director or admin");
    }

    const eventId = await readEventId(req);
    if (!eventId) return fail(400, "missing_event_id", "eventId is required");

    // Role is checked above. Service role is only so entity rules cannot hide
    // the series list or the roster from this download.
    const db = base44.asServiceRole.entities;

    const event = await findEvent(db, eventId);
    if (!event) return fail(404, "event_not_found", "No event with id " + eventId);

    const [races, roster, registrations, riders] = await Promise.all([
      fetchAll(db.Race, { event_id: eventId }),
      fetchAll(db.ScoringRoster, { event_id: eventId }),
      fetchAll(db.EventRegistration, { event_id: eventId }),
      fetchAll(db.Rider, null),
    ]);

    const built = buildRacePackage({ event, races, roster, registrations, riders });
    if (built.problem) return fail(409, "event_not_ready", built.problem);

    const wantReport = new URL(req.url).searchParams.get("report") === "1";
    if (wantReport) {
      // For a director checking the download from a browser or PowerShell.
      // The laptop never asks for this. It holds counts and rider numbers only.
      return Response.json(
        { ok: true, racePackage: built.racePackage, report: built.report },
        { status: 200, headers: cors() },
      );
    }
    return Response.json(
      { ok: true, racePackage: built.racePackage },
      { status: 200, headers: cors() },
    );
  } catch (error) {
    // Never log the Authorization header or rider data.
    console.error("getRacePackage failed");
    if (!user) return fail(401, "unauthorized", "Sign in as a race director or admin");
    return fail(500, "server_error", "The race package could not be built");
  }
}

// ----------------------------- loading -------------------------------------

async function readEventId(req) {
  const url = new URL(req.url);
  const fromQuery = (url.searchParams.get("eventId") || "").trim();
  if (fromQuery) return fromQuery;
  if (req.method !== "POST") return "";
  const body = await req.json().catch(() => ({}));
  return String(body.eventId || "").trim();
}

async function findEvent(db, eventId) {
  try {
    const found = await db.Event.filter({ id: eventId });
    return Array.isArray(found) && found.length > 0 ? found[0] : null;
  } catch (error) {
    // A made-up id that is not even shaped like a record id may make the
    // lookup throw. That is "not found", not a server fault.
    if (!/^[0-9a-f]{24}$/i.test(eventId)) return null;
    throw error;
  }
}

// Base44 returns a limited page by default, so ask for pages until done.
async function fetchAll(entity, query) {
  const pageSize = 500;
  const out = [];
  for (let page = 0; page < 20; page += 1) {
    const rows = query
      ? await entity.filter(query, "created_date", pageSize, page * pageSize)
      : await entity.list("created_date", pageSize, page * pageSize);
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

// ----------------------------- mapping -------------------------------------

function buildRacePackage({ event, races, roster, registrations, riders }) {
  const warnings = [];
  const warn = (text) => warnings.push(text);

  // ---- event
  const date = String(event.date || "")
    .trim()
    .slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { problem: "This event has no date. Set a date on the event first." };
  }
  const eventName = clean(event.name);
  if (!eventName) return { problem: "This event has no name." };

  // ---- races (lowest site order becomes the primary race)
  const sortedRaces = [...races].sort(
    (a, b) =>
      numberOr(a.order, 9999) - numberOr(b.order, 9999) ||
      String(a.created_date || "").localeCompare(String(b.created_date || "")),
  );
  const packageRaces = [];
  for (const race of sortedRaces) {
    const label = clean(race.name) || "(unnamed race)";
    const seenChecks = new Set();
    const checks = [];
    for (const point of Array.isArray(race.checkpoints) ? race.checkpoints : []) {
      const id = clean(point && point.id);
      if (!id || seenChecks.has(id)) continue;
      seenChecks.add(id);
      checks.push({
        id,
        order: checks.length + 1,
        name: clean(point.name) || "Checkpoint " + (checks.length + 1),
      });
    }
    if (checks.length === 0) {
      warn("Race '" + label + "' has no checkpoints and was left out.");
      continue;
    }

    const lengthResult = readRaceLength(race, label, warn);
    if (lengthResult.problem) return { problem: lengthResult.problem };

    // classes[].rows is how many race-wide rows that class uses. Pro with
    // 1 row then A with 3 rows becomes row 1 Pro, rows 2-4 A.
    const rows = [];
    const seenClasses = new Set();
    for (const entry of Array.isArray(race.classes) ? race.classes : []) {
      const riderClass = canonicalClass(entry && entry.rider_class);
      if (!riderClass) {
        warn("Race '" + label + "' lists an unknown class and it was skipped.");
        continue;
      }
      if (seenClasses.has(riderClass)) continue;
      seenClasses.add(riderClass);
      const count = classRowCount(entry && entry.rows, label, riderClass, warn);
      for (let i = 0; i < count; i += 1) rows.push({ riderClass });
    }
    const startRows = rows.length
      ? rows.map((row, index) => ({
          id: race.id + ":row-" + (index + 1),
          order: index + 1,
          label: row.riderClass,
          classes: [row.riderClass],
        }))
      : [
          {
            id: race.id + ":row-1",
            order: 1,
            label: "Row 1",
            classes: [...RIDER_CLASSES],
          },
        ];
    if (!rows.length)
      warn("Race '" + label + "' has no classes, so every class is on one row.");

    packageRaces.push({
      id: String(race.id),
      name: clean(race.name) || "Race " + (packageRaces.length + 1),
      order: packageRaces.length + 1,
      length: lengthResult.length,
      rowGapSeconds: readRowGap(race, label, warn),
      plannedStart: readPlannedStart(race, label, warn),
      checks,
      startRows,
      ...presentUpdated(race.updated_date),
    });
  }
  if (packageRaces.length === 0) {
    return {
      problem:
        "This event has no race with checkpoints yet. Add a race and its checkpoints on the site first.",
    };
  }
  const primary = packageRaces[0];

  // ---- series riders (Rider table)
  const seriesRiders = [];
  const seriesByNumber = new Map();
  const ranked = [...riders].sort(
    (a, b) =>
      numberOr(b.series_year, 0) - numberOr(a.series_year, 0) ||
      String(a.created_date || "").localeCompare(String(b.created_date || "")),
  );
  for (const rider of ranked) {
    const status = String(rider.registration_status || "").toLowerCase();
    if (status === "inactive" || status === "cancelled" || status === "canceled")
      continue;
    const number = riderNumber(rider.bike_number);
    const riderClass = canonicalClass(rider.rider_class);
    const name = fullName(rider.first_name, rider.last_name);
    if (!number || !riderClass || !name) {
      warn(
        "Series rider " +
          (clean(rider.bike_number) || "?") +
          " (" +
          (name || "no name") +
          ") has a number or class the laptop cannot use and was left out.",
      );
      continue;
    }
    if (seriesByNumber.has(number)) {
      warn(
        "Series number " +
          number +
          " belongs to more than one rider. Only the first is sent.",
      );
      continue;
    }
    const entry = {
      seriesId: String(rider.id),
      name,
      number,
      class: riderClass,
      ...presentUpdated(rider.updated_date),
      ...contactFields(rider),
    };
    seriesRiders.push(entry);
    seriesByNumber.set(number, entry);
  }
  const seriesById = new Map(seriesRiders.map((r) => [r.seriesId, r]));

  // ---- registrations: race-day roster first, then online pre-entries
  const out = [];
  const usedNumbers = new Set();
  let unpaidCount = 0;

  function addRegistration({
    number,
    name,
    riderClass,
    riderId,
    source,
    unpaid,
    registeredAt,
    assignedRows,
    updated,
    contact,
  }) {
    if (!number) {
      warn(
        source +
          " '" +
          name +
          "' has a rider number the laptop cannot use (needs a whole number above 0) and was left out.",
      );
      return;
    }
    if (!riderClass) {
      warn(
        source + " #" + number + " '" + name + "' has no valid class and was left out.",
      );
      return;
    }
    if (!name) {
      warn(source + " #" + number + " has no name and was left out.");
      return;
    }
    if (unpaid && !INCLUDE_UNPAID) return;
    if (usedNumbers.has(number)) {
      if (source === "Roster")
        warn("Roster number " + number + " is used twice. Only the first is sent.");
      return;
    }
    const owner = seriesByNumber.get(number);
    let seriesId = null;
    if (owner) {
      const sameRider = riderId ? owner.seriesId === riderId : sameName(owner.name, name);
      if (!sameRider) {
        warn(
          source +
            " #" +
            number +
            " '" +
            name +
            "' uses a number that belongs to series rider '" +
            owner.name +
            "'. It was left out. Fix the number on the site.",
        );
        return;
      }
      seriesId = owner.seriesId;
    }
    usedNumbers.add(number);
    if (unpaid) unpaidCount += 1;
    out.push({
      riderNumber: number,
      name,
      class: riderClass,
      seriesId,
      registeredAt,
      assignedRows,
      payment: unpaid ? "unpaid" : "paid",
      ...updated,
      ...contact,
    });
  }

  for (const row of roster) {
    const number = riderNumber(row.number);
    const name = fullName(row.first_name, row.last_name);
    if (!number) {
      warn(
        "Roster entry '" +
          (name || "no name") +
          "' has a rider number the laptop cannot use (needs a whole number above 0) and was left out.",
      );
      continue;
    }
    const preEntry = findPreEntry(registrations, number);
    const series = seriesByNumber.get(number);
    const contact = copyContact(series);
    if (!hasEmergency(contact)) {
      warn(
        "Roster #" +
          number +
          (name ? " " + name : "") +
          " has no emergency contact on the series rider list.",
      );
    }
    addRegistration({
      number,
      name,
      riderClass: canonicalClass(row.rider_class),
      riderId: null,
      source: "Roster",
      unpaid: row.paid === false || /^unpaid$/i.test(String(row.payment || "")),
      registeredAt: earlierCreated(row, preEntry, "Roster", number, warn),
      assignedRows: readAssignedRows(
        row,
        canonicalClass(row.rider_class),
        packageRaces,
        "Roster",
        number,
        warn,
      ),
      updated: presentUpdated(
        laterDate(row.updated_date, preEntry && preEntry.updated_date),
      ),
      contact,
    });
  }
  const rosterCount = out.length;

  for (const reg of registrations) {
    if (/cancel|refund/i.test(String(reg.payment_status || ""))) continue;
    const profile = seriesById.get(String(reg.rider_id || ""));
    const number = riderNumber(reg.bike_number) || (profile ? profile.number : null);
    if (usedNumbers.has(number)) continue;
    // Same person already on the roster under another number: skip.
    if (profile && out.some((r) => r.seriesId === profile.seriesId)) continue;
    if (!number) {
      warn(
        "Pre-entry '" +
          (clean(reg.rider_name) || (profile ? profile.name : "") || "no name") +
          "' has a rider number the laptop cannot use (needs a whole number above 0) and was left out.",
      );
      continue;
    }
    addRegistration({
      number,
      name: clean(reg.rider_name) || (profile ? profile.name : ""),
      riderClass: canonicalClass(reg.rider_class),
      riderId: reg.rider_id ? String(reg.rider_id) : null,
      source: "Pre-entry",
      unpaid: !/^paid$/i.test(String(reg.payment_status || "")),
      registeredAt: readCreated(reg.created_date, "Pre-entry", number, warn),
      assignedRows: readAssignedRows(
        reg,
        canonicalClass(reg.rider_class),
        packageRaces,
        "Pre-entry",
        number,
        warn,
      ),
      updated: presentUpdated(reg.updated_date),
      contact: copyContact(profile),
    });
  }

  for (const reg of out) {
    for (const assignment of reg.assignedRows) {
      const race = packageRaces.find((item) => item.id === assignment.raceId);
      if (!race) continue;
      const classRows = race.startRows.filter(
        (item) => item.classes.indexOf(reg.class) !== -1,
      );
      if (!classRows.some((item) => item.order === assignment.row)) {
        warn(
          "#" +
            reg.riderNumber +
            " is assigned to row " +
            assignment.row +
            " on " +
            race.name +
            ", which is not a " +
            reg.class +
            " row. The laptop will place them by registration time on that race.",
        );
      }
    }
  }

  const racePackage = {
    schemaVersion: 1,
    event: {
      id: String(event.id),
      name: eventName,
      date,
      length: primary.length,
      checks: primary.checks.map((c) => ({ ...c })),
      ...presentUpdated(event.updated_date),
    },
    races: packageRaces,
    classes: [...RIDER_CLASSES],
    riders: seriesRiders,
    registrations: out,
  };

  return {
    racePackage,
    report: {
      eventId: String(event.id),
      races: packageRaces.length,
      seriesRiders: seriesRiders.length,
      registrations: out.length,
      fromRoster: rosterCount,
      fromPreEntry: out.length - rosterCount,
      unpaidIncluded: INCLUDE_UNPAID ? unpaidCount : 0,
      warnings,
    },
  };
}

// ----------------------------- helpers -------------------------------------

// ---------------------------------------------------------------------------
// Race length. Confirmed Edit Race field names. Change only this function
// if the site renames them.
//   length_type     "time" or "laps"
//   length_laps     number; 0 or blank means laps are not set
//   length_minutes  minutes, counted from each row's own start
// Example: length_type "time", length_laps 0, length_minutes 120.
// A lap race never receives a default time limit. Blank laps means the
// race runs until the finish.
// ---------------------------------------------------------------------------
function readRaceLength(race, label, warn) {
  const type = clean(race.length_type).toLowerCase();
  const minutes = positiveInt(race.length_minutes);
  const laps = readOptionalCount(race.length_laps);

  if (type === "time") {
    if (!minutes) {
      return {
        problem:
          "Race '" +
          label +
          "' is a time race but length_minutes is missing or not a whole number above 0.",
      };
    }
    return { length: { mode: "time", minutes: minutes } };
  }
  if (type === "laps") {
    if (laps.bad) {
      return { problem: "Race '" + label + "' has a lap count the laptop cannot use." };
    }
    return { length: { mode: "laps", laps: laps.value } };
  }
  if (type) {
    return {
      problem:
        "Race '" + label + "' has length_type '" + type + "', which is not time or laps.",
    };
  }
  // length_type not filled in. Do not invent a 180 minute limit.
  if (laps.bad) {
    return { problem: "Race '" + label + "' has a lap count the laptop cannot use." };
  }
  if (minutes && laps.value) {
    return {
      problem:
        "Race '" +
        label +
        "' has both length_minutes and length_laps but no length_type. Set length_type to time or laps.",
    };
  }
  if (minutes) return { length: { mode: "time", minutes: minutes } };
  if (laps.value) return { length: { mode: "laps", laps: laps.value } };
  warn(
    "Race '" +
      label +
      "' has no length_type. It is sent as laps until the finish, with no time limit.",
  );
  return { length: { mode: "laps", laps: null } };
}

function readOptionalCount(value) {
  if (
    value === null ||
    value === undefined ||
    clean(value) === "" ||
    value === 0 ||
    value === "0"
  ) {
    return { bad: false, value: null };
  }
  const n = positiveInt(value);
  if (!n) return { bad: true, value: null };
  return { bad: false, value: n };
}

function classRowCount(value, label, riderClass, warn) {
  if (value === null || value === undefined || clean(value) === "") return 1;
  const count = positiveInt(value);
  if (!count) {
    warn(
      "Race '" +
        label +
        "': " +
        riderClass +
        " has a row count the laptop cannot use. One row was sent.",
    );
    return 1;
  }
  if (count > MAX_CLASS_ROWS) {
    warn(
      "Race '" +
        label +
        "': " +
        riderClass +
        " asked for " +
        count +
        " rows. " +
        MAX_CLASS_ROWS +
        " were sent.",
    );
    return MAX_CLASS_ROWS;
  }
  return count;
}

function readRowGap(race, label, warn) {
  const value = race.row_gap_seconds;
  if (value === null || value === undefined || clean(value) === "") return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    warn("Race '" + label + "' has a row gap the laptop cannot use. No gap was sent.");
    return 0;
  }
  return n;
}

function readPlannedStart(race, label, warn) {
  let text = clean(race.start_at);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
    text = text.replace(" ", "T") + "Z";
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) {
    warn(
      "Race '" +
        label +
        "' has a start time the laptop cannot read. No planned start was sent.",
    );
    return null;
  }
  return new Date(ms).toISOString();
}

// ---------------------------------------------------------------------------
// Start row is per race. Add this on ScoringRoster, and on
// EventRegistration when a pre-entry has one:
//   start_rows: [{ race_id: "<Race id>", row: 4 }]
// race_id is the Race record id. row is the race-wide row number on that
// race. Today's start_row is one number for the whole event. It is used
// only when this class is on exactly one race.
// ---------------------------------------------------------------------------
function readAssignedRows(record, riderClass, packageRaces, source, number, warn) {
  const fromList = readStartRowsList(
    record && record.start_rows,
    packageRaces,
    source,
    number,
    warn,
  );
  if (fromList !== null) return fromList;
  if (!riderClass) return [];

  const raw = record && record.start_row;
  if (raw === null || raw === undefined || clean(raw) === "") return [];
  const single = positiveInt(raw);
  if (!single) {
    warn(
      source +
        " #" +
        number +
        " has a start row the laptop cannot use. They will be placed by registration time.",
    );
    return [];
  }

  const races = packageRaces.filter((race) =>
    race.startRows.some((row) => row.classes.indexOf(riderClass) !== -1),
  );
  if (races.length === 1) return [{ raceId: races[0].id, row: single }];
  if (races.length === 0) {
    warn(
      source +
        " #" +
        number +
        " has start row " +
        single +
        ", but " +
        riderClass +
        " is not on a race. It was not applied.",
    );
    return [];
  }
  warn(
    source +
      " #" +
      number +
      " has one start row (" +
      single +
      ") but " +
      riderClass +
      " is in more than one race (" +
      races.map((race) => race.name).join(", ") +
      "). A start row is per race, so it was not applied. Add start_rows as [{ race_id, row }].",
  );
  return [];
}

function readStartRowsList(value, packageRaces, source, number, warn) {
  if (value === null || value === undefined || value === "") return null;
  if (!Array.isArray(value)) {
    warn(
      source + " #" + number + " has start_rows that are not a list. They were not used.",
    );
    return [];
  }
  const known = new Set(packageRaces.map((race) => String(race.id)));
  const out = [];
  const seen = new Set();
  for (const entry of value) {
    const raceId = clean(entry && (entry.race_id || entry.raceId));
    const row = positiveInt(
      entry && (entry.row !== undefined ? entry.row : entry.start_row),
    );
    if (!raceId || !row) {
      warn(
        source +
          " #" +
          number +
          " has a start_rows entry the laptop cannot use. It was skipped.",
      );
      continue;
    }
    if (!known.has(raceId)) {
      warn(
        source +
          " #" +
          number +
          " names race " +
          raceId +
          ", which is not in this download. That start row was skipped.",
      );
      continue;
    }
    if (seen.has(raceId)) {
      warn(
        source +
          " #" +
          number +
          " has two start rows for race " +
          raceId +
          ". The first was kept.",
      );
      continue;
    }
    seen.add(raceId);
    out.push({ raceId: raceId, row: row });
  }
  return out;
}

function findPreEntry(registrations, number) {
  if (!number) return null;
  for (const reg of registrations) {
    if (/cancel|refund/i.test(String(reg.payment_status || ""))) continue;
    if (riderNumber(reg.bike_number) === number) return reg;
  }
  return null;
}

function earlierCreated(rosterRow, preEntry, source, number, warn) {
  const rosterAt = readCreated(rosterRow && rosterRow.created_date, source, number, warn);
  const preAt = preEntry
    ? readCreated(preEntry.created_date, "Pre-entry", number, warn)
    : null;
  if (!rosterAt) return preAt;
  if (!preAt) return rosterAt;
  return Date.parse(rosterAt) <= Date.parse(preAt) ? rosterAt : preAt;
}

function readCreated(value, source, number, warn) {
  let text = clean(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
    text = text.replace(" ", "T") + "Z";
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) {
    warn(
      source +
        " #" +
        number +
        " has a registration time the laptop cannot read. They sort after riders with a time.",
    );
    return null;
  }
  return new Date(ms).toISOString();
}

function presentUpdated(value) {
  const updatedAt = readInstant(value);
  return updatedAt ? { updatedAt: updatedAt } : {};
}

function laterDate(left, right) {
  const a = readInstant(left);
  const b = readInstant(right);
  if (!a) return b;
  if (!b) return a;
  return Date.parse(a) >= Date.parse(b) ? a : b;
}

function readInstant(value) {
  let text = clean(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
    text = text.replace(" ", "T") + "Z";
  }
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function dateOnly(value) {
  const text = clean(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function contactFields(rider) {
  const safety = readSafety(rider && rider.safety_acknowledged);
  const fields = {
    dateOfBirth: dateOnly(rider && rider.date_of_birth),
    phone: clean(rider && rider.phone) || null,
    email: clean(rider && rider.email) || null,
    emergencyContactName: clean(rider && rider.emergency_contact_name) || null,
    emergencyContactPhone: clean(rider && rider.emergency_contact_phone) || null,
    emergencyContactRelation: clean(rider && rider.emergency_contact_relation) || null,
  };
  const out = {};
  for (const key of Object.keys(fields)) {
    if (fields[key]) out[key] = fields[key];
  }
  if (safety.acknowledged) out.safetyAcknowledged = true;
  if (safety.at) out.safetyAcknowledgedAt = safety.at;
  return out;
}

function copyContact(seriesEntry) {
  if (!seriesEntry) return {};
  const keys = [
    "dateOfBirth",
    "phone",
    "email",
    "emergencyContactName",
    "emergencyContactPhone",
    "emergencyContactRelation",
    "safetyAcknowledged",
    "safetyAcknowledgedAt",
  ];
  const out = {};
  for (const key of keys) {
    if (
      seriesEntry[key] !== undefined &&
      seriesEntry[key] !== null &&
      seriesEntry[key] !== ""
    ) {
      out[key] = seriesEntry[key];
    }
  }
  return out;
}

function hasEmergency(contact) {
  return Boolean(
    contact && (contact.emergencyContactName || contact.emergencyContactPhone),
  );
}

function readSafety(value) {
  if (value === true || value === "true" || value === "yes") {
    return { acknowledged: true, at: null };
  }
  const text = clean(value);
  if (!text || text === "false" || text === "no")
    return { acknowledged: false, at: null };
  const at = readInstant(text);
  if (at) return { acknowledged: true, at: at };
  return { acknowledged: false, at: null };
}

function clean(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}

function fullName(first, last) {
  return clean(clean(first) + " " + clean(last));
}

function sameName(a, b) {
  const x = clean(a).toLowerCase();
  const y = clean(b).toLowerCase();
  if (x === y) return true;
  const xs = x.split(" ");
  const ys = y.split(" ");
  return xs[xs.length - 1] === ys[ys.length - 1] && xs[0][0] === ys[0][0];
}

function riderNumber(value) {
  const text = clean(value);
  if (!/^\d{1,6}$/.test(text)) return null;
  const n = Number(text);
  return n > 0 ? n : null;
}

function canonicalClass(value) {
  const text = clean(value).toLowerCase();
  return RIDER_CLASSES.find((c) => c.toLowerCase() === text) || null;
}

function numberOr(value, fallback) {
  const n = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(n)
    ? n
    : fallback;
}

function positiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function fail(status, error, message) {
  return Response.json({ ok: false, error, message }, { status, headers: cors() });
}

function cors() {
  return {
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Accept, Content-Type, X-App-Id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}
