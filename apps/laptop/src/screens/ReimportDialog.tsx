import type { ReimportPreview } from "@mwhe/core";

import { formatWhen } from "../format";
import { Modal } from "../ui";

export function ReimportDialog({
  name,
  importedAt,
  preview,
  busy,
  onClose,
  onApply,
}: {
  name: string;
  importedAt: string | null;
  preview: ReimportPreview;
  busy: boolean;
  onClose: () => void;
  onApply: () => void;
}) {
  return (
    <Modal
      title={`Re-import preview · ${name}`}
      lede="Nothing has changed yet. Review below, then apply."
      onClose={onClose}
    >
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <span className="pill">Last imported {formatWhen(importedAt) || "earlier"}</span>
      </div>
      <ChangeRow
        tone="new"
        count={preview.newRiders.length}
        title="New riders"
        detail={
          preview.newRiders.map((line) => line.detail).join(", ") ||
          "No new riders on the site."
        }
      />
      <ChangeRow
        tone="update"
        count={preview.riderUpdates.filter((line) => line.apply).length}
        title="Rider updated"
        detail={
          preview.riderUpdates.map((line) => line.detail).join(" · ") ||
          "No rider fields changed."
        }
      />
      <ChangeRow
        tone="race"
        count={preview.raceChanges.filter((line) => line.apply).length}
        title="Race detail changed"
        detail={
          preview.raceChanges.map((line) => line.detail).join(" · ") ||
          "Start times, rows, checks, length, and row gap match."
        }
      />
      <ChangeRow
        tone="keep"
        count={preview.raceDayKept.length}
        title="Race-day riders kept"
        detail={
          preview.raceDayKept.length
            ? `${preview.raceDayKept.map((line) => `#${line.riderNumber}`).join(", ")} were registered on this laptop on race day`
            : "No race-day registrations on this laptop."
        }
      />
      <ChangeRow
        tone="none"
        count={preview.removedCount}
        title="Riders removed"
        detail={`${preview.unchangedCount} riders unchanged`}
      />
      <p className="rule">
        <strong>Rule:</strong> Newest change wins. Race-day registrations are never
        removed.
      </p>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="hint">
          A backup of the current event is the previous import. Cancel leaves it.
        </p>
        <div className="row">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={busy} onClick={onApply}>
            {preview.applyCount === 0
              ? "Close"
              : `Apply ${preview.applyCount} change${preview.applyCount === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ChangeRow({
  tone,
  count,
  title,
  detail,
}: {
  tone: "new" | "update" | "race" | "keep" | "none";
  count: number;
  title: string;
  detail: string;
}) {
  return (
    <div className={`change ${tone}`}>
      <span className="count">{count}</span>
      <span>
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
    </div>
  );
}
