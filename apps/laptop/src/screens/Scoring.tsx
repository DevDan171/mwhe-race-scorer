import {
  createChangelogEntry,
  isUnknownRiderNumber,
  primaryRace,
  projectPhoneRoster,
  punchSchema,
  scoreRace,
  SCHEMA_VERSION,
  type Punch,
} from "@mwhe/core";
import { useMemo, useState } from "react";

import { formatWhen } from "../format";
import { messageOf } from "../message";
import { useSync } from "../sync/provider";
import { useHub } from "../use-hub";
import { Banner, Field } from "../ui";

export function Scoring() {
  const hub = useHub();
  const sync = useSync();
  const [error, setError] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [checkId, setCheckId] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(new Date()));

  const state = hub.state;
  const punches = useMemo(() => {
    const eventId = state?.race.event.id;
    return (sync.view?.punches ?? []).filter(
      (punch) => !eventId || !punch.eventId || punch.eventId === eventId,
    );
  }, [sync.view, state]);

  const scored = useMemo(() => {
    if (!state) return null;
    return scoreRace({
      schemaVersion: SCHEMA_VERSION,
      race: state.race,
      punches,
      startTimes: [],
      penalties: [],
      disqualifications: [],
      resultsVersion: 1,
      resultsStatus: "provisional",
      publishedAt: state.downloadedAt,
    });
  }, [state, punches]);

  if (!state || !scored) {
    return (
      <div className="stack">
        <h1>Scoring</h1>
        <Banner tone="info">Import an event before scoring.</Banner>
      </div>
    );
  }

  const race = primaryRace(state.race.races);
  const roster = projectPhoneRoster(state.race, state.rosterVersion);

  async function savePaper() {
    setError(null);
    const riderNumber = Number(number);
    if (!Number.isInteger(riderNumber) || riderNumber < 1) {
      setError("Enter the rider number from the paper.");
      return;
    }
    const check = race.checks.find(
      (entry) => entry.id === (checkId || race.checks[0]?.id),
    );
    if (!check) {
      setError("Pick a check.");
      return;
    }
    const timestamp = fromLocalInput(when);
    const unknown = isUnknownRiderNumber(
      roster.riders.map((rider) => rider.number),
      riderNumber,
    );
    const punch = punchSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      uuid: crypto.randomUUID(),
      eventId: state!.race.event.id,
      raceId: race.id,
      checkId: check.id,
      deviceId: "paper",
      riderNumber,
      timestamp,
      createdAt: new Date().toISOString(),
      voided: false,
      ...(unknown ? { unknownNumber: true } : {}),
    });
    try {
      await sync.addPaperPunch(punch);
      await hub.change(`Paper backup at ${check.name}`, (current, audit) => ({
        ...current,
        changelog: [
          ...current.changelog,
          createChangelogEntry({
            id: audit.entryId,
            who: audit.who,
            when: audit.when,
            why: audit.why,
            entity: { type: "punch", id: punch.uuid },
            action: "add",
            before: null,
            after: {
              riderNumber: punch.riderNumber,
              checkId: punch.checkId,
              timestamp: punch.timestamp,
            },
          }),
        ],
      }));
      setNumber("");
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Scoring · {state.race.event.name}</h1>
          <p className="lede">
            Phones and paper backups land in the same list. A voided punch does not score.
            Results are not sent to the site from this screen.
          </p>
        </div>
      </header>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {scored.warnings.length > 0 ? (
        <Banner tone="info">
          {scored.warnings.length} scoring notes. Unknown numbers stay in the list.
        </Banner>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>OVERALL</th>
              <th>NUMBER</th>
              <th>NAME</th>
              <th>CLASS</th>
              <th>CHECKS</th>
              <th>TIME</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {scored.payload.rows.map((row) => (
              <tr key={row.number}>
                <td>{row.positionOverall ?? "—"}</td>
                <td>#{row.number}</td>
                <td>{row.name}</td>
                <td>{row.class ?? "—"}</td>
                <td>{row.checks}</td>
                <td>{formatSeconds(row.totalTimeSeconds)}</td>
                <td>{row.unknown ? "Unknown number" : row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card" style={{ padding: 16 }}>
        <h2>Paper backup</h2>
        <p className="lede">
          Enter a time written on paper. It scores with the phone punches.
        </p>
        <div className="row">
          <Field label="Number">
            <input
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Check">
            <select
              value={checkId || race.checks[0]?.id || ""}
              onChange={(event) => setCheckId(event.target.value)}
            >
              {race.checks.map((check) => (
                <option key={check.id} value={check.id}>
                  {check.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Time on the sheet">
            <input
              type="datetime-local"
              step={1}
              value={when}
              onChange={(event) => setWhen(event.target.value)}
            />
          </Field>
        </div>
        <button type="button" className="btn primary" onClick={() => void savePaper()}>
          Save paper punch
        </button>
      </section>

      <section className="card" style={{ padding: 16 }}>
        <h2>Punches</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>NUMBER</th>
                <th>CHECK</th>
                <th>TIME</th>
                <th>SOURCE</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...punches]
                .reverse()
                .slice(0, 40)
                .map((punch) => (
                  <tr key={punch.uuid}>
                    <td>
                      #{punch.riderNumber}
                      {punch.unknownNumber ? " unknown" : ""}
                      {punch.voided ? " voided" : ""}
                    </td>
                    <td>{checkName(state.race, punch.checkId)}</td>
                    <td>{formatWhen(punch.timestamp)}</td>
                    <td>
                      {punch.deviceId === "paper" ? "Paper" : punch.deviceId.slice(0, 8)}
                    </td>
                    <td>
                      {punch.voided ? null : (
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => void voidOne(punch)}
                        >
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  async function voidOne(punch: Punch) {
    setError(null);
    try {
      await sync.voidPunch(punch.uuid);
      await hub.change("Voided a punch", (current, audit) => ({
        ...current,
        changelog: [
          ...current.changelog,
          createChangelogEntry({
            id: audit.entryId,
            who: audit.who,
            when: audit.when,
            why: audit.why,
            entity: { type: "punch", id: punch.uuid },
            action: "change",
            before: { voided: false },
            after: { voided: true },
          }),
        ],
      }));
    } catch (caught) {
      setError(messageOf(caught));
    }
  }
}

function checkName(
  race: { races: { checks: { id: string; name: string }[] }[] },
  checkId: string,
): string {
  for (const entry of race.races) {
    const check = entry.checks.find((item) => item.id === checkId);
    if (check) return check.name;
  }
  return checkId;
}

function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remain = whole % 60;
  const clock = `${minutes}:${String(remain).padStart(2, "0")}`;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`
    : clock;
}

function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function fromLocalInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Enter the time from the paper.");
  return date.toISOString();
}
