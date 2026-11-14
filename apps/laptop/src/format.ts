export function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remain = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}
