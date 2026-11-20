import { z } from "zod";

import { normalizeAppVersion } from "../sync/punches.js";

/**
 * Published next to the signed station APK. `latest.json` stays the Windows
 * installer. A debug build does not publish this file.
 */
export const stationUpdateManifestSchema = z.strictObject({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  url: z.string().min(1),
  sha256: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .transform((value) => value.toLowerCase()),
  /** Present only to reject a debug APK. Release manifests omit it. */
  debug: z.boolean().optional(),
});

export type StationUpdateManifest = z.infer<typeof stationUpdateManifestSchema>;

export const GITHUB_STATION_UPDATE_NAME = "station-update.json";

export function githubStationManifestUrl(repo: string, version: string): string {
  const tag = `v${normalizeAppVersion(version)}`;
  return `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/${GITHUB_STATION_UPDATE_NAME}`;
}

export function githubLatestStationManifestUrl(repo: string): string {
  return `https://github.com/${repo}/releases/latest/download/${GITHUB_STATION_UPDATE_NAME}`;
}

export function stationApkFileName(version: string): string {
  return `mwhe-station-${normalizeAppVersion(version)}.apk`;
}

export function parseStationUpdateManifest(value: unknown): StationUpdateManifest {
  return stationUpdateManifestSchema.parse(value);
}

/** What the laptop tells a phone. The download stays on the race Wi-Fi. */
export function hubStationManifest(
  manifest: StationUpdateManifest,
): StationUpdateManifest {
  return {
    version: manifest.version,
    url: "/sync/station-apk",
    sha256: manifest.sha256,
  };
}

export function resolveStationApkUrl(url: string, hubUrl: string | null): string {
  if (url.startsWith("/") && hubUrl) {
    return `${hubUrl.replace(/\/+$/, "")}${url}`;
  }
  return url;
}

/**
 * Numeric MAJOR.MINOR.PATCH. A leading `v` is ignored. Anything else, including
 * a prerelease, does not compare and is not a newer release.
 */
export function compareAppVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    const av = a[index] ?? 0;
    const bv = b[index] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

export function isNewerRelease(current: string, offered: string): boolean {
  const offeredParts = versionParts(offered);
  if (!offeredParts || !versionParts(current)) return false;
  return compareAppVersions(current, offered) < 0;
}

/** A live station is recording. Do not prompt, download, or install. */
export function stationUpdateIsAllowed(live: boolean): boolean {
  return !live;
}

/**
 * The paired laptop's copy wins, and only when it is newer than this phone.
 * A GitHub release is used only when the phone has not heard from a laptop.
 * Debug manifests are ignored. A live station gets nothing.
 */
export function chooseStationUpdate(input: {
  currentVersion: string;
  live: boolean;
  hub: StationUpdateManifest | null;
  github: StationUpdateManifest | null;
}): StationUpdateManifest | null {
  if (!stationUpdateIsAllowed(input.live)) return null;
  const hub = usableManifest(input.hub);
  if (hub && isNewerRelease(input.currentVersion, hub.version)) return hub;
  if (hub) return null;
  const github = usableManifest(input.github);
  if (github && isNewerRelease(input.currentVersion, github.version)) return github;
  return null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytesToArrayBuffer(bytes));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function checksumMatches(actual: string, expected: string): boolean {
  return actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

export async function downloadVerifiedApk(
  url: string,
  sha256: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const actual = await sha256Hex(bytes);
    if (!checksumMatches(actual, sha256)) return null;
    return bytes;
  } catch {
    return null;
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return btoa(binary);
}

function usableManifest(
  manifest: StationUpdateManifest | null,
): StationUpdateManifest | null {
  if (!manifest || manifest.debug) return null;
  return manifest;
}

function versionParts(version: string): [number, number, number] | null {
  const match = normalizeAppVersion(version).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}
