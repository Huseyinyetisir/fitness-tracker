import { useState, type ReactNode } from 'react';
import Button from './Button';
import { TextField } from './Fields';

/**
 * A confirmation for actions that cannot be undone: the user types a word
 * before the button arms. Harder to do by accident than a dialog.
 */
export default function ConfirmPhrase({
  phrase,
  action,
  busy,
  onConfirm,
  onCancel,
  children,
}: {
  phrase: string;
  action: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const [typed, setTyped] = useState('');
  const armed = typed.trim().toUpperCase() === phrase;

  return (
    <div className="space-y-3 rounded-xl border border-red-500/60 p-3">
      <div className="text-sm">{children}</div>
      <TextField
        label={`Type ${phrase} to confirm`}
        value={typed}
        autoCapitalize="characters"
        autoComplete="off"
        onChange={(e) => setTyped(e.target.value)}
      />
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Button onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button variant="danger" disabled={!armed || busy} onClick={onConfirm}>
          {busy ? 'Working…' : action}
        </Button>
      </div>
    </div>
  );
}
