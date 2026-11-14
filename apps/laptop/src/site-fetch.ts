import { isTauri } from "./platform";

/** The Tauri shell uses the native HTTP client so the site does not have to send CORS. */
export async function siteFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!isTauri()) return fetch(input, init);
  const plugin = await import("@tauri-apps/plugin-http");
  return plugin.fetch(input, init);
}
