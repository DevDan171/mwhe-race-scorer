const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function Keypad({
  value,
  disabled,
  onChange,
  onPunch,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onPunch: () => void;
}) {
  function press(key: string) {
    if (disabled) return;
    onChange(`${value}${key}`.replace(/^0+/, "").slice(0, 6));
  }

  return (
    <div className="keypad">
      <div className="digits" aria-live="polite">
        {value || "—"}
      </div>
      <div className="keys">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className="key"
            disabled={disabled}
            onClick={() => press(key)}
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          className="key"
          disabled={disabled || value.length === 0}
          onClick={() => onChange(value.slice(0, -1))}
        >
          Del
        </button>
        <button
          type="button"
          className="key"
          disabled={disabled}
          onClick={() => press("0")}
        >
          0
        </button>
        <button
          type="button"
          className="key punch"
          disabled={disabled || value.length === 0}
          onClick={onPunch}
        >
          Punch
        </button>
      </div>
    </div>
  );
}
