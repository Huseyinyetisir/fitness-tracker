import { useState } from 'react';
import { RPE_STEPS } from './setRules';

const HIGH = RPE_STEPS.filter((v) => v >= 6);
const LOW = RPE_STEPS.filter((v) => v < 6);

/**
 * Nine big buttons, RPE 6 to 10 in half steps, cover almost every working
 * set; "Lower" reveals 1 to 5.5. Two rows of five fit one thumb's reach.
 */
export default function RpeSelector({ value, onChange }: { value: number | null; onChange: (rpe: number) => void }) {
  const [showLow, setShowLow] = useState(value !== null && value < 6);
  const options = showLow ? [...LOW, ...HIGH] : HIGH;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">RPE</span>
        <span className="text-2xl font-semibold tabular-nums">{value ?? '–'}</span>
      </div>
      <div role="radiogroup" aria-label="RPE, rate of perceived exertion" className="grid grid-cols-5 gap-2">
        {options.map((v) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`min-h-12 rounded-xl text-base tabular-nums ${
              value === v
                ? 'bg-accent font-semibold text-black'
                : Number.isInteger(v)
                  ? 'border border-border bg-surface'
                  : 'border border-border text-muted'
            }`}
          >
            {v}
          </button>
        ))}
        {!showLow && (
          <button
            type="button"
            onClick={() => setShowLow(true)}
            className="min-h-12 rounded-xl border border-dashed border-border text-sm text-muted"
          >
            Lower
          </button>
        )}
      </div>
    </div>
  );
}
