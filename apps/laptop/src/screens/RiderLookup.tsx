import { hasEmergencyContact, type EventRegistration } from "@mwhe/core";
import { useMemo, useState } from "react";

import { formatBirth, formatWhen } from "../format";
import { useHub } from "../use-hub";
import { Banner } from "../ui";

export function RiderLookup() {
  const hub = useHub();
  const [number, setNumber] = useState("");
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<number | null>(null);

  const registrations = hub.state?.race.registrations;
  const match = useMemo(() => {
    const riders = registrations ?? [];
    if (picked !== null)
      return riders.find((rider) => rider.riderNumber === picked) ?? null;
    const plate = Number(number.replace(/[^\d]/g, ""));
    if (Number.isInteger(plate) && plate > 0) {
      return riders.find((rider) => rider.riderNumber === plate) ?? null;
    }
    const needle = name.trim().toLowerCase();
    if (!needle) return null;
    return riders.find((rider) => rider.name.toLowerCase().includes(needle)) ?? null;
  }, [registrations, number, name, picked]);

  if (!hub.state) {
    return (
      <div className="stack">
        <h1>Rider lookup</h1>
        <Banner tone="info">
          Import an event to look up emergency contacts offline.
        </Banner>
      </div>
    );
  }

  return (
    <div className="stack">
      <header className="page-head">
        <div>
          <h1>Rider lookup · Emergency card</h1>
          <p className="lede">Find any rider by number. Works with no internet.</p>
        </div>
        <span className="pill ok">
          <i className="dot" /> Works offline
        </span>
      </header>
      <div className="row no-print">
        <input
          className="search"
          aria-label="Rider number"
          placeholder="# 109"
          value={number}
          onChange={(event) => {
            setNumber(event.target.value);
            setPicked(null);
          }}
        />
        <input
          className="search"
          aria-label="Rider name"
          placeholder="or search by name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setPicked(null);
          }}
        />
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            if (match) setPicked(match.riderNumber);
          }}
        >
          Look up
        </button>
      </div>
      {number.trim() && !match ? (
        <Banner tone="info">No rider with that number is on this event.</Banner>
      ) : null}
      {match ? <EmergencyCard rider={match} races={hub.state.race.races} /> : null}
      {!hub.vaultReady ? (
        <Banner tone="info">Emergency info is still unlocking.</Banner>
      ) : null}
    </div>
  );
}

function EmergencyCard({
  rider,
  races,
}: {
  rider: EventRegistration;
  races: { id: string; name: string }[];
}) {
  const emergency = hasEmergencyContact(rider);
  const raceBits = races
    .map((race) => {
      const row = rider.assignedRows.find((assignment) => assignment.raceId === race.id);
      const entered = !rider.enteredRaceIds || rider.enteredRaceIds.includes(race.id);
      if (!entered) return null;
      return row ? `${race.name} · Row ${row.row}` : `${race.name} · Unassigned`;
    })
    .filter(Boolean);
  return (
    <article className="lookup-card">
      <header className="page-head">
        <div>
          <div className="plate-lg">#{rider.riderNumber}</div>
          <h2>{rider.name}</h2>
          <p className="hint">
            Class {rider.class}
            {raceBits.length ? ` · ${raceBits.join(" | ")}` : ""}
          </p>
        </div>
        {rider.payment === "unpaid" ? <span className="pill">Unpaid</span> : null}
      </header>
      <div className="detail-grid">
        <section>
          <h3 className="muted">DATE OF BIRTH</h3>
          <p>{formatBirth(rider.dateOfBirth)}</p>
          <h3 className="muted">RIDER PHONE</h3>
          <p>{rider.phone || "Not on file"}</p>
          <h3 className="muted">EMAIL</h3>
          <p>{rider.email || "Not on file"}</p>
        </section>
        <section className="emergency">
          <h3>EMERGENCY CONTACT</h3>
          {emergency ? (
            <>
              <p className="muted">NAME</p>
              <p>
                <strong>{rider.emergencyContactName}</strong>
              </p>
              <p className="muted">PHONE</p>
              <p>
                <strong>{rider.emergencyContactPhone || "Not on file"}</strong>
              </p>
              <p className="muted">RELATION</p>
              <p>
                <strong>{rider.emergencyContactRelation || "Not on file"}</strong>
              </p>
            </>
          ) : (
            <Banner tone="info">No emergency contact on file for this rider.</Banner>
          )}
        </section>
        <section>
          <h3 className="muted">SAFETY ACKNOWLEDGEMENT</h3>
          <p>
            {rider.safetyAcknowledged ? "Accepted" : "Not on file"}
            {rider.safetyAcknowledgedAt
              ? ` · ${formatWhen(rider.safetyAcknowledgedAt)}`
              : ""}
          </p>
          <h3 className="muted">REGISTERED</h3>
          <p>{rider.seriesId ? "Series rider" : "Race-day entry"}</p>
        </section>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="hint">
          Stored encrypted on this laptop. Never included in results or published files.
        </p>
        <button
          type="button"
          className="btn small no-print"
          onClick={() => window.print()}
        >
          Print card
        </button>
      </div>
    </article>
  );
}
