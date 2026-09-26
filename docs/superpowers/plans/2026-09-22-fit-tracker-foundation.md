# Fit Tracker — Foundation Implementation Plan (Phases 1–3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data foundation of Fit Tracker — typed domain model, Dexie local database with seeded exercise library, all pure calculation functions under test, Supabase schema with RLS, email/password auth, and a working two-way sync layer.

**Architecture:** The UI reads and writes only Dexie (IndexedDB). Every write stamps a client-owned `updated_at` and sets `_dirty = 1`. A sync engine pushes dirty rows to Supabase and pulls remote changes using a server-owned `server_updated_at` watermark, merging row-by-row with last-write-wins. Nothing derived (1RM, volume, PRs, streaks) is ever stored — it is computed by pure functions in `/src/lib`.

**Tech Stack:** Vite, React 19, TypeScript, Tailwind CSS v4, Dexie 4, `@supabase/supabase-js` v2, Vitest, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-09-22-fitness-tracker-design.md`

---

## File Structure

Files that change together live together. Each file has one responsibility.

### Created in Phase 1

| File | Responsibility |
|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json` | Build and test configuration |
| `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css` | App shell and Tailwind entry |
| `.gitignore`, `.env.example` | Secrets kept out of git |
| `src/types/domain.ts` | Every entity interface and union type. Single source of truth for shape |
| `src/lib/id.ts` | UUID generation |
| `src/lib/time.ts` | Date helpers: ISO dates, Monday week starts, weekday numbering |
| `src/lib/strength.ts` | Epley e1RM, volume, rep maxes, PR detection |
| `src/lib/running.ts` | Pace calculation and duration/pace formatting |
| `src/lib/adherence.ts` | Adherence percentage and weekday streak |
| `src/lib/rpe.ts` | RPE aggregates and the fatigue flag |
| `src/db/schema.ts` | Dexie database class, table definitions, version migrations |
| `src/db/repo.ts` | Write helpers that stamp `id`, `updated_at`, `_dirty`; soft delete |
| `src/db/seed.ts` | ~40 strength exercises + 4 run types, idempotent |

### Created in Phase 2

| File | Responsibility |
|---|---|
| `supabase/migrations/0001_init.sql` | Tables, trigger, indexes |
| `supabase/migrations/0002_rls.sql` | RLS policies and anon revocation |
| `src/supabase/client.ts` | Configured Supabase client, env validation |
| `src/features/auth/useAuth.ts` | Session state hook |
| `src/features/auth/SignIn.tsx` | Email + password form |

### Created in Phase 3

| File | Responsibility |
|---|---|
| `src/sync/types.ts` | Sync status types and the synced-table registry type |
| `src/sync/tables.ts` | Ordered table registry — the one place FK ordering is declared |
| `src/sync/merge.ts` | `mergeRow` — the pure last-write-wins decision |
| `src/sync/push.ts` | Collect dirty rows, upsert, clear flags |
| `src/sync/pull.ts` | Watermark query, apply merges, advance watermark |
| `src/sync/engine.ts` | Orchestration, triggers, status broadcasting — takes its client as a parameter, imports no credentials |
| `src/sync/supabaseSyncClient.ts` | The concrete Supabase-backed push/pull adapter |
| `src/features/settings/SyncStatus.tsx` | Status indicator and "sync now" button |

---

# Phase 1 — Domain model, Dexie, and calculations

## Task 1: Project scaffold

Vite's interactive scaffolder refuses to run cleanly in a directory that already contains `docs/` and `.git/`, so the config files are written directly. This is deterministic and avoids a prompt that can delete existing files.

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `index.html`, `.gitignore`, `.env.example`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/lib/smoke.test.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "fit-tracker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm i react react-dom dexie @supabase/supabase-js
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom tailwindcss @tailwindcss/vite vitest fake-indexeddb
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
```

- [ ] **Step 4: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "composite": true,
    "outDir": "./node_modules/.tsbuild-node"
  },
  "include": ["vite.config.ts"]
}
```

A referenced project must set `composite: true` and must not set `noEmit` — `tsc -b` fails with TS6306/TS6310 otherwise. `outDir` redirects the emitted `vite.config.js`/`.d.ts` into `node_modules` so Vite's config loader cannot pick up a stale compiled config beside the real `.ts` one.

- [ ] **Step 6: Create `index.html`**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1.0, user-scalable=no"
    />
    <meta name="color-scheme" content="dark" />
    <title>Fit Tracker</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`viewport-fit=cover` is required for the safe-area insets the spec calls for; without it the Android status bar overlaps the header in the APK.

- [ ] **Step 7: Create `src/index.css`**

```css
@import 'tailwindcss';

@theme {
  --color-bg: #0b0f14;
  --color-surface: #141b23;
  --color-border: #22303d;
  --color-text: #e6edf3;
  --color-muted: #8b9bab;
  --color-accent: #4ea1ff;
}

html,
body,
#root {
  height: 100%;
}

body {
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: none;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 8: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Create `src/App.tsx`**

```tsx
export default function App() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold">Fit Tracker</h1>
      <p className="text-[var(--color-muted)]">Foundation build.</p>
    </main>
  );
}
```

- [ ] **Step 10: Create `.gitignore`**

```
node_modules
dist
*.tsbuildinfo
.env
.env.local
*.keystore
keystore.properties
android/
.DS_Store
```

- [ ] **Step 11: Create `.env.example`**

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 12: Create `src/lib/smoke.test.ts` to prove the test runner works**

```ts
import { describe, it, expect } from 'vitest';

