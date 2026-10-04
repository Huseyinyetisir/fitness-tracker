import { useEffect, useId, useState, type InputHTMLAttributes } from 'react';
import { parseOptionalNumber } from '../lib/format';

const INPUT = 'w-full min-h-12 rounded-xl border border-border bg-surface px-3 text-base';

function Message({ error, hint }: { error?: string; hint?: string }) {
  if (error) return <p role="alert" className="text-sm text-red-400">{error}</p>;
  if (hint) return <p className="text-xs text-muted">{hint}</p>;
  return null;
}

export function TextField({
  label,
  hint,
  error,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-muted">{label}</label>
      <input id={id} {...input} aria-invalid={error ? true : undefined} className={INPUT} />
      <Message error={error} hint={hint} />
    </div>
  );
}

/**
 * A number input that keeps the user's own text while they type ("2." or
 * "2,"), and only reformats when the value changes from outside.
 */
export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : String(value));

  useEffect(() => {
    setText((current) =>
      Object.is(parseOptionalNumber(current), value) ? current : value === null ? '' : String(value),
    );
  }, [value]);

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-muted">{label}</label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={text}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseOptionalNumber(e.target.value));
        }}
        className={`${INPUT} tabular-nums`}
      />
      <Message error={error} hint={hint} />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  defaultValue,
  onChange,
  onBlur,
  rows = 3,
}: {
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onBlur?: (value: string) => void;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-muted">{label}</label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        onBlur={onBlur ? (e) => onBlur(e.target.value) : undefined}
        className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-base"
      />
    </div>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm text-muted">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A row of mutually exclusive buttons. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | '';
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-xl border border-border bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-11 flex-1 rounded-lg text-sm ${value === o.value ? 'bg-accent font-semibold text-black' : 'text-muted'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center gap-3">
      <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
