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
