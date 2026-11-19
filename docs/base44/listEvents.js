import { createClientFromRequest } from "npm:@base44/sdk";

// ---------------------------------------------------------------------------
// listEvents: every event a race director or admin may import.
// Returns id, name, date, end_date, location_name, round, status,
// updated_date, and how many races and registrations each event has.
// It does not return rider names or contact fields.
// ---------------------------------------------------------------------------

const HUB_ROLES = new Set(["race_director", "admin"]);

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

    const db = base44.asServiceRole.entities;
    const [events, races, registrations] = await Promise.all([
      fetchAll(db.Event, null),
      fetchAll(db.Race, null),
      fetchAll(db.EventRegistration, null),
    ]);

    const raceCount = countBy(races, "event_id");
    const registrationCount = countBy(registrations, "event_id");
    const listed = events
      .filter((event) => event && event.id && clean(event.name) && clean(event.date))
      .map((event) => ({
        id: String(event.id),
        name: clean(event.name),
        date: String(event.date).trim().slice(0, 10),
        endDate: dateOrNull(event.end_date),
        locationName: clean(event.location_name),
        round: wholeOrNull(event.round),
        status: clean(event.status),
        updatedAt: instantOrNull(event.updated_date),
        raceCount: raceCount.get(String(event.id)) || 0,
        registrationCount: registrationCount.get(String(event.id)) || 0,
      }))
      .filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date))
      .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));

    return Response.json({ ok: true, events: listed }, { status: 200, headers: cors() });
  } catch (error) {
    console.error("listEvents failed");
    if (!user) return fail(401, "unauthorized", "Sign in as a race director or admin");
    return fail(500, "server_error", "The event list could not be built");
  }
}

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

function countBy(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const id = clean(row && row[field]);
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

function dateOrNull(value) {
  const text = clean(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function wholeOrNull(value) {
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function instantOrNull(value) {
  const text = clean(value);
  if (!text) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
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
