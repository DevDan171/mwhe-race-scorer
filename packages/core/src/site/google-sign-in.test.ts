import { describe, expect, it } from "vitest";

import { exchangeSignInCode, signInWithPassword } from "./client.js";
import {
  buildLaptopSignInPageUrl,
  createSignInState,
  decideSignInTicket,
  isAllowedSignInCallback,
  loopbackCallbackUrl,
  normalizeSignInCode,
  readSignInCallback,
  sameSecret,
} from "./google-sign-in.js";
import {
  MOCK_APP_ID,
  MOCK_DIRECTOR,
  MOCK_GOOGLE_DIRECTOR,
  MOCK_RIDER,
} from "./mock-accounts.js";
import { startMockSite } from "./mock-server.js";

describe("sign-in callback rules", () => {
  it("allows a loopback callback and refuses anything else", () => {
    expect(isAllowedSignInCallback(loopbackCallbackUrl(8788))).toBe(true);
    expect(isAllowedSignInCallback("http://localhost:8788/callback")).toBe(true);
    expect(isAllowedSignInCallback("http://127.0.0.1/callback")).toBe(false);
    expect(isAllowedSignInCallback("https://127.0.0.1:8788/callback")).toBe(false);
    expect(isAllowedSignInCallback("http://127.0.0.1:8788/callback/")).toBe(false);
    expect(isAllowedSignInCallback("http://127.0.0.1:8788/callback?code=1")).toBe(false);
    expect(isAllowedSignInCallback("http://user@127.0.0.1:8788/callback")).toBe(false);
    expect(isAllowedSignInCallback("http://127.0.0.1.evil.test:8788/callback")).toBe(
      false,
    );
    expect(isAllowedSignInCallback("http://evil.test/callback")).toBe(false);
    expect(isAllowedSignInCallback("mwhe://callback")).toBe(false);
    expect(() => loopbackCallbackUrl(0)).toThrow(/port/i);
  });

  it("builds a site page URL and will not attach a foreign callback", () => {
    const state = createSignInState();
    const url = new URL(
      buildLaptopSignInPageUrl({
        siteOrigin: "https://midwesthardenduro.com/ignored",
        state,
        callbackUrl: "http://127.0.0.1:9/callback",
      }),
    );
    expect(url.origin).toBe("https://midwesthardenduro.com");
    expect(url.pathname).toBe("/laptop-signin");
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("callback")).toBe("http://127.0.0.1:9/callback");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(() =>
      buildLaptopSignInPageUrl({
        siteOrigin: "https://midwesthardenduro.com",
        state,
        callbackUrl: "https://evil.test/callback",
      }),
    ).toThrow(/could not be started/i);
  });

  it("reads a code from the loopback URL and refuses a token", () => {
    const state = createSignInState();
    expect(readSignInCallback(`?code=ab12-cd34&state=${state}`)).toEqual({
      ok: false,
      reason: "incomplete",
    });
    expect(readSignInCallback(`?code=ABCD-EFGH&state=${state}`)).toEqual({
      ok: true,
      code: "ABCDEFGH",
      state,
    });
    expect(normalizeSignInCode(" abcd efgh ")).toBe("ABCDEFGH");
    const leaked = readSignInCallback(
      `?code=ABCD-EFGH&state=${state}&access_token=secret-token`,
    );
    expect(leaked).toEqual({ ok: false, reason: "token" });
    expect(JSON.stringify(leaked)).not.toContain("secret-token");
  });

  it("accepts a ticket once and treats a wrong state like a missing code", () => {
    const state = createSignInState();
    const ticket = {
      codeHash: "a".repeat(64),
      state,
      expiresAtMs: 5_000,
    };
    expect(decideSignInTicket(ticket, ticket.codeHash, state, 4_999)).toBe("accept");
    expect(decideSignInTicket(ticket, ticket.codeHash, state, 5_000)).toBe("expired");
    expect(decideSignInTicket(ticket, ticket.codeHash, createSignInState(), 1)).toBe(
      "reject",
    );
    expect(decideSignInTicket(undefined, ticket.codeHash, state, 1)).toBe("reject");
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("abc", "abc")).toBe(true);
  });
});

