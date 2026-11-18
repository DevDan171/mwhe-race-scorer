import { racePackageSchema, type RacePackage } from "../schemas/race-package.js";
import { z } from "zod";

import { authOriginFor } from "./mock-accounts.js";

export const siteErrorSchema = z.strictObject({
  ok: z.literal(false),
  error: z.string().min(1),
  message: z.string().min(1),
});

export const getRacePackageResponseSchema = z.strictObject({
  ok: z.literal(true),
  racePackage: racePackageSchema,
});

const base44UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(1),
  full_name: z.string().nullable().optional(),
  role: z.string().min(1),
});

const loginResponseSchema = z.object({
  access_token: z.string().min(1),
  user: base44UserSchema,
});

export type SiteErrorBody = z.infer<typeof siteErrorSchema>;
export type GetRacePackageResponse = z.infer<typeof getRacePackageResponseSchema>;

export const HUB_ROLES = ["race_director", "admin"] as const;
export type HubRole = (typeof HUB_ROLES)[number];

/** The signed-in person. The token is stored separately and is not part of this. */
export interface SiteAccount {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export interface SignedInSession {
  token: string;
  account: SiteAccount;
}

export const siteAccountSchema = z.object({
  userId: z.string().min(1),
  email: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
});

export class SiteApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "SiteApiError";
    this.status = status;
    this.code = code;
  }
}

export function isHubRole(role: string): role is HubRole {
  const normalized = role.trim().toLowerCase();
  return normalized === "race_director" || normalized === "admin";
}

/** Reject a signed-in rider or anyone else who is not a race director or admin. */
export function assertHubAccess(account: SiteAccount): void {
  if (!isHubRole(account.role)) {
    throw new SiteApiError(
      403,
      "forbidden",
      "This account is not a race director or admin",
    );
  }
}

export interface GetRacePackageOptions {
  baseUrl: string;
  eventId: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}

export interface SignInOptions {
  baseUrl: string;
  appId: string;
  email: string;
  password: string;
  fetch?: typeof globalThis.fetch;
}

export interface GetSignedInUserOptions {
  baseUrl: string;
  appId: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * GET {baseUrl}/functions/getRacePackage?eventId=...
 * Authorization: Bearer <token>
 *
 * The token is the access token from that user's email sign-in. It is not a
 * shared key, and it is never put on the query string.
 */
export async function getRacePackage(
  options: GetRacePackageOptions,
): Promise<RacePackage> {
  const token = options.token.trim();
  if (!token) {
    throw new SiteApiError(
      401,
      "unauthorized",
      "A race director or admin sign-in is required",
    );
  }
  const eventId = options.eventId.trim();
  if (!eventId) {
    throw new SiteApiError(400, "missing_event_id", "An event id is required");
  }

  const url = new URL(options.baseUrl);
  url.pathname = "/functions/getRacePackage";
  url.search = "";
  url.hash = "";
  url.searchParams.set("eventId", eventId);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    throw new SiteApiError(0, "network", networkMessage(error));
  }

  const body: unknown = await readJson(response);
  if (!response.ok || !isOk(body)) {
    const parsed = siteErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new SiteApiError(
        response.status || 500,
        parsed.data.error,
        parsed.data.message,
      );
    }
    throw new SiteApiError(
      response.status || 500,
      "bad_response",
      `The site returned HTTP ${response.status || "error"} without an error envelope`,
    );
  }

  const parsed = getRacePackageResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new SiteApiError(
      502,
      "invalid_package",
      "The site returned a race package this version of the scorer cannot read",
    );
  }
  return parsed.data.racePackage;
}

/**
 * POST {authOrigin}/api/apps/{appId}/auth/login
 *
 * This is the call `base44.auth.loginViaEmailPassword` makes. The password is
 * sent once in the body and is not stored. The returned token belongs to that
 * user. Call `assertHubAccess` before keeping it.
 */