describe('test runner', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 13: Verify the toolchain**

Run: `npm test`
Expected: `1 passed`

Run: `npm run build`
Expected: build succeeds, `dist/` written

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TS + Tailwind + Vitest"
```

---

## Task 2: Domain types

**Files:**
- Create: `src/types/domain.ts`

- [ ] **Step 1: Write `src/types/domain.ts`**

```ts
export type UUID = string;
/** 'YYYY-MM-DD' */
export type ISODate = string;
/** ISO 8601 UTC, e.g. '2026-09-22T06:30:00.000Z' */
export type ISODateTime = string;

/** Columns present on every synced row. */
export interface BaseRow {
  id: UUID;
  user_id: UUID | null;
  created_at: ISODateTime;
  /** Client-set. The last-write-wins comparand. */
  updated_at: ISODateTime;
  /** Server trigger-set. Used only as the pull watermark. Null until first push. */
  server_updated_at: ISODateTime | null;
  /** Soft delete. The app never hard-deletes during normal operation. */
  deleted_at: ISODateTime | null;
}

/**
 * Local-only sync flag. Dexie cannot index booleans, so this is 0 | 1
 * rather than false | true. It is stripped before pushing to Supabase.
 */
export interface LocalMeta {
  _dirty: 0 | 1;
}

export type Local<T> = T & LocalMeta;

export type Modality = 'strength' | 'cardio';
export type RunType = 'easy' | 'tempo' | 'intervals' | 'long';
export type SessionKind = 'strength' | 'run' | 'mixed';
export type SessionStatus = 'planned' | 'done' | 'partial' | 'skipped';
/** 1 = Monday … 7 = Sunday */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Exercise extends BaseRow {
  name: string;
  muscle_group: string | null;
  modality: Modality;
  run_type: RunType | null;
  default_sets: number | null;
  default_reps: number | null;
  default_weight_kg: number | null;
  default_duration_s: number | null;
  default_distance_km: number | null;
  sort_order: number;
}

export interface WorkoutTemplate extends BaseRow {
  name: string;
  notes: string | null;
}

export interface WorkoutTemplateItem extends BaseRow {
  template_id: UUID;
  exercise_id: UUID;
  position: number;
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_duration_s: number | null;
  target_distance_km: number | null;
  target_rpe: number | null;
  rest_seconds: number | null;
  notes: string | null;
}

export interface WeekPlan extends BaseRow {
  name: string;
  active_from: ISODate;
}

export interface WeekPlanDay extends BaseRow {
  week_plan_id: UUID;
  weekday: Weekday;
  /** null = rest day */
  template_id: UUID | null;
}

export interface Session extends BaseRow {
  date: ISODate;
  kind: SessionKind;
  status: SessionStatus;
  template_id: UUID | null;
  was_planned: boolean;
  energy: number | null;
  notes: string | null;
  started_at: ISODateTime | null;
  completed_at: ISODateTime | null;
}

export interface SessionExercise extends BaseRow {
  session_id: UUID;
  exercise_id: UUID;
  position: number;
  notes: string | null;
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
}

export interface SetEntry extends BaseRow {
  session_exercise_id: UUID;
  set_index: number;
  reps: number;
  weight_kg: number;
  /** Required, 1–10, half steps allowed. */
  rpe: number;
  is_warmup: boolean;
  notes: string | null;
}

export interface Run extends BaseRow {
  session_id: UUID;
  exercise_id: UUID;
  run_type: RunType;
  distance_km: number;
  duration_s: number;
  /** Required, 1–10. */
  rpe: number;
  avg_hr: number | null;
  weather: string | null;
  route_note: string | null;
}

export interface RunSplit extends BaseRow {
  run_id: UUID;
  split_index: number;
  distance_km: number;
  duration_s: number;
}

export interface BodyMetric extends BaseRow {
  date: ISODate;
  weight_kg: number | null;
  resting_hr: number | null;
  note: string | null;
}

export interface UserPrefs extends BaseRow {
  rest_seconds_default: number;
  vibration: boolean;
  theme: string;
}

/** Local-only. Never pushed. */
export interface SyncMeta {
  table: string;
  watermark: ISODateTime | null;
  last_synced_at: ISODateTime | null;
  last_error: string | null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no output, exit code 0

- [ ] **Step 3: Commit**

```bash
git add src/types/domain.ts
git commit -m "feat: add typed domain model"
```

---

## Task 3: ID and time helpers

Week starts Monday throughout the app. Getting this wrong silently corrupts every weekly chart, so it is tested first.

**Files:**
- Create: `src/lib/id.ts`, `src/lib/time.ts`, `src/lib/time.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/time.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import {
  toISODate,
  addDays,
  weekdayIndex,
  startOfWeek,
  eachDateInRange,
  isWeekdayDate,
  daysBetween,
} from './time';

describe('toISODate', () => {
  it('formats a date as YYYY-MM-DD in local time', () => {
    expect(toISODate(new Date(2026, 8, 22))).toBe('2026-09-22');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('weekdayIndex', () => {
  it('numbers Monday as 1', () => {
    expect(weekdayIndex('2026-09-21')).toBe(1);
  });

  it('numbers Sunday as 7', () => {
    expect(weekdayIndex('2026-09-27')).toBe(7);
  });
});

describe('startOfWeek', () => {
  it('returns the same day for a Monday', () => {
    expect(startOfWeek('2026-09-21')).toBe('2026-09-21');
  });

  it('returns the preceding Monday for a Sunday', () => {
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
  });

  it('returns the preceding Monday for a midweek day', () => {
    expect(startOfWeek('2026-09-24')).toBe('2026-09-21');
  });
});

describe('addDays', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
  });

  it('subtracts days with a negative offset', () => {
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
  });
});

describe('eachDateInRange', () => {
  it('returns an inclusive range', () => {
    expect(eachDateInRange('2026-09-21', '2026-09-24')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
    ]);
  });

  it('returns a single date when start equals end', () => {
    expect(eachDateInRange('2026-09-21', '2026-09-21')).toEqual(['2026-09-21']);
  });
});

describe('isWeekdayDate', () => {
  it('is true for Monday through Friday', () => {
    expect(isWeekdayDate('2026-09-25')).toBe(true);
  });

  it('is false for Saturday and Sunday', () => {
    expect(isWeekdayDate('2026-09-26')).toBe(false);
    expect(isWeekdayDate('2026-09-27')).toBe(false);
  });
});

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-09-21', '2026-09-24')).toBe(3);
  });

  it('is negative when the second date is earlier', () => {
    expect(daysBetween('2026-09-24', '2026-09-21')).toBe(-3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/time.test.ts`
Expected: FAIL — `Failed to resolve import "./time"`

- [ ] **Step 3: Write `src/lib/time.ts`**

```ts
import type { ISODate, Weekday } from '../types/domain';

/**
 * All date maths here works on local-time calendar dates, not UTC instants.
 * A workout logged at 06:30 local belongs to that local calendar day, and
 * UTC conversion would move it across midnight for part of the year.
 */

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function today(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** 1 = Monday … 7 = Sunday */
export function weekdayIndex(s: ISODate): Weekday {
  const js = parseISODate(s).getDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as Weekday;
}

export function addDays(s: ISODate, n: number): ISODate {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Monday of the week containing `s`. */
export function startOfWeek(s: ISODate): ISODate {
  return addDays(s, -(weekdayIndex(s) - 1));
}

export function eachDateInRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function isWeekdayDate(s: ISODate): boolean {
  return weekdayIndex(s) <= 5;
}

export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function nowISO(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/time.test.ts`
Expected: PASS, 15 tests

- [ ] **Step 5: Write `src/lib/id.ts`**

```ts
import type { UUID } from '../types/domain';

/**
 * crypto.randomUUID is available in Node 20+, all modern browsers over
 * HTTPS, and the Capacitor Android WebView (which serves over https://).
 */
export function newId(): UUID {
  return crypto.randomUUID();
}
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/id.ts src/lib/time.ts src/lib/time.test.ts
git commit -m "feat: add id and Monday-first date helpers"
```

---

## Task 4: Strength calculations — e1RM and volume

**Files:**
- Create: `src/lib/strength.ts`, `src/lib/strength.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/strength.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { epley1RM, setVolume, totalVolume, bestE1RM, repMaxes } from './strength';
import type { SetEntry } from '../types/domain';

function set(partial: Partial<SetEntry>): SetEntry {
  return {
    id: 'x',
    user_id: null,
    created_at: '2026-09-22T06:00:00.000Z',
    updated_at: '2026-09-22T06:00:00.000Z',
    server_updated_at: null,
    deleted_at: null,
    session_exercise_id: 'se1',
    set_index: 0,
    reps: 5,
    weight_kg: 100,
    rpe: 8,
    is_warmup: false,
    notes: null,
    ...partial,
  };
}

describe('epley1RM', () => {
  it('returns the weight itself for a single rep', () => {
    expect(epley1RM(100, 1)).toBe(100);
  });

  it('applies the Epley formula for multiple reps', () => {
    // 100 * (1 + 5/30) = 116.666...
    expect(epley1RM(100, 5)).toBeCloseTo(116.667, 3);
  });

  it('returns 0 for zero or negative reps', () => {
    expect(epley1RM(100, 0)).toBe(0);
    expect(epley1RM(100, -3)).toBe(0);
  });

  it('returns 0 for zero or negative weight', () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(-20, 5)).toBe(0);
  });
});

describe('setVolume', () => {
  it('multiplies reps by weight', () => {
    expect(setVolume(set({ reps: 5, weight_kg: 100 }))).toBe(500);
  });
});

describe('totalVolume', () => {
  it('sums working sets', () => {
    const sets = [
      set({ reps: 5, weight_kg: 100 }),
      set({ reps: 5, weight_kg: 90 }),
    ];
    expect(totalVolume(sets)).toBe(950);
  });

  it('excludes warm-up sets', () => {
    const sets = [
      set({ reps: 10, weight_kg: 40, is_warmup: true }),
      set({ reps: 5, weight_kg: 100 }),
    ];
    expect(totalVolume(sets)).toBe(500);
  });

  it('excludes soft-deleted sets', () => {
    const sets = [
      set({ reps: 5, weight_kg: 100 }),
      set({ reps: 5, weight_kg: 100, deleted_at: '2026-09-22T07:00:00.000Z' }),
    ];
    expect(totalVolume(sets)).toBe(500);
  });

  it('returns 0 for an empty list', () => {
    expect(totalVolume([])).toBe(0);
  });
});

describe('bestE1RM', () => {
  it('picks the highest estimated 1RM across working sets', () => {
    const sets = [
      set({ reps: 5, weight_kg: 100 }), // 116.67
      set({ reps: 2, weight_kg: 115 }), // 122.67
      set({ reps: 8, weight_kg: 90 }),  // 114.00
    ];
    expect(bestE1RM(sets)).toBeCloseTo(122.667, 3);
  });

  it('ignores warm-ups even when they would score higher', () => {
    const sets = [
      set({ reps: 1, weight_kg: 200, is_warmup: true }),
      set({ reps: 5, weight_kg: 100 }),
    ];
    expect(bestE1RM(sets)).toBeCloseTo(116.667, 3);
  });

  it('returns 0 when there are no working sets', () => {
    expect(bestE1RM([])).toBe(0);
  });
});

describe('repMaxes', () => {
  it('records the best weight for each rep count', () => {
    const sets = [
      set({ reps: 5, weight_kg: 100 }),
      set({ reps: 5, weight_kg: 105 }),
      set({ reps: 3, weight_kg: 110 }),
    ];
    const rm = repMaxes(sets);
    expect(rm.get(5)).toBe(105);
    expect(rm.get(3)).toBe(110);
  });

  it('ignores rep counts above 12', () => {
    const rm = repMaxes([set({ reps: 15, weight_kg: 60 })]);
    expect(rm.has(15)).toBe(false);
  });

  it('ignores warm-ups', () => {
    const rm = repMaxes([set({ reps: 5, weight_kg: 200, is_warmup: true })]);
    expect(rm.has(5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/strength.test.ts`
Expected: FAIL — `Failed to resolve import "./strength"`

- [ ] **Step 3: Write `src/lib/strength.ts`**

```ts
import type { SetEntry } from '../types/domain';

/** The highest rep count tracked as a rep-max PR. */
export const MAX_TRACKED_REPS = 12;

export function isWorkingSet(s: SetEntry): boolean {
  return !s.is_warmup && s.deleted_at === null;
}

/** Epley: weight * (1 + reps / 30). Exact at 1 rep. */
export function epley1RM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export function setVolume(s: SetEntry): number {
  return s.reps * s.weight_kg;
}

export function totalVolume(sets: SetEntry[]): number {
  return sets.filter(isWorkingSet).reduce((sum, s) => sum + setVolume(s), 0);
}

export function bestE1RM(sets: SetEntry[]): number {
  return sets
    .filter(isWorkingSet)
    .reduce((best, s) => Math.max(best, epley1RM(s.weight_kg, s.reps)), 0);
}

/** Best weight lifted for each rep count from 1 to MAX_TRACKED_REPS. */
export function repMaxes(sets: SetEntry[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of sets) {
    if (!isWorkingSet(s)) continue;
    if (s.reps < 1 || s.reps > MAX_TRACKED_REPS) continue;
    const prev = out.get(s.reps) ?? 0;
    if (s.weight_kg > prev) out.set(s.reps, s.weight_kg);
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/strength.test.ts`
Expected: PASS, 15 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/strength.ts src/lib/strength.test.ts
git commit -m "feat: add Epley e1RM, volume, and rep-max calculations"
```

---

## Task 5: PR detection

A PR event is emitted the first time a set beats the running best. Walking chronologically means the same history always produces the same PR list, which is what lets the chart draw stable markers.

**Files:**
- Modify: `src/lib/strength.ts`
- Create: `src/lib/prs.ts`, `src/lib/prs.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/prs.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { detectPRs, type DatedSet } from './prs';

function ds(date: string, reps: number, weight: number, extra: Partial<DatedSet> = {}): DatedSet {
  return {
    set_id: `${date}-${reps}-${weight}`,
    date,
    reps,
    weight_kg: weight,
    is_warmup: false,
    ...extra,
  };
}

describe('detectPRs', () => {
  it('emits an e1rm PR and a rep_max PR for the first working set', () => {
    const prs = detectPRs([ds('2026-09-01', 5, 100)]);
    expect(prs).toEqual([
      { date: '2026-09-01', kind: 'rep_max', reps: 5, value: 100, set_id: '2026-09-01-5-100' },
      {
        date: '2026-09-01',
        kind: 'e1rm',
        reps: 5,
        value: epley(100, 5),
        set_id: '2026-09-01-5-100',
      },
    ]);
  });

  it('does not emit when a later set fails to beat the best', () => {
    const prs = detectPRs([ds('2026-09-01', 5, 100), ds('2026-09-08', 5, 95)]);
    expect(prs.filter((p) => p.date === '2026-09-08')).toEqual([]);
  });

  it('emits a rep_max PR without an e1rm PR when only the rep max improves', () => {
    // 8x95 -> e1rm 120.33 ; 3x110 -> e1rm 121.0 ; 5x100 -> e1rm 116.67 (no e1rm PR)
    const prs = detectPRs([
      ds('2026-09-01', 3, 110),
      ds('2026-09-08', 8, 95),
      ds('2026-09-15', 5, 100),
    ]);
    const sept15 = prs.filter((p) => p.date === '2026-09-15');
    expect(sept15).toEqual([
      { date: '2026-09-15', kind: 'rep_max', reps: 5, value: 100, set_id: '2026-09-15-5-100' },
    ]);
  });

  it('ignores warm-up sets entirely', () => {
    const prs = detectPRs([ds('2026-09-01', 1, 300, { is_warmup: true })]);
    expect(prs).toEqual([]);
  });

  it('processes out-of-order input chronologically', () => {
    const prs = detectPRs([ds('2026-09-08', 5, 95), ds('2026-09-01', 5, 100)]);
    expect(prs.map((p) => p.date)).toEqual(['2026-09-01', '2026-09-01']);
  });

  it('returns an empty list for no sets', () => {
    expect(detectPRs([])).toEqual([]);
  });
});

function epley(w: number, r: number): number {
  return r === 1 ? w : w * (1 + r / 30);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/prs.test.ts`
Expected: FAIL — `Failed to resolve import "./prs"`

- [ ] **Step 3: Write `src/lib/prs.ts`**

```ts
import type { ISODate, UUID } from '../types/domain';
import { epley1RM, MAX_TRACKED_REPS } from './strength';

/** A set flattened with the date of its session — what PR detection needs. */
export interface DatedSet {
  set_id: UUID;
  date: ISODate;
  reps: number;
  weight_kg: number;
  is_warmup: boolean;
}

export type PRKind = 'e1rm' | 'rep_max';

export interface PREvent {
  date: ISODate;
  kind: PRKind;
  reps: number;
  value: number;
  set_id: UUID;
}

/**
 * Walks sets in chronological order and emits an event each time a running
 * best is beaten. Emits rep_max before e1rm for a given set so the order is
 * deterministic. Ties do not count as PRs — the bar has to actually move.
 */
export function detectPRs(sets: DatedSet[]): PREvent[] {
  const working = sets
    .filter((s) => !s.is_warmup && s.weight_kg > 0 && s.reps > 0)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const events: PREvent[] = [];
  const bestByReps = new Map<number, number>();
  let bestE1RM = 0;

  for (const s of working) {
    if (s.reps <= MAX_TRACKED_REPS) {
      const prev = bestByReps.get(s.reps) ?? 0;
      if (s.weight_kg > prev) {
        bestByReps.set(s.reps, s.weight_kg);
        events.push({
          date: s.date,
          kind: 'rep_max',
          reps: s.reps,
          value: s.weight_kg,
          set_id: s.set_id,
        });
      }
    }

    const e = epley1RM(s.weight_kg, s.reps);
    if (e > bestE1RM) {
      bestE1RM = e;
      events.push({ date: s.date, kind: 'e1rm', reps: s.reps, value: e, set_id: s.set_id });
    }
  }

  return events;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/prs.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/prs.ts src/lib/prs.test.ts
git commit -m "feat: add chronological PR detection for e1RM and rep maxes"
```

---

## Task 6: Running calculations

**Files:**
- Create: `src/lib/running.ts`, `src/lib/running.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/running.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { paceSecondsPerKm, formatPace, formatDuration } from './running';

describe('paceSecondsPerKm', () => {
  it('divides duration by distance', () => {
    expect(paceSecondsPerKm(3000, 10)).toBe(300);
  });

  it('returns 0 for zero distance rather than Infinity', () => {
    expect(paceSecondsPerKm(3000, 0)).toBe(0);
  });

  it('returns 0 for negative distance', () => {
    expect(paceSecondsPerKm(3000, -5)).toBe(0);
  });

  it('returns 0 for zero duration', () => {
    expect(paceSecondsPerKm(0, 10)).toBe(0);
  });
});

describe('formatPace', () => {
  it('formats as m:ss', () => {
    expect(formatPace(300)).toBe('5:00');
  });

  it('zero-pads seconds', () => {
    expect(formatPace(305)).toBe('5:05');
  });

  it('rounds to the nearest second', () => {
    expect(formatPace(305.6)).toBe('5:06');
  });

  it('rolls 59.6 seconds up into the next minute', () => {
    expect(formatPace(359.6)).toBe('6:00');
  });

  it('renders an em dash for zero', () => {
    expect(formatPace(0)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatDuration(1830)).toBe('30:30');
  });

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('formats zero as 0:00', () => {
    expect(formatDuration(0)).toBe('0:00');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/running.test.ts`
Expected: FAIL — `Failed to resolve import "./running"`

- [ ] **Step 3: Write `src/lib/running.ts`**

```ts
/** Seconds per kilometre. Returns 0 rather than Infinity for zero distance. */
export function paceSecondsPerKm(durationS: number, distanceKm: number): number {
  if (distanceKm <= 0 || durationS <= 0) return 0;
  return durationS / distanceKm;
}

/** 'm:ss'. Rounds to the nearest second, so 59.6s rolls into the next minute. */
export function formatPace(secPerKm: number): string {
  if (secPerKm <= 0) return '—';
  const total = Math.round(secPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 'm:ss' under an hour, 'h:mm:ss' at or above. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/running.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/running.ts src/lib/running.test.ts
git commit -m "feat: add pace and duration formatting"
```

---

## Task 7: Adherence and weekday streak

The streak rule from the spec: consecutive weekday mornings with a `done` or `partial` session; weekends are neutral. Today gets a grace day — an unlogged Monday morning must not report the streak as zero before you have trained.

**Files:**
- Create: `src/lib/adherence.ts`, `src/lib/adherence.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/adherence.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { adherence, weekdayStreak, type SessionSummary } from './adherence';

function s(date: string, status: SessionSummary['status'], was_planned = true): SessionSummary {
  return { date, status, was_planned };
}

describe('adherence', () => {
  it('counts done and partial against planned', () => {
    const r = adherence([
      s('2026-09-21', 'done'),
      s('2026-09-22', 'partial'),
      s('2026-09-23', 'skipped'),
      s('2026-09-24', 'planned'),
    ]);
    expect(r).toEqual({ planned: 4, completed: 2, pct: 50 });
  });

  it('excludes unplanned sessions from the denominator', () => {
    const r = adherence([s('2026-09-21', 'done'), s('2026-09-22', 'done', false)]);
    expect(r).toEqual({ planned: 1, completed: 1, pct: 100 });
  });

  it('returns 0 pct rather than NaN when nothing was planned', () => {
    expect(adherence([])).toEqual({ planned: 0, completed: 0, pct: 0 });
  });

  it('rounds the percentage to one decimal', () => {
    const r = adherence([s('a', 'done'), s('b', 'skipped'), s('c', 'skipped')]);
    expect(r.pct).toBe(33.3);
  });
});

describe('weekdayStreak', () => {
  it('counts consecutive completed weekdays', () => {
    // Mon 21 – Wed 23 done, asked on Wed 23
    const sessions = [s('2026-09-21', 'done'), s('2026-09-22', 'done'), s('2026-09-23', 'done')];
    expect(weekdayStreak(sessions, '2026-09-23')).toBe(3);
  });

  it('treats weekends as neutral', () => {
    // Fri 18 and Mon 21 done; the weekend between must not break it
    const sessions = [s('2026-09-18', 'done'), s('2026-09-21', 'done')];
    expect(weekdayStreak(sessions, '2026-09-21')).toBe(2);
  });

  it('breaks on a skipped weekday', () => {
    const sessions = [
      s('2026-09-21', 'done'),
      s('2026-09-22', 'skipped'),
      s('2026-09-23', 'done'),
    ];
    expect(weekdayStreak(sessions, '2026-09-23')).toBe(1);
  });

  it('breaks on a weekday with no session at all', () => {
    const sessions = [s('2026-09-21', 'done'), s('2026-09-23', 'done')];
    expect(weekdayStreak(sessions, '2026-09-23')).toBe(1);
  });

  it('gives today a grace day when it is not yet logged', () => {
    // Mon+Tue done, asked on Wed before training
    const sessions = [s('2026-09-21', 'done'), s('2026-09-22', 'done')];
    expect(weekdayStreak(sessions, '2026-09-23')).toBe(2);
  });

  it('gives no grace day to a date before today', () => {
    const sessions = [s('2026-09-21', 'done')];
    expect(weekdayStreak(sessions, '2026-09-23')).toBe(0);
  });

  it('counts partial sessions as completed', () => {
    expect(weekdayStreak([s('2026-09-21', 'partial')], '2026-09-21')).toBe(1);
  });

  it('returns 0 for no sessions', () => {
    expect(weekdayStreak([], '2026-09-23')).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/adherence.test.ts`
Expected: FAIL — `Failed to resolve import "./adherence"`

- [ ] **Step 3: Write `src/lib/adherence.ts`**

```ts
import type { ISODate, SessionStatus } from '../types/domain';
import { addDays, isWeekdayDate } from './time';

/** The minimum a session must expose for adherence and streak maths. */
export interface SessionSummary {
  date: ISODate;
  status: SessionStatus;
  was_planned: boolean;
}

export interface AdherenceResult {
  planned: number;
  completed: number;
  /** 0–100, one decimal place. 0 when nothing was planned. */
  pct: number;
}

function isCompleted(status: SessionStatus): boolean {
  return status === 'done' || status === 'partial';
}

export function adherence(sessions: SessionSummary[]): AdherenceResult {
  const planned = sessions.filter((s) => s.was_planned);
  const completed = planned.filter((s) => isCompleted(s.status));
  const pct =
    planned.length === 0
      ? 0
      : Math.round((completed.length / planned.length) * 1000) / 10;
  return { planned: planned.length, completed: completed.length, pct };
}

/**
 * Consecutive weekday (Mon–Fri) sessions ending at `todayDate`, walking
 * backwards. Weekends are skipped without breaking the chain. `todayDate`
 * itself is forgiven if not yet completed, so the streak does not read as
 * zero first thing in the morning; earlier gaps are not forgiven.
 */
export function weekdayStreak(sessions: SessionSummary[], todayDate: ISODate): number {
  const completedDates = new Set(
    sessions.filter((s) => isCompleted(s.status)).map((s) => s.date),
  );

  let streak = 0;
  let cursor = todayDate;
  let isFirstExamined = true;

  // Bound the walk so a corrupt date can never loop forever. Five years of
  // weekdays is far beyond any streak this app will legitimately report.
  for (let guard = 0; guard < 2000; guard++) {
    if (isWeekdayDate(cursor)) {
      if (completedDates.has(cursor)) {
        streak++;
      } else if (isFirstExamined && cursor === todayDate) {
        // Grace day for today only.
      } else {
        break;
      }
      isFirstExamined = false;
    }
    cursor = addDays(cursor, -1);
  }

  return streak;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/adherence.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/adherence.ts src/lib/adherence.test.ts
git commit -m "feat: add adherence and weekday streak calculations"
```

---

## Task 8: RPE aggregates and the fatigue flag

**Files:**
- Create: `src/lib/rpe.ts`, `src/lib/rpe.test.ts`

- [ ] **Step 1: Write the failing test `src/lib/rpe.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { meanRPE, fatigueFlag, type LoadPoint } from './rpe';
import type { SetEntry } from '../types/domain';

function set(partial: Partial<SetEntry>): SetEntry {
  return {
    id: 'x',
    user_id: null,
    created_at: '2026-09-22T06:00:00.000Z',
    updated_at: '2026-09-22T06:00:00.000Z',
    server_updated_at: null,
    deleted_at: null,
    session_exercise_id: 'se1',
    set_index: 0,
    reps: 5,
    weight_kg: 100,
    rpe: 8,
    is_warmup: false,
    notes: null,
    ...partial,
  };
}

function lp(date: string, rpe: number, topSetLoad: number): LoadPoint {
  return { date, rpe, top_set_load: topSetLoad };
}

describe('meanRPE', () => {
  it('averages working sets', () => {
    expect(meanRPE([set({ rpe: 7 }), set({ rpe: 9 })])).toBe(8);
  });

  it('excludes warm-ups', () => {
    expect(meanRPE([set({ rpe: 5, is_warmup: true }), set({ rpe: 9 })])).toBe(9);
  });

  it('handles half steps', () => {
    expect(meanRPE([set({ rpe: 7.5 }), set({ rpe: 8.5 })])).toBe(8);
  });

  it('returns null for no working sets', () => {
    expect(meanRPE([])).toBeNull();
  });
});

describe('fatigueFlag', () => {
  // Window: 2026-09-22 back 14 days = recent; the 14 days before that = prior.
  const asOf = '2026-09-22';

  it('flags when RPE rises by 0.5 or more at flat load', () => {
    const points = [
      lp('2026-09-02', 7, 100),
      lp('2026-09-05', 7, 100),
      lp('2026-09-16', 8, 100),
      lp('2026-09-19', 8, 100),
    ];
    const r = fatigueFlag(points, asOf);
    expect(r.flagged).toBe(true);
    expect(r.rpe_delta).toBeCloseTo(1, 5);
    expect(r.load_change_pct).toBeCloseTo(0, 5);
  });

  it('does not flag when load rose alongside RPE', () => {
    const points = [
      lp('2026-09-02', 7, 100),
      lp('2026-09-05', 7, 100),
      lp('2026-09-16', 8, 110),
      lp('2026-09-19', 8, 110),
    ];
    expect(fatigueFlag(points, asOf).flagged).toBe(false);
  });

  it('does not flag when the RPE rise is below 0.5', () => {
    const points = [
      lp('2026-09-02', 7, 100),
      lp('2026-09-16', 7.4, 100),
    ];
    expect(fatigueFlag(points, asOf).flagged).toBe(false);
  });

  it('flags at exactly 0.5 and exactly +1% load', () => {
    const points = [
      lp('2026-09-02', 7, 100),
      lp('2026-09-16', 7.5, 101),
    ];
    expect(fatigueFlag(points, asOf).flagged).toBe(true);
  });

  it('does not flag when either window is empty', () => {
    expect(fatigueFlag([lp('2026-09-16', 9, 100)], asOf).flagged).toBe(false);
    expect(fatigueFlag([lp('2026-09-02', 9, 100)], asOf).flagged).toBe(false);
  });

  it('ignores points outside both windows', () => {
    const points = [
      lp('2026-05-01', 3, 200), // far past, must not pollute the prior window
      lp('2026-09-02', 7, 100),
      lp('2026-09-16', 8, 100),
    ];
    expect(fatigueFlag(points, asOf).flagged).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/rpe.test.ts`
Expected: FAIL — `Failed to resolve import "./rpe"`

- [ ] **Step 3: Write `src/lib/rpe.ts`**

```ts
import type { ISODate, SetEntry } from '../types/domain';
import { addDays } from './time';
import { isWorkingSet } from './strength';

/** RPE increase, in points, that counts as a fatigue signal. */
export const FATIGUE_RPE_DELTA = 0.5;
/** Load increase, as a fraction, still considered "flat". */
export const FATIGUE_FLAT_LOAD_PCT = 0.01;
/** Length of each comparison window, in days. */
export const FATIGUE_WINDOW_DAYS = 14;

export function meanRPE(sets: SetEntry[]): number | null {
  const working = sets.filter(isWorkingSet);
  if (working.length === 0) return null;
  const sum = working.reduce((acc, s) => acc + s.rpe, 0);
  return sum / working.length;
}

/** One session's RPE and top-set load for a single exercise. */
export interface LoadPoint {
  date: ISODate;
  rpe: number;
  top_set_load: number;
}

export interface FatigueResult {
  flagged: boolean;
  /** Recent mean RPE minus prior mean RPE. Null when a window is empty. */
  rpe_delta: number | null;
  /** Fractional change in mean top-set load. Null when a window is empty. */
  load_change_pct: number | null;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Compares the trailing 14 days against the 14 days before them. Raised when
 * mean RPE climbs by at least FATIGUE_RPE_DELTA while mean top-set load stays
 * flat — the classic "same weight is getting harder" signal.
 *
 * Both windows must contain data; with only one window populated there is
 * nothing to compare and the flag stays down.
 */
export function fatigueFlag(points: LoadPoint[], asOf: ISODate): FatigueResult {
  const recentStart = addDays(asOf, -FATIGUE_WINDOW_DAYS + 1);
  const priorStart = addDays(asOf, -FATIGUE_WINDOW_DAYS * 2 + 1);

  const recent = points.filter((p) => p.date >= recentStart && p.date <= asOf);
  const prior = points.filter((p) => p.date >= priorStart && p.date < recentStart);

  if (recent.length === 0 || prior.length === 0) {
    return { flagged: false, rpe_delta: null, load_change_pct: null };
  }

  const rpeDelta = mean(recent.map((p) => p.rpe)) - mean(prior.map((p) => p.rpe));
  const priorLoad = mean(prior.map((p) => p.top_set_load));
  const recentLoad = mean(recent.map((p) => p.top_set_load));
  const loadChange = priorLoad === 0 ? 0 : (recentLoad - priorLoad) / priorLoad;

  return {
    flagged: rpeDelta >= FATIGUE_RPE_DELTA && loadChange <= FATIGUE_FLAT_LOAD_PCT,
    rpe_delta: rpeDelta,
    load_change_pct: loadChange,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/rpe.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/rpe.ts src/lib/rpe.test.ts
git commit -m "feat: add RPE aggregates and fatigue flag"
```

---

## Task 9: Dexie schema and write helpers

`_dirty` is `0 | 1` rather than a boolean because IndexedDB cannot index boolean values — a boolean index silently matches nothing, which would make the sync layer appear to work while pushing zero rows.

**Files:**
- Create: `src/db/schema.ts`, `src/db/repo.ts`, `src/db/repo.test.ts`

- [ ] **Step 1: Write the failing test `src/db/repo.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './schema';
import { insertRow, updateRow, softDeleteRow, dirtyRows } from './repo';
import type { Exercise } from '../types/domain';

async function reset() {
  await db.delete();
  await db.open();
}

describe('repo', () => {
  beforeEach(reset);

  it('stamps id, timestamps and the dirty flag on insert', async () => {
    const row = await insertRow<Exercise>('exercises', {
      name: 'Back Squat',
      muscle_group: 'legs',
      modality: 'strength',
      run_type: null,
      default_sets: 3,
      default_reps: 5,
      default_weight_kg: 100,
      default_duration_s: null,
      default_distance_km: null,
      sort_order: 1,
    });

    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.created_at).toBe(row.updated_at);
    expect(row.server_updated_at).toBeNull();
    expect(row.deleted_at).toBeNull();
    expect(row._dirty).toBe(1);

    const stored = await db.exercises.get(row.id);
    expect(stored?.name).toBe('Back Squat');
  });

  it('advances updated_at and re-marks dirty on update', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await db.exercises.update(row.id, { _dirty: 0 });

    const updated = await updateRow<Exercise>('exercises', row.id, { name: 'Front Squat' });

    expect(updated.name).toBe('Front Squat');
    expect(updated._dirty).toBe(1);
    expect(updated.updated_at >= row.updated_at).toBe(true);
    expect(updated.created_at).toBe(row.created_at);
  });

  it('sets deleted_at instead of removing the row', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await softDeleteRow('exercises', row.id);

    const stored = await db.exercises.get(row.id);
    expect(stored).toBeDefined();
    expect(stored?.deleted_at).not.toBeNull();
    expect(stored?._dirty).toBe(1);
  });

  it('returns only dirty rows', async () => {
    const a = await insertRow<Exercise>('exercises', baseExercise());
    const b = await insertRow<Exercise>('exercises', baseExercise());
    await db.exercises.update(a.id, { _dirty: 0 });

    const dirty = await dirtyRows('exercises');
    expect(dirty.map((r) => r.id)).toEqual([b.id]);
  });

  it('returns an empty array when nothing is dirty', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await db.exercises.update(row.id, { _dirty: 0 });
    expect(await dirtyRows('exercises')).toEqual([]);
  });
});

function baseExercise() {
  return {
    name: 'Bench Press',
    muscle_group: 'chest',
    modality: 'strength' as const,
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: 80,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 2,
  };
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/db/repo.test.ts`
Expected: FAIL — `Failed to resolve import "./schema"`

- [ ] **Step 3: Write `src/db/schema.ts`**

```ts
import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyMetric,
  Exercise,
  Local,
  Run,
  RunSplit,
  Session,
  SessionExercise,
  SetEntry,
  SyncMeta,
  UserPrefs,
  WeekPlan,
  WeekPlanDay,
  WorkoutTemplate,
  WorkoutTemplateItem,
} from '../types/domain';

export class FitTrackerDB extends Dexie {
  exercises!: EntityTable<Local<Exercise>, 'id'>;
  workout_templates!: EntityTable<Local<WorkoutTemplate>, 'id'>;
  workout_template_items!: EntityTable<Local<WorkoutTemplateItem>, 'id'>;
  week_plans!: EntityTable<Local<WeekPlan>, 'id'>;
  week_plan_days!: EntityTable<Local<WeekPlanDay>, 'id'>;
  sessions!: EntityTable<Local<Session>, 'id'>;
  session_exercises!: EntityTable<Local<SessionExercise>, 'id'>;
  set_entries!: EntityTable<Local<SetEntry>, 'id'>;
  runs!: EntityTable<Local<Run>, 'id'>;
  run_splits!: EntityTable<Local<RunSplit>, 'id'>;
  body_metrics!: EntityTable<Local<BodyMetric>, 'id'>;
  user_prefs!: EntityTable<Local<UserPrefs>, 'id'>;
  sync_meta!: EntityTable<SyncMeta, 'table'>;

  constructor() {
    super('fit_tracker');

    this.version(1).stores({
      exercises: 'id, _dirty, updated_at, deleted_at, modality, muscle_group, sort_order',
      workout_templates: 'id, _dirty, updated_at, deleted_at, name',
      workout_template_items: 'id, _dirty, updated_at, deleted_at, template_id, position',
      week_plans: 'id, _dirty, updated_at, deleted_at, active_from',
      week_plan_days: 'id, _dirty, updated_at, deleted_at, week_plan_id, weekday',
      sessions: 'id, _dirty, updated_at, deleted_at, date, status, was_planned',
      session_exercises: 'id, _dirty, updated_at, deleted_at, session_id, position',
      set_entries: 'id, _dirty, updated_at, deleted_at, session_exercise_id, set_index',
      runs: 'id, _dirty, updated_at, deleted_at, session_id',
      run_splits: 'id, _dirty, updated_at, deleted_at, run_id, split_index',
      body_metrics: 'id, _dirty, updated_at, deleted_at, date',
      user_prefs: 'id, _dirty, updated_at, deleted_at',
      sync_meta: 'table',
    });
  }
}

export const db = new FitTrackerDB();

/** Table names that participate in sync. `sync_meta` is deliberately absent. */
export type SyncedTableName =
  | 'exercises'
  | 'workout_templates'
  | 'workout_template_items'
  | 'week_plans'
  | 'week_plan_days'
  | 'sessions'
  | 'session_exercises'
  | 'set_entries'
  | 'runs'
  | 'run_splits'
  | 'body_metrics'
  | 'user_prefs';
```

- [ ] **Step 4: Write `src/db/repo.ts`**

```ts
import type { BaseRow, Local, UUID } from '../types/domain';
import { newId } from '../lib/id';
import { nowISO } from '../lib/time';
import { db, type SyncedTableName } from './schema';

type Insertable<T extends BaseRow> = Omit<T, keyof BaseRow>;

function table(name: SyncedTableName) {
  // Dexie's generated table properties are typed per-entity; the sync layer
  // needs them addressed by name, so this is the single cast point.
  return db[name] as unknown as import('dexie').Table<Local<BaseRow>, UUID>;
}

/** Inserts a row, stamping identity, timestamps, and the dirty flag. */
export async function insertRow<T extends BaseRow>(
  name: SyncedTableName,
  data: Insertable<T>,
): Promise<Local<T>> {
  const ts = nowISO();
  const row = {
    ...data,
    id: newId(),
    user_id: null,
    created_at: ts,
    updated_at: ts,
    server_updated_at: null,
    deleted_at: null,
    _dirty: 1 as const,
  } as Local<T>;

  await table(name).put(row as Local<BaseRow>);
  return row;
}

/** Applies a patch, advancing updated_at and re-marking the row dirty. */
export async function updateRow<T extends BaseRow>(
  name: SyncedTableName,
  id: UUID,
  patch: Partial<Omit<T, keyof BaseRow>>,
): Promise<Local<T>> {
  const existing = (await table(name).get(id)) as Local<T> | undefined;
  if (!existing) throw new Error(`${name}: no row with id ${id}`);

  const row = {
    ...existing,
    ...patch,
    updated_at: nowISO(),
    _dirty: 1 as const,
  } as Local<T>;

  await table(name).put(row as Local<BaseRow>);
  return row;
}

/** Soft delete. The row stays so its tombstone can propagate. */
export async function softDeleteRow(name: SyncedTableName, id: UUID): Promise<void> {
  const existing = await table(name).get(id);
  if (!existing) return;

  await table(name).put({
    ...existing,
    deleted_at: nowISO(),
    updated_at: nowISO(),
    _dirty: 1,
  });
}

export async function dirtyRows(name: SyncedTableName): Promise<Local<BaseRow>[]> {
  return table(name).where('_dirty').equals(1).toArray();
}

export async function clearDirty(name: SyncedTableName, ids: UUID[]): Promise<void> {
  await db.transaction('rw', table(name), async () => {
    for (const id of ids) {
      await table(name).update(id, { _dirty: 0 });
    }
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/db/repo.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts src/db/repo.ts src/db/repo.test.ts
git commit -m "feat: add Dexie schema and dirty-tracking write helpers"
```

---

## Task 10: Seed the exercise library

**Files:**
- Create: `src/db/seed.ts`, `src/db/seed.test.ts`

- [ ] **Step 1: Write the failing test `src/db/seed.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './schema';
import { seedExercises, SEED_EXERCISES } from './seed';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('seedExercises', () => {
  it('seeds at least 40 strength exercises and 4 run types', async () => {
    await seedExercises();
    const all = await db.exercises.toArray();
    expect(all.filter((e) => e.modality === 'strength').length).toBeGreaterThanOrEqual(40);
    expect(all.filter((e) => e.modality === 'cardio').length).toBe(4);
  });

  it('marks every seeded row dirty so it syncs up', async () => {
    await seedExercises();
    const all = await db.exercises.toArray();
    expect(all.every((e) => e._dirty === 1)).toBe(true);
  });

  it('is idempotent — running twice does not duplicate', async () => {
    await seedExercises();
    const first = await db.exercises.count();
    await seedExercises();
    expect(await db.exercises.count()).toBe(first);
  });

  it('is idempotent under concurrent calls', async () => {
    await Promise.all([seedExercises(), seedExercises()]);
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length);
  });

  it('does not seed when the library already has rows', async () => {
    await seedExercises();
    await db.exercises.toCollection().modify({ name: 'renamed' });
    await seedExercises();
    const all = await db.exercises.toArray();
    expect(all.every((e) => e.name === 'renamed')).toBe(true);
  });

  it('gives every cardio row a run_type and every strength row none', () => {
    for (const e of SEED_EXERCISES) {
      if (e.modality === 'cardio') expect(e.run_type).not.toBeNull();
      else expect(e.run_type).toBeNull();
    }
  });

  it('has no duplicate names', () => {
    const names = SEED_EXERCISES.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/db/seed.test.ts`
Expected: FAIL — `Failed to resolve import "./seed"`

- [ ] **Step 3: Write `src/db/seed.ts`**

```ts
import type { Exercise } from '../types/domain';
import { db } from './schema';
import { insertRow } from './repo';

type SeedExercise = Omit<Exercise, keyof import('../types/domain').BaseRow>;

function strength(
  name: string,
  muscle_group: string,
  default_reps: number,
  sort_order: number,
): SeedExercise {
  return {
    name,
    muscle_group,
    modality: 'strength',
    run_type: null,
    default_sets: 3,
    default_reps,
    default_weight_kg: null,
    default_duration_s: null,
    default_distance_km: null,
    sort_order,
  };
}

function run(
  name: string,
  run_type: Exercise['run_type'],
  distanceKm: number,
  durationS: number,
  sort_order: number,
): SeedExercise {
  return {
    name,
    muscle_group: 'cardio',
    modality: 'cardio',
    run_type,
    default_sets: null,
    default_reps: null,
    default_weight_kg: null,
    default_duration_s: durationS,
    default_distance_km: distanceKm,
    sort_order,
  };
}

export const SEED_EXERCISES: SeedExercise[] = [
  // Legs
  strength('Back Squat', 'legs', 5, 1),
  strength('Front Squat', 'legs', 5, 2),
  strength('Romanian Deadlift', 'legs', 8, 3),
  strength('Conventional Deadlift', 'legs', 5, 4),
  strength('Bulgarian Split Squat', 'legs', 8, 5),
  strength('Walking Lunge', 'legs', 10, 6),
  strength('Leg Press', 'legs', 10, 7),
  strength('Leg Extension', 'legs', 12, 8),
  strength('Leg Curl', 'legs', 12, 9),
  strength('Hip Thrust', 'legs', 8, 10),
  strength('Standing Calf Raise', 'legs', 12, 11),
  strength('Seated Calf Raise', 'legs', 15, 12),
  strength('Goblet Squat', 'legs', 10, 13),
  strength('Hack Squat', 'legs', 8, 14),

  // Chest
  strength('Barbell Bench Press', 'chest', 5, 20),
  strength('Incline Barbell Bench Press', 'chest', 8, 21),
  strength('Dumbbell Bench Press', 'chest', 8, 22),
  strength('Incline Dumbbell Press', 'chest', 10, 23),
  strength('Cable Fly', 'chest', 12, 24),
  strength('Push-Up', 'chest', 12, 25),
  strength('Dip', 'chest', 8, 26),

  // Back
  strength('Pull-Up', 'back', 8, 30),
  strength('Chin-Up', 'back', 8, 31),
  strength('Lat Pulldown', 'back', 10, 32),
  strength('Barbell Row', 'back', 8, 33),
  strength('Pendlay Row', 'back', 5, 34),
  strength('Seated Cable Row', 'back', 10, 35),
  strength('Single-Arm Dumbbell Row', 'back', 10, 36),
  strength('Face Pull', 'back', 15, 37),
  strength('Barbell Shrug', 'back', 12, 38),

  // Shoulders
  strength('Overhead Press', 'shoulders', 5, 40),
  strength('Seated Dumbbell Press', 'shoulders', 8, 41),
  strength('Arnold Press', 'shoulders', 10, 42),
  strength('Lateral Raise', 'shoulders', 15, 43),
  strength('Rear Delt Fly', 'shoulders', 15, 44),

  // Arms
  strength('Barbell Curl', 'arms', 10, 50),
  strength('Dumbbell Curl', 'arms', 10, 51),
  strength('Hammer Curl', 'arms', 12, 52),
  strength('Preacher Curl', 'arms', 12, 53),
  strength('Triceps Pushdown', 'arms', 12, 54),
  strength('Overhead Triceps Extension', 'arms', 12, 55),
  strength('Close-Grip Bench Press', 'arms', 8, 56),

  // Core
  strength('Plank', 'core', 1, 60),
  strength('Hanging Leg Raise', 'core', 12, 61),
  strength('Cable Crunch', 'core', 15, 62),
  strength('Ab Wheel Rollout', 'core', 10, 63),
  strength('Back Extension', 'core', 12, 64),

  // Runs
  run('Easy Run', 'easy', 8, 3000, 100),
  run('Tempo Run', 'tempo', 8, 2700, 101),
  run('Interval Session', 'intervals', 8, 3000, 102),
  run('Long Run', 'long', 15, 5400, 103),
];

/**
 * Populates the exercise library on first launch. No-op if any exercise
 * already exists, so a re-run after the user has edited the library cannot
 * resurrect defaults they deleted or overwrite renames.
 *
 * The count and the inserts run in one read-write transaction. Without that,
 * two concurrent callers — which React StrictMode produces on every mount in
 * development — both observe an empty table and both seed it.
 */
export async function seedExercises(): Promise<number> {
  return db.transaction('rw', db.exercises, async () => {
    const existing = await db.exercises.count();
    if (existing > 0) return 0;

    for (const e of SEED_EXERCISES) {
      await insertRow<Exercise>('exercises', e);
    }
    return SEED_EXERCISES.length;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/db/seed.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add src/db/seed.ts src/db/seed.test.ts
git commit -m "feat: seed exercise library with 47 strength exercises and 4 run types"
```

---

## Task 11: Phase 1 checkpoint — wire the DB into the app

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace `src/App.tsx`**

```tsx
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
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all suites pass — time, strength, prs, running, adherence, rpe, repo, seed, smoke

- [ ] **Step 3: Run the app**

Run: `npm run dev`

**What to check:** Open the printed localhost URL. You should see a dark page reading "Exercise library: 51 exercises". Reload — the count stays 51, not 102, which proves the seed is idempotent. In DevTools → Application → IndexedDB → `fit_tracker` → `exercises`, every row should have `_dirty: 1`, `server_updated_at: null`, and a UUID `id`.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: seed library on launch and show exercise count"
```

---

# Phase 2 — Supabase schema, RLS, and auth

## Task 12: Schema migration

**Files:**
- Create: `supabase/migrations/0001_init.sql`

- [ ] **Step 1: Write `supabase/migrations/0001_init.sql`**

```sql
-- Fit Tracker 0001: tables, trigger, indexes.
-- Apply by pasting into the Supabase SQL editor.

create or replace function touch_server_updated_at() returns trigger as $$
begin
  new.server_updated_at := now();
  new.user_id := coalesce(new.user_id, auth.uid());
  return new;
end $$ language plpgsql;

-- Deliberately does NOT touch updated_at: the client owns that value, which
-- is what makes last-write-wins deterministic for rows written offline.

create table exercises (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  muscle_group text,
  modality text not null check (modality in ('strength','cardio')),
  run_type text check (run_type in ('easy','tempo','intervals','long')),
  default_sets int,
  default_reps int,
  default_weight_kg numeric(6,2),
  default_duration_s int,
  default_distance_km numeric(6,2),
  sort_order int not null default 0
);

create table workout_templates (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  notes text
);

create table workout_template_items (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  template_id uuid not null references workout_templates(id),
  exercise_id uuid not null references exercises(id),
  position int not null default 0,
  target_sets int,
  target_reps int,
  target_weight_kg numeric(6,2),
  target_duration_s int,
  target_distance_km numeric(6,2),
  target_rpe numeric(3,1),
  rest_seconds int,
  notes text
);

create table week_plans (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  name text not null,
  active_from date not null
);

create table week_plan_days (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  week_plan_id uuid not null references week_plans(id),
  weekday int not null check (weekday between 1 and 7),
  template_id uuid references workout_templates(id)
);

create table sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  date date not null,
  kind text not null check (kind in ('strength','run','mixed')),
  status text not null check (status in ('planned','done','partial','skipped')),
  template_id uuid references workout_templates(id),
  was_planned boolean not null default true,
  energy int check (energy between 1 and 5),
  notes text,
  started_at timestamptz,
  completed_at timestamptz
);

create table session_exercises (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  session_id uuid not null references sessions(id),
  exercise_id uuid not null references exercises(id),
  position int not null default 0,
  notes text,
  target_sets int,
  target_reps int,
  target_weight_kg numeric(6,2)
);

create table set_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  session_exercise_id uuid not null references session_exercises(id),
  set_index int not null default 0,
  reps int not null,
  weight_kg numeric(6,2) not null,
  rpe numeric(3,1) not null check (rpe between 1 and 10),
  is_warmup boolean not null default false,
  notes text
);

create table runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  session_id uuid not null references sessions(id),
  exercise_id uuid not null references exercises(id),
  run_type text not null check (run_type in ('easy','tempo','intervals','long')),
  distance_km numeric(6,2) not null,
  duration_s int not null,
  rpe numeric(3,1) not null check (rpe between 1 and 10),
  avg_hr int,
  weather text,
  route_note text
);

create table run_splits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  run_id uuid not null references runs(id),
  split_index int not null default 0,
  distance_km numeric(6,2) not null,
  duration_s int not null
);

create table body_metrics (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  date date not null,
  weight_kg numeric(5,2),
  resting_hr int,
  note text
);

create table user_prefs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  rest_seconds_default int not null default 120,
  vibration boolean not null default true,
  theme text not null default 'dark'
);

-- Foreign keys between app tables intentionally omit ON DELETE CASCADE.
-- Soft delete is the only delete path during normal use; a cascade would
-- erase rows whose tombstones still need to reach the phone.

do $$
declare t text;
begin
  foreach t in array array[
    'exercises','workout_templates','workout_template_items','week_plans',
    'week_plan_days','sessions','session_exercises','set_entries','runs',
    'run_splits','body_metrics','user_prefs'
  ] loop
    execute format(
      'create trigger %I_touch before insert or update on %I
       for each row execute function touch_server_updated_at()', t, t);
    execute format(
      'create index %I on %I (user_id, server_updated_at)', t || '_pull_idx', t);
  end loop;
end $$;

create index sessions_date_idx on sessions (user_id, date);
create index body_metrics_date_idx on body_metrics (user_id, date);
create index set_entries_parent_idx on set_entries (session_exercise_id);
create index session_exercises_parent_idx on session_exercises (session_id);
create index run_splits_parent_idx on run_splits (run_id);
```

- [ ] **Step 2: Apply the migration**

Create a free Supabase project at supabase.com (no card required). Open SQL Editor → New query, paste the file, run.
Expected: `Success. No rows returned`. Table Editor now lists twelve tables.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: add Supabase schema migration"
```

---

## Task 13: RLS migration

**Files:**
- Create: `supabase/migrations/0002_rls.sql`

- [ ] **Step 1: Write `supabase/migrations/0002_rls.sql`**

```sql
-- Fit Tracker 0002: row level security.
-- The anon key ships inside the APK and is extractable. RLS is what actually
-- protects the data; revoking anon grants is the second layer.

do $$
declare t text;
begin
  foreach t in array array[
    'exercises','workout_templates','workout_template_items','week_plans',
    'week_plan_days','sessions','session_exercises','set_entries','runs',
    'run_splits','body_metrics','user_prefs'
  ] loop
    execute format('alter table %I enable row level security', t);

    execute format(
      'create policy own_select on %I for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy own_insert on %I for insert with check (auth.uid() = user_id)', t);
    -- The WITH CHECK on update is not optional: without it a row's user_id
    -- can be reassigned to another account.
    execute format(
      'create policy own_update on %I for update
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    -- DELETE exists solely for Settings -> "Delete all data".
    execute format(
      'create policy own_delete on %I for delete using (auth.uid() = user_id)', t);

    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
```

- [ ] **Step 2: Apply the migration**

SQL Editor → New query → paste → run.
Expected: `Success. No rows returned`.

- [ ] **Step 3: Verify RLS is actually on**

Run in the SQL editor:

```sql
select tablename, rowsecurity from pg_tables
where schemaname = 'public' order by tablename;
```

Expected: twelve rows, `rowsecurity = true` on every one.

- [ ] **Step 4: Create the single account and close signups**

1. Authentication → Users → Add user → your email and a password. Tick "Auto Confirm User".
2. Authentication → Sign In / Providers → Email → turn **off** "Allow new users to sign up".

Without step 2, anyone with the anon key extracted from your APK can create accounts on your project. They could not read your rows, but they could exhaust the free tier.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_rls.sql
git commit -m "feat: add RLS policies and revoke anon grants"
```

---

## Task 14: Supabase client

**Files:**
- Create: `src/supabase/client.ts`, `.env`

- [ ] **Step 1: Create `.env` (not committed)**

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

Both values are under Project Settings → API.

- [ ] **Step 2: Write `src/supabase/client.ts`**

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill both.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // No magic links, so there is no callback URL to parse.
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 3: Verify the env is wired**

Run: `npm run dev`
Expected: the page still renders the exercise count. A missing `.env` throws the message above in the console instead of failing silently.

- [ ] **Step 4: Commit**

```bash
git add src/supabase/client.ts
git commit -m "feat: add configured Supabase client"
```

Confirm `.env` is **not** in the commit: `git status --porcelain .env` should print nothing.

---

## Task 15: Email and password auth

**Files:**
- Create: `src/features/auth/useAuth.ts`, `src/features/auth/SignIn.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/features/auth/useAuth.ts`**

```ts
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../../supabase/client';

export interface AuthState {
  session: Session | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
```

- [ ] **Step 2: Write `src/features/auth/SignIn.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { signIn } from './useAuth';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">Fit Tracker</h1>

        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm text-[var(--color-muted)]">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-3 text-base"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm text-[var(--color-muted)]">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] px-3 py-3 text-base"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[var(--color-accent)] text-black font-medium px-4 py-3 disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
```

The inputs use `text-base` (16px) deliberately: Android Chrome zooms the viewport on focus for anything smaller.

- [ ] **Step 3: Replace `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { db } from './db/schema';
import { seedExercises } from './db/seed';
import { useAuth, signOut } from './features/auth/useAuth';
import SignIn from './features/auth/SignIn';

export default function App() {
  const { session, loading } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      await seedExercises();
      setCount(await db.exercises.count());
    })();
  }, [session]);

  if (loading) {
    return <main className="p-6 text-[var(--color-muted)]">Loading…</main>;
  }

  if (!session) return <SignIn />;

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-2xl font-semibold">Fit Tracker</h1>
      <p className="text-[var(--color-muted)]">Signed in as {session.user.email}</p>
      <p className="text-[var(--color-muted)]">
        Exercise library: <span className="text-[var(--color-text)]">{count ?? '…'}</span>
      </p>
      <button
        onClick={signOut}
        className="rounded-lg border border-[var(--color-border)] px-4 py-2"
      >
        Sign out
      </button>
    </main>
  );
}
```

- [ ] **Step 4: Phase 2 checkpoint — run the app**

Run: `npm run dev`

**What to check:** You get the sign-in form. A wrong password shows "Invalid login credentials" rather than a blank screen. A correct sign-in shows your email and the exercise count. Reload — you stay signed in. Sign out returns you to the form.

Then confirm RLS is doing its job. In the Supabase SQL editor run:

```sql
select count(*) from exercises;
```

Expected: `0`. The SQL editor runs as a privileged role but with no `auth.uid()`, so the policies correctly match nothing. Rows only appear after Phase 3 pushes them.

- [ ] **Step 5: Commit**

```bash
git add src/features/auth src/App.tsx
git commit -m "feat: add email and password auth with persisted session"
```

---

# Phase 3 — Sync layer

## Task 16: Sync types and the table registry

Foreign-key ordering is declared in exactly one place. Push and pull both read it, so the two can never drift out of agreement.

**Files:**
- Create: `src/sync/types.ts`, `src/sync/tables.ts`

- [ ] **Step 1: Write `src/sync/types.ts`**

```ts
import type { ISODateTime } from '../types/domain';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  pendingCount: number;
  lastSyncedAt: ISODateTime | null;
  error: string | null;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}
```

- [ ] **Step 2: Write `src/sync/tables.ts`**

```ts
import type { SyncedTableName } from '../db/schema';

/**
 * Foreign-key-safe order. Parents before children, so a push never inserts a
 * row whose parent has not arrived yet. Pull applies the same order for the
 * same reason. This is the single declaration — push.ts and pull.ts both
 * import it rather than hard-coding their own list.
 */
export const SYNCED_TABLES: readonly SyncedTableName[] = [
  'exercises',
  'workout_templates',
  'workout_template_items',
  'week_plans',
  'week_plan_days',
  'sessions',
  'session_exercises',
  'set_entries',
  'runs',
  'run_splits',
  'body_metrics',
  'user_prefs',
] as const;
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc -b`
Expected: no output, exit code 0

- [ ] **Step 4: Commit**

```bash
git add src/sync/types.ts src/sync/tables.ts
git commit -m "feat: add sync types and ordered table registry"
```

---

## Task 17: The merge rule

This is the heart of the sync layer and the single most valuable thing to have under test.

**Files:**
- Create: `src/sync/merge.ts`, `src/sync/merge.test.ts`

- [ ] **Step 1: Write the failing test `src/sync/merge.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { mergeRow } from './merge';
import type { BaseRow, Local } from '../types/domain';

function row(updated_at: string, extra: Partial<BaseRow> = {}): BaseRow {
  return {
    id: 'r1',
    user_id: 'u1',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at,
    server_updated_at: '2026-09-01T00:00:01.000Z',
    deleted_at: null,
    ...extra,
  };
}

function local(updated_at: string, dirty: 0 | 1, extra: Partial<BaseRow> = {}): Local<BaseRow> {
  return { ...row(updated_at, extra), _dirty: dirty };
}

describe('mergeRow', () => {
  it('takes the remote row when there is no local row', () => {
    const remote = row('2026-09-10T00:00:00.000Z');
    expect(mergeRow(undefined, remote)).toEqual({ ...remote, _dirty: 0 });
  });

  it('keeps the local row when there is no remote row', () => {
    const l = local('2026-09-10T00:00:00.000Z', 1);
    expect(mergeRow(l, undefined)).toBe(l);
  });

  it('takes the remote row when remote is newer', () => {
    const l = local('2026-09-10T00:00:00.000Z', 1);
    const remote = row('2026-09-11T00:00:00.000Z');
    expect(mergeRow(l, remote)).toEqual({ ...remote, _dirty: 0 });
  });

  it('keeps the local row and its dirty flag when local is newer', () => {
    const l = local('2026-09-12T00:00:00.000Z', 1);
    const remote = row('2026-09-11T00:00:00.000Z');
    const merged = mergeRow(l, remote);
    expect(merged).toBe(l);
    expect(merged!._dirty).toBe(1);
  });

  it('resolves a tie to the remote row so repeated syncs converge', () => {
    const ts = '2026-09-11T00:00:00.000Z';
    const l = local(ts, 1);
    const remote = row(ts, { deleted_at: '2026-09-11T00:00:00.000Z' });
    const merged = mergeRow(l, remote);
    expect(merged!.deleted_at).toBe('2026-09-11T00:00:00.000Z');
    expect(merged!._dirty).toBe(0);
  });

  it('accepts a remote tombstone that is newer than the local row', () => {
    const l = local('2026-09-10T00:00:00.000Z', 0);
    const remote = row('2026-09-11T00:00:00.000Z', {
      deleted_at: '2026-09-11T00:00:00.000Z',
    });
    expect(mergeRow(l, remote)!.deleted_at).toBe('2026-09-11T00:00:00.000Z');
  });

  it('keeps a local tombstone that is newer than the remote row', () => {
    const l = local('2026-09-12T00:00:00.000Z', 1, {
      deleted_at: '2026-09-12T00:00:00.000Z',
    });
    const remote = row('2026-09-11T00:00:00.000Z');
    expect(mergeRow(l, remote)!.deleted_at).toBe('2026-09-12T00:00:00.000Z');
  });

  it('returns undefined when both sides are missing', () => {
    expect(mergeRow(undefined, undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: FAIL — `Failed to resolve import "./merge"`

- [ ] **Step 3: Write `src/sync/merge.ts`**

```ts
import type { BaseRow, Local } from '../types/domain';

/**
 * Row-level last-write-wins, comparing the client-owned `updated_at`.
 *
 * A tie resolves to the remote row. That matters: resolving ties to the local
 * row would leave it dirty forever, so every sync would re-push the same row
 * and never converge.
 *
 * Tombstones need no special case — a soft-deleted row is an ordinary update
 * with `deleted_at` set, so the same comparison carries it in either
 * direction.
 */
export function mergeRow<T extends BaseRow>(
  localRow: Local<T> | undefined,
  remoteRow: T | undefined,
): Local<T> | undefined {
  if (!localRow && !remoteRow) return undefined;
  if (!localRow) return { ...(remoteRow as T), _dirty: 0 } as Local<T>;
  if (!remoteRow) return localRow;

  if (remoteRow.updated_at >= localRow.updated_at) {
    return { ...remoteRow, _dirty: 0 } as Local<T>;
  }

  return localRow;
}
```

ISO 8601 UTC strings compare correctly with `>=` because the format is fixed-width and lexicographically ordered. `nowISO()` always produces that format.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sync/merge.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/sync/merge.ts src/sync/merge.test.ts
git commit -m "feat: add last-write-wins row merge"
```

---

## Task 18: Push

**Files:**
- Create: `src/sync/push.ts`, `src/sync/push.test.ts`

- [ ] **Step 1: Write the failing test `src/sync/push.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { insertRow, softDeleteRow } from '../db/repo';
import { pushTable, stripLocal, type PushClient } from './push';
import type { BaseRow, Exercise } from '../types/domain';

function fakeClient(): PushClient & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async upsert(table, rows) {
      calls.push([table, rows]);
      return { error: null };
    },
  };
}

function baseExercise() {
  return {
    name: 'Back Squat',
    muscle_group: 'legs',
    modality: 'strength' as const,
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: 100,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 1,
  };
}

function bareRow(): BaseRow {
  return {
    id: 'a',
    user_id: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    server_updated_at: null,
    deleted_at: null,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('stripLocal', () => {
  it('removes the _dirty field', () => {
    const out = stripLocal<BaseRow>({ ...bareRow(), _dirty: 1 });
    expect('_dirty' in out).toBe(false);
    expect(out.id).toBe('a');
  });

  it('keeps every synced column', () => {
    const out = stripLocal<BaseRow>({ ...bareRow(), _dirty: 1 });
    expect(out).toEqual(bareRow());
  });

  it('stamps user_id onto the row', () => {
    const out = stripLocal<BaseRow>({ ...bareRow(), _dirty: 1 }, 'u1');
    expect(out.user_id).toBe('u1');
  });
});

describe('pushTable', () => {
  it('uploads dirty rows and clears their flags', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    const client = fakeClient();

    const n = await pushTable(client, 'exercises', 'u1');

    expect(n).toBe(1);
    expect(client.calls[0][0]).toBe('exercises');
    expect((await db.exercises.get(row.id))?._dirty).toBe(0);
  });

  it('never sends the _dirty field to the server', async () => {
    await insertRow<Exercise>('exercises', baseExercise());
    const client = fakeClient();

    await pushTable(client, 'exercises', 'u1');

    const rows = client.calls[0][1] as Record<string, unknown>[];
    expect(rows.every((r) => !('_dirty' in r))).toBe(true);
  });

  it('pushes tombstones like any other row', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await db.exercises.update(row.id, { _dirty: 0 });
    await softDeleteRow('exercises', row.id);

    const client = fakeClient();
    await pushTable(client, 'exercises', 'u1');

    const rows = client.calls[0][1] as Record<string, unknown>[];
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('does nothing and makes no request when nothing is dirty', async () => {
    const client = fakeClient();
    const n = await pushTable(client, 'exercises', 'u1');
    expect(n).toBe(0);
    expect(client.calls).toEqual([]);
  });

  it('leaves rows dirty when the upload fails', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    const client: PushClient = {
      async upsert() {
        return { error: new Error('network down') };
      },
    };

    await expect(pushTable(client, 'exercises', 'u1')).rejects.toThrow('network down');
    expect((await db.exercises.get(row.id))?._dirty).toBe(1);
  });

  it('batches large pushes', async () => {
    for (let i = 0; i < 250; i++) {
      await insertRow<Exercise>('exercises', { ...baseExercise(), sort_order: i });
    }
    const client = fakeClient();

    const n = await pushTable(client, 'exercises', 'u1');

    expect(n).toBe(250);
    expect(client.calls.length).toBe(3); // 100 + 100 + 50
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sync/push.test.ts`
Expected: FAIL — `Failed to resolve import "./push"`

- [ ] **Step 3: Write `src/sync/push.ts`**

```ts
import type { BaseRow, Local, UUID } from '../types/domain';
import type { SyncedTableName } from '../db/schema';
import { clearDirty, dirtyRows } from '../db/repo';

/** Batch size. Keeps each request well inside Supabase's payload limits. */
export const PUSH_BATCH_SIZE = 100;

/** The slice of the Supabase client push needs. Narrow for testability. */
export interface PushClient {
  upsert(table: string, rows: BaseRow[]): Promise<{ error: Error | null }>;
}

/** Removes local-only fields and stamps ownership before upload. */
export function stripLocal<T extends BaseRow>(row: Local<T>, userId?: UUID): T {
  const { _dirty: _ignored, ...rest } = row;
  // Omit<Local<T>, '_dirty'> is not provably T — T could itself declare
  // _dirty — so the compiler needs the widening step spelled out.
  const out = rest as unknown as T;
  return userId ? { ...out, user_id: userId } : out;
}

/**
 * Uploads every dirty row in one table. Dirty flags are cleared only after the
 * server acknowledges the batch, so a failed push leaves the rows queued and
 * the next attempt retries them.
 */
export async function pushTable(
  client: PushClient,
  name: SyncedTableName,
  userId: UUID,
): Promise<number> {
  const rows = await dirtyRows(name);
  if (rows.length === 0) return 0;

  let pushed = 0;
  for (let i = 0; i < rows.length; i += PUSH_BATCH_SIZE) {
    const batch = rows.slice(i, i + PUSH_BATCH_SIZE);
    const payload = batch.map((r) => stripLocal(r, userId));

    const { error } = await client.upsert(name, payload);
    if (error) throw error;

    await clearDirty(name, batch.map((r) => r.id));
    pushed += batch.length;
  }

  return pushed;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sync/push.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/sync/push.ts src/sync/push.test.ts
git commit -m "feat: add batched push with acknowledge-then-clear semantics"
```

---

## Task 19: Pull

The watermark query uses `>=`, not `>`. Two rows can share a `server_updated_at` value, and a strict comparison drops whichever ones were written after the watermark was recorded. Re-applying a row is idempotent, so the one-row overlap is harmless.

**Files:**
- Create: `src/sync/pull.ts`, `src/sync/pull.test.ts`

- [ ] **Step 1: Write the failing test `src/sync/pull.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { insertRow } from '../db/repo';
import { pullTable, getWatermark, setWatermark, type PullClient } from './pull';
import type { BaseRow, Exercise } from '../types/domain';

function remote(id: string, updated: string, server: string, extra: Partial<BaseRow> = {}) {
  return {
    id,
    user_id: 'u1',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: updated,
    server_updated_at: server,
    deleted_at: null,
    name: 'Remote Squat',
    muscle_group: 'legs',
    modality: 'strength',
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: 100,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 1,
    ...extra,
  } as unknown as BaseRow;
}

function fakeClient(rows: BaseRow[]): PullClient & { lastSince: string | null } {
  const c = {
    lastSince: null as string | null,
    async select(_table: string, since: string | null) {
      c.lastSince = since;
      const filtered = since
        ? rows.filter((r) => (r.server_updated_at ?? '') >= since)
        : rows;
      return { rows: filtered, error: null };
    },
  };
  return c;
}

function baseExercise() {
  return {
    name: 'Local Squat',
    muscle_group: 'legs',
    modality: 'strength' as const,
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: 100,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 1,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('pullTable', () => {
  it('inserts rows that do not exist locally', async () => {
    const client = fakeClient([remote('r1', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:01.000Z')]);

    const n = await pullTable(client, 'exercises');

    expect(n).toBe(1);
    const stored = await db.exercises.get('r1');
    expect(stored?.name).toBe('Remote Squat');
    expect(stored?._dirty).toBe(0);
  });

  it('overwrites a local row when the remote row is newer', async () => {
    const local = await insertRow<Exercise>('exercises', baseExercise());
    const client = fakeClient([remote(local.id, '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:01.000Z')]);

    await pullTable(client, 'exercises');

    expect((await db.exercises.get(local.id))?.name).toBe('Remote Squat');
  });

  it('keeps a local row that is newer and leaves it dirty', async () => {
    const local = await insertRow<Exercise>('exercises', baseExercise());
    const client = fakeClient([remote(local.id, '2000-01-01T00:00:00.000Z', '2026-09-10T00:00:01.000Z')]);

    await pullTable(client, 'exercises');

    const stored = await db.exercises.get(local.id);
    expect(stored?.name).toBe('Local Squat');
    expect(stored?._dirty).toBe(1);
  });

  it('applies a remote tombstone', async () => {
    const client = fakeClient([
      remote('r1', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:01.000Z', {
        deleted_at: '2026-09-10T00:00:00.000Z',
      }),
    ]);

    await pullTable(client, 'exercises');

    expect((await db.exercises.get('r1'))?.deleted_at).toBe('2026-09-10T00:00:00.000Z');
  });

  it('advances the watermark to the highest server_updated_at received', async () => {
    const client = fakeClient([
      remote('r1', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:01.000Z'),
      remote('r2', '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:05.000Z'),
    ]);

    await pullTable(client, 'exercises');

    expect(await getWatermark('exercises')).toBe('2026-09-11T00:00:05.000Z');
  });

  it('queries with >= so rows sharing the watermark are not missed', async () => {
    await setWatermark('exercises', '2026-09-10T00:00:01.000Z');
    const client = fakeClient([
      remote('r1', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:01.000Z'),
      remote('r2', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:01.000Z'),
    ]);

    const n = await pullTable(client, 'exercises');

    expect(client.lastSince).toBe('2026-09-10T00:00:01.000Z');
    expect(n).toBe(2);
  });

  it('leaves the watermark untouched when nothing came back', async () => {
    await setWatermark('exercises', '2026-09-10T00:00:01.000Z');
    const client = fakeClient([]);

    await pullTable(client, 'exercises');

    expect(await getWatermark('exercises')).toBe('2026-09-10T00:00:01.000Z');
  });

  it('does not advance the watermark when the request fails', async () => {
    await setWatermark('exercises', '2026-09-10T00:00:01.000Z');
    const client: PullClient = {
      async select() {
        return { rows: [], error: new Error('offline') };
      },
    };

    await expect(pullTable(client, 'exercises')).rejects.toThrow('offline');
    expect(await getWatermark('exercises')).toBe('2026-09-10T00:00:01.000Z');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sync/pull.test.ts`
Expected: FAIL — `Failed to resolve import "./pull"`

- [ ] **Step 3: Write `src/sync/pull.ts`**

```ts
import type { BaseRow, ISODateTime, Local } from '../types/domain';
import { db, type SyncedTableName } from '../db/schema';
import { mergeRow } from './merge';

/** The slice of the Supabase client pull needs. Narrow for testability. */
export interface PullClient {
  select(
    table: string,
    since: ISODateTime | null,
  ): Promise<{ rows: BaseRow[]; error: Error | null }>;
}

export async function getWatermark(name: SyncedTableName): Promise<ISODateTime | null> {
  return (await db.sync_meta.get(name))?.watermark ?? null;
}

export async function setWatermark(
  name: SyncedTableName,
  watermark: ISODateTime | null,
): Promise<void> {
  const existing = await db.sync_meta.get(name);
  await db.sync_meta.put({
    table: name,
    watermark,
    last_synced_at: existing?.last_synced_at ?? null,
    last_error: existing?.last_error ?? null,
  });
}

/**
 * Fetches rows changed at or after the watermark and merges each one.
 *
 * The query is `>=` rather than `>`: two rows can share a server_updated_at
 * value, and a strict comparison silently drops the ones written after the
 * watermark was recorded. Re-applying a row is idempotent, so the overlap
 * costs one redundant row per sync and removes a whole class of data loss.
 *
 * The watermark advances only after every row in the batch is applied, so an
 * interrupted pull is retried from where it left off rather than skipped.
 */
export async function pullTable(
  client: PullClient,
  name: SyncedTableName,
): Promise<number> {
  const since = await getWatermark(name);
  const { rows, error } = await client.select(name, since);
  if (error) throw error;
  if (rows.length === 0) return 0;

  const table = db[name] as unknown as import('dexie').Table<Local<BaseRow>, string>;

  await db.transaction('rw', table, async () => {
    for (const remote of rows) {
      const existing = await table.get(remote.id);
      const merged = mergeRow(existing, remote);
      if (merged) await table.put(merged);
    }
  });

  const highest = rows.reduce<ISODateTime | null>(
    (max, r) => (r.server_updated_at && (!max || r.server_updated_at > max) ? r.server_updated_at : max),
    since,
  );
  await setWatermark(name, highest);

  return rows.length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sync/pull.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/sync/pull.ts src/sync/pull.test.ts
git commit -m "feat: add watermark pull with idempotent overlap"
```

---

## Task 20: The sync engine

**Files:**
- Create: `src/sync/engine.ts`, `src/sync/engine.test.ts`

- [ ] **Step 1: Write the failing test `src/sync/engine.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { insertRow } from '../db/repo';
import { syncAll, pendingCount } from './engine';
import { SYNCED_TABLES } from './tables';
import type { BaseRow, Exercise } from '../types/domain';
import type { PushClient } from './push';
import type { PullClient } from './pull';

function recorder() {
  const pushOrder: string[] = [];
  const pullOrder: string[] = [];
  const client: PushClient & PullClient = {
    async upsert(table) {
      pushOrder.push(table);
      return { error: null };
    },
    async select(table) {
      pullOrder.push(table);
      return { rows: [] as BaseRow[], error: null };
    },
  };
  return { client, pushOrder, pullOrder };
}

function baseExercise() {
  return {
    name: 'Back Squat',
    muscle_group: 'legs',
    modality: 'strength' as const,
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: 100,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 1,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('pendingCount', () => {
  it('counts dirty rows across every synced table', async () => {
    await insertRow<Exercise>('exercises', baseExercise());
    await insertRow<Exercise>('exercises', baseExercise());
    expect(await pendingCount()).toBe(2);
  });

  it('is 0 on a clean database', async () => {
    expect(await pendingCount()).toBe(0);
  });
});

describe('syncAll', () => {
  it('pushes before it pulls', async () => {
    await insertRow<Exercise>('exercises', baseExercise());
    const { client, pushOrder, pullOrder } = recorder();

    const result = await syncAll(client, 'u1');

    expect(result.pushed).toBe(1);
    expect(pushOrder.length).toBeGreaterThan(0);
    expect(pullOrder.length).toBe(SYNCED_TABLES.length);
  });

  it('pulls every table in foreign-key order', async () => {
    const { client, pullOrder } = recorder();
    await syncAll(client, 'u1');
    expect(pullOrder).toEqual([...SYNCED_TABLES]);
  });

  it('records last_synced_at on success', async () => {
    const { client } = recorder();
    await syncAll(client, 'u1');
    const meta = await db.sync_meta.get('exercises');
    expect(meta?.last_synced_at).not.toBeNull();
    expect(meta?.last_error).toBeNull();
  });

  it('propagates an error and records it', async () => {
    const client: PushClient & PullClient = {
      async upsert() {
        return { error: null };
      },
      async select() {
        return { rows: [], error: new Error('offline') };
      },
    };

    await expect(syncAll(client, 'u1')).rejects.toThrow('offline');
    const meta = await db.sync_meta.get('exercises');
    expect(meta?.last_error).toBe('offline');
  });

  it('leaves rows queued when the sync fails', async () => {
    const row = await insertRow<Exercise>('exercises', baseExercise());
    const client: PushClient & PullClient = {
      async upsert() {
        return { error: new Error('offline') };
      },
      async select() {
        return { rows: [], error: null };
      },
    };

    await expect(syncAll(client, 'u1')).rejects.toThrow('offline');
    expect((await db.exercises.get(row.id))?._dirty).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sync/engine.test.ts`
Expected: FAIL — `Failed to resolve import "./engine"`

- [ ] **Step 3: Write `src/sync/engine.ts`**

```ts
import type { UUID } from '../types/domain';
import { db } from '../db/schema';
import { dirtyRows } from '../db/repo';
import { nowISO } from '../lib/time';
import { SYNCED_TABLES } from './tables';
import { pushTable, type PushClient } from './push';
import { pullTable, type PullClient } from './pull';
import type { SyncResult, SyncStatus } from './types';

export async function pendingCount(): Promise<number> {
  let total = 0;
  for (const name of SYNCED_TABLES) {
    total += (await dirtyRows(name)).length;
  }
  return total;
}

async function recordMeta(error: string | null): Promise<void> {
  const ts = nowISO();
  for (const name of SYNCED_TABLES) {
    const existing = await db.sync_meta.get(name);
    await db.sync_meta.put({
      table: name,
      watermark: existing?.watermark ?? null,
      last_synced_at: error ? (existing?.last_synced_at ?? null) : ts,
      last_error: error,
    });
  }
}

/**
 * Push first, then pull. Pushing first means local work reaches the server
 * before any remote row can win a merge against it — otherwise an offline
 * session could be overwritten by a stale remote copy on its first sync.
 */
export async function syncAll(
  client: PushClient & PullClient,
  userId: UUID,
): Promise<SyncResult> {
  try {
    let pushed = 0;
    for (const name of SYNCED_TABLES) {
      pushed += await pushTable(client, name, userId);
    }

    let pulled = 0;
    for (const name of SYNCED_TABLES) {
      pulled += await pullTable(client, name);
    }

    await recordMeta(null);
    return { pushed, pulled };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await recordMeta(message);
    throw e;
  }
}

export async function currentStatus(): Promise<SyncStatus> {
  const meta = await db.sync_meta.get('exercises');
  return {
    phase: meta?.last_error ? 'error' : 'idle',
    pendingCount: await pendingCount(),
    lastSyncedAt: meta?.last_synced_at ?? null,
    error: meta?.last_error ?? null,
  };
}
```

- [ ] **Step 4: Write `src/sync/supabaseSyncClient.ts`**

```ts
import { supabase } from '../supabase/client';
import type { PushClient } from './push';
import type { PullClient } from './pull';

/**
 * The real Supabase-backed sync client.
 *
 * Deliberately separate from engine.ts. `../supabase/client` throws at module
 * load when VITE_SUPABASE_* are absent, so importing it from the engine would
 * make the sync tests depend on a gitignored .env file. The engine takes its
 * client as a parameter; only the UI reaches for this concrete one.
 */
export const supabaseSyncClient: PushClient & PullClient = {
  async upsert(table, rows) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    return { error: error ? new Error(error.message) : null };
  },

  async select(table, since) {
    let query = supabase.from(table).select('*');
    if (since) query = query.gte('server_updated_at', since);
    const { data, error } = await query.order('server_updated_at', { ascending: true });
    return {
      rows: (data ?? []) as never[],
      error: error ? new Error(error.message) : null,
    };
  },
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/sync/engine.test.ts`
Expected: PASS, 7 tests

- [ ] **Step 6: Commit**

```bash
git add src/sync/engine.ts src/sync/supabaseSyncClient.ts src/sync/engine.test.ts
git commit -m "feat: add sync engine with push-then-pull ordering"
```

---

## Task 21: Round-trip test

A single test that exercises merge, push, and pull together against an in-memory server. This is the test that catches integration mistakes the unit tests each miss.

**Files:**
- Create: `src/sync/roundtrip.test.ts`

- [ ] **Step 1: Write the test `src/sync/roundtrip.test.ts`**

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../db/repo';
import { syncAll } from './engine';
import type { BaseRow, Exercise } from '../types/domain';
import type { PushClient } from './push';
import type { PullClient } from './pull';

/** An in-memory stand-in for Postgres, including the server_updated_at trigger. */
function memoryServer() {
  const store = new Map<string, Map<string, BaseRow>>();
  let clock = 0;

  const client: PushClient & PullClient = {
    async upsert(table, rows) {
      const t = store.get(table) ?? new Map<string, BaseRow>();
      for (const r of rows) {
        clock++;
        t.set(r.id, {
          ...r,
          server_updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, clock)).toISOString(),
        });
      }
      store.set(table, t);
      return { error: null };
    },

    async select(table, since) {
      const rows = [...(store.get(table)?.values() ?? [])];
      const filtered = since
        ? rows.filter((r) => (r.server_updated_at ?? '') >= since)
        : rows;
      return { rows: filtered, error: null };
    },
  };

  return { client, store };
}

function baseExercise() {
  return {
    name: 'Back Squat',
    muscle_group: 'legs',
    modality: 'strength' as const,
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: 100,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 1,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('sync round trip', () => {
  it('pushes a local row and leaves it clean', async () => {
    const { client, store } = memoryServer();
    const row = await insertRow<Exercise>('exercises', baseExercise());

    await syncAll(client, 'u1');

    // The in-memory store is keyed generically by BaseRow; `name` is an
    // Exercise-specific field, so the read needs a narrowing cast.
    expect((store.get('exercises')?.get(row.id) as Exercise | undefined)?.name).toBe(
      'Back Squat',
    );
    expect((await db.exercises.get(row.id))?._dirty).toBe(0);
  });

  it('is a no-op on a second sync with no changes', async () => {
    const { client } = memoryServer();
    await insertRow<Exercise>('exercises', baseExercise());

    await syncAll(client, 'u1');
    const second = await syncAll(client, 'u1');

    expect(second.pushed).toBe(0);
  });

  it('converges after an edit on both sides', async () => {
    const { client, store } = memoryServer();
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await syncAll(client, 'u1');

    // Remote edit, older than the local edit that follows.
    const remoteRow = store.get('exercises')!.get(row.id)!;
    store.get('exercises')!.set(row.id, {
      ...remoteRow,
      name: 'Remote Name',
      updated_at: '2026-09-10T00:00:00.000Z',
      server_updated_at: '2099-01-01T00:00:00.000Z',
    } as BaseRow);

    await updateRow<Exercise>('exercises', row.id, { name: 'Local Name' });
    await syncAll(client, 'u1');

    // Local edit is newer, so it wins both locally and on the server.
    expect((await db.exercises.get(row.id))?.name).toBe('Local Name');
    expect((store.get('exercises')?.get(row.id) as Exercise | undefined)?.name).toBe(
      'Local Name',
    );
    expect((await db.exercises.get(row.id))?._dirty).toBe(0);
  });

  it('propagates a soft delete to the server', async () => {
    const { client, store } = memoryServer();
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await syncAll(client, 'u1');

    await softDeleteRow('exercises', row.id);
    await syncAll(client, 'u1');

    expect(store.get('exercises')?.get(row.id)?.deleted_at).not.toBeNull();
  });

  it('survives a full local wipe by restoring from the server', async () => {
    const { client } = memoryServer();
    const row = await insertRow<Exercise>('exercises', baseExercise());
    await syncAll(client, 'u1');

    await db.delete();
    await db.open();
    expect(await db.exercises.count()).toBe(0);

    await syncAll(client, 'u1');

    expect((await db.exercises.get(row.id))?.name).toBe('Back Squat');
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/sync/roundtrip.test.ts`
Expected: PASS, 5 tests

If the wipe-and-restore test fails, the watermark was not reset by `db.delete()` — confirm `sync_meta` lives in the same Dexie database and is therefore dropped with it.

- [ ] **Step 3: Commit**

```bash
git add src/sync/roundtrip.test.ts
git commit -m "test: add sync round-trip integration tests"
```

---

## Task 22: Sync status UI and triggers

**Files:**
- Create: `src/features/settings/SyncStatus.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write `src/features/settings/SyncStatus.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { currentStatus, syncAll } from '../../sync/engine';
import { supabaseSyncClient } from '../../sync/supabaseSyncClient';
import type { SyncStatus as Status } from '../../sync/types';

export default function SyncStatus({ userId }: { userId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setStatus(await currentStatus());
  }, []);

  const runSync = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await syncAll(supabaseSyncClient, userId);
    } catch {
      // The engine already recorded the message; refresh surfaces it.
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [busy, refresh, userId]);

  useEffect(() => {
    void refresh();

    const onOnline = () => void runSync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, runSync]);

  const label = !navigator.onLine
    ? 'Offline'
    : busy
      ? 'Syncing…'
      : status?.error
        ? `Error: ${status.error}`
        : status?.pendingCount
          ? `${status.pendingCount} pending`
          : status?.lastSyncedAt
            ? `Synced ${new Date(status.lastSyncedAt).toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}`
            : 'Not synced yet';

  return (
    <div className="flex items-center gap-3">
      <span
        aria-live="polite"
        className={status?.error ? 'text-red-400 text-sm' : 'text-[var(--color-muted)] text-sm'}
      >
        {label}
      </span>
      <button
        onClick={runSync}
        disabled={busy}
        className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-50"
      >
        Sync now
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/App.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { db } from './db/schema';
import { seedExercises } from './db/seed';
import { useAuth, signOut } from './features/auth/useAuth';
import SignIn from './features/auth/SignIn';
import SyncStatus from './features/settings/SyncStatus';

export default function App() {
  const { session, loading } = useAuth();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      await seedExercises();
      setCount(await db.exercises.count());
    })();
  }, [session]);

  if (loading) {
    return <main className="p-6 text-[var(--color-muted)]">Loading…</main>;
  }

  if (!session) return <SignIn />;

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Fit Tracker</h1>
      <SyncStatus userId={session.user.id} />
      <p className="text-[var(--color-muted)]">
        Exercise library: <span className="text-[var(--color-text)]">{count ?? '…'}</span>
      </p>
      <button
        onClick={signOut}
        className="rounded-lg border border-[var(--color-border)] px-4 py-2"
      >
        Sign out
      </button>
    </main>
  );
}
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: every suite passes — smoke, time, strength, prs, running, adherence, rpe, repo, seed, merge, push, pull, engine, roundtrip

- [ ] **Step 4: Phase 3 checkpoint — run the app**

Run: `npm run dev`

**What to check, in order:**

1. Sign in. The indicator reads "51 pending". Press **Sync now** — it becomes "Synced HH:MM".
2. In the Supabase SQL editor, `select count(*) from exercises;` still returns `0` (no `auth.uid()` there), but **Table Editor → exercises** shows 51 rows. That difference is RLS working exactly as intended.
3. **Offline test.** DevTools → Network → Offline. In the console run:
   ```js
   const { insertRow } = await import('/src/db/repo.ts');
   await insertRow('exercises', { name: 'Offline Test', muscle_group: 'legs', modality: 'strength', run_type: null, default_sets: 3, default_reps: 5, default_weight_kg: 60, default_duration_s: null, default_distance_km: null, sort_order: 999 });
   ```
   The indicator shows "1 pending". Go back online — it syncs automatically within a moment, and "Offline Test" appears in the Supabase table editor.
4. **Restore test.** DevTools → Application → IndexedDB → delete `fit_tracker`, then reload and press Sync now. All 52 exercises come back from Supabase. This is the backup path working end to end.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/SyncStatus.tsx src/App.tsx
git commit -m "feat: add sync status indicator with automatic and manual triggers"
```

---

## Phase 3 complete

At this point you have: a typed domain model, every calculation from the spec under test, a seeded local database, a Supabase project with RLS that actually denies, working auth, and a sync layer that survives going offline and losing the local database.

**Next:** Plan 2 (Phases 4–6) — the Plan feature, Today and session logging, and Log history.

---

## Self-Review

**Spec coverage for phases 1–3:**

| Spec section | Covered by |
|---|---|
| §4 Data model — all 12 entities + common block | Task 2 |
| §4 Local-only Dexie tables | Task 9 (`sync_meta`, `_dirty`) |
| §5 Supabase schema, trigger, indexes, no cascade | Task 12 |
| §6 RLS, anon revoke, `with check`, disable signups | Task 13 |
| §7 Push, pull, merge, triggers, status | Tasks 16–22 |
| §8 Epley, volume, pace, PR, adherence, streak, session RPE, fatigue flag | Tasks 4–8 |
| §9 Sign-in screen | Task 15 |
| §11 Testing — all pure-logic items listed in the spec | Tasks 3–10, 17–21 |
| §12 Project structure | File Structure section |
| §13 `.env`, `.env.example`, gitignore | Tasks 1, 14 |

Spec §9 screens beyond sign-in, §10 export/import, and §14 Android build belong to Plans 2 and 3 and are deliberately absent here.

**Type consistency:** `SyncedTableName` (defined Task 9) is used unchanged in Tasks 16, 18, 19, 20. `Local<T>` and `BaseRow` (Task 2) are used consistently throughout. `isWorkingSet` is exported from `strength.ts` (Task 4) and imported by `rpe.ts` (Task 8). `MAX_TRACKED_REPS` is exported from `strength.ts` and imported by `prs.ts` (Task 5). `epley1RM` has one signature, `(weightKg, reps)`, everywhere. `PushClient` and `PullClient` are defined once each and composed as `PushClient & PullClient` in the engine.

**Placeholder scan:** no TBD, TODO, "similar to Task N", or steps without code. Every code step shows complete, runnable content.
