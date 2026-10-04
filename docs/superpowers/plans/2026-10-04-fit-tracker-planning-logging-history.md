# Fit Tracker — Plan 2: Planning, Logging and History (Phases 4–6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the verified foundation into an app you can train with: plan a week, log every set with RPE in the gym, log runs, and browse and edit your history.

**Architecture:** Screens read Dexie through a small `useLiveQuery` hook over Dexie's core `liveQuery`, so every screen updates the instant a local write — or a sync pull — lands. Navigation is a hash router (`#/session/<id>`) so Android's back button works inside the Capacitor WebView later. Everything with rules in it — routing, materialization, prefill, validation, history — is a pure function or a thin repository function, built test-first; screens are verified by running the app at each phase checkpoint.

**Tech Stack:** Vite 8, React 19, TypeScript 7, Tailwind CSS v4, Dexie 4, Vitest 4, fake-indexeddb. **No new dependencies.**

**Spec:** `docs/superpowers/specs/2026-09-22-fitness-tracker-design.md` · **Plan 1:** `docs/superpowers/plans/2026-09-22-fit-tracker-foundation.md`

**Validated before handoff:** every code block in this plan was applied, in order, to a copy of the repository at commit `9f3e9d3`. Result: `tsc -b` clean; **365 tests in 39 files** (139 existing + 226 new) passing on repeated runs; production build containing every screen.

---

## Two design decisions this plan depends on

Read these before Task 1. Every task in Phase 4 assumes them.

### 1. Rows the app derives are *system writes*

Some rows are not typed by the user: the default week plan, its seven rest days, the preference row, and — above all — the *planned* sessions the app materializes from the weekly template. If a fresh install materialized Tuesday as `planned` before it had pulled the `done` Tuesday that another device logged, that new row would be the newer write and last-write-wins would destroy the logged session. The duplicate-library bug from Plan 1 was the same shape.

So derived rows are stamped with `systemISO()`: wall-clock time minus fifty years, strictly increasing. Every genuine user edit, on any device, therefore outranks every system write in last-write-wins — including the server-side guard in `0003_reject_stale_writes.sql` — while system writes still order correctly among themselves. A row is "untouched by the user" exactly when its `updated_at` is a system timestamp; the moment the user starts, edits, notes or logs anything, it carries a real timestamp and the app never rewrites it again.

### 2. Derived rows get deterministic ids

Two devices materializing the same Tuesday must produce the *same* row, not two. Materialized sessions, their exercises, the default plan, its days and the preference row get UUIDv5 ids derived from stable names such as `"<userId>:planned:2026-10-06"`. The hash is a small synchronous SHA-1, not `crypto.subtle`: an `await` on anything that is not a Dexie operation, inside a Dexie transaction, commits the transaction early and the next write throws `TransactionInactiveError`.

Together these give materialization a clean rule set, encoded in one pure function (`decide`, Task 14): insert what is missing; never touch what the user owns; never rewrite the past; rewrite, remove or revive *untouched* future rows when the template changes.

---

## Conventions

- **Typecheck with `npx tsc -b`** — never `--noEmit`; it is incompatible with the composite referenced project and fails spuriously.
- **No test may import `src/supabase/client.ts`**, directly or transitively — it throws at module load without credentials. Repository and logic modules must not import it either. Only `useSync`, `supabaseSyncClient`, `useAuth` and `SignIn` do.
- **Do not read, print, modify or commit `.env`.**
- **Tailwind v4 theme utilities.** `src/index.css` defines `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-muted`, `--color-accent` inside `@theme`, so `bg-surface`, `border-border`, `text-muted`, `bg-accent`, `text-accent` and opacity forms like `bg-accent/15` all work. Use them rather than `text-[var(--color-muted)]`.
- **Tap targets are at least 48 px** (`min-h-12`), primary actions 56 px (`min-h-14`). This is a one-handed gym app.
- **Reads filter soft-deleted rows** with the `_deleted` index (`where('_deleted').equals(0)`) or by checking `_deleted === 0`.
- **Screens are not unit-tested.** React Testing Library is deliberately not installed. Each phase ends with a checkpoint that runs the app in a browser.
- **Code-block markers.** Every code block that creates or changes a file is introduced by a line of the form `` `path` (new file): ``, `` `path` (replace the whole file): `` or `` `path` (append): ``. Apply them exactly as labelled.

---

## File structure

| File | Responsibility |
|---|---|
| `vite.config.ts` *(modify)* | Fails a build that is missing Supabase credentials instead of emitting an empty app |
| `src/lib/time.ts` *(modify)* | Adds `systemISO()` and `isSystemTimestamp()` |
| `src/lib/uuidv5.ts` | Synchronous SHA-1, UUIDv5 and `deterministicId()` |
| `src/lib/format.ts` | Dates, kg, km and number parsing for display |
| `src/db/repo.ts` *(modify)* | Write options: caller-supplied id, system writes, undelete |
| `src/db/syncState.ts` | `hasCompletedSync()` — the gate first-time setup waits on |
| `src/db/schema.ts` *(modify, Phase 5)* | Version 2: `exercise_id` index on `session_exercises` |
| `src/db/useLiveQuery.ts` | React hook over Dexie's core `liveQuery` |
| `src/app/routes.ts` | Route type, `parseRoute`, `routeHref`, `tabOf` — pure |
| `src/app/useRoute.ts` | Current route hook and `navigate()` |
| `src/app/AppContext.ts` | User id and sync controls for every screen |
| `src/app/bootstrap.ts` | First-time setup after the first sync: seed, plan, preferences |
| `src/app/AppShell.tsx`, `src/app/Screen.tsx` | Layout, tab bar, route → screen |
| `src/sync/label.ts` | `syncLabel()` — the status text, pure |
| `src/components/*` | Button, fields, stepper, header, tab bar, pick list, badges, RPE selector, rest timer bar |
| `src/test/fixtures.ts` | Shared test setup: reset, mark synced, make exercises and workouts |
| `src/features/library/exerciseRules.ts` | Filtering, validation, summaries — pure |
| `src/features/library/exercisesRepo.ts` | Exercise create, update, delete, duplicate |
| `src/features/library/{LibraryScreen,ExerciseForm,ExercisePicker}.tsx` | Library UI |
| `src/features/plan/reorder.ts` | Move and renumber positions — pure |
| `src/features/plan/workoutsRepo.ts` | Workout and workout-item CRUD, duplicate, reorder |
| `src/features/plan/planRepo.ts` | Default plan, weekday → workout, active plan lookup |
| `src/features/plan/materialize.ts` | Plan → dated planned sessions: `desiredFor`, `decide`, `materializeWeek` |
| `src/features/plan/{WorkoutsScreen,WorkoutEditor,WeekView,PlanDaysScreen}.tsx` | Planning UI |
| `src/features/log/sessionsRepo.ts` | Create a session from a workout, remove a session |
| `src/features/log/cards.ts` | Session summary cards for Today, the week and history |
| `src/features/log/setRules.ts` | RPE steps, set validation, suggested status — pure |
| `src/features/log/prefill.ts` | Last-time sets, next-set draft, same-as-last — pure |
| `src/features/log/setsRepo.ts` | Log, edit, delete sets; add/remove exercises; finish a session |
| `src/features/log/sessionView.ts` | Loads one session with its exercises and sets |
| `src/features/log/restTimer.ts`, `useRestTimer.ts` | Rest timer maths (pure) and its hook |
| `src/features/log/runRules.ts` | Duration parsing, run validation, drafts — pure |
| `src/features/log/runsRepo.ts` | Save a run with its splits |
| `src/features/log/history.ts` | History states, week grouping, 12-week heatmap — pure |
| `src/features/log/{TodayScreen,SessionLogger,ExercisePanel,FinishPanel,RunLogger,HistoryScreen}.tsx` | Logging and history UI |
| `src/features/settings/prefsRepo.ts`, `usePrefs.ts` | Preferences row and hook |
| `src/features/settings/SettingsScreen.tsx` | Sync, rest timer preferences, sign out |
| `src/features/progress/ProgressScreen.tsx` | Placeholder until Plan 3 brings charts |

---

# Phase 4 — App shell, library and planning

## Task 0: Make a build without credentials fail loudly

Found while validating this plan. Without `.env`, Vite inlines `VITE_SUPABASE_URL` as `undefined`, so the guard in `src/supabase/client.ts` becomes an unconditional top-level `throw` — and the bundler, correctly, drops every module that could only run after it. `npm run build` then **succeeds** and emits an app with no screens in it. Every checkpoint below says "`npm run build` succeeds"; without this task that check can pass on a broken app, and so could the APK build in Plan 3.

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Guard the build**

`vite.config.ts` (replace the whole file):

```ts
/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const REQUIRED_ENV = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

export default defineConfig(({ command, mode }) => {
  // Without these, src/supabase/client.ts throws at load. Vite inlines the
  // missing values as undefined, the throw becomes unconditional, and the
  // bundler drops every module that could only run after it — so the build
  // "succeeds" with an app that has no screens. Fail the build instead.
  if (command === 'build') {
    const env = loadEnv(mode, '.', 'VITE_');
    const missing = REQUIRED_ENV.filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing ${missing.join(' and ')}. Copy .env.example to .env and fill it in before building.`,
      );
    }
  }

  return {
    plugins: [react(), tailwindcss()],
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    },
  };
});
```

The check runs only for `vite build`. The dev server and Vitest are unaffected, so tests still need no credentials.

- [ ] **Step 2: Prove it fails without credentials — without touching `.env`**

Copy the project, minus `.env`, to a temporary directory and build there:

```bash
rm -rf /tmp/ft-envcheck && rsync -a --exclude node_modules --exclude .git --exclude .env ./ /tmp/ft-envcheck/ && ln -s "$PWD/node_modules" /tmp/ft-envcheck/node_modules
(cd /tmp/ft-envcheck && npx vite build --outDir /tmp/ft-envcheck-dist); echo "exit=$?"
rm -rf /tmp/ft-envcheck /tmp/ft-envcheck-dist
```

Expected: `Error: Missing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY …` and a non-zero exit.

- [ ] **Step 3: Prove it still builds with them**

Run: `npm run build` — succeeds, using your real `.env`.

Run: `npm test` — all pass. `npx tsc -b` — clean.

- [ ] **Step 4: Commit**

```bash
git add vite.config.ts
git commit -m "fix: fail the build when Supabase credentials are missing

Without them the client throws at load, Vite inlines the missing values,
and the bundler drops every screen after the throw: the build succeeded
with an empty app."
```

---

## Task 1: System timestamps and repository write options

**Files:**
- Modify: `src/lib/time.ts`, `src/db/repo.ts`
- Create: `src/lib/systemTime.test.ts`, `src/db/repoOptions.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/lib/systemTime.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { isSystemTimestamp, nowISO, systemISO } from './time';

describe('systemISO', () => {
  it('strictly increases, even within one millisecond', () => {
    const stamps = Array.from({ length: 20 }, () => systemISO());
    expect(new Set(stamps).size).toBe(stamps.length);
    expect([...stamps].sort()).toEqual(stamps);
  });

  it('is always older than a real timestamp', () => {
    expect(Date.parse(systemISO())).toBeLessThan(Date.parse(nowISO()));
  });

  it('is recognised as a system timestamp', () => {
    expect(isSystemTimestamp(systemISO())).toBe(true);
  });
});

