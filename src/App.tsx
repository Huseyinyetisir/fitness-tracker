import { useEffect, useState } from 'react';
import { db } from './db/schema';
import { seedExercises } from './db/seed';

export default function App() {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await seedExercises();
        setCount(await db.exercises.count());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <main className="p-6 space-y-2">
      <h1 className="text-2xl font-semibold">Fit Tracker</h1>
      {error && <p className="text-red-400">{error}</p>}
      {count === null && !error && <p className="text-[var(--color-muted)]">Loading…</p>}
      {count !== null && (
        <p className="text-[var(--color-muted)]">
          Exercise library: <span className="text-[var(--color-text)]">{count}</span> exercises
        </p>
      )}
    </main>
  );
}
