import { useAppUpdates } from "../updates/use-app-updates";

export function UpdatePrompt() {
  const updates = useAppUpdates();
  if (!updates.bannerVisible || !updates.offer) return null;
  const phase = updates.phase;
  const downloading = phase.kind === "downloading";
  const percent = phase.kind === "downloading" ? phase.percent : null;
  const error = phase.kind === "error" ? phase.message : null;

  return (
    <div className="update-banner" role="status">
      <div>
        <strong>Version {updates.offer.version} is available</strong>
        <p>Your races, riders, and sign-in stay on this laptop.</p>
        {updates.offer.notes ? <p>{updates.offer.notes}</p> : null}
        <p>
          <button type="button" className="linkish" onClick={updates.openNotes}>
            Release notes
          </button>
        </p>
        {downloading ? <UpdateProgress percent={percent} /> : null}
        {error ? <p className="update-error">{error}</p> : null}
      </div>
      <div className="row">
        <button
          type="button"
          className="btn primary"
          disabled={downloading}
          onClick={updates.install}
        >
          {downloading ? "Downloading…" : "Update now"}
        </button>
        <button
          type="button"
          className="btn ghost small"
          disabled={downloading}
          onClick={updates.later}
        >
          Later
        </button>
      </div>
    </div>
  );
}

export function UpdateProgress({ percent }: { percent: number | null }) {
  return (
    <div
      className={percent === null ? "progress update unknown" : "progress update"}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      aria-label="Update download"
    >
      <span style={percent === null ? undefined : { width: `${percent}%` }} />
    </div>
  );
}