describe('isSystemTimestamp', () => {
  it('rejects a real timestamp', () => {
    expect(isSystemTimestamp(nowISO())).toBe(false);
  });

  it('recognises the Postgres rendering of a system timestamp', () => {
    expect(isSystemTimestamp('1976-10-04T10:00:00.123456+00:00')).toBe(true);
  });
});
```

`src/db/repoOptions.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { insertRow, softDeleteRow, updateRow } from './repo';
import { isSystemTimestamp } from '../lib/time';
import type { WorkoutTemplate } from '../types/domain';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('repo write options', () => {
  it('inserts with a caller-supplied id', async () => {
    const row = await insertRow<WorkoutTemplate>(
      'workout_templates',
      { name: 'Push', notes: null },
      { id: '11111111-1111-5111-8111-111111111111' },
    );
    expect(row.id).toBe('11111111-1111-5111-8111-111111111111');
    expect(await db.workout_templates.get(row.id)).toBeDefined();
  });

  it('stamps a system insert in the system range but keeps created_at real', async () => {
    const row = await insertRow<WorkoutTemplate>(
      'workout_templates',
      { name: 'Push', notes: null },
      { system: true },
    );
    expect(isSystemTimestamp(row.updated_at)).toBe(true);
    expect(isSystemTimestamp(row.created_at)).toBe(false);
    expect(row._dirty).toBe(1);
  });

  it('keeps a system update in the system range', async () => {
    const row = await insertRow<WorkoutTemplate>('workout_templates', { name: 'Push', notes: null });
    const updated = await updateRow<WorkoutTemplate>(
      'workout_templates',
      row.id,
      { name: 'Pull' },
      { system: true },
    );
    expect(isSystemTimestamp(updated.updated_at)).toBe(true);
  });

  it('brings a soft-deleted row back with undelete', async () => {
    const row = await insertRow<WorkoutTemplate>('workout_templates', { name: 'Push', notes: null });
    await softDeleteRow('workout_templates', row.id);
    const revived = await updateRow<WorkoutTemplate>('workout_templates', row.id, {}, { undelete: true });
    expect(revived.deleted_at).toBeNull();
    expect(revived._deleted).toBe(0);
  });

  it('stamps a system soft delete in the system range', async () => {
    const row = await insertRow<WorkoutTemplate>('workout_templates', { name: 'Push', notes: null });
    await softDeleteRow('workout_templates', row.id, { system: true });
    const stored = await db.workout_templates.get(row.id);
    expect(stored?._deleted).toBe(1);
    expect(stored?.deleted_at).not.toBeNull();
    expect(isSystemTimestamp(stored!.updated_at)).toBe(true);
  });

  it('lets a later user edit outrank a system write', async () => {
    const row = await insertRow<WorkoutTemplate>(
      'workout_templates',
      { name: 'Push', notes: null },
      { system: true },
    );
    const edited = await updateRow<WorkoutTemplate>('workout_templates', row.id, { name: 'Mine' });
    expect(Date.parse(edited.updated_at)).toBeGreaterThan(Date.parse(row.updated_at));
    expect(isSystemTimestamp(edited.updated_at)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/lib/systemTime.test.ts src/db/repoOptions.test.ts`
Expected: FAIL — `systemISO` is not exported, and `insertRow` ignores the options argument.

- [ ] **Step 3: Add system timestamps to `src/lib/time.ts`**

`src/lib/time.ts` (append):

```ts

/**
 * System writes — defaults and rows the app derives from the plan — are
 * stamped fifty years in the past. Last-write-wins then ranks every genuine
 * user edit, on any device, above any system write, while system writes still
 * order correctly among themselves.
 */
const SYSTEM_OFFSET_MS = 50 * 365.25 * 24 * 60 * 60 * 1000;
/** System timestamps fall before this instant and real ones after it, until 2050. */
const SYSTEM_BOUNDARY_MS = Date.UTC(2000, 0, 1);

let lastSystemMs = 0;

/** Like nowISO(), strictly increasing, but in the system-write range. */
export function systemISO(): string {
  const ms = Math.max(Date.now() - SYSTEM_OFFSET_MS, lastSystemMs + 1);
  lastSystemMs = ms;
  return new Date(ms).toISOString();
}

export function isSystemTimestamp(ts: string): boolean {
  return Date.parse(ts) < SYSTEM_BOUNDARY_MS;
}
```

- [ ] **Step 4: Add write options to the repository**

`src/db/repo.ts` (replace the whole file):

```ts
import type { BaseRow, ISODateTime, Local, LocalMeta, UUID } from '../types/domain';
import { newId } from '../lib/id';
import { nowISO, systemISO } from '../lib/time';
import { db, type SyncedTableName } from './schema';

type Insertable<T extends BaseRow> = Omit<T, keyof BaseRow>;

export interface InsertOptions {
  /** Use this id instead of a random one — for rows every device must agree on. */
  id?: UUID;
  /** A default or plan-derived row rather than a user action. See systemISO(). */
  system?: boolean;
}

export interface UpdateOptions {
  system?: boolean;
  /** Clear deleted_at, bringing a soft-deleted row back. */
  undelete?: boolean;
}

export interface DeleteOptions {
  system?: boolean;
}

function table(name: SyncedTableName) {
  // Dexie's generated table properties are typed per-entity; the sync layer
  // needs them addressed by name, so this is the single cast point.
  return db[name] as unknown as import('dexie').Table<Local<BaseRow>, UUID>;
}

/** Local-only index fields, derived from the row's own state. */
function localMeta(row: BaseRow): LocalMeta {
  return { _dirty: 1, _deleted: row.deleted_at ? 1 : 0 };
}

function stamp(system: boolean | undefined): ISODateTime {
  return system ? systemISO() : nowISO();
}

/** Inserts a row, stamping identity, timestamps, and the dirty flag. */
export async function insertRow<T extends BaseRow>(
  name: SyncedTableName,
  data: Insertable<T>,
  opts: InsertOptions = {},
): Promise<Local<T>> {
  const ts = nowISO();
  const base = {
    ...data,
    id: opts.id ?? newId(),
    user_id: null,
    created_at: ts,
    updated_at: opts.system ? systemISO() : ts,
    server_updated_at: null,
    deleted_at: null,
  } as unknown as BaseRow;
  const row = { ...base, ...localMeta(base) } as Local<T>;

  await table(name).put(row as Local<BaseRow>);
  return row;
}

/** Applies a patch, advancing updated_at and re-marking the row dirty. */
export async function updateRow<T extends BaseRow>(
  name: SyncedTableName,
  id: UUID,
  patch: Partial<Omit<T, keyof BaseRow>>,
  opts: UpdateOptions = {},
): Promise<Local<T>> {
  const existing = (await table(name).get(id)) as Local<T> | undefined;
  if (!existing) throw new Error(`${name}: no row with id ${id}`);

  const merged = {
    ...existing,
    ...patch,
    deleted_at: opts.undelete ? null : existing.deleted_at,
    updated_at: stamp(opts.system),
  } as unknown as BaseRow;
  const row = { ...merged, ...localMeta(merged) } as Local<T>;

  await table(name).put(row as Local<BaseRow>);
  return row;
}

/** Soft delete. The row stays so its tombstone can propagate. */
export async function softDeleteRow(
  name: SyncedTableName,
  id: UUID,
  opts: DeleteOptions = {},
): Promise<void> {
  const existing = await table(name).get(id);
  if (!existing) return;

  const deletedAt = nowISO();
  await table(name).put({
    ...existing,
    deleted_at: deletedAt,
    updated_at: opts.system ? systemISO() : deletedAt,
    _dirty: 1,
    _deleted: 1,
  });
}

export async function dirtyRows(name: SyncedTableName): Promise<Local<BaseRow>[]> {
  return table(name).where('_dirty').equals(1).toArray();
}

/**
 * Clears the dirty flag only for rows that still carry the `updated_at` that
 * was uploaded. A write landing during the push's network round trip bumps
 * `updated_at`; clearing that row unconditionally would mark an unsent edit
 * as synced and it would never be pushed again.
 */
export async function clearDirty(
  name: SyncedTableName,
  rows: { id: UUID; updated_at: ISODateTime }[],
): Promise<void> {
  await db.transaction('rw', table(name), async () => {
    for (const { id, updated_at } of rows) {
      const current = await table(name).get(id);
      if (current && current.updated_at === updated_at) {
        await table(name).update(id, { _dirty: 0 });
      }
    }
  });
}
```

- [ ] **Step 5: Run the tests and the full suite**

Run: `npx vitest run src/lib/systemTime.test.ts src/db/repoOptions.test.ts`
Expected: PASS, 11 tests

Run: `npm test` — every existing test must still pass. Then `npx tsc -b` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/time.ts src/lib/systemTime.test.ts src/db/repo.ts src/db/repoOptions.test.ts
git commit -m "feat: system timestamps and repository write options

Derived rows (plan defaults, materialized sessions) are stamped fifty
years in the past so any genuine user edit outranks them in
last-write-wins. insertRow also accepts a caller-supplied id, and
updateRow can undelete."
```

---

## Task 2: Deterministic ids

**Files:**
- Create: `src/lib/uuidv5.ts`, `src/lib/uuidv5.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/uuidv5.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { DNS_NAMESPACE, deterministicId, sha1Hex, uuidv5 } from './uuidv5';

describe('sha1Hex', () => {
  it('hashes the empty string', () => {
    expect(sha1Hex('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('hashes "abc"', () => {
    expect(sha1Hex('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  it('hashes input that spans two blocks', () => {
    expect(sha1Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '84983e441c3bd26ebaae4aa1f95129e5e54670f1',
    );
  });

  it('hashes non-ASCII text as UTF-8', () => {
    expect(sha1Hex('Hüseyin')).toHaveLength(40);
    expect(sha1Hex('Hüseyin')).not.toBe(sha1Hex('Huseyin'));
  });
});

describe('uuidv5', () => {
  it('matches the RFC 4122 reference value', () => {
    expect(uuidv5('www.example.com', DNS_NAMESPACE)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
  });
});

describe('deterministicId', () => {
  it('is stable for the same name', () => {
    expect(deterministicId('user:planned:2026-10-06')).toBe(deterministicId('user:planned:2026-10-06'));
  });

  it('differs for different names', () => {
    expect(deterministicId('a')).not.toBe(deterministicId('b'));
  });

  it('is a version 5 UUID that Postgres accepts', () => {
    expect(deterministicId('x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/uuidv5.test.ts`
Expected: FAIL — module `./uuidv5` does not exist.

- [ ] **Step 3: Implement**

`src/lib/uuidv5.ts` (new file):

```ts
import type { UUID } from '../types/domain';

/** RFC 4122 namespace for DNS names, used only to check against the reference value. */
export const DNS_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

/** This app's namespace. Never change it: every existing derived id would stop matching. */
export const APP_NAMESPACE = 'b5f2c0de-8a51-4d0a-9c3e-2f7e61a4d9b2';

/**
 * SHA-1, synchronous. crypto.subtle would do, but it is asynchronous, and an
 * await on anything other than a Dexie operation inside a Dexie transaction
 * commits the transaction early — materialization computes ids mid-transaction.
 */
function sha1(bytes: Uint8Array): Uint8Array {
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(padded.length - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (x << 1) | (x >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = ((b << 30) | (b >>> 2)) >>> 0;
      b = a;
      a = t;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(i * 4, h));
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function sha1Hex(input: string): string {
  return bytesToHex(sha1(new TextEncoder().encode(input)));
}

/** RFC 4122 version 5 UUID: SHA-1 of namespace bytes followed by the UTF-8 name. */
export function uuidv5(name: string, namespace: string): UUID {
  const ns = hexToBytes(namespace.replace(/-/g, ''));
  const nameBytes = new TextEncoder().encode(name);
  const input = new Uint8Array(ns.length + nameBytes.length);
  input.set(ns);
  input.set(nameBytes, ns.length);

  const hash = sha1(input).slice(0, 16);
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = bytesToHex(hash);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The id every device computes for the same derived row. */
export function deterministicId(name: string): UUID {
  return uuidv5(name, APP_NAMESPACE);
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/lib/uuidv5.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/uuidv5.ts src/lib/uuidv5.test.ts
git commit -m "feat: synchronous UUIDv5 for ids every device agrees on

Synchronous because crypto.subtle is async, and awaiting it inside a
Dexie transaction commits the transaction early."
```

---

## Task 3: Routes

**Files:**
- Create: `src/app/routes.ts`, `src/app/routes.test.ts`

`sessionRoute` lives here too: Today, the week view and the Log tab all open sessions, and the rule — a pure run opens in the run logger, everything else in the set logger — belongs in one place.

- [ ] **Step 1: Write the failing test**

`src/app/routes.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { parseRoute, routeHref, sessionRoute, tabOf, type Route } from './routes';

const ROUND_TRIP: Route[] = [
  { name: 'today' },
  { name: 'plan' },
  { name: 'plan', week: '2026-10-05' },
  { name: 'plan-days' },
  { name: 'workouts' },
  { name: 'workout', id: 'w1' },
  { name: 'library' },
  { name: 'exercise', id: 'e1' },
  { name: 'exercise', id: 'new' },
  { name: 'session', id: 's1' },
  { name: 'session', id: 's1', from: 'log' },
  { name: 'run', id: 'r1' },
  { name: 'run', id: 'r1', from: 'log' },
  { name: 'run-new', exerciseId: 'e9', date: '2026-10-05' },
  { name: 'progress' },
  { name: 'log' },
  { name: 'settings' },
];

describe('routes', () => {
  it.each(ROUND_TRIP)('round-trips %o', (route) => {
    expect(parseRoute(routeHref(route))).toEqual(route);
  });

  it('defaults an empty hash to today', () => {
    expect(parseRoute('')).toEqual({ name: 'today' });
    expect(parseRoute('#/')).toEqual({ name: 'today' });
  });

  it('defaults an unknown path to today', () => {
    expect(parseRoute('#/nowhere')).toEqual({ name: 'today' });
  });

  it('ignores a malformed week', () => {
    expect(parseRoute('#/plan?week=next')).toEqual({ name: 'plan' });
  });

  it('falls back to today when a new run is missing its parameters', () => {
    expect(parseRoute('#/run/new?exercise=e9')).toEqual({ name: 'today' });
  });

  it('decodes encoded ids', () => {
    expect(parseRoute('#/session/a%2Fb')).toEqual({ name: 'session', id: 'a/b' });
  });
});

describe('sessionRoute', () => {
  it('opens a run in the run logger and anything else in the set logger', () => {
    expect(sessionRoute({ id: 's1', kind: 'run' })).toEqual({ name: 'run', id: 's1' });
    expect(sessionRoute({ id: 's1', kind: 'mixed' })).toEqual({ name: 'session', id: 's1' });
    expect(sessionRoute({ id: 's1', kind: 'strength' }, 'log')).toEqual({ name: 'session', id: 's1', from: 'log' });
  });
});

describe('tabOf', () => {
  it('puts the library and workouts under Plan', () => {
    expect(tabOf({ name: 'library' })).toBe('plan');
    expect(tabOf({ name: 'workout', id: 'w1' })).toBe('plan');
    expect(tabOf({ name: 'plan-days' })).toBe('plan');
  });

  it('puts a session under Today, or under Log when opened from history', () => {
    expect(tabOf({ name: 'session', id: 's1' })).toBe('today');
    expect(tabOf({ name: 'session', id: 's1', from: 'log' })).toBe('log');
    expect(tabOf({ name: 'run', id: 'r1', from: 'log' })).toBe('log');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/app/routes.test.ts`
Expected: FAIL — module `./routes` does not exist.

- [ ] **Step 3: Implement**

`src/app/routes.ts` (new file):

```ts
import type { ISODate, SessionKind, UUID } from '../types/domain';

export type Tab = 'today' | 'plan' | 'progress' | 'log' | 'settings';

export type Route =
  | { name: 'today' }
  | { name: 'plan'; week?: ISODate }
  | { name: 'plan-days' }
  | { name: 'workouts' }
  | { name: 'workout'; id: UUID }
  | { name: 'library' }
  | { name: 'exercise'; id: UUID | 'new' }
  | { name: 'session'; id: UUID; from?: 'log' }
  | { name: 'run'; id: UUID; from?: 'log' }
  | { name: 'run-new'; exerciseId: UUID; date: ISODate }
  | { name: 'progress' }
  | { name: 'log' }
  | { name: 'settings' };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Hash routing: `#/session/<id>?from=log`. Hash routes need no server rewrite
 * rules and keep working inside the Capacitor WebView, where Android's back
 * button maps onto history.back().
 */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const fromLog = params.get('from') === 'log';
  const id = parts[1];

  switch (parts[0]) {
    case 'plan': {
      if (id === 'days') return { name: 'plan-days' };
      const week = params.get('week');
      return week && ISO_DATE.test(week) ? { name: 'plan', week } : { name: 'plan' };
    }
    case 'workouts':
      return id ? { name: 'workout', id } : { name: 'workouts' };
    case 'library':
      return id ? { name: 'exercise', id } : { name: 'library' };
    case 'session':
      if (!id) return { name: 'today' };
      return fromLog ? { name: 'session', id, from: 'log' } : { name: 'session', id };
    case 'run': {
      if (id === 'new') {
        const exerciseId = params.get('exercise');
        const date = params.get('date');
        return exerciseId && date && ISO_DATE.test(date)
          ? { name: 'run-new', exerciseId, date }
          : { name: 'today' };
      }
      if (!id) return { name: 'today' };
      return fromLog ? { name: 'run', id, from: 'log' } : { name: 'run', id };
    }
    case 'progress':
      return { name: 'progress' };
    case 'log':
      return { name: 'log' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'today' };
  }
}

export function routeHref(route: Route): string {
  const from = (r: { from?: 'log' }) => (r.from ? `?from=${r.from}` : '');
  switch (route.name) {
    case 'today':
      return '#/today';
    case 'plan':
      return route.week ? `#/plan?week=${route.week}` : '#/plan';
    case 'plan-days':
      return '#/plan/days';
    case 'workouts':
      return '#/workouts';
    case 'workout':
      return `#/workouts/${encodeURIComponent(route.id)}`;
    case 'library':
      return '#/library';
    case 'exercise':
      return `#/library/${encodeURIComponent(route.id)}`;
    case 'session':
      return `#/session/${encodeURIComponent(route.id)}${from(route)}`;
    case 'run':
      return `#/run/${encodeURIComponent(route.id)}${from(route)}`;
    case 'run-new':
      return `#/run/new?exercise=${encodeURIComponent(route.exerciseId)}&date=${route.date}`;
    case 'progress':
      return '#/progress';
    case 'log':
      return '#/log';
    case 'settings':
      return '#/settings';
  }
}

/** The screen that opens a session: the run logger for a pure run, the set logger otherwise. */
export function sessionRoute(session: { id: UUID; kind: SessionKind }, from?: 'log'): Route {
  if (session.kind === 'run') return from ? { name: 'run', id: session.id, from } : { name: 'run', id: session.id };
  return from ? { name: 'session', id: session.id, from } : { name: 'session', id: session.id };
}

/** Which bottom tab is highlighted for a route. The library sits under Plan. */
export function tabOf(route: Route): Tab {
  switch (route.name) {
    case 'plan':
    case 'plan-days':
    case 'workouts':
    case 'workout':
    case 'library':
    case 'exercise':
      return 'plan';
    case 'session':
    case 'run':
      return route.from === 'log' ? 'log' : 'today';
    case 'run-new':
    case 'today':
      return 'today';
    case 'progress':
      return 'progress';
    case 'log':
      return 'log';
    case 'settings':
      return 'settings';
  }
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/app/routes.test.ts`
Expected: PASS, 25 tests

- [ ] **Step 5: Commit**

```bash
git add src/app/routes.ts src/app/routes.test.ts
git commit -m "feat: hash routes with round-trip tests"
```

---

## Task 4: Sync gate, test fixtures and the week plan repository

**Files:**
- Create: `src/db/syncState.ts`, `src/test/fixtures.ts`, `src/features/plan/planRepo.ts`, `src/features/plan/planRepo.test.ts`

- [ ] **Step 1: Write the sync gate and the shared fixtures**

`src/db/syncState.ts` (new file):

```ts
import { db } from './schema';

/**
 * True once any sync has completed. Rows created before then are minted on a
 * device that has not yet seen the account's existing data — the cause of the
 * duplicate-library bug — so first-time setup waits for this.
 */
export async function hasCompletedSync(): Promise<boolean> {
  return Boolean((await db.sync_meta.get('exercises'))?.last_synced_at);
}
```

`src/test/fixtures.ts` (new file):

```ts
import { db } from '../db/schema';

export const USER = 'user-1';

export async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

/** Records a completed sync, which first-time setup waits for. */
export async function markSynced(): Promise<void> {
  await db.sync_meta.put({
    table: 'exercises',
    watermark: null,
    last_synced_at: '2026-10-01T06:00:00.000Z',
    last_error: null,
  });
}
```

- [ ] **Step 2: Write the failing test**

`src/features/plan/planRepo.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { insertRow } from '../../db/repo';
import { isSystemTimestamp } from '../../lib/time';
import { USER, markSynced, resetDb } from '../../test/fixtures';
import type { WeekPlan } from '../../types/domain';
import {
  activePlanFor,
  defaultPlanDayId,
  defaultPlanId,
  ensureWeekPlan,
  pickActivePlan,
  planDays,
  setDayTemplate,
} from './planRepo';

const WED = '2026-10-07';

beforeEach(resetDb);

describe('ensureWeekPlan', () => {
  it('does nothing before the first sync has completed', async () => {
    expect(await ensureWeekPlan(USER, WED)).toBeUndefined();
    expect(await db.week_plans.count()).toBe(0);
  });

  it('creates the default plan and seven rest days as system writes', async () => {
    await markSynced();
    const result = await ensureWeekPlan(USER, WED);

    expect(result?.created).toBe(true);
    expect(result?.plan.id).toBe(defaultPlanId(USER));
    // A plan applies from the day it is created, not from that week's Monday —
    // otherwise the days before it existed would read as missed.
    expect(result?.plan.active_from).toBe(WED);
    expect(isSystemTimestamp(result!.plan.updated_at)).toBe(true);

    const days = await planDays(defaultPlanId(USER));
    expect(days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(days.every((d) => d.template_id === null)).toBe(true);
    expect(days[0].id).toBe(defaultPlanDayId(USER, 1));
    expect(days.every((d) => isSystemTimestamp(d.updated_at))).toBe(true);
  });

  it('is idempotent', async () => {
    await markSynced();
    await ensureWeekPlan(USER, WED);
    const second = await ensureWeekPlan(USER, WED);

    expect(second?.created).toBe(false);
    expect(await db.week_plans.count()).toBe(1);
    expect(await db.week_plan_days.count()).toBe(7);
  });

  it('is safe under concurrent calls', async () => {
    await markSynced();
    await Promise.all([ensureWeekPlan(USER, WED), ensureWeekPlan(USER, WED)]);
    expect(await db.week_plans.count()).toBe(1);
    expect(await db.week_plan_days.count()).toBe(7);
  });
});

describe('plan ids', () => {
  it('are the same for the same user and differ between users', () => {
    expect(defaultPlanId(USER)).toBe(defaultPlanId(USER));
    expect(defaultPlanId(USER)).not.toBe(defaultPlanId('someone-else'));
    expect(defaultPlanDayId(USER, 1)).not.toBe(defaultPlanDayId(USER, 2));
  });
});

describe('setDayTemplate', () => {
  it('is a user edit, so it outranks the system default', async () => {
    await markSynced();
    await ensureWeekPlan(USER, WED);
    await setDayTemplate(defaultPlanDayId(USER, 1), 'template-1');

    const monday = await db.week_plan_days.get(defaultPlanDayId(USER, 1));
    expect(monday?.template_id).toBe('template-1');
    expect(isSystemTimestamp(monday!.updated_at)).toBe(false);
  });
});

describe('active plan', () => {
  function plan(id: string, activeFrom: string, deleted = false): WeekPlan {
    return {
      id,
      user_id: null,
      created_at: '',
      updated_at: '',
      server_updated_at: null,
      deleted_at: deleted ? '2026-01-01T00:00:00.000Z' : null,
      name: id,
      active_from: activeFrom,
    };
  }

  it('picks the latest plan that has started', () => {
    const plans = [plan('a', '2026-01-05'), plan('b', '2026-09-07'), plan('c', '2026-12-07')];
    expect(pickActivePlan(plans, WED)?.id).toBe('b');
  });

  it('ignores deleted plans', () => {
    const plans = [plan('a', '2026-01-05'), plan('b', '2026-09-07', true)];
    expect(pickActivePlan(plans, WED)?.id).toBe('a');
  });

  it('returns nothing before any plan starts', () => {
    expect(pickActivePlan([plan('a', '2027-01-04')], WED)).toBeUndefined();
  });

  it('reads plans from the database', async () => {
    await insertRow<WeekPlan>('week_plans', { name: 'Block', active_from: '2026-09-07' });
    expect((await activePlanFor(WED))?.name).toBe('Block');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run src/features/plan/planRepo.test.ts`
Expected: FAIL — module `./planRepo` does not exist.

- [ ] **Step 4: Implement**

`src/features/plan/planRepo.ts` (new file):

```ts
import { db } from '../../db/schema';
import { insertRow, updateRow } from '../../db/repo';
import { hasCompletedSync } from '../../db/syncState';
import { deterministicId } from '../../lib/uuidv5';
import type { ISODate, Local, UUID, WeekPlan, WeekPlanDay, Weekday } from '../../types/domain';

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7];

export function defaultPlanId(userId: string): UUID {
  return deterministicId(`${userId}:week_plan:default`);
}

export function defaultPlanDayId(userId: string, weekday: Weekday): UUID {
  return deterministicId(`${userId}:week_plan_day:default:${weekday}`);
}

/**
 * Creates the default plan and its seven rest days if they are missing.
 * The plan starts today: days before it existed are never planned, so they can never read as missed.
 *
 * Deterministic ids mean every device creates the same rows. System
 * timestamps mean those defaults can never overwrite a day the user has set.
 * Like the library seed, this waits for the first completed sync.
 */
export async function ensureWeekPlan(
  userId: string,
  todayDate: ISODate,
): Promise<{ plan: Local<WeekPlan>; created: boolean } | undefined> {
  if (!(await hasCompletedSync())) return undefined;
  const planId = defaultPlanId(userId);

  return db.transaction('rw', [db.week_plans, db.week_plan_days], async () => {
    let created = false;
    let plan = await db.week_plans.get(planId);
    if (!plan) {
      plan = await insertRow<WeekPlan>(
        'week_plans',
        { name: 'My plan', active_from: todayDate },
        { id: planId, system: true },
      );
      created = true;
    }

    for (const weekday of WEEKDAYS) {
      const id = defaultPlanDayId(userId, weekday);
      if (!(await db.week_plan_days.get(id))) {
        await insertRow<WeekPlanDay>(
          'week_plan_days',
          { week_plan_id: planId, weekday, template_id: null },
          { id, system: true },
        );
        created = true;
      }
    }

    return { plan, created };
  });
}

/** The plan in force on a date: the latest live plan whose active_from is on or before it. */
export function pickActivePlan<P extends WeekPlan>(plans: P[], date: ISODate): P | undefined {
  return plans
    .filter((p) => p.deleted_at === null && p.active_from <= date)
    .sort((a, b) => b.active_from.localeCompare(a.active_from))[0];
}

export async function activePlanFor(date: ISODate): Promise<Local<WeekPlan> | undefined> {
  return pickActivePlan(await db.week_plans.where('_deleted').equals(0).toArray(), date);
}

/** Live days of a plan, Monday first. */
export async function planDays(planId: UUID): Promise<Local<WeekPlanDay>[]> {
  const days = await db.week_plan_days.where('week_plan_id').equals(planId).toArray();
  return days.filter((d) => d._deleted === 0).sort((a, b) => a.weekday - b.weekday);
}

/** Assigns a workout to a weekday, or null for a rest day. A user edit. */
export async function setDayTemplate(dayId: UUID, templateId: UUID | null): Promise<void> {
  await updateRow<WeekPlanDay>('week_plan_days', dayId, { template_id: templateId });
}
```

- [ ] **Step 5: Run it**

Run: `npx vitest run src/features/plan/planRepo.test.ts`
Expected: PASS, 10 tests

Run: `npx tsc -b` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/db/syncState.ts src/test/fixtures.ts src/features/plan/planRepo.ts src/features/plan/planRepo.test.ts
git commit -m "feat: default week plan with deterministic, system-stamped rows"
```

---

## Task 5: Sync status label

The status line currently shows raw error text such as `Error: TypeError: Failed to fetch` when the network is down — accurate, but alarming in a gym with no signal. This task moves the label into a pure function and makes a network failure read as what it is.

**Files:**
- Create: `src/sync/label.ts`, `src/sync/label.test.ts`
- Modify: `src/features/settings/SyncStatus.tsx`

- [ ] **Step 1: Write the failing test**

`src/sync/label.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { syncLabel } from './label';
import type { SyncStatus } from './types';

function status(partial: Partial<SyncStatus>): SyncStatus {
  return { phase: 'idle', pendingCount: 0, lastSyncedAt: null, error: null, ...partial };
}

describe('syncLabel', () => {
  it('says offline when the device has no connection', () => {
    expect(syncLabel(status({}), false, false)).toBe('Offline');
  });

  it('counts queued changes while offline', () => {
    expect(syncLabel(status({ pendingCount: 3 }), false, false)).toBe('Offline · 3 pending');
  });

  it('reports a sync in progress', () => {
    expect(syncLabel(status({}), true, true)).toBe('Syncing…');
  });

  it('treats a failed fetch as being offline, not as an error', () => {
    expect(syncLabel(status({ error: 'TypeError: Failed to fetch' }), false, true)).toBe('Offline · will retry');
  });

  it('shows queued changes alongside a network failure', () => {
    expect(syncLabel(status({ error: 'Failed to fetch', pendingCount: 2 }), false, true)).toBe('Offline · 2 pending');
  });

  it('shows any other error verbatim', () => {
    expect(syncLabel(status({ error: 'permission denied for table sessions' }), false, true)).toBe(
      'Sync error: permission denied for table sessions',
    );
  });

  it('shows the pending count', () => {
    expect(syncLabel(status({ pendingCount: 5 }), false, true)).toBe('5 pending');
  });

  it('shows the last sync time in 24-hour form', () => {
    expect(syncLabel(status({ lastSyncedAt: '2026-10-04T10:08:00.000Z' }), false, true)).toMatch(
      /^Synced \d{2}:\d{2}$/,
    );
  });

  it('says when nothing has synced yet', () => {
    expect(syncLabel(null, false, true)).toBe('Not synced yet');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/sync/label.test.ts`
Expected: FAIL — module `./label` does not exist.

- [ ] **Step 3: Implement**

`src/sync/label.ts` (new file):

```ts
import type { SyncStatus } from './types';

/** What browsers say when a request never reached the server. */
const NETWORK_FAILURE = /failed to fetch|networkerror|network request failed|load failed/i;

export function syncLabel(status: SyncStatus | null, busy: boolean, online: boolean): string {
  const pending = status?.pendingCount ?? 0;
  const networkDown = !online || (status?.error ? NETWORK_FAILURE.test(status.error) : false);

  if (busy) return 'Syncing…';
  if (networkDown) {
    if (pending > 0) return `Offline · ${pending} pending`;
    return online ? 'Offline · will retry' : 'Offline';
  }
  if (status?.error) return `Sync error: ${status.error}`;
  if (pending > 0) return `${pending} pending`;
  if (status?.lastSyncedAt) {
    const time = new Date(status.lastSyncedAt).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `Synced ${time}`;
  }
  return 'Not synced yet';
}

/** True when the label describes something the user may want to act on. */
export function isSyncProblem(status: SyncStatus | null): boolean {
  return Boolean(status?.error && !NETWORK_FAILURE.test(status.error));
}
```

A running sync is checked first: when one is in flight, that is the most useful thing to show.

- [ ] **Step 4: Use it in the settings widget**

`src/features/settings/SyncStatus.tsx` (replace the whole file):

```tsx
import { isSyncProblem, syncLabel } from '../../sync/label';
import type { SyncStatus as Status } from '../../sync/types';

export default function SyncStatus({
  status,
  busy,
  onSync,
}: {
  status: Status | null;
  busy: boolean;
  onSync: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-live="polite"
        className={`flex-1 text-sm ${isSyncProblem(status) ? 'text-red-400' : 'text-muted'}`}
      >
        {syncLabel(status, busy, navigator.onLine)}
      </span>
      <button
        type="button"
        onClick={onSync}
        disabled={busy}
        className="min-h-12 rounded-xl border border-border px-4 text-sm disabled:opacity-50"
      >
        Sync now
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run it**

Run: `npx vitest run src/sync/label.test.ts`
Expected: PASS, 9 tests

Run: `npx tsc -b` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/sync/label.ts src/sync/label.test.ts src/features/settings/SyncStatus.tsx
git commit -m "feat: readable sync status; a failed fetch reads as offline"
```

---

## Task 6: Live queries, routing hook and app context

These three are thin React glue with no rules of their own, so they are not unit-tested; the checkpoint in Task 9 exercises all of them.

**Files:**
- Create: `src/db/useLiveQuery.ts`, `src/app/useRoute.ts`, `src/app/AppContext.ts`

- [ ] **Step 1: Write the live query hook**

`src/db/useLiveQuery.ts` (new file):

```ts
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
```

- [ ] **Step 2: Write the routing hook**

`src/app/useRoute.ts` (new file):

```ts
import { useEffect, useState } from 'react';
import { parseRoute, routeHref, type Route } from './routes';

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

/** Changes screen. `replace` swaps the history entry, so Back skips the old one. */
export function navigate(route: Route, opts: { replace?: boolean } = {}): void {
  const href = routeHref(route);
  if (opts.replace) window.location.replace(href);
  else window.location.hash = href;
}
```

- [ ] **Step 3: Write the app context**

`src/app/AppContext.ts` (new file):

```ts
import { createContext, useContext } from 'react';
import type { SyncStatus } from '../sync/types';

export interface AppContextValue {
  userId: string;
  syncStatus: SyncStatus | null;
  syncBusy: boolean;
  /** Ask for a sync now. Ignored while one is already running. */
  requestSync: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppContext.Provider>');
  return value;
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc -b` — clean.

```bash
git add src/db/useLiveQuery.ts src/app/useRoute.ts src/app/AppContext.ts
git commit -m "feat: live query hook, routing hook and app context"
```

---

## Task 7: Display formatting

**Files:**
- Create: `src/lib/format.ts`, `src/lib/format.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/format.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import {
  WEEKDAY_NAMES,
  formatDateLong,
  formatDayShort,
  formatKg,
  formatKm,
  formatWeekRange,
  parseOptionalNumber,
} from './format';

describe('formatKg', () => {
  it('groups thousands', () => {
    expect(formatKg(4200)).toBe('4,200 kg');
  });

  it('keeps fractional plates', () => {
    expect(formatKg(102.5)).toBe('102.5 kg');
  });
});

describe('formatKm', () => {
  it('always shows one decimal place', () => {
    expect(formatKm(8)).toBe('8.0 km');
  });

  it('shows up to two', () => {
    expect(formatKm(10.55)).toBe('10.55 km');
  });
});

describe('dates', () => {
  it('formats a long date', () => {
    expect(formatDateLong('2026-10-04')).toBe('Sunday 4 October');
  });

  it('formats a short day', () => {
    expect(formatDayShort('2026-10-05')).toBe('Mon 5');
  });

  it('formats a week inside one month', () => {
    expect(formatWeekRange('2026-10-05')).toBe('5–11 Oct');
  });

  it('formats a week across two months', () => {
    expect(formatWeekRange('2026-10-26')).toBe('26 Oct – 1 Nov');
  });

  it('names weekdays Monday first', () => {
    expect(WEEKDAY_NAMES[0]).toBe('Monday');
    expect(WEEKDAY_NAMES[6]).toBe('Sunday');
  });
});

describe('parseOptionalNumber', () => {
  it('treats blank as no value', () => {
    expect(parseOptionalNumber('  ')).toBeNull();
  });

  it('parses integers and decimals', () => {
    expect(parseOptionalNumber('12')).toBe(12);
    expect(parseOptionalNumber('2.5')).toBe(2.5);
  });

  it('accepts a decimal comma', () => {
    expect(parseOptionalNumber('2,5')).toBe(2.5);
  });

  it('accepts a number still being typed', () => {
    expect(parseOptionalNumber('5.')).toBe(5);
  });

  it('returns NaN for text, so validation can flag it', () => {
    expect(parseOptionalNumber('abc')).toBeNaN();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — module `./format` does not exist.

- [ ] **Step 3: Implement**

`src/lib/format.ts` (new file):

```ts
import type { ISODate } from '../types/domain';
import { addDays, parseISODate } from './time';

/** English UI, metric units, 24-hour clock. */
const LOCALE = 'en-GB';

export const WEEKDAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function formatKg(kg: number): string {
  return `${kg.toLocaleString(LOCALE, { maximumFractionDigits: 2 })} kg`;
}

export function formatKm(km: number): string {
  return `${km.toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km`;
}

/** "Sunday 4 October" */
export function formatDateLong(date: ISODate): string {
  return parseISODate(date).toLocaleDateString(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** "Mon 5" */
export function formatDayShort(date: ISODate): string {
  return parseISODate(date).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric' });
}

/** "5–11 Oct", or "26 Oct – 1 Nov" across a month boundary. */
export function formatWeekRange(weekStart: ISODate): string {
  const start = parseISODate(weekStart);
  const end = parseISODate(addDays(weekStart, 6));
  const month = (d: Date) => d.toLocaleDateString(LOCALE, { month: 'short' });
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${month(end)}`;
  }
  return `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
}

/**
 * Parses a number field. Blank means "no value"; anything unparseable is NaN
 * so validation can reject it. A decimal comma is accepted because many
 * phone keyboards — Turkish ones included — offer only a comma.
 */
export function parseOptionalNumber(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  return /^-?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS, 14 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: display formatting for dates, kg and km"
```

---

## Task 8: UI kit

Shared, presentational components. They hold no rules — validation and maths live in the pure modules — so they are verified at the checkpoints rather than unit-tested.

**Files:**
- Create: `src/components/Button.tsx`, `src/components/Fields.tsx`, `src/components/Stepper.tsx`, `src/components/ScreenHeader.tsx`, `src/components/TabBar.tsx`, `src/components/PickList.tsx`, `src/components/StatusBadge.tsx`, `src/components/Loading.tsx`, `src/components/NotFound.tsx`, `src/components/SyncBadge.tsx`

- [ ] **Step 1: Buttons**

`src/components/Button.tsx` (new file):

```tsx
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
```

- [ ] **Step 2: Form fields**

`src/components/Fields.tsx` (new file):

```tsx
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
```

- [ ] **Step 3: Stepper**

`src/components/Stepper.tsx` (new file):

```tsx
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
```

- [ ] **Step 4: Header, tab bar, lists and small pieces**

`src/components/ScreenHeader.tsx` (new file):

```tsx
import type { ReactNode } from 'react';
import { routeHref, type Route } from '../app/routes';

export default function ScreenHeader({ title, back, action }: { title: string; back?: Route; action?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-2">
      {back && (
        <a href={routeHref(back)} aria-label="Back" className="-ml-3 grid size-12 shrink-0 place-items-center text-3xl">
          ‹
        </a>
      )}
      <h1 className="flex-1 truncate text-2xl font-semibold">{title}</h1>
      {action}
    </header>
  );
}
```

`src/components/TabBar.tsx` (new file):

```tsx
import { routeHref, type Route, type Tab } from '../app/routes';

const TABS: { tab: Tab; label: string; route: Route }[] = [
  { tab: 'today', label: 'Today', route: { name: 'today' } },
  { tab: 'plan', label: 'Plan', route: { name: 'plan' } },
  { tab: 'progress', label: 'Progress', route: { name: 'progress' } },
  { tab: 'log', label: 'Log', route: { name: 'log' } },
  { tab: 'settings', label: 'Settings', route: { name: 'settings' } },
];

export default function TabBar({ active }: { active: Tab }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((t) => (
          <li key={t.tab}>
            <a
              href={routeHref(t.route)}
              aria-current={active === t.tab ? 'page' : undefined}
              className={`flex min-h-14 items-center justify-center text-sm ${active === t.tab ? 'font-semibold text-accent' : 'text-muted'}`}
            >
              {t.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

`src/components/PickList.tsx` (new file):

```tsx
export interface PickItem {
  id: string;
  label: string;
  detail?: string;
}

export default function PickList({
  items,
  onPick,
  empty = 'Nothing here yet.',
}: {
  items: PickItem[];
  onPick: (id: string) => void;
  empty?: string;
}) {
  if (items.length === 0) return <p className="py-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" onClick={() => onPick(item.id)} className="min-h-14 w-full px-4 py-2 text-left">
            <span className="block">{item.label}</span>
            {item.detail && <span className="block text-sm text-muted">{item.detail}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

`src/components/StatusBadge.tsx` (new file):

```tsx
const STYLES: Record<string, string> = {
  planned: 'bg-accent/15 text-accent',
  done: 'bg-green-500/15 text-green-400',
  partial: 'bg-amber-500/15 text-amber-300',
  unfinished: 'bg-amber-500/15 text-amber-300',
  skipped: 'bg-zinc-500/20 text-zinc-300',
  missed: 'bg-red-500/15 text-red-300',
};

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? 'bg-surface'}`}>
      {status}
    </span>
  );
}
```

`src/components/Loading.tsx` (new file):

```tsx
export default function Loading() {
  return (
    <p role="status" className="py-8 text-center text-muted">
      Loading…
    </p>
  );
}
```

`src/components/NotFound.tsx` (new file):

```tsx
import { routeHref, type Route } from '../app/routes';

export default function NotFound({ what, back }: { what: string; back: Route }) {
  return (
    <div className="py-8 text-center">
      <p className="mb-4 text-muted">This {what} no longer exists — it may have been deleted on another device.</p>
      <a href={routeHref(back)} className="text-accent">
        Go back
      </a>
    </div>
  );
}
```

`src/components/SyncBadge.tsx` (new file):

```tsx
import { useApp } from '../app/AppContext';
import { isSyncProblem, syncLabel } from '../sync/label';

/** Compact status in the corner of every screen. Tap to sync now. */
export default function SyncBadge() {
  const { syncStatus, syncBusy, requestSync } = useApp();
  return (
    <button
      type="button"
      onClick={requestSync}
      disabled={syncBusy}
      aria-label={`${syncLabel(syncStatus, syncBusy, navigator.onLine)}. Sync now`}
      className={`min-h-9 rounded-full px-3 text-xs ${isSyncProblem(syncStatus) ? 'text-red-400' : 'text-muted'}`}
    >
      {syncLabel(syncStatus, syncBusy, navigator.onLine)}
    </button>
  );
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc -b` — clean.

```bash
git add src/components
git commit -m "feat: shared UI components sized for one-handed use"
```

---

## Task 9: App shell, bootstrap, Settings and Progress

**Files:**
- Create: `src/app/bootstrap.ts`, `src/app/AppShell.tsx`, `src/app/Screen.tsx`, `src/components/ComingSoon.tsx`, `src/features/settings/SettingsScreen.tsx`, `src/features/progress/ProgressScreen.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: First-time setup in one place**

`src/app/bootstrap.ts` (new file):

```ts
import { seedExercises } from '../db/seed';
import { ensureWeekPlan } from '../features/plan/planRepo';
import type { ISODate } from '../types/domain';

/**
 * One-time setup that must wait for the first completed sync. Each step is
 * idempotent and runs after every sync, so a fresh install picks up the
 * account's existing rows first and only creates what is genuinely missing.
 *
 * Returns true if anything was written that should be pushed now.
 */
export async function bootstrapAfterSync(userId: string, todayDate: ISODate): Promise<boolean> {
  const seeded = await seedExercises();
  const plan = await ensureWeekPlan(userId, todayDate);
  return seeded > 0 || Boolean(plan?.created);
}
```

- [ ] **Step 2: The interim screen for routes built later in this plan**

`src/components/ComingSoon.tsx` (new file):

```tsx
export default function ComingSoon({ title }: { title: string }) {
  return (
    <section className="py-8 text-center">
      <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
      <p className="text-muted">Arrives later in this build.</p>
    </section>
  );
}
```

This file is deleted in Task 30, once every route has a screen.

- [ ] **Step 3: Settings and Progress**

`src/features/settings/SettingsScreen.tsx` (new file):

```tsx
import { useApp } from '../../app/AppContext';
import Button from '../../components/Button';
import ScreenHeader from '../../components/ScreenHeader';
import { signOut } from '../auth/useAuth';
import SyncStatus from './SyncStatus';

export default function SettingsScreen() {
  const { syncStatus, syncBusy, requestSync } = useApp();
  return (
    <section>
      <ScreenHeader title="Settings" />
      <div className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-medium">Sync</h2>
          <SyncStatus status={syncStatus} busy={syncBusy} onSync={requestSync} />
        </div>
        <Button variant="danger" block onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </section>
  );
}
```

`src/features/progress/ProgressScreen.tsx` (new file):

```tsx
import ScreenHeader from '../../components/ScreenHeader';

export default function ProgressScreen() {
  return (
    <section>
      <ScreenHeader title="Progress" />
      <p className="text-muted">
        Charts arrive with the next build: estimated 1RM and PRs per exercise, weekly volume, RPE trends and the
        fatigue flag, and running distance and pace. Everything you log now feeds them.
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Route → screen**

`src/app/Screen.tsx` (new file):

```tsx
import ComingSoon from '../components/ComingSoon';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'progress':
      return <ProgressScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <ComingSoon title={route.name} />;
  }
}
```

- [ ] **Step 5: The shell**

`src/app/AppShell.tsx` (new file):

```tsx
import { useEffect } from 'react';
import SyncBadge from '../components/SyncBadge';
import TabBar from '../components/TabBar';
import Screen from './Screen';
import { routeHref, tabOf } from './routes';
import { useRoute } from './useRoute';

export default function AppShell() {
  const route = useRoute();
  const href = routeHref(route);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [href]);

  return (
    <div className="min-h-full pt-[env(safe-area-inset-top)]">
      <div className="mx-auto max-w-xl px-4 pt-2 pb-[calc(9rem+env(safe-area-inset-bottom))]">
        <div className="flex justify-end">
          <SyncBadge />
        </div>
        <Screen route={route} />
      </div>
      <TabBar active={tabOf(route)} />
    </div>
  );
}
```

The bottom padding leaves room for both the tab bar and the rest-timer bar that Task 23 floats above it.

- [ ] **Step 6: Wire it into the app**

`src/App.tsx` (replace the whole file):

```tsx
import { useEffect, useMemo } from 'react';
import { AppContext, type AppContextValue } from './app/AppContext';
import AppShell from './app/AppShell';
import { bootstrapAfterSync } from './app/bootstrap';
import SignIn from './features/auth/SignIn';
import { useAuth } from './features/auth/useAuth';
import { today } from './lib/time';
import { useSync } from './sync/useSync';

export default function App() {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const { status, busy, syncNow } = useSync(userId);

  // First-time setup waits for a completed sync — see bootstrapAfterSync.
  useEffect(() => {
    if (!userId || !status?.lastSyncedAt) return;
    void (async () => {
      if (await bootstrapAfterSync(userId, today())) await syncNow();
    })();
  }, [userId, status?.lastSyncedAt, syncNow]);

  const value = useMemo<AppContextValue | null>(
    () =>
      userId
        ? { userId, syncStatus: status, syncBusy: busy, requestSync: () => void syncNow() }
        : null,
    [userId, status, busy, syncNow],
  );

  if (loading) return <main className="p-6 text-muted">Loading…</main>;
  if (!value) return <SignIn />;

  return (
    <AppContext.Provider value={value}>
      <AppShell />
    </AppContext.Provider>
  );
}
```

- [ ] **Step 7: Verify, run, commit**

Run: `npm test` — everything passes. `npx tsc -b` — clean. `npm run build` — succeeds.

Run: `npm run dev`. **What to check:** the five bottom tabs switch screens and the active one is highlighted; the sync status sits top-right and syncs when tapped; Settings shows the sync panel and Sign out; the browser's back button returns to the previous tab. In Supabase → Table Editor → `week_plans`, one row named "My plan" now exists, and `week_plan_days` holds seven rows.

```bash
git add src/app src/components/ComingSoon.tsx src/features/settings/SettingsScreen.tsx src/features/progress src/App.tsx
git commit -m "feat: app shell with bottom tabs, routing and first-time setup"
```

---

## Task 10: Exercise library rules and repository

**Files:**
- Create: `src/features/library/exerciseRules.ts`, `src/features/library/exerciseRules.test.ts`, `src/features/library/exercisesRepo.ts`, `src/features/library/exercisesRepo.test.ts`
- Modify: `src/test/fixtures.ts`

- [ ] **Step 1: Write the failing tests**

`src/features/library/exerciseRules.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import type { Exercise } from '../../types/domain';
import {
  EMPTY_EXERCISE,
  NO_FILTER,
  exerciseSummary,
  filterExercises,
  muscleGroups,
  normalizeExercise,
  validateExercise,
} from './exerciseRules';

function ex(id: string, partial: Partial<Exercise> = {}): Exercise {
  return {
    id,
    user_id: null,
    created_at: '',
    updated_at: '',
    server_updated_at: null,
    deleted_at: null,
    name: id,
    muscle_group: 'legs',
    modality: 'strength',
    run_type: null,
    default_sets: 3,
    default_reps: 5,
    default_weight_kg: null,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 0,
    ...partial,
  };
}

describe('filterExercises', () => {
  const rows = [
    ex('Back Squat', { sort_order: 2 }),
    ex('Bench Press', { muscle_group: 'chest', sort_order: 1 }),
    ex('Easy Run', { modality: 'cardio', muscle_group: 'cardio', sort_order: 9 }),
    ex('Gone', { deleted_at: '2026-01-01T00:00:00.000Z' }),
  ];

  it('drops deleted exercises and sorts by sort order', () => {
    expect(filterExercises(rows, NO_FILTER).map((e) => e.id)).toEqual(['Bench Press', 'Back Squat', 'Easy Run']);
  });

  it('searches names case-insensitively', () => {
    expect(filterExercises(rows, { ...NO_FILTER, search: 'SQU' }).map((e) => e.id)).toEqual(['Back Squat']);
  });

  it('filters by modality', () => {
    expect(filterExercises(rows, { ...NO_FILTER, modality: 'cardio' }).map((e) => e.id)).toEqual(['Easy Run']);
  });

  it('filters by muscle group', () => {
    expect(filterExercises(rows, { ...NO_FILTER, muscleGroup: 'chest' }).map((e) => e.id)).toEqual(['Bench Press']);
  });

  it('lists distinct muscle groups of live exercises', () => {
    expect(muscleGroups(rows)).toEqual(['cardio', 'chest', 'legs']);
  });
});

describe('normalizeExercise', () => {
  it('trims text and keeps only strength fields for a strength exercise', () => {
    const n = normalizeExercise({
      ...EMPTY_EXERCISE,
      name: '  Squat ',
      muscle_group: ' ',
      run_type: 'easy',
      default_distance_km: 5,
    });
    expect(n.name).toBe('Squat');
    expect(n.muscle_group).toBeNull();
    expect(n.run_type).toBeNull();
    expect(n.default_distance_km).toBeNull();
    expect(n.default_sets).toBe(3);
  });

  it('keeps only cardio fields for a cardio exercise and defaults the run type', () => {
    const n = normalizeExercise({ ...EMPTY_EXERCISE, name: 'Run', modality: 'cardio', default_distance_km: 8 });
    expect(n.run_type).toBe('easy');
    expect(n.default_sets).toBeNull();
    expect(n.default_reps).toBeNull();
    expect(n.default_distance_km).toBe(8);
  });
});

describe('validateExercise', () => {
  it('accepts a valid exercise', () => {
    expect(validateExercise({ ...EMPTY_EXERCISE, name: 'Squat' })).toEqual({});
  });

  it('requires a name', () => {
    expect(validateExercise({ ...EMPTY_EXERCISE, name: '   ' }).name).toBeDefined();
  });

  it('rejects fractional sets', () => {
    expect(validateExercise({ ...EMPTY_EXERCISE, name: 'Squat', default_sets: 2.5 }).default_sets).toBeDefined();
  });

  it('rejects an unparseable weight', () => {
    expect(validateExercise({ ...EMPTY_EXERCISE, name: 'Squat', default_weight_kg: Number.NaN }).default_weight_kg).toBeDefined();
  });

  it('ignores strength fields on a cardio exercise', () => {
    expect(validateExercise({ ...EMPTY_EXERCISE, name: 'Run', modality: 'cardio', default_sets: 2.5 })).toEqual({});
  });
});

describe('exerciseSummary', () => {
  it('summarises a strength exercise', () => {
    expect(exerciseSummary(ex('Squat', { default_weight_kg: 100 }))).toBe('Legs · 3×5 · 100 kg');
  });

  it('summarises a run', () => {
    expect(
      exerciseSummary(ex('Long Run', { modality: 'cardio', run_type: 'long', default_distance_km: 15, default_duration_s: 5400 })),
    ).toBe('Long · 15 km · 90 min');
  });
});
```

`src/features/library/exercisesRepo.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { resetDb } from '../../test/fixtures';
import { EMPTY_EXERCISE } from './exerciseRules';
import { createExercise, deleteExercise, duplicateExercise, updateExercise } from './exercisesRepo';

beforeEach(resetDb);

describe('exercisesRepo', () => {
  it('appends new exercises after the existing sort order', async () => {
    const a = await createExercise({ ...EMPTY_EXERCISE, name: 'A' });
    const b = await createExercise({ ...EMPTY_EXERCISE, name: 'B' });
    expect(b.sort_order).toBe(a.sort_order + 1);
  });

  it('normalises what it stores', async () => {
    const row = await createExercise({ ...EMPTY_EXERCISE, name: '  Squat  ', run_type: 'easy' });
    expect(row.name).toBe('Squat');
    expect(row.run_type).toBeNull();
  });

  it('updates an exercise', async () => {
    const row = await createExercise({ ...EMPTY_EXERCISE, name: 'Squat' });
    await updateExercise(row.id, { ...EMPTY_EXERCISE, name: 'Front Squat' });
    expect((await db.exercises.get(row.id))?.name).toBe('Front Squat');
  });

  it('duplicates an exercise under a new id', async () => {
    const row = await createExercise({ ...EMPTY_EXERCISE, name: 'Squat', default_weight_kg: 100 });
    const copy = await duplicateExercise(row.id);
    expect(copy.id).not.toBe(row.id);
    expect(copy.name).toBe('Squat (copy)');
    expect(copy.default_weight_kg).toBe(100);
  });

  it('soft-deletes, so history that references the exercise survives', async () => {
    const row = await createExercise({ ...EMPTY_EXERCISE, name: 'Squat' });
    await deleteExercise(row.id);
    const stored = await db.exercises.get(row.id);
    expect(stored?._deleted).toBe(1);
    expect(stored?.name).toBe('Squat');
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/features/library`
Expected: FAIL — modules `./exerciseRules` and `./exercisesRepo` do not exist.

- [ ] **Step 3: Implement the rules**

`src/features/library/exerciseRules.ts` (new file):

```ts
import type { BaseRow, Exercise, Modality, RunType } from '../../types/domain';

export interface ExerciseFilter {
  search: string;
  modality: Modality | 'all';
  /** A muscle group, or 'all'. */
  muscleGroup: string;
}

export const NO_FILTER: ExerciseFilter = { search: '', modality: 'all', muscleGroup: 'all' };

/** Live exercises matching the filter, in library order. */
export function filterExercises<E extends Exercise>(rows: E[], filter: ExerciseFilter): E[] {
  const query = filter.search.trim().toLowerCase();
  return rows
    .filter((e) => e.deleted_at === null)
    .filter((e) => filter.modality === 'all' || e.modality === filter.modality)
    .filter((e) => filter.muscleGroup === 'all' || e.muscle_group === filter.muscleGroup)
    .filter((e) => query === '' || e.name.toLowerCase().includes(query))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function muscleGroups(rows: Exercise[]): string[] {
  const groups = rows
    .filter((e) => e.deleted_at === null && e.muscle_group)
    .map((e) => e.muscle_group as string);
  return [...new Set(groups)].sort();
}

export type ExerciseInput = Omit<Exercise, keyof BaseRow | 'sort_order'>;

export const EMPTY_EXERCISE: ExerciseInput = {
  name: '',
  muscle_group: null,
  modality: 'strength',
  run_type: null,
  default_sets: 3,
  default_reps: 8,
  default_weight_kg: null,
  default_duration_s: null,
  default_distance_km: null,
};

export function toInput(e: Exercise): ExerciseInput {
  return {
    name: e.name,
    muscle_group: e.muscle_group,
    modality: e.modality,
    run_type: e.run_type,
    default_sets: e.default_sets,
    default_reps: e.default_reps,
    default_weight_kg: e.default_weight_kg,
    default_duration_s: e.default_duration_s,
    default_distance_km: e.default_distance_km,
  };
}

/** Trims text and drops the fields that do not belong to the exercise's modality. */
export function normalizeExercise(input: ExerciseInput): ExerciseInput {
  const strength = input.modality === 'strength';
  return {
    ...input,
    name: input.name.trim(),
    muscle_group: input.muscle_group?.trim() || null,
    run_type: strength ? null : (input.run_type ?? 'easy'),
    default_sets: strength ? input.default_sets : null,
    default_reps: strength ? input.default_reps : null,
    default_weight_kg: strength ? input.default_weight_kg : null,
    default_duration_s: strength ? null : input.default_duration_s,
    default_distance_km: strength ? null : input.default_distance_km,
  };
}

export type ExerciseErrors = Partial<Record<keyof ExerciseInput, string>>;

export function validateExercise(input: ExerciseInput): ExerciseErrors {
  const e = normalizeExercise(input);
  const errors: ExerciseErrors = {};
  const wholeAboveZero = (v: number | null) => v === null || (Number.isInteger(v) && v > 0);

  if (!e.name) errors.name = 'Name is required';
  if (!wholeAboveZero(e.default_sets)) errors.default_sets = 'A whole number above 0';
  if (!wholeAboveZero(e.default_reps)) errors.default_reps = 'A whole number above 0';
  if (e.default_weight_kg !== null && !(e.default_weight_kg >= 0 && e.default_weight_kg <= 1000)) {
    errors.default_weight_kg = 'Between 0 and 1000 kg';
  }
  if (e.default_distance_km !== null && !(e.default_distance_km > 0 && e.default_distance_km <= 300)) {
    errors.default_distance_km = 'Between 0 and 300 km';
  }
  if (e.default_duration_s !== null && !(Number.isInteger(e.default_duration_s) && e.default_duration_s > 0)) {
    errors.default_duration_s = 'Above 0';
  }
  return errors;
}

export const RUN_TYPE_LABELS: Record<RunType, string> = {
  easy: 'Easy',
  tempo: 'Tempo',
  intervals: 'Intervals',
  long: 'Long',
};

/** One line under an exercise's name: "Legs · 3×5 · 100 kg" or "Long · 15 km · 90 min". */
export function exerciseSummary(e: Exercise): string {
  const parts: string[] = [];
  if (e.modality === 'cardio') {
    parts.push(e.run_type ? RUN_TYPE_LABELS[e.run_type] : 'Run');
    if (e.default_distance_km) parts.push(`${e.default_distance_km} km`);
    if (e.default_duration_s) parts.push(`${Math.round(e.default_duration_s / 60)} min`);
    return parts.join(' · ');
  }
  if (e.muscle_group) parts.push(e.muscle_group.charAt(0).toUpperCase() + e.muscle_group.slice(1));
  if (e.default_sets && e.default_reps) parts.push(`${e.default_sets}×${e.default_reps}`);
  if (e.default_weight_kg) parts.push(`${e.default_weight_kg} kg`);
  return parts.join(' · ');
}
```

- [ ] **Step 4: Implement the repository**

`src/features/library/exercisesRepo.ts` (new file):

```ts
import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import type { Exercise, Local, UUID } from '../../types/domain';
import { normalizeExercise, toInput, type ExerciseInput } from './exerciseRules';

async function nextSortOrder(): Promise<number> {
  const last = await db.exercises.orderBy('sort_order').last();
  return (last?.sort_order ?? 0) + 1;
}

export async function createExercise(input: ExerciseInput): Promise<Local<Exercise>> {
  return insertRow<Exercise>('exercises', { ...normalizeExercise(input), sort_order: await nextSortOrder() });
}

export async function updateExercise(id: UUID, input: ExerciseInput): Promise<Local<Exercise>> {
  return updateRow<Exercise>('exercises', id, normalizeExercise(input));
}

/**
 * Soft delete. Workouts and logged sessions that reference the exercise keep
 * working and show its name with "(deleted)".
 */
export async function deleteExercise(id: UUID): Promise<void> {
  await softDeleteRow('exercises', id);
}

export async function duplicateExercise(id: UUID): Promise<Local<Exercise>> {
  const source = await db.exercises.get(id);
  if (!source) throw new Error(`exercises: no row with id ${id}`);
  return createExercise({ ...toInput(source), name: `${source.name} (copy)` });
}
```

- [ ] **Step 5: Add an exercise fixture**

`src/test/fixtures.ts` (replace the whole file):

```ts
import { db } from '../db/schema';
import { createExercise } from '../features/library/exercisesRepo';
import type { Exercise, Local, Modality } from '../types/domain';

export const USER = 'user-1';

export async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

/** Records a completed sync, which first-time setup waits for. */
export async function markSynced(): Promise<void> {
  await db.sync_meta.put({
    table: 'exercises',
    watermark: null,
    last_synced_at: '2026-10-01T06:00:00.000Z',
    last_error: null,
  });
}

export async function makeExercise(name: string, modality: Modality = 'strength'): Promise<Local<Exercise>> {
  const cardio = modality === 'cardio';
  return createExercise({
    name,
    muscle_group: cardio ? 'cardio' : 'legs',
    modality,
    run_type: cardio ? 'easy' : null,
    default_sets: cardio ? null : 3,
    default_reps: cardio ? null : 5,
    default_weight_kg: cardio ? null : 100,
    default_duration_s: cardio ? 1800 : null,
    default_distance_km: cardio ? 5 : null,
  });
}
```

- [ ] **Step 6: Run them**

Run: `npx vitest run src/features/library`
Expected: PASS, 19 tests

Run: `npx tsc -b` — clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/library src/test/fixtures.ts
git commit -m "feat: exercise library rules and repository"
```

---

## Task 11: Exercise library screens

**Files:**
- Create: `src/features/library/LibraryScreen.tsx`, `src/features/library/ExerciseForm.tsx`, `src/features/library/ExercisePicker.tsx`
- Modify: `src/app/Screen.tsx`

- [ ] **Step 1: The library list**

`src/features/library/LibraryScreen.tsx` (new file):

```tsx
import { useState } from 'react';
import { routeHref } from '../../app/routes';
import { navigate } from '../../app/useRoute';
import { SelectField, Segmented, TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import PickList from '../../components/PickList';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import type { Modality } from '../../types/domain';
import { NO_FILTER, exerciseSummary, filterExercises, muscleGroups, type ExerciseFilter } from './exerciseRules';

export default function LibraryScreen() {
  const [filter, setFilter] = useState<ExerciseFilter>(NO_FILTER);
  const all = useLiveQuery(() => db.exercises.toArray(), []);

  if (!all) return <Loading />;
  const rows = filterExercises(all, filter);

  return (
    <section>
      <ScreenHeader
        title="Exercise library"
        back={{ name: 'plan' }}
        action={
          <a href={routeHref({ name: 'exercise', id: 'new' })} className="min-h-12 content-center px-2 text-accent">
            + New
          </a>
        }
      />
      <div className="mb-4 space-y-3">
        <TextField
          label="Search"
          type="search"
          value={filter.search}
          onChange={(e) => setFilter({ ...filter, search: e.target.value })}
        />
        <Segmented<Modality | 'all'>
          label="Type"
          value={filter.modality}
          options={[
            { value: 'all', label: 'All' },
            { value: 'strength', label: 'Strength' },
            { value: 'cardio', label: 'Cardio' },
          ]}
          onChange={(modality) => setFilter({ ...filter, modality })}
        />
        <SelectField
          label="Muscle group"
          value={filter.muscleGroup}
          options={[
            { value: 'all', label: 'All muscle groups' },
            ...muscleGroups(all).map((g) => ({ value: g, label: g })),
          ]}
          onChange={(muscleGroup) => setFilter({ ...filter, muscleGroup })}
        />
      </div>
      <PickList
        items={rows.map((e) => ({ id: e.id, label: e.name, detail: exerciseSummary(e) }))}
        onPick={(id) => navigate({ name: 'exercise', id })}
        empty="No exercises match."
      />
    </section>
  );
}
```

- [ ] **Step 2: Create and edit an exercise**

`src/features/library/ExerciseForm.tsx` (new file):

```tsx
import { useState } from 'react';
import { navigate } from '../../app/useRoute';
import Button from '../../components/Button';
import { NumberField, SelectField, Segmented, TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import type { Modality, RunType, UUID } from '../../types/domain';
import {
  EMPTY_EXERCISE,
  RUN_TYPE_LABELS,
  muscleGroups,
  toInput,
  validateExercise,
  type ExerciseErrors,
  type ExerciseInput,
} from './exerciseRules';
import { createExercise, deleteExercise, duplicateExercise, updateExercise } from './exercisesRepo';

export default function ExerciseForm({ id }: { id: UUID | 'new' }) {
  const data = useLiveQuery(async () => {
    const all = await db.exercises.toArray();
    const existing = id === 'new' ? null : (all.find((e) => e.id === id && e._deleted === 0) ?? null);
    return { existing, groups: muscleGroups(all) };
  }, [id]);

  if (!data) return <Loading />;
  if (id !== 'new' && !data.existing) return <NotFound what="exercise" back={{ name: 'library' }} />;

  return (
    <FormBody
      id={id}
      initial={data.existing ? toInput(data.existing) : EMPTY_EXERCISE}
      groups={data.groups}
    />
  );
}

function FormBody({ id, initial, groups }: { id: UUID | 'new'; initial: ExerciseInput; groups: string[] }) {
  const [input, setInput] = useState<ExerciseInput>(initial);
  const [errors, setErrors] = useState<ExerciseErrors>({});
  const set = (patch: Partial<ExerciseInput>) => setInput({ ...input, ...patch });
  const cardio = input.modality === 'cardio';

  async function save() {
    const found = validateExercise(input);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (id === 'new') await createExercise(input);
    else await updateExercise(id, input);
    navigate({ name: 'library' });
  }

  return (
    <section>
      <ScreenHeader title={id === 'new' ? 'New exercise' : input.name || 'Exercise'} back={{ name: 'library' }} />
      <div className="space-y-4">
        <TextField label="Name" value={input.name} error={errors.name} onChange={(e) => set({ name: e.target.value })} />
        <Segmented<Modality>
          label="Type"
          value={input.modality}
          options={[
            { value: 'strength', label: 'Strength' },
            { value: 'cardio', label: 'Cardio' },
          ]}
          onChange={(modality) => set({ modality, run_type: modality === 'cardio' ? (input.run_type ?? 'easy') : null })}
        />

        {cardio ? (
          <>
            <SelectField
              label="Run type"
              value={input.run_type ?? 'easy'}
              options={Object.entries(RUN_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(v) => set({ run_type: v as RunType })}
            />
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="Distance (km)"
                value={input.default_distance_km}
                error={errors.default_distance_km}
                onChange={(v) => set({ default_distance_km: v })}
              />
              <NumberField
                label="Duration (min)"
                value={input.default_duration_s === null ? null : input.default_duration_s / 60}
                error={errors.default_duration_s}
                onChange={(v) => set({ default_duration_s: v === null ? null : Math.round(v * 60) })}
              />
            </div>
          </>
        ) : (
          <>
            <TextField
              label="Muscle group"
              list="muscle-groups"
              value={input.muscle_group ?? ''}
              onChange={(e) => set({ muscle_group: e.target.value })}
            />
            <datalist id="muscle-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <div className="grid grid-cols-3 gap-3">
              <NumberField label="Sets" value={input.default_sets} error={errors.default_sets} onChange={(v) => set({ default_sets: v })} />
              <NumberField label="Reps" value={input.default_reps} error={errors.default_reps} onChange={(v) => set({ default_reps: v })} />
              <NumberField label="kg" value={input.default_weight_kg} error={errors.default_weight_kg} onChange={(v) => set({ default_weight_kg: v })} />
            </div>
          </>
        )}

        <Button variant="primary" block onClick={() => void save()}>
          Save
        </Button>

        {id !== 'new' && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={async () => {
                const copy = await duplicateExercise(id);
                navigate({ name: 'exercise', id: copy.id });
              }}
            >
              Duplicate
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm(`Delete ${input.name}? Workouts and history that use it keep working.`)) return;
                await deleteExercise(id);
                navigate({ name: 'library' });
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
```

`FormBody` is keyed implicitly by the route — `Screen` renders `ExerciseForm` with `key={route.id}` (Step 4), so moving to a different exercise remounts it with fresh state.

- [ ] **Step 3: A reusable picker**

`src/features/library/ExercisePicker.tsx` (new file):

```tsx
import { useState } from 'react';
import Button from '../../components/Button';
import { TextField } from '../../components/Fields';
import PickList from '../../components/PickList';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import type { Exercise, Local, Modality } from '../../types/domain';
import { exerciseSummary, filterExercises } from './exerciseRules';

export default function ExercisePicker({
  onPick,
  onCancel,
  modality,
}: {
  onPick: (exercise: Local<Exercise>) => void;
  onCancel: () => void;
  modality?: Modality;
}) {
  const [search, setSearch] = useState('');
  const all = useLiveQuery(() => db.exercises.toArray(), []);
  const rows = all ? filterExercises(all, { search, modality: modality ?? 'all', muscleGroup: 'all' }) : [];

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <TextField label="Find an exercise" type="search" autoFocus value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="max-h-[50vh] overflow-y-auto">
        <PickList
          items={rows.map((e) => ({ id: e.id, label: e.name, detail: exerciseSummary(e) }))}
          onPick={(pickedId) => {
            const exercise = rows.find((r) => r.id === pickedId);
            if (exercise) onPick(exercise);
          }}
          empty="No exercises match."
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Route to the library**

`src/app/Screen.tsx` (replace the whole file):

```tsx
import ComingSoon from '../components/ComingSoon';
import ExerciseForm from '../features/library/ExerciseForm';
import LibraryScreen from '../features/library/LibraryScreen';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'library':
      return <LibraryScreen />;
    case 'exercise':
      return <ExerciseForm key={route.id} id={route.id} />;
    case 'progress':
      return <ProgressScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <ComingSoon title={route.name} />;
  }
}
```

- [ ] **Step 5: Verify, run, commit**

Run: `npx tsc -b` — clean. `npm test` — passes.

Run: `npm run dev` and open `http://localhost:5173/#/library` (or the port the dev server prints). **What to check:** the 51 seeded exercises list in library order; searching "squ" narrows to the squats; Cardio shows the four runs; tapping one opens its form; editing a name and saving updates the list instantly; "+ New" creates one; Duplicate opens the copy; Delete asks first and removes it from the list.

```bash
git add src/features/library src/app/Screen.tsx
git commit -m "feat: exercise library screens"
```

---

## Task 12: Workouts — reorder rules and repository

**Files:**
- Create: `src/features/plan/reorder.ts`, `src/features/plan/reorder.test.ts`, `src/features/plan/workoutsRepo.ts`, `src/features/plan/workoutsRepo.test.ts`
- Modify: `src/test/fixtures.ts`

- [ ] **Step 1: Write the failing tests**

`src/features/plan/reorder.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { moveItem, renumber } from './reorder';

const abc = [
  { id: 'a', position: 0 },
  { id: 'b', position: 1 },
  { id: 'c', position: 2 },
];

describe('moveItem', () => {
  it('moves an item up, returning only the rows that changed', () => {
    expect(moveItem(abc, 'b', -1)).toEqual([
      { id: 'b', position: 0 },
      { id: 'a', position: 1 },
    ]);
  });

  it('moves an item down', () => {
    expect(moveItem(abc, 'b', 1)).toEqual([
      { id: 'c', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });

  it('does nothing at the top or bottom edge', () => {
    expect(moveItem(abc, 'a', -1)).toEqual([]);
    expect(moveItem(abc, 'c', 1)).toEqual([]);
  });

  it('does nothing for an unknown id', () => {
    expect(moveItem(abc, 'z', 1)).toEqual([]);
  });

  it('orders by position, not by array order', () => {
    const shuffled = [abc[2], abc[0], abc[1]];
    expect(moveItem(shuffled, 'c', -1)).toEqual([
      { id: 'c', position: 1 },
      { id: 'b', position: 2 },
    ]);
  });
});

describe('renumber', () => {
  it('closes gaps left by a removal', () => {
    expect(
      renumber([
        { id: 'a', position: 0 },
        { id: 'b', position: 2 },
        { id: 'c', position: 5 },
      ]),
    ).toEqual([
      { id: 'b', position: 1 },
      { id: 'c', position: 2 },
    ]);
  });

  it('returns nothing when positions are already contiguous', () => {
    expect(renumber(abc)).toEqual([]);
  });
});
```

`src/features/plan/workoutsRepo.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { makeExercise, resetDb } from '../../test/fixtures';
import {
  addWorkoutItem,
  createWorkout,
  deleteWorkout,
  duplicateWorkout,
  listWorkoutItems,
  moveWorkoutItem,
  removeWorkoutItem,
  renameWorkout,
} from './workoutsRepo';

beforeEach(resetDb);

async function pushDay() {
  const workout = await createWorkout('Push');
  const bench = await makeExercise('Bench');
  const ohp = await makeExercise('Overhead Press');
  const dips = await makeExercise('Dips');
  for (const e of [bench, ohp, dips]) await addWorkoutItem(workout.id, e);
  return { workout, bench, ohp, dips };
}

describe('workoutsRepo', () => {
  it('names an unnamed workout', async () => {
    expect((await createWorkout('  ')).name).toBe('New workout');
  });

  it('renames a workout', async () => {
    const w = await createWorkout('Push');
    await renameWorkout(w.id, 'Push A');
    expect((await db.workout_templates.get(w.id))?.name).toBe('Push A');
  });

  it('adds items at the end with the exercise defaults as targets', async () => {
    const { workout, bench } = await pushDay();
    const items = await listWorkoutItems(workout.id);
    expect(items.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(items[0].exercise_id).toBe(bench.id);
    expect(items[0].target_sets).toBe(3);
    expect(items[0].target_reps).toBe(5);
    expect(items[0].target_weight_kg).toBe(100);
  });

  it('moves an item', async () => {
    const { workout, ohp } = await pushDay();
    const before = await listWorkoutItems(workout.id);
    await moveWorkoutItem(workout.id, before[1].id, -1);
    expect((await listWorkoutItems(workout.id))[0].exercise_id).toBe(ohp.id);
  });

  it('removes an item and closes the gap', async () => {
    const { workout, dips } = await pushDay();
    const before = await listWorkoutItems(workout.id);
    await removeWorkoutItem(workout.id, before[1].id);
    const after = await listWorkoutItems(workout.id);
    expect(after.map((i) => i.position)).toEqual([0, 1]);
    expect(after[1].exercise_id).toBe(dips.id);
  });

  it('duplicates a workout with its items, leaving the original alone', async () => {
    const { workout, bench } = await pushDay();
    const copy = await duplicateWorkout(workout.id);
    expect(copy.name).toBe('Push (copy)');
    const copied = await listWorkoutItems(copy.id);
    expect(copied).toHaveLength(3);
    expect(copied[0].exercise_id).toBe(bench.id);
    expect(await listWorkoutItems(workout.id)).toHaveLength(3);
  });

  it('soft-deletes a workout together with its items', async () => {
    const { workout } = await pushDay();
    await deleteWorkout(workout.id);
    expect((await db.workout_templates.get(workout.id))?._deleted).toBe(1);
    expect(await listWorkoutItems(workout.id)).toEqual([]);
    expect(await db.workout_template_items.count()).toBe(3);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/features/plan/reorder.test.ts src/features/plan/workoutsRepo.test.ts`
Expected: FAIL — modules `./reorder` and `./workoutsRepo` do not exist.

- [ ] **Step 3: Implement the reorder rules**

`src/features/plan/reorder.ts` (new file):

```ts
export interface Positioned {
  id: string;
  position: number;
}

/** Contiguous positions 0..n-1 in the given order; returns only the rows that changed. */
export function renumber(ordered: Positioned[]): Positioned[] {
  return ordered
    .map((item, index) => ({ id: item.id, position: index, was: item.position }))
    .filter((p) => p.position !== p.was)
    .map(({ id, position }) => ({ id, position }));
}

/** Swaps an item with its neighbour above (-1) or below (+1). Returns only changed rows. */
export function moveItem(items: Positioned[], id: string, delta: -1 | 1): Positioned[] {
  const ordered = [...items].sort((a, b) => a.position - b.position);
  const from = ordered.findIndex((i) => i.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ordered.length) return [];
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return renumber(ordered);
}
```

- [ ] **Step 4: Implement the repository**

`src/features/plan/workoutsRepo.ts` (new file):

```ts
import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import type { Exercise, Local, UUID, WorkoutTemplate, WorkoutTemplateItem } from '../../types/domain';
import { moveItem, renumber } from './reorder';

export type WorkoutItemTargets = Partial<
  Pick<
    WorkoutTemplateItem,
    | 'target_sets'
    | 'target_reps'
    | 'target_weight_kg'
    | 'target_duration_s'
    | 'target_distance_km'
    | 'target_rpe'
    | 'rest_seconds'
    | 'notes'
  >
>;

/** A workout's live items in order. */
export async function listWorkoutItems(templateId: UUID): Promise<Local<WorkoutTemplateItem>[]> {
  const rows = await db.workout_template_items.where('template_id').equals(templateId).toArray();
  return rows.filter((r) => r._deleted === 0).sort((a, b) => a.position - b.position);
}

export async function createWorkout(name: string): Promise<Local<WorkoutTemplate>> {
  return insertRow<WorkoutTemplate>('workout_templates', { name: name.trim() || 'New workout', notes: null });
}

export async function renameWorkout(id: UUID, name: string): Promise<void> {
  await updateRow<WorkoutTemplate>('workout_templates', id, { name: name.trim() || 'Untitled workout' });
}

export async function deleteWorkout(id: UUID): Promise<void> {
  await db.transaction('rw', [db.workout_templates, db.workout_template_items], async () => {
    for (const item of await listWorkoutItems(id)) await softDeleteRow('workout_template_items', item.id);
    await softDeleteRow('workout_templates', id);
  });
}

export async function duplicateWorkout(id: UUID): Promise<Local<WorkoutTemplate>> {
  return db.transaction('rw', [db.workout_templates, db.workout_template_items], async () => {
    const source = await db.workout_templates.get(id);
    if (!source) throw new Error(`workout_templates: no row with id ${id}`);
    const copy = await insertRow<WorkoutTemplate>('workout_templates', {
      name: `${source.name} (copy)`,
      notes: source.notes,
    });
    for (const item of await listWorkoutItems(id)) {
      await insertRow<WorkoutTemplateItem>('workout_template_items', {
        template_id: copy.id,
        exercise_id: item.exercise_id,
        position: item.position,
        target_sets: item.target_sets,
        target_reps: item.target_reps,
        target_weight_kg: item.target_weight_kg,
        target_duration_s: item.target_duration_s,
        target_distance_km: item.target_distance_km,
        target_rpe: item.target_rpe,
        rest_seconds: item.rest_seconds,
        notes: item.notes,
      });
    }
    return copy;
  });
}

/** Appends an exercise, taking its defaults as the targets. */
export async function addWorkoutItem(templateId: UUID, exercise: Exercise): Promise<Local<WorkoutTemplateItem>> {
  return db.transaction('rw', db.workout_template_items, async () => {
    const items = await listWorkoutItems(templateId);
    const position = items.length > 0 ? items[items.length - 1].position + 1 : 0;
    return insertRow<WorkoutTemplateItem>('workout_template_items', {
      template_id: templateId,
      exercise_id: exercise.id,
      position,
      target_sets: exercise.default_sets,
      target_reps: exercise.default_reps,
      target_weight_kg: exercise.default_weight_kg,
      target_duration_s: exercise.default_duration_s,
      target_distance_km: exercise.default_distance_km,
      target_rpe: null,
      rest_seconds: null,
      notes: null,
    });
  });
}

export async function updateWorkoutItem(id: UUID, patch: WorkoutItemTargets): Promise<void> {
  await updateRow<WorkoutTemplateItem>('workout_template_items', id, patch);
}

export async function removeWorkoutItem(templateId: UUID, id: UUID): Promise<void> {
  await db.transaction('rw', db.workout_template_items, async () => {
    await softDeleteRow('workout_template_items', id);
    for (const change of renumber(await listWorkoutItems(templateId))) {
      await updateRow<WorkoutTemplateItem>('workout_template_items', change.id, { position: change.position });
    }
  });
}

export async function moveWorkoutItem(templateId: UUID, id: UUID, delta: -1 | 1): Promise<void> {
  await db.transaction('rw', db.workout_template_items, async () => {
    for (const change of moveItem(await listWorkoutItems(templateId), id, delta)) {
      await updateRow<WorkoutTemplateItem>('workout_template_items', change.id, { position: change.position });
    }
  });
}
```

- [ ] **Step 5: Add a workout fixture**

`src/test/fixtures.ts` (replace the whole file):

```ts
import { db } from '../db/schema';
import { createExercise } from '../features/library/exercisesRepo';
import { addWorkoutItem, createWorkout } from '../features/plan/workoutsRepo';
import type { BaseRow, Exercise, Local, LocalMeta, Modality, WorkoutTemplate } from '../types/domain';

export const USER = 'user-1';

export async function resetDb(): Promise<void> {
  await db.delete();
  await db.open();
}

/** Records a completed sync, which first-time setup waits for. */
export async function markSynced(): Promise<void> {
  await db.sync_meta.put({
    table: 'exercises',
    watermark: null,
    last_synced_at: '2026-10-01T06:00:00.000Z',
    last_error: null,
  });
}

export async function makeExercise(name: string, modality: Modality = 'strength'): Promise<Local<Exercise>> {
  const cardio = modality === 'cardio';
  return createExercise({
    name,
    muscle_group: cardio ? 'cardio' : 'legs',
    modality,
    run_type: cardio ? 'easy' : null,
    default_sets: cardio ? null : 3,
    default_reps: cardio ? null : 5,
    default_weight_kg: cardio ? null : 100,
    default_duration_s: cardio ? 1800 : null,
    default_distance_km: cardio ? 5 : null,
  });
}

export async function makeWorkout(name: string, exercises: Exercise[]): Promise<Local<WorkoutTemplate>> {
  const workout = await createWorkout(name);
  for (const e of exercises) await addWorkoutItem(workout.id, e);
  return workout;
}

/** The columns every row carries, for building rows in pure tests. */
export function base(id: string, extra: Partial<BaseRow> = {}): BaseRow & LocalMeta {
  return {
    id,
    user_id: null,
    created_at: '2026-10-01T06:00:00.000Z',
    updated_at: '2026-10-01T06:00:00.000Z',
    server_updated_at: null,
    deleted_at: null,
    _dirty: 0,
    _deleted: extra.deleted_at ? 1 : 0,
    ...extra,
  };
}
```

- [ ] **Step 6: Run them**

Run: `npx vitest run src/features/plan/reorder.test.ts src/features/plan/workoutsRepo.test.ts`
Expected: PASS, 14 tests

Run: `npx tsc -b` — clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/plan/reorder.ts src/features/plan/reorder.test.ts src/features/plan/workoutsRepo.ts src/features/plan/workoutsRepo.test.ts src/test/fixtures.ts
git commit -m "feat: workout repository with duplicate and reorder"
```

---

## Task 13: Workout screens

**Files:**
- Create: `src/features/plan/WorkoutsScreen.tsx`, `src/features/plan/WorkoutEditor.tsx`
- Modify: `src/app/Screen.tsx`

- [ ] **Step 1: The workout list**

`src/features/plan/WorkoutsScreen.tsx` (new file):

```tsx
import { useState } from 'react';
import { navigate } from '../../app/useRoute';
import Button from '../../components/Button';
import { TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import PickList from '../../components/PickList';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { createWorkout } from './workoutsRepo';

export default function WorkoutsScreen() {
  const [name, setName] = useState('');
  const rows = useLiveQuery(async () => {
    const templates = await db.workout_templates.where('_deleted').equals(0).toArray();
    const items = await db.workout_template_items.where('_deleted').equals(0).toArray();
    return templates
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ template: t, count: items.filter((i) => i.template_id === t.id).length }));
  }, []);

  async function create() {
    const workout = await createWorkout(name);
    setName('');
    navigate({ name: 'workout', id: workout.id });
  }

  if (!rows) return <Loading />;

  return (
    <section>
      <ScreenHeader title="Workouts" back={{ name: 'plan' }} />
      <form
        className="mb-4 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="flex-1">
          <TextField label="New workout" placeholder="e.g. Push A" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" variant="primary">
          Create
        </Button>
      </form>
      <PickList
        items={rows.map(({ template, count }) => ({
          id: template.id,
          label: template.name,
          detail: `${count} ${count === 1 ? 'exercise' : 'exercises'}`,
        }))}
        onPick={(id) => navigate({ name: 'workout', id })}
        empty="No workouts yet. Create one above."
      />
    </section>
  );
}
```

- [ ] **Step 2: The workout editor**

`src/features/plan/WorkoutEditor.tsx` (new file):

```tsx
import { useState } from 'react';
import { navigate } from '../../app/useRoute';
import Button, { IconButton } from '../../components/Button';
import { NumberField, TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import type { Exercise, Local, UUID, WorkoutTemplateItem } from '../../types/domain';
import ExercisePicker from '../library/ExercisePicker';
import {
  addWorkoutItem,
  deleteWorkout,
  duplicateWorkout,
  listWorkoutItems,
  moveWorkoutItem,
  removeWorkoutItem,
  renameWorkout,
  updateWorkoutItem,
  type WorkoutItemTargets,
} from './workoutsRepo';

export default function WorkoutEditor({ id }: { id: UUID }) {
  const [picking, setPicking] = useState(false);
  const data = useLiveQuery(async () => {
    const template = await db.workout_templates.get(id);
    if (!template || template._deleted === 1) return null;
    const items = await listWorkoutItems(id);
    const exercises = await db.exercises.toArray();
    return { template, items, exerciseById: new Map(exercises.map((e) => [e.id, e])) };
  }, [id]);

  if (data === undefined) return <Loading />;
  if (data === null) return <NotFound what="workout" back={{ name: 'workouts' }} />;
  const { template, items, exerciseById } = data;

  return (
    <section>
      <ScreenHeader title={template.name} back={{ name: 'workouts' }} />
      <div className="mb-4">
        <TextField
          label="Name"
          defaultValue={template.name}
          onBlur={(e) => {
            if (e.target.value.trim() !== template.name) void renameWorkout(id, e.target.value);
          }}
        />
      </div>

      <ol className="mb-4 space-y-3">
        {items.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            exercise={exerciseById.get(item.exercise_id)}
            first={index === 0}
            last={index === items.length - 1}
          />
        ))}
      </ol>
      {items.length === 0 && <p className="mb-4 text-muted">No exercises yet.</p>}

      {picking ? (
        <ExercisePicker
          onCancel={() => setPicking(false)}
          onPick={async (exercise) => {
            await addWorkoutItem(id, exercise);
            setPicking(false);
          }}
        />
      ) : (
        <Button block onClick={() => setPicking(true)}>
          + Add exercise
        </Button>
      )}

      <div className="mt-8 grid grid-cols-2 gap-2">
        <Button
          onClick={async () => {
            const copy = await duplicateWorkout(id);
            navigate({ name: 'workout', id: copy.id });
          }}
        >
          Duplicate
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (!window.confirm(`Delete ${template.name}? Days already planned keep their exercises.`)) return;
            await deleteWorkout(id);
            navigate({ name: 'workouts' });
          }}
        >
          Delete
        </Button>
      </div>
    </section>
  );
}

function ItemRow({
  item,
  exercise,
  first,
  last,
}: {
  item: Local<WorkoutTemplateItem>;
  exercise: Exercise | undefined;
  first: boolean;
  last: boolean;
}) {
  const cardio = exercise?.modality === 'cardio';
  const name = exercise ? `${exercise.name}${exercise.deleted_at ? ' (deleted)' : ''}` : 'Unknown exercise';

  /** Writes only values a target can hold; a half-typed "abc" is ignored rather than stored. */
  const update = (patch: WorkoutItemTargets) => {
    const ok = Object.values(patch).every((v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0));
    if (ok) void updateWorkoutItem(item.id, patch);
  };

  return (
    <li className="space-y-3 rounded-2xl border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 font-medium">{name}</span>
        <IconButton label={`Move ${name} up`} disabled={first} onClick={() => void moveWorkoutItem(item.template_id, item.id, -1)}>
          ↑
        </IconButton>
        <IconButton label={`Move ${name} down`} disabled={last} onClick={() => void moveWorkoutItem(item.template_id, item.id, 1)}>
          ↓
        </IconButton>
        <IconButton
          label={`Remove ${name}`}
          onClick={() => {
            if (window.confirm(`Remove ${name} from this workout?`)) void removeWorkoutItem(item.template_id, item.id);
          }}
        >
          ✕
        </IconButton>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {cardio ? (
          <>
            <NumberField label="km" value={item.target_distance_km} onChange={(v) => update({ target_distance_km: v })} />
            <NumberField
              label="min"
              value={item.target_duration_s === null ? null : item.target_duration_s / 60}
              onChange={(v) => update({ target_duration_s: v === null ? null : Math.round(v * 60) })}
            />
          </>
        ) : (
          <>
            <NumberField label="Sets" value={item.target_sets} onChange={(v) => update({ target_sets: v })} />
            <NumberField label="Reps" value={item.target_reps} onChange={(v) => update({ target_reps: v })} />
            <NumberField label="kg" value={item.target_weight_kg} onChange={(v) => update({ target_weight_kg: v })} />
          </>
        )}
        <NumberField
          label="Rest s"
          value={item.rest_seconds}
          onChange={(v) => update({ rest_seconds: v === null ? null : Math.round(v) })}
        />
      </div>
    </li>
  );
}
```

- [ ] **Step 3: Route to the workout screens**

`src/app/Screen.tsx` (replace the whole file):

```tsx
import ComingSoon from '../components/ComingSoon';
import ExerciseForm from '../features/library/ExerciseForm';
import LibraryScreen from '../features/library/LibraryScreen';
import WorkoutEditor from '../features/plan/WorkoutEditor';
import WorkoutsScreen from '../features/plan/WorkoutsScreen';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'workouts':
      return <WorkoutsScreen />;
    case 'workout':
      return <WorkoutEditor key={route.id} id={route.id} />;
    case 'library':
      return <LibraryScreen />;
    case 'exercise':
      return <ExerciseForm key={route.id} id={route.id} />;
    case 'progress':
      return <ProgressScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <ComingSoon title={route.name} />;
  }
}
```

- [ ] **Step 4: Verify, run, commit**

Run: `npx tsc -b` — clean.

Run the app and open `#/workouts`. **What to check:** create "Push A"; add Bench Press, Overhead Press and Dips; the targets show each exercise's defaults; ↑/↓ reorder instantly; editing reps persists after a reload; ✕ asks first; Duplicate makes "Push A (copy)" with the same exercises; Delete asks and returns to the list.

```bash
git add src/features/plan/WorkoutsScreen.tsx src/features/plan/WorkoutEditor.tsx src/app/Screen.tsx
git commit -m "feat: workout list and editor"
```

---

## Task 14: Materializing the plan into dated sessions

This is the heart of the phase. Read "Two design decisions" at the top of this plan first.

**Files:**
- Create: `src/features/plan/materialize.ts`, `src/features/plan/materialize.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/plan/materialize.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { insertRow, softDeleteRow } from '../../db/repo';
import { isSystemTimestamp } from '../../lib/time';
import { USER, base, makeExercise, makeWorkout, markSynced, resetDb } from '../../test/fixtures';
import type { Local, Session, SetEntry, WeekPlan, WorkoutTemplate } from '../../types/domain';
import {
  decide,
  desiredFor,
  desiredSignature,
  materializeWeek,
  plannedSessionId,
  sessionKindFor,
  type DesiredSession,
} from './materialize';
import { defaultPlanDayId, ensureWeekPlan, setDayTemplate } from './planRepo';
import { listWorkoutItems, updateWorkoutItem } from './workoutsRepo';

const MON = '2026-10-05';
const WED = '2026-10-07';
const PREV_MON = '2026-09-28';

// ---------------------------------------------------------------- pure rules

describe('sessionKindFor', () => {
  it('is strength, run or mixed', () => {
    expect(sessionKindFor(['strength', 'strength'])).toBe('strength');
    expect(sessionKindFor(['cardio'])).toBe('run');
    expect(sessionKindFor(['strength', 'cardio'])).toBe('mixed');
    expect(sessionKindFor([])).toBe('strength');
  });
});

describe('desiredFor', () => {
  const plan: WeekPlan = { ...base('p'), name: 'Plan', active_from: MON };
  const days = [{ ...base('d1'), week_plan_id: 'p', weekday: 1 as const, template_id: 't1' }];
  const templates: WorkoutTemplate[] = [{ ...base('t1'), name: 'Legs', notes: null }];
  const items = [
    {
      ...base('i1'),
      template_id: 't1',
      exercise_id: 'e1',
      position: 0,
      target_sets: 3,
      target_reps: 5,
      target_weight_kg: 100,
      target_duration_s: null,
      target_distance_km: null,
      target_rpe: null,
      rest_seconds: null,
      notes: null,
    },
  ];
  const exercises = [
    {
      ...base('e1'),
      name: 'Squat',
      muscle_group: 'legs',
      modality: 'strength' as const,
      run_type: null,
      default_sets: 3,
      default_reps: 5,
      default_weight_kg: 100,
      default_duration_s: null,
      default_distance_km: null,
      sort_order: 1,
    },
  ];

  it('describes the workout planned for a weekday', () => {
    const d = desiredFor(MON, plan, days, templates, items, exercises);
    expect(d?.templateId).toBe('t1');
    expect(d?.kind).toBe('strength');
    expect(d?.items).toEqual([
      { itemId: 'i1', exerciseId: 'e1', position: 0, targetSets: 3, targetReps: 5, targetWeightKg: 100 },
    ]);
  });

  it('is null on a rest day', () => {
    expect(desiredFor(WED, plan, days, templates, items, exercises)).toBeNull();
  });

  it('is null before the plan starts', () => {
    expect(desiredFor(PREV_MON, plan, days, templates, items, exercises)).toBeNull();
  });

  it('is null when the assigned workout was deleted', () => {
    const gone = [{ ...templates[0], deleted_at: '2026-10-01T00:00:00.000Z' }];
    expect(desiredFor(MON, plan, days, gone, items, exercises)).toBeNull();
  });
});

describe('decide', () => {
  const desired: DesiredSession = {
    templateId: 't1',
    kind: 'strength',
    items: [{ itemId: 'i1', exerciseId: 'e1', position: 0, targetSets: 3, targetReps: 5, targetWeightKg: 100 }],
  };
  const SYSTEM = '1976-10-01T00:00:00.000Z';
  const REAL = '2026-10-01T00:00:00.000Z';
  function session(extra: Partial<Session> = {}): Session {
    return {
      ...base('s', { updated_at: SYSTEM }),
      date: WED,
      kind: 'strength',
      status: 'planned',
      template_id: 't1',
      was_planned: true,
      energy: null,
      notes: null,
      started_at: null,
      completed_at: null,
      ...extra,
    };
  }
  const args = (extra: Partial<Parameters<typeof decide>[0]>) => ({
    existing: session(),
    existingSignature: desiredSignature(desired),
    desired,
    date: WED,
    today: MON,
    hasLoggedWork: false,
    ...extra,
  });

  it('inserts a missing training day and leaves a missing rest day alone', () => {
    expect(decide(args({ existing: undefined }))).toBe('insert');
    expect(decide(args({ existing: undefined, desired: null }))).toBe('leave');
  });

  it('leaves an untouched row that already matches', () => {
    expect(decide(args({}))).toBe('leave');
  });

  it('rewrites an untouched future row when the workout changes', () => {
    expect(decide(args({ existing: session({ template_id: 't2' }) }))).toBe('rewrite');
  });

  it('rewrites an untouched future row when the workout was edited', () => {
    expect(decide(args({ existingSignature: 'something else' }))).toBe('rewrite');
  });

  it('removes an untouched future row when the day becomes rest', () => {
    expect(decide(args({ desired: null }))).toBe('remove');
  });

  it('revives a row the system removed when the day is planned again', () => {
    const tombstone = session({ deleted_at: SYSTEM });
    expect(decide(args({ existing: tombstone }))).toBe('revive');
    expect(decide(args({ existing: tombstone, desired: null }))).toBe('leave');
  });

  it('never touches a row the user edited, finished or logged into', () => {
    expect(decide(args({ existing: session({ template_id: 't2', updated_at: REAL }) }))).toBe('leave');
    expect(decide(args({ existing: session({ template_id: 't2', status: 'done' }) }))).toBe('leave');
    expect(decide(args({ existing: session({ template_id: 't2' }), hasLoggedWork: true }))).toBe('leave');
  });

  it('never recreates a row the user removed', () => {
    expect(decide(args({ existing: session({ deleted_at: REAL, updated_at: REAL }) }))).toBe('leave');
  });

  it('never rewrites the past', () => {
    expect(decide(args({ existing: session({ template_id: 't2' }), today: '2026-10-08' }))).toBe('leave');
  });
});

// ---------------------------------------------------------------- against the database

async function setup() {
  await markSynced();
  const squat = await makeExercise('Squat');
  const bench = await makeExercise('Bench');
  const run = await makeExercise('Easy Run', 'cardio');
  const legs = await makeWorkout('Legs', [squat]);
  const push = await makeWorkout('Push', [bench]);
  const easy = await makeWorkout('Easy run', [run]);
  const mixed = await makeWorkout('Brick', [squat, run]);
  await ensureWeekPlan(USER, MON);
  await setDayTemplate(defaultPlanDayId(USER, 1), legs.id);
  return { squat, bench, legs, push, easy, mixed };
}

async function week(start = MON) {
  const rows = await db.sessions.where('date').between(start, '2026-10-11', true, true).toArray();
  return rows.filter((s) => s._deleted === 0);
}

async function childrenOf(sessionId: string) {
  return (await db.session_exercises.where('session_id').equals(sessionId).toArray()).filter((c) => c._deleted === 0);
}

beforeEach(resetDb);

describe('materializeWeek', () => {
  it('does nothing before a plan exists', async () => {
    expect(await materializeWeek(USER, MON, MON)).toBe(0);
    expect(await db.sessions.count()).toBe(0);
  });

  it('creates a planned session on each training day and nothing on rest days', async () => {
    const { legs, squat } = await setup();
    await materializeWeek(USER, MON, MON);

    const sessions = await week();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ date: MON, status: 'planned', template_id: legs.id, was_planned: true, kind: 'strength' });
    const children = await childrenOf(sessions[0].id);
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ exercise_id: squat.id, target_sets: 3, target_reps: 5, target_weight_kg: 100 });
  });

  it('gives every device the same id for a date, and stamps rows as system writes', async () => {
    await setup();
    await materializeWeek(USER, MON, MON);
    const [s] = await week();
    expect(s.id).toBe(plannedSessionId(USER, MON));
    expect(isSystemTimestamp(s.updated_at)).toBe(true);
    expect(isSystemTimestamp((await childrenOf(s.id))[0].updated_at)).toBe(true);
  });

  it('is idempotent', async () => {
    await setup();
    await materializeWeek(USER, MON, MON);
    const [before] = await week();
    expect(await materializeWeek(USER, MON, MON)).toBe(0);
    const [after] = await week();
    expect(after.updated_at).toBe(before.updated_at);
    expect(await db.sessions.count()).toBe(1);
  });

  it('is safe under concurrent calls', async () => {
    await setup();
    await Promise.all([materializeWeek(USER, MON, MON), materializeWeek(USER, MON, MON)]);
    expect(await db.sessions.count()).toBe(1);
    expect(await db.session_exercises.count()).toBe(1);
  });

  it('never recreates a session the user removed', async () => {
    await setup();
    await materializeWeek(USER, MON, MON);
    await softDeleteRow('sessions', plannedSessionId(USER, MON));
    await materializeWeek(USER, MON, MON);
    expect(await week()).toHaveLength(0);
  });

  it("rewrites an untouched future session when the day's workout changes", async () => {
    const { push, legs, squat } = await setup();
    await setDayTemplate(defaultPlanDayId(USER, 3), push.id);
    await materializeWeek(USER, MON, MON);
    await setDayTemplate(defaultPlanDayId(USER, 3), legs.id);
    await materializeWeek(USER, MON, MON);

    const wed = await db.sessions.get(plannedSessionId(USER, WED));
    expect(wed?.template_id).toBe(legs.id);
    expect((await childrenOf(wed!.id)).map((c) => c.exercise_id)).toEqual([squat.id]);
  });

  it('removes an untouched future session when the day becomes rest, and revives it when set back', async () => {
    const { push } = await setup();
    await setDayTemplate(defaultPlanDayId(USER, 3), push.id);
    await materializeWeek(USER, MON, MON);

    await setDayTemplate(defaultPlanDayId(USER, 3), null);
    await materializeWeek(USER, MON, MON);
    expect((await db.sessions.get(plannedSessionId(USER, WED)))?._deleted).toBe(1);

    await setDayTemplate(defaultPlanDayId(USER, 3), push.id);
    await materializeWeek(USER, MON, MON);
    const wed = await db.sessions.get(plannedSessionId(USER, WED));
    expect(wed?._deleted).toBe(0);
    expect(await childrenOf(wed!.id)).toHaveLength(1);
  });

  it('leaves past days as they were planned', async () => {
    const { legs, push } = await setup();
    await materializeWeek(USER, MON, MON);
    await setDayTemplate(defaultPlanDayId(USER, 1), push.id);
    await materializeWeek(USER, MON, WED);
    expect((await db.sessions.get(plannedSessionId(USER, MON)))?.template_id).toBe(legs.id);
  });

  it('leaves a session alone once work is logged into it', async () => {
    const { push, legs } = await setup();
    await setDayTemplate(defaultPlanDayId(USER, 3), push.id);
    await materializeWeek(USER, MON, MON);
    const [child] = await childrenOf(plannedSessionId(USER, WED));
    await insertRow<SetEntry>('set_entries', {
      session_exercise_id: child.id,
      set_index: 0,
      reps: 5,
      weight_kg: 80,
      rpe: 8,
      is_warmup: false,
      notes: null,
    });

    await setDayTemplate(defaultPlanDayId(USER, 3), legs.id);
    await materializeWeek(USER, MON, MON);
    expect((await db.sessions.get(plannedSessionId(USER, WED)))?.template_id).toBe(push.id);
  });

  it('carries workout edits into untouched future sessions', async () => {
    const { push } = await setup();
    await setDayTemplate(defaultPlanDayId(USER, 3), push.id);
    await materializeWeek(USER, MON, MON);
    const [item] = await listWorkoutItems(push.id);
    await updateWorkoutItem(item.id, { target_reps: 12 });
    await materializeWeek(USER, MON, MON);
    const [child] = await childrenOf(plannedSessionId(USER, WED));
    expect(child.target_reps).toBe(12);
  });

  it('derives the session kind from the workout', async () => {
    const { easy, mixed } = await setup();
    await setDayTemplate(defaultPlanDayId(USER, 2), easy.id);
    await setDayTemplate(defaultPlanDayId(USER, 4), mixed.id);
    await materializeWeek(USER, MON, MON);
    expect((await db.sessions.get(plannedSessionId(USER, '2026-10-06')))?.kind).toBe('run');
    expect((await db.sessions.get(plannedSessionId(USER, '2026-10-08')))?.kind).toBe('mixed');
  });

  it("skips dates before the plan's start", async () => {
    await setup();
    await materializeWeek(USER, PREV_MON, MON);
    expect(await db.sessions.count()).toBe(0);
  });

  it('leaves unplanned sessions on the same day alone', async () => {
    await setup();
    const extra = await insertRow<Session>('sessions', {
      date: MON,
      kind: 'run',
      status: 'done',
      template_id: null,
      was_planned: false,
      energy: null,
      notes: null,
      started_at: null,
      completed_at: null,
    });
    await materializeWeek(USER, MON, MON);
    const sessions: Local<Session>[] = await week();
    expect(sessions.map((s) => s.id).sort()).toEqual([extra.id, plannedSessionId(USER, MON)].sort());
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/features/plan/materialize.test.ts`
Expected: FAIL — module `./materialize` does not exist.

- [ ] **Step 3: Implement**

`src/features/plan/materialize.ts` (new file):

```ts
import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import { addDays, eachDateInRange, isSystemTimestamp, weekdayIndex } from '../../lib/time';
import { deterministicId } from '../../lib/uuidv5';
import type {
  Exercise,
  ISODate,
  Local,
  Modality,
  Session,
  SessionExercise,
  SessionKind,
  UUID,
  WeekPlan,
  WeekPlanDay,
  WorkoutTemplate,
  WorkoutTemplateItem,
} from '../../types/domain';
import { pickActivePlan } from './planRepo';

export interface DesiredItem {
  itemId: UUID;
  exerciseId: UUID;
  position: number;
  targetSets: number | null;
  targetReps: number | null;
  targetWeightKg: number | null;
}

/** What the plan says should happen on a date. */
export interface DesiredSession {
  templateId: UUID;
  kind: SessionKind;
  items: DesiredItem[];
}

export type Decision = 'insert' | 'revive' | 'rewrite' | 'remove' | 'leave';

export function sessionKindFor(modalities: Modality[]): SessionKind {
  const cardio = modalities.includes('cardio');
  const strength = modalities.includes('strength');
  if (cardio && strength) return 'mixed';
  return cardio ? 'run' : 'strength';
}

/** The workout the plan assigns to a date, or null for a rest day. */
export function desiredFor(
  date: ISODate,
  plan: WeekPlan | undefined,
  days: WeekPlanDay[],
  templates: WorkoutTemplate[],
  items: WorkoutTemplateItem[],
  exercises: Exercise[],
): DesiredSession | null {
  if (!plan || date < plan.active_from) return null;
  const weekday = weekdayIndex(date);
  const day = days.find((d) => d.week_plan_id === plan.id && d.weekday === weekday && d.deleted_at === null);
  if (!day?.template_id) return null;
  const template = templates.find((t) => t.id === day.template_id && t.deleted_at === null);
  if (!template) return null;

  const ordered = items
    .filter((i) => i.template_id === template.id && i.deleted_at === null)
    .sort((a, b) => a.position - b.position);
  const modalityOf = (exerciseId: UUID): Modality => exercises.find((e) => e.id === exerciseId)?.modality ?? 'strength';

  return {
    templateId: template.id,
    kind: sessionKindFor(ordered.map((i) => modalityOf(i.exercise_id))),
    items: ordered.map((i) => ({
      itemId: i.id,
      exerciseId: i.exercise_id,
      position: i.position,
      targetSets: i.target_sets,
      targetReps: i.target_reps,
      targetWeightKg: i.target_weight_kg,
    })),
  };
}

/** A comparable fingerprint of what a session should contain. */
export function desiredSignature(desired: DesiredSession | null): string {
  if (!desired) return '';
  return desired.items
    .map((i) => [i.exerciseId, i.position, i.targetSets, i.targetReps, i.targetWeightKg].join('|'))
    .join(';');
}

/** The same fingerprint, read from a session's existing exercises. */
export function childrenSignature(children: SessionExercise[]): string {
  return children
    .filter((c) => c.deleted_at === null)
    .sort((a, b) => a.position - b.position)
    .map((c) => [c.exercise_id, c.position, c.target_sets, c.target_reps, c.target_weight_kg].join('|'))
    .join(';');
}

/**
 * What to do with one date's materialized session.
 *
 * A row is the user's — and is never touched again — once it carries a real
 * timestamp (any edit, start or removal), leaves 'planned', or has work logged
 * in it. Past dates are never rewritten either, so history stays as planned.
 * Everything else is the app's to keep in step with the template.
 */
export function decide(args: {
  existing: Session | undefined;
  existingSignature: string;
  desired: DesiredSession | null;
  date: ISODate;
  today: ISODate;
  hasLoggedWork: boolean;
}): Decision {
  const { existing, desired } = args;
  if (!existing) return desired ? 'insert' : 'leave';

  const ownedByUser =
    !isSystemTimestamp(existing.updated_at) || existing.status !== 'planned' || args.hasLoggedWork;
  if (ownedByUser || args.date < args.today) return 'leave';

  if (existing.deleted_at !== null) return desired ? 'revive' : 'leave';
  if (!desired) return 'remove';

  const unchanged =
    existing.template_id === desired.templateId && args.existingSignature === desiredSignature(desired);
  return unchanged ? 'leave' : 'rewrite';
}

export function plannedSessionId(userId: string, date: ISODate): UUID {
  return deterministicId(`${userId}:planned:${date}`);
}

export function plannedChildId(sessionId: UUID, itemId: UUID): UUID {
  return deterministicId(`${sessionId}:${itemId}`);
}

/**
 * Brings one Monday-to-Sunday week of planned sessions in line with the plan.
 * Returns how many dates changed. Safe to call on every screen open: it is
 * idempotent, and concurrent calls serialise on the read-write transaction.
 */
export async function materializeWeek(userId: string, weekStart: ISODate, todayDate: ISODate): Promise<number> {
  const dates = eachDateInRange(weekStart, addDays(weekStart, 6));

  return db.transaction(
    'rw',
    [
      db.week_plans,
      db.week_plan_days,
      db.workout_templates,
      db.workout_template_items,
      db.exercises,
      db.sessions,
      db.session_exercises,
      db.set_entries,
      db.runs,
    ],
    async () => {
      const plans = await db.week_plans.where('_deleted').equals(0).toArray();
      if (plans.length === 0) return 0;
      const days = await db.week_plan_days.toArray();
      const templates = await db.workout_templates.toArray();
      const items = await db.workout_template_items.toArray();
      const exercises = await db.exercises.toArray();

      let changed = 0;
      for (const date of dates) {
        const desired = desiredFor(date, pickActivePlan(plans, date), days, templates, items, exercises);
        const id = plannedSessionId(userId, date);
        const existing = await db.sessions.get(id);
        const children = existing ? await db.session_exercises.where('session_id').equals(id).toArray() : [];

        const decision = decide({
          existing,
          existingSignature: childrenSignature(children),
          desired,
          date,
          today: todayDate,
          hasLoggedWork: existing ? await hasLoggedWork(id, children) : false,
        });
        if (decision === 'leave') continue;
        changed++;

        if (decision === 'remove') {
          for (const c of children) {
            if (c._deleted === 0) await softDeleteRow('session_exercises', c.id, { system: true });
          }
          await softDeleteRow('sessions', id, { system: true });
          continue;
        }
        if (!desired) continue;

        const fields = { kind: desired.kind, template_id: desired.templateId, status: 'planned' as const };
        if (decision === 'insert') {
          await insertRow<Session>(
            'sessions',
            { date, ...fields, was_planned: true, energy: null, notes: null, started_at: null, completed_at: null },
            { id, system: true },
          );
        } else {
          await updateRow<Session>('sessions', id, fields, { system: true, undelete: decision === 'revive' });
        }
        await reconcileChildren(id, desired.items, children);
      }
      return changed;
    },
  );
}

async function hasLoggedWork(sessionId: UUID, children: Local<SessionExercise>[]): Promise<boolean> {
  const live = children.filter((c) => c._deleted === 0).map((c) => c.id);
  if (live.length > 0) {
    const sets = await db.set_entries.where('session_exercise_id').anyOf(live).toArray();
    if (sets.some((s) => s._deleted === 0)) return true;
  }
  const runs = await db.runs.where('session_id').equals(sessionId).toArray();
  return runs.some((r) => r._deleted === 0);
}

/** Makes a session's exercises match the desired items, as system writes. */
async function reconcileChildren(
  sessionId: UUID,
  items: DesiredItem[],
  children: Local<SessionExercise>[],
): Promise<void> {
  const wanted = new Map(items.map((i) => [plannedChildId(sessionId, i.itemId), i]));

  for (const c of children) {
    if (c._deleted === 0 && !wanted.has(c.id)) {
      await softDeleteRow('session_exercises', c.id, { system: true });
    }
  }

  for (const [childId, item] of wanted) {
    const fields = {
      exercise_id: item.exerciseId,
      position: item.position,
      target_sets: item.targetSets,
      target_reps: item.targetReps,
      target_weight_kg: item.targetWeightKg,
    };
    const current = children.find((c) => c.id === childId);
    if (!current) {
      await insertRow<SessionExercise>(
        'session_exercises',
        { session_id: sessionId, notes: null, ...fields },
        { id: childId, system: true },
      );
    } else {
      await updateRow<SessionExercise>('session_exercises', childId, fields, {
        system: true,
        undelete: current._deleted === 1,
      });
    }
  }
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/features/plan/materialize.test.ts`
Expected: PASS, 28 tests

Run: `npm test` 3 times — all pass each time. `npx tsc -b` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/plan/materialize.ts src/features/plan/materialize.test.ts
git commit -m "feat: materialize the weekly template into dated planned sessions

Planned rows get deterministic ids, so two devices produce one row per
date, and system timestamps, so a fresh install can never overwrite a
session logged elsewhere. decide() never touches a row the user has
edited, finished or logged into, and never rewrites the past; untouched
future rows follow template changes."
```

---

## Task 15: Sessions from workouts, and session cards

**Files:**
- Create: `src/features/log/sessionsRepo.ts`, `src/features/log/sessionsRepo.test.ts`, `src/features/log/cards.ts`, `src/features/log/cards.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/features/log/sessionsRepo.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { insertRow } from '../../db/repo';
import { isSystemTimestamp } from '../../lib/time';
import { makeExercise, makeWorkout, resetDb } from '../../test/fixtures';
import type { Run, RunSplit, SetEntry } from '../../types/domain';
import { createSessionFromTemplate, removeSession } from './sessionsRepo';

const MON = '2026-10-05';

beforeEach(resetDb);

describe('createSessionFromTemplate', () => {
  it('copies the workout into a session the user owns', async () => {
    const squat = await makeExercise('Squat');
    const legs = await makeWorkout('Legs', [squat]);
    const session = await createSessionFromTemplate(MON, legs.id, { wasPlanned: false });

    expect(session).toMatchObject({ date: MON, status: 'planned', template_id: legs.id, was_planned: false, kind: 'strength' });
    expect(isSystemTimestamp(session.updated_at)).toBe(false);
    const children = await db.session_exercises.where('session_id').equals(session.id).toArray();
    expect(children).toHaveLength(1);
    expect(children[0]).toMatchObject({ exercise_id: squat.id, target_sets: 3, target_reps: 5, target_weight_kg: 100 });
  });

  it('creates an empty strength session without a workout', async () => {
    const session = await createSessionFromTemplate(MON, null, { wasPlanned: false });
    expect(session.kind).toBe('strength');
    expect(await db.session_exercises.count()).toBe(0);
  });

  it('gives each call a new id', async () => {
    const a = await createSessionFromTemplate(MON, null, { wasPlanned: true });
    const b = await createSessionFromTemplate(MON, null, { wasPlanned: true });
    expect(a.id).not.toBe(b.id);
  });
});

describe('removeSession', () => {
  it('soft-deletes the session and everything logged under it', async () => {
    const squat = await makeExercise('Squat');
    const legs = await makeWorkout('Legs', [squat]);
    const session = await createSessionFromTemplate(MON, legs.id, { wasPlanned: true });
    const [child] = await db.session_exercises.where('session_id').equals(session.id).toArray();
    await insertRow<SetEntry>('set_entries', {
      session_exercise_id: child.id,
      set_index: 0,
      reps: 5,
      weight_kg: 100,
      rpe: 8,
      is_warmup: false,
      notes: null,
    });
    const run = await insertRow<Run>('runs', {
      session_id: session.id,
      exercise_id: squat.id,
      run_type: 'easy',
      distance_km: 5,
      duration_s: 1500,
      rpe: 6,
      avg_hr: null,
      weather: null,
      route_note: null,
    });
    await insertRow<RunSplit>('run_splits', { run_id: run.id, split_index: 0, distance_km: 1, duration_s: 300 });

    await removeSession(session.id);

    for (const table of [db.sessions, db.session_exercises, db.set_entries, db.runs, db.run_splits]) {
      const rows = await table.toArray();
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r._deleted === 1)).toBe(true);
    }
  });
});
```

`src/features/log/cards.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { base, makeExercise, makeWorkout, resetDb } from '../../test/fixtures';
import type { Exercise, Local, Run, Session, SessionExercise, SetEntry } from '../../types/domain';
import { buildCards, loadSessionCards, sessionTitle } from './cards';
import { createSessionFromTemplate } from './sessionsRepo';

function session(id: string, extra: Partial<Session> = {}): Local<Session> {
  return {
    ...base(id),
    date: '2026-10-05',
    kind: 'strength',
    status: 'planned',
    template_id: null,
    was_planned: true,
    energy: null,
    notes: null,
    started_at: null,
    completed_at: null,
    ...extra,
  };
}

function child(id: string, sessionId: string, exerciseId: string, targetSets: number | null = 3): SessionExercise {
  return {
    ...base(id),
    session_id: sessionId,
    exercise_id: exerciseId,
    position: 0,
    notes: null,
    target_sets: targetSets,
    target_reps: 5,
    target_weight_kg: 100,
  };
}

function set(id: string, childId: string, extra: Partial<SetEntry> = {}): SetEntry {
  return {
    ...base(id),
    session_exercise_id: childId,
    set_index: 0,
    reps: 5,
    weight_kg: 100,
    rpe: 8,
    is_warmup: false,
    notes: null,
    ...extra,
  };
}

function exercise(id: string, name: string, modality: Exercise['modality'] = 'strength'): Exercise {
  return {
    ...base(id),
    name,
    muscle_group: null,
    modality,
    run_type: modality === 'cardio' ? 'easy' : null,
    default_sets: null,
    default_reps: null,
    default_weight_kg: null,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 0,
  };
}

describe('sessionTitle', () => {
  it('prefers the workout name', () => {
    expect(sessionTitle(session('s'), 'Push A', undefined)).toBe('Push A');
  });

  it('names a run by its run type', () => {
    expect(sessionTitle(session('s', { kind: 'run' }), undefined, 'Tempo Run')).toBe('Tempo Run');
    expect(sessionTitle(session('s', { kind: 'run' }), undefined, undefined)).toBe('Run');
  });

  it('marks an unplanned workout', () => {
    expect(sessionTitle(session('s', { was_planned: false }), undefined, undefined)).toBe('Unplanned workout');
  });
});

describe('buildCards', () => {
  const squat = exercise('e1', 'Squat');
  const easy = exercise('e2', 'Easy Run', 'cardio');

  it('counts working sets against targets, with volume and mean RPE', () => {
    const cards = buildCards({
      sessions: [session('s1')],
      children: [child('c1', 's1', 'e1', 3)],
      sets: [
        set('a', 'c1', { rpe: 7 }),
        set('b', 'c1', { rpe: 9 }),
        set('w', 'c1', { is_warmup: true, rpe: 4 }),
        set('x', 'c1', { deleted_at: '2026-10-05T07:00:00.000Z' }),
      ],
      runs: [],
      templates: [],
      exercises: [squat],
    });
    expect(cards[0]).toMatchObject({ workingSets: 2, targetSets: 3, volumeKg: 1000, avgRpe: 8 });
  });

  it('attaches the run and names the session after it', () => {
    const run: Local<Run> = {
      ...base('r1'),
      session_id: 's1',
      exercise_id: 'e2',
      run_type: 'easy',
      distance_km: 8,
      duration_s: 2700,
      rpe: 6,
      avg_hr: null,
      weather: null,
      route_note: null,
    };
    const [card] = buildCards({
      sessions: [session('s1', { kind: 'run' })],
      children: [],
      sets: [],
      runs: [run],
      templates: [],
      exercises: [easy],
    });
    expect(card.run?.id).toBe('r1');
    expect(card.title).toBe('Easy Run');
    expect(card.avgRpe).toBe(6);
  });

  it('leaves cardio exercises out of the set target', () => {
    const [card] = buildCards({
      sessions: [session('s1', { kind: 'mixed' })],
      children: [child('c1', 's1', 'e1', 3), child('c2', 's1', 'e2', null)],
      sets: [],
      runs: [],
      templates: [],
      exercises: [squat, easy],
    });
    expect(card.targetSets).toBe(3);
  });

  it('drops deleted sessions and orders by date', () => {
    const cards = buildCards({
      sessions: [
        session('late', { date: '2026-10-07' }),
        session('gone', { deleted_at: '2026-10-01T00:00:00.000Z' }),
        session('early', { date: '2026-10-05' }),
      ],
      children: [],
      sets: [],
      runs: [],
      templates: [],
      exercises: [],
    });
    expect(cards.map((c) => c.session.id)).toEqual(['early', 'late']);
  });
});

describe('loadSessionCards', () => {
  beforeEach(resetDb);

  it('loads the sessions in a date range', async () => {
    const squat = await makeExercise('Squat');
    const legs = await makeWorkout('Legs', [squat]);
    await createSessionFromTemplate('2026-10-05', legs.id, { wasPlanned: true });
    await createSessionFromTemplate('2026-10-12', legs.id, { wasPlanned: true });

    const cards = await loadSessionCards('2026-10-05', '2026-10-11');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ title: 'Legs', targetSets: 3, workingSets: 0 });
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/features/log`
Expected: FAIL — modules `./sessionsRepo` and `./cards` do not exist.

- [ ] **Step 3: Implement the sessions repository**

`src/features/log/sessionsRepo.ts` (new file):

```ts
import { db } from '../../db/schema';
import { insertRow, softDeleteRow } from '../../db/repo';
import type { ISODate, Local, Session, SessionExercise, UUID } from '../../types/domain';
import { sessionKindFor } from '../plan/materialize';

/**
 * A session the user asked for: an unplanned workout from Today, or a session
 * added to a day in the week view. Unlike materialized sessions these get a
 * random id and a real timestamp — they are the user's from the start.
 */
export async function createSessionFromTemplate(
  date: ISODate,
  templateId: UUID | null,
  opts: { wasPlanned: boolean },
): Promise<Local<Session>> {
  return db.transaction(
    'rw',
    [db.sessions, db.session_exercises, db.workout_template_items, db.exercises],
    async () => {
      const items = templateId
        ? (await db.workout_template_items.where('template_id').equals(templateId).toArray())
            .filter((i) => i._deleted === 0)
            .sort((a, b) => a.position - b.position)
        : [];
      const exercises = await db.exercises.toArray();
      const kind = sessionKindFor(
        items.map((i) => exercises.find((e) => e.id === i.exercise_id)?.modality ?? 'strength'),
      );

      const session = await insertRow<Session>('sessions', {
        date,
        kind,
        status: 'planned',
        template_id: templateId,
        was_planned: opts.wasPlanned,
        energy: null,
        notes: null,
        started_at: null,
        completed_at: null,
      });

      for (const item of items) {
        await insertRow<SessionExercise>('session_exercises', {
          session_id: session.id,
          exercise_id: item.exercise_id,
          position: item.position,
          notes: null,
          target_sets: item.target_sets,
          target_reps: item.target_reps,
          target_weight_kg: item.target_weight_kg,
        });
      }
      return session;
    },
  );
}

/** Soft-deletes a session and everything logged under it. A user action, so never revived. */
export async function removeSession(sessionId: UUID): Promise<void> {
  await db.transaction(
    'rw',
    [db.sessions, db.session_exercises, db.set_entries, db.runs, db.run_splits],
    async () => {
      const children = await db.session_exercises.where('session_id').equals(sessionId).toArray();
      for (const c of children.filter((x) => x._deleted === 0)) {
        const sets = await db.set_entries.where('session_exercise_id').equals(c.id).toArray();
        for (const s of sets) if (s._deleted === 0) await softDeleteRow('set_entries', s.id);
        await softDeleteRow('session_exercises', c.id);
      }

      const runs = await db.runs.where('session_id').equals(sessionId).toArray();
      for (const r of runs.filter((x) => x._deleted === 0)) {
        const splits = await db.run_splits.where('run_id').equals(r.id).toArray();
        for (const sp of splits) if (sp._deleted === 0) await softDeleteRow('run_splits', sp.id);
        await softDeleteRow('runs', r.id);
      }

      await softDeleteRow('sessions', sessionId);
    },
  );
}
```

- [ ] **Step 4: Implement the cards**

`src/features/log/cards.ts` (new file):

```ts
import { db } from '../../db/schema';
import { meanRPE } from '../../lib/rpe';
import { isWorkingSet, totalVolume } from '../../lib/strength';
import type {
  Exercise,
  ISODate,
  Local,
  Run,
  Session,
  SessionExercise,
  SetEntry,
  WorkoutTemplate,
} from '../../types/domain';

/** Everything a list row needs to describe one session. */
export interface SessionCard {
  session: Local<Session>;
  title: string;
  workingSets: number;
  /** Sum of target sets over the strength exercises. */
  targetSets: number;
  volumeKg: number;
  avgRpe: number | null;
  run: Local<Run> | null;
}

export function sessionTitle(session: Session, templateName: string | undefined, runName: string | undefined): string {
  if (templateName) return templateName;
  if (session.kind === 'run') return runName ?? 'Run';
  return session.was_planned ? 'Workout' : 'Unplanned workout';
}

export function buildCards(input: {
  sessions: Local<Session>[];
  children: SessionExercise[];
  sets: SetEntry[];
  runs: Local<Run>[];
  templates: WorkoutTemplate[];
  exercises: Exercise[];
}): SessionCard[] {
  const templateName = new Map(input.templates.map((t) => [t.id, t.name]));
  const exerciseById = new Map(input.exercises.map((e) => [e.id, e]));
  const isCardio = (exerciseId: string) => exerciseById.get(exerciseId)?.modality === 'cardio';

  return input.sessions
    .filter((s) => s.deleted_at === null)
    .map((session) => {
      const children = input.children.filter((c) => c.session_id === session.id && c.deleted_at === null);
      const childIds = new Set(children.map((c) => c.id));
      const sets = input.sets.filter((s) => childIds.has(s.session_exercise_id) && isWorkingSet(s));
      const run = input.runs.find((r) => r.session_id === session.id && r.deleted_at === null) ?? null;
      const runExerciseId = run?.exercise_id ?? children.find((c) => isCardio(c.exercise_id))?.exercise_id;

      return {
        session,
        title: sessionTitle(
          session,
          session.template_id ? templateName.get(session.template_id) : undefined,
          runExerciseId ? exerciseById.get(runExerciseId)?.name : undefined,
        ),
        workingSets: sets.length,
        targetSets: children
          .filter((c) => !isCardio(c.exercise_id))
          .reduce((n, c) => n + (c.target_sets ?? 0), 0),
        volumeKg: totalVolume(sets),
        avgRpe: sets.length > 0 ? meanRPE(sets) : run ? run.rpe : null,
        run,
      };
    })
    .sort(
      (a, b) =>
        a.session.date.localeCompare(b.session.date) || a.session.created_at.localeCompare(b.session.created_at),
    );
}

/** Cards for every live session between two dates, inclusive. Safe inside useLiveQuery. */
export async function loadSessionCards(start: ISODate, end: ISODate): Promise<SessionCard[]> {
  const sessions = (await db.sessions.where('date').between(start, end, true, true).toArray()).filter(
    (s) => s._deleted === 0,
  );
  if (sessions.length === 0) return [];

  const ids = sessions.map((s) => s.id);
  const children = (await db.session_exercises.where('session_id').anyOf(ids).toArray()).filter(
    (c) => c._deleted === 0,
  );
  const sets =
    children.length > 0
      ? await db.set_entries.where('session_exercise_id').anyOf(children.map((c) => c.id)).toArray()
      : [];
  const runs = await db.runs.where('session_id').anyOf(ids).toArray();
  const templates = await db.workout_templates.toArray();
  const exercises = await db.exercises.toArray();

  return buildCards({ sessions, children, sets, runs, templates, exercises });
}
```

- [ ] **Step 5: Run them**

Run: `npx vitest run src/features/log`
Expected: PASS, 12 tests

Run: `npx tsc -b` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/log
git commit -m "feat: sessions from workouts, session removal, and summary cards"
```

---

## Task 16: The week view and the weekly template

**Files:**
- Create: `src/features/plan/WeekView.tsx`, `src/features/plan/PlanDaysScreen.tsx`
- Modify: `src/app/Screen.tsx`

- [ ] **Step 1: The weekly template screen**

`src/features/plan/PlanDaysScreen.tsx` (new file):

```tsx
import { useApp } from '../../app/AppContext';
import { SelectField } from '../../components/Fields';
import Loading from '../../components/Loading';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { WEEKDAY_NAMES } from '../../lib/format';
import { defaultPlanId, planDays, setDayTemplate } from './planRepo';

export default function PlanDaysScreen() {
  const { userId } = useApp();
  const data = useLiveQuery(async () => {
    const days = await planDays(defaultPlanId(userId));
    const templates = (await db.workout_templates.toArray()).sort((a, b) => a.name.localeCompare(b.name));
    return { days, templates };
  }, [userId]);

  if (!data) return <Loading />;

  if (data.days.length === 0) {
    return (
      <section>
        <ScreenHeader title="Weekly template" back={{ name: 'plan' }} />
        <p className="text-muted">Your plan appears once the first sync completes.</p>
      </section>
    );
  }

  return (
    <section>
      <ScreenHeader title="Weekly template" back={{ name: 'plan' }} />
      <p className="mb-4 text-sm text-muted">
        Changes apply from today. Past days keep what was planned, and days you have started, edited or removed stay
        as they are.
      </p>
      <div className="space-y-3">
        {data.days.map((day) => {
          const live = data.templates.filter((t) => t._deleted === 0);
          const assigned = data.templates.find((t) => t.id === day.template_id);
          const options = [
            { value: '', label: 'Rest' },
            ...live.map((t) => ({ value: t.id, label: t.name })),
            ...(assigned && assigned._deleted === 1 ? [{ value: assigned.id, label: `${assigned.name} (deleted)` }] : []),
          ];
          return (
            <SelectField
              key={day.id}
              label={WEEKDAY_NAMES[day.weekday - 1]}
              value={day.template_id ?? ''}
              options={options}
              onChange={(value) => void setDayTemplate(day.id, value || null)}
            />
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: The week view**

`src/features/plan/WeekView.tsx` (new file):

```tsx
import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { routeHref, sessionRoute } from '../../app/routes';
import Button, { IconButton, ROW_LINK } from '../../components/Button';
import Loading from '../../components/Loading';
import PickList from '../../components/PickList';
import ScreenHeader from '../../components/ScreenHeader';
import StatusBadge from '../../components/StatusBadge';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatDayShort, formatWeekRange } from '../../lib/format';
import { addDays, eachDateInRange, startOfWeek, today } from '../../lib/time';
import type { ISODate } from '../../types/domain';
import { loadSessionCards, type SessionCard } from '../log/cards';
import { createSessionFromTemplate, removeSession } from '../log/sessionsRepo';
import { materializeWeek } from './materialize';

export default function WeekView({ week }: { week?: ISODate }) {
  const { userId } = useApp();
  const todayDate = today();
  const weekStart = startOfWeek(week ?? todayDate);
  const weekEnd = addDays(weekStart, 6);
  const [addingTo, setAddingTo] = useState<ISODate | null>(null);

  useEffect(() => {
    void materializeWeek(userId, weekStart, todayDate);
  }, [userId, weekStart, todayDate]);

  const cards = useLiveQuery(() => loadSessionCards(weekStart, weekEnd), [weekStart, weekEnd]);
  const templates = useLiveQuery(
    async () =>
      (await db.workout_templates.where('_deleted').equals(0).toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  return (
    <section>
      <ScreenHeader title="Plan" />
      <div className="mb-3 flex items-center justify-between">
        <a href={routeHref({ name: 'plan', week: addDays(weekStart, -7) })} aria-label="Previous week" className="grid size-12 place-items-center text-2xl">
          ‹
        </a>
        <h2 className="font-medium">{formatWeekRange(weekStart)}</h2>
        <a href={routeHref({ name: 'plan', week: addDays(weekStart, 7) })} aria-label="Next week" className="grid size-12 place-items-center text-2xl">
          ›
        </a>
      </div>

      {!cards ? (
        <Loading />
      ) : (
        <ul className="space-y-2">
          {eachDateInRange(weekStart, weekEnd).map((date) => (
            <DayRow
              key={date}
              date={date}
              isToday={date === todayDate}
              cards={cards.filter((c) => c.session.date === date)}
              onAdd={() => setAddingTo(date)}
            />
          ))}
        </ul>
      )}

      {addingTo && (
        <div className="mt-4 space-y-2">
          <h3 className="font-medium">Add to {formatDayShort(addingTo)}</h3>
          <PickList
            items={(templates ?? []).map((t) => ({ id: t.id, label: t.name }))}
            onPick={async (templateId) => {
              await createSessionFromTemplate(addingTo, templateId, { wasPlanned: true });
              setAddingTo(null);
            }}
            empty="Create a workout first."
          />
          <Button variant="ghost" onClick={() => setAddingTo(null)}>
            Cancel
          </Button>
        </div>
      )}

      <nav className="mt-6 grid gap-2">
        <a href={routeHref({ name: 'plan-days' })} className={ROW_LINK}>
          Weekly template <span aria-hidden>›</span>
        </a>
        <a href={routeHref({ name: 'workouts' })} className={ROW_LINK}>
          Workouts <span aria-hidden>›</span>
        </a>
        <a href={routeHref({ name: 'library' })} className={ROW_LINK}>
          Exercise library <span aria-hidden>›</span>
        </a>
      </nav>
    </section>
  );
}

function DayRow({
  date,
  isToday,
  cards,
  onAdd,
}: {
  date: ISODate;
  isToday: boolean;
  cards: SessionCard[];
  onAdd: () => void;
}) {
  return (
    <li className={`rounded-2xl border bg-surface p-3 ${isToday ? 'border-accent' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {formatDayShort(date)}
          {isToday && <span className="ml-2 text-xs text-accent">Today</span>}
        </span>
        <IconButton label={`Add a session on ${formatDayShort(date)}`} onClick={onAdd}>
          +
        </IconButton>
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-muted">Rest</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {cards.map((card) => (
            <SessionChip key={card.session.id} card={card} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SessionChip({ card }: { card: SessionCard }) {
  const removable = card.session.status === 'planned' && card.workingSets === 0 && !card.run;
  return (
    <li className="flex items-center gap-2">
      <a href={routeHref(sessionRoute(card.session))} className="flex min-h-12 flex-1 items-center gap-2">
        <span className="flex-1">{card.title}</span>
        <StatusBadge status={card.session.status} />
      </a>
      {removable && (
        <IconButton
          label={`Remove ${card.title}`}
          onClick={() => {
            if (window.confirm(`Remove ${card.title} from this day?`)) void removeSession(card.session.id);
          }}
        >
          ✕
        </IconButton>
      )}
    </li>
  );
}
```

- [ ] **Step 3: Route to the plan screens**

`src/app/Screen.tsx` (replace the whole file):

```tsx
import ComingSoon from '../components/ComingSoon';
import ExerciseForm from '../features/library/ExerciseForm';
import LibraryScreen from '../features/library/LibraryScreen';
import PlanDaysScreen from '../features/plan/PlanDaysScreen';
import WeekView from '../features/plan/WeekView';
import WorkoutEditor from '../features/plan/WorkoutEditor';
import WorkoutsScreen from '../features/plan/WorkoutsScreen';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'plan':
      return <WeekView key={route.week ?? 'this-week'} week={route.week} />;
    case 'plan-days':
      return <PlanDaysScreen />;
    case 'workouts':
      return <WorkoutsScreen />;
    case 'workout':
      return <WorkoutEditor key={route.id} id={route.id} />;
    case 'library':
      return <LibraryScreen />;
    case 'exercise':
      return <ExerciseForm key={route.id} id={route.id} />;
    case 'progress':
      return <ProgressScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <ComingSoon title={route.name} />;
  }
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc -b` — clean. `npm test` — passes. `npm run build` — succeeds.

```bash
git add src/features/plan/WeekView.tsx src/features/plan/PlanDaysScreen.tsx src/app/Screen.tsx
git commit -m "feat: week view and weekly template"
```

---

## Task 17: Phase 4 checkpoint

- [ ] **Step 1: Full verification**

Run: `npm test` three times — all pass every time. `npx tsc -b` — clean. `npm run build` — succeeds.

- [ ] **Step 2: Run the app and check**

Run: `npm run dev`. **What to check:**

1. **Plan tab → Workouts.** Create "Legs" (Back Squat, Romanian Deadlift) and "Push" (Barbell Bench Press, Overhead Press).
2. **Plan → Weekly template.** Monday → Legs, Wednesday → Push, Friday → Legs. Go back to Plan: this week shows Legs on Monday and Friday and Push on Wednesday — from today forward, plus any earlier days of this week. Other days read "Rest".
3. **Change a future day.** Weekly template: Friday → Push. Back on Plan, Friday now shows Push.
4. **Remove a day.** Tap ✕ on Wednesday's Push and confirm. It disappears. Revisit the Weekly template and back — Wednesday stays removed; the app does not bring back a session you removed.
5. **Add a one-off.** Tap + on Saturday, pick Legs. It appears on Saturday.
6. **Navigate weeks.** ‹ and › move by a week; next week shows the template's workouts.
7. **Sync.** Tap the status in the corner. In Supabase → Table Editor → `sessions`, the planned rows are there with `updated_at` in 1976 — the system-write stamp — except the Saturday one you added, which carries today's date.

- [ ] **Step 3: Commit anything the checkpoint fixed**

If the checkpoint needed a fix, commit it with a message naming what you saw. Otherwise nothing to commit.

---

# Phase 5 — Today, set logging, runs and the rest timer

## Task 18: Schema version 2 — find sessions by exercise

"Last time you did this exercise" needs every `session_exercises` row for one exercise. Version 1 has no index on `exercise_id`. Real data now exists — your browser and phone hold a version 1 database — so this is a proper version bump, not an edit to version 1.

**Files:**
- Modify: `src/db/schema.ts`
- Create: `src/db/schemaV2.test.ts`

- [ ] **Step 1: Write the failing test**

`src/db/schemaV2.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Local, SessionExercise } from '../types/domain';
import { db } from './schema';

/** The version 1 schema exactly as it shipped, to build a real legacy database. */
const V1 = {
  exercises: 'id, _dirty, _deleted, updated_at, modality, muscle_group, sort_order',
  workout_templates: 'id, _dirty, _deleted, updated_at, name',
  workout_template_items: 'id, _dirty, _deleted, updated_at, template_id, position',
  week_plans: 'id, _dirty, _deleted, updated_at, active_from',
  week_plan_days: 'id, _dirty, _deleted, updated_at, week_plan_id, weekday',
  sessions: 'id, _dirty, _deleted, updated_at, date, status',
  session_exercises: 'id, _dirty, _deleted, updated_at, session_id, position',
  set_entries: 'id, _dirty, _deleted, updated_at, session_exercise_id, set_index',
  runs: 'id, _dirty, _deleted, updated_at, session_id',
  run_splits: 'id, _dirty, _deleted, updated_at, run_id, split_index',
  body_metrics: 'id, _dirty, _deleted, updated_at, date',
  user_prefs: 'id, _dirty, _deleted, updated_at',
  sync_meta: 'table',
};

const row: Local<SessionExercise> = {
  id: 'se1',
  user_id: null,
  created_at: '2026-10-01T06:00:00.000Z',
  updated_at: '2026-10-01T06:00:00.000Z',
  server_updated_at: null,
  deleted_at: null,
  session_id: 's1',
  exercise_id: 'ex1',
  position: 0,
  notes: null,
  target_sets: 3,
  target_reps: 5,
  target_weight_kg: 100,
  _dirty: 0,
  _deleted: 0,
};

beforeEach(async () => {
  db.close();
  await Dexie.delete('fit_tracker');
});

describe('schema version 2', () => {
  it('finds session exercises by exercise', async () => {
    await db.open();
    await db.session_exercises.put(row);
    expect(await db.session_exercises.where('exercise_id').equals('ex1').count()).toBe(1);
  });

  it('upgrades a version 1 database in place and keeps its rows', async () => {
    const legacy = new Dexie('fit_tracker');
    legacy.version(1).stores(V1);
    await legacy.open();
    await legacy.table('session_exercises').put(row);
    legacy.close();

    await db.open();
    expect(db.verno).toBe(2);
    expect(await db.session_exercises.where('exercise_id').equals('ex1').count()).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/db/schemaV2.test.ts`
Expected: FAIL — `KeyPath exercise_id on object store session_exercises is not indexed`, and `verno` is 1.

- [ ] **Step 3: Add version 2**

Version 1 stays exactly as it was; version 2 is added after it.

`src/db/schema.ts` (replace the whole file):

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

    // Version 1 as shipped. Never edit it: devices already hold version 1
    // databases, and Dexie upgrades them by replaying the versions in order.
    this.version(1).stores({
      exercises: 'id, _dirty, _deleted, updated_at, modality, muscle_group, sort_order',
      workout_templates: 'id, _dirty, _deleted, updated_at, name',
      workout_template_items: 'id, _dirty, _deleted, updated_at, template_id, position',
      week_plans: 'id, _dirty, _deleted, updated_at, active_from',
      week_plan_days: 'id, _dirty, _deleted, updated_at, week_plan_id, weekday',
      sessions: 'id, _dirty, _deleted, updated_at, date, status',
      session_exercises: 'id, _dirty, _deleted, updated_at, session_id, position',
      set_entries: 'id, _dirty, _deleted, updated_at, session_exercise_id, set_index',
      runs: 'id, _dirty, _deleted, updated_at, session_id',
      run_splits: 'id, _dirty, _deleted, updated_at, run_id, split_index',
      body_metrics: 'id, _dirty, _deleted, updated_at, date',
      user_prefs: 'id, _dirty, _deleted, updated_at',
      sync_meta: 'table',
    });

    // Version 2: find every logged instance of an exercise, for "last time".
    // Adding an index needs no data migration; Dexie builds it on upgrade.
    this.version(2).stores({
      session_exercises: 'id, _dirty, _deleted, updated_at, session_id, position, exercise_id',
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

- [ ] **Step 4: Run it**

Run: `npx vitest run src/db/schemaV2.test.ts`
Expected: PASS, 2 tests

Run: `npm test` — everything still passes.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts src/db/schemaV2.test.ts
git commit -m "feat: schema version 2 indexes session exercises by exercise

A real version bump rather than an edit to version 1: devices already
hold version 1 databases, and Dexie upgrades them by replaying versions."
```

---

## Task 19: Set rules

**Files:**
- Create: `src/features/log/setRules.ts`, `src/features/log/setRules.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/log/setRules.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { RPE_STEPS, isValidRpe, suggestStatus, validateSet } from './setRules';

describe('RPE_STEPS', () => {
  it('runs from 1 to 10 in half steps', () => {
    expect(RPE_STEPS).toHaveLength(19);
    expect(RPE_STEPS[0]).toBe(1);
    expect(RPE_STEPS[1]).toBe(1.5);
    expect(RPE_STEPS.at(-1)).toBe(10);
  });
});

describe('isValidRpe', () => {
  it('accepts whole and half steps in range', () => {
    expect(isValidRpe(7)).toBe(true);
    expect(isValidRpe(7.5)).toBe(true);
    expect(isValidRpe(1)).toBe(true);
    expect(isValidRpe(10)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidRpe(null)).toBe(false);
    expect(isValidRpe(7.3)).toBe(false);
    expect(isValidRpe(0.5)).toBe(false);
    expect(isValidRpe(10.5)).toBe(false);
    expect(isValidRpe(Number.NaN)).toBe(false);
  });
});

describe('validateSet', () => {
  const ok = { reps: 5, weight_kg: 100, rpe: 8, is_warmup: false };

  it('accepts a complete set', () => {
    expect(validateSet(ok)).toEqual({});
  });

  it('refuses a set without an RPE', () => {
    expect(validateSet({ ...ok, rpe: null }).rpe).toBeDefined();
  });

  it('requires whole reps from 1 to 100', () => {
    expect(validateSet({ ...ok, reps: 0 }).reps).toBeDefined();
    expect(validateSet({ ...ok, reps: 2.5 }).reps).toBeDefined();
    expect(validateSet({ ...ok, reps: 101 }).reps).toBeDefined();
  });

  it('allows bodyweight but not negative or absurd loads', () => {
    expect(validateSet({ ...ok, weight_kg: 0 })).toEqual({});
    expect(validateSet({ ...ok, weight_kg: -5 }).weight_kg).toBeDefined();
    expect(validateSet({ ...ok, weight_kg: 1001 }).weight_kg).toBeDefined();
    expect(validateSet({ ...ok, weight_kg: Number.NaN }).weight_kg).toBeDefined();
  });
});

describe('suggestStatus', () => {
  it('is skipped when nothing was logged', () => {
    expect(suggestStatus([{ targetSets: 3, workingSets: 0 }])).toBe('skipped');
    expect(suggestStatus([])).toBe('skipped');
  });

  it('is done when every target was met', () => {
    expect(suggestStatus([{ targetSets: 3, workingSets: 3 }, { targetSets: 2, workingSets: 4 }])).toBe('done');
  });

  it('is partial when some work is missing', () => {
    expect(suggestStatus([{ targetSets: 3, workingSets: 3 }, { targetSets: 3, workingSets: 1 }])).toBe('partial');
  });

  it('treats an exercise with no target as wanting one set', () => {
    expect(suggestStatus([{ targetSets: null, workingSets: 1 }])).toBe('done');
    expect(suggestStatus([{ targetSets: 3, workingSets: 3 }, { targetSets: null, workingSets: 0 }])).toBe('partial');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/features/log/setRules.test.ts`
Expected: FAIL — module `./setRules` does not exist.

- [ ] **Step 3: Implement**

`src/features/log/setRules.ts` (new file):

```ts
/** 1, 1.5, 2 … 10. */
export const RPE_STEPS: readonly number[] = Array.from({ length: 19 }, (_, i) => 1 + i * 0.5);

export function isValidRpe(value: number | null): value is number {
  return value !== null && value >= 1 && value <= 10 && Number.isInteger(value * 2);
}

/** A set being entered. RPE is null until the user taps one — it is never guessed. */
export interface SetDraft {
  reps: number;
  weight_kg: number;
  rpe: number | null;
  is_warmup: boolean;
}

export type SetErrors = Partial<Record<'reps' | 'weight_kg' | 'rpe', string>>;

export function validateSet(draft: SetDraft): SetErrors {
  const errors: SetErrors = {};
  if (!Number.isInteger(draft.reps) || draft.reps < 1 || draft.reps > 100) errors.reps = 'Reps must be 1–100';
  if (!(draft.weight_kg >= 0 && draft.weight_kg <= 1000)) errors.weight_kg = 'Weight must be 0–1000 kg';
  if (!isValidRpe(draft.rpe)) errors.rpe = 'Rate this set — RPE 1 to 10';
  return errors;
}

export type FinishedStatus = 'done' | 'partial' | 'skipped';

/**
 * The status to pre-select when finishing. Pass strength exercises only — a
 * run inside a session is logged separately and has no sets.
 */
export function suggestStatus(exercises: { targetSets: number | null; workingSets: number }[]): FinishedStatus {
  const logged = exercises.reduce((n, e) => n + e.workingSets, 0);
  if (logged === 0) return 'skipped';
  return exercises.every((e) => e.workingSets >= (e.targetSets ?? 1)) ? 'done' : 'partial';
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/features/log/setRules.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/log/setRules.ts src/features/log/setRules.test.ts
git commit -m "feat: set validation with required RPE, and suggested session status"
```

---

## Task 20: Prefill from last time

**Files:**
- Create: `src/features/log/prefill.ts`, `src/features/log/prefill.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/log/prefill.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { base } from '../../test/fixtures';
import type { Session, SessionExercise, SetEntry } from '../../types/domain';
import { lastTimeSets, nextSetDraft, sameAsLastSet } from './prefill';

function session(id: string, date: string, extra: Partial<Session> = {}): Session {
  return {
    ...base(id),
    date,
    kind: 'strength',
    status: 'done',
    template_id: null,
    was_planned: true,
    energy: null,
    notes: null,
    started_at: null,
    completed_at: `${date}T07:00:00.000Z`,
    ...extra,
  };
}

function child(id: string, sessionId: string, exerciseId = 'squat'): SessionExercise {
  return {
    ...base(id),
    session_id: sessionId,
    exercise_id: exerciseId,
    position: 0,
    notes: null,
    target_sets: 3,
    target_reps: 5,
    target_weight_kg: 100,
  };
}

function set(id: string, childId: string, setIndex: number, reps: number, weight: number, extra: Partial<SetEntry> = {}): SetEntry {
  return {
    ...base(id),
    session_exercise_id: childId,
    set_index: setIndex,
    reps,
    weight_kg: weight,
    rpe: 8,
    is_warmup: false,
    notes: null,
    ...extra,
  };
}

describe('lastTimeSets', () => {
  const sessions = [
    session('old', '2026-09-28'),
    session('recent', '2026-10-01'),
    session('now', '2026-10-05'),
    session('future', '2026-10-09'),
    session('gone', '2026-10-03', { deleted_at: '2026-10-03T08:00:00.000Z' }),
  ];
  const children = [
    child('c-old', 'old'),
    child('c-recent', 'recent'),
    child('c-now', 'now'),
    child('c-future', 'future'),
    child('c-gone', 'gone'),
  ];
  const sets = [
    set('o1', 'c-old', 0, 5, 90),
    set('r2', 'c-recent', 1, 5, 102.5),
    set('r1', 'c-recent', 0, 5, 100),
    set('rw', 'c-recent', 2, 10, 40, { is_warmup: true }),
    set('n1', 'c-now', 0, 5, 105),
    set('f1', 'c-future', 0, 5, 200),
    set('g1', 'c-gone', 0, 5, 150),
  ];
  const args = { exerciseId: 'squat', currentSessionId: 'now', currentDate: '2026-10-05', sessions, sessionExercises: children, sets };

  it('returns the most recent earlier session, working sets only, in order', () => {
    expect(lastTimeSets(args).map((s) => s.id)).toEqual(['r1', 'r2']);
  });

  it('skips a session where only warm-ups were logged', () => {
    const warmupsOnly = sets.map((s) => (s.session_exercise_id === 'c-recent' ? { ...s, is_warmup: true } : s));
    expect(lastTimeSets({ ...args, sets: warmupsOnly }).map((s) => s.id)).toEqual(['o1']);
  });

  it('returns nothing for an exercise never done before', () => {
    expect(lastTimeSets({ ...args, exerciseId: 'deadlift' })).toEqual([]);
  });
});

describe('nextSetDraft', () => {
  const lastTime = [set('a', 'x', 0, 5, 100), set('b', 'x', 1, 5, 102.5)];
  const targets = { targetReps: 8, targetWeightKg: 60, defaultReps: 10, defaultWeightKg: 40 };

  it('suggests the same set as last time, by position', () => {
    expect(nextSetDraft({ logged: [set('n', 'y', 0, 5, 100)], lastTime, ...targets })).toEqual({
      reps: 5,
      weight_kg: 102.5,
      rpe: null,
      is_warmup: false,
    });
  });

  it('repeats the previous set once past last time', () => {
    const logged = [set('n1', 'y', 0, 5, 100), set('n2', 'y', 1, 5, 102.5), set('n3', 'y', 2, 4, 105)];
    expect(nextSetDraft({ logged, lastTime, ...targets })).toMatchObject({ reps: 4, weight_kg: 105 });
  });

  it('ignores warm-ups when counting position', () => {
    const logged = [set('w', 'y', 0, 10, 40, { is_warmup: true })];
    expect(nextSetDraft({ logged, lastTime, ...targets })).toMatchObject({ reps: 5, weight_kg: 100 });
  });

  it('falls back to the targets, then the exercise defaults', () => {
    expect(nextSetDraft({ logged: [], lastTime: [], ...targets })).toMatchObject({ reps: 8, weight_kg: 60 });
    expect(
      nextSetDraft({ logged: [], lastTime: [], targetReps: null, targetWeightKg: null, defaultReps: 10, defaultWeightKg: 40 }),
    ).toMatchObject({ reps: 10, weight_kg: 40 });
    expect(
      nextSetDraft({ logged: [], lastTime: [], targetReps: null, targetWeightKg: null, defaultReps: null, defaultWeightKg: null }),
    ).toMatchObject({ reps: 5, weight_kg: 0 });
  });

  it('never pre-fills the RPE — every set must be rated', () => {
    expect(nextSetDraft({ logged: [], lastTime, ...targets }).rpe).toBeNull();
  });
});

describe('sameAsLastSet', () => {
  it('copies the last set, RPE included, because the user asked for it', () => {
    const logged = [set('a', 'y', 0, 5, 100, { rpe: 7 }), set('b', 'y', 1, 5, 102.5, { rpe: 8.5 })];
    expect(sameAsLastSet(logged)).toEqual({ reps: 5, weight_kg: 102.5, rpe: 8.5, is_warmup: false });
  });

  it('ignores deleted sets', () => {
    const logged = [set('a', 'y', 0, 5, 100), set('b', 'y', 1, 3, 120, { deleted_at: '2026-10-05T07:00:00.000Z' })];
    expect(sameAsLastSet(logged)).toMatchObject({ reps: 5, weight_kg: 100 });
  });

  it('is null before anything is logged', () => {
    expect(sameAsLastSet([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/features/log/prefill.test.ts`
Expected: FAIL — module `./prefill` does not exist.

- [ ] **Step 3: Implement**

`src/features/log/prefill.ts` (new file):

```ts
import { isWorkingSet } from '../../lib/strength';
import type { ISODate, Session, SessionExercise, SetEntry, UUID } from '../../types/domain';
import type { SetDraft } from './setRules';

const bySetIndex = (a: SetEntry, b: SetEntry) => a.set_index - b.set_index;

/**
 * The working sets from the most recent other session, on or before this
 * one's date, in which this exercise was actually trained.
 */
export function lastTimeSets<S extends SetEntry>(args: {
  exerciseId: UUID;
  currentSessionId: UUID;
  currentDate: ISODate;
  sessions: Session[];
  sessionExercises: SessionExercise[];
  sets: S[];
}): S[] {
  const sessionById = new Map(args.sessions.map((s) => [s.id, s]));

  const candidates = args.sessionExercises
    .filter((c) => c.exercise_id === args.exerciseId && c.deleted_at === null && c.session_id !== args.currentSessionId)
    .map((c) => ({
      session: sessionById.get(c.session_id),
      sets: args.sets.filter((s) => s.session_exercise_id === c.id && isWorkingSet(s)),
    }))
    .filter(
      (c): c is { session: Session; sets: S[] } =>
        c.session !== undefined &&
        c.session.deleted_at === null &&
        c.session.date <= args.currentDate &&
        c.sets.length > 0,
    )
    .sort(
      (a, b) =>
        b.session.date.localeCompare(a.session.date) ||
        (b.session.completed_at ?? b.session.updated_at).localeCompare(a.session.completed_at ?? a.session.updated_at),
    );

  return candidates.length > 0 ? [...candidates[0].sets].sort(bySetIndex) : [];
}

/**
 * The next set to suggest: the same-numbered set from last time; failing
 * that, a repeat of the previous set; failing that, the targets or the
 * exercise's defaults. The RPE is always left blank so every set is rated.
 */
export function nextSetDraft(args: {
  logged: SetEntry[];
  lastTime: SetEntry[];
  targetReps: number | null;
  targetWeightKg: number | null;
  defaultReps: number | null;
  defaultWeightKg: number | null;
}): SetDraft {
  const working = args.logged.filter(isWorkingSet).sort(bySetIndex);
  const fromLastTime = args.lastTime[working.length];
  if (fromLastTime) return { reps: fromLastTime.reps, weight_kg: fromLastTime.weight_kg, rpe: null, is_warmup: false };

  const previous = working.at(-1);
  if (previous) return { reps: previous.reps, weight_kg: previous.weight_kg, rpe: null, is_warmup: false };

  return {
    reps: args.targetReps ?? args.defaultReps ?? 5,
    weight_kg: args.targetWeightKg ?? args.defaultWeightKg ?? 0,
    rpe: null,
    is_warmup: false,
  };
}

/** The "same as last set" button: a copy of the previous set, RPE included. */
export function sameAsLastSet(logged: SetEntry[]): SetDraft | null {
  const last = logged.filter((s) => s.deleted_at === null).sort(bySetIndex).at(-1);
  return last ? { reps: last.reps, weight_kg: last.weight_kg, rpe: last.rpe, is_warmup: last.is_warmup } : null;
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/features/log/prefill.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/log/prefill.ts src/features/log/prefill.test.ts
git commit -m "feat: pre-fill sets from last time; RPE always left for the user"
```

---

## Task 21: Logging repository and the session loader

A detail that matters: the first write a user makes into a materialized session — a set, an added exercise, a note — must *claim* it, giving the session row a real timestamp. Otherwise the plan could still rewrite a session the user is halfway through.

**Files:**
- Create: `src/features/log/setsRepo.ts`, `src/features/log/setsRepo.test.ts`, `src/features/log/sessionView.ts`, `src/features/log/sessionView.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/features/log/setsRepo.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { insertRow } from '../../db/repo';
import { isSystemTimestamp } from '../../lib/time';
import { makeExercise, makeWorkout, resetDb } from '../../test/fixtures';
import type { Session } from '../../types/domain';
import { createSessionFromTemplate } from './sessionsRepo';
import {
  addExerciseToSession,
  deleteSet,
  finishSession,
  logSet,
  removeExerciseFromSession,
  setExerciseNote,
  updateSet,
} from './setsRepo';

const MON = '2026-10-05';
const SET = { reps: 5, weight_kg: 100, rpe: 8, is_warmup: false };

beforeEach(resetDb);

async function legsSession() {
  const squat = await makeExercise('Squat');
  const legs = await makeWorkout('Legs', [squat]);
  const session = await createSessionFromTemplate(MON, legs.id, { wasPlanned: true });
  const [child] = await db.session_exercises.where('session_id').equals(session.id).toArray();
  return { squat, session, child };
}

async function setsOf(childId: string) {
  return (await db.set_entries.where('session_exercise_id').equals(childId).toArray()).filter((s) => s._deleted === 0);
}

describe('logSet', () => {
  it('refuses a set without an RPE and writes nothing', async () => {
    const { child } = await legsSession();
    await expect(logSet(child.id, { ...SET, rpe: null })).rejects.toThrow(/RPE/);
    expect(await db.set_entries.count()).toBe(0);
  });

  it('numbers sets in order and never reuses a deleted index', async () => {
    const { child } = await legsSession();
    const a = await logSet(child.id, SET);
    const b = await logSet(child.id, SET);
    await deleteSet(b.id);
    const c = await logSet(child.id, SET);
    expect([a.set_index, b.set_index, c.set_index]).toEqual([0, 1, 2]);
  });

  it('marks the session started the first time', async () => {
    const { session, child } = await legsSession();
    await logSet(child.id, SET);
    expect((await db.sessions.get(session.id))?.started_at).not.toBeNull();
  });

  it('claims a materialized session so the plan never rewrites it', async () => {
    const squat = await makeExercise('Squat');
    const planned = await insertRow<Session>(
      'sessions',
      {
        date: MON,
        kind: 'strength',
        status: 'planned',
        template_id: null,
        was_planned: true,
        energy: null,
        notes: null,
        started_at: null,
        completed_at: null,
      },
      { system: true },
    );
    const child = await addExerciseToSession(planned.id, squat);
    expect(isSystemTimestamp((await db.sessions.get(planned.id))!.updated_at)).toBe(false);
    await logSet(child.id, SET);
    expect(isSystemTimestamp((await db.sessions.get(planned.id))!.updated_at)).toBe(false);
  });
});

describe('editing sets', () => {
  it('updates a set, validating it first', async () => {
    const { child } = await legsSession();
    const s = await logSet(child.id, SET);
    await expect(updateSet(s.id, { ...SET, reps: 0 })).rejects.toThrow(/Reps/);
    await updateSet(s.id, { ...SET, reps: 6, rpe: 9 });
    expect(await db.set_entries.get(s.id)).toMatchObject({ reps: 6, rpe: 9 });
  });

  it('soft-deletes a set', async () => {
    const { child } = await legsSession();
    const s = await logSet(child.id, SET);
    await deleteSet(s.id);
    expect(await setsOf(child.id)).toEqual([]);
  });
});

describe('exercises within a session', () => {
  it('appends an exercise with its defaults as targets', async () => {
    const { session } = await legsSession();
    const lunge = await makeExercise('Lunge');
    const added = await addExerciseToSession(session.id, lunge);
    expect(added).toMatchObject({ position: 1, exercise_id: lunge.id, target_sets: 3, target_reps: 5 });
  });

  it('removes an exercise together with its sets', async () => {
    const { child } = await legsSession();
    await logSet(child.id, SET);
    await removeExerciseFromSession(child.id);
    expect((await db.session_exercises.get(child.id))?._deleted).toBe(1);
    expect(await setsOf(child.id)).toEqual([]);
  });

  it('stores a trimmed note, or none', async () => {
    const { child } = await legsSession();
    await setExerciseNote(child.id, '  knee felt fine  ');
    expect((await db.session_exercises.get(child.id))?.notes).toBe('knee felt fine');
    await setExerciseNote(child.id, '   ');
    expect((await db.session_exercises.get(child.id))?.notes).toBeNull();
  });
});

describe('finishSession', () => {
  it('records status, energy, notes and completion', async () => {
    const { session } = await legsSession();
    await finishSession(session.id, { status: 'partial', energy: 4, notes: 'short on time' });
    const stored = await db.sessions.get(session.id);
    expect(stored).toMatchObject({ status: 'partial', energy: 4, notes: 'short on time' });
    expect(stored?.completed_at).not.toBeNull();
    expect(stored?.started_at).not.toBeNull();
  });

  it('keeps an existing start time', async () => {
    const { session, child } = await legsSession();
    await logSet(child.id, SET);
    const started = (await db.sessions.get(session.id))?.started_at;
    await finishSession(session.id, { status: 'done', energy: null, notes: null });
    expect((await db.sessions.get(session.id))?.started_at).toBe(started);
  });
});
```

`src/features/log/sessionView.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { makeExercise, makeWorkout, resetDb } from '../../test/fixtures';
import { removeSession, createSessionFromTemplate } from './sessionsRepo';
import { loadLastTime, loadSessionView } from './sessionView';
import { finishSession, logSet } from './setsRepo';

const SET = { reps: 5, weight_kg: 100, rpe: 8, is_warmup: false };

beforeEach(resetDb);

describe('loadSessionView', () => {
  it('loads a session with its exercises and live sets in order', async () => {
    const squat = await makeExercise('Squat');
    const bench = await makeExercise('Bench');
    const w = await makeWorkout('Full', [squat, bench]);
    const session = await createSessionFromTemplate('2026-10-05', w.id, { wasPlanned: true });
    const children = (await db.session_exercises.where('session_id').equals(session.id).toArray()).sort(
      (a, b) => a.position - b.position,
    );
    await logSet(children[0].id, SET);
    await logSet(children[0].id, { ...SET, reps: 4 });

    const view = await loadSessionView(session.id);
    expect(view?.title).toBe('Full');
    expect(view?.blocks.map((b) => b.exercise?.name)).toEqual(['Squat', 'Bench']);
    expect(view?.blocks[0].sets.map((s) => s.reps)).toEqual([5, 4]);
    expect(view?.templateItems).toHaveLength(2);
  });

  it('is null for a removed session', async () => {
    const session = await createSessionFromTemplate('2026-10-05', null, { wasPlanned: false });
    await removeSession(session.id);
    expect(await loadSessionView(session.id)).toBeNull();
  });
});

describe('loadLastTime', () => {
  it("finds the previous session's working sets for an exercise", async () => {
    const squat = await makeExercise('Squat');
    const w = await makeWorkout('Legs', [squat]);
    const before = await createSessionFromTemplate('2026-10-01', w.id, { wasPlanned: true });
    const [beforeChild] = await db.session_exercises.where('session_id').equals(before.id).toArray();
    await logSet(beforeChild.id, { ...SET, weight_kg: 97.5 });
    await finishSession(before.id, { status: 'done', energy: null, notes: null });
    const now = await createSessionFromTemplate('2026-10-05', w.id, { wasPlanned: true });

    const sets = await loadLastTime(squat.id, now.id, '2026-10-05');
    expect(sets.map((s) => s.weight_kg)).toEqual([97.5]);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/features/log/setsRepo.test.ts src/features/log/sessionView.test.ts`
Expected: FAIL — modules `./setsRepo` and `./sessionView` do not exist.

- [ ] **Step 3: Implement the logging repository**

`src/features/log/setsRepo.ts` (new file):

```ts
import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import { isSystemTimestamp, nowISO } from '../../lib/time';
import type { Exercise, Local, Session, SessionExercise, SetEntry, UUID } from '../../types/domain';
import { validateSet, type FinishedStatus, type SetDraft } from './setRules';

function assertValid(draft: SetDraft): number {
  const messages = Object.values(validateSet(draft));
  if (messages.length > 0 || draft.rpe === null) throw new Error(messages.join('; '));
  return draft.rpe;
}

/**
 * Makes a session the user's. The first write into a materialized session —
 * a set, an added exercise, a note — gives it a real timestamp, so the plan
 * never rewrites a session the user has begun. Logging also records the start.
 */
async function claimSession(sessionId: UUID, opts: { start: boolean }): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session) return;
  if (opts.start && !session.started_at) {
    await updateRow<Session>('sessions', sessionId, { started_at: nowISO() });
  } else if (isSystemTimestamp(session.updated_at)) {
    await updateRow<Session>('sessions', sessionId, {});
  }
}

export async function logSet(sessionExerciseId: UUID, draft: SetDraft): Promise<Local<SetEntry>> {
  const rpe = assertValid(draft);
  return db.transaction('rw', [db.sessions, db.session_exercises, db.set_entries], async () => {
    const child = await db.session_exercises.get(sessionExerciseId);
    if (!child) throw new Error(`session_exercises: no row with id ${sessionExerciseId}`);

    // Max over every set, deleted ones included, so an index is never reused.
    const existing = await db.set_entries.where('session_exercise_id').equals(sessionExerciseId).toArray();
    const setIndex = existing.reduce((max, s) => Math.max(max, s.set_index + 1), 0);

    const row = await insertRow<SetEntry>('set_entries', {
      session_exercise_id: sessionExerciseId,
      set_index: setIndex,
      reps: draft.reps,
      weight_kg: draft.weight_kg,
      rpe,
      is_warmup: draft.is_warmup,
      notes: null,
    });
    await claimSession(child.session_id, { start: true });
    return row;
  });
}

export async function updateSet(id: UUID, draft: SetDraft): Promise<void> {
  const rpe = assertValid(draft);
  await updateRow<SetEntry>('set_entries', id, {
    reps: draft.reps,
    weight_kg: draft.weight_kg,
    rpe,
    is_warmup: draft.is_warmup,
  });
}

export async function deleteSet(id: UUID): Promise<void> {
  await softDeleteRow('set_entries', id);
}

export async function addExerciseToSession(sessionId: UUID, exercise: Exercise): Promise<Local<SessionExercise>> {
  return db.transaction('rw', [db.sessions, db.session_exercises], async () => {
    const children = (await db.session_exercises.where('session_id').equals(sessionId).toArray()).filter(
      (c) => c._deleted === 0,
    );
    const position = children.reduce((max, c) => Math.max(max, c.position + 1), 0);
    const child = await insertRow<SessionExercise>('session_exercises', {
      session_id: sessionId,
      exercise_id: exercise.id,
      position,
      notes: null,
      target_sets: exercise.default_sets,
      target_reps: exercise.default_reps,
      target_weight_kg: exercise.default_weight_kg,
    });
    await claimSession(sessionId, { start: false });
    return child;
  });
}

export async function removeExerciseFromSession(sessionExerciseId: UUID): Promise<void> {
  await db.transaction('rw', [db.sessions, db.session_exercises, db.set_entries], async () => {
    const child = await db.session_exercises.get(sessionExerciseId);
    if (!child) return;
    const sets = await db.set_entries.where('session_exercise_id').equals(sessionExerciseId).toArray();
    for (const s of sets) if (s._deleted === 0) await softDeleteRow('set_entries', s.id);
    await softDeleteRow('session_exercises', sessionExerciseId);
    await claimSession(child.session_id, { start: false });
  });
}

export async function setExerciseNote(sessionExerciseId: UUID, notes: string): Promise<void> {
  await db.transaction('rw', [db.sessions, db.session_exercises], async () => {
    const child = await updateRow<SessionExercise>('session_exercises', sessionExerciseId, {
      notes: notes.trim() || null,
    });
    await claimSession(child.session_id, { start: false });
  });
}

export async function finishSession(
  sessionId: UUID,
  outcome: { status: FinishedStatus; energy: number | null; notes: string | null },
): Promise<void> {
  const session = await db.sessions.get(sessionId);
  if (!session) throw new Error(`sessions: no row with id ${sessionId}`);
  const now = nowISO();
  await updateRow<Session>('sessions', sessionId, {
    status: outcome.status,
    energy: outcome.energy,
    notes: outcome.notes,
    completed_at: now,
    started_at: session.started_at ?? now,
  });
}
```

- [ ] **Step 4: Implement the session loader**

`src/features/log/sessionView.ts` (new file):

```ts
import { db } from '../../db/schema';
import type {
  Exercise,
  ISODate,
  Local,
  Run,
  Session,
  SessionExercise,
  SetEntry,
  UUID,
  WorkoutTemplateItem,
} from '../../types/domain';
import { sessionTitle } from './cards';
import { lastTimeSets } from './prefill';

export interface ExerciseBlock {
  child: Local<SessionExercise>;
  exercise: Local<Exercise> | undefined;
  /** Live sets, in set order. */
  sets: Local<SetEntry>[];
}

export interface SessionView {
  session: Local<Session>;
  title: string;
  blocks: ExerciseBlock[];
  run: Local<Run> | null;
  /** The workout's items, for rest times and run targets. Empty for an unplanned session. */
  templateItems: Local<WorkoutTemplateItem>[];
}

/** One session with everything its logging screen needs. Null once removed. Safe inside useLiveQuery. */
export async function loadSessionView(sessionId: UUID): Promise<SessionView | null> {
  const session = await db.sessions.get(sessionId);
  if (!session || session._deleted === 1) return null;

  const children = (await db.session_exercises.where('session_id').equals(sessionId).toArray())
    .filter((c) => c._deleted === 0)
    .sort((a, b) => a.position - b.position);
  const exerciseById = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  const sets =
    children.length > 0
      ? (await db.set_entries.where('session_exercise_id').anyOf(children.map((c) => c.id)).toArray()).filter(
          (s) => s._deleted === 0,
        )
      : [];
  const run = (await db.runs.where('session_id').equals(sessionId).toArray()).find((r) => r._deleted === 0) ?? null;
  const template = session.template_id ? await db.workout_templates.get(session.template_id) : undefined;
  const templateItems = session.template_id
    ? (await db.workout_template_items.where('template_id').equals(session.template_id).toArray()).filter(
        (i) => i._deleted === 0,
      )
    : [];

  const runExerciseId =
    run?.exercise_id ?? children.find((c) => exerciseById.get(c.exercise_id)?.modality === 'cardio')?.exercise_id;

  return {
    session,
    title: sessionTitle(session, template?.name, runExerciseId ? exerciseById.get(runExerciseId)?.name : undefined),
    blocks: children.map((child) => ({
      child,
      exercise: exerciseById.get(child.exercise_id),
      sets: sets.filter((s) => s.session_exercise_id === child.id).sort((a, b) => a.set_index - b.set_index),
    })),
    run,
    templateItems,
  };
}

/** Last time's working sets for an exercise, for pre-filling. Safe inside useLiveQuery. */
export async function loadLastTime(exerciseId: UUID, sessionId: UUID, date: ISODate): Promise<Local<SetEntry>[]> {
  const children = await db.session_exercises.where('exercise_id').equals(exerciseId).toArray();
  if (children.length === 0) return [];
  const sessionIds = [...new Set(children.map((c) => c.session_id))];
  const sessions = (await db.sessions.bulkGet(sessionIds)).filter((s): s is Local<Session> => s !== undefined);
  const sets = await db.set_entries.where('session_exercise_id').anyOf(children.map((c) => c.id)).toArray();
  return lastTimeSets({
    exerciseId,
    currentSessionId: sessionId,
    currentDate: date,
    sessions,
    sessionExercises: children,
    sets,
  });
}
```

- [ ] **Step 5: Run them**

Run: `npx vitest run src/features/log/setsRepo.test.ts src/features/log/sessionView.test.ts`
Expected: PASS, 14 tests

Run: `npx tsc -b` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/log/setsRepo.ts src/features/log/setsRepo.test.ts src/features/log/sessionView.ts src/features/log/sessionView.test.ts
git commit -m "feat: log, edit and delete sets; the first write claims a planned session"
```

---

## Task 22: Preferences and the rest timer

**Files:**
- Create: `src/features/settings/prefsRepo.ts`, `src/features/settings/prefsRepo.test.ts`, `src/features/settings/usePrefs.ts`, `src/features/log/restTimer.ts`, `src/features/log/restTimer.test.ts`, `src/features/log/useRestTimer.ts`
- Modify: `src/app/bootstrap.ts`

- [ ] **Step 1: Write the failing tests**

`src/features/settings/prefsRepo.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { isSystemTimestamp } from '../../lib/time';
import { USER, markSynced, resetDb } from '../../test/fixtures';
import { DEFAULT_PREFS, ensurePrefs, prefsId, updatePrefs } from './prefsRepo';

beforeEach(resetDb);

describe('preferences', () => {
  it('wait for the first sync', async () => {
    expect(await ensurePrefs(USER)).toBeUndefined();
    await expect(updatePrefs(USER, { vibration: false })).rejects.toThrow(/first sync/);
  });

  it('start from the defaults, as a system write with a shared id', async () => {
    await markSynced();
    const result = await ensurePrefs(USER);
    expect(result?.created).toBe(true);
    expect(result?.prefs).toMatchObject({ id: prefsId(USER), ...DEFAULT_PREFS });
    expect(isSystemTimestamp(result!.prefs.updated_at)).toBe(true);
  });

  it('are created once', async () => {
    await markSynced();
    await Promise.all([ensurePrefs(USER), ensurePrefs(USER)]);
    expect((await ensurePrefs(USER))?.created).toBe(false);
    expect(await db.user_prefs.count()).toBe(1);
  });

  it('record a change as a user edit', async () => {
    await markSynced();
    await updatePrefs(USER, { rest_seconds_default: 90 });
    const row = await db.user_prefs.get(prefsId(USER));
    expect(row?.rest_seconds_default).toBe(90);
    expect(isSystemTimestamp(row!.updated_at)).toBe(false);
  });
});
```

`src/features/log/restTimer.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { STALE_AFTER_MS, extendRest, isStale, parseStoredTimer, remainingSeconds, startRest } from './restTimer';

const T0 = 1_000_000;

describe('rest timer', () => {
  it('counts down from an absolute end time', () => {
    const t = startRest(T0, 90);
    expect(remainingSeconds(t, T0)).toBe(90);
    expect(remainingSeconds(t, T0 + 30_000)).toBe(60);
  });

  it('rounds partial seconds up, so it never shows 0 early', () => {
    expect(remainingSeconds(startRest(T0, 90), T0 + 89_100)).toBe(1);
  });

  it('stops at zero', () => {
    expect(remainingSeconds(startRest(T0, 90), T0 + 500_000)).toBe(0);
  });

  it('survives a long gap with no ticks, as when the screen is off', () => {
    const t = startRest(T0, 120);
    expect(remainingSeconds(t, T0 + 100_000)).toBe(20);
  });

  it('extends a running timer from its end', () => {
    const t = extendRest(startRest(T0, 60), 30, T0 + 10_000);
    expect(remainingSeconds(t, T0 + 10_000)).toBe(80);
  });

  it('extends a finished timer from now', () => {
    const t = extendRest(startRest(T0, 60), 30, T0 + 100_000);
    expect(remainingSeconds(t, T0 + 100_000)).toBe(30);
  });

  it('forgets a timer that ran out long ago', () => {
    const t = startRest(T0, 60);
    expect(isStale(t, T0 + 60_000 + STALE_AFTER_MS + 1)).toBe(true);
    expect(isStale(t, T0 + 61_000)).toBe(false);
  });

  it('reads back a stored timer and rejects garbage', () => {
    expect(parseStoredTimer(JSON.stringify({ endsAt: 5 }))).toEqual({ endsAt: 5 });
    expect(parseStoredTimer('nonsense')).toBeNull();
    expect(parseStoredTimer(null)).toBeNull();
    expect(parseStoredTimer('{"endsAt":"soon"}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/features/settings/prefsRepo.test.ts src/features/log/restTimer.test.ts`
Expected: FAIL — modules `./prefsRepo` and `./restTimer` do not exist.

- [ ] **Step 3: Implement preferences**

`src/features/settings/prefsRepo.ts` (new file):

```ts
import { db } from '../../db/schema';
import { insertRow, updateRow } from '../../db/repo';
import { hasCompletedSync } from '../../db/syncState';
import { deterministicId } from '../../lib/uuidv5';
import type { Local, UUID, UserPrefs } from '../../types/domain';

export type Prefs = Pick<UserPrefs, 'rest_seconds_default' | 'vibration' | 'theme'>;

export const DEFAULT_PREFS: Prefs = { rest_seconds_default: 120, vibration: true, theme: 'dark' };

export function prefsId(userId: string): UUID {
  return deterministicId(`${userId}:user_prefs`);
}

/** The single preferences row, created from the defaults after the first sync. */
export async function ensurePrefs(userId: string): Promise<{ prefs: Local<UserPrefs>; created: boolean } | undefined> {
  if (!(await hasCompletedSync())) return undefined;
  const id = prefsId(userId);
  return db.transaction('rw', db.user_prefs, async () => {
    const existing = await db.user_prefs.get(id);
    if (existing) return { prefs: existing, created: false };
    return { prefs: await insertRow<UserPrefs>('user_prefs', DEFAULT_PREFS, { id, system: true }), created: true };
  });
}

export async function updatePrefs(userId: string, patch: Partial<Prefs>): Promise<void> {
  const ensured = await ensurePrefs(userId);
  if (!ensured) throw new Error('Preferences are available once the first sync completes');
  await updateRow<UserPrefs>('user_prefs', ensured.prefs.id, patch);
}
```

`src/features/settings/usePrefs.ts` (new file):

```ts
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { DEFAULT_PREFS, prefsId, type Prefs } from './prefsRepo';

/** Current preferences, falling back to the defaults until the row exists. */
export function usePrefs(userId: string): Prefs {
  const row = useLiveQuery(async () => (await db.user_prefs.get(prefsId(userId))) ?? null, [userId]);
  return row
    ? { rest_seconds_default: row.rest_seconds_default, vibration: row.vibration, theme: row.theme }
    : DEFAULT_PREFS;
}
```

- [ ] **Step 4: Include preferences in first-time setup**

`src/app/bootstrap.ts` (replace the whole file):

```ts
import { seedExercises } from '../db/seed';
import { ensureWeekPlan } from '../features/plan/planRepo';
import { ensurePrefs } from '../features/settings/prefsRepo';
import type { ISODate } from '../types/domain';

/**
 * One-time setup that must wait for the first completed sync. Each step is
 * idempotent and runs after every sync, so a fresh install picks up the
 * account's existing rows first and only creates what is genuinely missing.
 *
 * Returns true if anything was written that should be pushed now.
 */
export async function bootstrapAfterSync(userId: string, todayDate: ISODate): Promise<boolean> {
  const seeded = await seedExercises();
  const plan = await ensureWeekPlan(userId, todayDate);
  const prefs = await ensurePrefs(userId);
  return seeded > 0 || Boolean(plan?.created) || Boolean(prefs?.created);
}
```

- [ ] **Step 5: Implement the rest timer**

`src/features/log/restTimer.ts` (new file):

```ts
/** A rest timer is just its end time. Remaining time is always computed, never counted. */
export interface RestTimer {
  endsAt: number;
}

/** A timer that ran out more than this long ago is forgotten rather than shown as "rest over". */
export const STALE_AFTER_MS = 10 * 60 * 1000;

export function startRest(now: number, seconds: number): RestTimer {
  return { endsAt: now + Math.max(0, seconds) * 1000 };
}

export function remainingSeconds(timer: RestTimer, now: number): number {
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

/** Adds time to the end, or to now if the rest is already over. */
export function extendRest(timer: RestTimer, seconds: number, now: number): RestTimer {
  return { endsAt: Math.max(timer.endsAt, now) + seconds * 1000 };
}

export function isStale(timer: RestTimer, now: number): boolean {
  return now - timer.endsAt > STALE_AFTER_MS;
}

export function parseStoredTimer(raw: string | null): RestTimer | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && typeof (value as { endsAt?: unknown }).endsAt === 'number') {
      return { endsAt: (value as { endsAt: number }).endsAt };
    }
    return null;
  } catch {
    return null;
  }
}
```

`src/features/log/useRestTimer.ts` (new file):

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { extendRest, isStale, parseStoredTimer, remainingSeconds, startRest, type RestTimer } from './restTimer';

const STORAGE_KEY = 'fit-tracker.rest-timer';

function load(): RestTimer | null {
  try {
    return parseStoredTimer(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function save(timer: RestTimer | null): void {
  try {
    if (timer) localStorage.setItem(STORAGE_KEY, JSON.stringify(timer));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable: the timer still works until the page is left.
  }
}

export interface RestTimerControls {
  active: boolean;
  done: boolean;
  remaining: number;
  start: (seconds: number) => void;
  extend: (seconds: number) => void;
  stop: () => void;
}

/**
 * The rest timer counts from an absolute end time, never from ticks. Android
 * throttles timers while the screen is off, so a countdown that decremented
 * on each interval would drift or stall between sets. The end time is kept
 * in localStorage, so leaving the screen or reloading does not lose it.
 */
export function useRestTimer(vibrate: boolean): RestTimerControls {
  const [timer, setTimer] = useState<RestTimer | null>(() => {
    const stored = load();
    return stored && !isStale(stored, Date.now()) ? stored : null;
  });
  const [now, setNow] = useState(() => Date.now());
  // A timer restored after it already finished must not buzz again.
  const notifiedFor = useRef<number | null>(timer && timer.endsAt <= Date.now() ? timer.endsAt : null);

  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [timer]);

  const remaining = timer ? remainingSeconds(timer, now) : 0;
  const done = timer !== null && remaining === 0;

  useEffect(() => {
    if (!timer || !done || notifiedFor.current === timer.endsAt) return;
    notifiedFor.current = timer.endsAt;
    if (vibrate && typeof navigator.vibrate === 'function') navigator.vibrate([300, 150, 300]);
  }, [timer, done, vibrate]);

  const start = useCallback((seconds: number) => {
    const next = startRest(Date.now(), seconds);
    save(next);
    setNow(Date.now());
    setTimer(next);
  }, []);

  const extend = useCallback((seconds: number) => {
    setTimer((current) => {
      if (!current) return current;
      const next = extendRest(current, seconds, Date.now());
      save(next);
      return next;
    });
    setNow(Date.now());
  }, []);

  const stop = useCallback(() => {
    save(null);
    setTimer(null);
  }, []);

  return { active: timer !== null, done, remaining, start, extend, stop };
}
```

Vibration here uses the web Vibration API, which works in the browser and in the Android WebView. Plan 3 switches it to Capacitor Haptics when it packages the APK, alongside the Android permission it needs.

- [ ] **Step 6: Run them**

Run: `npx vitest run src/features/settings/prefsRepo.test.ts src/features/log/restTimer.test.ts`
Expected: PASS, 12 tests

Run: `npm test` — all pass. `npx tsc -b` — clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/settings/prefsRepo.ts src/features/settings/prefsRepo.test.ts src/features/settings/usePrefs.ts src/features/log/restTimer.ts src/features/log/restTimer.test.ts src/features/log/useRestTimer.ts src/app/bootstrap.ts
git commit -m "feat: preferences row and a rest timer that survives the screen turning off"
```

---

## Task 23: RPE selector and rest timer bar

**Files:**
- Create: `src/features/log/RpeSelector.tsx`, `src/features/log/RestTimerBar.tsx`

- [ ] **Step 1: The RPE selector**

`src/features/log/RpeSelector.tsx` (new file):

```tsx
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
```

- [ ] **Step 2: The rest timer bar**

`src/features/log/RestTimerBar.tsx` (new file):

```tsx
import Button from '../../components/Button';
import { formatDuration } from '../../lib/running';
import type { RestTimerControls } from './useRestTimer';

/** Floats just above the tab bar while a rest is running, so it is visible from any exercise. */
export default function RestTimerBar({ timer }: { timer: RestTimerControls }) {
  if (!timer.active) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 px-4">
      <div
        role="timer"
        aria-label={timer.done ? 'Rest over' : `Rest, ${timer.remaining} seconds left`}
        className={`mx-auto flex max-w-xl items-center gap-2 rounded-2xl border px-4 py-2 shadow-lg ${
          timer.done ? 'border-green-500 bg-green-950' : 'border-border bg-surface'
        }`}
      >
        <span className="flex-1 text-2xl font-semibold tabular-nums">
          {timer.done ? 'Rest over' : formatDuration(timer.remaining)}
        </span>
        {!timer.done && <Button onClick={() => timer.extend(30)}>+30 s</Button>}
        <Button variant={timer.done ? 'primary' : 'secondary'} onClick={timer.stop}>
          {timer.done ? 'Dismiss' : 'Skip'}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc -b` — clean.

```bash
git add src/features/log/RpeSelector.tsx src/features/log/RestTimerBar.tsx
git commit -m "feat: one-thumb RPE selector and floating rest timer"
```

---

## Task 24: The Today screen

**Files:**
- Create: `src/features/log/TodayScreen.tsx`
- Modify: `src/app/Screen.tsx`

- [ ] **Step 1: Write the screen**

`src/features/log/TodayScreen.tsx` (new file):

```tsx
import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { routeHref, sessionRoute } from '../../app/routes';
import { navigate } from '../../app/useRoute';
import Button, { PRIMARY_LINK } from '../../components/Button';
import Loading from '../../components/Loading';
import PickList from '../../components/PickList';
import ScreenHeader from '../../components/ScreenHeader';
import StatusBadge from '../../components/StatusBadge';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatDateLong, formatKm } from '../../lib/format';
import { formatDuration, formatPace, paceSecondsPerKm } from '../../lib/running';
import { startOfWeek, today } from '../../lib/time';
import type { UUID } from '../../types/domain';
import { exerciseSummary } from '../library/exerciseRules';
import { materializeWeek } from '../plan/materialize';
import { loadSessionCards, type SessionCard } from './cards';
import { createSessionFromTemplate } from './sessionsRepo';

export default function TodayScreen() {
  const { userId } = useApp();
  const date = today();
  const [picking, setPicking] = useState<'run' | 'workout' | null>(null);

  useEffect(() => {
    void materializeWeek(userId, startOfWeek(date), date);
  }, [userId, date]);

  const cards = useLiveQuery(() => loadSessionCards(date, date), [date]);
  const options = useLiveQuery(
    async () => ({
      runs: (await db.exercises.where('modality').equals('cardio').toArray())
        .filter((e) => e._deleted === 0)
        .sort((a, b) => a.sort_order - b.sort_order),
      workouts: (await db.workout_templates.where('_deleted').equals(0).toArray()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }),
    [],
  );

  async function startWorkout(templateId: UUID | null) {
    const session = await createSessionFromTemplate(date, templateId, { wasPlanned: false });
    navigate({ name: 'session', id: session.id });
  }

  return (
    <section>
      <ScreenHeader title="Today" />
      <p className="-mt-3 mb-4 text-muted">{formatDateLong(date)}</p>

      {cards === undefined ? (
        <Loading />
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="font-medium">Rest day</p>
          <p className="text-sm text-muted">Nothing planned. Log something anyway, or enjoy the rest.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => (
            <TodayCard key={card.session.id} card={card} />
          ))}
        </ul>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button onClick={() => setPicking(picking === 'run' ? null : 'run')}>Log a run</Button>
        <Button onClick={() => setPicking(picking === 'workout' ? null : 'workout')}>Log a workout</Button>
      </div>

      {picking === 'run' && (
        <div className="mt-3">
          <PickList
            items={(options?.runs ?? []).map((e) => ({ id: e.id, label: e.name, detail: exerciseSummary(e) }))}
            onPick={(exerciseId) => navigate({ name: 'run-new', exerciseId, date })}
            empty="No run types in your library."
          />
        </div>
      )}

      {picking === 'workout' && (
        <div className="mt-3">
          <PickList
            items={[
              { id: '', label: 'Empty workout', detail: 'Add exercises as you go' },
              ...(options?.workouts ?? []).map((t) => ({ id: t.id, label: t.name })),
            ]}
            onPick={(id) => void startWorkout(id || null)}
          />
        </div>
      )}
    </section>
  );
}

function TodayCard({ card }: { card: SessionCard }) {
  const { session, run } = card;
  const action =
    session.status !== 'planned' ? 'Open' : card.workingSets > 0 || run ? 'Continue' : 'Start';
  const detail =
    session.kind === 'run'
      ? run
        ? `${formatKm(run.distance_km)} · ${formatDuration(run.duration_s)} · ${formatPace(paceSecondsPerKm(run.duration_s, run.distance_km))} /km`
        : 'Not logged yet'
      : `${card.workingSets} of ${card.targetSets} sets`;

  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-lg font-semibold">{card.title}</p>
          <p className="text-sm text-muted">{detail}</p>
        </div>
        <StatusBadge status={session.status} />
      </div>
      <a href={routeHref(sessionRoute(session))} className={`mt-3 ${PRIMARY_LINK}`}>
        {action}
      </a>
    </li>
  );
}
```

- [ ] **Step 2: Route to Today**

`src/app/Screen.tsx` (replace the whole file):

```tsx
import ComingSoon from '../components/ComingSoon';
import ExerciseForm from '../features/library/ExerciseForm';
import LibraryScreen from '../features/library/LibraryScreen';
import TodayScreen from '../features/log/TodayScreen';
import PlanDaysScreen from '../features/plan/PlanDaysScreen';
import WeekView from '../features/plan/WeekView';
import WorkoutEditor from '../features/plan/WorkoutEditor';
import WorkoutsScreen from '../features/plan/WorkoutsScreen';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'today':
      return <TodayScreen />;
    case 'plan':
      return <WeekView key={route.week ?? 'this-week'} week={route.week} />;
    case 'plan-days':
      return <PlanDaysScreen />;
    case 'workouts':
      return <WorkoutsScreen />;
    case 'workout':
      return <WorkoutEditor key={route.id} id={route.id} />;
    case 'library':
      return <LibraryScreen />;
    case 'exercise':
      return <ExerciseForm key={route.id} id={route.id} />;
    case 'progress':
      return <ProgressScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <ComingSoon title={route.name} />;
  }
}
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc -b` — clean.

```bash
git add src/features/log/TodayScreen.tsx src/app/Screen.tsx
git commit -m "feat: Today screen with planned sessions and quick logging"
```

---

## Task 25: The session logger

**Files:**
- Create: `src/features/log/ExercisePanel.tsx`, `src/features/log/FinishPanel.tsx`, `src/features/log/SessionLogger.tsx`
- Modify: `src/app/Screen.tsx`

- [ ] **Step 1: One exercise at a time**

`src/features/log/ExercisePanel.tsx` (new file):

```tsx
import { useEffect, useState } from 'react';
import { routeHref } from '../../app/routes';
import Button, { PRIMARY_LINK } from '../../components/Button';
import { Checkbox, TextAreaField } from '../../components/Fields';
import Stepper from '../../components/Stepper';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatKg } from '../../lib/format';
import type { Session, UUID } from '../../types/domain';
import { nextSetDraft, sameAsLastSet } from './prefill';
import RpeSelector from './RpeSelector';
import { loadLastTime, type ExerciseBlock } from './sessionView';
import { validateSet, type SetDraft, type SetErrors } from './setRules';
import { deleteSet, logSet, removeExerciseFromSession, setExerciseNote, updateSet } from './setsRepo';

export default function ExercisePanel({
  block,
  session,
  onLogged,
  onRemoved,
}: {
  block: ExerciseBlock;
  session: Session;
  onLogged: () => void;
  onRemoved: () => void;
}) {
  const { child, exercise, sets } = block;
  const name = exercise?.name ?? 'Exercise';
  const lastTime = useLiveQuery(
    () => loadLastTime(child.exercise_id, session.id, session.date),
    [child.exercise_id, session.id, session.date],
  );
  const [editing, setEditing] = useState<UUID | null>(null);
  const [draft, setDraft] = useState<SetDraft | null>(null);
  const [errors, setErrors] = useState<SetErrors>({});

  // Recompute the suggested set when the exercise, the number of sets, or last
  // time's sets change — but never while a logged set is being edited, and not
  // just because a sync re-delivered identical data.
  const lastTimeKey = lastTime?.map((s) => s.id).join(',');
  useEffect(() => {
    if (editing || lastTime === undefined) return;
    setDraft(
      nextSetDraft({
        logged: sets,
        lastTime,
        targetReps: child.target_reps,
        targetWeightKg: child.target_weight_kg,
        defaultReps: exercise?.default_reps ?? null,
        defaultWeightKg: exercise?.default_weight_kg ?? null,
      }),
    );
    setErrors({});
  }, [child.id, sets.length, lastTimeKey, editing]);

  if (exercise?.modality === 'cardio') {
    return (
      <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
        <p className="text-lg font-semibold">{name}</p>
        <a href={routeHref({ name: 'run', id: session.id })} className={PRIMARY_LINK}>
          Log this run
        </a>
      </div>
    );
  }

  async function submit() {
    if (!draft) return;
    const found = validateSet(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (editing) {
      await updateSet(editing, draft);
      setEditing(null);
    } else {
      await logSet(child.id, draft);
      onLogged();
    }
  }

  let workingNumber = 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{name}</h2>
        {lastTime && lastTime.length > 0 && (
          <p className="text-sm text-muted">Last time: {lastTime.map((s) => `${s.reps}×${s.weight_kg}`).join(', ')}</p>
        )}
      </div>

      {sets.length > 0 && (
        <ol className="space-y-1">
          {sets.map((s) => {
            if (!s.is_warmup) workingNumber++;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(s.id);
                    setDraft({ reps: s.reps, weight_kg: s.weight_kg, rpe: s.rpe, is_warmup: s.is_warmup });
                    setErrors({});
                  }}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 ${editing === s.id ? 'bg-accent/15' : 'bg-surface'}`}
                >
                  <span className="w-16 text-left text-sm text-muted">{s.is_warmup ? 'Warm-up' : `Set ${workingNumber}`}</span>
                  <span className="flex-1 text-left tabular-nums">
                    {s.reps} × {formatKg(s.weight_kg)}
                  </span>
                  <span className="text-sm tabular-nums">RPE {s.rpe}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {draft && (
        <div className="space-y-4 rounded-2xl border border-border p-3">
          <p className="text-sm text-muted">{editing ? 'Edit set' : 'Next set'}</p>
          <Stepper label="Reps" value={draft.reps} step={1} min={1} max={100} onChange={(reps) => setDraft({ ...draft, reps })} />
          {errors.reps && <p role="alert" className="text-sm text-red-400">{errors.reps}</p>}
          <Stepper label="kg" value={draft.weight_kg} step={2.5} min={0} max={1000} onChange={(weight_kg) => setDraft({ ...draft, weight_kg })} />
          {errors.weight_kg && <p role="alert" className="text-sm text-red-400">{errors.weight_kg}</p>}
          <RpeSelector value={draft.rpe} onChange={(rpe) => setDraft({ ...draft, rpe })} />
          {errors.rpe && <p role="alert" className="text-sm text-red-400">{errors.rpe}</p>}
          <Checkbox label="Warm-up set" checked={draft.is_warmup} onChange={(is_warmup) => setDraft({ ...draft, is_warmup })} />

          {editing ? (
            <div className="grid grid-cols-3 gap-2">
              <Button onClick={() => setEditing(null)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  if (!window.confirm('Delete this set?')) return;
                  await deleteSet(editing);
                  setEditing(null);
                }}
              >
                Delete
              </Button>
              <Button variant="primary" onClick={() => void submit()}>
                Save
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <Button
                disabled={sameAsLastSet(sets) === null}
                onClick={() => {
                  const copy = sameAsLastSet(sets);
                  if (copy) setDraft(copy);
                }}
              >
                Same as last
              </Button>
              <Button variant="primary" className="min-h-14 text-lg" onClick={() => void submit()}>
                Log set
              </Button>
            </div>
          )}
        </div>
      )}

      <TextAreaField
        key={child.id}
        label="Exercise note"
        rows={2}
        defaultValue={child.notes ?? ''}
        onBlur={(value) => {
          if (value.trim() !== (child.notes ?? '')) void setExerciseNote(child.id, value);
        }}
      />

      <Button
        variant="ghost"
        onClick={async () => {
          if (!window.confirm(`Remove ${name} and its sets from this session?`)) return;
          await removeExerciseFromSession(child.id);
          onRemoved();
        }}
      >
        Remove exercise
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Finishing a session**

`src/features/log/FinishPanel.tsx` (new file):

```tsx
import { useState } from 'react';
import Button from '../../components/Button';
import { Segmented, TextAreaField } from '../../components/Fields';
import { isWorkingSet } from '../../lib/strength';
import { removeSession } from './sessionsRepo';
import type { SessionView } from './sessionView';
import { suggestStatus, type FinishedStatus } from './setRules';
import { finishSession } from './setsRepo';

export default function FinishPanel({
  view,
  onCancel,
  onDone,
}: {
  view: SessionView;
  onCancel: () => void;
  onDone: () => void;
}) {
  const suggested = suggestStatus(
    view.blocks
      .filter((b) => b.exercise?.modality !== 'cardio')
      .map((b) => ({ targetSets: b.child.target_sets, workingSets: b.sets.filter(isWorkingSet).length })),
  );
  const current = view.session.status;
  const [status, setStatus] = useState<FinishedStatus>(current === 'planned' ? suggested : current);
  const [energy, setEnergy] = useState<number | null>(view.session.energy);
  const [notes, setNotes] = useState(view.session.notes ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await finishSession(view.session.id, { status, energy, notes: notes.trim() || null });
    onDone();
  }

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Finish session</h2>
      <Segmented<FinishedStatus>
        label="Status"
        value={status}
        options={[
          { value: 'done', label: 'Done' },
          { value: 'partial', label: 'Partial' },
          { value: 'skipped', label: 'Skipped' },
        ]}
        onChange={setStatus}
      />
      <div className="space-y-1">
        <p className="text-sm text-muted">Energy</p>
        <Segmented
          label="Energy, 1 to 5"
          value={energy === null ? '' : String(energy)}
          options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))}
          onChange={(v) => setEnergy(Number(v))}
        />
      </div>
      <TextAreaField label="Session notes" value={notes} onChange={setNotes} />
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <Button onClick={onCancel}>Back</Button>
        <Button variant="primary" disabled={saving} onClick={() => void save()}>
          Save
        </Button>
      </div>
      <Button
        variant="danger"
        block
        onClick={async () => {
          if (!window.confirm('Delete this session and everything logged in it?')) return;
          await removeSession(view.session.id);
          onDone();
        }}
      >
        Delete session
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: The screen**

`src/features/log/SessionLogger.tsx` (new file):

```tsx
import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import type { Route } from '../../app/routes';
import { navigate } from '../../app/useRoute';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import StatusBadge from '../../components/StatusBadge';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatDateLong } from '../../lib/format';
import { isWorkingSet } from '../../lib/strength';
import type { UUID } from '../../types/domain';
import ExercisePicker from '../library/ExercisePicker';
import { usePrefs } from '../settings/usePrefs';
import ExercisePanel from './ExercisePanel';
import FinishPanel from './FinishPanel';
import RestTimerBar from './RestTimerBar';
import { loadSessionView, type ExerciseBlock, type SessionView } from './sessionView';
import { addExerciseToSession } from './setsRepo';
import { useRestTimer } from './useRestTimer';

/** The first strength exercise that still has sets to do, else the first. */
function firstIncomplete(blocks: ExerciseBlock[]): number {
  const i = blocks.findIndex(
    (b) => b.exercise?.modality !== 'cardio' && b.sets.filter(isWorkingSet).length < (b.child.target_sets ?? 1),
  );
  return i === -1 ? 0 : i;
}

function restSecondsFor(block: ExerciseBlock, view: SessionView, fallback: number): number {
  const item = view.templateItems.find((i) => i.exercise_id === block.child.exercise_id);
  return item?.rest_seconds ?? fallback;
}

export default function SessionLogger({ id, from }: { id: UUID; from?: 'log' }) {
  const { userId, requestSync } = useApp();
  const prefs = usePrefs(userId);
  const timer = useRestTimer(prefs.vibration);
  const view = useLiveQuery(() => loadSessionView(id), [id]);
  const [index, setIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<'log' | 'add' | 'finish'>('log');
  const back: Route = from === 'log' ? { name: 'log' } : { name: 'today' };

  // A pure run belongs on the run logger.
  useEffect(() => {
    if (view?.session.kind === 'run') navigate(from ? { name: 'run', id, from } : { name: 'run', id }, { replace: true });
  }, [view?.session.kind, id, from]);

  if (view === undefined) return <Loading />;
  if (view === null) return <NotFound what="session" back={back} />;

  const current = Math.min(index ?? firstIncomplete(view.blocks), Math.max(0, view.blocks.length - 1));
  const block = view.blocks[current];

  return (
    <section>
      <ScreenHeader title={view.title} back={back} />
      <p className="-mt-3 mb-4 flex items-center gap-2 text-sm text-muted">
        {formatDateLong(view.session.date)} <StatusBadge status={view.session.status} />
      </p>

      {view.blocks.length > 0 && (
        <div className="-mx-4 mb-4 overflow-x-auto px-4">
          <div className="flex gap-2">
            {view.blocks.map((b, i) => {
              const done = b.sets.filter(isWorkingSet).length;
              const cardio = b.exercise?.modality === 'cardio';
              return (
                <button
                  key={b.child.id}
                  type="button"
                  onClick={() => {
                    setIndex(i);
                    setMode('log');
                  }}
                  aria-current={i === current ? 'step' : undefined}
                  className={`min-h-11 shrink-0 rounded-full border px-3 text-sm ${i === current ? 'border-accent text-accent' : 'border-border text-muted'}`}
                >
                  {b.exercise?.name ?? 'Exercise'}
                  {!cardio && ` ${done}/${b.child.target_sets ?? '–'}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === 'log' &&
        (block ? (
          <ExercisePanel
            key={block.child.id}
            block={block}
            session={view.session}
            onLogged={() => timer.start(restSecondsFor(block, view, prefs.rest_seconds_default))}
            onRemoved={() => setIndex(null)}
          />
        ) : (
          <p className="my-6 text-muted">No exercises yet. Add one to start logging.</p>
        ))}

      {mode === 'add' && (
        <ExercisePicker
          onCancel={() => setMode('log')}
          onPick={async (exercise) => {
            await addExerciseToSession(id, exercise);
            setIndex(view.blocks.length);
            setMode('log');
          }}
        />
      )}

      {mode === 'finish' && (
        <FinishPanel
          view={view}
          onCancel={() => setMode('log')}
          onDone={() => {
            timer.stop();
            requestSync();
            navigate(back);
          }}
        />
      )}

      {mode === 'log' && (
        <div className="mt-6 grid grid-cols-2 gap-2">
          <Button onClick={() => setMode('add')}>+ Add exercise</Button>
          <Button variant="primary" onClick={() => setMode('finish')}>
            Finish
          </Button>
        </div>
      )}

      <RestTimerBar timer={timer} />
    </section>
  );
}
```

- [ ] **Step 4: Route to the logger**

`src/app/Screen.tsx` (replace the whole file):

```tsx
import ComingSoon from '../components/ComingSoon';
import ExerciseForm from '../features/library/ExerciseForm';
import LibraryScreen from '../features/library/LibraryScreen';
import SessionLogger from '../features/log/SessionLogger';
import TodayScreen from '../features/log/TodayScreen';
import PlanDaysScreen from '../features/plan/PlanDaysScreen';
import WeekView from '../features/plan/WeekView';
import WorkoutEditor from '../features/plan/WorkoutEditor';
import WorkoutsScreen from '../features/plan/WorkoutsScreen';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'today':
      return <TodayScreen />;
    case 'session':
      return <SessionLogger key={route.id} id={route.id} from={route.from} />;
    case 'plan':
      return <WeekView key={route.week ?? 'this-week'} week={route.week} />;
    case 'plan-days':
      return <PlanDaysScreen />;
    case 'workouts':
      return <WorkoutsScreen />;
    case 'workout':
      return <WorkoutEditor key={route.id} id={route.id} />;
    case 'library':
      return <LibraryScreen />;
    case 'exercise':
      return <ExerciseForm key={route.id} id={route.id} />;
    case 'progress':
      return <ProgressScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <ComingSoon title={route.name} />;
  }
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc -b` — clean. `npm run build` — succeeds.

```bash
git add src/features/log/ExercisePanel.tsx src/features/log/FinishPanel.tsx src/features/log/SessionLogger.tsx src/app/Screen.tsx
git commit -m "feat: set-by-set session logger with RPE, prefill and rest timer"
```

---

## Task 26: Run rules and the run repository

**Files:**
- Create: `src/features/log/runRules.ts`, `src/features/log/runRules.test.ts`, `src/features/log/runsRepo.ts`, `src/features/log/runsRepo.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/features/log/runRules.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { base } from '../../test/fixtures';
import type { Run, RunSplit } from '../../types/domain';
import { draftFromRun, emptyRunDraft, pacePreview, parseDuration, validateRun, type RunDraft } from './runRules';

describe('parseDuration', () => {
  it('reads minutes and seconds', () => {
    expect(parseDuration('45:30')).toBe(2730);
    expect(parseDuration('0:59')).toBe(59);
  });

  it('reads hours, minutes and seconds', () => {
    expect(parseDuration('1:02:03')).toBe(3723);
  });

  it('reads a bare number as minutes', () => {
    expect(parseDuration('45')).toBe(2700);
    expect(parseDuration('7.5')).toBe(450);
  });

  it('rejects anything malformed', () => {
    for (const bad of ['', '  ', 'abc', '5:75', '1:60:00', '1::2', '-5', '1:2:3:4']) {
      expect(parseDuration(bad)).toBeNull();
    }
  });
});

describe('validateRun', () => {
  const ok: RunDraft = { ...emptyRunDraft(8), duration: '42:30', rpe: 6 };

  it('accepts a complete run', () => {
    expect(validateRun(ok)).toEqual({});
  });

  it('requires a distance, a duration and an RPE', () => {
    const errors = validateRun(emptyRunDraft(null));
    expect(errors.distance).toBeDefined();
    expect(errors.duration).toBeDefined();
    expect(errors.rpe).toBeDefined();
  });

  it('checks the heart rate only when given', () => {
    expect(validateRun({ ...ok, avgHr: 150 })).toEqual({});
    expect(validateRun({ ...ok, avgHr: 400 }).avgHr).toBeDefined();
  });

  it('ignores blank split rows but checks filled ones', () => {
    expect(validateRun({ ...ok, splits: [{ distance: null, duration: '' }] })).toEqual({});
    expect(validateRun({ ...ok, splits: [{ distance: 1, duration: 'soon' }] }).splits).toBeDefined();
  });
});

describe('pacePreview', () => {
  it('shows the pace live', () => {
    expect(pacePreview({ ...emptyRunDraft(10), duration: '50:00' })).toBe('5:00');
  });

  it('shows a dash until both fields are usable', () => {
    expect(pacePreview(emptyRunDraft(10))).toBe('—');
  });
});

describe('drafts', () => {
  it('round-trips a saved run through the form', () => {
    const run: Run = {
      ...base('r'),
      session_id: 's',
      exercise_id: 'e',
      run_type: 'tempo',
      distance_km: 8,
      duration_s: 3723,
      rpe: 7.5,
      avg_hr: 162,
      weather: 'Windy',
      route_note: 'Riverside',
    };
    const splits: RunSplit[] = [{ ...base('sp'), run_id: 'r', split_index: 0, distance_km: 1, duration_s: 290 }];
    const draft = draftFromRun(run, splits);
    expect(draft).toEqual({
      distance: 8,
      duration: '1:02:03',
      rpe: 7.5,
      avgHr: 162,
      weather: 'Windy',
      routeNote: 'Riverside',
      splits: [{ distance: 1, duration: '4:50' }],
    });
    expect(parseDuration(draft.duration)).toBe(3723);
  });
});
```

`src/features/log/runsRepo.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { makeExercise, makeWorkout, resetDb } from '../../test/fixtures';
import { emptyRunDraft, type RunDraft } from './runRules';
import { saveRun } from './runsRepo';
import { createSessionFromTemplate } from './sessionsRepo';

const MON = '2026-10-05';
const DRAFT: RunDraft = { ...emptyRunDraft(8), duration: '42:30', rpe: 6, splits: [{ distance: 1, duration: '5:10' }] };

beforeEach(resetDb);

async function liveRuns() {
  return (await db.runs.toArray()).filter((r) => r._deleted === 0);
}

describe('saveRun', () => {
  it('creates a finished, unplanned session for a run logged from scratch', async () => {
    const easy = await makeExercise('Easy Run', 'cardio');
    const sessionId = await saveRun({ sessionId: null, date: MON, exerciseId: easy.id, draft: DRAFT });

    expect(await db.sessions.get(sessionId)).toMatchObject({ kind: 'run', status: 'done', was_planned: false, date: MON });
    const [run] = await liveRuns();
    expect(run).toMatchObject({ session_id: sessionId, distance_km: 8, duration_s: 2550, rpe: 6, run_type: 'easy' });
    const splits = await db.run_splits.where('run_id').equals(run.id).toArray();
    expect(splits.map((s) => s.duration_s)).toEqual([310]);
  });

  it('updates the run in place on a second save, replacing its splits', async () => {
    const easy = await makeExercise('Easy Run', 'cardio');
    const sessionId = await saveRun({ sessionId: null, date: MON, exerciseId: easy.id, draft: DRAFT });
    await saveRun({
      sessionId,
      date: MON,
      exerciseId: easy.id,
      draft: { ...DRAFT, distance: 8.2, splits: [{ distance: 1, duration: '5:00' }, { distance: 1, duration: '4:55' }] },
    });

    const runs = await liveRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0].distance_km).toBe(8.2);
    // Rows sharing an index key come back in primary-key order — random UUIDs —
    // so sort before asserting order.
    const live = (await db.run_splits.where('run_id').equals(runs[0].id).toArray())
      .filter((s) => s._deleted === 0)
      .sort((a, b) => a.split_index - b.split_index);
    expect(live.map((s) => [s.split_index, s.duration_s])).toEqual([
      [0, 300],
      [1, 295],
    ]);
  });

  it('logs into a planned run session', async () => {
    const easy = await makeExercise('Easy Run', 'cardio');
    const planned = await createSessionFromTemplate(MON, (await makeWorkout('Easy', [easy])).id, { wasPlanned: true });
    const sessionId = await saveRun({ sessionId: planned.id, date: MON, exerciseId: easy.id, draft: DRAFT });
    expect(sessionId).toBe(planned.id);
    expect(await liveRuns()).toHaveLength(1);
  });

  it('refuses a run without an RPE and writes nothing', async () => {
    const easy = await makeExercise('Easy Run', 'cardio');
    await expect(
      saveRun({ sessionId: null, date: MON, exerciseId: easy.id, draft: { ...DRAFT, rpe: null } }),
    ).rejects.toThrow(/RPE/);
    expect(await db.sessions.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `npx vitest run src/features/log/runRules.test.ts src/features/log/runsRepo.test.ts`
Expected: FAIL — modules `./runRules` and `./runsRepo` do not exist.

- [ ] **Step 3: Implement the rules**

`src/features/log/runRules.ts` (new file):

```ts
import { formatDuration, formatPace, paceSecondsPerKm } from '../../lib/running';
import type { Run, RunSplit } from '../../types/domain';
import { isValidRpe } from './setRules';

export interface SplitDraft {
  distance: number | null;
  /** As typed: "4:50". */
  duration: string;
}

export interface RunDraft {
  distance: number | null;
  /** As typed: "45:30", "1:02:03", or minutes. */
  duration: string;
  rpe: number | null;
  avgHr: number | null;
  weather: string;
  routeNote: string;
  splits: SplitDraft[];
}

export type RunErrors = Partial<Record<'distance' | 'duration' | 'rpe' | 'avgHr' | 'splits', string>>;

/** "45:30" → 2730, "1:02:03" → 3723, "45" (minutes) → 2700. Null when malformed. */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (t === '') return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60);

  const parts = t.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  const [h, m, s] = nums.length === 3 ? nums : [0, nums[0], nums[1]];
  if (s >= 60 || (nums.length === 3 && m >= 60)) return null;
  return h * 3600 + m * 60 + s;
}

export function emptyRunDraft(distance: number | null): RunDraft {
  return { distance, duration: '', rpe: null, avgHr: null, weather: '', routeNote: '', splits: [] };
}

export function draftFromRun(run: Run, splits: RunSplit[]): RunDraft {
  return {
    distance: run.distance_km,
    duration: formatDuration(run.duration_s),
    rpe: run.rpe,
    avgHr: run.avg_hr,
    weather: run.weather ?? '',
    routeNote: run.route_note ?? '',
    splits: [...splits]
      .sort((a, b) => a.split_index - b.split_index)
      .map((s) => ({ distance: s.distance_km, duration: formatDuration(s.duration_s) })),
  };
}

/** Split rows the user actually filled in; fully blank rows are dropped. */
export function filledSplits(draft: RunDraft): SplitDraft[] {
  return draft.splits.filter((s) => s.distance !== null || s.duration.trim() !== '');
}

export function validateRun(draft: RunDraft): RunErrors {
  const errors: RunErrors = {};
  if (draft.distance === null || !(draft.distance > 0 && draft.distance <= 300)) errors.distance = 'Distance in km, above 0';
  const seconds = parseDuration(draft.duration);
  if (seconds === null || seconds <= 0) errors.duration = 'Time as 45:30, 1:02:03 or minutes';
  if (!isValidRpe(draft.rpe)) errors.rpe = 'Rate this run — RPE 1 to 10';
  if (draft.avgHr !== null && !(Number.isInteger(draft.avgHr) && draft.avgHr >= 30 && draft.avgHr <= 250)) {
    errors.avgHr = 'Heart rate 30–250, or leave blank';
  }
  const badSplit = filledSplits(draft).some(
    (s) => s.distance === null || !(s.distance > 0) || (parseDuration(s.duration) ?? 0) <= 0,
  );
  if (badSplit) errors.splits = 'Each split needs a distance and a time';
  return errors;
}

/** Pace for the form, updating as the user types. */
export function pacePreview(draft: RunDraft): string {
  const seconds = parseDuration(draft.duration);
  if (seconds === null || draft.distance === null) return '—';
  return formatPace(paceSecondsPerKm(seconds, draft.distance));
}
```

- [ ] **Step 4: Implement the repository**

`src/features/log/runsRepo.ts` (new file):

```ts
import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import { nowISO } from '../../lib/time';
import type { ISODate, Run, RunSplit, Session, UUID } from '../../types/domain';
import { filledSplits, parseDuration, validateRun, type RunDraft } from './runRules';

/**
 * Saves a run. With no session it creates a finished, unplanned run session;
 * otherwise it logs into the given one — a planned run, or the run inside a
 * mixed session. Saving again updates the same run and replaces its splits.
 * Returns the session id.
 */
export async function saveRun(args: {
  sessionId: UUID | null;
  date: ISODate;
  exerciseId: UUID;
  draft: RunDraft;
}): Promise<UUID> {
  const { draft } = args;
  const messages = Object.values(validateRun(draft));
  if (messages.length > 0) throw new Error(messages.join('; '));

  return db.transaction('rw', [db.sessions, db.runs, db.run_splits, db.exercises], async () => {
    const exercise = await db.exercises.get(args.exerciseId);

    let sessionId = args.sessionId;
    if (!sessionId) {
      const now = nowISO();
      const session = await insertRow<Session>('sessions', {
        date: args.date,
        kind: 'run',
        status: 'done',
        template_id: null,
        was_planned: false,
        energy: null,
        notes: null,
        started_at: now,
        completed_at: now,
      });
      sessionId = session.id;
    }

    const fields = {
      exercise_id: args.exerciseId,
      run_type: exercise?.run_type ?? ('easy' as const),
      distance_km: draft.distance ?? 0,
      duration_s: parseDuration(draft.duration) ?? 0,
      rpe: draft.rpe ?? 0,
      avg_hr: draft.avgHr,
      weather: draft.weather.trim() || null,
      route_note: draft.routeNote.trim() || null,
    };
    const existing = (await db.runs.where('session_id').equals(sessionId).toArray()).find((r) => r._deleted === 0);
    const run = existing
      ? await updateRow<Run>('runs', existing.id, fields)
      : await insertRow<Run>('runs', { session_id: sessionId, ...fields });

    for (const old of await db.run_splits.where('run_id').equals(run.id).toArray()) {
      if (old._deleted === 0) await softDeleteRow('run_splits', old.id);
    }
    let splitIndex = 0;
    for (const split of filledSplits(draft)) {
      await insertRow<RunSplit>('run_splits', {
        run_id: run.id,
        split_index: splitIndex++,
        distance_km: split.distance ?? 0,
        duration_s: parseDuration(split.duration) ?? 0,
      });
    }

    return sessionId;
  });
}
```

- [ ] **Step 5: Run them**

Run: `npx vitest run src/features/log/runRules.test.ts src/features/log/runsRepo.test.ts`
Expected: PASS, 15 tests

Run: `npx tsc -b` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/features/log/runRules.ts src/features/log/runRules.test.ts src/features/log/runsRepo.ts src/features/log/runsRepo.test.ts
git commit -m "feat: run logging rules and repository with splits"
```

---

## Task 27: The run logger

**Files:**
- Create: `src/features/log/RunLogger.tsx`
- Modify: `src/app/Screen.tsx`

- [ ] **Step 1: Write the screen**

`src/features/log/RunLogger.tsx` (new file):

```tsx
import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import type { Route } from '../../app/routes';
import { navigate } from '../../app/useRoute';
import Button, { IconButton } from '../../components/Button';
import { NumberField, Segmented, TextAreaField, TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatDateLong } from '../../lib/format';
import type { Exercise, ISODate, Local, RunSplit, Session, UUID, WorkoutTemplateItem } from '../../types/domain';
import RpeSelector from './RpeSelector';
import { draftFromRun, emptyRunDraft, pacePreview, validateRun, type RunDraft, type RunErrors } from './runRules';
import { saveRun } from './runsRepo';
import { removeSession } from './sessionsRepo';
import { loadSessionView } from './sessionView';
import { finishSession } from './setsRepo';

interface RunData {
  session: Local<Session> | null;
  date: ISODate;
  title: string;
  exercise: Local<Exercise> | undefined;
  target: Local<WorkoutTemplateItem> | undefined;
  draft: RunDraft;
}

export default function RunLogger({
  sessionId,
  exerciseId,
  date,
  from,
}: {
  sessionId?: UUID;
  exerciseId?: UUID;
  date?: ISODate;
  from?: 'log';
}) {
  const back: Route = from === 'log' ? { name: 'log' } : { name: 'today' };

  const data = useLiveQuery(async (): Promise<RunData | null> => {
    if (sessionId) {
      const view = await loadSessionView(sessionId);
      if (!view) return null;
      const cardio = view.blocks.find((b) => b.exercise?.modality === 'cardio');
      const runExerciseId = view.run?.exercise_id ?? cardio?.child.exercise_id;
      const exercise = runExerciseId ? await db.exercises.get(runExerciseId) : undefined;
      const target = view.templateItems.find((i) => i.exercise_id === runExerciseId);
      const splits: RunSplit[] = view.run
        ? (await db.run_splits.where('run_id').equals(view.run.id).toArray()).filter((s) => s._deleted === 0)
        : [];
      return {
        session: view.session,
        date: view.session.date,
        title: view.title,
        exercise,
        target,
        draft: view.run
          ? draftFromRun(view.run, splits)
          : emptyRunDraft(target?.target_distance_km ?? exercise?.default_distance_km ?? null),
      };
    }
    const exercise = exerciseId ? await db.exercises.get(exerciseId) : undefined;
    if (!exercise || !date) return null;
    return {
      session: null,
      date,
      title: exercise.name,
      exercise,
      target: undefined,
      draft: emptyRunDraft(exercise.default_distance_km),
    };
  }, [sessionId, exerciseId, date]);

  if (data === undefined) return <Loading />;
  if (data === null || !data.exercise) return <NotFound what="run" back={back} />;

  // Keyed on the run's identity so a sync re-delivering the same run does not
  // reset what the user is typing.
  return <RunForm key={data.session?.id ?? 'new'} data={data} exercise={data.exercise} back={back} />;
}

function RunForm({ data, exercise, back }: { data: RunData; exercise: Local<Exercise>; back: Route }) {
  const { requestSync } = useApp();
  const [draft, setDraft] = useState<RunDraft>(data.draft);
  const [energy, setEnergy] = useState<number | null>(data.session?.energy ?? null);
  const [notes, setNotes] = useState(data.session?.notes ?? '');
  const [errors, setErrors] = useState<RunErrors>({});
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<RunDraft>) => setDraft({ ...draft, ...patch });

  async function save() {
    const found = validateRun(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSaving(true);
    const sessionId = await saveRun({ sessionId: data.session?.id ?? null, date: data.date, exerciseId: exercise.id, draft });
    await finishSession(sessionId, { status: 'done', energy, notes: notes.trim() || null });
    requestSync();
    navigate(back);
  }

  const targetKm = data.target?.target_distance_km;

  return (
    <section>
      <ScreenHeader title={data.title} back={back} />
      <p className="-mt-3 mb-4 text-sm text-muted">
        {formatDateLong(data.date)}
        {targetKm ? ` · target ${targetKm} km` : ''}
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Distance (km)" value={draft.distance} error={errors.distance} onChange={(distance) => set({ distance })} />
          <TextField
            label="Time"
            placeholder="45:30"
            inputMode="text"
            value={draft.duration}
            error={errors.duration}
            hint="45:30, 1:02:03 or minutes"
            onChange={(e) => set({ duration: e.target.value })}
          />
        </div>

        <p className="text-center">
          <span className="text-4xl font-semibold tabular-nums">{pacePreview(draft)}</span>
          <span className="ml-1 text-muted">/km</span>
        </p>

        <RpeSelector value={draft.rpe} onChange={(rpe) => set({ rpe })} />
        {errors.rpe && <p role="alert" className="text-sm text-red-400">{errors.rpe}</p>}

        <NumberField label="Average heart rate (optional)" value={draft.avgHr} error={errors.avgHr} onChange={(avgHr) => set({ avgHr })} />

        <div className="space-y-2">
          <p className="text-sm text-muted">Splits (optional)</p>
          {draft.splits.map((split, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <NumberField
                  label={`Split ${i + 1} km`}
                  value={split.distance}
                  onChange={(distance) => set({ splits: draft.splits.map((s, j) => (j === i ? { ...s, distance } : s)) })}
                />
              </div>
              <div className="flex-1">
                <TextField
                  label="Time"
                  placeholder="4:50"
                  value={split.duration}
                  onChange={(e) =>
                    set({ splits: draft.splits.map((s, j) => (j === i ? { ...s, duration: e.target.value } : s)) })
                  }
                />
              </div>
              <IconButton label={`Remove split ${i + 1}`} onClick={() => set({ splits: draft.splits.filter((_, j) => j !== i) })}>
                ✕
              </IconButton>
            </div>
          ))}
          {errors.splits && <p role="alert" className="text-sm text-red-400">{errors.splits}</p>}
          <Button onClick={() => set({ splits: [...draft.splits, { distance: 1, duration: '' }] })}>+ Add split</Button>
        </div>

        <TextField label="Weather" value={draft.weather} onChange={(e) => set({ weather: e.target.value })} />
        <TextAreaField label="Route" rows={2} value={draft.routeNote} onChange={(routeNote) => set({ routeNote })} />

        <div className="space-y-1">
          <p className="text-sm text-muted">Energy</p>
          <Segmented
            label="Energy, 1 to 5"
            value={energy === null ? '' : String(energy)}
            options={['1', '2', '3', '4', '5'].map((v) => ({ value: v, label: v }))}
            onChange={(v) => setEnergy(Number(v))}
          />
        </div>
        <TextAreaField label="Notes" value={notes} onChange={setNotes} />

        <Button variant="primary" block className="min-h-14 text-lg" disabled={saving} onClick={() => void save()}>
          Save run
        </Button>

        {data.session && (
          <div className="grid grid-cols-2 gap-2">
            {data.session.status === 'planned' ? (
              <Button
                onClick={async () => {
                  await finishSession(data.session!.id, { status: 'skipped', energy: null, notes: notes.trim() || null });
                  requestSync();
                  navigate(back);
                }}
              >
                Skip this run
              </Button>
            ) : (
              <span />
            )}
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm('Delete this session and the run logged in it?')) return;
                await removeSession(data.session!.id);
                requestSync();
                navigate(back);
              }}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Route to the run logger**

`src/app/Screen.tsx` (replace the whole file):

```tsx
import ComingSoon from '../components/ComingSoon';
import ExerciseForm from '../features/library/ExerciseForm';
import LibraryScreen from '../features/library/LibraryScreen';
import RunLogger from '../features/log/RunLogger';
import SessionLogger from '../features/log/SessionLogger';
import TodayScreen from '../features/log/TodayScreen';
import PlanDaysScreen from '../features/plan/PlanDaysScreen';
import WeekView from '../features/plan/WeekView';
import WorkoutEditor from '../features/plan/WorkoutEditor';
import WorkoutsScreen from '../features/plan/WorkoutsScreen';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'today':
      return <TodayScreen />;
    case 'session':
      return <SessionLogger key={route.id} id={route.id} from={route.from} />;
    case 'run':
      return <RunLogger key={route.id} sessionId={route.id} from={route.from} />;
    case 'run-new':
      return <RunLogger key={`${route.exerciseId}:${route.date}`} exerciseId={route.exerciseId} date={route.date} />;
    case 'plan':
      return <WeekView key={route.week ?? 'this-week'} week={route.week} />;
    case 'plan-days':
      return <PlanDaysScreen />;
    case 'workouts':
      return <WorkoutsScreen />;
    case 'workout':
      return <WorkoutEditor key={route.id} id={route.id} />;
    case 'library':
      return <LibraryScreen />;
    case 'exercise':
      return <ExerciseForm key={route.id} id={route.id} />;
    case 'progress':
      return <ProgressScreen />;
    case 'settings':
      return <SettingsScreen />;
    default:
      return <ComingSoon title={route.name} />;
  }
}
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc -b` — clean. `npm run build` — succeeds.

```bash
git add src/features/log/RunLogger.tsx src/app/Screen.tsx
git commit -m "feat: run logger with live pace and splits"
```

---

## Task 28: Rest timer settings, and the Phase 5 checkpoint

**Files:**
- Modify: `src/features/settings/SettingsScreen.tsx`

- [ ] **Step 1: Add the rest timer preferences**

`src/features/settings/SettingsScreen.tsx` (replace the whole file):

```tsx
import { useApp } from '../../app/AppContext';
import Button from '../../components/Button';
import { Checkbox } from '../../components/Fields';
import ScreenHeader from '../../components/ScreenHeader';
import Stepper from '../../components/Stepper';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { signOut } from '../auth/useAuth';
import { prefsId, updatePrefs } from './prefsRepo';
import SyncStatus from './SyncStatus';
import { usePrefs } from './usePrefs';

export default function SettingsScreen() {
  const { userId, syncStatus, syncBusy, requestSync } = useApp();
  const prefs = usePrefs(userId);
  const hasPrefsRow = useLiveQuery(async () => Boolean(await db.user_prefs.get(prefsId(userId))), [userId]);

  return (
    <section>
      <ScreenHeader title="Settings" />
      <div className="space-y-6">
        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-medium">Sync</h2>
          <SyncStatus status={syncStatus} busy={syncBusy} onSync={requestSync} />
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
          <h2 className="font-medium">Rest timer</h2>
          {hasPrefsRow === false ? (
            <p className="text-sm text-muted">Available once the first sync completes.</p>
          ) : (
            <>
              <Stepper
                label="Rest s"
                value={prefs.rest_seconds_default}
                step={15}
                min={15}
                max={600}
                onChange={(rest_seconds_default) => void updatePrefs(userId, { rest_seconds_default })}
              />
              <p className="text-xs text-muted">Used when a workout does not set its own rest for an exercise.</p>
              <Checkbox
                label="Vibrate when rest is over"
                checked={prefs.vibration}
                onChange={(vibration) => void updatePrefs(userId, { vibration })}
              />
            </>
          )}
        </div>

        <Button variant="danger" block onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Full verification**

Run: `npm test` three times — all pass every time. `npx tsc -b` — clean. `npm run build` — succeeds.

- [ ] **Step 3: Run the app and check**

Run: `npm run dev`. Open DevTools and switch the device toolbar to a phone size. **What to check:**

1. **Today.** If today has a planned workout (from the Phase 4 checkpoint), its card reads "Start" and "0 of N sets". Otherwise "Rest day".
2. **Log a planned session.** Tap Start. The first exercise opens with reps and kg pre-filled from the workout's targets. The RPE reads "–".
3. **RPE is required.** Tap "Log set" without choosing an RPE: "Rate this set" appears and nothing is logged.
4. **Log three sets.** Pick RPE 8, tap Log set. The set appears, the rest timer starts above the tab bar, and the next set is pre-filled. "Same as last" copies the previous set including its RPE.
5. **The timer survives the screen.** Start a rest, switch to another browser tab for 30 seconds, come back: the countdown is 30 seconds lower, not paused. Let it reach zero; on a phone it vibrates once. +30 s and Skip work.
6. **Edit a set.** Tap a logged set, change reps, Save. Tap another, Delete.
7. **Last time.** Finish this session. Open the same workout on another date from Plan (add it to tomorrow and open it): "Last time: 5×100, 5×100, …" shows today's sets, and the first set is pre-filled from them.
8. **Finish.** The suggested status is Done if every target was met, Partial otherwise. Choose energy, add a note, Save. Today shows the session as done.
9. **Log a run.** Today → Log a run → Easy Run. Enter 8 km and `42:30`: the pace reads `5:19 /km` as you type. Pick an RPE, add a split, Save. It appears on Today with distance, time and pace.
10. **Settings.** Change the rest default to 90 s and turn vibration off; the next rest starts at 1:30 and does not buzz.
11. **Offline.** In DevTools → Network → Offline, log a set. The corner reads "Offline · 1 pending". Go back online: it syncs by itself and the set appears in Supabase → `set_entries`.

- [ ] **Step 4: Commit**

```bash
git add src/features/settings/SettingsScreen.tsx
git commit -m "feat: rest timer preferences in Settings"
```

---

# Phase 6 — Log history

## Task 29: History rules and the 12-week heatmap

**Files:**
- Create: `src/features/log/history.ts`, `src/features/log/history.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/log/history.test.ts` (new file):

```ts
import { describe, it, expect } from 'vitest';
import { base } from '../../test/fixtures';
import type { Local, Run, Session } from '../../types/domain';
import type { SessionCard } from './cards';
import { buildHistory, groupByWeek, heatmap, historyState } from './history';

const TODAY = '2026-10-07'; // a Wednesday

function card(id: string, date: string, extra: Partial<Session> = {}, work: Partial<SessionCard> = {}): SessionCard {
  const session: Local<Session> = {
    ...base(id),
    date,
    kind: 'strength',
    status: 'planned',
    template_id: null,
    was_planned: true,
    energy: null,
    notes: null,
    started_at: null,
    completed_at: null,
    ...extra,
  };
  return { session, title: id, workingSets: 0, targetSets: 3, volumeKg: 0, avgRpe: null, run: null, ...work };
}

const RUN: Local<Run> = {
  ...base('r'),
  session_id: 'x',
  exercise_id: 'e',
  run_type: 'easy',
  distance_km: 5,
  duration_s: 1500,
  rpe: 6,
  avg_hr: null,
  weather: null,
  route_note: null,
};

describe('historyState', () => {
  it('passes finished statuses through', () => {
    expect(historyState(card('a', '2026-10-05', { status: 'done' }), TODAY)).toBe('done');
    expect(historyState(card('a', '2026-10-05', { status: 'partial' }), TODAY)).toBe('partial');
    expect(historyState(card('a', '2026-10-05', { status: 'skipped' }), TODAY)).toBe('skipped');
  });

  it('calls an untouched past planned session missed', () => {
    expect(historyState(card('a', '2026-10-05'), TODAY)).toBe('missed');
  });

  it('calls a past session with work but no finish unfinished', () => {
    expect(historyState(card('a', '2026-10-05', {}, { workingSets: 2 }), TODAY)).toBe('unfinished');
    expect(historyState(card('a', '2026-10-05', {}, { run: RUN }), TODAY)).toBe('unfinished');
  });

  it("leaves today's and future plans to Today and Plan", () => {
    expect(historyState(card('a', TODAY), TODAY)).toBeNull();
    expect(historyState(card('a', '2026-10-09'), TODAY)).toBeNull();
  });

  it("shows today's session once work is logged in it", () => {
    expect(historyState(card('a', TODAY, {}, { workingSets: 1 }), TODAY)).toBe('unfinished');
  });

  it('drops an abandoned unplanned draft', () => {
    expect(historyState(card('a', '2026-10-05', { was_planned: false }), TODAY)).toBeNull();
  });
});

describe('buildHistory', () => {
  it('keeps only history, newest first', () => {
    const entries = buildHistory(
      [
        card('old', '2026-09-28', { status: 'done' }),
        card('future', '2026-10-09'),
        card('new', '2026-10-06', { status: 'done' }),
        card('missed', '2026-10-05'),
      ],
      TODAY,
    );
    expect(entries.map((e) => [e.session.id, e.state])).toEqual([
      ['new', 'done'],
      ['missed', 'missed'],
      ['old', 'done'],
    ]);
  });
});

describe('groupByWeek', () => {
  it('groups newest-first entries into Monday-start weeks', () => {
    const entries = buildHistory(
      [
        card('a', '2026-10-06', { status: 'done' }),
        card('b', '2026-10-05', { status: 'done' }),
        card('c', '2026-10-04', { status: 'done' }),
      ],
      TODAY,
    );
    expect(groupByWeek(entries).map((g) => [g.weekStart, g.entries.map((e) => e.session.id)])).toEqual([
      ['2026-10-05', ['a', 'b']],
      ['2026-09-28', ['c']],
    ]);
  });
});

describe('heatmap', () => {
  it('lays out twelve Monday-to-Sunday weeks ending with this one', () => {
    const grid = heatmap([], TODAY);
    expect(grid).toHaveLength(12);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0][0].date).toBe('2026-07-20');
    expect(grid[11][0].date).toBe('2026-10-05');
    expect(grid[11][6].date).toBe('2026-10-11');
  });

  it('marks future days', () => {
    const grid = heatmap([], TODAY);
    expect(grid[11][2].future).toBe(false);
    expect(grid[11][3].future).toBe(true);
  });

  it('grades a day by what was completed', () => {
    const grid = heatmap(
      [
        { date: '2026-10-05', status: 'partial' },
        { date: '2026-10-06', status: 'done' },
        { date: '2026-10-07', status: 'done' },
        { date: '2026-10-07', status: 'done' },
        { date: '2026-10-08', status: 'skipped' },
      ],
      TODAY,
    );
    expect(grid[11].slice(0, 4).map((c) => c.level)).toEqual([1, 2, 3, 0]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run src/features/log/history.test.ts`
Expected: FAIL — module `./history` does not exist.

- [ ] **Step 3: Implement**

`src/features/log/history.ts` (new file):

```ts
import { addDays, startOfWeek } from '../../lib/time';
import type { ISODate, SessionStatus } from '../../types/domain';
import type { SessionCard } from './cards';

export type HistoryState = 'done' | 'partial' | 'skipped' | 'missed' | 'unfinished';

export interface HistoryEntry extends SessionCard {
  state: HistoryState;
}

/**
 * How a session reads in history, or null if it is not history yet.
 *
 * A finished session shows its status. A planned session from a past day
 * reads as "missed" — that is what keeps adherence honest. Work logged but
 * never finished reads as "unfinished". Today's untouched plan belongs on
 * Today, future plans on Plan, and an unplanned session abandoned before
 * anything was logged is not shown at all.
 */
export function historyState(card: SessionCard, todayDate: ISODate): HistoryState | null {
  const { session } = card;
  if (session.status !== 'planned') return session.status;
  if (session.date > todayDate) return null;
  if (card.workingSets > 0 || card.run !== null) return 'unfinished';
  if (session.date === todayDate || !session.was_planned) return null;
  return 'missed';
}

export function buildHistory(cards: SessionCard[], todayDate: ISODate): HistoryEntry[] {
  return cards
    .flatMap((card) => {
      const state = historyState(card, todayDate);
      return state ? [{ ...card, state }] : [];
    })
    .sort(
      (a, b) =>
        b.session.date.localeCompare(a.session.date) ||
        (b.session.completed_at ?? b.session.created_at).localeCompare(a.session.completed_at ?? a.session.created_at),
    );
}

/** Groups newest-first entries into Monday-start weeks, keeping their order. */
export function groupByWeek(entries: HistoryEntry[]): { weekStart: ISODate; entries: HistoryEntry[] }[] {
  const groups: { weekStart: ISODate; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const weekStart = startOfWeek(entry.session.date);
    const last = groups.at(-1);
    if (last && last.weekStart === weekStart) last.entries.push(entry);
    else groups.push({ weekStart, entries: [entry] });
  }
  return groups;
}

/** 0 nothing completed · 1 partial only · 2 done · 3 two or more completed sessions. */
export type HeatLevel = 0 | 1 | 2 | 3;

export interface HeatCell {
  date: ISODate;
  level: HeatLevel;
  future: boolean;
}

/** `weeks` columns, oldest first, each Monday to Sunday, ending with this week. */
export function heatmap(
  sessions: { date: ISODate; status: SessionStatus }[],
  todayDate: ISODate,
  weeks = 12,
): HeatCell[][] {
  const first = addDays(startOfWeek(todayDate), -7 * (weeks - 1));
  const completed = new Map<ISODate, { done: number; partial: number }>();
  for (const s of sessions) {
    if (s.status !== 'done' && s.status !== 'partial') continue;
    const counts = completed.get(s.date) ?? { done: 0, partial: 0 };
    counts[s.status]++;
    completed.set(s.date, counts);
  }

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(first, w * 7 + d);
      const c = completed.get(date);
      const level: HeatLevel = !c ? 0 : c.done + c.partial >= 2 ? 3 : c.done > 0 ? 2 : 1;
      return { date, level, future: date > todayDate };
    }),
  );
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run src/features/log/history.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/log/history.ts src/features/log/history.test.ts
git commit -m "feat: history states, week grouping and a 12-week heatmap"
```

---

## Task 30: The Log screen

**Files:**
- Create: `src/features/log/HistoryScreen.tsx`
- Modify: `src/app/Screen.tsx`
- Delete: `src/components/ComingSoon.tsx`

- [ ] **Step 1: Write the screen**

`src/features/log/HistoryScreen.tsx` (new file):

```tsx
import { routeHref, sessionRoute } from '../../app/routes';
import Loading from '../../components/Loading';
import ScreenHeader from '../../components/ScreenHeader';
import StatusBadge from '../../components/StatusBadge';
import { useLiveQuery } from '../../db/useLiveQuery';
import { weekdayStreak } from '../../lib/adherence';
import { formatDayShort, formatKg, formatKm, formatWeekRange } from '../../lib/format';
import { formatDuration, formatPace, paceSecondsPerKm } from '../../lib/running';
import { today } from '../../lib/time';
import { loadSessionCards } from './cards';
import { buildHistory, groupByWeek, heatmap, type HeatCell, type HistoryEntry } from './history';

const LEVEL_STYLE = ['border border-border', 'bg-accent/30', 'bg-accent/65', 'bg-accent'];
const LEVEL_LABEL = ['nothing', 'partial', 'done', 'two or more sessions'];

export default function HistoryScreen() {
  const todayDate = today();
  const cards = useLiveQuery(() => loadSessionCards('0000-01-01', todayDate), [todayDate]);

  if (!cards) return <Loading />;

  const entries = buildHistory(cards, todayDate);
  const grid = heatmap(
    cards.map((c) => c.session),
    todayDate,
  );
  const streak = weekdayStreak(
    cards.map((c) => ({ date: c.session.date, status: c.session.status, was_planned: c.session.was_planned })),
    todayDate,
  );
  const trainingDays = grid.flat().filter((c) => c.level > 0).length;

  return (
    <section>
      <ScreenHeader title="Log" />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Weekday streak" value={String(streak)} />
        <Stat label="Training days, 12 weeks" value={String(trainingDays)} />
      </div>
      <Heatmap grid={grid} trainingDays={trainingDays} />

      {entries.length === 0 ? (
        <p className="mt-6 text-muted">Nothing logged yet. Finished sessions and runs appear here.</p>
      ) : (
        groupByWeek(entries).map((group) => (
          <div key={group.weekStart} className="mt-6">
            <h2 className="mb-2 text-sm text-muted">
              {formatWeekRange(group.weekStart)} · {group.entries.length}{' '}
              {group.entries.length === 1 ? 'session' : 'sessions'}
            </h2>
            <ul className="space-y-2">
              {group.entries.map((entry) => (
                <HistoryRow key={entry.session.id} entry={entry} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Heatmap({ grid, trainingDays }: { grid: HeatCell[][]; trainingDays: number }) {
  return (
    <figure className="rounded-2xl border border-border bg-surface p-3">
      <figcaption className="mb-2 text-sm text-muted">Last 12 weeks, Monday at the top</figcaption>
      <div
        role="img"
        aria-label={`Last 12 weeks: ${trainingDays} training days`}
        className="grid grid-flow-col grid-rows-7 gap-1"
      >
        {grid.flat().map((cell) => (
          <span
            key={cell.date}
            title={`${formatDayShort(cell.date)}: ${LEVEL_LABEL[cell.level]}`}
            className={`aspect-square rounded-sm ${LEVEL_STYLE[cell.level]} ${cell.future ? 'opacity-25' : ''}`}
          />
        ))}
      </div>
    </figure>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { session, run } = entry;
  const detail = run
    ? `${formatKm(run.distance_km)} · ${formatDuration(run.duration_s)} · ${formatPace(paceSecondsPerKm(run.duration_s, run.distance_km))} /km · RPE ${run.rpe}`
    : entry.workingSets > 0
      ? `${entry.workingSets} sets · ${formatKg(entry.volumeKg)}${entry.avgRpe !== null ? ` · RPE ${entry.avgRpe.toFixed(1)}` : ''}`
      : 'Nothing logged';

  return (
    <li>
      <a
        href={routeHref(sessionRoute(session, 'log'))}
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2"
      >
        <span className="w-12 shrink-0 text-sm text-muted">{formatDayShort(session.date)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{entry.title}</span>
          <span className="block truncate text-sm text-muted">{detail}</span>
        </span>
        <StatusBadge status={entry.state} />
      </a>
    </li>
  );
}
```

- [ ] **Step 2: Route the last screen and retire the placeholder**

`src/app/Screen.tsx` (replace the whole file):

```tsx
import ExerciseForm from '../features/library/ExerciseForm';
import LibraryScreen from '../features/library/LibraryScreen';
import HistoryScreen from '../features/log/HistoryScreen';
import RunLogger from '../features/log/RunLogger';
import SessionLogger from '../features/log/SessionLogger';
import TodayScreen from '../features/log/TodayScreen';
import PlanDaysScreen from '../features/plan/PlanDaysScreen';
import WeekView from '../features/plan/WeekView';
import WorkoutEditor from '../features/plan/WorkoutEditor';
import WorkoutsScreen from '../features/plan/WorkoutsScreen';
import ProgressScreen from '../features/progress/ProgressScreen';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

export default function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'today':
      return <TodayScreen />;
    case 'session':
      return <SessionLogger key={route.id} id={route.id} from={route.from} />;
    case 'run':
      return <RunLogger key={route.id} sessionId={route.id} from={route.from} />;
    case 'run-new':
      return <RunLogger key={`${route.exerciseId}:${route.date}`} exerciseId={route.exerciseId} date={route.date} />;
    case 'plan':
      return <WeekView key={route.week ?? 'this-week'} week={route.week} />;
    case 'plan-days':
      return <PlanDaysScreen />;
    case 'workouts':
      return <WorkoutsScreen />;
    case 'workout':
      return <WorkoutEditor key={route.id} id={route.id} />;
    case 'library':
      return <LibraryScreen />;
    case 'exercise':
      return <ExerciseForm key={route.id} id={route.id} />;
    case 'progress':
      return <ProgressScreen />;
    case 'log':
      return <HistoryScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}
```

Every route now has a screen, so the `switch` is exhaustive and the placeholder is unused:

```bash
git rm src/components/ComingSoon.tsx
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc -b` — clean. If TypeScript reports "not all code paths return a value", a route is missing a case — add it rather than reintroducing a default.

```bash
git add src/features/log/HistoryScreen.tsx src/app/Screen.tsx
git commit -m "feat: Log screen with history, weekday streak and 12-week heatmap"
```

---

## Task 31: Phase 6 checkpoint and spec update

- [ ] **Step 1: Full verification**

Run: `npm test` three times — all pass every time. `npx tsc -b` — clean. `npm run build` — succeeds.

- [ ] **Step 2: Run the app and check**

**What to check:**

1. **Log tab.** The sessions and run from the Phase 5 checkpoint are listed under this week's heading, newest first, each with sets, volume and average RPE — or distance, time, pace and RPE for the run.
2. **Missed days.** A planned workout from an earlier day this week that you never opened shows as "missed".
3. **Heatmap.** Days you trained are shaded; a day with two finished sessions is the darkest. Days after today are faded.
4. **Streak.** Matches the run of consecutive weekdays you trained, ending today or yesterday.
5. **Edit a past day.** Tap a past session: it opens in the logger with the Log tab still highlighted. Change a set's reps and save. Back takes you to Log, and the volume has changed.
6. **Delete.** Open a session → Finish → Delete session. It disappears from Log and from Plan.
7. **Two devices.** Sign in on a second browser profile. After its first sync, the same history, plan and library appear — and the exercise library still has 51 exercises, not 102.

- [ ] **Step 3: Record the new design rules in the spec**

`docs/superpowers/specs/2026-09-22-fitness-tracker-design.md` — append this section at the end:

```markdown
## 17. Derived rows: system writes and deterministic ids

Some rows are derived by the app rather than typed by the user: the default week plan and its seven days, the preference row, and the planned sessions materialized from the weekly template, with their exercises.

- **Deterministic ids.** These rows get UUIDv5 ids derived from stable names (`<userId>:planned:<date>`), so every device creates the same row instead of a duplicate. The SHA-1 behind them is synchronous: awaiting `crypto.subtle` inside a Dexie transaction commits the transaction early.
- **System writes.** They are stamped with `systemISO()` — wall-clock time minus fifty years, strictly increasing. Every genuine user edit outranks every system write in last-write-wins, including the server's stale-write guard, so a fresh install materializing a week can never overwrite a session logged on another device.
- **Ownership.** A session is the user's once it carries a real timestamp: started, edited, noted, finished or removed. The first set, added exercise or note claims it. The app never rewrites a session the user owns, and never rewrites a past date.
- **Materialization rules** live in one pure function, `decide()`: insert what is missing; revive a row the app removed when its day is planned again; rewrite or remove untouched future rows when the template changes; otherwise leave it.

Schema version 2 adds an `exercise_id` index on `session_exercises` for "last time". Versions are only ever added, never edited: devices hold real version 1 databases.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-22-fitness-tracker-design.md
git commit -m "docs: record system writes and deterministic ids in the spec"
```

---

## Self-review

**Spec coverage — Phases 4 to 6:**

| Requirement (spec / brief) | Task |
|---|---|
| Weekly template: a workout per weekday, runs on any day, rest days | 4, 14, 16 |
| Template + dated overrides; editing the template never rewrites the past | 14 (`decide`), 16 |
| Workout = ordered exercises with default sets/reps/weight or duration/distance | 12, 13 |
| Library: add, edit, delete; duplicate and reorder | 10, 11, 12, 13 |
| Today shows the planned session | 24 |
| Log set by set: reps, weight, RPE required, half steps, quick tap | 19, 23, 25 |
| Pre-fill from last time; "same as last set" | 20, 21, 25 |
| Rest timer, configurable, vibration, survives screen-off | 22, 23, 25, 28 |
| Run logging: distance, duration, RPE required, avg HR, manual splits, weather/route, auto pace | 26, 27 |
| Notes per session and per exercise; energy 1–5 | 21, 25, 27 |
| Session status done / skipped / partial; edit past days | 19, 21, 25, 30 |
| Log history, session detail and editing | 29, 30 |
| 12-week calendar heatmap and weekday streak (spec §9, History) | 29, 30 |
| Bottom tabs Today · Plan · Progress · Log · Settings; library under Plan | 3, 8, 9 |
| English UI, kg, km, 24-hour clock, week starts Monday | 5, 7 |
| Safe-area insets, reduced motion, accessible labels, big tap targets | 8, 9 and every screen |
| Works offline; sync after a session completes | 6, 9, 25, 27 |

Deliberately left for Plan 3: progress charts (the Progress tab is a placeholder), export/import, "load demo data", "delete all data", body metrics entry, and the Capacitor Android build — which also switches vibration to Capacitor Haptics.

**Placeholder scan:** the only interim screen is `ComingSoon`, introduced in Task 9 and deleted in Task 30 once every route has a screen. No step defers work with "TBD" or "similar to".

**Type consistency:** `SetDraft`, `SetErrors` and `FinishedStatus` are defined once in `setRules.ts`; `SessionCard` once in `cards.ts`; `ExerciseBlock` and `SessionView` once in `sessionView.ts`; `RunDraft`, `RunErrors` and `SplitDraft` once in `runRules.ts`. `materializeWeek(userId, weekStart, today)`, `createSessionFromTemplate(date, templateId, { wasPlanned })`, `finishSession(id, { status, energy, notes })`, `saveRun({ sessionId, date, exerciseId, draft })` and `sessionRoute(session, from?)` have one signature each and are called with it everywhere.

---

## Post-execution amendments

Every task above was executed verbatim; all three phase checkpoints passed in a real browser against the real Supabase project. Two further rounds then changed the code, so the blocks above are the *as-planned* version and these commits are the current state.

**Phase 4 checkpoint.** A plan created on a Sunday applied from that week's Monday, so materialization filled in the past training days and they read as missed on the user's first day (`6695fcb` — a new plan now starts on its creation date; the Task 4 blocks above were updated to match).

**Whole-implementation review**, two defects confirmed against the real modules before fixing:

| Ref | Defect | Fix |
|---|---|---|
| Critical | Claiming a session re-stamped only the session row. Its exercises kept system stamps, so another device rewriting the template could delete the exercise the user had logged into; the sets survived under a deleted parent and vanished from every screen | `claimSession` moved to `sessionsRepo` and re-stamps the exercises; finishing and saving a run now claim too; materialization removes exercises another device injected into a session the user owns (`39ad410`) |
| Important | `decide()` inserted sessions on past dates with today's template, so history showed misses for days that were rest days | Insert only from today forward; `kind` joins the change check (`a85425c`) |
| Important | Logging the run inside a mixed session finished, skipped or deleted the whole session | `removeRun` (`db986ce`); the run logger saves only the run in a mixed session and returns to it (`d8f072a`) |
| Important | A double tap on Log set, a picker row or Create wrote twice | `useSingleFlight` guards every write button and always clears on error (`1fd4d62`) |
| Important | Typing into a Stepper clamped each keystroke: "90" in a min-15 field saved 150 | `parseInRange` commits only in-range values; blur restores (`55fd68c`) |
| Minor | Next-set suggestion stale after editing a set (`f4f2e64`); note lost when backgrounded (`b16e09d`); "Log a workout" duplicated today's planned session (`3203c93`) | — |

Final state: 387 tests in 40 files, stable across repeated runs; `tsc -b` clean; build contains every screen.

