import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Banner({
  tone,
  children,
}: {
  tone: "error" | "ok" | "info";
  children: ReactNode;
}) {
  return (
    <p className={`banner banner-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

