import type { StationState } from "../station-state";
import { Keypad } from "./Keypad";

export function StartBoard({
  state,
  digits,
  disabled,
  onDigits,
  onRow,
  onRider,
  onUndo,
}: {
  state: StationState;
  digits: string;
  disabled: boolean;
  onDigits: (value: string) => void;
  onRow: (order: number) => void;
  onRider: () => void;
  onUndo: () => void;
}) {
  const rows = [...(state.setup?.startRows ?? [])].sort((a, b) => a.order - b.order);
  const gone = new Set(
    state.rowStarts.filter((entry) => !entry.voided).map((entry) => entry.row),
  );
  return (
    <section className="stack">
      <h1>Start</h1>
      {rows.map((row) => (
        <button
          key={row.order}
          type="button"
          className="wide row-go"
          disabled={disabled}
          onClick={() => onRow(row.order)}
        >
          {gone.has(row.order) ? `${row.label} again` : `${row.label} go`}
        </button>
      ))}
      <h2>Late starter</h2>
      <Keypad
        value={digits}
        disabled={disabled}
        onChange={onDigits}
        onPunch={onRider}
        actionLabel="Start"
      />
      <button type="button" className="wide alt" onClick={onUndo}>
        Undo last start
      </button>
    </section>
  );
}
