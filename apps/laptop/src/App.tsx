import { createDemoRace, scoreRace, type ResultsPublicationStatus } from "@mwhe/core";
import { useMemo, useState } from "react";

import { formatSeconds } from "./format";

export function App() {
  const race = useMemo(() => createDemoRace(), []);
  const [status, setStatus] = useState<ResultsPublicationStatus>("provisional");
  const scored = useMemo(
    () =>
      scoreRace({
        ...race,
        resultsStatus: status,
        resultsVersion: status === "official" ? 2 : 1,
      }),
    [race, status],
  );

  return (
    <main>
      <header>
        <p className="eyebrow">Midwest Hard Enduro</p>
        <h1>Race Scorer</h1>
        <p className="lede">
          Phase 0 scaffold. The table is the Timber Ridge demo fixture scored by{" "}
          <code>@mwhe/core</code>. SQLite and the sync server are not in this build.
        </p>
      </header>

      <section className="toolbar" aria-label="Publication">
        <div>
          <h2>{race.race.event.name}</h2>
          <p>
            {race.race.event.date} · limit {race.race.event.timeLimitMinutes} min ·
            results v{scored.payload.version}
          </p>
        </div>
        <button
          type="button"
          onClick={() =>
            setStatus((current) =>
              current === "provisional" ? "official" : "provisional",
            )
          }
        >
          Mark {status === "provisional" ? "official" : "provisional"}
        </button>
      </section>

      <p className={`status status-${status}`}>
        {status === "provisional"
          ? "Provisional. Official after the 30 minute protest window."
          : "Official. The protest window is closed."}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ovr</th>
              <th>Cls</th>
              <th>No.</th>
              <th>Name</th>
              <th>Class</th>
              <th>Checks</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {scored.payload.rows.map((entry) => (
              <tr key={entry.number}>
                <td>{entry.positionOverall ?? "—"}</td>
                <td>{entry.positionInClass ?? "—"}</td>
                <td>{entry.number}</td>
                <td>{entry.name}</td>
                <td>{entry.class ?? "UNKNOWN"}</td>
                <td>{entry.checks}</td>
                <td>{formatSeconds(entry.totalTimeSeconds)}</td>
                <td>{entry.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
