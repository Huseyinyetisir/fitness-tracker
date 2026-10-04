import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/**
 * Subscribes a component to a Dexie query. It re-renders whenever a table the
 * query read from changes — including rows written by a sync pull. Dexie ships
 * liveQuery in core, so this avoids a dependency on dexie-react-hooks.
 *
 * `undefined` means "still loading". The result is discarded when `deps`
 * change, so a screen never shows the previous record while the next loads.
 */
export function useLiveQuery<T>(query: () => Promise<T>, deps: readonly unknown[]): T | undefined {
  const [state, setState] = useState<{ deps: readonly unknown[]; value: T } | undefined>();

  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: (value) => setState({ deps, value }),
      error: (err) => console.error('liveQuery failed', err),
    });
    return () => subscription.unsubscribe();
    // The caller owns the dependency list, exactly as with useEffect.
  }, deps);

  return state && sameDeps(state.deps, deps) ? state.value : undefined;
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}
