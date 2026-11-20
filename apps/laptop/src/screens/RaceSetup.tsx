import {
  RIDER_CLASSES,
  addStartRow,
  assignRiderToRow,
  clearRiderRow,
  removeStartRow,
  raceEndWarning,
  rowPlannedStart,
  setPlannedStart,
  setRaceLength,
  setRowGapSeconds,
  unassignedInRace,
  type RaceLength,
  type RiderClass,
} from "@mwhe/core";
import { useState, type DragEvent } from "react";

import { CLASS_COLOR, formatClock, formatDay, lengthLabel } from "../format";
import { messageOf } from "../message";
import { useHub } from "../use-hub";
import { Banner } from "../ui";
import { AddRiderDialog } from "./AddRiderDialog";

export function RaceSetup() {
  const hub = useHub();
  const races = hub.state?.race.races ?? [];
  const [raceId, setRaceId] = useState(races[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newClass, setNewClass] = useState<RiderClass>("B");
  const [over, setOver] = useState<number | null>(null);
  const selected = races.find((race) => race.id === raceId) ?? races[0];

  if (!hub.state || !selected) {
    return (
      <div className="stack">
        <h1>Race setup</h1>
        <Banner tone="info">
          Import an event first. Race setup edits the copy on this laptop.
        </Banner>
      </div>
    );
  }

  const state = hub.state;
  const race = selected;
  const unassigned = unassignedInRace(race, state.race.registrations, state.race.races);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  function ridersOn(order: number) {
    return state.race.registrations.filter((registration) =>
      registration.assignedRows.some(
        (assignment) => assignment.raceId === race.id && assignment.row === order,
      ),
    );
  }

  function dropOnRow(order: number, event: DragEvent) {
    event.preventDefault();
    setOver(null);
    const riderNumber = Number(event.dataTransfer.getData("text/plain"));
    if (!Number.isInteger(riderNumber)) return;
    void run(() =>
      hub.change("Moved to a start row", (current, audit) =>
        assignRiderToRow(current, { riderNumber, raceId: race.id, row: order, audit }),
      ),
    );
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Race setup · {state.race.event.name}</h1>
          <p className="lede">
            {formatDay(state.race.event.date)}. Start rows are numbered across the whole
            race.
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => hub.setScreen("events")}>
            Re-import
          </button>
          <button type="button" className="btn primary" onClick={() => setError(null)}>
            Save setup
          </button>
        </div>
      </header>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="race-tabs" role="tablist">
        {races.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={entry.id === race.id ? "active" : ""}
            onClick={() => setRaceId(entry.id)}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <div className="meta">
        <div>
          <b>LENGTH</b>
          {lengthLabel(race.length)}
        </div>
        <div>
          <b>ROW GAP</b>
          {race.rowGapSeconds} s
        </div>
        <div>
          <b>ROW 1 START</b>
          {formatClock(race.plannedStart)}
        </div>
        <div>
          <b>CHECKS</b>
          <span className="row">
            {race.checks.map((check) => (
              <span key={check.id} className="chip">
                {check.name}
              </span>
            ))}
          </span>
        </div>
      </div>
      <p className="hint">
        Row N starts at row 1 + {race.rowGapSeconds} s × (N−1). Minutes count from each
        row’s own start.
      </p>
      {raceEndWarning(race.length) ? (
        <Banner tone="error">{raceEndWarning(race.length)}</Banner>
      ) : null}
      <LengthEditor
        raceId={race.id}
        onSave={(length) =>
          void run(() =>
            hub.change("Race length updated", (current, audit) =>
              setRaceLength(current, {
                raceId: race.id,
                length,
                audit,
              }),
            ),
          )
        }
        onGap={(rowGapSeconds) =>
          void run(() =>
            hub.change("Row gap updated", (current, audit) =>
              setRowGapSeconds(current, { raceId: race.id, rowGapSeconds, audit }),
            ),
          )
        }
        onStart={(plannedStart) =>
          void run(() =>
            hub.change("Row 1 start updated", (current, audit) =>
              setPlannedStart(current, { raceId: race.id, plannedStart, audit }),
            ),
          )
        }
      />
      <div className="setup-grid">
        <section className="stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Start rows ({race.startRows.length})</h2>
            <div className="row">
              <select
                aria-label="Class for the new row"
                value={newClass}
                onChange={(event) => setNewClass(event.target.value as RiderClass)}
                style={{ width: "auto" }}
              >
                {RIDER_CLASSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn primary small"
                onClick={() =>
                  void run(() =>
                    hub.change("Row added", (current, audit) =>
                      addStartRow(current, {
                        raceId: race.id,
                        riderClass: newClass,
                        rowId: `${race.id}-row-${crypto.randomUUID()}`,
                        audit,
                      }),
                    ),
                  )
                }
              >
                + Add row
              </button>
            </div>
          </div>
          <p className="hint">
            Trash icon removes a row. Its riders move to “Not assigned”.
          </p>
          {[...race.startRows]
            .sort((a, b) => a.order - b.order)
            .map((row) => {
              const color = CLASS_COLOR[row.classes[0] ?? ""] ?? "#8d99a8";
              const seated = ridersOn(row.order);
              return (
                <article
                  key={row.id}
                  className={over === row.order ? "row-card over" : "row-card"}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setOver(row.order);
                  }}
                  onDragLeave={() => setOver(null)}
                  onDrop={(event) => dropOnRow(row.order, event)}
                >
                  <i className="swatch" style={{ background: color }} />
                  <div>
                    <div className="row">
                      <strong>Row {row.order}</strong>
                      <span className="class-chip" style={{ background: color }}>
                        {row.classes.join(" · ") || row.label}
                      </span>
                      <span className="muted">
                        {formatClock(rowPlannedStart(race, row.order))}
                      </span>
                    </div>
                    <div className="row" style={{ marginTop: 6 }}>
                      {seated.length === 0 ? (
                        <span className="hint">
                          Empty — drop riders of this class here
                        </span>
                      ) : (
                        seated.map((rider) => (
                          <span
                            key={rider.riderNumber}
                            className="rider-chip"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                "text/plain",
                                String(rider.riderNumber),
                              );
                            }}
                          >
                            #{rider.riderNumber}
                            <button
                              type="button"
                              aria-label={`Unassign ${rider.name}`}
                              onClick={() =>
                                void run(() =>
                                  hub.change(
                                    "Moved off the start row",
                                    (current, audit) =>
                                      clearRiderRow(current, {
                                        riderNumber: rider.riderNumber,
                                        raceId: race.id,
                                        audit,
                                      }),
                                  ),
                                )
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="muted">
                    {seated.length} rider{seated.length === 1 ? "" : "s"}
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove row ${row.order}`}
                      onClick={() =>
                        void run(() =>
                          hub.change("Row removed", (current, audit) =>
                            removeStartRow(current, {
                              raceId: race.id,
                              startRowId: row.id,
                              audit,
                            }),
                          ),
                        )
                      }
                    >
                      {" "}
                      ⌫
                    </button>
                  </div>
                </article>
              );
            })}
        </section>
        <aside className="side-card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Not assigned to a row</h2>
            <span className="pill">{unassigned.length} riders</span>
          </div>
          {groupByClass(unassigned).map(([riderClass, riders]) => {
            const rows = race.startRows.filter((row) => row.classes.includes(riderClass));
            return (
              <div key={riderClass} className="class-group">
                <h3 style={{ color: CLASS_COLOR[riderClass] ?? "inherit" }}>
                  {riderClass}
                </h3>
                <p className="hint">
                  {riders.length} rider{riders.length === 1 ? "" : "s"} · fits{" "}
                  {rows.length
                    ? `Rows ${rows.map((row) => row.order).join(", ")}`
                    : "no row"}
                </p>
                <div className="row">
                  {riders.map((rider) => (
                    <span
                      key={rider.riderNumber}
                      className="rider-chip"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData(
                          "text/plain",
                          String(rider.riderNumber),
                        );
                      }}
                    >
                      #{rider.riderNumber} {rider.name.split(" ")[0]}
                    </span>
                  ))}
                </div>
                {riders.map((rider) => (
                  <label key={`${rider.riderNumber}-row`} className="field">
                    <span>
                      #{rider.riderNumber} {rider.name}
                    </span>
                    <select
                      value=""
                      onChange={(event) => {
                        const row = Number(event.target.value);
                        if (!row) return;
                        void run(() =>
                          hub.change("Moved to a start row", (current, audit) =>
                            assignRiderToRow(current, {
                              riderNumber: rider.riderNumber,
                              raceId: race.id,
                              row,
                              audit,
                            }),
                          ),
                        );
                      }}
                    >
                      <option value="">Place on a row…</option>
                      {rows.map((row) => (
                        <option key={row.id} value={row.order}>
                          Row {row.order}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            );
          })}
          <p className="drop-hint">
            Drag a rider onto a row of their own class. Rows of other classes won’t accept
            them.
          </p>
          <p className="hint">
            Unassigned riders line up in registration order after their class’s last row.
          </p>
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            + Add rider to this race
          </button>
        </aside>
      </div>
      {adding ? <AddRiderDialog onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function groupByClass(
  riders: { riderNumber: number; name: string; class: RiderClass }[],
): [RiderClass, typeof riders][] {
  const groups = new Map<RiderClass, typeof riders>();
  for (const rider of riders) {
    const list = groups.get(rider.class) ?? [];
    list.push(rider);
    groups.set(rider.class, list);
  }
  return [...groups.entries()];
}

function LengthEditor({
  raceId,
  onSave,
  onGap,
  onStart,
}: {
  raceId: string;
  onSave: (length: RaceLength) => void;
  onGap: (seconds: number) => void;
  onStart: (value: string | null) => void;
}) {
  const [mode, setMode] = useState<"time" | "laps">("laps");
  const [amount, setAmount] = useState("");
  const [gap, setGap] = useState("");
  const [start, setStart] = useState("");
  return (
    <details className="card" style={{ padding: 12 }}>
      <summary>Edit end mode, row gap, or row 1 start</summary>
      <div className="inline" style={{ marginTop: 10 }}>
        <label className="field">
          End mode
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value === "time" ? "time" : "laps")}
          >
            <option value="laps">Lap count</option>
            <option value="time">Time limit</option>
          </select>
        </label>
        <label className="field">
          {mode === "laps" ? "Laps" : "Minutes"}
          <input
            value={amount}
            inputMode="numeric"
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn small"
          onClick={() => {
            const value = Number(amount);
            onSave(
              mode === "laps"
                ? { mode: "laps", laps: value }
                : { mode: "time", minutes: value },
            );
          }}
        >
          Save end mode
        </button>
        <label className="field">
          Row gap seconds
          <input
            value={gap}
            inputMode="numeric"
            onChange={(event) => setGap(event.target.value)}
          />
        </label>
        <button type="button" className="btn small" onClick={() => onGap(Number(gap))}>
          Save gap
        </button>
        <label className="field">
          Row 1 start
          <input
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn small"
          onClick={() => onStart(start ? new Date(start).toISOString() : null)}
        >
          Save start
        </button>
      </div>
      <p className="hint">Changes are logged with your name. Race id {raceId}.</p>
    </details>
  );
}
