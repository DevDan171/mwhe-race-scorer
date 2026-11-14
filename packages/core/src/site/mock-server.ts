import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  createSampleRacePackage,
  SAMPLE_EVENT_ID,
} from "../fixtures/sample-race-package.js";

export interface MockSite {
  url: string;
  close: () => Promise<void>;
}

/**
 * Local stand-in for MidwestHardEnduro.com.
 *
 * Any non-empty bearer token is accepted so a developer can paste one.
 * The token `forbidden`, or any token that starts with `deny:`, is treated
 * as a signed-in user who is not a race director or admin.
 * There is no shared key in this server.
 */
export function startMockSite(options?: {
  port?: number;
  host?: string;
}): Promise<MockSite> {
  const host = options?.host ?? "127.0.0.1";
  const server = createServer((request, response) => {
    handle(request, response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options?.port ?? 0, host, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Mock site did not bind a TCP port"));
        return;
      }
      resolve({
        url: `http://${host}:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => (error ? closeReject(error) : closeResolve()));
          }),
      });
    });
  });
}

function handle(request: IncomingMessage, response: ServerResponse): void {
  if (request.method === "OPTIONS") {
    writeJson(response, 204, null);
    return;
  }

  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method !== "GET" || url.pathname !== "/functions/getRacePackage") {
    writeJson(response, 404, {
      ok: false,
      error: "not_found",
      message: "No function at that path",
    });
    return;
  }

  const token = bearerToken(request);
  if (!token) {
    writeJson(response, 401, {
      ok: false,
      error: "unauthorized",
      message: "Sign in as a race director or admin",
    });
    return;
  }
  if (token === "forbidden" || token.startsWith("deny:")) {
    writeJson(response, 403, {
      ok: false,
      error: "forbidden",
      message: "This account is not a race director or admin",
    });
    return;
  }

  const eventId = url.searchParams.get("eventId")?.trim() ?? "";
  if (!eventId) {
    writeJson(response, 400, {
      ok: false,
      error: "missing_event_id",
      message: "eventId is required",
    });
    return;
  }
  if (eventId !== SAMPLE_EVENT_ID) {
    writeJson(response, 404, {
      ok: false,
      error: "event_not_found",
      message: `No event with id ${eventId}`,
    });
    return;
  }

  writeJson(response, 200, {
    ok: true,
    racePackage: createSampleRacePackage(),
  });
}

function bearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(\S.*)$/i.exec(header);
  const token = match?.[1]?.trim() ?? "";
  return token.length > 0 ? token : null;
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = body === null ? "" : JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Accept, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  });
  response.end(payload);
}