export async function signInWithPassword(
  options: SignInOptions,
): Promise<SignedInSession> {
  const email = options.email.trim().toLowerCase();
  const password = options.password;
  const appId = options.appId.trim();
  if (!email || !password) {
    throw new SiteApiError(
      401,
      "unauthorized",
      "Enter the email and password for your MidwestHardEnduro.com account",
    );
  }
  if (!appId) {
    throw new SiteApiError(
      400,
      "missing_app_id",
      "An app id is required. It is in the Base44 editor URL, between /apps/ and /editor/",
    );
  }

  const url = authUrl(options.baseUrl, appId, "login");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-App-Id": appId,
      },
      body: JSON.stringify({ email, password }),
    });
  } catch (error) {
    throw new SiteApiError(0, "network", networkMessage(error));
  }

  const body: unknown = await readJson(response);
  if (!response.ok) {
    throw loginFailure(response.status, body);
  }
  const parsed = loginResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new SiteApiError(
      502,
      "bad_response",
      "The site signed in but did not return an access token",
    );
  }
  return {
    token: parsed.data.access_token.trim(),
    account: toAccount(parsed.data.user),
  };
}

/**
 * GET {authOrigin}/api/apps/{appId}/entities/User/me
 *
 * This is the call `base44.auth.me` makes. A 401 means the token is expired
 * or revoked. A network failure is not the same thing.
 */
export async function getSignedInUser(
  options: GetSignedInUserOptions,
): Promise<SiteAccount> {
  const token = options.token.trim();
  const appId = options.appId.trim();
  if (!token) {
    throw new SiteApiError(401, "unauthorized", "Sign in again");
  }
  if (!appId) {
    throw new SiteApiError(
      400,
      "missing_app_id",
      "An app id is required. It is in the Base44 editor URL, between /apps/ and /editor/",
    );
  }

  const url = authUrl(options.baseUrl, appId, "me");
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "X-App-Id": appId,
      },
    });
  } catch (error) {
    throw new SiteApiError(0, "network", networkMessage(error));
  }

  const body: unknown = await readJson(response);
  if (response.status === 401) {
    throw new SiteApiError(
      401,
      "unauthorized",
      "That sign-in expired or was revoked. Sign in again",
    );
  }
  if (!response.ok) {
    throw new SiteApiError(
      response.status || 500,
      "bad_response",
      "The site did not confirm this sign-in",
    );
  }
  const parsed = base44UserSchema.safeParse(body);
  if (!parsed.success) {
    throw new SiteApiError(502, "bad_response", "The site did not confirm this sign-in");
  }
  return toAccount(parsed.data);
}

function authUrl(siteBaseUrl: string, appId: string, kind: "login" | "me"): URL {
  let origin: string;
  try {
    origin = authOriginFor(siteBaseUrl);
  } catch {
    throw new SiteApiError(
      400,
      "bad_site",
      "Site address must be a full URL, like https://midwesthardenduro.com",
    );
  }
  const url = new URL(origin);
  const encoded = encodeURIComponent(appId);
  url.pathname =
    kind === "login"
      ? `/api/apps/${encoded}/auth/login`
      : `/api/apps/${encoded}/entities/User/me`;
  url.search = "";
  url.hash = "";
  return url;
}

function toAccount(user: z.infer<typeof base44UserSchema>): SiteAccount {
  const role = user.role.trim().toLowerCase();
  const name = user.full_name?.trim() || user.email.trim();
  return {
    userId: user.id.trim(),
    email: user.email.trim(),
    name,
    role,
  };
}

function loginFailure(status: number, body: unknown): SiteApiError {
  if (status === 401) {
    return new SiteApiError(401, "unauthorized", "That email or password is not right");
  }
  if (status === 403) {
    return new SiteApiError(
      403,
      "email_unverified",
      "This email is not verified yet. Finish sign-in on MidwestHardEnduro.com, then try again",
    );
  }
  if (status === 404) {
    return new SiteApiError(
      404,
      "sign_in_unavailable",
      "Sign-in was not found. Check the app id from the Base44 editor URL",
    );
  }
  if (status === 429) {
    return new SiteApiError(
      429,
      "rate_limited",
      "Too many sign-in attempts. Wait a minute and try again",
    );
  }
  const detail = messageFromBody(body);
  return new SiteApiError(
    status || 500,
    "server_error",
    detail ?? "The site could not sign you in",
  );
}

function messageFromBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;
  if (typeof record.message === "string" && record.message.trim()) {
    return record.message.trim();
  }
  const error = record.error;
  if (typeof error === "object" && error !== null) {
    const nested = (error as { message?: unknown }).message;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isOk(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "ok" in body &&
    (body as { ok: unknown }).ok === true
  );
}

function networkMessage(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return "The site did not answer. A race already on this laptop still works offline";
  }
  return error instanceof Error ? error.message : "Network request failed";
}
