import {
  addSeriesRiderToEvent,
  changeRiderClass,
  changeRiderNumber,
  RIDER_CLASSES,
  registerNewRider,
  searchSeriesRiders,
  type RiderClass,
  type SeriesRider,
} from "@mwhe/core";
import { useMemo, useState } from "react";

import { useHub } from "../use-hub";
import { messageOf } from "../message";
import { Banner, Field } from "../ui";

export function Registration() {
  const hub = useHub();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<SeriesRider | null>(null);
  const [addReason, setAddReason] = useState("");
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [newClass, setNewClass] = useState<RiderClass | "">("");
  const [newReason, setNewReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const riders = hub.state?.race.riders;
  const matches = useMemo(
    () => (riders ? searchSeriesRiders(riders, query) : []),
    [riders, query],
  );

  if (!hub.state) {
    return (
      <div className="stack">
        <PageTitle version={null} />
        <Banner tone="info">Download a race package on Race Prep first.</Banner>
      </div>
    );
  }

  const state = hub.state;
  const entered = new Set(state.race.registrations.map((entry) => entry.riderNumber));
  const dayOf = new Set(state.dayOfRegistrations.map((entry) => entry.number));

  async function run(action: () => Promise<void>): Promise<boolean> {
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      setError(messageOf(caught));
      return false;
    }
  }

  return (
    <div className="stack">
      <PageTitle version={state.rosterVersion} />
      {error ? <Banner tone="error">{error}</Banner> : null}
      <p className="offline">
        Searching and saving stay on this laptop. No network call is made.
      </p>

      <div className="split">
        <section className="panel">
          <h2>Series riders</h2>
          <Field label="Name or number">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPicked(null);
              }}
              placeholder="Hargrove or 18"
              autoComplete="off"
            />
          </Field>
          <div className="stack tight">
            {query.trim() && matches.length === 0 ? (
              <p className="hint">No series rider matches that.</p>
            ) : null}
            {matches.slice(0, 8).map((rider) => {
              const onRoster = entered.has(rider.number);
              const active = picked?.seriesId === rider.seriesId;
              return (
                <button
                  key={rider.seriesId}
                  type="button"
                  className={active ? "rider pick active" : "rider pick"}
                  onClick={() => setPicked(rider)}
                >
                  <span className="plate">{rider.number}</span>
                  <span>
                    <strong>{rider.name}</strong>
                    <small>{rider.class}</small>
                  </span>
                  <span className="tag">{onRoster ? "On the roster" : "Series"}</span>
                </button>
              );
            })}
          </div>
          {picked ? (
            <div className="stack tight">
              <p>
                <strong>{picked.name}</strong> · #{picked.number} · {picked.class}
              </p>
              <Field label="Reason">
                <input
                  value={addReason}
                  onChange={(event) => setAddReason(event.target.value)}
                  placeholder="Signed up at the trailer"
                />
              </Field>
              <button
                type="button"
                className="primary"
                disabled={entered.has(picked.number)}
                onClick={() =>
                  void run(async () => {
                    const seriesId = picked.seriesId;
                    await hub.change(addReason, (current, audit) =>
                      addSeriesRiderToEvent(current, { seriesId, audit }),
                    );
                    setAddReason("");
                    setPicked(null);
                    setQuery("");
                  })
                }
              >
                {entered.has(picked.number)
                  ? "Already on the event"
                  : "Add to this event"}
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h2>New rider</h2>
          <p className="hint">
            Saves a series registration and an event registration together. The number has
            to be unused across the whole series. The rider is marked day-of for the later
            push.
          </p>
          <Field label="Name">
            <input value={newName} onChange={(event) => setNewName(event.target.value)} />
          </Field>
          <Field label="Number">
            <input
              inputMode="numeric"
              value={newNumber}
              onChange={(event) => setNewNumber(event.target.value)}
            />
          </Field>
          <Field label="Class">
            <select
              value={newClass}
              onChange={(event) => setNewClass(event.target.value as RiderClass | "")}
            >
              <option value="">Choose a class</option>
              {RIDER_CLASSES.map((riderClass) => (
                <option key={riderClass} value={riderClass}>
                  {riderClass}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason">
            <input
              value={newReason}
              onChange={(event) => setNewReason(event.target.value)}
              placeholder="New rider at sign-up"
            />
          </Field>
          <button
            type="button"
            className="primary"
            onClick={() =>
              void run(async () => {
                if (newClass === "") throw new Error("Choose a class.");
                const riderClass = newClass;
                await hub.change(newReason, (current, audit) =>
                  registerNewRider(current, {
                    seriesId: `dayof-${crypto.randomUUID()}`,
                    name: newName,
                    number: Number(newNumber),
                    class: riderClass,
                    audit,
                  }),
                );
                setNewName("");
                setNewNumber("");
                setNewClass("");
                setNewReason("");
              })
            }
          >
            Register for series and event
          </button>
        </section>
      </div>

      <section className="panel">
        <h2>Event roster</h2>
        <div className="stack tight">
          {[...state.race.registrations]
            .sort((a, b) => a.riderNumber - b.riderNumber)
            .map((entry) => (
              <RosterRow
                key={entry.seriesId ?? entry.riderNumber}
                number={entry.riderNumber}
                name={entry.name}
                riderClass={entry.class}
                dayOf={dayOf.has(entry.riderNumber)}
                onNumber={(nextNumber, why) =>
                  run(() =>
                    hub.change(why, (current, audit) =>
                      changeRiderNumber(current, {
                        riderNumber: entry.riderNumber,
                        nextNumber,
                        audit,
                      }),
                    ),
                  )
                }
                onClass={(nextClass, why) =>
                  run(() =>
                    hub.change(why, (current, audit) =>
                      changeRiderClass(current, {
                        riderNumber: entry.riderNumber,
                        nextClass,
                        audit,
                      }),
                    ),
                  )
                }
              />
            ))}
        </div>
      </section>
    </div>
  );
}

function PageTitle({ version }: { version: number | null }) {
  return (
    <header className="page-head">
      <p className="eyebrow">Offline</p>
      <h1>Registration</h1>
      <p className="lede">
        {version === null
          ? "Add series riders or register someone new."
          : `Roster version ${version}. A number already used in the series cannot be chosen again.`}
      </p>
    </header>
  );
}

function RosterRow({
  number,
  name,
  riderClass,
  dayOf,
  onNumber,
  onClass,
}: {
  number: number;
  name: string;
  riderClass: RiderClass;
  dayOf: boolean;
  onNumber: (nextNumber: number, why: string) => Promise<boolean>;
  onClass: (nextClass: RiderClass, why: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState<"number" | "class" | null>(null);
  const [nextNumber, setNextNumber] = useState(String(number));
  const [nextClass, setNextClass] = useState<RiderClass>(riderClass);
  const [why, setWhy] = useState("");

  return (
    <article className="roster">
      <div className="rider static">
        <span className="plate">{number}</span>
        <span>
          <strong>{name}</strong>
          <small>{riderClass}</small>
        </span>
        {dayOf ? (
          <span className="tag day">Day-of</span>
        ) : (
          <span className="tag">Entered</span>
        )}
      </div>
      <div className="row tight">
        <button
          type="button"
          className="ghost"
          onClick={() => setOpen(open === "number" ? null : "number")}
        >
          Change number
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setOpen(open === "class" ? null : "class")}
        >
          Change class
        </button>
      </div>
      {open ? (
        <div className="inline">
          {open === "number" ? (
            <Field label="New number">
              <input
                inputMode="numeric"
                value={nextNumber}
                onChange={(event) => setNextNumber(event.target.value)}
              />
            </Field>
          ) : (
            <Field label="New class">
              <select
                value={nextClass}
                onChange={(event) => setNextClass(event.target.value as RiderClass)}
              >
                {RIDER_CLASSES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Reason">
            <input value={why} onChange={(event) => setWhy(event.target.value)} />
          </Field>
          <button
            type="button"
            className="primary"
            onClick={() => {
              void (async () => {
                const ok =
                  open === "number"
                    ? await onNumber(Number(nextNumber), why)
                    : await onClass(nextClass, why);
                if (!ok) return;
                setWhy("");
                setOpen(null);
              })();
            }}
          >
            Save change
          </button>
        </div>
      ) : null}
    </article>
  );
}
