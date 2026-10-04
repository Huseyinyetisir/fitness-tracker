import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-black font-semibold',
  secondary: 'border border-border bg-surface',
  ghost: 'text-accent',
  danger: 'border border-red-500/60 text-red-400',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  block?: boolean;
};

export default function Button({ variant = 'secondary', block = false, className = '', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`min-h-12 rounded-xl px-4 text-base transition active:scale-[0.98] disabled:opacity-40 ${VARIANTS[variant]} ${block ? 'w-full' : ''} ${className}`}
    />
  );
}

/** A square icon button. `label` is the accessible name, since the content is a symbol. */
export function IconButton({ label, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...rest}
      className={`grid size-12 shrink-0 place-items-center rounded-xl border border-border text-lg disabled:opacity-30 ${className}`}
    />
  );
}

/** A link styled as the primary action. */
export const PRIMARY_LINK =
  'flex min-h-14 items-center justify-center rounded-xl bg-accent px-4 font-semibold text-black';

/** A link styled as a list row. */
export const ROW_LINK =
  'flex min-h-14 items-center justify-between rounded-2xl border border-border bg-surface px-4';
