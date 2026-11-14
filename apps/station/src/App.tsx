import { Capacitor } from "@capacitor/core";
import { createDemoRace, projectPhoneRoster } from "@mwhe/core";
import { useMemo, useState } from "react";

export function App() {
  const roster = useMemo(() => projectPhoneRoster(createDemoRace().race), []);
  const [query, setQuery] = useState("");
  const visible = roster.riders.filter((rider) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      rider.name.toLowerCase().includes(needle) ||
      String(rider.number).includes(needle) ||
      rider.class.toLowerCase().includes(needle)
    );
  });

  return (
    <main>
      <header>
        <p className="eyebrow">Checkpoint station</p>
        <h1>MWHE Station</h1>
        <p className="lede">
          Phase 0 scaffold on {Capacitor.getPlatform()}. The phone roster from{" "}
          <code>@mwhe/core</code> is name, number, and class only. Punch capture ships
          later.
        </p>
      </header>

      <label className="search">
        Find a rider
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          inputMode="search"
          placeholder="Number, name, or class"
        />
      </label>

      <p className="count">
        {visible.length} of {roster.riders.length} on roster v{roster.version}
      </p>

      <ul>
        {visible.map((rider) => (
          <li key={rider.number}>
            <span className="number">#{rider.number}</span>
            <span className="name">{rider.name}</span>
            <span className="class">{rider.class}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
