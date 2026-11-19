import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { mockCatalog, touchRacePackage, type MockCatalogEvent } from "./mock-catalog.js";
import type { SeriesRiderUpload } from "./client.js";
import { isHubRole } from "./client.js";
import {
  createSignInCode,
  decideSignInTicket,
  formatSignInCode,
  isAllowedSignInCallback,
  isSignInState,
  normalizeSignInCode,
  SIGN_IN_CODE_TTL_SECONDS,
  type SignInTicketCheck,
} from "./google-sign-in.js";
import { MOCK_ACCOUNTS, type MockAccount } from "./mock-accounts.js";
import { renderGoogleSignInPage, renderSignInResultPage } from "./mock-google-page.js";

export interface MockSite {
  url: string;
  close: () => Promise<void>;
}

interface Session {
  token: string;
  account: MockAccount;
}

interface Ticket extends SignInTicketCheck {
  token: string;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Accept, Content-Type, X-App-Id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/**
 * Local stand-in for MidwestHardEnduro.com sign-in and getRacePackage.
 *
 * Sign in with a test account from `mock-accounts.ts`. The token that comes
 * back belongs to that account. A rider token gets 403 on the race package.
 * There is no shared key.
 */
export function startMockSite(options?: {
  port?: number;
  host?: string;
}): Promise<MockSite> {
  const host = options?.host ?? "127.0.0.1";
  const sessions = new Map<string, Session>();
  const tickets = new Map<string, Ticket>();
  const catalog = mockCatalog();
  const revisions = new Map<string, MockCatalogEvent["racePackage"]>();
  const uploaded: SeriesRiderUpload[] = [];
  const server = createServer((request, response) => {
    void handle(request, response, sessions, tickets, catalog, revisions, uploaded).catch(
      (error: unknown) => {
        if (response.headersSent) return;
        const message = error instanceof Error ? error.message : "Mock site failed";
        writeJson(response, 500, {
          ok: false,
          error: "server_error",
          message,
        });
      },
    );
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options?.port ?? 0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Mock site did not bind a TCP port"));
        return;
      }
      resolve({
        url: `http://${host}:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
  tickets: Map<string, Ticket>,
  catalog: MockCatalogEvent[],
  revisions: Map<string, MockCatalogEvent["racePackage"]>,
  uploaded: SeriesRiderUpload[],
): Promise<void> {
  if (request.method === "OPTIONS") {
    writeJson(response, 204, null);
    return;
  }

  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const login = /^\/api\/apps\/([^/]+)\/auth\/login$/.exec(url.pathname);
  if (login) {
    await handleLogin(request, response, sessions, decodeURIComponent(login[1] ?? ""));
    return;
  }
  const me = /^\/api\/apps\/([^/]+)\/entities\/User\/me$/.exec(url.pathname);
  if (me) {
    handleMe(request, response, sessions);
    return;
  }
  if (url.pathname === "/laptop-signin") {
    handleSignInPage(request, response, url);
    return;
  }
  if (url.pathname === "/laptop-signin/choose") {
    await handleChoose(request, response, sessions, tickets);
    return;
  }
  if (url.pathname === "/functions/laptopSignInCode") {
    await handleIssueCode(request, response, sessions, tickets);
    return;
  }
  if (url.pathname === "/functions/laptopExchangeCode") {
    await handleExchange(request, response, sessions, tickets);
    return;
  }
  if (request.method === "GET" && url.pathname === "/functions/getRacePackage") {
    handlePackage(request, response, sessions, url, catalog, revisions, uploaded);
    return;
  }
  if (request.method === "GET" && url.pathname === "/functions/listEvents") {
    handleEventList(request, response, sessions, catalog, revisions);
    return;
  }
  if (request.method === "POST" && url.pathname === "/functions/uploadSeriesRiders") {
    await handleUploadRiders(request, response, sessions, uploaded);
    return;
  }
  if (request.method === "POST" && url.pathname === "/mock/touch-event") {
    await handleTouch(request, response, sessions, catalog, revisions);
    return;
  }

  writeJson(response, 404, {
    ok: false,
    error: "not_found",
    message: "No function at that path",
  });
}

async function handleLogin(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
  appId: string,
): Promise<void> {
  if (request.method !== "POST") {
    writeJson(response, 404, {
      ok: false,
      error: "not_found",
      message: "Sign-in is a POST",
    });
    return;
  }
  if (!appId.trim()) {
    writeRaw(response, 404, { message: "Unknown app" });
    return;
  }

  const body = await readBody(request);
  const email = stringField(body, "email").trim().toLowerCase();
  const password = stringField(body, "password");
  const account = MOCK_ACCOUNTS.find((candidate) => candidate.email === email);
  if (account && account.password.length === 0) {
    writeRaw(response, 400, { message: "This account has no password" });
    return;
  }
  if (!account || !passwordMatches(account.password, password)) {
    writeRaw(response, 401, { message: "Invalid email or password" });
    return;
  }

  const token = randomBytes(32).toString("hex");
  sessions.set(token, { token, account });
  writeRaw(response, 200, {
    access_token: token,
    user: publicUser(account, appId),
  });
}

function handleSignInPage(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): void {
  if (request.method !== "GET") {
    writeHtml(
      response,
      404,
      renderSignInResultPage({ error: "Open this page from the laptop." }),
    );
    return;
  }
  const state = url.searchParams.get("state") ?? "";
  const callback = url.searchParams.get("callback") ?? "";
  writeHtml(
    response,
    200,
    renderGoogleSignInPage({
      state: isSignInState(state) ? state : "",
      callback: isAllowedSignInCallback(callback) ? callback : "",
      callbackIgnored: callback.trim().length > 0 && !isAllowedSignInCallback(callback),
      accounts: MOCK_ACCOUNTS,
    }),
  );
}

async function handleChoose(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
  tickets: Map<string, Ticket>,
): Promise<void> {
  if (request.method !== "POST") {
    writeHtml(
      response,
      404,
      renderSignInResultPage({ error: "Open this page from the laptop." }),
    );
    return;
  }
  const body = await readBody(request);
  const email = stringField(body, "email").trim().toLowerCase();
  const state = stringField(body, "state").trim();
  const callback = stringField(body, "callback").trim();
  const account = MOCK_ACCOUNTS.find((candidate) => candidate.email === email);
  if (!account || !isSignInState(state)) {
    writeHtml(
      response,
      400,
      renderSignInResultPage({ error: "Open this page from the laptop and try again." }),
    );
    return;
  }
  if (!isHubRole(account.role)) {
    writeHtml(
      response,
      403,
      renderSignInResultPage({
        state,
        error:
          "This account is not a race director or admin. Return to the laptop and use a race director or admin account.",
      }),
    );
    return;
  }
  const issued = issueCode(sessions, tickets, account, state);
  writeHtml(
    response,
    200,
    renderSignInResultPage({
      code: formatSignInCode(issued.code),
      state,
      callback: isAllowedSignInCallback(callback) ? callback : "",
    }),
  );
}

async function handleIssueCode(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
  tickets: Map<string, Ticket>,
): Promise<void> {
  if (request.method !== "POST") {
    writeJson(response, 404, {
      ok: false,
      error: "not_found",
      message: "This function is a POST",
    });
    return;
  }
  const session = sessionFor(request, sessions);
  if (!session) {
    writeJson(response, 401, {
      ok: false,
      error: "unauthorized",
      message: "Sign in again",
    });
    return;
  }
  if (!isHubRole(session.account.role)) {
    writeJson(response, 403, {
      ok: false,
      error: "forbidden",
      message: "This account is not a race director or admin",
    });
    return;
  }
  const body = await readBody(request);
  const state = stringField(body, "state").trim();
  if (!isSignInState(state)) {
    writeJson(response, 400, {
      ok: false,
      error: "missing_state",
      message: "Open the sign-in page from the laptop",
    });
    return;
  }
  const issued = issueCode(sessions, tickets, session.account, state, session.token);
  writeJson(response, 200, {
    ok: true,
    code: formatSignInCode(issued.code),
    expiresInSeconds: SIGN_IN_CODE_TTL_SECONDS,
  });
}

async function handleExchange(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
  tickets: Map<string, Ticket>,
): Promise<void> {
  if (request.method !== "POST") {
    writeJson(response, 404, {
      ok: false,
      error: "not_found",
      message: "This function is a POST",
    });
    return;
  }
  const body = await readBody(request);
  const code = normalizeSignInCode(stringField(body, "code"));
  const state = stringField(body, "state").trim();
  if (!code || !isSignInState(state)) {
    writeJson(response, 401, {
      ok: false,
      error: "unauthorized",
      message: "That code is not valid. Sign in with Google again",
    });
    return;
  }
  const codeHash = hashSignInCode(code);
  const ticket = tickets.get(codeHash);
  const decision = decideSignInTicket(ticket, codeHash, state, Date.now());
  if (decision === "expired" && ticket) tickets.delete(codeHash);
  if (decision !== "accept" || !ticket) {
    writeJson(response, 401, {
      ok: false,
      error: "unauthorized",
      message: "That code is not valid. Sign in with Google again",
    });
    return;
  }
  tickets.delete(codeHash);
  const session = sessions.get(ticket.token);
  if (!session) {
    writeJson(response, 401, {
      ok: false,
      error: "unauthorized",
      message: "That code is not valid. Sign in with Google again",
    });
    return;
  }
  writeJson(response, 200, {
    ok: true,
    access_token: session.token,
    user: publicUser(session.account, "mwhe-local"),
  });
}

function issueCode(
  sessions: Map<string, Session>,
  tickets: Map<string, Ticket>,
  account: MockAccount,
  state: string,
  existingToken?: string,
): { code: string } {
  const token = existingToken ?? randomBytes(32).toString("hex");
  if (!existingToken) sessions.set(token, { token, account });
  const code = normalizeSignInCode(createSignInCode());
  if (!code) throw new Error("Mock site could not make a sign-in code");
  const codeHash = hashSignInCode(code);
  tickets.set(codeHash, {
    codeHash,
    state,
    token,
    expiresAtMs: Date.now() + SIGN_IN_CODE_TTL_SECONDS * 1000,
  });
  return { code };
}

function hashSignInCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function handleMe(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
): void {
  if (request.method !== "GET") {
    writeRaw(response, 404, { message: "Not found" });
    return;
  }
  const session = sessionFor(request, sessions);
  if (!session) {
    writeRaw(response, 401, { message: "Unauthorized" });
    return;
  }
  const appId = headerValue(request, "x-app-id") ?? "mwhe-local";
  writeRaw(response, 200, publicUser(session.account, appId));
}

function handleEventList(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
  catalog: MockCatalogEvent[],
  revisions: Map<string, MockCatalogEvent["racePackage"]>,
): void {
  if (!requireDirector(request, response, sessions)) return;
  const events = catalog.map((entry) => {
    const revised = revisions.get(entry.summary.id);
    if (!revised?.event.updatedAt) return entry.summary;
    return {
      ...entry.summary,
      updatedAt: revised.event.updatedAt,
      raceCount: revised.races.length,
      registrationCount: revised.registrations.length,
    };
  });
  writeJson(response, 200, { ok: true, events });
}

async function handleUploadRiders(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
  uploaded: SeriesRiderUpload[],
): Promise<void> {
  if (!requireDirector(request, response, sessions)) return;
  const body = await readBody(request);
  const riders = Array.isArray((body as { riders?: unknown } | null)?.riders)
    ? ((body as { riders: SeriesRiderUpload[] }).riders ?? [])
    : [];
  if (riders.length === 0) {
    writeJson(response, 400, {
      ok: false,
      error: "missing_riders",
      message: "At least one rider is required",
    });
    return;
  }
  const created = [];
  for (const rider of riders) {
    if (!rider || typeof rider.localId !== "string" || !rider.localId.trim()) {
      writeJson(response, 400, {
        ok: false,
        error: "missing_riders",
        message: "Each rider needs a localId",
      });
      return;
    }
    if (!rider.safetyAcknowledgedAt) {
      writeJson(response, 400, {
        ok: false,
        error: "safety_required",
        message: "A new series rider needs a safety acknowledgement",
      });
      return;
    }
    uploaded.push(rider);
    created.push({ localId: rider.localId, seriesId: rider.localId });
  }
  writeJson(response, 200, { ok: true, created });
}

async function handleTouch(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
  catalog: MockCatalogEvent[],
  revisions: Map<string, MockCatalogEvent["racePackage"]>,
): Promise<void> {
  if (!requireDirector(request, response, sessions)) return;
  const body = await readBody(request);
  const eventId = stringField(body, "eventId");
  const known = catalog.find((entry) => entry.summary.id === eventId);
  if (!known) {
    writeJson(response, 404, {
      ok: false,
      error: "event_not_found",
      message: "No event with id " + eventId,
    });
    return;
  }
  const current = revisions.get(eventId) ?? known.racePackage;
  const next = touchRacePackage(current, new Date().toISOString());
  revisions.set(eventId, next);
  writeJson(response, 200, {
    ok: true,
    eventId,
    updatedAt: next.event.updatedAt ?? null,
  });
}

function requireDirector(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
): Session | null {
  const session = sessionFor(request, sessions);
  if (!session) {
    writeJson(response, 401, {
      ok: false,
      error: "unauthorized",
      message: "Sign in as a race director or admin",
    });
    return null;
  }
  if (!isHubRole(session.account.role)) {
    writeJson(response, 403, {
      ok: false,
      error: "forbidden",
      message: "This account is not a race director or admin",
    });
    return null;
  }
  return session;
}

function handlePackage(
  request: IncomingMessage,
  response: ServerResponse,
  sessions: Map<string, Session>,
  url: URL,
  catalog: MockCatalogEvent[],
  revisions: Map<string, MockCatalogEvent["racePackage"]>,
  uploaded: SeriesRiderUpload[],
): void {
  const session = sessionFor(request, sessions);
  if (!session) {
    writeJson(response, 401, {
      ok: false,
      error: "unauthorized",
      message: "Sign in as a race director or admin",
    });
    return;
  }
  if (!isHubRole(session.account.role)) {
    writeJson(response, 403, {
      ok: false,
      error: "forbidden",
      message: "This account is not a race director or admin",
    });
    return;
  }

  const eventId = url.searchParams.get("eventId")?.trim() ?? "";
  if (!eventId) {
    writeJson(response, 400, {
      ok: false,
      error: "missing_event_id",
      message: "eventId is required",
    });
    return;
  }
  const known = catalog.find((entry) => entry.summary.id === eventId);
  if (!known) {
    writeJson(response, 404, {
      ok: false,
      error: "event_not_found",
      message: `No event with id ${eventId}`,
    });
    return;
  }
  const racePackage = structuredClone(revisions.get(eventId) ?? known.racePackage);
  for (const rider of uploaded) {
    if (racePackage.riders.some((entry) => entry.number === rider.bikeNumber)) continue;
    racePackage.riders.push({
      seriesId: rider.localId,
      name: `${rider.firstName} ${rider.lastName}`.trim(),
      number: rider.bikeNumber,
      class: rider.riderClass,
      updatedAt: rider.safetyAcknowledgedAt,
      dateOfBirth: rider.dateOfBirth,
      phone: rider.phone,
      email: rider.email,
      emergencyContactName: rider.emergencyContactName,
      emergencyContactPhone: rider.emergencyContactPhone,
      emergencyContactRelation: rider.emergencyContactRelation,
      safetyAcknowledged: true,
      safetyAcknowledgedAt: rider.safetyAcknowledgedAt,
    });
  }

  writeJson(response, 200, { ok: true, racePackage });
}

function sessionFor(
  request: IncomingMessage,
  sessions: Map<string, Session>,
): Session | null {
  const token = bearerToken(request);
  if (!token) return null;
  return sessions.get(token) ?? null;
}

function publicUser(account: MockAccount, appId: string) {
  return {
    id: account.id,
    email: account.email,
    full_name: account.name,
    role: account.role,
    app_id: appId,
    is_verified: true,
    disabled: null,
    is_service: false,
    created_date: "2026-01-01T00:00:00.000Z",
    updated_date: "2026-01-01T00:00:00.000Z",
  };
}

function passwordMatches(expected: string, given: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(given);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function bearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  const token = match?.[1]?.trim() ?? "";
  return token.length > 0 ? token : null;
}

function headerValue(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function stringField(body: unknown, key: string): string {
  if (typeof body !== "object" || body === null) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 100_000) {
        reject(new Error("Sign-in body is too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if (!text) {
        resolve(null);
        return;
      }
      const type = String(request.headers["content-type"] ?? "");
      if (type.includes("application/x-www-form-urlencoded")) {
        const record: Record<string, string> = {};
        for (const [key, value] of new URLSearchParams(text)) record[key] = value;
        resolve(record);
        return;
      }
      try {
        resolve(JSON.parse(text) as unknown);
      } catch {
        resolve(null);
      }
    });
    request.on("error", reject);
  });
}

function writeHtml(response: ServerResponse, status: number, html: string): void {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    ...CORS,
  });
  response.end(html);
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = body === null ? "" : JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...CORS,
  });
  response.end(payload);
}

function writeRaw(response: ServerResponse, status: number, body: unknown): void {
  writeJson(response, status, body);
}
