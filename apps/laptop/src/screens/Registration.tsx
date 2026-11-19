import {
  changeRiderClass,
  changeRiderNumber,
  RIDER_CLASSES,
  type RiderClass,
} from "@mwhe/core";
import { useState } from "react";

import { messageOf } from "../message";
import { useHub } from "../use-hub";
import { Banner } from "../ui";
import { AddRiderDialog } from "./AddRiderDialog";

export function Registration() {
  const hub = useHub();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [numberEdit, setNumberEdit] = useState<number | null>(null);
  const [nextNumber, setNextNumber] = useState("");
  const [nextClass, setNextClass] = useState<RiderClass | "">("");

  if (!hub.state) {
    return (
      <div className="stack">
        <h1>Registration</h1>
        <Banner tone="info">Import an event first.</Banner>
      </div>
    );
  }

  const state = hub.state;
  const dayOf = new Set(state.dayOfRegistrations.map((entry) => entry.number));

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(messageOf(caught));
    }
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Registration · {state.race.event.name}</h1>
          <p className="lede">
            {state.race.registrations.length} riders on this event. Adding a rider does
            not ask for a reason. The changelog still records who and when.
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setAdding(true)}>
          + Add rider
        </button>
      </header>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <p className="banner banner-ok">Searching and saving stay on this laptop.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>NUMBER</th>
              <th>NAME</th>
              <th>CLASS</th>
              <th>PAYMENT</th>
              <th>RACES</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...state.race.registrations]
              .sort((a, b) => a.riderNumber - b.riderNumber)
              .map((rider) => (
                <tr key={rider.riderNumber}>
                  <td>#{rider.riderNumber}</td>
                  <td>
                    {rider.name}{" "}
                    {dayOf.has(rider.riderNumber) ? (
                      <span className="pill">Race day</span>
                    ) : null}
                  </td>
                  <td>{rider.class}</td>
                  <td>
                    {rider.payment === "unpaid"
                      ? "Unpaid"
                      : rider.payment === "paid"
                        ? "Paid"
                        : "—"}
                  </td>
                  <td>{rider.enteredRaceIds?.length ?? "Class races"}</td>
                  <td>
                    {numberEdit === rider.riderNumber ? (
                      <div className="row">
                        <input
                          aria-label="New number"
                          style={{ width: 80 }}
                          value={nextNumber}
                          onChange={(event) => setNextNumber(event.target.value)}
                        />
                        <select
                          aria-label="New class"
                          value={nextClass}
                          onChange={(event) =>
                            setNextClass(event.target.value as RiderClass)
                          }
                        >
                          {RIDER_CLASSES.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() =>
                            void run(async () => {
                              const currentNumber = rider.riderNumber;
                              const klass = nextClass || rider.class;
                              const plate = Number(nextNumber);
                              await hub.change(
                                "Updated at registration",
                                (current, audit) => {
                                  let next = current;
                                  if (plate !== currentNumber) {
                                    next = changeRiderNumber(next, {
                                      riderNumber: currentNumber,
                                      nextNumber: plate,
                                      audit,
                                    });
                                  }
                                  if (klass !== rider.class) {
                                    next = changeRiderClass(next, {
                                      riderNumber: plate,
                                      nextClass: klass,
                                      audit: { ...audit, entryId: crypto.randomUUID() },
                                    });
                                  }
                                  return next;
                                },
                              );
                              setNumberEdit(null);
                            })
                          }
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => {
                          setNumberEdit(rider.riderNumber);
                          setNextNumber(String(rider.riderNumber));
                          setNextClass(rider.class);
                        }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {adding ? <AddRiderDialog onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
