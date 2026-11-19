import { pathToFileURL } from "node:url";

import { installerDownloadUrls } from "./latest-json";

export interface PublishedFetchOptions {
  fetch?: typeof fetch;
  attempts?: number;
  delayMs?: number;
}

/**
 * GET a published release file. Retries while GitHub is still attaching the
 * asset. The last real response is returned when none succeed. A Response
 * with status 0 is not constructed: Node 22 rejects that status.
 */
export async function fetchPublished(
  url: string,
  range: boolean,
  options: PublishedFetchOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const attempts = options.attempts ?? 6;
  const delayMs = options.delayMs ?? 5000;
  let last: Response | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: range ? { Range: "bytes=0-0" } : {},
    });
    if (last.status === 200 || (range && last.status === 206)) return last;
    if (attempt < attempts && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  if (!last) throw new Error(`No response from ${url}`);
  return last;
}

export async function verifyPublishedUpdate(input: {
  repo: string;
  tag: string;
  fetch?: typeof fetch;
  attempts?: number;
  delayMs?: number;
  log?: (line: string) => void;
  warn?: (line: string) => void;
}): Promise<number> {
  const log = input.log ?? console.log;
  const warn = input.warn ?? console.error;
  const manifestUrl = `https://github.com/${input.repo}/releases/download/${encodeURIComponent(input.tag)}/latest.json`;
  const fetchOptions = {
    fetch: input.fetch,
    attempts: input.attempts,
    delayMs: input.delayMs,
  };
  const manifestResponse = await fetchPublished(manifestUrl, false, fetchOptions);
  if (manifestResponse.status === 404) {
    log("latest.json was not published, so there is no updater URL to check.");
    return 0;
  }
  if (!manifestResponse.ok) {
    warn(`latest.json returned ${manifestResponse.status} from ${manifestUrl}`);
    return 1;
  }

  const manifest = (await manifestResponse.json()) as {
    platforms?: Record<string, { url?: string }>;
  };
  const urls = installerDownloadUrls(manifest);
  if (urls.length === 0) {
    warn("latest.json does not contain an installer URL.");
    return 1;
  }

  let failed = false;
  for (const url of urls) {
    if (url.includes(" ") || url.includes("%20")) {
      warn(`Updater URL still contains a space: ${url}`);
      failed = true;
      continue;
    }
    const response = await fetchPublished(url, true, fetchOptions);
    log(`${response.status} ${url}`);
    if (response.status !== 200 && response.status !== 206) failed = true;
  }
  return failed ? 1 : 0;
}

function startedAsScript(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (startedAsScript()) {
  const repo = process.env.GITHUB_REPOSITORY;
  const tag = process.env.GITHUB_REF_NAME;
  if (!repo || !tag) {
    console.error("GITHUB_REPOSITORY and GITHUB_REF_NAME are required.");
    process.exit(1);
  }
  const code = await verifyPublishedUpdate({ repo, tag });
  process.exit(code);
}
