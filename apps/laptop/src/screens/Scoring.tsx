import { useHub } from "../use-hub";
import { Banner } from "../ui";

export function Scoring() {
  const hub = useHub();
  return (
    <div className="stack">
      <h1>Scoring{hub.state ? ` · ${hub.state.race.event.name}` : ""}</h1>
      <Banner tone="info">
        Checkpoint phones are not in this update. Punches, penalties, and the clock stay
        for a later build. The roster on this laptop is ready for them.
      </Banner>
    </div>
  );
}
