import { roleLabel } from "./format";
import { Changelog } from "./screens/Changelog";
import { Events } from "./screens/Events";
import { RaceSetup } from "./screens/RaceSetup";
import { Registration } from "./screens/Registration";
import { Results } from "./screens/Results";
import { RiderLookup } from "./screens/RiderLookup";
import { Scoring } from "./screens/Scoring";
import { Settings } from "./screens/Settings";
import { SignIn } from "./screens/SignIn";
import { UpdatePrompt } from "./screens/UpdatePrompt";
import { useAppVersion } from "./use-app-version";
import { useHub, type ScreenId } from "./use-hub";
import { Banner, Logo, OfflinePill, SignedInPill } from "./ui";

const EVENT_NAV: { id: ScreenId; label: string }[] = [
  { id: "events", label: "Events" },
  { id: "setup", label: "Race setup" },
  { id: "registration", label: "Registration" },
  { id: "lookup", label: "Rider lookup" },
  { id: "scoring", label: "Scoring" },
  { id: "results", label: "Results" },
];

const SYSTEM_NAV: { id: ScreenId; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "changelog", label: "Changelog" },
];

export function App() {
  const hub = useHub();
  const version = useAppVersion();
  const signedOut = !hub.account && !hub.hasToken;
  const hasEvents = Object.keys(hub.events).length > 0;

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

  if (signedOut && !hasEvents) {
    return (
      <>
        <UpdatePrompt />
        <SignIn />
      </>
    );
  }

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Sections">
        <Logo />
        <p className="nav-label">EVENT</p>
        {EVENT_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={hub.screen === item.id ? "nav-button active" : "nav-button"}
            aria-current={hub.screen === item.id ? "page" : undefined}
            onClick={() => hub.setScreen(item.id)}
          >
            {item.label}
          </button>
        ))}
        <p className="nav-label">SYSTEM</p>
        {SYSTEM_NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={hub.screen === item.id ? "nav-button active" : "nav-button"}
            aria-current={hub.screen === item.id ? "page" : undefined}
            onClick={() => hub.setScreen(item.id)}
          >
            {item.label}
          </button>
        ))}
        <p className="nav-foot">
          <span>{hub.state ? hub.state.race.event.name : "No event imported"}</span>
          <span className="nav-version">
            {version ? `Version ${version}` : "Version …"}
          </span>
        </p>
      </nav>
      <div className="workspace">
        <header className="topbar">
          <OfflinePill />
          {hub.account && hub.hasToken ? (
            <SignedInPill name={hub.account.name} role={roleLabel(hub.account.role)} />
          ) : (
            <button
              type="button"
              className="btn small"
              onClick={() => hub.setScreen("settings")}
            >
              Sign in
            </button>
          )}
        </header>
        <UpdatePrompt />
        <main>
          {hub.lockedContactNote ? (
            <div className="stack" style={{ marginBottom: 12 }}>
              <Banner tone="info">{hub.lockedContactNote}</Banner>
            </div>
          ) : null}
          {hub.notice ? (
            <div className="stack" style={{ marginBottom: 12 }}>
              <Banner tone="info">{hub.notice}</Banner>
            </div>
          ) : null}
          {signedOut && hub.screen !== "settings" ? (
            <div className="stack" style={{ marginBottom: 12 }}>
              <Banner tone="info">
                Signed out. Races on this laptop still work. Sign in from Settings to
                refresh the site.
              </Banner>
            </div>
          ) : null}
          {hub.screen === "events" ? <Events /> : null}
          {hub.screen === "setup" ? <RaceSetup /> : null}
          {hub.screen === "registration" ? <Registration /> : null}
          {hub.screen === "lookup" ? <RiderLookup /> : null}
          {hub.screen === "scoring" ? <Scoring /> : null}
          {hub.screen === "results" ? <Results /> : null}
          {hub.screen === "settings" ? <Settings /> : null}
          {hub.screen === "changelog" ? <Changelog /> : null}
        </main>
      </div>
    </div>
  );
}
