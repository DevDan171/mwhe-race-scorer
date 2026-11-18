import {
  addClassToStartRow,
  moveCheck,
  planStartOrder,
  removeClassFromStartRow,
  renameCheck,
  renameStartRow,
  RIDER_CLASSES,
  setPlannedStart,
  setRaceLength,
  setRowGapSeconds,
  type RaceLength,
  type RiderClass,
} from "@mwhe/core";
import { useEffect, useState } from "react";

import { useHub } from "../use-hub";
import { messageOf } from "../message";
import { Banner, Field } from "../ui";

export function RaceSetup() {
  const hub = useHub();
  const races = hub.state?.race.races ?? [];
  const [raceId, setRaceId] = useState(races[0]?.id ?? "");
  const selected = races.find((race) => race.id === raceId) ?? races[0];
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<RaceLength["mode"]>("time");
  const [minutes, setMinutes] = useState("");
  const [laps, setLaps] = useState("");
  const [gap, setGap] = useState("");
  const [start, setStart] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    setMode(selected.length.mode);
    setMinutes(selected.length.mode === "time" ? String(selected.length.minutes) : "");
    setLaps(
      selected.length.mode === "laps" && selected.length.laps !== null
        ? String(selected.length.laps)
        : "",
    );
    setGap(String(selected.rowGapSeconds));
    setStart(toLocalInput(selected.plannedStart));
  }, [selected]);

  if (!hub.state || !selected) {
    return (
      <div className="stack">
        <PageTitle />
        <Banner tone="info">Download a race package on Race Prep first.</Banner>
      </div>
    );
  }

  const race = selected;
  const plan = planStartOrder(race, hub.state.race.registrations);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  const why = reason.trim();

  return (
    <div className="stack">
      <PageTitle />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="choice-row" role="tablist" aria-label="Races">
        {races.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={entry.id === race.id ? "choice active" : "choice"}
            onClick={() => setRaceId(entry.id)}
          >
            {entry.name}
          </button>
        ))}
      </div>

      <section className="panel">
        <Field
          label="Reason for the next change"
          hint="Required. It is stored in the changelog."
        >
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this change being made?"
          />
        </Field>
      </section>

      <section className="panel">
        <h2>Race length</h2>
        <p className="hint">{describeLength(race.length)}</p>
        <div className="choice-row" role="group" aria-label="Length mode">
          <button
            type="button"
            className={mode === "time" ? "choice active" : "choice"}
            onClick={() => setMode("time")}
          >
            Time
          </button>
          <button
            type="button"
            className={mode === "laps" ? "choice active" : "choice"}
            onClick={() => setMode("laps")}
          >
            Laps
          </button>
        </div>
        {mode === "time" ? (
          <Field label="Minutes" hint="Counted from each row's own start.">
            <input
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </Field>
        ) : (
          <Field label="Laps" hint="Leave blank to run until the finish. No time limit.">
            <input
              inputMode="numeric"
              value={laps}
              placeholder="Until the finish"
              onChange={(event) => setLaps(event.target.value)}
            />
          </Field>
        )}
        <button
          type="button"
          className="primary"
          onClick={() =>
            void run(() =>
              hub.change(why, (current, audit) =>
                setRaceLength(current, {
                  raceId: race.id,
                  length: lengthFromForm(mode, minutes, laps),
                  audit,
                }),
              ),
            )
          }
        >
          Save race length
        </button>
      </section>

      <section className="panel">
        <h2>Checks</h2>
        <ol className="checks">
          {[...race.checks]
            .sort((a, b) => a.order - b.order)
            .map((check, index, all) => (
              <li key={check.id}>
                <span className="order">{index + 1}</span>
                <CheckName
                  name={check.name}
                  onSave={(name) =>
                    void run(() =>
                      hub.change(why, (current, audit) =>
                        renameCheck(current, {
                          raceId: race.id,
                          checkId: check.id,
                          name,
                          audit,
                        }),
                      ),
                    )
                  }
                />
                <div className="row tight">
                  <button
                    type="button"
                    className="ghost"
                    disabled={index === 0}
                    onClick={() =>
                      void run(() =>
                        hub.change(why, (current, audit) =>
                          moveCheck(current, {
                            raceId: race.id,
                            checkId: check.id,
                            direction: "up",
                            audit,
                          }),
                        ),
                      )
                    }
                  >
                    Up
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    disabled={index === all.length - 1}
                    onClick={() =>
                      void run(() =>
                        hub.change(why, (current, audit) =>
                          moveCheck(current, {
                            raceId: race.id,
                            checkId: check.id,
                            direction: "down",
                            audit,
                          }),
                        ),
                      )
                    }
                  >
                    Down
                  </button>
                </div>
              </li>
            ))}
        </ol>
      </section>

      <section className="panel">
        <h2>Start rows</h2>
        <p className="hint">
          Row numbers run across the whole race. Row 1 leaves at the planned start. Row N
          leaves (N - 1) times the gap later. A class can use more than one row. Riders
          with no assigned row are lined up by registration time, earliest signup on the
          earliest row of their class, split as evenly as the count allows.
        </p>
        <div className="inline">
          <Field label="Row gap (seconds)">
            <input
              inputMode="numeric"
              value={gap}
              onChange={(event) => setGap(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="primary"
            onClick={() =>
              void run(() =>
                hub.change(why, (current, audit) =>
                  setRowGapSeconds(current, {
                    raceId: race.id,
                    rowGapSeconds: Number(gap),
                    audit,
                  }),
                ),
              )
            }
          >
            Save gap
          </button>
        </div>
        <div className="inline">
          <Field label="Planned start of row 1">
            <input
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="primary"
            onClick={() =>
              void run(() =>
                hub.change(why, (current, audit) =>
                  setPlannedStart(current, {
                    raceId: race.id,
                    plannedStart: start ? new Date(start).toISOString() : null,
                    audit,
                  }),
                ),
              )
            }
          >
            Save start
          </button>
        </div>
        <div className="stack">
          {plan.rows.map((row) => (
            <article key={row.id} className="row-card">
              <h3>
                Row {row.rowNumber}
                {row.classes.length > 0 ? ` · ${row.classes.join(", ")}` : ""}
              </h3>
              <p className="row-meta">
                {row.startedAt
                  ? `${formatClock(row.startedAt)} · start plus ${row.rowNumber - 1} × ${race.rowGapSeconds}s`
                  : "No planned start, so this row has no clock yet."}
              </p>
              <RowLabel
                label={row.label}
                onSave={(label) =>
                  void run(() =>
                    hub.change(why, (current, audit) =>
                      renameStartRow(current, {
                        raceId: race.id,
                        startRowId: row.id,
                        label,
                        audit,
                      }),
                    ),
                  )
                }
              />
              <div className="chips">
                {row.classes.length === 0 ? (
                  <span className="hint">No classes on this row.</span>
                ) : null}
                {row.classes.map((riderClass) => (
                  <span key={riderClass} className="chip">
                    {riderClass}
                    <button
                      type="button"
                      className="linkish"
                      aria-label={`Remove ${riderClass} from row ${row.rowNumber}`}
                      onClick={() =>
                        void run(() =>
                          hub.change(why, (current, audit) =>
                            removeClassFromStartRow(current, {
                              raceId: race.id,
                              startRowId: row.id,
                              riderClass,
                              audit,
                            }),
                          ),
                        )
                      }
                    >
                      Remove
                    </button>
                  </span>
                ))}
              </div>
              {row.riders.length === 0 ? (
                <p className="hint">No riders on this row.</p>
              ) : (
                <div className="stack tight">
                  {row.riders.map((rider) => (
                    <div key={rider.riderNumber} className="rider static">
                      <span className="plate">{rider.riderNumber}</span>
                      <span>
                        <strong>{rider.name}</strong>
                        <small>
                          {rider.class}
                          {rider.placement === "assigned"
                            ? " · assigned to this row"
                            : " · placed by registration order"}
                          {rider.ignoredStartRow !== null
                            ? ` · site row ${rider.ignoredStartRow} is not a ${rider.class} row`
                            : ""}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <AddClass
                onAdd={(riderClass) =>
                  void run(() =>
                    hub.change(why, (current, audit) =>
                      addClassToStartRow(current, {
                        raceId: race.id,
                        startRowId: row.id,
                        riderClass,
                        audit,
                      }),
                    ),
                  )
                }
              />
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PageTitle() {
  return (
    <header className="page-head">
      <p className="eyebrow">Course</p>
      <h1>Race Setup</h1>
      <p className="lede">
        Time or laps, checks, and start rows. A class can leave on more than one row.
        Every edit is logged.
      </p>
    </header>
  );
}

function describeLength(length: RaceLength): string {
  if (length.mode === "time") {
    return `Time limit: ${length.minutes} minutes, counted from each row's own start.`;
  }
  if (length.laps === null) {
    return "Lap race. It runs until the finish. There is no time limit.";
  }
  return `Lap race. ${length.laps} ${length.laps === 1 ? "lap" : "laps"} to the finish. There is no time limit.`;
}

function lengthFromForm(
  mode: RaceLength["mode"],
  minutes: string,
  laps: string,
): RaceLength {
  if (mode === "time") return { mode: "time", minutes: Number(minutes) };
  const trimmed = laps.trim();
  return { mode: "laps", laps: trimmed === "" ? null : Number(trimmed) };
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function CheckName({ name, onSave }: { name: string; onSave: (name: string) => void }) {
  const [value, setValue] = useState(name);
  useEffect(() => setValue(name), [name]);
  return (
    <input
      aria-label={`Check name ${name}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value.trim() && value.trim() !== name) onSave(value);
      }}
    />
  );
}

function RowLabel({ label, onSave }: { label: string; onSave: (label: string) => void }) {
  const [value, setValue] = useState(label);
  useEffect(() => setValue(label), [label]);
  return (
    <input
      aria-label={`Start row ${label}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value.trim() && value.trim() !== label) onSave(value);
      }}
    />
  );
}

function AddClass({ onAdd }: { onAdd: (riderClass: RiderClass) => void }) {
  const [riderClass, setRiderClass] = useState<RiderClass | "">("");
  return (
    <div className="inline">
      <select
        aria-label="Class to add to this row"
        value={riderClass}
        onChange={(event) => setRiderClass(event.target.value as RiderClass | "")}
      >
        <option value="">Add a class to this row</option>
        {RIDER_CLASSES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="ghost"
        disabled={riderClass === ""}
        onClick={() => {
          if (riderClass === "") return;
          onAdd(riderClass);
          setRiderClass("");
        }}
      >
        Add class
      </button>
    </div>
  );
}
