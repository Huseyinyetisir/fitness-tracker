import { useCallback, useRef, useState } from 'react';

/**
 * Runs one async action at a time. A second call while the first is in
 * flight is ignored — a double tap in the gym must not log a set twice.
 * A ref, not state, guards re-entry: two taps in the same tick would both
 * read stale state. `busy` is for disabling buttons; it always clears, even
 * when the action throws.
 */
export function useSingleFlight() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
