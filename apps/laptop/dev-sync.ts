import type { Connect, Plugin, ViteDevServer } from "vite";

import type { SyncHost } from "./src/sync/host";

const DEV_URL = "http://127.0.0.1:1420";

/**
 * Browser preview of the laptop. Phones on this computer call the same
 * `/sync` routes the Windows app serves from Rust. This listener is not
 * what runs on race day.
 *
 * The host is loaded through Vite so the config file does not have to
 * execute the TypeScript workspace package itself.
 */
export function devSyncPlugin(): Plugin {
  return {
    name: "mwhe-dev-sync",
    configureServer(server) {
      const host = loadHost(server);
      let chain = Promise.resolve();
      function lock<T>(work: () => T): Promise<T> {
        const run = chain.then(work, work);
        chain = run.then(
          () => undefined,
          () => undefined,
        );
        return run;
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        const path = url.split("?")[0] ?? url;
        if (
          !path.startsWith("/sync") &&
          path !== "/health" &&
          !path.startsWith("/__mwhe")
        ) {
          next();
          return;
        }
        setCors(res);
        if (req.method === "OPTIONS") {
          res.statusCode = 204;
          res.end();
          return;
        }
        try {
          const body = await readBody(req);
          const parsed = body ? (JSON.parse(body) as unknown) : null;
          const ready = await host;
          const result = await lock(() =>
            dispatch(ready, req.method ?? "GET", url, req.headers, parsed),
          );
          res.statusCode = result.status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result.body));
        } catch (error) {
          res.statusCode = 400;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              schemaVersion: 1,
              type: "sync_error",
              error: "bad_request",
              message:
                error instanceof Error ? error.message : "Could not read that request.",
            }),
          );
        }
      });
    },
  };
}

function loadHost(server: ViteDevServer): Promise<SyncHost> {
  return server
    .ssrLoadModule("/src/sync/host.ts")
    .then((mod: { createSyncHost: (urls: string[]) => SyncHost }) =>
      mod.createSyncHost([DEV_URL]),
    );
}

function dispatch(
  host: SyncHost,
  method: string,
  url: string,
  headers: Connect.IncomingMessage["headers"],
  body: unknown,
): { status: number; body: unknown } {
  const path = url.split("?")[0] ?? url;
  if (path.startsWith("/sync") || path === "/health") {
    const authorization = header(headers, "authorization");
    return host.handle({
      method,
      path: url,
      headers: { authorization },
      body,
    });
  }
  if (method === "GET" && path === "/__mwhe/snapshot") {
    return { status: 200, body: host.snapshot() };
  }
  if (method !== "POST" || !isRecord(body)) {
    return { status: 404, body: { message: "Unknown station request." } };
  }
  if (path === "/__mwhe/seed") {
    return { status: 200, body: host.seed(body as Parameters<SyncHost["seed"]>[0]) };
  }
  if (path === "/__mwhe/roster") {
    const deltas = Array.isArray(body.deltas) ? body.deltas : [];
    return {
      status: 200,
      body: host.setRoster(deltas as Parameters<SyncHost["setRoster"]>[0]),
    };
  }
  if (path === "/__mwhe/pairing") {
    return {
      status: 200,
      body: host.createPairing(body as Parameters<SyncHost["createPairing"]>[0]),
    };
  }
  if (path === "/__mwhe/pairing/show") {
    return {
      status: 200,
      body: host.showPairing(String(body.pairingId ?? ""), optionalString(body.hubUrl)),
    };
  }
  if (path === "/__mwhe/import") {
    return { status: 200, body: host.importPunchText(String(body.text ?? "")) };
  }
  if (path === "/__mwhe/roster-qr") {
    return {
      status: 200,
      body: host.rosterQr(String(body.eventId ?? ""), Number(body.since ?? 0)),
    };
  }
  if (path === "/__mwhe/settings") {
    return { status: 200, body: host.setClockWarnMs(Number(body.clockOffsetWarnMs)) };
  }
  if (path === "/__mwhe/manual-start") {
    return {
      status: 200,
      body: host.setManualStart(body.start as Parameters<SyncHost["setManualStart"]>[0]),
    };
  }
  if (path === "/__mwhe/row-clock") {
    return {
      status: 200,
      body: host.setRowClock(body.start as Parameters<SyncHost["setRowClock"]>[0]),
    };
  }
  if (path === "/__mwhe/paper") {
    return {
      status: 200,
      body: host.addPaperPunch(body.punch as Parameters<SyncHost["addPaperPunch"]>[0]),
    };
  }
  if (path === "/__mwhe/void") {
    return { status: 200, body: host.voidPunch(String(body.uuid ?? "")) };
  }
  return { status: 404, body: { message: "Unknown station request." } };
}

function setCors(res: Connect.ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function header(
  headers: Connect.IncomingMessage["headers"],
  name: string,
): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
