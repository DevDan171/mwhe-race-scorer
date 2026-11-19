import { createClientFromRequest } from "npm:@base44/sdk";

// ---------------------------------------------------------------------------
// uploadSeriesRiders: creates Rider rows for people added on the laptop.
// race_director and admin only. The laptop sends the contact fields because
// the race-day form collected them. This function does not log those fields.
// ---------------------------------------------------------------------------

const HUB_ROLES = new Set(["race_director", "admin"]);
const RIDER_CLASSES = new Set([
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
]);

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== "POST") {
    return fail(405, "method_not_allowed", "Use POST");
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

    const body = await req.json().catch(() => ({}));
    const riders = Array.isArray(body.riders) ? body.riders : [];
    if (riders.length === 0) {
      return fail(400, "missing_riders", "At least one rider is required");
    }
    if (riders.length > 50) {
      return fail(400, "too_many", "Upload at most 50 riders at a time");
    }

    const db = base44.asServiceRole.entities;
    const created = [];
    for (const rider of riders) {
      const parsed = parseRider(rider);
      if (parsed.error) return fail(400, parsed.error, parsed.message);
      const row = await db.Rider.create({
        first_name: parsed.firstName,
        last_name: parsed.lastName,
        bike_number: parsed.bikeNumber,
        rider_class: parsed.riderClass,
        series_year: new Date().getUTCFullYear(),
        date_of_birth: parsed.dateOfBirth,
        phone: parsed.phone,
        email: parsed.email,
        emergency_contact_name: parsed.emergencyContactName,
        emergency_contact_phone: parsed.emergencyContactPhone,
        emergency_contact_relation: parsed.emergencyContactRelation,
        safety_acknowledged: parsed.safetyAcknowledgedAt,
        registration_status: "active",
      });
      created.push({
        localId: parsed.localId,
        seriesId: String(row && row.id ? row.id : ""),
      });
    }

    return Response.json({ ok: true, created }, { status: 200, headers: cors() });
  } catch (error) {
    console.error("uploadSeriesRiders failed");
    if (!user) return fail(401, "unauthorized", "Sign in as a race director or admin");
    return fail(500, "server_error", "The series riders could not be saved");
  }
}

function parseRider(rider) {
  const localId = clean(rider && rider.localId);
  const firstName = clean(rider && rider.firstName);
  const lastName = clean(rider && rider.lastName);
  const riderClass = clean(rider && rider.riderClass);
  const bikeNumber = Number(rider && rider.bikeNumber);
  const safety = clean(rider && rider.safetyAcknowledgedAt);
  if (!localId || !firstName || !lastName) {
    return { error: "missing_riders", message: "Each rider needs a name and a local id" };
  }
  if (!Number.isInteger(bikeNumber) || bikeNumber < 1) {
    return {
      error: "invalid_number",
      message: "Rider numbers are whole numbers, 1 or greater",
    };
  }
  if (!RIDER_CLASSES.has(riderClass)) {
    return { error: "invalid_class", message: "That class is not on the series list" };
  }
  if (!safety || !Number.isFinite(Date.parse(safety))) {
    return {
      error: "safety_required",
      message: "A new series rider needs a safety acknowledgement",
    };
  }
  const birth = clean(rider && rider.dateOfBirth);
  if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
    return { error: "invalid_date", message: "Date of birth must be YYYY-MM-DD" };
  }
  return {
    localId,
    firstName,
    lastName,
    bikeNumber,
    riderClass,
    dateOfBirth: birth || null,
    phone: clean(rider && rider.phone) || null,
    email: clean(rider && rider.email) || null,
    emergencyContactName: clean(rider && rider.emergencyContactName) || null,
    emergencyContactPhone: clean(rider && rider.emergencyContactPhone) || null,
    emergencyContactRelation: clean(rider && rider.emergencyContactRelation) || null,
    safetyAcknowledgedAt: new Date(Date.parse(safety)).toISOString(),
  };
}

function clean(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
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