describe("mock Google sign-in", () => {
  it("shows a code for a director and will not redirect the token off the machine", async () => {
    const site = await startMockSite();
    try {
      const state = createSignInState();
      const callback = "http://127.0.0.1:9/callback";
      const page = await fetch(
        `${site.url}/laptop-signin?state=${state}&callback=${encodeURIComponent(callback)}&access_token=should-not-appear`,
      );
      const picker = await page.text();
      expect(page.status).toBe(200);
      expect(picker).toContain("Continue as Dana Director");
      expect(picker).toContain("google-rd@example.com");
      expect(picker).not.toContain("should-not-appear");
      expect(picker).not.toContain("race-day-local");

      const chosen = await fetch(`${site.url}/laptop-signin/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          email: MOCK_DIRECTOR.email,
          state,
          callback,
        }),
      });
      const html = await chosen.text();
      expect(chosen.status).toBe(200);
      const code = /id="code">([^<]+)</.exec(html)?.[1] ?? "";
      expect(normalizeSignInCode(code)).toHaveLength(8);
      const href = /id="return" href="([^"]+)"/.exec(html)?.[1] ?? "";
      const redirect = new URL(href.replaceAll("&amp;", "&"));
      expect(redirect.origin).toBe("http://127.0.0.1:9");
      expect(redirect.pathname).toBe("/callback");
      expect(redirect.searchParams.has("access_token")).toBe(false);
      expect(readSignInCallback(redirect.search)).toEqual({
        ok: true,
        code: normalizeSignInCode(code),
        state,
      });
      expect(html).not.toContain("access_token");
      expect(html).toContain("mwhe-laptop-signin");

      const session = await exchangeSignInCode({
        baseUrl: site.url,
        code,
        state,
      });
      expect(session.account).toMatchObject({
        email: MOCK_DIRECTOR.email,
        role: "race_director",
      });
      expect(html).not.toContain(session.token);
      expect(session.token).not.toBe(code);

      await expect(
        exchangeSignInCode({ baseUrl: site.url, code, state }),
      ).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    } finally {
      await site.close();
    }
  });

  it("ignores a callback that is not loopback and refuses a rider", async () => {
    const site = await startMockSite();
    try {
      const state = createSignInState();
      const chosen = await fetch(`${site.url}/laptop-signin/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: MOCK_DIRECTOR.email,
          state,
          callback: "https://evil.test/steal",
        }),
      });
      const html = await chosen.text();
      expect(html).not.toContain("evil.test");
      expect(html).not.toContain('id="return"');
      expect(html).toContain('id="code"');

      const rider = await fetch(`${site.url}/laptop-signin/choose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: MOCK_RIDER.email,
          state,
          callback: "http://127.0.0.1:9/callback",
        }),
      });
      const riderHtml = await rider.text();
      expect(rider.status).toBe(403);
      expect(riderHtml).toContain("not a race director");
      expect(riderHtml).toContain("mwhe-laptop-signin");
      expect(riderHtml).not.toContain('id="code"');
      expect(riderHtml).not.toContain("127.0.0.1:9");
      expect(riderHtml).not.toContain("access_token");
    } finally {
      await site.close();
    }
  });

  it("exchanges a code for the same token and keeps a wrong state from burning it", async () => {
    const site = await startMockSite();
    try {
      const password = await signInWithPassword({
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        email: MOCK_GOOGLE_DIRECTOR.email,
        password: "not-a-password",
      }).catch((error: unknown) => error);
      expect(password).toMatchObject({ status: 400, code: "no_password" });
      expect(JSON.stringify(password)).not.toContain("not-a-password");

      const director = await signInWithPassword({
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        email: MOCK_DIRECTOR.email,
        password: MOCK_DIRECTOR.password,
      });
      const state = createSignInState();
      const issued = await fetch(`${site.url}/functions/laptopSignInCode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${director.token}`,
        },
        body: JSON.stringify({ state }),
      });
      const issuedBody = (await issued.json()) as { ok: boolean; code: string };
      expect(issued.status).toBe(200);
      expect(JSON.stringify(issuedBody)).not.toContain(director.token);
      expect(issuedBody.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);

      await expect(
        exchangeSignInCode({
          baseUrl: site.url,
          code: issuedBody.code,
          state: createSignInState(),
        }),
      ).rejects.toMatchObject({ status: 401 });

      const exchanged = await exchangeSignInCode({
        baseUrl: site.url,
        code: issuedBody.code,
        state,
      });
      expect(exchanged.token).toBe(director.token);

      const rider = await signInWithPassword({
        baseUrl: site.url,
        appId: MOCK_APP_ID,
        email: MOCK_RIDER.email,
        password: MOCK_RIDER.password,
      });
      const riderIssue = await fetch(`${site.url}/functions/laptopSignInCode`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${rider.token}`,
        },
        body: JSON.stringify({ state }),
      });
      const riderBody = await riderIssue.text();
      expect(riderIssue.status).toBe(403);
      expect(riderBody).not.toContain(rider.token);
    } finally {
      await site.close();
    }
  });
});
