import {
  bytesToBase64,
  downloadVerifiedApk,
  githubStationManifestUrl,
  parseStationUpdateManifest,
  type StationUpdateManifest,
} from "@mwhe/core";

const REPO = "DevDan171/mwhe-race-scorer";

/**
 * Download the station APK for this laptop's own version and keep it for phones
 * on the race Wi-Fi. A missing file or a bad checksum does nothing.
 */
export async function cacheMatchingStationApk(input: {
  version: string;
  save: (manifest: StationUpdateManifest, apkBase64: string) => Promise<void>;
  fetchImpl?: typeof fetch;
}): Promise<boolean> {
  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(githubStationManifestUrl(REPO, input.version));
    if (!response.ok) return false;
    const manifest = parseStationUpdateManifest(await response.json());
    if (manifest.version !== input.version || manifest.debug) return false;
    const bytes = await downloadVerifiedApk(manifest.url, manifest.sha256, fetchImpl);
    if (!bytes) return false;
    await input.save(manifest, bytesToBase64(bytes));
    return true;
  } catch {
    return false;
  }
}
