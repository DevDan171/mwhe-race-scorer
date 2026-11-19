import { loopbackCallbackUrl } from "@mwhe/core";

import { isTauri } from "../platform";

export const SIGN_IN_MESSAGE_SOURCE = "mwhe-laptop-signin";

export interface ManualSignInCode {
  promise: Promise<string>;
  submit: (code: string) => void;
}

export function manualSignInCode(): ManualSignInCode {
  let submit: (code: string) => void = () => undefined;
  const promise = new Promise<string>((resolve) => {
    submit = resolve;
  });
  return { promise, submit };
}

export function abortSignIn(): Error {
  const error = new Error("Sign-in was cancelled");
  error.name = "AbortError";
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * The first code wins. Later failures from the other sources are ignored.
 * A message that carries an access token is ignored.
 */
export function watchSignInMessage(options: {
  siteOrigin: string;
  state: string;
  signal: AbortSignal;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(abortSignIn());
      return;
    }
    const stop = () => window.removeEventListener("message", onMessage);
    const onAbort = () => {
      stop();
      reject(abortSignIn());
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== options.siteOrigin) return;
      const record = asRecord(event.data);
      if (!record || record.source !== SIGN_IN_MESSAGE_SOURCE) return;
      if (record.state !== options.state) return;
      if ("access_token" in record) return;
      if (typeof record.error === "string" && record.error.trim()) {
        stop();
        options.signal.removeEventListener("abort", onAbort);
        const refused = new Error(record.error.trim());
        refused.name = "SignInPageError";
        reject(refused);
        return;
      }
      if (typeof record.code !== "string") return;
      stop();
      options.signal.removeEventListener("abort", onAbort);
      resolve(record.code);
    };
    if (options.signal.aborted) {
      reject(abortSignIn());
      return;
    }
    window.addEventListener("message", onMessage);
    options.signal.addEventListener("abort", onAbort);
  });
}

export async function takeSignInCode(
  sources: Array<Promise<string> | null>,
  signal: AbortSignal,
): Promise<string> {
  const pending = sources
    .filter((source): source is Promise<string> => source !== null)
    .map((source) => stopOnAbort(source, signal));
  for (const source of pending) {
    void source.then(
      () => undefined,
      () => undefined,
    );
  }
  try {
    return await Promise.any(pending);
  } catch (error) {
    if (signal.aborted) throw abortSignIn();
    throw error instanceof Error ? error : new Error("Google sign-in did not finish");
  }
}

function stopOnAbort(promise: Promise<string>, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortSignIn());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error instanceof Error ? error : abortSignIn());
      },
    );
    if (signal.aborted) onAbort();
  });
}

export async function openSignInPage(url: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_sign_in_page", { url });
    return;
  }
  const opened = window.open(url, "mwhe-google-sign-in");
  if (!opened) {
    throw new Error(
      "The browser blocked the sign-in window. Allow pop-ups, or choose Enter a code instead.",
    );
  }
}

export async function startLoopbackSignIn(state: string): Promise<{
  callbackUrl: string;
  code: Promise<string>;
  cancel: () => void;
}> {
  const { invoke } = await import("@tauri-apps/api/core");
  const port = await invoke<number>("start_sign_in_callback", { state });
  return {
    callbackUrl: loopbackCallbackUrl(port),
    code: invoke<string>("wait_sign_in_callback"),
    cancel: () => {
      void invoke("cancel_sign_in_callback");
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}
