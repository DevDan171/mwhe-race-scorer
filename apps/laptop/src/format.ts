import type { RaceLength } from "@mwhe/core";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDay(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  const monthName = MONTHS[Number(month) - 1];
  if (!year || !monthName || !day) return isoDate;
  return `${monthName} ${Number(day)}, ${year}`;
}

export function formatWhen(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return "";
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatClock(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "Not set";
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function lengthLabel(length: RaceLength): string {
  if (length.mode === "time") return `${length.minutes} min`;
  if (length.laps === null) return "Until the finish";
  return `${length.laps} laps`;
}

export function roleLabel(role: string): string {
  if (role === "race_director") return "race director";
  return role;
}

export function ageFrom(
  isoDate: string | null | undefined,
  today = new Date(),
): number | null {
  if (!isoDate) return null;
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  let age = today.getFullYear() - year;
  const beforeBirthday =
    today.getMonth() + 1 < month ||
    (today.getMonth() + 1 === month && today.getDate() < day);
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

export function formatBirth(isoDate: string | null | undefined): string {
  if (!isoDate) return "Not on file";
  const [year, month, day] = isoDate.split("-");
  if (!year || !month || !day) return isoDate;
  const age = ageFrom(isoDate);
  const shown = `${month}/${day}/${year}`;
  return age === null ? shown : `${shown} · age ${age}`;
}

export const CLASS_COLOR: Record<string, string> = {
  Pro: "#ff6a1a",
  A: "#4c8dff",
  B: "#3ecf8e",
  C: "#e6b15a",
  "+40A": "#b07cff",
  "+40B": "#2ec4b6",
  "+40C": "#d4a017",
  Womens: "#ff6fae",
  "Womens Pro": "#ff8fbe",
  "Electric Sportsman": "#7eb6ff",
  "Electric Pro": "#9ec7ff",
  "65/85": "#9aa7b8",
  "50cc": "#8d99a8",
};
