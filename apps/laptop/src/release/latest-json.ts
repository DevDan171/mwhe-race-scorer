import { readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

export interface LatestJson {
  version: string;
  notes: string;
  pub_date: string;
  platforms: {
    "windows-x86_64": {
      signature: string;
      url: string;
    };
    "windows-x86_64-nsis": {
      signature: string;
      url: string;
    };
  };
}

/**
 * GitHub release assets replace spaces with dots, so a URL built from the
 * Tauri filename (`MWHE Race Scorer_…`) does not download. Publish a name
 * with no spaces: `MWHE-Race-Scorer_…`.
 */
export function publishedInstallerName(builtName: string): string {
  const safe = builtName.replaceAll(" ", "-");
  if (!/^[A-Za-z0-9._-]+$/.test(safe)) {
    throw new Error(`Installer name is not safe to publish: ${builtName}`);
  }
  return safe;
}

/** Rename the setup exe and its signature to the name GitHub will keep. */
export function renameReleaseInstallers(dir: string): string[] {
  const names = readdirSync(dir);
  const renamed: string[] = [];
  for (const name of names) {
    if (!name.endsWith("-setup.exe") && !name.endsWith("-setup.exe.sig")) continue;
    const safe = publishedInstallerName(name);
    if (safe !== name) renameSync(join(dir, name), join(dir, safe));
    renamed.push(safe);
  }
  return renamed;
}

export function installerDownloadUrls(manifest: {
  platforms?: Record<string, { url?: string }>;
}): string[] {
  const urls = Object.values(manifest.platforms ?? {})
    .map((platform) => platform.url)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
  return [...new Set(urls)];
}

export function releaseDownloadUrl(repo: string, tag: string, fileName: string): string {
  const encodedTag = encodeURIComponent(tag);
  const encodedName = encodeURIComponent(fileName);
  return `https://github.com/${repo}/releases/download/${encodedTag}/${encodedName}`;
}

/** Static manifest the installed app reads from the latest GitHub Release. */
export function buildLatestJson(input: {
  version: string;
  notes: string;
  pubDate: string;
  signature: string;
  repo: string;
  tag: string;
  installerFileName: string;
}): LatestJson {
  const signature = input.signature.trim();
  const url = releaseDownloadUrl(input.repo, input.tag, input.installerFileName);
  const platform = { signature, url };
  return {
    version: input.version,
    notes: input.notes,
    pub_date: input.pubDate,
    platforms: {
      "windows-x86_64": platform,
      "windows-x86_64-nsis": platform,
    },
  };
}
