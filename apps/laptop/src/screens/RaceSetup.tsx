import {
  moveCheck,
  moveClassToStartRow,
  renameCheck,
  renameStartRow,
  RIDER_CLASSES,
  setRaceLaps,
  setRaceTimeLimit,
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
  const [minutes, setMinutes] = useState("");
  const [laps, setLaps] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    setMinutes(String(selected.timeLimitMinutes));
    setLaps(String(selected.laps));
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
        <h2>Time limit</h2>
        <div className="inline">
          <Field label="Minutes">
            <input
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="primary"
            onClick={() =>
              void run(() =>
                hub.change(why, (current, audit) =>
                  setRaceTimeLimit(current, {
                    raceId: race.id,
                    timeLimitMinutes: Number(minutes),
                    audit,
                  }),
                ),
              )
            }
          >
            Save time limit
          </button>
        </div>
        <div className="inline">
          <Field label="Laps">
            <input
              inputMode="numeric"
              value={laps}
              onChange={(event) => setLaps(event.target.value)}
            />
          </Field>
          <button
            type="button"
            className="primary"
            onClick={() =>
              void run(() =>
                hub.change(why, (current, audit) =>
                  setRaceLaps(current, { raceId: race.id, laps: Number(laps), audit }),
                ),
              )
            }
          >
            Save laps
          </button>
        </div>
        <p className="hint">
          Checks are listed once, in lap order, and ridden {race.laps}{" "}
          {race.laps === 1 ? "time" : "times"}.
        </p>
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
        <div className="stack">
          {[...race.startRows]
            .sort((a, b) => a.order - b.order)
            .map((row) => (
              <article key={row.id} className="row-card">
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
                    </span>
                  ))}
                </div>
                <MoveClass
                  onMove={(riderClass) =>
                    void run(() =>
                      hub.change(why, (current, audit) =>
                        moveClassToStartRow(current, {
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
        Time limit, checks in lap order, start rows, and classes. Every edit is logged.
      </p>
    </header>
  );
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

function MoveClass({ onMove }: { onMove: (riderClass: RiderClass) => void }) {
  const [riderClass, setRiderClass] = useState<RiderClass | "">("");
  return (
    <div className="inline">
      <select
        aria-label="Class to put on this row"
        value={riderClass}
        onChange={(event) => setRiderClass(event.target.value as RiderClass | "")}
      >
        <option value="">Move a class here</option>
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
          onMove(riderClass);
          setRiderClass("");
        }}
      >
        Move class
      </button>
    </div>
  );
}
