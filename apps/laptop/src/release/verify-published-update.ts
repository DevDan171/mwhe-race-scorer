import { installerDownloadUrls } from "./latest-json";

const repo = process.env.GITHUB_REPOSITORY;
const tag = process.env.GITHUB_REF_NAME;
if (!repo || !tag) {
  console.error("GITHUB_REPOSITORY and GITHUB_REF_NAME are required.");
  process.exit(1);
}

const manifestUrl = `https://github.com/${repo}/releases/download/${encodeURIComponent(tag)}/latest.json`;

const manifestResponse = await fetchWithRetry(manifestUrl, false);
if (manifestResponse.status === 404) {
  console.log("latest.json was not published, so there is no updater URL to check.");
  process.exit(0);
}
if (!manifestResponse.ok) {
  console.error(`latest.json returned ${manifestResponse.status} from ${manifestUrl}`);
  process.exit(1);
}

const manifest = (await manifestResponse.json()) as {
  platforms?: Record<string, { url?: string }>;
};
const urls = installerDownloadUrls(manifest);
if (urls.length === 0) {
  console.error("latest.json does not contain an installer URL.");
  process.exit(1);
}

let failed = false;
for (const url of urls) {
  if (url.includes(" ") || url.includes("%20")) {
    console.error(`Updater URL still contains a space: ${url}`);
    failed = true;
    continue;
  }
  const response = await fetchWithRetry(url, true);
  console.log(`${response.status} ${url}`);
  if (response.status !== 200 && response.status !== 206) failed = true;
}

if (failed) process.exit(1);

async function fetchWithRetry(url: string, range: boolean): Promise<Response> {
  let last = new Response(null, { status: 0 });
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    last = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: range ? { Range: "bytes=0-0" } : {},
    });
    if (last.status === 200 || (range && last.status === 206)) return last;
    if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return last;
}
