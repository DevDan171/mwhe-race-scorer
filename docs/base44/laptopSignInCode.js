import { createClientFromRequest } from "npm:@base44/sdk";

const HUB_ROLES = new Set(["race_director", "admin"]);
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const STATE_OK = /^[A-Za-z0-9_-]{43,128}$/;
const TTL_MS = 600000;

export default async function (req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }
  if (req.method !== "POST") {
    return fail(404, "not_found", "This function is a POST");
  }

  let user = null;
  try {
    const base44 = createClientFromRequest(req);
    user = await base44.auth.me();
    if (!user) return fail(401, "unauthorized", "Sign in again");
    const role = String(user.role || "")
      .trim()
      .toLowerCase();
    if (!HUB_ROLES.has(role)) {
      return fail(403, "forbidden", "This account is not a race director or admin");
    }

    const body = await req.json().catch(() => ({}));
    const state = String(body.state || "").trim();
    if (!STATE_OK.test(state)) {
      return fail(400, "missing_state", "Open the sign-in page from the laptop");
    }

    const token = bearerToken(req);
    if (!token) return fail(401, "unauthorized", "Sign in again");

    await deleteOldTickets(base44, String(user.id));
    const code = newCode();
    const codeHash = await sha256Hex(code.replace("-", ""));
    await base44.asServiceRole.entities.LaptopSignInTicket.create({
      code_hash: codeHash,
      state,
      access_token: token,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
      used: false,
      user_id: String(user.id),
      email: String(user.email || ""),
      full_name: String(user.full_name || ""),
      role,
    });

    return Response.json(
      { ok: true, code, expiresInSeconds: 600 },
      { status: 200, headers: cors() },
    );
  } catch (error) {
    console.error("laptopSignInCode failed");
    if (!user) return fail(401, "unauthorized", "Sign in again");
    return fail(500, "server_error", "The sign-in code could not be created");
  }
}

function newCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += ALPHABET[byte % ALPHABET.length];
  return raw.slice(0, 4) + "-" + raw.slice(4);
}

async function deleteOldTickets(base44, userId) {
  const rows = await base44.asServiceRole.entities.LaptopSignInTicket.filter({
    user_id: userId,
  });
  const list = Array.isArray(rows) ? rows : [];
  const now = Date.now();
  for (const row of list) {
    const expired = Date.parse(row.expires_at || "") <= now;
    if (!expired && !row.used) continue;
    await base44.asServiceRole.entities.LaptopSignInTicket.update(row.id, {
      access_token: "",
      used: true,
    });
    await base44.asServiceRole.entities.LaptopSignInTicket.delete(row.id);
  }
}

function bearerToken(req) {
  const header = req.headers.get("Authorization") || "";
  const match = /^Bearer\s+(\S+)$/.exec(header);
  return match ? match[1] : "";
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
