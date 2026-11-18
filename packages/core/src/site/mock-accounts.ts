/**
 * Accounts for `pnpm mock:site` only. They are not MidwestHardEnduro.com
 * accounts, and the password is not a secret.
 */
export interface MockAccount {
  id: string;
  email: string;
  password: string;
  role: "race_director" | "admin" | "user";
  name: string;
}

export const MOCK_SITE_ORIGIN = "http://127.0.0.1:8787";

/** Any non-empty app id works on the mock. This is the one the dev screen fills in. */
export const MOCK_APP_ID = "mwhe-local";

/**
 * External apps log in here. The SDK's default `serverUrl` is this origin.
 * The mock site is the exception: sign-in stays on 127.0.0.1.
 */
export const BASE44_AUTH_ORIGIN = "https://base44.app";

export const MOCK_DIRECTOR: MockAccount = {
  id: "user-rd",
  email: "rd@example.com",
  password: "race-day-local",
  role: "race_director",
  name: "Dana Director",
};

export const MOCK_ADMIN: MockAccount = {
  id: "user-admin",
  email: "admin@example.com",
  password: "race-day-local",
  role: "admin",
  name: "Alex Admin",
};

export const MOCK_RIDER: MockAccount = {
  id: "user-rider",
  email: "rider@example.com",
  password: "race-day-local",
  role: "user",
  name: "Riley Rider",
};

export const MOCK_ACCOUNTS: readonly MockAccount[] = [
  MOCK_DIRECTOR,
  MOCK_ADMIN,
  MOCK_RIDER,
];

const LOCAL_AUTH_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * Live sign-in goes to Base44. The local mock answers on its own origin so
 * `pnpm mock:site` does not need a network.
 */
export function authOriginFor(siteBaseUrl: string): string {
  const url = new URL(siteBaseUrl);
  if (LOCAL_AUTH_HOSTS.has(url.hostname)) return url.origin;
  return BASE44_AUTH_ORIGIN;
}
