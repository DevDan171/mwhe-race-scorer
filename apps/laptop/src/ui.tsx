import type { ReactNode } from "react";

export function Logo() {
  return (
    <div className="brand">
      <strong>MWHE</strong>
      <span>RACE SCORER</span>
    </div>
  );
}

export function OfflinePill() {
  return (
    <span className="pill">
      <i className="dot" />
      Offline-ready
    </span>
  );
}

export function SignedInPill({ name, role }: { name: string; role: string }) {
  return (
    <span className="pill ok">
      <i className="dot" />
      Signed in as {name}, {role}
    </span>
  );
}

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

export function Modal({
  title,
  lede,
  wide,
  children,
  onClose,
}: {
  title: string;
  lede?: string;
  wide?: boolean;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-back" role="presentation" onMouseDown={onClose}>
      <div
        className={wide ? "modal wide" : "modal"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="page-head">
          <div>
            <h2>{title}</h2>
            {lede ? <p className="lede">{lede}</p> : null}
          </div>
          <button type="button" className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
