import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

const STATE_KEY = "mwhe_laptop_state";
const CALLBACK_KEY = "mwhe_laptop_callback";
const PENDING_KEY = "mwhe_laptop_pending";

export default function LaptopSignIn() {
  const [message, setMessage] = useState("Checking sign-in…");
  const [code, setCode] = useState("");
  const [account, setAccount] = useState(null);

  useEffect(() => {
    const clean = new URL(window.location.href);
    if (clean.searchParams.has("access_token")) {
      clean.searchParams.delete("access_token");
      clean.searchParams.delete("is_new_user");
      window.history.replaceState({}, "", clean.pathname + clean.search + clean.hash);
    }
    const params = clean.searchParams;
    if (params.get("state")) sessionStorage.setItem(STATE_KEY, params.get("state"));
    if (params.has("callback")) {
      sessionStorage.setItem(CALLBACK_KEY, params.get("callback") || "");
    }
    void run();
  }, []);

  async function run() {
    const state = sessionStorage.getItem(STATE_KEY) || "";
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(state)) {
      setMessage("Open this page from MWHE Race Scorer.");
      return;
    }
    let user = null;
    try {
      user = await base44.auth.me();
    } catch (error) {
      user = null;
    }
    if (!user) {
      sessionStorage.setItem(PENDING_KEY, "1");
      base44.auth.loginWithProvider("google", "/laptop-signin");
      return;
    }
    setAccount(user);
    // Already signed in, including the return from Google. Hand the code
    // back immediately. Do not wait for a Continue click.
    await issue(state);
  }

  async function issue(state) {
    setMessage("Making a code for the laptop…");
    try {
      const raw = await base44.functions.invoke("laptopSignInCode", { state });
      const body = raw && raw.data && raw.data.ok !== undefined ? raw.data : raw;
      if (!body || body.ok !== true || typeof body.code !== "string") {
        const text = (body && body.message) || "The sign-in code could not be created";
        setMessage(text);
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            { source: "mwhe-laptop-signin", state, error: text },
            "*",
          );
        }
        return;
      }
      sessionStorage.removeItem(PENDING_KEY);
      setCode(body.code);
      setMessage("You can close this window. MWHE Race Scorer will finish signing in.");
      const handoff = { source: "mwhe-laptop-signin", code: body.code, state };
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(handoff, "*");
      }
      const callback = allowedCallback(sessionStorage.getItem(CALLBACK_KEY) || "");
      if (callback) {
        const next = new URL(callback);
        next.searchParams.set("code", body.code);
        next.searchParams.set("state", state);
        window.setTimeout(() => window.location.replace(next.toString()), 400);
      }
    } catch (error) {
      const text = (error && error.data && error.data.message) || error.message;
      const sentence = text || "The sign-in code could not be created";
      setMessage(sentence);
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          { source: "mwhe-laptop-signin", state, error: sentence },
          "*",
        );
      }
    }
  }

  async function useDifferentAccount() {
    sessionStorage.setItem(PENDING_KEY, "1");
    base44.auth.logout("/laptop-signin");
  }

  return (
    <main>
      <h1>Sign in to the race laptop</h1>
      <p>{message}</p>
      {account && !code ? (
        <p>
          Signed in as {account.email} ({account.role}).
        </p>
      ) : null}
      {code ? (
        <p>
          Trouble signing in? The code is <strong>{code}</strong>. It works once and lasts
          ten minutes.
        </p>
      ) : null}
      {account && !code ? (
        <p>
          <button
            type="button"
            onClick={() => void issue(sessionStorage.getItem(STATE_KEY) || "")}
          >
            Continue
          </button>
          <button type="button" onClick={() => void useDifferentAccount()}>
            Use a different Google account
          </button>
        </p>
      ) : null}
    </main>
  );
}

function allowedCallback(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return "";
    if (url.username || url.password) return "";
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return "";
    if (url.pathname !== "/callback") return "";
    if (url.search || url.hash) return "";
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return "";
    return url.toString();
  } catch (error) {
    return "";
  }
}
