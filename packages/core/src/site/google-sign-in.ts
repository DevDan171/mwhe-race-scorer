/**
 * Google sign-in for the laptop.
 *
 * Base44's `loginWithProvider("google", fromUrl)` is a browser redirect. The
 * SDK then reads `access_token` off the query string of `fromUrl`. Base44
 * documents `fromUrl` as a path on the app, and an open redirect that sent
 * that token to other hosts was fixed by restricting the return URL. The
 * laptop therefore never asks Base44 to redirect at 127.0.0.1 or at a custom
 * scheme.
 *
 * The director signs in with Google on MidwestHardEnduro.com. That page asks
 * the site for a short code. The laptop trades the code, plus the state it
 * generated, for that person's access token. The token is not put on the
 * loopback URL.
 */

export const LAPTOP_SIGN_IN_PATH = "/laptop-signin";

/**
 * How long the site keeps a one-time code. Ten minutes, so Google sign-in
 * in the browser can finish and hand the code back without anyone typing it.
 */
export const SIGN_IN_CODE_TTL_SECONDS = 600;

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const STATE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export function isSignInState(value: string): boolean {
  return STATE_PATTERN.test(value);
}

/** 32 random bytes, base64url, with no padding. Safe to put in a browser URL. */
export function createSignInState(): string {
  return base64Url(randomBytes(32));
}

/** Eight unambiguous characters, shown as ABCD-EFGH. The hyphen is optional. */
export function createSignInCode(): string {
  const indexes = randomBytes(8);
  let raw = "";
  for (const byte of indexes) {
    raw += CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? "";
  }
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Compact uppercase code, or null when the text is not one of ours. */
export function normalizeSignInCode(input: string): string | null {
  const compact = input.replace(/[\s-]/g, "").toUpperCase();
  if (compact.length !== 8) return null;
  for (const character of compact) {
    if (!CODE_ALPHABET.includes(character)) return null;
  }
  return compact;
}

export function formatSignInCode(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

/**
 * The only redirect the site page may use. Http, loopback, path /callback,
 * an explicit port, and no userinfo, query, or hash. The token is not carried
 * on this URL; a one-time code is.
 */
export function isAllowedSignInCallback(value: string): boolean {
  if (value.length === 0 || value.length > 256) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  if (url.username !== "" || url.password !== "") return false;
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return false;
  if (url.pathname !== "/callback") return false;
  if (url.search !== "" || url.hash !== "") return false;
  if (url.port === "") return false;
  const port = Number(url.port);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function loopbackCallbackUrl(port: number): string {
  const url = `http://127.0.0.1:${port}/callback`;
  if (!isAllowedSignInCallback(url)) {
    throw new Error("Sign-in callback port is not valid");
  }
  return url;
}

export function buildLaptopSignInPageUrl(options: {
  siteOrigin: string;
  state: string;
  callbackUrl?: string | null;
}): string {
  if (!isSignInState(options.state)) {
    throw new Error("Sign-in could not be started. Try again.");
  }
  let site: URL;
  try {
    site = new URL(options.siteOrigin);
  } catch {
    throw new Error(
      "Site address must be a full URL, like https://midwesthardenduro.com",
    );
  }
  if (site.protocol !== "https:" && site.protocol !== "http:") {
    throw new Error(
      "Site address must be a full URL, like https://midwesthardenduro.com",
    );
  }
  const callback = options.callbackUrl?.trim() ?? "";
  if (callback && !isAllowedSignInCallback(callback)) {
    throw new Error("Sign-in could not be started. Try again.");
  }
  const url = new URL(site.origin);
  url.pathname = LAPTOP_SIGN_IN_PATH;
  url.search = "";
  url.hash = "";
  url.searchParams.set("state", options.state);
  if (callback) url.searchParams.set("callback", callback);
  return url.toString();
}

export type SignInCallback =
  | { ok: true; code: string; state: string }
  | { ok: false; reason: "token" | "incomplete" };

/**
 * Read a loopback redirect. A token on this URL is refused and is not returned,
 * so a caller cannot log it by accident.
 */
export function readSignInCallback(search: string): SignInCallback {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  if (params.has("access_token")) return { ok: false, reason: "token" };
  const code = normalizeSignInCode(params.get("code") ?? "");
  const state = params.get("state") ?? "";
  if (!code || !isSignInState(state)) return { ok: false, reason: "incomplete" };
  return { ok: true, code, state };
}

export interface SignInTicketCheck {
  codeHash: string;
  state: string;
  expiresAtMs: number;
}

/**
 * Same answer for an unknown code, a wrong state, and a mismatching hash.
 * `expired` is only so the server can drop a dead ticket. Callers still
 * answer the laptop with one 401 message.
 */
export function decideSignInTicket(
  ticket: SignInTicketCheck | undefined,
  submittedCodeHash: string,
  submittedState: string,
  nowMs: number,
): "accept" | "expired" | "reject" {
  if (!ticket || !sameSecret(ticket.codeHash, submittedCodeHash)) return "reject";
  if (ticket.expiresAtMs <= nowMs) return "expired";
  if (!isSignInState(submittedState) || !sameSecret(ticket.state, submittedState)) {
    return "reject";
  }
  return "accept";
}

/** Equal-length compare. A different length returns false without walking the rest. */
export function sameSecret(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const source = (
    globalThis as { crypto?: { getRandomValues(bytes: Uint8Array): Uint8Array } }
  ).crypto;
  if (!source) throw new Error("Sign-in could not be started. Try again.");
  source.getRandomValues(bytes);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
