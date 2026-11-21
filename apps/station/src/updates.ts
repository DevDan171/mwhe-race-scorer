import {
  chooseStationUpdate,
  downloadVerifiedApk,
  githubLatestStationManifestUrl,
  parseStationUpdateManifest,
  resolveStationApkUrl,
  stationUpdateIsAllowed,
  type StationUpdateManifest,
} from "@mwhe/core";

const REPO = "DevDan171/mwhe-race-scorer";

/**
 * Look at the laptop first, then GitHub. A live station, a failed request,
 * and a bad manifest all return nothing. The screen stays quiet.
 */
export async function findStationUpdate(input: {
  live: boolean;
  currentVersion: string;
  hubUrl: string | null;
  online: boolean;
  fetchImpl?: typeof fetch;
}): Promise<StationUpdateManifest | null> {
  if (!stationUpdateIsAllowed(input.live)) return null;
  const fetchImpl = input.fetchImpl ?? fetch;
  const hub = input.hubUrl
    ? await readManifest(
        fetchImpl,
        `${input.hubUrl.replace(/\/+$/, "")}/sync/station-update`,
      )
    : null;
  const github = input.online
    ? await readManifest(fetchImpl, githubLatestStationManifestUrl(REPO))
    : null;
  return chooseStationUpdate({
    currentVersion: input.currentVersion,
    live: false,
    hub,
    github,
  });
}

export async function downloadStationApk(
  offer: StationUpdateManifest,
  hubUrl: string | null,
  fetchImpl?: typeof fetch,
): Promise<Uint8Array | null> {
  return downloadVerifiedApk(
    resolveStationApkUrl(offer.url, hubUrl),
    offer.sha256,
    fetchImpl,
  );
}

export async function stationBuildIsDebug(
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await fetchImpl("./signing.json");
    if (!response.ok) return false;
    const body = (await response.json()) as { debug?: unknown };
    return body.debug === true;
  } catch {
    return false;
  }
}

async function readManifest(
  fetchImpl: typeof fetch,
  url: string,
): Promise<StationUpdateManifest | null> {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return null;
    return parseStationUpdateManifest(await response.json());
  } catch {
    return null;
  }
}
