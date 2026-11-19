import type { MockAccount } from "./mock-accounts.js";

export function renderGoogleSignInPage(input: {
  state: string;
  callback: string;
  callbackIgnored: boolean;
  accounts: readonly MockAccount[];
}): string {
  const ready = input.state.length > 0;
  const accounts = ready
    ? input.accounts
        .map((account) => {
          const kind =
            account.password.length === 0
              ? "Google account, no password"
              : account.role === "race_director"
                ? "Race director"
                : account.role === "admin"
                  ? "Admin"
                  : "Rider, the laptop will refuse this";
          return `<form method="post" action="/laptop-signin/choose">
  <input type="hidden" name="state" value="${escapeHtml(input.state)}" />
  <input type="hidden" name="callback" value="${escapeHtml(input.callback)}" />
  <input type="hidden" name="email" value="${escapeHtml(account.email)}" />
  <button type="submit">Continue as ${escapeHtml(account.name)}</button>
  <span>${escapeHtml(account.email)} · ${escapeHtml(kind)}</span>
</form>`;
        })
        .join("\n")
    : "<p>Open this page from MWHE Race Scorer.</p>";
  const ignored = input.callbackIgnored
    ? "<p>The return address was ignored. Type the code into the laptop.</p>"
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="referrer" content="no-referrer" />
  <title>Sign in with Google (local mock)</title>
</head>
<body>
  <h1>Sign in with Google</h1>
  <p>This stand-in is not Google. Pick the MidwestHardEnduro.com account to use on the laptop.</p>
  ${ignored}
  ${accounts}
</body>
</html>`;
}

export function renderSignInResultPage(input: {
  code?: string;
  state?: string;
  callback?: string;
  error?: string;
}): string {
  if (!input.code || !input.state) {
    const notice = JSON.stringify({
      source: "mwhe-laptop-signin",
      state: input.state ?? "",
      error: input.error ?? "Try again from the laptop.",
    }).replaceAll("<", "\\u003c");
    const script = input.state
      ? `<script>
    const notice = ${notice};
    if (notice.state && window.opener && !window.opener.closed) {
      window.opener.postMessage(notice, "*");
    }
  </script>`
      : "";
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><title>Sign in with Google (local mock)</title></head>
<body><h1>Sign-in did not finish</h1><p>${escapeHtml(input.error ?? "Try again from the laptop.")}</p>${script}</body>
</html>`;
  }
  const callback = input.callback ?? "";
  let redirect = "";
  if (callback) {
    const next = new URL(callback);
    next.searchParams.set("code", input.code);
    next.searchParams.set("state", input.state);
    redirect = next.toString();
  }
  const handoff = JSON.stringify({
    code: input.code,
    state: input.state,
  }).replaceAll("<", "\\u003c");
  const link = redirect
    ? `<p><a id="return" href="${escapeHtml(redirect)}">Return to the laptop</a></p>`
    : "<p>Type the code into the laptop. This page will not open another address.</p>";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="referrer" content="no-referrer" />
  <title>Code for the laptop</title>
</head>
<body>
  <h1>You can close this window</h1>
  <p>MWHE Race Scorer will finish signing in. Nothing else to copy.</p>
  <p>Trouble signing in? The code is <strong id="code">${escapeHtml(input.code)}</strong>. It works once and lasts ten minutes.</p>
  ${link}
  <script>
    const handoff = ${handoff};
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { source: "mwhe-laptop-signin", code: handoff.code, state: handoff.state },
        "*",
      );
    }
    const link = document.getElementById("return");
    if (link instanceof HTMLAnchorElement) {
      window.setTimeout(() => window.location.replace(link.href), 400);
    }
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
