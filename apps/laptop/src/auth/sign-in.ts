import type { CredentialStore } from "./credentials.js";

export class SignInError extends Error {
  readonly code: "empty_token" | "device_code_unavailable";

  constructor(code: "empty_token" | "device_code_unavailable", message: string) {
    super(message);
    this.name = "SignInError";
    this.code = code;
  }
}

export type SignInMethod =
  { kind: "pasted_token"; token: string } | { kind: "device_code"; deviceCode: string };

/**
 * The only working method is token paste. Device-code exchange stays on the
 * type so a Base44 sign-in endpoint can be added without changing callers.
 * See docs/site-api.md.
 */
export async function completeSignIn(
  credentials: CredentialStore,
  method: SignInMethod,
): Promise<void> {
  if (method.kind === "device_code") {
    throw new SignInError(
      "device_code_unavailable",
      "Device-code sign-in is not available. Paste a bearer token from the site.",
    );
  }
  const token = method.token.trim();
  if (!token) {
    throw new SignInError("empty_token", "Paste a bearer token from your sign-in.");
  }
  await credentials.writeToken(token);
}
