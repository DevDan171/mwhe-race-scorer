import type { ChangelogEntry } from "@mwhe/core";

import { useHub } from "../use-hub";
import { Banner } from "../ui";

export function Changelog() {
  const hub = useHub();
  const entries = hub.state?.changelog ?? [];

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Changelog</h1>
          <p className="lede">
            Every add or change records who and when. Contact fields are not written here.
          </p>
        </div>
      </header>
      {!hub.state ? (
        <Banner tone="info">Import an event to see its changelog.</Banner>
      ) : null}
      {hub.state && entries.length === 0 ? (
        <Banner tone="info">
          No changes yet. Registration, race setup, and re-import show up here.
        </Banner>
      ) : null}
      <div className="stack">
        {[...entries].reverse().map((entry) => (
          <article key={entry.id} className="log">
            <header>
              <strong>{summary(entry)}</strong>
              <span className="muted">{new Date(entry.when).toLocaleString()}</span>
            </header>
            <p>
              {entry.who} · {entry.action} · {entry.entity.type}
            </p>
            <p>{entry.why}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function summary(entry: ChangelogEntry): string {
  const after = record(entry.after);
  const before = record(entry.before);
  if (entry.entity.type === "registration" && entry.action === "add") {
    return `Added ${text(after.name)} #${text(after.number)} (${text(after.class)})`;
  }
  if (typeof after.detail === "string") return after.detail;
  if (before.class && after.class && before.class !== after.class) {
    return `Class ${text(before.class)} changed to ${text(after.class)}`;
  }
  return `${entry.action} ${entry.entity.type}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return value === undefined || value === null ? "—" : String(value);
}
