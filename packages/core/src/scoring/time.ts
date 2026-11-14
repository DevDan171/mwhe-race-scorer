/** Parse an ISO timestamp that has already passed schema validation. */
export function parseIsoMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid timestamp: ${iso}`);
  }
  return ms;
}

export function secondsBetween(laterMs: number, earlierMs: number): number {
  return (laterMs - earlierMs) / 1000;
}
