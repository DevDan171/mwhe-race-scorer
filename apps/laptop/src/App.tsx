import { useHub } from "./use-hub";
import { Changelog } from "./screens/Changelog";
import { RacePrep } from "./screens/RacePrep";
import { RaceSetup } from "./screens/RaceSetup";
import { Registration } from "./screens/Registration";
import { Banner } from "./ui";

const NAV = [
  { id: "prep", label: "Race Prep" },
  { id: "setup", label: "Race Setup" },
  { id: "registration", label: "Registration" },
  { id: "changelog", label: "Changelog" },
] as const;

export function App() {
  const hub = useHub();

  if (hub.bootError) {
    return (
      <main className="boot">
        <Banner tone="error">{hub.bootError}</Banner>
      </main>
    );
  }

  if (!hub.ready) {
    return (
      <main className="boot">
        <p>Opening the race database…</p>
      </main>
    );
  }

  return (
    <div className="app">
      <nav aria-label="Sections">
        <div className="brand">
          <span>MWHE</span>
          <strong>Race Scorer</strong>
        </div>
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={hub.screen === item.id ? "nav active" : "nav"}
            aria-current={hub.screen === item.id ? "page" : undefined}
            onClick={() => hub.setScreen(item.id)}
          >
            {item.label}
          </button>
        ))}
        <p className="nav-foot">
          {hub.state
            ? `${hub.state.race.event.name} · v${hub.state.rosterVersion}`
            : "No race downloaded"}
        </p>
      </nav>
      <main>
        {hub.screen === "prep" ? <RacePrep /> : null}
        {hub.screen === "setup" ? <RaceSetup /> : null}
        {hub.screen === "registration" ? <Registration /> : null}
        {hub.screen === "changelog" ? <Changelog /> : null}
      </main>
    </div>
  );
}
