import type { ChangelogEntry } from "@mwhe/core";

import { useHub } from "../use-hub";
import { Banner } from "../ui";

export function Changelog() {
  const hub = useHub();
  const entries = hub.state?.changelog ?? [];

  return (
    <div className="stack">
      <header className="page-head">
        <p className="eyebrow">Audit</p>
        <h1>Changelog</h1>
        <p className="lede">
          Every manual add or change records who, when, the entity, the reason, and the
          before and after values.
        </p>
      </header>
      {!hub.state ? (
        <Banner tone="info">Download a race package on Race Prep first.</Banner>
      ) : null}
      {hub.state && entries.length === 0 ? (
        <Banner tone="info">
          No manual changes yet. Registration and race setup will show up here.
        </Banner>
      ) : null}
      <div className="stack tight">
        {[...entries].reverse().map((entry) => (
          <article key={entry.id} className="log">
            <header>
              <strong>{summary(entry)}</strong>
              <span>{new Date(entry.when).toLocaleString()}</span>
            </header>
            <p>
              {entry.who} · {entry.action} · {entry.entity.type} {entry.entity.id}
            </p>
            <p className="reason">{entry.why}</p>
            <details>
              <summary>Before and after</summary>
              <pre>
                {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
              </pre>
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}

function summary(entry: ChangelogEntry): string {
  const before = record(entry.before);
  const after = record(entry.after);
  if (entry.entity.type === "registration" && entry.action === "add") {
    return `Added ${text(after.name)} #${text(after.number)} (${text(after.class)})`;
  }
  if (entry.entity.type === "registration" && before.number !== after.number) {
    return `Number ${text(before.number)} changed to ${text(after.number)}`;
  }
  if (entry.entity.type === "registration" && before.class !== after.class) {
    return `Class ${text(before.class)} changed to ${text(after.class)} for #${text(after.number)}`;
  }
  if (
    entry.entity.type === "race" &&
    before.timeLimitMinutes !== after.timeLimitMinutes
  ) {
    return `Time limit ${text(before.timeLimitMinutes)} changed to ${text(after.timeLimitMinutes)} min`;
  }
  if (
    entry.entity.type === "race" &&
    before.laps !== after.laps &&
    after.laps !== undefined
  ) {
    return `Laps changed to ${text(after.laps)}`;
  }
  return `${entry.action} ${entry.entity.type}`;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  if (value === undefined || value === null) return "—";
  return String(value);
}
