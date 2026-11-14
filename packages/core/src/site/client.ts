import { racePackageSchema, type RacePackage } from "../schemas/race-package.js";
import { z } from "zod";

export const siteErrorSchema = z.strictObject({
  ok: z.literal(false),
  error: z.string().min(1),
  message: z.string().min(1),
});

export const getRacePackageResponseSchema = z.strictObject({
  ok: z.literal(true),
  racePackage: racePackageSchema,
});

export type SiteErrorBody = z.infer<typeof siteErrorSchema>;
export type GetRacePackageResponse = z.infer<typeof getRacePackageResponseSchema>;

export class SiteApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "SiteApiError";
    this.status = status;
    this.code = code;
  }
}

export interface GetRacePackageOptions {
  baseUrl: string;
  eventId: string;
  token: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * GET {baseUrl}/functions/getRacePackage?eventId=...
 * Authorization: Bearer <token>
 *
 * The token is a race_director or admin sign-in token. It is not a shared
 * key, and it is never put on the query string.
 */
export async function getRacePackage(
  options: GetRacePackageOptions,
): Promise<RacePackage> {
  const token = options.token.trim();
  if (!token) {
    throw new SiteApiError(
      401,
      "unauthorized",
      "A race director or admin token is required",
    );
  }
  const eventId = options.eventId.trim();
  if (!eventId) {
    throw new SiteApiError(400, "missing_event_id", "An event id is required");
  }

  const url = new URL(options.baseUrl);
  url.pathname = "/functions/getRacePackage";
  url.search = "";
  url.hash = "";
  url.searchParams.set("eventId", eventId);
  const fetchImpl = options.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new SiteApiError(0, "network", message);
  }

  const body: unknown = await readJson(response);
  if (!response.ok || !isOk(body)) {
    const parsed = siteErrorSchema.safeParse(body);
    if (parsed.success) {
      throw new SiteApiError(
        response.status || 500,
        parsed.data.error,
        parsed.data.message,
      );
    }
    throw new SiteApiError(
      response.status || 500,
      "bad_response",
      `The site returned HTTP ${response.status || "error"} without an error envelope`,
    );
  }

  const parsed = getRacePackageResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new SiteApiError(
      502,
      "invalid_package",
      "The site returned a race package this version of the scorer cannot read",
    );
  }
  return parsed.data.racePackage;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isOk(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    "ok" in body &&
    (body as { ok: unknown }).ok === true
  );
}
