import {
  assertHubAccess,
  exchangeSignInCode,
  getRacePackage,
  getSignedInUser,
  isHubRole,
  signInWithPassword,
  SiteApiError,
  type RacePackage,
  type SignedInSession,
  type SiteAccount,
} from "@mwhe/core";

import type { CredentialStore } from "./credentials.js";

export class SignInError extends Error {
  readonly code: "forbidden_role" | "session_expired" | "signed_out" | "credential_store";

  constructor(
    code: "forbidden_role" | "session_expired" | "signed_out" | "credential_store",
    message: string,
  ) {
    super(message);
    this.name = "SignInError";
    this.code = code;
  }
}

export interface PasswordSignIn {
  baseUrl: string;
  appId: string;
  email: string;
  password: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Ask the site for this person's token, keep it only when the role is
 * race_director or admin, and return the account to show on screen.
 * The password is not written to the credential store.
 */
export async function completeSignIn(
  credentials: CredentialStore,
  input: PasswordSignIn,
): Promise<SiteAccount> {
  return keepHubSession(credentials, await signInWithPassword(input));
}

export interface GoogleSignIn {
  baseUrl: string;
  code: string;
  state: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Trade the one-time code from the website for this person's token. The role
 * check matches email sign-in. The code is not stored.
 */
export async function completeGoogleSignIn(
  credentials: CredentialStore,
  input: GoogleSignIn,
): Promise<SiteAccount> {
  return keepHubSession(credentials, await exchangeSignInCode(input));
}

async function keepHubSession(
  credentials: CredentialStore,
  session: SignedInSession,
): Promise<SiteAccount> {
  try {
    assertHubAccess(session.account);
  } catch (error) {
    if (error instanceof SiteApiError && error.status === 403) {
      throw new SignInError("forbidden_role", error.message);
    }
    throw error;
  }
  await credentials.writeToken(session.token);
  const stored = await credentials.readToken();
  if (stored !== session.token) {
    await credentials.clearToken();
    throw new SignInError(
      "credential_store",
      "The sign-in token was not saved in Windows Credential Manager. The event list cannot load until it is. Sign in again.",
    );
  }
  return session.account;
}

export type SessionCheck =
  | { kind: "ok"; account: SiteAccount }
  | { kind: "keep" }
  | { kind: "reject"; code: "session_expired" | "forbidden_role"; message: string };

/**
 * Ask the site who the saved token belongs to.
 * A network failure keeps the saved sign-in so race day still works offline.
 * A 401 or a role that is no longer allowed clears nothing by itself; the
 * caller drops the token.
 */
export async function confirmSession(input: {
  baseUrl: string;
  appId: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}): Promise<SessionCheck> {
  try {
    const account = await getSignedInUser(input);
    if (!isHubRole(account.role)) {
      return {
        kind: "reject",
        code: "forbidden_role",
        message:
          "This account is not a race director or admin. Sign in with a race director or admin account. The race already on this laptop is still here.",
      };
    }
    return { kind: "ok", account };
  } catch (error) {
    if (error instanceof SiteApiError && error.status === 401) {
      return {
        kind: "reject",
        code: "session_expired",
        message:
          "That sign-in expired or was revoked. Sign in again. The race already on this laptop is still here.",
      };
    }
    return { kind: "keep" };
  }
}

export async function dropRejectedSession(
  credentials: CredentialStore,
  check: SessionCheck,
): Promise<void> {
  if (check.kind === "reject") await credentials.clearToken();
}

/**
 * Download a race package with the saved token. An expired, revoked, or
 * no-longer-allowed token is deleted. The caller leaves the race in place.
 */
export async function downloadRacePackage(
  credentials: CredentialStore,
  input: { baseUrl: string; eventId: string; fetch?: typeof globalThis.fetch },
): Promise<RacePackage> {
  const token = await credentials.readToken();
  if (!token) {
    throw new SignInError("signed_out", "Sign in before downloading.");
  }
  try {
    return await getRacePackage({ ...input, token });
  } catch (error) {
    if (error instanceof SiteApiError && (error.status === 401 || error.status === 403)) {
      await credentials.clearToken();
      if (error.status === 403) {
        throw new SignInError(
          "forbidden_role",
          "This account is not a race director or admin. The race already on this laptop is still here.",
        );
      }
      throw new SignInError(
        "session_expired",
        "That sign-in expired or was revoked. Sign in again. The race already on this laptop is still here.",
      );
    }
    throw error;
  }
}
