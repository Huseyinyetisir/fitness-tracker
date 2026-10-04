import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useSingleFlight } from '../../app/useSingleFlight';
import Button from '../../components/Button';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { today } from '../../lib/time';
import { DEMO_WEEKS, hasDemoData, loadDemoData, removeDemoData } from './demoData';

export default function DemoSection() {
  const { requestSync } = useApp();
  const state = useLiveQuery(async () => ({ loaded: await hasDemoData(), library: (await db.exercises.count()) > 0 }), []);
  const { busy, run } = useSingleFlight();
  const [message, setMessage] = useState<string | null>(null);

  function act(action: () => Promise<string>) {
    return run(async () => {
      try {
        setMessage(await action());
        requestSync();
      } catch (e) {
        setMessage(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-medium">Demo data</h2>
      <p className="text-sm text-muted">
        {DEMO_WEEKS} weeks of example workouts, runs and weigh-ins, to see what the charts show. Every demo session is
        marked “Demo data” and is removed in one tap, leaving your own entries untouched. It syncs like anything
        else.
      </p>
      {state === undefined ? null : state.loaded ? (
        <Button block disabled={busy} onClick={() => void act(async () => `Removed ${await removeDemoData()} demo sessions.`)}>
          Remove demo data
        </Button>
      ) : (
        <Button
          block
          disabled={busy || !state.library}
          onClick={() => void act(async () => `Loaded ${await loadDemoData(today())} demo rows.`)}
        >
          Load demo data
        </Button>
      )}
      {state && !state.library && <p className="text-xs text-muted">Available once the first sync completes.</p>}
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
    </div>
  );
}
