import { useHub } from "../use-hub";
import { Banner } from "../ui";

export function Results() {
  const hub = useHub();
  return (
    <div className="stack">
      <h1>Results{hub.state ? ` · ${hub.state.race.event.name}` : ""}</h1>
      <Banner tone="info">
        Official results are published after the race. This update does not send them to
        the site. Emergency contacts are never part of a result.
      </Banner>
    </div>
  );
}
