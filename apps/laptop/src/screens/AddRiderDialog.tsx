import {
  RIDER_CLASSES,
  SAFETY_ACKNOWLEDGEMENT,
  SAFETY_CHECKBOX_LABEL,
  addSeriesRiderToEvent,
  raceOffersClass,
  registerRider,
  searchSeriesRiders,
  setRiderPlacements,
  type RacePlacement,
  type RiderClass,
  type SeriesRider,
  type SeriesRiderUpload,
} from "@mwhe/core";
import { useMemo, useState } from "react";

import { messageOf } from "../message";
import { useHub } from "../use-hub";
import { Banner, Field, Modal } from "../ui";

export function AddRiderDialog({ onClose }: { onClose: () => void }) {
  const hub = useHub();
  const state = hub.state;
  const [tab, setTab] = useState<"series" | "new">("new");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<SeriesRider | null>(null);
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [number, setNumber] = useState("");
  const [riderClass, setRiderClass] = useState<RiderClass | "">("");
  const [payment, setPayment] = useState("unpaid");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emName, setEmName] = useState("");
  const [emPhone, setEmPhone] = useState("");
  const [emRelation, setEmRelation] = useState("");
  const [addToSeries, setAddToSeries] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [placements, setPlacements] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(
    () => (state ? searchSeriesRiders(state.race.riders, query).slice(0, 6) : []),
    [state, query],
  );

  if (!state) return null;
  const activeClass: RiderClass | "" =
    tab === "series" ? (picked?.class ?? "") : riderClass;
  const needsSafety =
    tab === "new" || (picked ? picked.safetyAcknowledged !== true : true);
  const canSave = !needsSafety || accepted;

  function toggleRace(raceId: string, on: boolean) {
    setPlacements((current) => {
      const next = { ...current };
      if (on) next[raceId] = null;
      else delete next[raceId];
      return next;
    });
  }

  async function save() {
    setError(null);
    if (!canSave) return;
    setBusy(true);
    try {
      const chosen: RacePlacement[] = Object.entries(placements).map(([raceId, row]) => ({
        raceId,
        row,
      }));
      if (tab === "series") {
        if (!picked) throw new Error("Pick a series rider.");
        const seriesId = picked.seriesId;
        const riderNumber = picked.number;
        const second = crypto.randomUUID();
        await hub.change("Added at registration", (current, audit) => {
          const added = addSeriesRiderToEvent(current, { seriesId, audit });
          if (chosen.length === 0) return added;
          return setRiderPlacements(added, {
            riderNumber,
            placements: chosen,
            audit: {
              ...audit,
              entryId: second,
              why: "Races and rows chosen at registration",
            },
          });
        });
      } else {
        if (!first.trim() || !last.trim())
          throw new Error("First and last name are required.");
        if (riderClass === "") throw new Error("Choose a class.");
        const seriesId = `dayof-${crypto.randomUUID()}`;
        const riderNumber = Number(number);
        const klass = riderClass;
        const acceptedAt = new Date().toISOString();
        await hub.change("Added at registration", (current, audit) =>
          registerRider(current, {
            seriesId,
            firstName: first,
            lastName: last,
            number: riderNumber,
            class: klass,
            payment,
            addToSeries,
            placements: chosen,
            contact: {
              dateOfBirth: birth || null,
              phone,
              email,
              emergencyContactName: emName,
              emergencyContactPhone: emPhone,
              emergencyContactRelation: emRelation,
              safetyAcknowledged: true,
              safetyAcknowledgedAt: acceptedAt,
            },
            audit,
          }),
        );
        if (addToSeries) {
          const upload: SeriesRiderUpload = {
            localId: seriesId,
            firstName: first.trim(),
            lastName: last.trim(),
            bikeNumber: riderNumber,
            riderClass: klass,
            payment,
            dateOfBirth: birth || null,
            phone: phone.trim() || null,
            email: email.trim() || null,
            emergencyContactName: emName.trim() || null,
            emergencyContactPhone: emPhone.trim() || null,
            emergencyContactRelation: emRelation.trim() || null,
            safetyAcknowledgedAt: acceptedAt,
          };
          await hub.queueSeriesUpload(upload);
        }
      }
      onClose();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Add rider · ${state.race.event.name}`} wide onClose={onClose}>
      <div className="tabs" role="tablist">
        <button
          type="button"
          className={tab === "series" ? "active" : ""}
          onClick={() => setTab("series")}
        >
          From series
        </button>
        <button
          type="button"
          className={tab === "new" ? "active" : ""}
          onClick={() => setTab("new")}
        >
          New rider
        </button>
      </div>
      {error ? <Banner tone="error">{error}</Banner> : null}
      <div className="form-grid">
        <div className="stack">
          {tab === "series" ? (
            <>
              <Field label="Name or number">
                <input value={query} onChange={(event) => setQuery(event.target.value)} />
              </Field>
              {matches.map((rider) => (
                <button
                  key={rider.seriesId}
                  type="button"
                  className={picked?.seriesId === rider.seriesId ? "btn primary" : "btn"}
                  onClick={() => setPicked(rider)}
                >
                  #{rider.number} {rider.name} · {rider.class}
                </button>
              ))}
            </>
          ) : (
            <>
              <div className="inline">
                <Field label="First name">
                  <input
                    value={first}
                    onChange={(event) => setFirst(event.target.value)}
                  />
                </Field>
                <Field label="Last name">
                  <input value={last} onChange={(event) => setLast(event.target.value)} />
                </Field>
              </div>
              <div className="inline">
                <Field label="Number (whole number)">
                  <input
                    inputMode="numeric"
                    value={number}
                    onChange={(event) => setNumber(event.target.value)}
                  />
                </Field>
                <Field label="Class">
                  <select
                    value={riderClass}
                    onChange={(event) => {
                      setRiderClass(event.target.value as RiderClass | "");
                      setPlacements({});
                    }}
                  >
                    <option value="">Choose</option>
                    {RIDER_CLASSES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Payment">
                  <select
                    value={payment}
                    onChange={(event) => setPayment(event.target.value)}
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </Field>
              </div>
              <div className="inline">
                <Field label="Date of birth">
                  <input
                    type="date"
                    value={birth}
                    onChange={(event) => setBirth(event.target.value)}
                  />
                </Field>
                <Field label="Phone">
                  <input
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <fieldset className="safety">
                <legend>Emergency contact</legend>
                <div className="inline">
                  <Field label="Name">
                    <input
                      value={emName}
                      onChange={(event) => setEmName(event.target.value)}
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      value={emPhone}
                      onChange={(event) => setEmPhone(event.target.value)}
                    />
                  </Field>
                </div>
                <Field label="Relation">
                  <input
                    value={emRelation}
                    onChange={(event) => setEmRelation(event.target.value)}
                  />
                </Field>
              </fieldset>
              <label className="check">
                <input
                  type="checkbox"
                  checked={addToSeries}
                  onChange={(event) => setAddToSeries(event.target.checked)}
                />
                <span>
                  Add to series (upload to site when online)
                  <small className="hint">
                    Creates a series rider record on midwesthardenduro.com next time this
                    laptop is online. Uploads once.
                  </small>
                </span>
              </label>
            </>
          )}
        </div>
        <div className="stack">
          <h3>Races</h3>
          <p className="hint">
            Pick the races for this rider. Rows shown are only for their class.
          </p>
          {state.race.races.map((race) => {
            const allowed = activeClass ? raceOffersClass(race, activeClass) : false;
            const on = placements[race.id] !== undefined;
            const rows = activeClass
              ? race.startRows.filter((row) => row.classes.includes(activeClass))
              : [];
            return (
              <div key={race.id} className="card" style={{ padding: 10 }}>
                <label className="check">
                  <input
                    type="checkbox"
                    disabled={!allowed}
                    checked={on}
                    onChange={(event) => toggleRace(race.id, event.target.checked)}
                  />
                  <span>
                    {race.name}
                    <small className="hint">
                      {allowed
                        ? `Rows ${rows.map((row) => row.order).join(", ")} hold class ${activeClass}`
                        : activeClass
                          ? `Class ${activeClass} doesn't run in this race`
                          : "Choose a class first"}
                    </small>
                  </span>
                </label>
                {on ? (
                  <Field label="Row">
                    <select
                      value={placements[race.id] ?? ""}
                      onChange={(event) => {
                        const value = event.target.value;
                        setPlacements((current) => ({
                          ...current,
                          [race.id]: value === "" ? null : Number(value),
                        }));
                      }}
                    >
                      <option value="">Unassigned (registration order)</option>
                      {rows.map((row) => (
                        <option key={row.id} value={row.order}>
                          Row {row.order} · {row.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>
            );
          })}
          {needsSafety ? (
            <div className="safety">
              <strong>Safety acknowledgement</strong>
              <p>{SAFETY_ACKNOWLEDGEMENT}</p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(event) => setAccepted(event.target.checked)}
                />
                <span>{SAFETY_CHECKBOX_LABEL}</span>
              </label>
            </div>
          ) : (
            <Banner tone="ok">
              Safety acknowledgement is already on file for this series rider.
            </Banner>
          )}
        </div>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="hint">
          Save is off until the safety box is checked.
          {hub.account ? ` Added by ${hub.account.name}, logged automatically.` : ""}
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!canSave || busy}
            onClick={() => void save()}
          >
            Save rider
          </button>
        </div>
      </div>
    </Modal>
  );
}
