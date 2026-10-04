import { useEffect, useState } from 'react';
import { parseOptionalNumber } from '../lib/format';

/**
 * Large −/+ buttons around a value the user can also tap and type into.
 * Built for one thumb: the buttons are 56 px and the value is readable at
 * arm's length.
 */
export default function Stepper({
  label,
  value,
  step,
  min = 0,
  max = Number.POSITIVE_INFINITY,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((current) => (parseOptionalNumber(current) === value ? current : String(value)));
  }, [value]);

  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100));

  return (
    <div role="group" aria-label={label} className="flex items-center gap-2">
      <span className="w-12 text-sm text-muted">{label}</span>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(clamp(value - step))}
        className="size-14 shrink-0 rounded-xl border border-border bg-surface text-2xl"
      >
        −
      </button>
      <input
        aria-label={label}
        type="text"
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const parsed = parseOptionalNumber(e.target.value);
          if (parsed !== null && Number.isFinite(parsed)) onChange(clamp(parsed));
        }}
        className="min-h-14 w-full min-w-0 flex-1 rounded-xl bg-transparent text-center text-3xl font-semibold tabular-nums"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(clamp(value + step))}
        className="size-14 shrink-0 rounded-xl border border-border bg-surface text-2xl"
      >
        +
      </button>
    </div>
  );
}
