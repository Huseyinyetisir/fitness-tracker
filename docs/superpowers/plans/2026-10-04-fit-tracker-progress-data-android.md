# Fit Tracker — Plan 3: Progress, Data Safety and Android (Phases 7–9)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish v1: progress charts that answer "am I getting stronger, running more, accumulating fatigue", a complete backup and restore path, and the app installed on the phone from an APK built on this Mac.

**Architecture:** Progress is a set of pure functions over one flattened read of Dexie (`progressData.ts`), drawn with Recharts in a lazily loaded chunk. Data safety is a backup format checked against the domain types at compile time, an import that reuses the sync rule (last write wins), and a wipe that runs under the same lock as sync. Android is Capacitor 8 around the unchanged web app, built with Gradle from the command line, with a thin `src/platform/` layer for files, haptics, the back button and a locked-screen rest alert.

**Tech Stack:** Vite 8, React 19, TypeScript 7, Tailwind CSS v4, Dexie 4, Vitest 4, fake-indexeddb. **New:** Recharts 3.10 (Phase 7); Capacitor 8.5 with `@capacitor/app`, `haptics`, `filesystem`, `share` and `local-notifications` (Phase 9).

**Spec:** `docs/superpowers/specs/2026-09-22-fitness-tracker-design.md` · **Plan 1:** `docs/superpowers/plans/2026-09-22-fit-tracker-foundation.md` · **Plan 2:** `docs/superpowers/plans/2026-10-04-fit-tracker-planning-logging-history.md`

**Validated before handoff:** every code block in this plan was applied, in order, to a copy of the repository at commit `bb9c93f`. Result: `tsc -b` clean; **501 tests in 53 files** (387 existing + 114 new) passing on repeated runs, on Node 20 and Node 22; production build; the debug APK and a signed release APK built from the command line. The debug APK was run on an Android 16 emulator (WebView 134, the old-WebView path for safe areas): charts, the share sheet, the Back button, the in-app buzz and the locked-screen rest notification were all checked there.

---

## Five decisions this plan depends on

### 1. Demo data is marked by a note, not by an id

Demo sessions, workouts and body entries all carry the note `Demo data`. "Remove demo data" finds them by that note, on any device, months later — deterministic ids would have to be regenerated from the dates the demo was created on. The note is also visible, so a demo session can never be mistaken for a real one. Removal soft-deletes, so it syncs like any other edit.

### 2. A backup belongs to an account

Ids are global in the database, and some rows' ids are derived from the user id (Plan 2, spec §17). So:

- **Same account:** import merges by last-write-wins, exactly like a pull — except a row the import wins is *dirty*, because the server has not seen it.
- **Another account** — the realistic case being a Supabase project that was lost and recreated: the import first wipes the current account, then imports a *re-keyed* copy. Every row gets a new id (the old rows may still exist under the old account); rows derived by name get the ids this account derives, so setup does not create a second plan beside them; untouched future planned sessions are dropped and re-materialized.

### 3. One lock for sync and anything destructive

Deleting all data while a sync is mid-push would put rows straight back. `SyncLock` serialises sync with wipe, restore and sign-out. A sync that finds the lock held is skipped (the next trigger syncs); a destructive task waits for the running sync and then runs.

### 4. Android ignores haptics from the background

Measured on the emulator: with the screen off, the rest timer ran on time and called `Haptics.vibrate` — and Android dropped it (`ignored_background`). Android silently drops haptic vibration from any app not in the foreground. So when the app leaves the foreground mid-rest it schedules a local notification for the end time on a vibrating channel, and cancels it on return; in the foreground the haptic buzz stays. `USE_EXACT_ALARM` makes the alarm exact without sending the user to a settings screen.

### 5. The APK builds without Android Studio

This Mac already has the Android SDK command-line tools (`ANDROID_HOME`), platform 36, build-tools and JDK 21 (Homebrew, not linked as the default `java`). Capacitor 8 needs **Node 22**; fnm already has it and switches per directory from `.nvmrc`, so only this project moves to 22. `scripts/android.sh` finds JDK 21 itself, so the machine's default Java is untouched.

---

## Conventions

- **Typecheck with `npx tsc -b`** — never `--noEmit`.
- **No test may import `src/supabase/client.ts`**, directly or transitively. Logic modules must not import it either; only UI components and `supabaseSyncClient.ts` do.
- **No test may import `src/platform/*`** — those modules load Capacitor plugins. Hooks and components use them; repositories never do.
- **Do not read, print, modify or commit `.env`.** Never commit `android/keystore.properties` or any keystore.
- **Tailwind v4 theme utilities** as in Plan 2: `bg-surface`, `border-border`, `text-muted`, `bg-accent`, `text-accent`.
- **Tap targets at least 48 px** (`min-h-12`); primary actions 56 px.
- **Screens are not unit-tested.** Each phase ends with a checkpoint in a browser; Phase 9's on the phone.
- **Node:** Phases 7 and 8 run on Node 20 or 22. Phase 9 creates `.nvmrc`; from then on run `fnm use` (or open a new shell in the project) before any command.
- **XML comments cannot contain `--`.** Gradle rejects the file. Keep CSS variable names out of Android resource comments.
- **Code-block markers.** Every block that creates or changes a file is introduced by `` `path` (new file): ``, `` `path` (replace the whole file): `` or `` `path` (append): ``. Apply them exactly as labelled.

---

## File structure

| File | Responsibility |
|---|---|
| `src/test/rows.ts` | Plain row builders for pure tests |
| `src/lib/ranges.ts` | Range keys (4w, 12w, 6m, all), range start, week and month buckets |
| `src/lib/format.ts` *(modify)* | Short dates, month names, grouped numbers for charts |
| `src/features/progress/progressData.ts` | One read of Dexie, flattened: working sets and runs with their dates |
| `src/features/progress/strengthStats.ts` | Weekly volume and sessions, adherence, per-exercise e1RM, PRs, best set, rep maxes |
| `src/features/progress/rpeStats.ts` | Session RPE, weekly RPE, volume against RPE, fatigue alerts |
| `src/features/progress/runStats.ts` | Weekly km, pace by run type, longest run, monthly totals, pace against RPE |
| `src/features/progress/bodyRules.ts`, `bodyRepo.ts` | Body entry validation, series, save and delete |
| `src/features/progress/*.tsx` | Progress screen, its five views, exercise detail, body entry form |
| `src/components/charts.tsx`, `Stat.tsx`, `ConfirmPhrase.tsx` | Chart wrappers, stat tile, typed confirmation |
| `src/features/settings/demoData.ts`, `DemoSection.tsx` | Demo data: build, load, remove |
| `src/app/routes.ts` *(modify)* | Progress view and range, exercise detail, body entry routes |
| `src/app/Screen.tsx` *(modify)* | Lazy-loads Progress |
| `src/sync/lock.ts`, `useSync.ts` *(modify)* | Sync lock and `exclusive()` |
| `src/sync/columns.ts` | Every synced column of every table, checked against the domain types |
| `src/sync/wipe.ts`, `supabaseSyncClient.ts` *(modify)* | Delete all data; clear the device |
| `src/features/settings/backup.ts`, `restore.ts`, `csv.ts` | Backup format, import and restore, CSV exports |
| `src/features/settings/DataSection.tsx`, `AccountSection.tsx`, `SettingsScreen.tsx` *(modify)* | Settings UI |
| `src/platform/files.ts`, `vibrate.ts`, `backButton.ts`, `restAlert.ts` | Android integration |
| `capacitor.config.ts`, `android/`, `scripts/android.sh`, `.nvmrc` | Android project and build |
| `README.md` | Setup, development, APK build and install, data safety |

---

# Phase 7 — Demo data and progress charts

## Task 1: Ranges, chart labels and row builders

Every Progress view filters by a range: 4 weeks, 12 weeks, 6 months or everything. Ranges are whole Monday-start weeks ending with the current one, so a weekly bar chart never starts on a partial week. This task also adds `src/test/rows.ts`: plain rows for pure tests, so later test files do not each redefine a session or a set.

**Files:**
- Create: `src/test/rows.ts`, `src/lib/ranges.ts`, `src/lib/ranges.test.ts`
- Modify: `src/lib/format.ts`, `src/lib/format.test.ts`

- [ ] **Step 1: Write the row builders**

`src/test/rows.ts` (new file):

```ts
import type {
  BodyMetric,
  Exercise,
  Local,
  Run,
  Session,
  SessionExercise,
  SetEntry,
} from '../types/domain';
import { base } from './fixtures';

/**
 * Plain rows for pure tests — no database involved. Each takes an id and
 * overrides; the defaults describe a finished strength session on Monday
 * 5 October 2026 with 5 × 100 kg at RPE 8.
 */

export function sessionRow(id: string, extra: Partial<Session> = {}): Local<Session> {
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    date: '2026-10-05',
    kind: 'strength',
    status: 'done',
    template_id: null,
    was_planned: true,
    energy: null,
    notes: null,
    started_at: null,
    completed_at: null,
    ...extra,
  };
}

export function childRow(id: string, sessionId: string, exerciseId: string, extra: Partial<SessionExercise> = {}): Local<SessionExercise> {
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    session_id: sessionId,
    exercise_id: exerciseId,
    position: 0,
    notes: null,
    target_sets: 3,
    target_reps: 5,
    target_weight_kg: 100,
    ...extra,
  };
}

export function setRow(id: string, childId: string, extra: Partial<SetEntry> = {}): Local<SetEntry> {
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
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

export function runRow(id: string, sessionId: string, extra: Partial<Run> = {}): Local<Run> {
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    session_id: sessionId,
    exercise_id: 'easy-run',
    run_type: 'easy',
    distance_km: 5,
    duration_s: 1800,
    rpe: 6,
    avg_hr: null,
    weather: null,
    route_note: null,
    ...extra,
  };
}

export function exerciseRow(id: string, name: string, extra: Partial<Exercise> = {}): Local<Exercise> {
  const cardio = extra.modality === 'cardio';
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    name,
    muscle_group: cardio ? 'cardio' : 'legs',
    modality: 'strength',
    run_type: null,
    default_sets: null,
    default_reps: null,
    default_weight_kg: null,
    default_duration_s: null,
    default_distance_km: null,
    sort_order: 0,
    ...extra,
  };
}

export function bodyRow(id: string, date: string, extra: Partial<BodyMetric> = {}): Local<BodyMetric> {
  return {
    ...base(id, { deleted_at: extra.deleted_at ?? null }),
    date,
    weight_kg: null,
    resting_hr: null,
    note: null,
    ...extra,
  };
}
```

- [ ] **Step 2: Write the failing tests**

`src/lib/ranges.test.ts` (new file):

```ts
import { describe, expect, it } from 'vitest';
import { inRange, isRangeKey, monthOf, monthsBetween, rangeStart, weekStarts } from './ranges';

// Sunday 4 October 2026; its week starts Monday 28 September.
const TODAY = '2026-10-04';

describe('rangeStart', () => {
  it('covers whole Monday-start weeks ending with this one', () => {
    expect(rangeStart('4w', TODAY, null)).toBe('2026-09-07');
    expect(rangeStart('12w', TODAY, null)).toBe('2026-07-13');
    expect(rangeStart('6m', TODAY, null)).toBe('2026-04-06');
  });

  it('starts "all" at the Monday of the earliest data', () => {
    expect(rangeStart('all', TODAY, '2026-03-12')).toBe('2026-03-09');
  });

  it('starts "all" this week when there is no data, or none before it', () => {
    expect(rangeStart('all', TODAY, null)).toBe('2026-09-28');
    expect(rangeStart('all', TODAY, '2026-10-02')).toBe('2026-09-28');
  });
});

describe('weekStarts', () => {
  it('lists every Monday from the first week to the last', () => {
    expect(weekStarts('2026-09-14', TODAY)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
  });

  it('starts from the Monday of a mid-week date', () => {
    expect(weekStarts('2026-09-30', '2026-10-06')).toEqual(['2026-09-28', '2026-10-05']);
  });
});

describe('months', () => {
  it('reads the month of a date', () => {
    expect(monthOf('2026-10-04')).toBe('2026-10');
  });

  it('lists months across a year boundary', () => {
    expect(monthsBetween('2025-11-20', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('helpers', () => {
  it('checks dates inclusively', () => {
    expect(inRange('2026-09-28', '2026-09-28', TODAY)).toBe(true);
    expect(inRange(TODAY, '2026-09-28', TODAY)).toBe(true);
    expect(inRange('2026-10-05', '2026-09-28', TODAY)).toBe(false);
  });

  it('recognises range keys', () => {
    expect(isRangeKey('12w')).toBe(true);
    expect(isRangeKey('1y')).toBe(false);
    expect(isRangeKey(null)).toBe(false);
  });
});
```

`src/lib/format.test.ts` (replace the whole file):

```ts
import { describe, it, expect } from 'vitest';
import {
  WEEKDAY_NAMES,
  formatDateLong,
  formatDayShort,
  formatKg,
  formatKm,
  formatMonth,
  formatNumber,
  formatShortDate,
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

describe('chart labels', () => {
  it('formats a short date', () => {
    expect(formatShortDate('2026-10-05')).toBe('5 Oct');
  });

  it('formats a month key', () => {
    expect(formatMonth('2026-11')).toBe('Nov 2026');
  });

  it('formats whole numbers with grouping', () => {
    expect(formatNumber(12345.6)).toBe('12,346');
  });

  it('keeps the decimals asked for', () => {
    expect(formatNumber(7.25, 1)).toBe('7.3');
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/ranges.test.ts src/lib/format.test.ts`
Expected: FAIL — `Failed to resolve import "./ranges"`, and `formatShortDate is not a function` in `format.test.ts`.

- [ ] **Step 4: Implement**

`src/lib/ranges.ts` (new file):

```ts
import type { ISODate } from '../types/domain';
import { addDays, startOfWeek } from './time';

/** The Progress range filter: 4 weeks, 12 weeks, 6 months, everything. */
export type RangeKey = '4w' | '12w' | '6m' | 'all';

export const RANGE_KEYS: readonly RangeKey[] = ['4w', '12w', '6m', 'all'];
export const DEFAULT_RANGE: RangeKey = '12w';
export const RANGE_LABELS: Record<RangeKey, string> = { '4w': '4 wk', '12w': '12 wk', '6m': '6 mo', all: 'All' };

/** Six months is taken as 26 whole weeks. */
const RANGE_WEEKS = { '4w': 4, '12w': 12, '6m': 26 } as const;

export function isRangeKey(value: string | null): value is RangeKey {
  return value !== null && (RANGE_KEYS as readonly string[]).includes(value);
}

/**
 * The first day a range covers. Ranges are whole Monday-start weeks ending
 * with the current one, so a weekly chart never opens on a partial week.
 * "All" starts at the week of the earliest data, or this week when there is none.
 */
export function rangeStart(range: RangeKey, todayDate: ISODate, earliest: ISODate | null): ISODate {
  const thisWeek = startOfWeek(todayDate);
  if (range === 'all') return earliest && earliest < thisWeek ? startOfWeek(earliest) : thisWeek;
  return addDays(thisWeek, -7 * (RANGE_WEEKS[range] - 1));
}

export function inRange(date: ISODate, start: ISODate, end: ISODate): boolean {
  return date >= start && date <= end;
}

/** The Monday of every week from the one containing `start` to the one containing `end`. */
export function weekStarts(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let week = startOfWeek(start); week <= end; week = addDays(week, 7)) out.push(week);
  return out;
}

/** 'YYYY-MM' */
export function monthOf(date: ISODate): string {
  return date.slice(0, 7);
}

/** Every 'YYYY-MM' from the month of `start` to the month of `end`. */
export function monthsBetween(start: ISODate, end: ISODate): string[] {
  const out: string[] = [];
  let [year, month] = start.split('-').map(Number);
  const last = monthOf(end);
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    out.push(key);
    if (key >= last) return out;
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }
}
```

`src/lib/format.ts` (replace the whole file):

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

/** A typed value to commit, or null while it is not yet a usable number within [min, max]. */
export function parseInRange(text: string, min: number, max: number): number | null {
  const parsed = parseOptionalNumber(text);
  if (parsed === null || !Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return Math.round(parsed * 100) / 100;
}

/** "5 Oct" — chart axis labels. */
export function formatShortDate(date: ISODate): string {
  return parseISODate(date).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

/** "Nov 2026", from a 'YYYY-MM' month key. */
export function formatMonth(month: string): string {
  return parseISODate(`${month}-01`).toLocaleDateString(LOCALE, { month: 'short', year: 'numeric' });
}

/** "12,346" — grouped, rounded to `decimals` places. */
export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString(LOCALE, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}
```

`en-GB` abbreviates September as "Sept", on Node and in the WebView alike. The tests avoid September for that reason only; it is not a bug.

- [ ] **Step 5: Run them to verify they pass**

Run: `npx vitest run src/lib/ranges.test.ts src/lib/format.test.ts`
Expected: PASS — 9 and 18 tests.

- [ ] **Step 6: Commit**

```bash
git add src/test/rows.ts src/lib/ranges.ts src/lib/ranges.test.ts src/lib/format.ts src/lib/format.test.ts
git commit -m "feat: progress ranges, chart label formats and row builders for pure tests"
```

---

## Task 2: Progress data

Every Progress view reads the same thing: live sessions, the working sets under their live exercises (warm-ups never count towards any chart), live runs, all exercises (deleted ones too, so old history keeps its names) and body entries. `buildProgressData` is pure; `loadProgressData` reads Dexie and calls it. Data volume for one person is small — a few thousand sets a year — so one full read per Progress visit is simpler than per-view queries and fast enough.

**Files:**
- Create: `src/features/progress/progressData.ts`, `src/features/progress/progressData.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/progress/progressData.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { resetDb } from '../../test/fixtures';
import { bodyRow, childRow, exerciseRow, runRow, sessionRow, setRow } from '../../test/rows';
import { buildProgressData, loadProgressData } from './progressData';

const TODAY = '2026-10-04';

function raw() {
  return {
    sessions: [
      sessionRow('s1', { date: '2026-09-28' }),
      sessionRow('s2', { date: '2026-09-21', kind: 'run' }),
      sessionRow('gone', { date: '2026-09-14', deleted_at: '2026-09-15T06:00:00.000Z' }),
      sessionRow('later', { date: '2026-10-12', status: 'planned' }),
    ],
    children: [
      childRow('c1', 's1', 'squat'),
      childRow('c-gone', 's1', 'bench', { deleted_at: '2026-09-28T07:00:00.000Z' }),
      childRow('c-orphan', 'gone', 'squat'),
    ],
    sets: [
      setRow('a', 'c1', { set_index: 1, weight_kg: 105 }),
      setRow('b', 'c1', { set_index: 0, weight_kg: 100 }),
      setRow('warm', 'c1', { is_warmup: true, weight_kg: 60 }),
      setRow('deleted', 'c1', { deleted_at: '2026-09-28T07:00:00.000Z' }),
      setRow('under-gone-child', 'c-gone'),
      setRow('under-gone-session', 'c-orphan'),
    ],
    runs: [runRow('r1', 's2'), runRow('r-gone', 'gone')],
    exercises: [exerciseRow('squat', 'Back Squat')],
    body: [bodyRow('b2', '2026-09-20', { weight_kg: 81 }), bodyRow('b1', '2026-09-10', { weight_kg: 82 }), bodyRow('b-gone', '2026-09-01', { deleted_at: '2026-09-02T06:00:00.000Z' })],
  };
}

describe('buildProgressData', () => {
  it('keeps only live working sets under live exercises of live sessions, with their date', () => {
    const data = buildProgressData(raw(), TODAY);
    expect(data.lifts.map((l) => l.set_id)).toEqual(['b', 'a']);
    expect(data.lifts[0]).toMatchObject({ date: '2026-09-28', session_id: 's1', exercise_id: 'squat', weight_kg: 100 });
  });

  it('keeps only runs of live sessions, dated', () => {
    const data = buildProgressData(raw(), TODAY);
    expect(data.runs.map((r) => [r.run_id, r.date])).toEqual([['r1', '2026-09-21']]);
  });

  it('keeps live sessions and body entries in date order', () => {
    const data = buildProgressData(raw(), TODAY);
    expect(data.sessions.map((s) => s.id)).toEqual(['s2', 's1', 'later']);
    expect(data.body.map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('finds the earliest date with anything to show, ignoring the future', () => {
    expect(buildProgressData(raw(), TODAY).earliest).toBe('2026-09-10');
  });

  it('has no earliest date with no data', () => {
    expect(
      buildProgressData({ sessions: [], children: [], sets: [], runs: [], exercises: [], body: [] }, TODAY).earliest,
    ).toBeNull();
  });
});

describe('loadProgressData', () => {
  beforeEach(resetDb);

  it('reads every table it needs from Dexie', async () => {
    const r = raw();
    await db.sessions.bulkPut(r.sessions);
    await db.session_exercises.bulkPut(r.children);
    await db.set_entries.bulkPut(r.sets);
    await db.runs.bulkPut(r.runs);
    await db.exercises.bulkPut(r.exercises);
    await db.body_metrics.bulkPut(r.body);

    const data = await loadProgressData(TODAY);
    expect(data.lifts).toHaveLength(2);
    expect(data.runs).toHaveLength(1);
    expect(data.body).toHaveLength(2);
    expect(data.exercises.map((e) => e.name)).toEqual(['Back Squat']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/progress/progressData.test.ts`
Expected: FAIL — `Failed to resolve import "./progressData"`.

- [ ] **Step 3: Implement**

`src/features/progress/progressData.ts` (new file):

```ts
import { db } from '../../db/schema';
import { isWorkingSet } from '../../lib/strength';
import type {
  BodyMetric,
  Exercise,
  ISODate,
  Run,
  RunType,
  Session,
  SessionExercise,
  SetEntry,
  UUID,
} from '../../types/domain';

/** One working set, flattened with its session's date and its exercise. */
export interface Lift {
  set_id: UUID;
  session_id: UUID;
  date: ISODate;
  exercise_id: UUID;
  reps: number;
  weight_kg: number;
  rpe: number;
}

/** One run, flattened with its session's date. */
export interface RunPoint {
  run_id: UUID;
  session_id: UUID;
  date: ISODate;
  exercise_id: UUID;
  run_type: RunType;
  distance_km: number;
  duration_s: number;
  rpe: number;
}

/** Everything the Progress tab draws from, already cleaned of deleted rows. */
export interface ProgressData {
  /** Live sessions of every status, oldest first. */
  sessions: Session[];
  /** Working sets only — warm-ups never count towards any chart. Oldest first. */
  lifts: Lift[];
  runs: RunPoint[];
  /** Every exercise, deleted ones included, so old history keeps its names. */
  exercises: Exercise[];
  body: BodyMetric[];
  /** The first date with anything to show, for the "All" range. Null with no data. */
  earliest: ISODate | null;
}

export interface ProgressRaw {
  sessions: Session[];
  children: SessionExercise[];
  sets: SetEntry[];
  runs: Run[];
  exercises: Exercise[];
  body: BodyMetric[];
}

const byDate = <T extends { date: ISODate }>(a: T, b: T) => a.date.localeCompare(b.date);

export function buildProgressData(raw: ProgressRaw, todayDate: ISODate): ProgressData {
  const sessions = raw.sessions.filter((s) => s.deleted_at === null).sort(byDate);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const childById = new Map(
    raw.children.filter((c) => c.deleted_at === null && sessionById.has(c.session_id)).map((c) => [c.id, c]),
  );

  const lifts: Lift[] = raw.sets
    .filter((s) => isWorkingSet(s) && childById.has(s.session_exercise_id))
    .sort((a, b) => a.set_index - b.set_index)
    .map((s) => {
      const child = childById.get(s.session_exercise_id)!;
      return {
        set_id: s.id,
        session_id: child.session_id,
        date: sessionById.get(child.session_id)!.date,
        exercise_id: child.exercise_id,
        reps: s.reps,
        weight_kg: s.weight_kg,
        rpe: s.rpe,
      };
    })
    .sort(byDate);

  const runs: RunPoint[] = raw.runs
    .filter((r) => r.deleted_at === null && sessionById.has(r.session_id))
    .map((r) => ({
      run_id: r.id,
      session_id: r.session_id,
      date: sessionById.get(r.session_id)!.date,
      exercise_id: r.exercise_id,
      run_type: r.run_type,
      distance_km: r.distance_km,
      duration_s: r.duration_s,
      rpe: r.rpe,
    }))
    .sort(byDate);

  const body = raw.body.filter((b) => b.deleted_at === null).sort(byDate);

  const dates = [
    ...lifts.map((l) => l.date),
    ...runs.map((r) => r.date),
    ...body.map((b) => b.date),
    ...sessions.map((s) => s.date),
  ].filter((d) => d <= todayDate);
  const earliest = dates.length > 0 ? dates.reduce((min, d) => (d < min ? d : min)) : null;

  return { sessions, lifts, runs, exercises: raw.exercises, body, earliest };
}

/** Reads everything Progress needs. Safe inside useLiveQuery. */
export async function loadProgressData(todayDate: ISODate): Promise<ProgressData> {
  const [sessions, children, sets, runs, exercises, body] = await Promise.all([
    db.sessions.where('_deleted').equals(0).toArray(),
    db.session_exercises.where('_deleted').equals(0).toArray(),
    db.set_entries.where('_deleted').equals(0).toArray(),
    db.runs.where('_deleted').equals(0).toArray(),
    db.exercises.toArray(),
    db.body_metrics.where('_deleted').equals(0).toArray(),
  ]);
  return buildProgressData({ sessions, children, sets, runs, exercises, body }, todayDate);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/features/progress/progressData.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/progress/progressData.ts src/features/progress/progressData.test.ts
git commit -m "feat: progress data — working sets and runs flattened with their dates"
```

---

## Task 3: Strength statistics

Weekly volume and sessions are zero-filled, so a missed week shows as a gap in the bars rather than vanishing. Adherence counts planned sessions up to today, and today's only once finished — the day is not over. PRs reuse `detectPRs` from `lib/prs.ts` over all history, whatever range is on screen; the first session of an exercise is never a PR, having nothing to beat.

**Files:**
- Create: `src/features/progress/strengthStats.ts`, `src/features/progress/strengthStats.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/progress/strengthStats.test.ts` (new file):

```ts
import { describe, expect, it } from 'vitest';
import { exerciseRow, sessionRow } from '../../test/rows';
import type { Lift } from './progressData';
import {
  adherenceInRange,
  bestSet,
  exerciseDays,
  liftedExercises,
  repMaxTable,
  weeklySessions,
  weeklyVolume,
} from './strengthStats';

const TODAY = '2026-10-04';

function lift(id: string, date: string, extra: Partial<Lift> = {}): Lift {
  return { set_id: id, session_id: `s-${date}`, date, exercise_id: 'squat', reps: 5, weight_kg: 100, rpe: 8, ...extra };
}

describe('weeklyVolume', () => {
  it('sums reps × weight per Monday-start week and zero-fills empty weeks', () => {
    const lifts = [
      lift('a', '2026-09-14'),
      lift('b', '2026-09-20', { weight_kg: 50, reps: 10 }),
      lift('c', '2026-09-28', { weight_kg: 120, reps: 1 }),
    ];
    expect(weeklyVolume(lifts, '2026-09-14', TODAY)).toEqual([
      { week: '2026-09-14', volume: 1000 },
      { week: '2026-09-21', volume: 0 },
      { week: '2026-09-28', volume: 120 },
    ]);
  });

  it('ignores lifts outside the range', () => {
    expect(weeklyVolume([lift('a', '2026-09-07')], '2026-09-14', TODAY)[0].volume).toBe(0);
  });
});

describe('weeklySessions', () => {
  it('counts finished strength and run sessions per week; mixed counts as strength', () => {
    const sessions = [
      sessionRow('1', { date: '2026-09-28' }),
      sessionRow('2', { date: '2026-09-29', kind: 'run', status: 'partial' }),
      sessionRow('3', { date: '2026-09-30', kind: 'mixed' }),
      sessionRow('4', { date: '2026-10-01', status: 'skipped' }),
      sessionRow('5', { date: '2026-10-02', status: 'planned' }),
    ];
    expect(weeklySessions(sessions, '2026-09-28', TODAY)).toEqual([{ week: '2026-09-28', strength: 2, runs: 1 }]);
  });
});

describe('adherenceInRange', () => {
  it('counts planned sessions in the range up to today; done and partial complete them', () => {
    const sessions = [
      sessionRow('done', { date: '2026-09-28' }),
      sessionRow('partial', { date: '2026-09-29', status: 'partial' }),
      sessionRow('skipped', { date: '2026-09-30', status: 'skipped' }),
      sessionRow('missed', { date: '2026-10-01', status: 'planned' }),
      sessionRow('unplanned', { date: '2026-10-02', was_planned: false }),
      sessionRow('before', { date: '2026-09-27', status: 'skipped' }),
    ];
    expect(adherenceInRange(sessions, '2026-09-28', TODAY)).toEqual({ planned: 4, completed: 2, pct: 50 });
  });

  it('does not count today, or later days, until they are finished', () => {
    const sessions = [
      sessionRow('today', { date: TODAY, status: 'planned' }),
      sessionRow('tomorrow', { date: '2026-10-05', status: 'planned' }),
      sessionRow('today-done', { date: TODAY }),
    ];
    expect(adherenceInRange(sessions, '2026-09-28', TODAY)).toEqual({ planned: 1, completed: 1, pct: 100 });
  });
});

describe('liftedExercises', () => {
  it('lists exercises with lifts, most recently trained first, with their best e1RM', () => {
    const lifts = [
      lift('a', '2026-09-14', { exercise_id: 'bench', weight_kg: 80 }),
      lift('b', '2026-09-28', { exercise_id: 'squat', weight_kg: 100, reps: 1 }),
      lift('c', '2026-09-21', { exercise_id: 'squat', weight_kg: 90, reps: 5 }),
    ];
    const list = liftedExercises(lifts, [exerciseRow('squat', 'Back Squat'), exerciseRow('bench', 'Bench Press')]);
    expect(list.map((e) => [e.name, e.lastDate, e.sessions])).toEqual([
      ['Back Squat', '2026-09-28', 2],
      ['Bench Press', '2026-09-14', 1],
    ]);
    expect(list[0].bestE1rm).toBeCloseTo(105);
  });

  it('names an exercise missing from the library', () => {
    expect(liftedExercises([lift('a', '2026-09-14')], [])[0].name).toBe('Unknown exercise');
  });
});

describe('exerciseDays', () => {
  const lifts = [
    lift('a1', '2026-09-14', { weight_kg: 100, reps: 5, rpe: 7 }),
    lift('a2', '2026-09-14', { weight_kg: 100, reps: 5, rpe: 8 }),
    lift('b1', '2026-09-21', { weight_kg: 95, reps: 5, rpe: 8 }),
    lift('c1', '2026-09-28', { weight_kg: 105, reps: 5, rpe: 9 }),
    lift('other', '2026-09-28', { exercise_id: 'bench' }),
  ];

  it('summarises each session of one exercise, oldest first', () => {
    const days = exerciseDays(lifts, 'squat');
    expect(days.map((d) => d.date)).toEqual(['2026-09-14', '2026-09-21', '2026-09-28']);
    expect(days[0]).toMatchObject({ volume: 1000, rpe: 7.5, topWeight: 100, sets: 2 });
    expect(days[0].e1rm).toBeCloseTo(116.667, 2);
  });

  it('marks sessions that set an e1RM record, but not the first one', () => {
    expect(exerciseDays(lifts, 'squat').map((d) => d.pr)).toEqual([false, false, true]);
  });
});

describe('bestSet and repMaxTable', () => {
  const lifts = [
    lift('a', '2026-09-14', { weight_kg: 100, reps: 5, rpe: 8 }),
    lift('b', '2026-09-21', { weight_kg: 120, reps: 1, rpe: 9.5 }),
    lift('c', '2026-09-28', { weight_kg: 105, reps: 5, rpe: 9 }),
    lift('d', '2026-09-28', { weight_kg: 60, reps: 15 }),
  ];

  it('finds the set with the highest e1RM', () => {
    expect(bestSet(lifts, 'squat')).toMatchObject({ date: '2026-09-28', weight_kg: 105, reps: 5, rpe: 9 });
  });

  it('has no best set without lifts', () => {
    expect(bestSet(lifts, 'bench')).toBeNull();
  });

  it('lists the heaviest weight for each rep count up to 12, with its date', () => {
    expect(repMaxTable(lifts, 'squat')).toEqual([
      { reps: 1, weight_kg: 120, date: '2026-09-21' },
      { reps: 5, weight_kg: 105, date: '2026-09-28' },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/progress/strengthStats.test.ts`
Expected: FAIL — `Failed to resolve import "./strengthStats"`.

- [ ] **Step 3: Implement**

`src/features/progress/strengthStats.ts` (new file):

```ts
import { adherence, type AdherenceResult } from '../../lib/adherence';
import { detectPRs } from '../../lib/prs';
import { inRange, weekStarts } from '../../lib/ranges';
import { epley1RM, MAX_TRACKED_REPS } from '../../lib/strength';
import { startOfWeek } from '../../lib/time';
import type { Exercise, ISODate, Session, UUID } from '../../types/domain';
import type { Lift } from './progressData';

export interface WeekVolume {
  week: ISODate;
  volume: number;
}

/** Working-set volume (reps × kg) for every week of the range, empty weeks included. */
export function weeklyVolume(lifts: Lift[], start: ISODate, end: ISODate): WeekVolume[] {
  const totals = new Map(weekStarts(start, end).map((week) => [week, 0]));
  for (const l of lifts) {
    if (!inRange(l.date, start, end)) continue;
    const week = startOfWeek(l.date);
    totals.set(week, (totals.get(week) ?? 0) + l.reps * l.weight_kg);
  }
  return [...totals].map(([week, volume]) => ({ week, volume }));
}

export interface WeekSessions {
  week: ISODate;
  strength: number;
  runs: number;
}

const isCompleted = (s: Session) => s.status === 'done' || s.status === 'partial';

/** Finished sessions per week. A mixed session counts once, as strength. */
export function weeklySessions(sessions: Session[], start: ISODate, end: ISODate): WeekSessions[] {
  const weeks = new Map(weekStarts(start, end).map((week) => [week, { week, strength: 0, runs: 0 }]));
  for (const s of sessions) {
    if (!isCompleted(s) || !inRange(s.date, start, end)) continue;
    const bucket = weeks.get(startOfWeek(s.date))!;
    if (s.kind === 'run') bucket.runs++;
    else bucket.strength++;
  }
  return [...weeks.values()];
}

/**
 * Adherence over the range, up to today. A session planned for today counts
 * only once it is finished — the day is not over — and later days not at all.
 */
export function adherenceInRange(sessions: Session[], start: ISODate, todayDate: ISODate): AdherenceResult {
  return adherence(
    sessions.filter(
      (s) => inRange(s.date, start, todayDate) && !(s.date === todayDate && s.status === 'planned'),
    ),
  );
}

export interface ExerciseSummary {
  exercise_id: UUID;
  name: string;
  /** Sessions the exercise was trained in. */
  sessions: number;
  lastDate: ISODate;
  bestE1rm: number;
}

/** Every exercise with at least one working set, most recently trained first. */
export function liftedExercises(lifts: Lift[], exercises: Exercise[]): ExerciseSummary[] {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const byExercise = new Map<UUID, { sessions: Set<UUID>; lastDate: ISODate; bestE1rm: number }>();
  for (const l of lifts) {
    const entry = byExercise.get(l.exercise_id) ?? { sessions: new Set<UUID>(), lastDate: l.date, bestE1rm: 0 };
    entry.sessions.add(l.session_id);
    if (l.date > entry.lastDate) entry.lastDate = l.date;
    entry.bestE1rm = Math.max(entry.bestE1rm, epley1RM(l.weight_kg, l.reps));
    byExercise.set(l.exercise_id, entry);
  }
  return [...byExercise]
    .map(([exercise_id, e]) => ({
      exercise_id,
      name: names.get(exercise_id) ?? 'Unknown exercise',
      sessions: e.sessions.size,
      lastDate: e.lastDate,
      bestE1rm: e.bestE1rm,
    }))
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.name.localeCompare(b.name));
}

export interface ExerciseDay {
  date: ISODate;
  session_id: UUID;
  /** Best estimated 1RM of the session. */
  e1rm: number;
  volume: number;
  /** Mean RPE of the session's working sets. */
  rpe: number;
  topWeight: number;
  sets: number;
  /** The session beat every earlier e1RM for this exercise. */
  pr: boolean;
}

/**
 * One exercise, session by session, oldest first. PRs are judged against all
 * history, so a record is a record whatever range is on screen. The first
 * session is never a PR: it has nothing to beat.
 */
export function exerciseDays(lifts: Lift[], exerciseId: UUID): ExerciseDay[] {
  const own = lifts.filter((l) => l.exercise_id === exerciseId);
  const prSets = new Set(
    detectPRs(own.map((l) => ({ ...l, is_warmup: false })))
      .filter((e) => e.kind === 'e1rm')
      .map((e) => e.set_id),
  );

  const sessions = new Map<UUID, Lift[]>();
  for (const l of own) sessions.set(l.session_id, [...(sessions.get(l.session_id) ?? []), l]);

  return [...sessions]
    .map(([session_id, sets]) => ({
      date: sets[0].date,
      session_id,
      e1rm: Math.max(...sets.map((s) => epley1RM(s.weight_kg, s.reps))),
      volume: sets.reduce((sum, s) => sum + s.reps * s.weight_kg, 0),
      rpe: sets.reduce((sum, s) => sum + s.rpe, 0) / sets.length,
      topWeight: Math.max(...sets.map((s) => s.weight_kg)),
      sets: sets.length,
      pr: sets.some((s) => prSets.has(s.set_id)),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day, i) => (i === 0 ? { ...day, pr: false } : day));
}

export interface BestSet {
  date: ISODate;
  reps: number;
  weight_kg: number;
  rpe: number;
  e1rm: number;
}

/** The set with the highest estimated 1RM; the earliest wins a tie. */
export function bestSet(lifts: Lift[], exerciseId: UUID): BestSet | null {
  let best: BestSet | null = null;
  for (const l of lifts) {
    if (l.exercise_id !== exerciseId) continue;
    const e1rm = epley1RM(l.weight_kg, l.reps);
    if (!best || e1rm > best.e1rm) best = { date: l.date, reps: l.reps, weight_kg: l.weight_kg, rpe: l.rpe, e1rm };
  }
  return best;
}

export interface RepMax {
  reps: number;
  weight_kg: number;
  date: ISODate;
}

/** The heaviest weight lifted for each rep count from 1 to 12, first achieved. */
export function repMaxTable(lifts: Lift[], exerciseId: UUID): RepMax[] {
  const best = new Map<number, RepMax>();
  for (const l of lifts) {
    if (l.exercise_id !== exerciseId || l.reps < 1 || l.reps > MAX_TRACKED_REPS || l.weight_kg <= 0) continue;
    const current = best.get(l.reps);
    if (!current || l.weight_kg > current.weight_kg) best.set(l.reps, { reps: l.reps, weight_kg: l.weight_kg, date: l.date });
  }
  return [...best.values()].sort((a, b) => a.reps - b.reps);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/features/progress/strengthStats.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/progress/strengthStats.ts src/features/progress/strengthStats.test.ts
git commit -m "feat: strength statistics — weekly volume, sessions, adherence, e1RM and PRs"
```

---

## Task 4: RPE statistics

Session RPE as the spec defines it: the mean RPE of the working sets, or the run's RPE for a session with no sets. The fatigue alerts feed `fatigueFlag` from `lib/rpe.ts` one point per session per exercise — that session's mean RPE and its top-set weight — so a back-off set does not read as a drop in load.

**Files:**
- Create: `src/features/progress/rpeStats.ts`, `src/features/progress/rpeStats.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/progress/rpeStats.test.ts` (new file):

```ts
import { describe, expect, it } from 'vitest';
import { exerciseRow } from '../../test/rows';
import type { Lift, RunPoint } from './progressData';
import { fatigueAlerts, sessionLoads, volumeVsRpe, weeklyRpe } from './rpeStats';

const TODAY = '2026-10-04';

let nextSet = 0;

function lift(session: string, date: string, extra: Partial<Lift> = {}): Lift {
  return { set_id: `set-${nextSet++}`, session_id: session, date, exercise_id: 'squat', reps: 5, weight_kg: 100, rpe: 8, ...extra };
}

function run(session: string, date: string, rpe: number): RunPoint {
  return { run_id: `r-${session}`, session_id: session, date, exercise_id: 'easy', run_type: 'easy', distance_km: 5, duration_s: 1500, rpe };
}

describe('sessionLoads', () => {
  it('uses the mean working-set RPE and volume of a strength session', () => {
    const loads = sessionLoads([lift('s1', '2026-09-28', { rpe: 7 }), lift('s1', '2026-09-28', { rpe: 9 })], []);
    expect(loads).toEqual([{ session_id: 's1', date: '2026-09-28', rpe: 8, volume: 1000, kind: 'strength' }]);
  });

  it("uses the run's RPE for a run session", () => {
    expect(sessionLoads([], [run('r1', '2026-09-29', 6)])).toEqual([
      { session_id: 'r1', date: '2026-09-29', rpe: 6, volume: 0, kind: 'run' },
    ]);
  });

  it('prefers the sets in a mixed session, as the spec defines session RPE', () => {
    const loads = sessionLoads([lift('m', '2026-09-30', { rpe: 9 })], [run('m', '2026-09-30', 5)]);
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ rpe: 9, kind: 'strength' });
  });

  it('orders sessions by date', () => {
    const loads = sessionLoads([lift('b', '2026-10-01')], [run('a', '2026-09-29', 6)]);
    expect(loads.map((l) => l.session_id)).toEqual(['a', 'b']);
  });
});

describe('weeklyRpe', () => {
  it('averages session RPE per week and leaves empty weeks blank', () => {
    const loads = sessionLoads(
      [lift('s1', '2026-09-14', { rpe: 7 }), lift('s2', '2026-09-16', { rpe: 9 })],
      [run('r1', '2026-09-29', 5)],
    );
    expect(weeklyRpe(loads, '2026-09-14', TODAY)).toEqual([
      { week: '2026-09-14', rpe: 8, sessions: 2 },
      { week: '2026-09-21', rpe: null, sessions: 0 },
      { week: '2026-09-28', rpe: 5, sessions: 1 },
    ]);
  });
});

describe('volumeVsRpe', () => {
  it('plots strength sessions in the range only', () => {
    const loads = sessionLoads(
      [lift('old', '2026-08-01'), lift('s1', '2026-09-28', { rpe: 9 })],
      [run('r1', '2026-09-29', 5)],
    );
    expect(volumeVsRpe(loads, '2026-09-14', TODAY)).toEqual([{ date: '2026-09-28', volume: 500, rpe: 9 }]);
  });
});

describe('fatigueAlerts', () => {
  // Prior window 7–20 Sep at RPE 7, recent window 21 Sep–4 Oct at RPE 8, same 100 kg top set.
  const flat = [
    lift('p1', '2026-09-08', { rpe: 7 }),
    lift('p2', '2026-09-15', { rpe: 7 }),
    lift('r1', '2026-09-22', { rpe: 8 }),
    lift('r2', '2026-09-29', { rpe: 8 }),
  ];

  it('flags an exercise whose RPE rose at the same load', () => {
    const alerts = fatigueAlerts(flat, [exerciseRow('squat', 'Back Squat')], TODAY);
    expect(alerts).toEqual([{ exercise_id: 'squat', name: 'Back Squat', rpe_delta: 1, load_change_pct: 0 }]);
  });

  it('does not flag RPE rising with the load', () => {
    const heavier = flat.map((l) => (l.date >= '2026-09-21' ? { ...l, weight_kg: 110 } : l));
    expect(fatigueAlerts(heavier, [], TODAY)).toEqual([]);
  });

  it('judges each session by its top set', () => {
    const withBackOff = [...flat, lift('r2', '2026-09-29', { rpe: 8, weight_kg: 60 })];
    expect(fatigueAlerts(withBackOff, [], TODAY)).toHaveLength(1);
  });

  it('lists the biggest RPE rise first', () => {
    const bench = flat.map((l) => ({ ...l, exercise_id: 'bench', rpe: l.date >= '2026-09-21' ? 9 : 7 }));
    expect(fatigueAlerts([...flat, ...bench], [], TODAY).map((a) => a.exercise_id)).toEqual(['bench', 'squat']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/progress/rpeStats.test.ts`
Expected: FAIL — `Failed to resolve import "./rpeStats"`.

- [ ] **Step 3: Implement**

`src/features/progress/rpeStats.ts` (new file):

```ts
import { inRange, weekStarts } from '../../lib/ranges';
import { fatigueFlag, type LoadPoint } from '../../lib/rpe';
import { startOfWeek } from '../../lib/time';
import type { Exercise, ISODate, UUID } from '../../types/domain';
import type { Lift, RunPoint } from './progressData';

/** One session's effort: its RPE and, for strength, its volume. */
export interface SessionLoad {
  session_id: UUID;
  date: ISODate;
  rpe: number;
  volume: number;
  kind: 'strength' | 'run';
}

/**
 * Session RPE as the spec defines it: the mean RPE of the working sets, or
 * the run's RPE for a session with no sets. Oldest first.
 */
export function sessionLoads(lifts: Lift[], runs: RunPoint[]): SessionLoad[] {
  const bySession = new Map<UUID, Lift[]>();
  for (const l of lifts) bySession.set(l.session_id, [...(bySession.get(l.session_id) ?? []), l]);

  const loads: SessionLoad[] = [...bySession].map(([session_id, sets]) => ({
    session_id,
    date: sets[0].date,
    rpe: sets.reduce((sum, s) => sum + s.rpe, 0) / sets.length,
    volume: sets.reduce((sum, s) => sum + s.reps * s.weight_kg, 0),
    kind: 'strength',
  }));
  for (const r of runs) {
    if (bySession.has(r.session_id)) continue;
    loads.push({ session_id: r.session_id, date: r.date, rpe: r.rpe, volume: 0, kind: 'run' });
  }
  return loads.sort((a, b) => a.date.localeCompare(b.date));
}

export interface WeekRpe {
  week: ISODate;
  /** Mean session RPE, or null for a week with no sessions — a gap, not a zero. */
  rpe: number | null;
  sessions: number;
}

export function weeklyRpe(loads: SessionLoad[], start: ISODate, end: ISODate): WeekRpe[] {
  const weeks = new Map(weekStarts(start, end).map((week) => [week, [] as number[]]));
  for (const l of loads) if (inRange(l.date, start, end)) weeks.get(startOfWeek(l.date))!.push(l.rpe);
  return [...weeks].map(([week, rpes]) => ({
    week,
    rpe: rpes.length > 0 ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
    sessions: rpes.length,
  }));
}

/** Strength sessions in the range, for a volume-against-RPE scatter. */
export function volumeVsRpe(loads: SessionLoad[], start: ISODate, end: ISODate): { date: ISODate; volume: number; rpe: number }[] {
  return loads
    .filter((l) => l.kind === 'strength' && inRange(l.date, start, end))
    .map(({ date, volume, rpe }) => ({ date, volume, rpe }));
}

export interface FatigueAlert {
  exercise_id: UUID;
  name: string;
  rpe_delta: number;
  load_change_pct: number;
}

/**
 * Exercises where the same weight is getting harder: the fatigue flag from
 * lib/rpe over the last two weeks against the two before. Each session counts
 * once, with its mean RPE and its top-set weight. Biggest RPE rise first.
 */
export function fatigueAlerts(lifts: Lift[], exercises: Exercise[], todayDate: ISODate): FatigueAlert[] {
  const names = new Map(exercises.map((e) => [e.id, e.name]));
  const sessionsByExercise = new Map<UUID, Map<UUID, Lift[]>>();
  for (const l of lifts) {
    const sessions = sessionsByExercise.get(l.exercise_id) ?? new Map<UUID, Lift[]>();
    sessions.set(l.session_id, [...(sessions.get(l.session_id) ?? []), l]);
    sessionsByExercise.set(l.exercise_id, sessions);
  }

  const alerts: FatigueAlert[] = [];
  for (const [exercise_id, sessions] of sessionsByExercise) {
    const points: LoadPoint[] = [...sessions.values()].map((sets) => ({
      date: sets[0].date,
      rpe: sets.reduce((sum, s) => sum + s.rpe, 0) / sets.length,
      top_set_load: Math.max(...sets.map((s) => s.weight_kg)),
    }));
    const result = fatigueFlag(points, todayDate);
    if (result.flagged && result.rpe_delta !== null && result.load_change_pct !== null) {
      alerts.push({
        exercise_id,
        name: names.get(exercise_id) ?? 'Unknown exercise',
        rpe_delta: result.rpe_delta,
        load_change_pct: result.load_change_pct,
      });
    }
  }
  return alerts.sort((a, b) => b.rpe_delta - a.rpe_delta);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/features/progress/rpeStats.test.ts`
Expected: PASS — 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/progress/rpeStats.ts src/features/progress/rpeStats.test.ts
git commit -m "feat: RPE statistics — session RPE, weekly trend, volume against RPE, fatigue alerts"
```

---

## Task 5: Running statistics

Pace is one row per run with the pace under its run type's key — `{ date, tempo: 280 }` — which is the shape a multi-line chart wants: one line per type, gaps where a run was another type. Distances are summed then rounded to two places: decimal kilometres drift in floating point (0.1 + 0.2).

**Files:**
- Create: `src/features/progress/runStats.ts`, `src/features/progress/runStats.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/progress/runStats.test.ts` (new file):

```ts
import { describe, expect, it } from 'vitest';
import type { RunPoint } from './progressData';
import { longestRun, monthlyTotals, paceByType, paceVsRpe, runTotals, weeklyKm } from './runStats';

const TODAY = '2026-10-04';

function run(id: string, date: string, extra: Partial<RunPoint> = {}): RunPoint {
  return {
    run_id: id,
    session_id: `s-${id}`,
    date,
    exercise_id: 'easy',
    run_type: 'easy',
    distance_km: 5,
    duration_s: 1500,
    rpe: 6,
    ...extra,
  };
}

const runs = [
  run('old', '2026-08-30', { distance_km: 20, duration_s: 7200 }),
  run('a', '2026-09-15', { distance_km: 8, duration_s: 2880 }),
  run('b', '2026-09-17', { run_type: 'tempo', distance_km: 6, duration_s: 1680, rpe: 8 }),
  run('c', '2026-09-30', { run_type: 'long', distance_km: 14.5, duration_s: 5220, rpe: 7 }),
  run('zero', '2026-10-01', { distance_km: 0, duration_s: 600 }),
];

describe('weeklyKm', () => {
  it('sums distance and counts runs per week, zero-filled', () => {
    expect(weeklyKm(runs, '2026-09-14', TODAY)).toEqual([
      { week: '2026-09-14', km: 14, runs: 2 },
      { week: '2026-09-21', km: 0, runs: 0 },
      { week: '2026-09-28', km: 14.5, runs: 2 },
    ]);
  });
});

describe('paceByType', () => {
  it('gives each run its pace under its own type, skipping runs with no distance', () => {
    expect(paceByType(runs, '2026-09-14', TODAY)).toEqual([
      { date: '2026-09-15', easy: 360 },
      { date: '2026-09-17', tempo: 280 },
      { date: '2026-09-30', long: 360 },
    ]);
  });
});

describe('longestRun', () => {
  it('finds the longest run in the range', () => {
    expect(longestRun(runs, '2026-09-14', TODAY)?.run_id).toBe('c');
    expect(longestRun(runs, '2026-08-01', TODAY)?.run_id).toBe('old');
  });

  it('is null with no runs', () => {
    expect(longestRun([], '2026-09-14', TODAY)).toBeNull();
  });
});

describe('monthlyTotals', () => {
  it('totals each month of the range, empty months included', () => {
    expect(monthlyTotals(runs, '2026-07-27', TODAY)).toEqual([
      { month: '2026-07', km: 0, runs: 0, duration_s: 0 },
      { month: '2026-08', km: 20, runs: 1, duration_s: 7200 },
      { month: '2026-09', km: 28.5, runs: 3, duration_s: 9780 },
      { month: '2026-10', km: 0, runs: 1, duration_s: 600 },
    ]);
  });
});

describe('paceVsRpe and runTotals', () => {
  it('plots pace against RPE for runs with a distance', () => {
    expect(paceVsRpe(runs, '2026-09-14', TODAY)).toEqual([
      { date: '2026-09-15', pace: 360, rpe: 6, run_type: 'easy' },
      { date: '2026-09-17', pace: 280, rpe: 8, run_type: 'tempo' },
      { date: '2026-09-30', pace: 360, rpe: 7, run_type: 'long' },
    ]);
  });

  it('totals the range', () => {
    expect(runTotals(runs, '2026-09-14', TODAY)).toEqual({ km: 28.5, runs: 4, duration_s: 10380 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/progress/runStats.test.ts`
Expected: FAIL — `Failed to resolve import "./runStats"`.

- [ ] **Step 3: Implement**

`src/features/progress/runStats.ts` (new file):

```ts
import { inRange, monthOf, monthsBetween, weekStarts } from '../../lib/ranges';
import { paceSecondsPerKm } from '../../lib/running';
import { startOfWeek } from '../../lib/time';
import type { ISODate, RunType } from '../../types/domain';
import type { RunPoint } from './progressData';

const within = (runs: RunPoint[], start: ISODate, end: ISODate) => runs.filter((r) => inRange(r.date, start, end));

/** Floating-point sums of decimal kilometres drift (0.1 + 0.2); two places is the stored precision. */
const km = (n: number) => Math.round(n * 100) / 100;

export interface WeekKm {
  week: ISODate;
  km: number;
  runs: number;
}

export function weeklyKm(runs: RunPoint[], start: ISODate, end: ISODate): WeekKm[] {
  const weeks = new Map(weekStarts(start, end).map((week) => [week, { week, km: 0, runs: 0 }]));
  for (const r of within(runs, start, end)) {
    const bucket = weeks.get(startOfWeek(r.date))!;
    bucket.km = km(bucket.km + r.distance_km);
    bucket.runs++;
  }
  return [...weeks.values()];
}

/** One row per run, with its pace in seconds per km under its run type — one chart line per type. */
export type PaceRow = { date: ISODate } & Partial<Record<RunType, number>>;

export function paceByType(runs: RunPoint[], start: ISODate, end: ISODate): PaceRow[] {
  return within(runs, start, end)
    .filter((r) => r.distance_km > 0 && r.duration_s > 0)
    .map((r) => ({ date: r.date, [r.run_type]: paceSecondsPerKm(r.duration_s, r.distance_km) }));
}

export function longestRun(runs: RunPoint[], start: ISODate, end: ISODate): RunPoint | null {
  return within(runs, start, end).reduce<RunPoint | null>(
    (best, r) => (!best || r.distance_km > best.distance_km ? r : best),
    null,
  );
}

export interface MonthTotal {
  /** 'YYYY-MM' */
  month: string;
  km: number;
  runs: number;
  duration_s: number;
}

export function monthlyTotals(runs: RunPoint[], start: ISODate, end: ISODate): MonthTotal[] {
  const months = new Map(monthsBetween(start, end).map((month) => [month, { month, km: 0, runs: 0, duration_s: 0 }]));
  for (const r of within(runs, start, end)) {
    const bucket = months.get(monthOf(r.date))!;
    bucket.km = km(bucket.km + r.distance_km);
    bucket.runs++;
    bucket.duration_s += r.duration_s;
  }
  return [...months.values()];
}

export function paceVsRpe(
  runs: RunPoint[],
  start: ISODate,
  end: ISODate,
): { date: ISODate; pace: number; rpe: number; run_type: RunType }[] {
  return within(runs, start, end)
    .filter((r) => r.distance_km > 0 && r.duration_s > 0)
    .map((r) => ({ date: r.date, pace: paceSecondsPerKm(r.duration_s, r.distance_km), rpe: r.rpe, run_type: r.run_type }));
}

export function runTotals(runs: RunPoint[], start: ISODate, end: ISODate): { km: number; runs: number; duration_s: number } {
  const inside = within(runs, start, end);
  return {
    km: km(inside.reduce((sum, r) => sum + r.distance_km, 0)),
    runs: inside.length,
    duration_s: inside.reduce((sum, r) => sum + r.duration_s, 0),
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/features/progress/runStats.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/progress/runStats.ts src/features/progress/runStats.test.ts
git commit -m "feat: running statistics — weekly km, pace by type, longest run, monthly totals"
```

---

## Task 6: Body metrics

The `body_metrics` table has existed since Plan 1; this is its first writer. One entry per day keeps each chart a single line, so a second entry for a date is refused with a message pointing at the existing one. The repository re-checks that inside its transaction, so the rule holds however the form is bypassed.

**Files:**
- Create: `src/features/progress/bodyRules.ts`, `src/features/progress/bodyRules.test.ts`, `src/features/progress/bodyRepo.ts`, `src/features/progress/bodyRepo.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/features/progress/bodyRules.test.ts` (new file):

```ts
import { describe, expect, it } from 'vitest';
import { bodySeries, emptyBodyDraft, validateBody } from './bodyRules';
import { bodyRow } from '../../test/rows';

const TODAY = '2026-10-04';

describe('validateBody', () => {
  const draft = { date: TODAY, weight_kg: 81.4, resting_hr: 55, note: '' };

  it('accepts a weight, a resting heart rate, or both', () => {
    expect(validateBody(draft, TODAY, [])).toEqual({});
    expect(validateBody({ ...draft, resting_hr: null }, TODAY, [])).toEqual({});
    expect(validateBody({ ...draft, weight_kg: null }, TODAY, [])).toEqual({});
  });

  it('needs at least one measurement', () => {
    expect(validateBody({ ...draft, weight_kg: null, resting_hr: null }, TODAY, [])).toEqual({
      weight_kg: 'Enter a weight or a resting heart rate',
    });
  });

  it('rejects implausible or unparseable values', () => {
    expect(validateBody({ ...draft, weight_kg: 12 }, TODAY, []).weight_kg).toBe('Weight must be 20–300 kg');
    expect(validateBody({ ...draft, weight_kg: Number.NaN }, TODAY, []).weight_kg).toBe('Weight must be 20–300 kg');
    expect(validateBody({ ...draft, resting_hr: 210 }, TODAY, []).resting_hr).toBe('Resting heart rate must be 25–150 bpm');
    expect(validateBody({ ...draft, resting_hr: 55.5 }, TODAY, []).resting_hr).toBe('Resting heart rate must be 25–150 bpm');
  });

  it('rejects a missing or future date', () => {
    expect(validateBody({ ...draft, date: '' }, TODAY, []).date).toBe('Pick a date');
    expect(validateBody({ ...draft, date: '2026-10-05' }, TODAY, []).date).toBe('The date cannot be in the future');
  });

  it('allows one entry per day', () => {
    expect(validateBody(draft, TODAY, [TODAY]).date).toBe('There is already an entry for this day — edit that one');
  });
});

describe('emptyBodyDraft', () => {
  it('starts today, carrying the last weight forward', () => {
    expect(emptyBodyDraft(TODAY, 80.2)).toEqual({ date: TODAY, weight_kg: 80.2, resting_hr: null, note: '' });
  });
});

describe('bodySeries', () => {
  it('splits entries into a weight series and a resting heart rate series within the range', () => {
    const rows = [
      bodyRow('a', '2026-09-01', { weight_kg: 82 }),
      bodyRow('b', '2026-09-20', { weight_kg: 81, resting_hr: 56 }),
      bodyRow('c', '2026-09-27', { resting_hr: 54 }),
    ];
    expect(bodySeries(rows, '2026-09-14', TODAY)).toEqual({
      weight: [{ date: '2026-09-20', value: 81 }],
      restingHr: [
        { date: '2026-09-20', value: 56 },
        { date: '2026-09-27', value: 54 },
      ],
    });
  });
});
```

`src/features/progress/bodyRepo.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { resetDb } from '../../test/fixtures';
import { deleteBodyMetric, saveBodyMetric } from './bodyRepo';

const TODAY = '2026-10-04';
const draft = { date: '2026-10-03', weight_kg: 81.456, resting_hr: 55, note: '  after the long run  ' };

describe('body repository', () => {
  beforeEach(resetDb);

  it('creates an entry, rounding weight to the stored precision and trimming the note', async () => {
    const row = await saveBodyMetric(null, draft, TODAY);
    expect(row).toMatchObject({ date: '2026-10-03', weight_kg: 81.46, resting_hr: 55, note: 'after the long run', _dirty: 1 });
  });

  it('updates an entry in place', async () => {
    const row = await saveBodyMetric(null, draft, TODAY);
    await saveBodyMetric(row.id, { ...draft, weight_kg: 80, note: '' }, TODAY);
    expect(await db.body_metrics.get(row.id)).toMatchObject({ weight_kg: 80, note: null });
    expect(await db.body_metrics.count()).toBe(1);
  });

  it('refuses a second entry on the same day, but not re-saving the same one', async () => {
    const row = await saveBodyMetric(null, draft, TODAY);
    await expect(saveBodyMetric(null, draft, TODAY)).rejects.toThrow('already an entry');
    await expect(saveBodyMetric(row.id, draft, TODAY)).resolves.toBeDefined();
  });

  it('allows a new entry on a day whose entry was deleted', async () => {
    const row = await saveBodyMetric(null, draft, TODAY);
    await deleteBodyMetric(row.id);
    await expect(saveBodyMetric(null, draft, TODAY)).resolves.toBeDefined();
  });

  it('refuses invalid input', async () => {
    await expect(saveBodyMetric(null, { ...draft, weight_kg: null, resting_hr: null }, TODAY)).rejects.toThrow(
      'Enter a weight',
    );
  });

  it('soft-deletes', async () => {
    const row = await saveBodyMetric(null, draft, TODAY);
    await deleteBodyMetric(row.id);
    expect(await db.body_metrics.get(row.id)).toMatchObject({ _deleted: 1, _dirty: 1 });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/features/progress/bodyRules.test.ts src/features/progress/bodyRepo.test.ts`
Expected: FAIL — `Failed to resolve import "./bodyRules"` and `"./bodyRepo"`.

- [ ] **Step 3: Implement**

`src/features/progress/bodyRules.ts` (new file):

```ts
import { inRange } from '../../lib/ranges';
import type { BodyMetric, ISODate } from '../../types/domain';

/** A body entry being typed. Numbers are null when blank and NaN when unparseable. */
export interface BodyDraft {
  date: ISODate;
  weight_kg: number | null;
  resting_hr: number | null;
  note: string;
}

export type BodyErrors = Partial<Record<'date' | 'weight_kg' | 'resting_hr', string>>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `takenDates` are days that already have another live entry: one entry per day keeps each chart a single line. */
export function validateBody(draft: BodyDraft, todayDate: ISODate, takenDates: ISODate[]): BodyErrors {
  const errors: BodyErrors = {};
  if (!ISO_DATE.test(draft.date)) errors.date = 'Pick a date';
  else if (draft.date > todayDate) errors.date = 'The date cannot be in the future';
  else if (takenDates.includes(draft.date)) errors.date = 'There is already an entry for this day — edit that one';

  if (draft.weight_kg === null && draft.resting_hr === null) {
    errors.weight_kg = 'Enter a weight or a resting heart rate';
  }
  if (draft.weight_kg !== null && !(draft.weight_kg >= 20 && draft.weight_kg <= 300)) {
    errors.weight_kg = 'Weight must be 20–300 kg';
  }
  if (
    draft.resting_hr !== null &&
    !(Number.isInteger(draft.resting_hr) && draft.resting_hr >= 25 && draft.resting_hr <= 150)
  ) {
    errors.resting_hr = 'Resting heart rate must be 25–150 bpm';
  }
  return errors;
}

/** A new entry: today, with the last weight pre-filled since it rarely moves much. */
export function emptyBodyDraft(todayDate: ISODate, lastWeight: number | null): BodyDraft {
  return { date: todayDate, weight_kg: lastWeight, resting_hr: null, note: '' };
}

export interface BodyPoint {
  date: ISODate;
  value: number;
}

/** Date-ordered entries in the range, split into one series per measurement. */
export function bodySeries(rows: BodyMetric[], start: ISODate, end: ISODate): { weight: BodyPoint[]; restingHr: BodyPoint[] } {
  const inside = rows.filter((r) => inRange(r.date, start, end));
  return {
    weight: inside.flatMap((r) => (r.weight_kg === null ? [] : [{ date: r.date, value: r.weight_kg }])),
    restingHr: inside.flatMap((r) => (r.resting_hr === null ? [] : [{ date: r.date, value: r.resting_hr }])),
  };
}
```

`src/features/progress/bodyRepo.ts` (new file):

```ts
import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import type { BodyMetric, ISODate, Local, UUID } from '../../types/domain';
import { validateBody, type BodyDraft } from './bodyRules';

/** Creates an entry (`id` null) or updates one. Throws with the validation messages if the draft is invalid. */
export async function saveBodyMetric(id: UUID | null, draft: BodyDraft, todayDate: ISODate): Promise<Local<BodyMetric>> {
  return db.transaction('rw', db.body_metrics, async () => {
    const sameDay = await db.body_metrics.where('date').equals(draft.date).toArray();
    const taken = sameDay.filter((b) => b._deleted === 0 && b.id !== id).map((b) => b.date);
    const messages = Object.values(validateBody(draft, todayDate, taken));
    if (messages.length > 0) throw new Error(messages.join('; '));

    const fields = {
      date: draft.date,
      weight_kg: draft.weight_kg === null ? null : Math.round(draft.weight_kg * 100) / 100,
      resting_hr: draft.resting_hr,
      note: draft.note.trim() || null,
    };
    return id ? updateRow<BodyMetric>('body_metrics', id, fields) : insertRow<BodyMetric>('body_metrics', fields);
  });
}

export async function deleteBodyMetric(id: UUID): Promise<void> {
  await softDeleteRow('body_metrics', id);
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/features/progress/bodyRules.test.ts src/features/progress/bodyRepo.test.ts`
Expected: PASS — 7 and 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/progress/bodyRules.ts src/features/progress/bodyRules.test.ts src/features/progress/bodyRepo.ts src/features/progress/bodyRepo.test.ts
git commit -m "feat: body metrics — validation, one entry per day, repository"
```

---

## Task 7: Demo data

Charts cannot be checked without history, so demo data comes before them. `buildDemo` is pure and deterministic (a seeded PRNG): twelve weeks before this one, up to yesterday — alternating strength days A and B on Monday, Wednesday and Friday with steady progression and a deload in week 7, runs on Tuesday, Thursday and Saturday, a weekly weigh-in, a few skipped sessions. The bench press stalls for the last four weeks while its RPE climbs over the last two, so the fatigue banner has something to show. `loadDemoData` writes it in one transaction, using the library's exercises by name; see decision 1 for how removal finds it.

**Files:**
- Create: `src/features/settings/demoData.ts`, `src/features/settings/demoData.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/settings/demoData.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { seedExercises } from '../../db/seed';
import { markSynced, resetDb } from '../../test/fixtures';
import { createSessionFromTemplate } from '../log/sessionsRepo';
import { loadProgressData } from '../progress/progressData';
import { fatigueAlerts } from '../progress/rpeStats';
import { adherenceInRange } from '../progress/strengthStats';
import { buildDemo, DEMO_NOTE, hasDemoData, loadDemoData, removeDemoData } from './demoData';

const TODAY = '2026-10-04';

describe('buildDemo', () => {
  it('is the same every time', () => {
    expect(buildDemo(TODAY)).toEqual(buildDemo(TODAY));
  });

  it('covers twelve weeks before this one and stops before today', () => {
    const { sessions, body } = buildDemo(TODAY);
    const dates = sessions.map((s) => s.date).sort();
    expect(dates[0]).toBe('2026-07-06');
    expect(dates.at(-1)).toBe('2026-10-03');
    expect(body).toHaveLength(13);
  });

  it('plans strength on Monday, Wednesday and Friday and runs on Tuesday, Thursday and Saturday', () => {
    const week = buildDemo(TODAY).sessions.filter((s) => s.date >= '2026-07-06' && s.date <= '2026-07-12');
    expect(week.map((s) => [s.date, s.workout ?? 'run'])).toEqual([
      ['2026-07-06', 'A'],
      ['2026-07-07', 'run'],
      ['2026-07-08', 'B'],
      ['2026-07-09', 'run'],
      ['2026-07-10', 'A'],
      ['2026-07-11', 'run'],
    ]);
  });

  it('uses only valid RPE values', () => {
    const rpes = buildDemo(TODAY).sessions.flatMap((s) => [
      ...s.lifts.flatMap((l) => l.sets.map((set) => set.rpe)),
      ...(s.run ? [s.run.rpe] : []),
    ]);
    expect(rpes.every((r) => r >= 1 && r <= 10 && Number.isInteger(r * 2))).toBe(true);
  });
});

describe('loading and removing demo data', () => {
  beforeEach(async () => {
    await resetDb();
    await markSynced();
    await seedExercises();
  });

  it('writes sessions, sets, runs, workouts and body entries, all marked', async () => {
    const written = await loadDemoData(TODAY);
    expect(written).toBeGreaterThan(500);
    expect(await hasDemoData()).toBe(true);

    const sessions = await db.sessions.toArray();
    expect(sessions.every((s) => s.notes === DEMO_NOTE && s._dirty === 1)).toBe(true);
    expect(await db.runs.count()).toBeGreaterThan(30);
    expect((await db.body_metrics.toArray()).every((b) => b.note === DEMO_NOTE)).toBe(true);
    expect((await db.workout_templates.toArray()).map((t) => t.name).sort()).toEqual([
      'Demo — Deadlift & Press',
      'Demo — Squat & Bench',
    ]);
  });

  it('gives the charts something to show, including a fatigue alert', async () => {
    await loadDemoData(TODAY);
    const data = await loadProgressData(TODAY);
    expect(fatigueAlerts(data.lifts, data.exercises, TODAY).map((a) => a.name)).toContain('Barbell Bench Press');
    const result = adherenceInRange(data.sessions, '2026-07-06', TODAY);
    expect(result.pct).toBeGreaterThan(70);
    expect(result.pct).toBeLessThan(100);
  });

  it('refuses to load twice', async () => {
    await loadDemoData(TODAY);
    await expect(loadDemoData(TODAY)).rejects.toThrow('already loaded');
  });

  it('needs the exercise library', async () => {
    await db.exercises.clear();
    await expect(loadDemoData(TODAY)).rejects.toThrow('library is empty');
  });

  it('removes every demo row and leaves real data alone', async () => {
    const real = await createSessionFromTemplate('2026-10-02', null, { wasPlanned: false });
    await loadDemoData(TODAY);
    const removed = await removeDemoData();

    expect(removed).toBeGreaterThan(60);
    expect(await hasDemoData()).toBe(false);
    const live = await db.sessions.where('_deleted').equals(0).toArray();
    expect(live.map((s) => s.id)).toEqual([real.id]);
    expect(await db.set_entries.where('_deleted').equals(0).count()).toBe(0);
    expect(await db.runs.where('_deleted').equals(0).count()).toBe(0);
    expect(await db.body_metrics.where('_deleted').equals(0).count()).toBe(0);
    expect(await db.workout_templates.where('_deleted').equals(0).count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/settings/demoData.test.ts`
Expected: FAIL — `Failed to resolve import "./demoData"`.

- [ ] **Step 3: Implement**

`src/features/settings/demoData.ts` (new file):

```ts
import { db } from '../../db/schema';
import { insertRow, softDeleteRow } from '../../db/repo';
import { addDays, daysBetween, parseISODate, startOfWeek } from '../../lib/time';
import type {
  BodyMetric,
  Exercise,
  ISODate,
  Local,
  Run,
  Session,
  SessionExercise,
  SetEntry,
  WorkoutTemplate,
  WorkoutTemplateItem,
} from '../../types/domain';
import { removeSession } from '../log/sessionsRepo';
import { deleteWorkout } from '../plan/workoutsRepo';

/**
 * Every demo row carries this note — sessions, workouts and body entries —
 * which is how "Remove demo data" finds them again, on any device. It is also
 * visible, so a demo session is never mistaken for a real one.
 */
export const DEMO_NOTE = 'Demo data';

/** Whole weeks of history before the current one. */
export const DEMO_WEEKS = 12;

export interface DemoSet {
  reps: number;
  weight_kg: number;
  rpe: number;
}

export interface DemoSession {
  date: ISODate;
  status: 'done' | 'partial' | 'skipped';
  energy: number | null;
  /** 'A' or 'B' for a strength day; null for a run. */
  workout: 'A' | 'B' | null;
  lifts: { exercise: string; sets: DemoSet[] }[];
  run: { exercise: string; distance_km: number; duration_s: number; rpe: number; avg_hr: number } | null;
}

export interface DemoBody {
  date: ISODate;
  weight_kg: number;
  resting_hr: number;
}

export const DEMO_WORKOUTS = {
  A: { name: 'Demo — Squat & Bench', exercises: ['Back Squat', 'Barbell Bench Press', 'Barbell Row'] },
  B: { name: 'Demo — Deadlift & Press', exercises: ['Conventional Deadlift', 'Overhead Press', 'Pull-Up'] },
} as const;

/** Small deterministic PRNG, so the demo is the same every time and tests can rely on it. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const plate = (kg: number) => Math.round(kg / 2.5) * 2.5;
const halfStep = (rpe: number) => Math.min(10, Math.max(6, Math.round(rpe * 2) / 2));

/**
 * Twelve weeks of a plausible program ending yesterday: two alternating
 * strength days on Monday, Wednesday and Friday with steady progression and a
 * deload in week 7, runs on Tuesday, Thursday and Saturday, a weekly weigh-in.
 *
 * The bench press stalls for the last four weeks while its RPE climbs over
 * the last two, so the fatigue banner has something to show.
 */
export function buildDemo(todayDate: ISODate, seed = 7): { sessions: DemoSession[]; body: DemoBody[] } {
  const rand = mulberry32(seed);
  const jitter = (spread: number) => (rand() - 0.5) * 2 * spread;
  const firstMonday = addDays(startOfWeek(todayDate), -7 * DEMO_WEEKS);
  const sessions: DemoSession[] = [];
  const body: DemoBody[] = [];

  for (let week = 0; week <= DEMO_WEEKS; week++) {
    const monday = addDays(firstMonday, week * 7);
    const deload = week === 6;
    const effort = deload ? 6.5 : 7 + week * 0.08;

    for (let day = 0; day < 7; day++) {
      const date = addDays(monday, day);
      if (date >= todayDate) break;
      const daysAgo = daysBetween(date, todayDate);

      if (day === 0) {
        body.push({
          date,
          weight_kg: Math.round((82 - week * 0.12 + jitter(0.3)) * 10) / 10,
          resting_hr: Math.round(58 - week * 0.3 + jitter(1)),
        });
      }

      if (day === 0 || day === 2 || day === 4) {
        const workout = day === 2 ? 'B' : 'A';
        const skipped = rand() < 0.07;
        const partial = !skipped && rand() < 0.06;
        const lifts = workout === 'A'
          ? [
              lift('Back Squat', 5, 5, plate((80 + week * 2.5) * (deload ? 0.9 : 1)), effort),
              benchLift(week, daysAgo, deload, effort),
              lift('Barbell Row', 3, 8, plate((50 + week * 1.25) * (deload ? 0.9 : 1)), effort - 0.5),
            ]
          : [
              lift('Conventional Deadlift', 3, 5, plate((100 + week * 5) * (deload ? 0.9 : 1)), effort + 0.5),
              lift('Overhead Press', 5, 5, plate((40 + week * 0.625) * (deload ? 0.9 : 1)), effort),
              lift('Pull-Up', 3, 8, 0, effort),
            ];
        sessions.push({
          date,
          status: skipped ? 'skipped' : partial ? 'partial' : 'done',
          energy: skipped ? null : 2 + Math.floor(rand() * 4),
          workout,
          lifts: skipped ? [] : partial ? lifts.slice(0, 2) : lifts,
          run: null,
        });
      }

      if (day === 1 || day === 3 || day === 5) {
        const run =
          day === 1
            ? { exercise: 'Easy Run', distance_km: 6 + (week % 3), pace: 360 - week * 1.5, rpe: 5.5, avg_hr: 140 }
            : day === 5
              ? { exercise: 'Long Run', distance_km: 12 + Math.floor(week / 2), pace: 375 - week, rpe: 7, avg_hr: 145 }
              : week % 2 === 0
                ? { exercise: 'Tempo Run', distance_km: 6, pace: 300 - week * 1.2, rpe: 8, avg_hr: 165 }
                : { exercise: 'Interval Session', distance_km: 8, pace: 320 - week, rpe: 8.5, avg_hr: 160 };
        const skipped = rand() < 0.07;
        sessions.push({
          date,
          status: skipped ? 'skipped' : 'done',
          energy: skipped ? null : 2 + Math.floor(rand() * 4),
          workout: null,
          lifts: [],
          run: skipped
            ? null
            : {
                exercise: run.exercise,
                distance_km: run.distance_km,
                duration_s: Math.round(run.distance_km * (run.pace + jitter(8))),
                rpe: halfStep(run.rpe + jitter(0.5)),
                avg_hr: Math.round(run.avg_hr + jitter(4)),
              },
        });
      }
    }
  }
  return { sessions, body };

  function lift(exercise: string, sets: number, reps: number, weight_kg: number, rpe: number) {
    return {
      exercise,
      sets: Array.from({ length: sets }, (_, i) => ({
        reps,
        weight_kg,
        // The last sets of a session feel harder than the first.
        rpe: halfStep(rpe + (i / Math.max(1, sets - 1)) * 0.75 + jitter(0.3)),
      })),
    };
  }

  function benchLift(week: number, daysAgo: number, deload: boolean, effort: number) {
    const stalled = daysAgo < 28;
    const weight = plate((60 + (stalled ? DEMO_WEEKS - 4 : week) * 1.25) * (deload ? 0.9 : 1));
    const rpe = daysAgo < 14 ? 8.75 : stalled ? 7.5 : effort;
    return lift('Barbell Bench Press', 5, 5, weight, rpe);
  }
}

function atHour(date: ISODate, hour: number): string {
  const d = parseISODate(date);
  d.setHours(hour);
  return d.toISOString();
}

export async function hasDemoData(): Promise<boolean> {
  const sessions = await db.sessions.where('_deleted').equals(0).toArray();
  return sessions.some((s) => s.notes === DEMO_NOTE);
}

/**
 * Writes the demo into the account, in one transaction. Uses the exercise
 * library by name, so it needs the library to exist; an exercise the user has
 * deleted is simply left out. Returns the number of rows written.
 */
export async function loadDemoData(todayDate: ISODate): Promise<number> {
  const demo = buildDemo(todayDate);
  return db.transaction(
    'rw',
    [db.exercises, db.sessions, db.session_exercises, db.set_entries, db.runs, db.workout_templates, db.workout_template_items, db.body_metrics],
    async () => {
      if (await hasDemoData()) throw new Error('Demo data is already loaded');
      const library = new Map<string, Local<Exercise>>();
      for (const e of await db.exercises.where('_deleted').equals(0).toArray()) library.set(e.name, e);
      if (library.size === 0) throw new Error('The exercise library is empty — sync first');

      let written = 0;
      const workoutIds = new Map<'A' | 'B', string>();
      for (const key of ['A', 'B'] as const) {
        const spec = DEMO_WORKOUTS[key];
        const template = await insertRow<WorkoutTemplate>('workout_templates', { name: spec.name, notes: DEMO_NOTE });
        workoutIds.set(key, template.id);
        written++;
        let position = 0;
        for (const name of spec.exercises) {
          const e = library.get(name);
          if (!e) continue;
          await insertRow<WorkoutTemplateItem>('workout_template_items', {
            template_id: template.id,
            exercise_id: e.id,
            position: position++,
            target_sets: e.default_sets,
            target_reps: e.default_reps,
            target_weight_kg: null,
            target_duration_s: null,
            target_distance_km: null,
            target_rpe: null,
            rest_seconds: null,
            notes: null,
          });
          written++;
        }
      }

      for (const s of demo.sessions) {
        const runExercise = s.run ? library.get(s.run.exercise) : undefined;
        const session = await insertRow<Session>('sessions', {
          date: s.date,
          kind: s.workout ? 'strength' : 'run',
          status: s.status,
          template_id: s.workout ? workoutIds.get(s.workout)! : null,
          was_planned: true,
          energy: s.energy,
          notes: DEMO_NOTE,
          started_at: s.status === 'skipped' ? null : atHour(s.date, 7),
          completed_at: atHour(s.date, 8),
        });
        written++;

        let position = 0;
        for (const l of s.lifts) {
          const e = library.get(l.exercise);
          if (!e) continue;
          const child = await insertRow<SessionExercise>('session_exercises', {
            session_id: session.id,
            exercise_id: e.id,
            position: position++,
            notes: null,
            target_sets: l.sets.length,
            target_reps: l.sets[0].reps,
            target_weight_kg: l.sets[0].weight_kg,
          });
          written++;
          for (const [i, set] of l.sets.entries()) {
            await insertRow<SetEntry>('set_entries', {
              session_exercise_id: child.id,
              set_index: i,
              reps: set.reps,
              weight_kg: set.weight_kg,
              rpe: set.rpe,
              is_warmup: false,
              notes: null,
            });
            written++;
          }
        }

        if (s.run && runExercise) {
          await insertRow<Run>('runs', {
            session_id: session.id,
            exercise_id: runExercise.id,
            run_type: runExercise.run_type ?? 'easy',
            distance_km: s.run.distance_km,
            duration_s: s.run.duration_s,
            rpe: s.run.rpe,
            avg_hr: s.run.avg_hr,
            weather: null,
            route_note: null,
          });
          written++;
        }
      }

      for (const b of demo.body) {
        await insertRow<BodyMetric>('body_metrics', {
          date: b.date,
          weight_kg: b.weight_kg,
          resting_hr: b.resting_hr,
          note: DEMO_NOTE,
        });
        written++;
      }
      return written;
    },
  );
}

/** Soft-deletes every demo row. Real data is never touched. Returns the number of demo sessions removed. */
export async function removeDemoData(): Promise<number> {
  return db.transaction(
    'rw',
    [db.sessions, db.session_exercises, db.set_entries, db.runs, db.run_splits, db.workout_templates, db.workout_template_items, db.body_metrics],
    async () => {
      const sessions = (await db.sessions.where('_deleted').equals(0).toArray()).filter((s) => s.notes === DEMO_NOTE);
      for (const s of sessions) await removeSession(s.id);

      const workouts = (await db.workout_templates.where('_deleted').equals(0).toArray()).filter((t) => t.notes === DEMO_NOTE);
      for (const t of workouts) await deleteWorkout(t.id);

      const body = (await db.body_metrics.where('_deleted').equals(0).toArray()).filter((b) => b.note === DEMO_NOTE);
      for (const b of body) await softDeleteRow('body_metrics', b.id);

      return sessions.length;
    },
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/features/settings/demoData.test.ts`
Expected: PASS — 9 tests. The load writes about 670 rows; the suite takes around half a second.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/demoData.ts src/features/settings/demoData.test.ts
git commit -m "feat: demo data — twelve weeks of plausible training, removable"
```

---

## Task 8: Progress routes

The view and range live in the route — `#/progress?view=rpe&range=4w` — so Back and a reload keep them. Defaults (Strength, 12 weeks) are left out of the URL, so `{ name: 'progress' }` still round-trips. Exercise detail is `#/progress/exercise/<id>?range=…`; a body entry is `#/body/<id>` or `#/body/new`, under the Progress tab.

**Files:**
- Modify: `src/app/routes.ts`, `src/app/routes.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/app/routes.test.ts` (replace the whole file):

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
  { name: 'progress', view: 'rpe' },
  { name: 'progress', view: 'running', range: '4w' },
  { name: 'progress', range: 'all' },
  { name: 'progress-exercise', id: 'e1' },
  { name: 'progress-exercise', id: 'e1', range: '6m' },
  { name: 'body', id: 'new' },
  { name: 'body', id: 'b1' },
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

describe('progress routes', () => {
  it('ignores an unknown view or range', () => {
    expect(parseRoute('#/progress?view=charts&range=1y')).toEqual({ name: 'progress' });
  });

  it('treats a bare body path as the Body view', () => {
    expect(parseRoute('#/body')).toEqual({ name: 'progress', view: 'body' });
  });

  it('puts exercise detail and the body form under Progress', () => {
    expect(tabOf({ name: 'progress-exercise', id: 'e1' })).toBe('progress');
    expect(tabOf({ name: 'body', id: 'new' })).toBe('progress');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/app/routes.test.ts`
Expected: FAIL — the new round-trips fail (`#/progress?view=rpe` parses as `{ name: 'progress' }`), and `tabOf` returns `undefined` for the new routes.

- [ ] **Step 3: Implement**

`src/app/routes.ts` (replace the whole file):

```ts
import { isRangeKey, type RangeKey } from '../lib/ranges';
import type { ISODate, SessionKind, UUID } from '../types/domain';

export type Tab = 'today' | 'plan' | 'progress' | 'log' | 'settings';

/** The Progress tab's views. Strength is the default. */
export type ProgressView = 'strength' | 'exercises' | 'rpe' | 'running' | 'body';

export const PROGRESS_VIEWS: readonly ProgressView[] = ['strength', 'exercises', 'rpe', 'running', 'body'];

function isProgressView(value: string | null): value is ProgressView {
  return value !== null && (PROGRESS_VIEWS as readonly string[]).includes(value);
}

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
  | { name: 'progress'; view?: ProgressView; range?: RangeKey }
  | { name: 'progress-exercise'; id: UUID; range?: RangeKey }
  | { name: 'body'; id: UUID | 'new' }
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
    case 'progress': {
      const range = params.get('range');
      const withRange = isRangeKey(range) ? { range } : {};
      if (id === 'exercise' && parts[2]) return { name: 'progress-exercise', id: parts[2], ...withRange };
      const view = params.get('view');
      return { name: 'progress', ...(isProgressView(view) ? { view } : {}), ...withRange };
    }
    case 'body':
      return id ? { name: 'body', id } : { name: 'progress', view: 'body' };
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
      return `#/progress${query({ view: route.view, range: route.range })}`;
    case 'progress-exercise':
      return `#/progress/exercise/${encodeURIComponent(route.id)}${query({ range: route.range })}`;
    case 'body':
      return `#/body/${encodeURIComponent(route.id)}`;
    case 'log':
      return '#/log';
    case 'settings':
      return '#/settings';
  }
}

/** '?a=1&b=2' from the defined values, or '' when there are none. */
function query(values: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
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
    case 'progress-exercise':
    case 'body':
      return 'progress';
    case 'log':
      return 'log';
    case 'settings':
      return 'settings';
  }
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run src/app/routes.test.ts` — PASS, 35 tests. `npx tsc -b` — clean. (`Screen.tsx` does not render the new routes yet; Task 11 adds them.)

- [ ] **Step 5: Commit**

```bash
git add src/app/routes.ts src/app/routes.test.ts
git commit -m "feat: routes for progress views, exercise detail and body entries"
```

---

## Task 9: Charts

Recharts is the charting library the brief named. It is the largest dependency by far — about 400 kB — which is why Task 11 loads it only when Progress opens.

Recharts writes colours as SVG attributes, where CSS variables do not reliably resolve, so `CHART_COLORS` spells out the `@theme` values from `index.css`. Animations follow `prefers-reduced-motion`. Each chart sits in a `ChartCard` whose `summary` is its text alternative for screen readers.

`Stat` — a big number with a label — moves out of `HistoryScreen.tsx` into `src/components/`, since Progress uses it too.

**Files:**
- Create: `src/components/charts.tsx`, `src/components/Stat.tsx`
- Modify: `src/features/log/HistoryScreen.tsx`, `package.json`, `package-lock.json`

- [ ] **Step 1: Install Recharts**

```bash
npm install recharts@3.10.1
```

It brings `react-is` as a peer; npm installs the 19.x that matches React.

- [ ] **Step 2: Write the components**

`src/components/charts.tsx` (new file):

```tsx
import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Colours for SVG, matching the @theme tokens in index.css. Recharts writes
 * them as SVG attributes, where CSS variables are not reliably resolved, so
 * they are spelled out here.
 */
export const CHART_COLORS = {
  accent: '#4ea1ff',
  grid: '#22303d',
  text: '#8b9bab',
  surface: '#141b23',
  pr: '#f5a524',
  series: ['#4ea1ff', '#f5a524', '#45d483', '#f871a0'],
} as const;

const HEIGHT = 200;
// Data keys below are cast to string at the Recharts boundary. Recharts types a
// key against the data it can see, and it cannot see through these generic
// props — the key is already checked against T by each component's own props.
const AXIS = { stroke: CHART_COLORS.grid, tick: { fill: CHART_COLORS.text, fontSize: 12 }, tickLine: false } as const;
const TOOLTIP = {
  contentStyle: { background: CHART_COLORS.surface, border: `1px solid ${CHART_COLORS.grid}`, borderRadius: 12 },
  labelStyle: { color: CHART_COLORS.text },
  cursor: { fill: 'rgba(78, 161, 255, 0.08)', stroke: CHART_COLORS.grid },
} as const;

/** Charts animate in unless the user asked the system for reduced motion. */
function animate(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface Series {
  key: string;
  name: string;
  color?: string;
}

/**
 * A titled card around one chart. `summary` is the chart's text alternative
 * for screen readers; when `empty` is set the chart is replaced by it.
 */
export function ChartCard({
  title,
  summary,
  empty,
  children,
}: {
  title: string;
  summary: string;
  empty?: string | null;
  children: ReactNode;
}) {
  return (
    <figure className="rounded-2xl border border-border bg-surface p-3">
      <figcaption className="mb-2 text-sm font-medium">{title}</figcaption>
      {empty ? (
        <p className="py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <div role="img" aria-label={summary}>
          {children}
        </div>
      )}
    </figure>
  );
}

export function BarSeriesChart<T extends object>({
  data,
  xKey,
  xFormat,
  series,
  yFormat,
  stacked = false,
}: {
  data: T[];
  xKey: keyof T & string;
  xFormat: (value: string) => string;
  series: Series[];
  yFormat: (value: number) => string;
  stacked?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey={xKey as string} tickFormatter={xFormat} minTickGap={16} {...AXIS} />
        <YAxis tickFormatter={yFormat} width={48} allowDecimals={false} {...AXIS} />
        <Tooltip {...TOOLTIP} labelFormatter={(label) => xFormat(String(label))} formatter={(v) => yFormat(Number(v))} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={s.color ?? CHART_COLORS.series[i % CHART_COLORS.series.length]}
            stackId={stacked ? 'stack' : undefined}
            radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
            isAnimationActive={animate()}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineSeriesChart<T extends object>({
  data,
  xKey,
  xFormat,
  series,
  yFormat,
  reversed = false,
  highlightKey,
}: {
  data: T[];
  xKey: keyof T & string;
  xFormat: (value: string) => string;
  series: Series[];
  yFormat: (value: number) => string;
  /** Draw larger values lower — for pace, where lower is faster. */
  reversed?: boolean;
  /** A boolean field: points where it is true get a highlighted marker, such as a PR. */
  highlightKey?: keyof T & string;
}) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey={xKey as string} tickFormatter={xFormat} minTickGap={16} {...AXIS} />
        <YAxis tickFormatter={yFormat} width={48} domain={['auto', 'auto']} reversed={reversed} {...AXIS} />
        <Tooltip {...TOOLTIP} labelFormatter={(label) => xFormat(String(label))} formatter={(v) => yFormat(Number(v))} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => {
          const color = s.color ?? CHART_COLORS.series[i % CHART_COLORS.series.length];
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={color}
              strokeWidth={2}
              connectNulls
              isAnimationActive={animate()}
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: T }) => {
                const highlighted = highlightKey !== undefined && Boolean(props.payload?.[highlightKey]);
                if (props.cx === undefined || props.cy === undefined) return <g key={props.index} />;
                return (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={highlighted ? 5 : 2.5}
                    fill={highlighted ? CHART_COLORS.pr : color}
                    stroke="none"
                  />
                );
              }}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ScatterPlot<T extends object>({
  data,
  x,
  y,
  reversedY = false,
}: {
  data: T[];
  x: { key: keyof T & string; name: string; format: (value: number) => string };
  y: { key: keyof T & string; name: string; format: (value: number) => string };
  reversedY?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} />
        <XAxis type="number" dataKey={x.key as string} name={x.name} tickFormatter={x.format} domain={['auto', 'auto']} {...AXIS} />
        <YAxis
          type="number"
          dataKey={y.key as string}
          name={y.name}
          tickFormatter={y.format}
          width={48}
          domain={['auto', 'auto']}
          reversed={reversedY}
          {...AXIS}
        />
        <Tooltip
          {...TOOLTIP}
          formatter={(value, name) => [name === x.name ? x.format(Number(value)) : y.format(Number(value)), name]}
        />
        <Scatter data={data} fill={CHART_COLORS.accent} isAnimationActive={animate()} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
```

`src/components/Stat.tsx` (new file):

```tsx
/** A big number with a label under it. */
export default function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
```

`src/features/log/HistoryScreen.tsx` (replace the whole file):

```tsx
import { routeHref, sessionRoute } from '../../app/routes';
import Loading from '../../components/Loading';
import ScreenHeader from '../../components/ScreenHeader';
import Stat from '../../components/Stat';
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

- [ ] **Step 3: Verify**

Run: `npx tsc -b` — clean. `npm test` — all pass.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/charts.tsx src/components/Stat.tsx src/features/log/HistoryScreen.tsx
git commit -m "feat: chart components on Recharts, and a shared stat tile"
```

---

## Task 10: The Progress screen

Five views behind a row of pills — Strength, Exercises, RPE, Running, Body — over a range picker. Switching view or range *replaces* the history entry, so Back leaves Progress instead of replaying every tap. Every view receives the data and the range already resolved to dates (`ViewProps`).

Stat tiles keep units in their labels ("Volume, tonnes", "Distance, km"), so the numbers fit three across on a phone. Each run type keeps its colour whichever types a range contains. On Body, the button opens today's entry when one exists, since there is one entry per day.

This task replaces the placeholder `ProgressScreen.tsx`. `Screen.tsx` still renders it as `<ProgressScreen />`; its props are optional, so it type-checks until Task 11 wires the routes.

**Files:**
- Create: `src/features/progress/ProgressNav.tsx`, `StrengthView.tsx`, `ExercisesView.tsx`, `RpeView.tsx`, `RunningView.tsx`, `BodyView.tsx` (all in `src/features/progress/`)
- Modify: `src/features/progress/ProgressScreen.tsx`

- [ ] **Step 1: Navigation**

`src/features/progress/ProgressNav.tsx` (new file):

```tsx
import { PROGRESS_VIEWS, type ProgressView, type Route } from '../../app/routes';
import { navigate } from '../../app/useRoute';
import { Segmented } from '../../components/Fields';
import { RANGE_KEYS, RANGE_LABELS, type RangeKey } from '../../lib/ranges';

const VIEW_LABELS: Record<ProgressView, string> = {
  strength: 'Strength',
  exercises: 'Exercises',
  rpe: 'RPE',
  running: 'Running',
  body: 'Body',
};

/**
 * Switching views or ranges replaces the history entry rather than adding
 * one, so Back leaves Progress instead of replaying every tap.
 */
export function ViewTabs({ view, range }: { view: ProgressView; range: RangeKey }) {
  return (
    <nav aria-label="Progress views" className="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-2">
        {PROGRESS_VIEWS.map((v) => (
          <li key={v}>
            <button
              type="button"
              aria-current={v === view ? 'page' : undefined}
              onClick={() => navigate({ name: 'progress', view: v, range }, { replace: true })}
              className={`min-h-11 whitespace-nowrap rounded-full border px-4 text-sm ${
                v === view ? 'border-accent bg-accent font-semibold text-black' : 'border-border text-muted'
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function RangePicker({ value, route }: { value: RangeKey; route: (range: RangeKey) => Route }) {
  return (
    <div className="mb-4">
      <Segmented<RangeKey>
        label="Range"
        value={value}
        options={RANGE_KEYS.map((k) => ({ value: k, label: RANGE_LABELS[k] }))}
        onChange={(range) => navigate(route(range), { replace: true })}
      />
    </div>
  );
}
```

- [ ] **Step 2: The screen**

`src/features/progress/ProgressScreen.tsx` (replace the whole file):

```tsx
import type { ProgressView } from '../../app/routes';
import Loading from '../../components/Loading';
import ScreenHeader from '../../components/ScreenHeader';
import { useLiveQuery } from '../../db/useLiveQuery';
import { DEFAULT_RANGE, rangeStart, type RangeKey } from '../../lib/ranges';
import { today } from '../../lib/time';
import BodyView from './BodyView';
import ExercisesView from './ExercisesView';
import { loadProgressData, type ProgressData } from './progressData';
import { RangePicker, ViewTabs } from './ProgressNav';
import RpeView from './RpeView';
import RunningView from './RunningView';
import StrengthView from './StrengthView';

/** What every view receives: the data, and the range already resolved to dates. */
export interface ViewProps {
  data: ProgressData;
  start: string;
  todayDate: string;
  range: RangeKey;
}

export default function ProgressScreen({ view = 'strength', range = DEFAULT_RANGE }: { view?: ProgressView; range?: RangeKey }) {
  const todayDate = today();
  const data = useLiveQuery(() => loadProgressData(todayDate), [todayDate]);

  return (
    <section>
      <ScreenHeader title="Progress" />
      <ViewTabs view={view} range={range} />
      <RangePicker value={range} route={(r) => ({ name: 'progress', view, range: r })} />
      {data ? (
        <View view={view} props={{ data, start: rangeStart(range, todayDate, data.earliest), todayDate, range }} />
      ) : (
        <Loading />
      )}
    </section>
  );
}

function View({ view, props }: { view: ProgressView; props: ViewProps }) {
  switch (view) {
    case 'strength':
      return <StrengthView {...props} />;
    case 'exercises':
      return <ExercisesView {...props} />;
    case 'rpe':
      return <RpeView {...props} />;
    case 'running':
      return <RunningView {...props} />;
    case 'body':
      return <BodyView {...props} />;
  }
}
```

- [ ] **Step 3: The views**

`src/features/progress/StrengthView.tsx` (new file):

```tsx
import { BarSeriesChart, ChartCard } from '../../components/charts';
import Stat from '../../components/Stat';
import { formatKg, formatNumber, formatShortDate } from '../../lib/format';
import type { ViewProps } from './ProgressScreen';
import { adherenceInRange, weeklySessions, weeklyVolume } from './strengthStats';

export default function StrengthView({ data, start, todayDate }: ViewProps) {
  const volume = weeklyVolume(data.lifts, start, todayDate);
  const sessions = weeklySessions(data.sessions, start, todayDate);
  const adherence = adherenceInRange(data.sessions, start, todayDate);
  const totalVolume = volume.reduce((sum, w) => sum + w.volume, 0);
  const totalSessions = sessions.reduce((sum, w) => sum + w.strength + w.runs, 0);
  const weeks = volume.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label={adherence.planned > 0 ? `Adherence · ${adherence.completed} of ${adherence.planned}` : 'Adherence'}
          value={adherence.planned > 0 ? `${Math.round(adherence.pct)}%` : '—'}
        />
        <Stat label="Sessions done" value={String(totalSessions)} />
        <Stat label="Volume, tonnes" value={formatNumber(totalVolume / 1000, 1)} />
      </div>

      <ChartCard
        title="Weekly volume"
        summary={`Weekly volume over ${weeks} weeks, ${formatKg(totalVolume)} in total; latest week ${formatKg(volume.at(-1)?.volume ?? 0)}.`}
        empty={totalVolume === 0 ? 'No sets logged in this range yet.' : null}
      >
        <BarSeriesChart
          data={volume}
          xKey="week"
          xFormat={formatShortDate}
          series={[{ key: 'volume', name: 'Volume' }]}
          yFormat={(v) => formatNumber(v)}
        />
      </ChartCard>

      <ChartCard
        title="Sessions per week"
        summary={`${totalSessions} sessions done over ${weeks} weeks.`}
        empty={totalSessions === 0 ? 'No finished sessions in this range yet.' : null}
      >
        <BarSeriesChart
          data={sessions}
          xKey="week"
          xFormat={formatShortDate}
          series={[
            { key: 'strength', name: 'Strength' },
            { key: 'runs', name: 'Runs' },
          ]}
          yFormat={(v) => String(v)}
          stacked
        />
      </ChartCard>
    </div>
  );
}
```

`src/features/progress/ExercisesView.tsx` (new file):

```tsx
import { routeHref } from '../../app/routes';
import { ROW_LINK } from '../../components/Button';
import { formatKg, formatShortDate } from '../../lib/format';
import type { ViewProps } from './ProgressScreen';
import { liftedExercises } from './strengthStats';

export default function ExercisesView({ data, range }: ViewProps) {
  const exercises = liftedExercises(data.lifts, data.exercises);
  if (exercises.length === 0) {
    return <p className="text-muted">Exercises appear here once you have logged sets for them.</p>;
  }

  return (
    <ul className="space-y-2">
      {exercises.map((e) => (
        <li key={e.exercise_id}>
          <a href={routeHref({ name: 'progress-exercise', id: e.exercise_id, range })} className={ROW_LINK}>
            <span className="min-w-0 py-2">
              <span className="block truncate font-medium">{e.name}</span>
              <span className="block text-sm text-muted">
                {e.sessions} {e.sessions === 1 ? 'session' : 'sessions'} · last {formatShortDate(e.lastDate)}
              </span>
            </span>
            <span className="shrink-0 pl-3 text-right text-sm tabular-nums">
              {e.bestE1rm > 0 ? formatKg(Math.round(e.bestE1rm)) : 'Bodyweight'}
              {e.bestE1rm > 0 && <span className="block text-xs text-muted">best e1RM</span>}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
```

`src/features/progress/RpeView.tsx` (new file):

```tsx
import { ChartCard, LineSeriesChart, ScatterPlot } from '../../components/charts';
import { formatNumber, formatShortDate } from '../../lib/format';
import type { ViewProps } from './ProgressScreen';
import { fatigueAlerts, sessionLoads, volumeVsRpe, weeklyRpe } from './rpeStats';

export default function RpeView({ data, start, todayDate }: ViewProps) {
  const loads = sessionLoads(data.lifts, data.runs);
  const weekly = weeklyRpe(loads, start, todayDate);
  const scatter = volumeVsRpe(loads, start, todayDate);
  const alerts = fatigueAlerts(data.lifts, data.exercises, todayDate);
  const rated = weekly.filter((w) => w.rpe !== null);

  return (
    <div className="space-y-4">
      {alerts.length > 0 ? (
        <div role="status" className="rounded-2xl border border-amber-400/60 bg-amber-400/10 p-4">
          <h2 className="font-medium text-amber-300">Fatigue building</h2>
          <p className="mb-2 text-sm text-muted">
            The same weight has felt harder over the last two weeks than the two before. Consider a lighter week.
          </p>
          <ul className="space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.exercise_id}>
                <span className="font-medium">{a.name}</span>: RPE +{formatNumber(a.rpe_delta, 1)} at{' '}
                {a.load_change_pct >= 0 ? '+' : ''}
                {formatNumber(a.load_change_pct * 100, 1)}% load
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          No fatigue signals: no exercise has felt harder at the same weight over the last two weeks.
        </p>
      )}

      <ChartCard
        title="Average RPE per week"
        summary={`Average session RPE per week; latest ${rated.at(-1)?.rpe?.toFixed(1) ?? 'none'}.`}
        empty={rated.length === 0 ? 'No rated sessions in this range yet.' : null}
      >
        <LineSeriesChart
          data={weekly}
          xKey="week"
          xFormat={formatShortDate}
          series={[{ key: 'rpe', name: 'RPE' }]}
          yFormat={(v) => formatNumber(v, 1)}
        />
      </ChartCard>

      <ChartCard
        title="Volume against RPE"
        summary={`${scatter.length} strength sessions plotted by volume and RPE.`}
        empty={scatter.length === 0 ? 'No strength sessions in this range yet.' : null}
      >
        <ScatterPlot
          data={scatter}
          x={{ key: 'volume', name: 'Volume, kg', format: (v) => formatNumber(v) }}
          y={{ key: 'rpe', name: 'RPE', format: (v) => formatNumber(v, 1) }}
        />
      </ChartCard>
    </div>
  );
}
```

`src/features/progress/RunningView.tsx` (new file):

```tsx
import { BarSeriesChart, CHART_COLORS, ChartCard, LineSeriesChart, ScatterPlot } from '../../components/charts';
import Stat from '../../components/Stat';
import { formatKm, formatMonth, formatNumber, formatShortDate } from '../../lib/format';
import { formatPace } from '../../lib/running';
import type { RunType } from '../../types/domain';
import type { ViewProps } from './ProgressScreen';
import { longestRun, monthlyTotals, paceByType, paceVsRpe, runTotals, weeklyKm } from './runStats';

/** Each run type keeps its colour whichever types the range happens to contain. */
const RUN_TYPES: { key: RunType; name: string; color: string }[] = [
  { key: 'easy', name: 'Easy', color: CHART_COLORS.series[0] },
  { key: 'tempo', name: 'Tempo', color: CHART_COLORS.series[1] },
  { key: 'intervals', name: 'Intervals', color: CHART_COLORS.series[2] },
  { key: 'long', name: 'Long', color: CHART_COLORS.series[3] },
];

const pace = (v: number) => formatPace(v);

export default function RunningView({ data, start, todayDate }: ViewProps) {
  const totals = runTotals(data.runs, start, todayDate);
  const weekly = weeklyKm(data.runs, start, todayDate);
  const paces = paceByType(data.runs, start, todayDate);
  const months = monthlyTotals(data.runs, start, todayDate);
  const scatter = paceVsRpe(data.runs, start, todayDate);
  const longest = longestRun(data.runs, start, todayDate);
  const empty = totals.runs === 0 ? 'No runs in this range yet.' : null;
  const types = RUN_TYPES.filter((t) => paces.some((p) => p[t.key] !== undefined));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Distance, km" value={formatNumber(totals.km, 1)} />
        <Stat label="Runs" value={String(totals.runs)} />
        <Stat
          label={longest ? `Longest, km · ${formatShortDate(longest.date)}` : 'Longest, km'}
          value={longest ? formatNumber(longest.distance_km, 1) : '—'}
        />
      </div>

      <ChartCard title="Weekly distance" summary={`${formatKm(totals.km)} over ${weekly.length} weeks.`} empty={empty}>
        <BarSeriesChart
          data={weekly}
          xKey="week"
          xFormat={formatShortDate}
          series={[{ key: 'km', name: 'km' }]}
          yFormat={(v) => formatNumber(v, 1)}
        />
      </ChartCard>

      <ChartCard
        title="Pace by run type, min/km"
        summary={`Pace of ${paces.length} runs by type; faster is higher.`}
        empty={paces.length === 0 ? 'No runs with a distance in this range yet.' : null}
      >
        <LineSeriesChart data={paces} xKey="date" xFormat={formatShortDate} series={types} yFormat={pace} reversed />
      </ChartCard>

      <ChartCard title="Monthly distance" summary={months.map((m) => `${formatMonth(m.month)} ${formatKm(m.km)}`).join(', ')} empty={empty}>
        <BarSeriesChart
          data={months}
          xKey="month"
          xFormat={formatMonth}
          series={[{ key: 'km', name: 'km' }]}
          yFormat={(v) => formatNumber(v, 1)}
        />
      </ChartCard>

      <ChartCard
        title="Pace against RPE"
        summary={`${scatter.length} runs plotted by RPE and pace.`}
        empty={scatter.length === 0 ? 'No runs with a distance in this range yet.' : null}
      >
        <ScatterPlot
          data={scatter}
          x={{ key: 'rpe', name: 'RPE', format: (v) => formatNumber(v, 1) }}
          y={{ key: 'pace', name: 'Pace', format: pace }}
          reversedY
        />
      </ChartCard>
    </div>
  );
}
```

`src/features/progress/BodyView.tsx` (new file):

```tsx
import { routeHref } from '../../app/routes';
import { PRIMARY_LINK, ROW_LINK } from '../../components/Button';
import { ChartCard, LineSeriesChart } from '../../components/charts';
import { formatDateLong, formatKg, formatNumber, formatShortDate } from '../../lib/format';
import { bodySeries } from './bodyRules';
import type { ViewProps } from './ProgressScreen';

export default function BodyView({ data, start, todayDate }: ViewProps) {
  const { weight, restingHr } = bodySeries(data.body, start, todayDate);
  const entries = data.body.filter((b) => b.date >= start).reverse();
  // One entry per day: once today has one, the button opens it instead.
  const todays = data.body.find((b) => b.date === todayDate);

  return (
    <div className="space-y-4">
      <a href={routeHref({ name: 'body', id: todays?.id ?? 'new' })} className={PRIMARY_LINK}>
        {todays ? "Edit today's entry" : 'Add body entry'}
      </a>

      <ChartCard
        title="Weight, kg"
        summary={`${weight.length} weigh-ins; latest ${weight.at(-1) ? formatKg(weight.at(-1)!.value) : 'none'}.`}
        empty={weight.length === 0 ? 'No weigh-ins in this range yet.' : null}
      >
        <LineSeriesChart
          data={weight}
          xKey="date"
          xFormat={formatShortDate}
          series={[{ key: 'value', name: 'Weight' }]}
          yFormat={(v) => formatNumber(v, 1)}
        />
      </ChartCard>

      <ChartCard
        title="Resting heart rate, bpm"
        summary={`${restingHr.length} readings; latest ${restingHr.at(-1)?.value ?? 'none'} bpm.`}
        empty={restingHr.length === 0 ? 'No resting heart rate readings in this range yet.' : null}
      >
        <LineSeriesChart
          data={restingHr}
          xKey="date"
          xFormat={formatShortDate}
          series={[{ key: 'value', name: 'Resting HR' }]}
          yFormat={(v) => String(Math.round(v))}
        />
      </ChartCard>

      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((b) => (
            <li key={b.id}>
              <a href={routeHref({ name: 'body', id: b.id })} className={ROW_LINK}>
                <span className="py-2">
                  <span className="block">{formatDateLong(b.date)}</span>
                  {b.note && <span className="block text-sm text-muted">{b.note}</span>}
                </span>
                <span className="pl-3 text-right text-sm tabular-nums">
                  {b.weight_kg !== null && <span className="block">{formatKg(b.weight_kg)}</span>}
                  {b.resting_hr !== null && <span className="block text-muted">{b.resting_hr} bpm</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/progress
git commit -m "feat: Progress tab — strength, exercises, RPE, running and body views"
```

---

## Task 11: Exercise detail, body entry form, and routing

Exercise detail shows the best e1RM and best set of all time, then — within the range — the e1RM trend with PR sessions marked in amber, volume per session, average RPE per session, and the rep-max table. A bodyweight exercise has no e1RM, and says so instead of drawing a flat line at zero.

`Screen.tsx` loads `ProgressScreen` and `ExerciseDetail` with `React.lazy`, so Recharts stays out of the startup path of the screens used in the gym. The body form is small and loads normally.

**Files:**
- Create: `src/features/progress/ExerciseDetail.tsx`, `src/features/progress/BodyForm.tsx`
- Modify: `src/app/Screen.tsx`

- [ ] **Step 1: Exercise detail**

`src/features/progress/ExerciseDetail.tsx` (new file):

```tsx
import { BarSeriesChart, ChartCard, LineSeriesChart } from '../../components/charts';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import Stat from '../../components/Stat';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatKg, formatNumber, formatShortDate } from '../../lib/format';
import { DEFAULT_RANGE, inRange, rangeStart, type RangeKey } from '../../lib/ranges';
import { today } from '../../lib/time';
import type { UUID } from '../../types/domain';
import { loadProgressData } from './progressData';
import { RangePicker } from './ProgressNav';
import { bestSet, exerciseDays, repMaxTable } from './strengthStats';

export default function ExerciseDetail({ id, range = DEFAULT_RANGE }: { id: UUID; range?: RangeKey }) {
  const todayDate = today();
  const data = useLiveQuery(() => loadProgressData(todayDate), [todayDate]);
  const back = { name: 'progress', view: 'exercises', range } as const;

  if (!data) return <Loading />;
  const exercise = data.exercises.find((e) => e.id === id);
  const allDays = exerciseDays(data.lifts, id);
  if (!exercise && allDays.length === 0) return <NotFound what="exercise" back={back} />;

  const start = rangeStart(range, todayDate, data.earliest);
  const days = allDays.filter((d) => inRange(d.date, start, todayDate));
  const best = bestSet(data.lifts, id);
  const repMaxes = repMaxTable(data.lifts, id);
  const loaded = (best?.e1rm ?? 0) > 0;
  const prs = days.filter((d) => d.pr).length;
  const empty = days.length === 0 ? 'Not trained in this range.' : null;

  return (
    <section>
      <ScreenHeader title={exercise?.name ?? 'Exercise'} back={back} />
      <RangePicker value={range} route={(r) => ({ name: 'progress-exercise', id, range: r })} />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Best e1RM, all time" value={loaded && best ? formatKg(Math.round(best.e1rm)) : '—'} />
          <Stat
            label={best ? `Best set · ${formatShortDate(best.date)} · RPE ${best.rpe}` : 'Best set'}
            value={best ? `${formatNumber(best.weight_kg, best.weight_kg % 1 ? 2 : 0)} × ${best.reps}` : '—'}
          />
        </div>

        {loaded ? (
          <ChartCard
            title="Estimated 1RM"
            summary={`Estimated one-rep max over ${days.length} sessions, with ${prs} personal records marked.`}
            empty={empty}
          >
            <LineSeriesChart
              data={days}
              xKey="date"
              xFormat={formatShortDate}
              series={[{ key: 'e1rm', name: 'e1RM' }]}
              yFormat={(v) => formatNumber(v)}
              highlightKey="pr"
            />
            <p className="mt-2 text-xs text-muted">
              <span aria-hidden className="mr-1 inline-block size-2.5 rounded-full bg-[#f5a524]" />
              New e1RM record
            </p>
          </ChartCard>
        ) : (
          <p className="text-sm text-muted">A bodyweight exercise has no estimated 1RM; its reps and RPE are below.</p>
        )}

        <ChartCard title="Volume per session" summary={`Volume across ${days.length} sessions.`} empty={loaded ? empty : 'Bodyweight sets add no volume.'}>
          <BarSeriesChart
            data={days}
            xKey="date"
            xFormat={formatShortDate}
            series={[{ key: 'volume', name: 'Volume' }]}
            yFormat={(v) => formatNumber(v)}
          />
        </ChartCard>

        <ChartCard title="Average RPE per session" summary={`Average set RPE across ${days.length} sessions.`} empty={empty}>
          <LineSeriesChart
            data={days}
            xKey="date"
            xFormat={formatShortDate}
            series={[{ key: 'rpe', name: 'RPE' }]}
            yFormat={(v) => formatNumber(v, 1)}
          />
        </ChartCard>

        {repMaxes.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-medium">Rep maxes, all time</h2>
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 font-normal">Reps</th>
                  <th className="py-1 font-normal">Best weight</th>
                  <th className="py-1 text-right font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {repMaxes.map((r) => (
                  <tr key={r.reps} className="border-t border-border">
                    <td className="py-1.5">{r.reps}</td>
                    <td className="py-1.5">{formatKg(r.weight_kg)}</td>
                    <td className="py-1.5 text-right text-muted">{formatShortDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Body entry form**

`src/features/progress/BodyForm.tsx` (new file):

```tsx
import { useState } from 'react';
import { useSingleFlight } from '../../app/useSingleFlight';
import { navigate } from '../../app/useRoute';
import Button from '../../components/Button';
import { NumberField, TextField } from '../../components/Fields';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { today } from '../../lib/time';
import type { UUID } from '../../types/domain';
import { deleteBodyMetric, saveBodyMetric } from './bodyRepo';
import { emptyBodyDraft, validateBody, type BodyDraft, type BodyErrors } from './bodyRules';

const BACK = { name: 'progress', view: 'body' } as const;

export default function BodyForm({ id }: { id: UUID | 'new' }) {
  const todayDate = today();
  const data = useLiveQuery(async () => {
    const live = (await db.body_metrics.where('_deleted').equals(0).toArray()).sort((a, b) => a.date.localeCompare(b.date));
    return { existing: id === 'new' ? null : (live.find((b) => b.id === id) ?? null), live };
  }, [id]);

  if (!data) return <Loading />;
  if (id !== 'new' && !data.existing) return <NotFound what="entry" back={BACK} />;

  const lastWeight = data.live.filter((b) => b.weight_kg !== null).at(-1)?.weight_kg ?? null;
  const initial: BodyDraft = data.existing
    ? {
        date: data.existing.date,
        weight_kg: data.existing.weight_kg,
        resting_hr: data.existing.resting_hr,
        note: data.existing.note ?? '',
      }
    : emptyBodyDraft(todayDate, lastWeight);
  const takenDates = data.live.filter((b) => b.id !== id).map((b) => b.date);

  return <FormBody id={id} initial={initial} takenDates={takenDates} todayDate={todayDate} />;
}

function FormBody({
  id,
  initial,
  takenDates,
  todayDate,
}: {
  id: UUID | 'new';
  initial: BodyDraft;
  takenDates: string[];
  todayDate: string;
}) {
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<BodyErrors>({});
  const { busy, run } = useSingleFlight();
  const set = (patch: Partial<BodyDraft>) => setDraft({ ...draft, ...patch });

  function save() {
    return run(async () => {
      const found = validateBody(draft, todayDate, takenDates);
      setErrors(found);
      if (Object.keys(found).length > 0) return;
      await saveBodyMetric(id === 'new' ? null : id, draft, todayDate);
      navigate(BACK, { replace: true });
    });
  }

  return (
    <section>
      <ScreenHeader title={id === 'new' ? 'New body entry' : 'Body entry'} back={BACK} />
      <div className="space-y-4">
        <TextField
          label="Date"
          type="date"
          max={todayDate}
          value={draft.date}
          error={errors.date}
          onChange={(e) => set({ date: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Weight (kg)" value={draft.weight_kg} error={errors.weight_kg} onChange={(weight_kg) => set({ weight_kg })} />
          <NumberField
            label="Resting HR (bpm)"
            value={draft.resting_hr}
            error={errors.resting_hr}
            onChange={(resting_hr) => set({ resting_hr })}
          />
        </div>
        <TextField label="Note" value={draft.note} onChange={(e) => set({ note: e.target.value })} />
        <Button variant="primary" block disabled={busy} onClick={() => void save()}>
          Save
        </Button>
        {id !== 'new' && (
          <Button
            variant="danger"
            block
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!window.confirm('Delete this body entry?')) return;
                await deleteBodyMetric(id);
                navigate(BACK, { replace: true });
              })
            }
          >
            Delete entry
          </Button>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Routing**

`src/app/Screen.tsx` (replace the whole file):

```tsx
import { lazy, Suspense } from 'react';
import Loading from '../components/Loading';
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
import BodyForm from '../features/progress/BodyForm';
import SettingsScreen from '../features/settings/SettingsScreen';
import type { Route } from './routes';

// The charts library is the largest dependency by far. Loading it only when
// Progress opens keeps it out of the startup path of the screens used in the gym.
const ProgressScreen = lazy(() => import('../features/progress/ProgressScreen'));
const ExerciseDetail = lazy(() => import('../features/progress/ExerciseDetail'));

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
      return (
        <Suspense fallback={<Loading />}>
          <ProgressScreen view={route.view} range={route.range} />
        </Suspense>
      );
    case 'progress-exercise':
      return (
        <Suspense fallback={<Loading />}>
          <ExerciseDetail key={route.id} id={route.id} range={route.range} />
        </Suspense>
      );
    case 'body':
      return <BodyForm key={route.id} id={route.id} />;
    case 'log':
      return <HistoryScreen />;
    case 'settings':
      return <SettingsScreen />;
  }
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b` — clean. `npm run build` — succeeds; the output lists a separate chunk of about 400 kB holding Recharts, beside `ProgressScreen-*.js` and `ExerciseDetail-*.js`. (The main chunk was already over Vite's 500 kB size warning before this plan, at 605 kB; this plan barely moves it.)

- [ ] **Step 5: Commit**

```bash
git add src/features/progress/ExerciseDetail.tsx src/features/progress/BodyForm.tsx src/app/Screen.tsx
git commit -m "feat: exercise detail and body entry form; Progress loads on demand"
```

---

## Task 12: Demo data in Settings

**Files:**
- Create: `src/features/settings/DemoSection.tsx`
- Modify: `src/features/settings/SettingsScreen.tsx`

- [ ] **Step 1: The section**

`src/features/settings/DemoSection.tsx` (new file):

```tsx
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
```

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
import DemoSection from './DemoSection';
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

        <DemoSection />

        <Button variant="danger" block onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify and commit**

Run: `npx tsc -b` — clean. `npm test` — 467 tests pass.

```bash
git add src/features/settings/DemoSection.tsx src/features/settings/SettingsScreen.tsx
git commit -m "feat: load and remove demo data from Settings"
```

---

## Task 13: Phase 7 checkpoint

- [ ] **Step 1: Full verification**

Run: `npm test` three times — 467 tests pass every time. `npx tsc -b` — clean. `npm run build` — succeeds.

- [ ] **Step 2: Run the app and check**

Run: `npm run dev`, sign in. **What to check:**

1. **Settings → Load demo data.** "Loaded … demo rows". Log shows twelve weeks of sessions and runs, each with the note "Demo data"; the heatmap fills in.
2. **Progress → Strength, 12 wk.** Adherence around 90%, sessions, volume in tonnes; weekly volume bars with a dip in the deload week; sessions per week stacked, strength and runs.
3. **Range.** 4 wk, 6 mo and All change the charts. Back leaves Progress — it does not step through the ranges you tapped.
4. **Exercises → Barbell Bench Press.** e1RM line with amber PR dots, flat over the last four weeks; rep maxes table. Pull-Up says it has no e1RM.
5. **RPE.** A "Fatigue building" banner naming Barbell Bench Press; weekly RPE line rising at the end; a volume–RPE scatter.
6. **Running.** Distance, runs, longest run; pace lines per run type, faster higher; monthly distance; pace–RPE scatter.
7. **Body → Add body entry.** Today, the last weight pre-filled. Add a resting heart rate, Save: it appears in the list and on the chart, and the button now reads "Edit today's entry".
8. **Settings → Remove demo data.** Everything demo disappears from Log and Progress; your own entries — the body entry you added — remain.
9. **Sync.** The status in the corner goes to pending and back to synced.

- [ ] **Step 3: Commit anything the checkpoint fixed**

If the checkpoint needed a fix, commit it with a message naming what you saw.

---

# Phase 8 — Data safety

## Task 14: One lock for sync and destructive operations

See decision 3. `SyncLock.busy` is synchronous and true from the moment a task is queued, so two sync triggers in the same tick still cannot both start — the reason the old guard was a ref. `useSync` gains `exclusive(task)`, passed down through `AppContext`.

**Files:**
- Create: `src/sync/lock.ts`, `src/sync/lock.test.ts`
- Modify: `src/sync/useSync.ts`, `src/app/AppContext.ts`, `src/App.tsx`

- [ ] **Step 1: Write the failing test**

`src/sync/lock.test.ts` (new file):

```ts
import { describe, expect, it } from 'vitest';
import { SyncLock } from './lock';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('SyncLock', () => {
  it('runs tasks one at a time, in order', async () => {
    const lock = new SyncLock();
    const order: string[] = [];
    const gate = deferred();

    const first = lock.run(async () => {
      order.push('first start');
      await gate.promise;
      order.push('first end');
    });
    const second = lock.run(async () => {
      order.push('second');
    });

    await Promise.resolve();
    expect(order).toEqual(['first start']);
    gate.resolve();
    await Promise.all([first, second]);
    expect(order).toEqual(['first start', 'first end', 'second']);
  });

  it('is busy from the moment a task is queued until the last one finishes', async () => {
    const lock = new SyncLock();
    expect(lock.busy).toBe(false);
    const gate = deferred();
    const task = lock.run(() => gate.promise);
    expect(lock.busy).toBe(true);
    gate.resolve();
    await task;
    expect(lock.busy).toBe(false);
  });

  it('returns the task result and passes errors through without jamming the queue', async () => {
    const lock = new SyncLock();
    await expect(lock.run(async () => 42)).resolves.toBe(42);
    await expect(lock.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(lock.busy).toBe(false);
    await expect(lock.run(async () => 'still works')).resolves.toBe('still works');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/sync/lock.test.ts`
Expected: FAIL — `Failed to resolve import "./lock"`.

- [ ] **Step 3: Implement the lock**

`src/sync/lock.ts` (new file):

```ts
/**
 * Serialises sync with the operations that must never interleave with it:
 * deleting all data, restoring a backup, signing out. A sync pushing rows
 * while the account is being wiped would put them straight back.
 *
 * `busy` is synchronous and becomes true the moment a task is queued, so two
 * triggers in the same tick cannot both start a sync — the same reason the
 * old guard was a ref and not React state.
 */
export class SyncLock {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;

  get busy(): boolean {
    return this.pending > 0;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    this.pending++;
    const result = this.tail.then(async () => {
      try {
        return await task();
      } finally {
        this.pending--;
      }
    });
    // The next task waits for this one whether it succeeds or fails.
    this.tail = result.catch(() => undefined);
    return result;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/sync/lock.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Route sync through it**

`src/sync/useSync.ts` (replace the whole file):

```ts
import { useCallback, useEffect, useState } from 'react';
import { currentStatus, syncAll } from './engine';
import { SyncLock } from './lock';
import { supabaseSyncClient } from './supabaseSyncClient';
import type { SyncStatus } from './types';

/**
 * Owns the sync lifecycle for the whole app.
 *
 * Deliberately not inside a screen component: sync has to keep running while
 * the user is on the logging screen, and a widget that unmounts would take the
 * listeners with it.
 */
export function useSync(userId: string | null) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [lock] = useState(() => new SyncLock());

  const refresh = useCallback(async () => {
    setStatus(await currentStatus());
  }, []);

  const syncNow = useCallback(async () => {
    // Skipped, not queued, while anything holds the lock: the next trigger
    // will sync, and a queued sync after a wipe would only repeat its work.
    if (!userId || lock.busy) return;
    setBusy(true);
    try {
      await lock.run(async () => {
        try {
          await syncAll(supabaseSyncClient, userId);
        } catch {
          // The engine records the message; refresh surfaces it.
        }
      });
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [lock, refresh, userId]);

  /** Runs a task that must not overlap a sync, waiting for one in progress to finish first. */
  const exclusive = useCallback(
    async <T,>(task: () => Promise<T>): Promise<T> => {
      try {
        return await lock.run(task);
      } finally {
        await refresh();
      }
    },
    [lock, refresh],
  );

  useEffect(() => {
    if (!userId) return;

    // Run once on mount: visibilitychange does not fire on initial load, so
    // without this nothing syncs until the user backgrounds and returns.
    void syncNow();

    const onOnline = () => void syncNow();
    const onOffline = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, syncNow, refresh]);

  return { status, busy, syncNow, refresh, exclusive };
}
```

`src/app/AppContext.ts` (replace the whole file):

```ts
import { createContext, useContext } from 'react';
import type { SyncStatus } from '../sync/types';

export interface AppContextValue {
  userId: string;
  syncStatus: SyncStatus | null;
  syncBusy: boolean;
  /** Ask for a sync now. Ignored while one is already running. */
  requestSync: () => void;
  /** Run a task that must not overlap a sync: wiping, restoring, signing out. */
  exclusive: <T>(task: () => Promise<T>) => Promise<T>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppContext.Provider>');
  return value;
}
```

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
  const { status, busy, syncNow, exclusive } = useSync(userId);

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
        ? { userId, syncStatus: status, syncBusy: busy, requestSync: () => void syncNow(), exclusive }
        : null,
    [userId, status, busy, syncNow, exclusive],
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

- [ ] **Step 6: Verify and commit**

Run: `npx tsc -b` — clean. `npm test` — all pass.

```bash
git add src/sync/lock.ts src/sync/lock.test.ts src/sync/useSync.ts src/app/AppContext.ts src/App.tsx
git commit -m "feat: one lock for sync and the operations that must not overlap it"
```

---

## Task 15: The backup format

A backup is every row of every synced table, tombstones included, with exactly that table's columns. `TABLE_COLUMNS` lists them — and `columns<T>()` makes the list fail to compile when it misses a column of the domain type, naming the missing one (`{ missing: "theme" }`), so a column added later cannot silently fall out of backups.

`parseBackup` checks a file before anything is written: format, version, header, and that every row has every column of its table with valid timestamps. The server rejects a row missing a column, and one bad row would stall every later push. Unknown tables are ignored and a missing table counts as empty.

**Files:**
- Create: `src/sync/columns.ts`, `src/features/settings/backup.ts`, `src/features/settings/backup.test.ts`

- [ ] **Step 1: The column list**

`src/sync/columns.ts` (new file):

```ts
import type { SyncedTableName } from '../db/schema';
import type {
  BodyMetric,
  Exercise,
  Run,
  RunSplit,
  Session,
  SessionExercise,
  SetEntry,
  UserPrefs,
  WeekPlan,
  WeekPlanDay,
  WorkoutTemplate,
  WorkoutTemplateItem,
} from '../types/domain';

/**
 * Lists every column of T, and fails to compile if one is missing — so a
 * column added to a domain type cannot silently drop out of backups.
 */
function columns<T>() {
  return <const K extends readonly (keyof T & string)[]>(
    keys: [Exclude<keyof T, K[number]>] extends [never] ? K : { missing: Exclude<keyof T, K[number]> },
  ): readonly string[] => keys as readonly string[];
}

const BASE = ['id', 'user_id', 'created_at', 'updated_at', 'server_updated_at', 'deleted_at'] as const;

/** Every synced column of every table, in a stable order. Local-only fields are not columns. */
export const TABLE_COLUMNS: Record<SyncedTableName, readonly string[]> = {
  exercises: columns<Exercise>()([
    ...BASE,
    'name',
    'muscle_group',
    'modality',
    'run_type',
    'default_sets',
    'default_reps',
    'default_weight_kg',
    'default_duration_s',
    'default_distance_km',
    'sort_order',
  ]),
  workout_templates: columns<WorkoutTemplate>()([...BASE, 'name', 'notes']),
  workout_template_items: columns<WorkoutTemplateItem>()([
    ...BASE,
    'template_id',
    'exercise_id',
    'position',
    'target_sets',
    'target_reps',
    'target_weight_kg',
    'target_duration_s',
    'target_distance_km',
    'target_rpe',
    'rest_seconds',
    'notes',
  ]),
  week_plans: columns<WeekPlan>()([...BASE, 'name', 'active_from']),
  week_plan_days: columns<WeekPlanDay>()([...BASE, 'week_plan_id', 'weekday', 'template_id']),
  sessions: columns<Session>()([
    ...BASE,
    'date',
    'kind',
    'status',
    'template_id',
    'was_planned',
    'energy',
    'notes',
    'started_at',
    'completed_at',
  ]),
  session_exercises: columns<SessionExercise>()([
    ...BASE,
    'session_id',
    'exercise_id',
    'position',
    'notes',
    'target_sets',
    'target_reps',
    'target_weight_kg',
  ]),
  set_entries: columns<SetEntry>()([
    ...BASE,
    'session_exercise_id',
    'set_index',
    'reps',
    'weight_kg',
    'rpe',
    'is_warmup',
    'notes',
  ]),
  runs: columns<Run>()([
    ...BASE,
    'session_id',
    'exercise_id',
    'run_type',
    'distance_km',
    'duration_s',
    'rpe',
    'avg_hr',
    'weather',
    'route_note',
  ]),
  run_splits: columns<RunSplit>()([...BASE, 'run_id', 'split_index', 'distance_km', 'duration_s']),
  body_metrics: columns<BodyMetric>()([...BASE, 'date', 'weight_kg', 'resting_hr', 'note']),
  user_prefs: columns<UserPrefs>()([...BASE, 'rest_seconds_default', 'vibration', 'theme']),
};
```

Run: `npx tsc -b` — clean. To see the check work, delete `'theme'` from the `user_prefs` line and run it again: it fails with `Property 'missing' is missing in type … '{ missing: "theme"; }'`. Put `'theme'` back.

- [ ] **Step 2: Write the failing test**

`src/features/settings/backup.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { TABLE_COLUMNS } from '../../sync/columns';
import { SYNCED_TABLES } from '../../sync/tables';
import { resetDb } from '../../test/fixtures';
import { bodyRow, sessionRow } from '../../test/rows';
import { BACKUP_VERSION, backupFileName, backupRowCount, buildBackup, parseBackup } from './backup';

const USER = 'user-1';

describe('buildBackup', () => {
  beforeEach(resetDb);

  it('includes every table, tombstones too, without local-only fields', async () => {
    await db.sessions.bulkPut([sessionRow('s1'), sessionRow('gone', { deleted_at: '2026-10-02T06:00:00.000Z' })]);
    await db.body_metrics.put(bodyRow('b1', '2026-10-01', { weight_kg: 80 }));

    const backup = await buildBackup(USER, '2026-10-04T08:00:00.000Z');
    expect(backup).toMatchObject({ format: 'fit-tracker-backup', version: BACKUP_VERSION, user_id: USER });
    expect(Object.keys(backup.tables)).toEqual([...SYNCED_TABLES]);
    expect(backup.tables.sessions.map((s) => s.id).sort()).toEqual(['gone', 's1']);
    expect(Object.keys(backup.tables.sessions[0])).toEqual([...TABLE_COLUMNS.sessions]);
    expect(backupRowCount(backup)).toBe(3);
  });

  it('round-trips through JSON and parseBackup', async () => {
    await db.sessions.put(sessionRow('s1'));
    const backup = await buildBackup(USER, '2026-10-04T08:00:00.000Z');
    expect(parseBackup(JSON.stringify(backup))).toEqual({ ok: true, backup });
  });
});

describe('parseBackup', () => {
  async function valid() {
    await resetDb();
    await db.sessions.put(sessionRow('s1'));
    return JSON.parse(JSON.stringify(await buildBackup(USER, '2026-10-04T08:00:00.000Z')));
  }

  it('rejects text that is not JSON', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, error: 'This file is not a Fit Tracker backup: it is not valid JSON.' });
  });

  it('rejects other JSON', () => {
    expect(parseBackup('{"hello": 1}')).toEqual({ ok: false, error: 'This file is not a Fit Tracker backup.' });
  });

  it('rejects a backup from a newer app version', async () => {
    const file = await valid();
    file.version = BACKUP_VERSION + 1;
    expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, error: expect.stringContaining('newer version') });
  });

  it('rejects a row missing a column, naming it', async () => {
    const file = await valid();
    delete file.tables.sessions[0].status;
    expect(parseBackup(JSON.stringify(file))).toEqual({
      ok: false,
      error: 'This backup is damaged: sessions, row 1 has no "status".',
    });
  });

  it('rejects a row with an unparseable timestamp', async () => {
    const file = await valid();
    file.tables.sessions[0].updated_at = 'yesterday';
    expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, error: expect.stringContaining('invalid timestamp') });
  });

  it('treats a missing table as empty and ignores unknown ones', async () => {
    const file = await valid();
    delete file.tables.runs;
    file.tables.something_else = [{ id: 'x' }];
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok && parsed.backup.tables.runs).toEqual([]);
    expect(parsed.ok && 'something_else' in parsed.backup.tables).toBe(false);
  });

  it('names the file by date', () => {
    expect(backupFileName('2026-10-04')).toBe('fit-tracker-backup-2026-10-04.json');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/features/settings/backup.test.ts`
Expected: FAIL — `Failed to resolve import "./backup"`.

- [ ] **Step 4: Implement**

`src/features/settings/backup.ts` (new file):

```ts
import { db, type SyncedTableName } from '../../db/schema';
import { TABLE_COLUMNS } from '../../sync/columns';
import { SYNCED_TABLES } from '../../sync/tables';
import type { BaseRow, ISODate, ISODateTime, UUID } from '../../types/domain';

export const BACKUP_FORMAT = 'fit-tracker-backup';
/** Raised only when the file layout changes, never for a new column: columns are checked by name. */
export const BACKUP_VERSION = 1;

/** A complete, restorable copy of the account: every table, tombstones included. */
export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: ISODateTime;
  /** The account the rows belong to. A restore into another account re-keys them — see restore.ts. */
  user_id: UUID;
  tables: Record<SyncedTableName, BaseRow[]>;
}

/** A row with exactly the table's synced columns, in column order — local-only fields dropped. */
function pickColumns(name: SyncedTableName, row: object): BaseRow {
  const source = row as Record<string, unknown>;
  return Object.fromEntries(TABLE_COLUMNS[name].map((c) => [c, source[c] ?? null])) as unknown as BaseRow;
}

export async function buildBackup(userId: UUID, exportedAt: ISODateTime = new Date().toISOString()): Promise<Backup> {
  const tables = {} as Record<SyncedTableName, BaseRow[]>;
  for (const name of SYNCED_TABLES) {
    const rows = await (db[name] as unknown as import('dexie').Table<object, string>).toArray();
    tables[name] = rows.map((r) => pickColumns(name, r));
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exported_at: exportedAt, user_id: userId, tables };
}

export function backupFileName(date: ISODate): string {
  return `fit-tracker-backup-${date}.json`;
}

export function backupRowCount(backup: Backup): number {
  return SYNCED_TABLES.reduce((n, name) => n + backup.tables[name].length, 0);
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; error: string };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTimestamp = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/**
 * Checks a file before anything is written. Every row must carry every column
 * of its table — the server rejects a row with a missing column, and one bad
 * row would stall every later sync. Unknown tables are ignored; a missing
 * table counts as empty.
 */
export function parseBackup(text: string): ParsedBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not a Fit Tracker backup: it is not valid JSON.' };
  }
  if (!isObject(value) || value.format !== BACKUP_FORMAT || !Number.isInteger(value.version)) {
    return { ok: false, error: 'This file is not a Fit Tracker backup.' };
  }
  if ((value.version as number) > BACKUP_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of Fit Tracker. Update the app first.' };
  }
  if (typeof value.user_id !== 'string' || value.user_id === '' || !isTimestamp(value.exported_at) || !isObject(value.tables)) {
    return { ok: false, error: 'This backup is damaged: its header is incomplete.' };
  }

  const tables = {} as Record<SyncedTableName, BaseRow[]>;
  for (const name of SYNCED_TABLES) {
    const rows = value.tables[name] ?? [];
    if (!Array.isArray(rows)) return { ok: false, error: `This backup is damaged: ${name} is not a list.` };
    for (const [i, row] of rows.entries()) {
      const where = `${name}, row ${i + 1}`;
      if (!isObject(row)) return { ok: false, error: `This backup is damaged: ${where} is not a record.` };
      const missing = TABLE_COLUMNS[name].find((c) => !(c in row));
      if (missing) return { ok: false, error: `This backup is damaged: ${where} has no "${missing}".` };
      if (typeof row.id !== 'string' || row.id === '') return { ok: false, error: `This backup is damaged: ${where} has no id.` };
      if (!isTimestamp(row.created_at) || !isTimestamp(row.updated_at) || !(row.deleted_at === null || isTimestamp(row.deleted_at))) {
        return { ok: false, error: `This backup is damaged: ${where} has an invalid timestamp.` };
      }
    }
    tables[name] = rows.map((r) => pickColumns(name, r as object));
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: value.version as number,
      exported_at: value.exported_at as string,
      user_id: value.user_id,
      tables,
    },
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/features/settings/backup.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

```bash
git add src/sync/columns.ts src/features/settings/backup.ts src/features/settings/backup.test.ts
git commit -m "feat: JSON backup — every table, every column, validated before import"
```

---

## Task 16: Import, and restore into another account

See decision 2. `mergeImported` is the sync rule with one difference: a row the import wins is queued for push. A tie keeps the local row — it is the same version.

`forAccount` re-keys a backup from another account. The test builds a realistic old account through the real repositories — library, plan, edited preferences, a logged past session, next week materialized, a future day claimed — exports it, wipes the device, restores into a new account, and checks: derived rows have the new account's ids and setup creates no second copy; no old id is reused; every reference resolves; history keeps its sets; untouched future plans are re-materialized without duplicates.

**Files:**
- Create: `src/features/settings/restore.ts`, `src/features/settings/restore.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/settings/restore.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { seedExercises } from '../../db/seed';
import { SYNCED_TABLES } from '../../sync/tables';
import { base, makeExercise, makeWorkout, markSynced, resetDb } from '../../test/fixtures';
import { sessionRow } from '../../test/rows';
import type { Local, Session } from '../../types/domain';
import { createSessionFromTemplate } from '../log/sessionsRepo';
import { logSet, setExerciseNote } from '../log/setsRepo';
import { materializeWeek, plannedSessionId } from '../plan/materialize';
import { defaultPlanDayId, defaultPlanId, ensureWeekPlan, setDayTemplate } from '../plan/planRepo';
import { buildBackup, type Backup } from './backup';
import { ensurePrefs, prefsId, updatePrefs } from './prefsRepo';
import { forAccount, importBackup, mergeImported } from './restore';

const TODAY = '2026-10-04';
const OLD = 'old-account';
const NEW = 'new-account';

describe('mergeImported', () => {
  const local = sessionRow('s', { updated_at: '2026-10-02T06:00:00.000Z', _dirty: 0 } as Partial<Session>);

  it('adds a row this device does not have, queued for push', () => {
    expect(mergeImported(undefined, sessionRow('s'))).toMatchObject({ id: 's', _dirty: 1, _deleted: 0 });
  });

  it('takes a newer imported row, queued for push', () => {
    const imported = sessionRow('s', { updated_at: '2026-10-03T06:00:00.000Z', notes: 'newer' });
    expect(mergeImported(local, imported)).toMatchObject({ notes: 'newer', _dirty: 1 });
  });

  it('keeps the local row when it is newer or the same version', () => {
    expect(mergeImported(local, sessionRow('s', { updated_at: '2026-10-01T06:00:00.000Z' }))).toBeNull();
    expect(mergeImported(local, sessionRow('s', { updated_at: '2026-10-02T06:00:00+00:00' }))).toBeNull();
  });

  it('carries a tombstone', () => {
    const gone = sessionRow('s', { updated_at: '2026-10-03T06:00:00.000Z', deleted_at: '2026-10-03T06:00:00.000Z' });
    expect(mergeImported(local, gone)).toMatchObject({ _deleted: 1, _dirty: 1 });
  });
});

describe('importBackup', () => {
  beforeEach(resetDb);

  it('adds, updates and leaves rows by last-write-wins, and reports the counts', async () => {
    await db.sessions.bulkPut([
      sessionRow('edited-here', { updated_at: '2026-10-03T06:00:00.000Z', notes: 'mine' }),
      sessionRow('older-here', { updated_at: '2026-10-01T06:00:00.000Z' }),
    ]);
    const backup = await buildBackup(OLD);
    backup.tables.sessions = [
      { ...sessionRow('edited-here', { updated_at: '2026-10-02T06:00:00.000Z', notes: 'stale' }) },
      { ...sessionRow('older-here', { updated_at: '2026-10-02T06:00:00.000Z', notes: 'from backup' }) },
      { ...sessionRow('new-row') },
    ];

    expect(await importBackup(backup)).toEqual({ added: 1, updated: 1, unchanged: 1 });
    expect((await db.sessions.get('edited-here'))?.notes).toBe('mine');
    expect(await db.sessions.get('older-here')).toMatchObject({ notes: 'from backup', _dirty: 1 });
    expect(await db.sessions.get('new-row')).toMatchObject({ _dirty: 1 });
  });

  it('is idempotent', async () => {
    const backup = await buildBackup(OLD);
    backup.tables.body_metrics = [{ ...base('b1'), date: '2026-10-01', weight_kg: 80, resting_hr: null, note: null } as never];
    await importBackup(backup);
    expect(await importBackup(backup)).toEqual({ added: 0, updated: 0, unchanged: 1 });
  });
});

describe('restoring into another account', () => {
  let backup: Backup;
  let pastSessionId: string;
  let ownedFutureId: string;

  beforeEach(async () => {
    // The old account: library, a plan with Monday workouts, edited preferences,
    // a logged past session, next week materialized, one future day claimed.
    await resetDb();
    await markSynced();
    await seedExercises();
    await ensureWeekPlan(OLD, '2026-09-01');
    await ensurePrefs(OLD);
    await updatePrefs(OLD, { rest_seconds_default: 90 });
    const squat = await makeExercise('Squat');
    const legs = await makeWorkout('Legs', [squat]);
    await setDayTemplate(defaultPlanDayId(OLD, 1), legs.id);

    const past = await createSessionFromTemplate('2026-09-28', legs.id, { wasPlanned: true });
    const [child] = await db.session_exercises.where('session_id').equals(past.id).toArray();
    await logSet(child.id, { reps: 5, weight_kg: 100, rpe: 8, is_warmup: false });
    pastSessionId = past.id;

    await materializeWeek(OLD, '2026-10-05', TODAY);
    await materializeWeek(OLD, '2026-10-12', TODAY);
    ownedFutureId = plannedSessionId(OLD, '2026-10-12');
    const [futureChild] = await db.session_exercises.where('session_id').equals(ownedFutureId).toArray();
    await setExerciseNote(futureChild.id, 'go heavy');

    backup = await buildBackup(OLD);

    // The new account, after "Delete all": an empty device that has synced once.
    await resetDb();
    await markSynced();
    await importBackup(forAccount(backup, NEW, TODAY));
  });

  it("gives derived rows this account's ids, so setup creates no second copy", async () => {
    expect(await db.user_prefs.get(prefsId(NEW))).toMatchObject({ rest_seconds_default: 90 });
    expect(await db.week_plans.get(defaultPlanId(NEW))).toBeDefined();
    expect(await db.week_plan_days.get(defaultPlanDayId(NEW, 1))).toBeDefined();

    expect(await seedExercises()).toBe(0);
    expect((await ensureWeekPlan(NEW, TODAY))?.created).toBe(false);
    expect((await ensurePrefs(NEW))?.created).toBe(false);
  });

  it('reuses no id from the old account', async () => {
    const oldIds = new Set(SYNCED_TABLES.flatMap((name) => backup.tables[name].map((r) => r.id)));
    for (const name of SYNCED_TABLES) {
      const rows = await (db[name] as unknown as import('dexie').Table<{ id: string }, string>).toArray();
      expect(rows.filter((r) => oldIds.has(r.id))).toEqual([]);
    }
  });

  it('keeps every reference pointing at a restored row', async () => {
    const ids = async (name: (typeof SYNCED_TABLES)[number]) =>
      new Set((await (db[name] as unknown as import('dexie').Table<{ id: string }, string>).toArray()).map((r) => r.id));
    const [sessions, children, templates, exercises, plans] = await Promise.all([
      ids('sessions'),
      ids('session_exercises'),
      ids('workout_templates'),
      ids('exercises'),
      ids('week_plans'),
    ]);
    for (const c of await db.session_exercises.toArray()) {
      expect(sessions.has(c.session_id)).toBe(true);
      expect(exercises.has(c.exercise_id)).toBe(true);
    }
    for (const s of await db.set_entries.toArray()) expect(children.has(s.session_exercise_id)).toBe(true);
    for (const i of await db.workout_template_items.toArray()) expect(templates.has(i.template_id)).toBe(true);
    for (const d of await db.week_plan_days.toArray()) {
      expect(plans.has(d.week_plan_id)).toBe(true);
      if (d.template_id) expect(templates.has(d.template_id)).toBe(true);
    }
  });

  it('keeps logged history with its sets, queued for push', async () => {
    const past = (await db.sessions.toArray()).filter((s) => s.date === '2026-09-28');
    expect(past).toHaveLength(1);
    expect(past[0].id).not.toBe(pastSessionId);
    expect(past[0]._dirty).toBe(1);
    expect(await db.set_entries.count()).toBe(1);
  });

  it('drops untouched future plans and lets this account materialize them, with no duplicates', async () => {
    expect(await db.sessions.get(plannedSessionId(NEW, '2026-10-05'))).toBeUndefined();
    expect(await db.sessions.get(plannedSessionId(NEW, '2026-10-12'))).toMatchObject({ date: '2026-10-12' });

    await materializeWeek(NEW, '2026-10-05', TODAY);
    await materializeWeek(NEW, '2026-10-12', TODAY);
    const live = (await db.sessions.toArray()).filter((s: Local<Session>) => s._deleted === 0 && s.date >= TODAY);
    expect(live.map((s) => s.date).sort()).toEqual(['2026-10-05', '2026-10-12']);
    expect(await db.sessions.get(plannedSessionId(NEW, '2026-10-05'))).toBeDefined();
    expect(ownedFutureId).toBe(plannedSessionId(OLD, '2026-10-12'));
  });

  it('clears ownership and sync state from every row', async () => {
    const sessions = await db.sessions.toArray();
    expect(sessions.every((s) => s.user_id === null && s.server_updated_at === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/settings/restore.test.ts`
Expected: FAIL — `Failed to resolve import "./restore"`.

- [ ] **Step 3: Implement**

`src/features/settings/restore.ts` (new file):

```ts
import { db, type SyncedTableName } from '../../db/schema';
import { newId } from '../../lib/id';
import { isSystemTimestamp } from '../../lib/time';
import { deterministicId } from '../../lib/uuidv5';
import { SYNCED_TABLES } from '../../sync/tables';
import type { BaseRow, ISODate, Local, Session, UUID, Weekday } from '../../types/domain';
import { plannedSessionId } from '../plan/materialize';
import { defaultPlanDayId, defaultPlanId, WEEKDAYS } from '../plan/planRepo';
import { prefsId } from './prefsRepo';
import type { Backup } from './backup';

/**
 * Importing applies the sync rule: the newer `updated_at` wins. An older
 * export therefore cannot overwrite anything edited since. An imported row
 * that wins is news the server has not seen, so it is queued for push —
 * unlike a pulled row. Returns null when the local row stays as it is.
 */
export function mergeImported<T extends BaseRow>(local: Local<T> | undefined, imported: T): Local<T> | null {
  if (local && Date.parse(imported.updated_at) <= Date.parse(local.updated_at)) return null;
  return { ...imported, _dirty: 1, _deleted: imported.deleted_at ? 1 : 0 } as Local<T>;
}

export interface ImportResult {
  added: number;
  updated: number;
  unchanged: number;
}

/** Merges every row of a backup into this device, in one transaction. Sync then pushes what changed. */
export async function importBackup(backup: Backup): Promise<ImportResult> {
  const result: ImportResult = { added: 0, updated: 0, unchanged: 0 };
  const tables = SYNCED_TABLES.map((name) => db[name]);
  await db.transaction('rw', tables, async () => {
    for (const name of SYNCED_TABLES) {
      const table = db[name] as unknown as import('dexie').Table<Local<BaseRow>, UUID>;
      for (const row of backup.tables[name]) {
        const local = await table.get(row.id);
        const merged = mergeImported(local, row);
        if (!merged) result.unchanged++;
        else {
          await table.put(merged);
          if (local) result.updated++;
          else result.added++;
        }
      }
    }
  });
  return result;
}

/** Columns that hold another row's id. */
const REFERENCES = ['template_id', 'exercise_id', 'week_plan_id', 'session_id', 'session_exercise_id', 'run_id'] as const;

/**
 * Re-keys a backup made under another account — say, after moving to a new
 * Supabase project — so it can be restored into this one.
 *
 * - Every row gets a new id. Ids are global in the database, so rows still
 *   present under the old account would otherwise collide with these.
 * - Rows every device derives by name — preferences, the default plan and its
 *   days, planned sessions — get the id this account derives, or this
 *   device would create a second copy beside each one.
 * - Untouched planned sessions from today on are dropped: they are only the
 *   plan, and this account will materialize them itself.
 * - References follow the new ids; ownership and sync state are cleared.
 */
export function forAccount(backup: Backup, userId: UUID, todayDate: ISODate): Backup {
  const old = backup.user_id;
  const derived = new Map<UUID, UUID>([
    [deterministicId(`${old}:user_prefs`), prefsId(userId)],
    [defaultPlanId(old), defaultPlanId(userId)],
    ...WEEKDAYS.map((d: Weekday) => [defaultPlanDayId(old, d), defaultPlanDayId(userId, d)] as [UUID, UUID]),
  ]);
  for (const s of backup.tables.sessions as Session[]) {
    if (s.id === plannedSessionId(old, s.date)) derived.set(s.id, plannedSessionId(userId, s.date));
  }

  const withWork = new Set<UUID>([
    ...(backup.tables.runs as unknown as { session_id: UUID }[]).map((r) => r.session_id),
    ...setSessionIds(backup),
  ]);
  const dropped = new Set(
    (backup.tables.sessions as Session[])
      .filter((s) => s.date >= todayDate && isSystemTimestamp(s.updated_at) && !withWork.has(s.id))
      .map((s) => s.id),
  );
  const keep = (name: SyncedTableName, row: BaseRow) => {
    const r = row as unknown as Record<string, unknown>;
    if (name === 'sessions') return !dropped.has(row.id);
    if (name === 'session_exercises') return !dropped.has(r.session_id as UUID);
    return true;
  };

  const ids = new Map<UUID, UUID>();
  for (const name of SYNCED_TABLES) {
    for (const row of backup.tables[name]) ids.set(row.id, derived.get(row.id) ?? newId());
  }

  const tables = {} as Record<SyncedTableName, BaseRow[]>;
  for (const name of SYNCED_TABLES) {
    tables[name] = backup.tables[name]
      .filter((row) => keep(name, row))
      .map((row) => {
        const out: Record<string, unknown> = { ...row, id: ids.get(row.id), user_id: null, server_updated_at: null };
        for (const ref of REFERENCES) {
          const value = out[ref];
          if (typeof value === 'string' && ids.has(value)) out[ref] = ids.get(value);
        }
        return out as unknown as BaseRow;
      });
  }
  return { ...backup, user_id: userId, tables };
}

function setSessionIds(backup: Backup): UUID[] {
  const sessionOfChild = new Map(
    (backup.tables.session_exercises as unknown as { id: UUID; session_id: UUID }[]).map((c) => [c.id, c.session_id]),
  );
  return (backup.tables.set_entries as unknown as { session_exercise_id: UUID }[]).flatMap((s) => {
    const session = sessionOfChild.get(s.session_exercise_id);
    return session ? [session] : [];
  });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/features/settings/restore.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/restore.ts src/features/settings/restore.test.ts
git commit -m "feat: merge a backup by last-write-wins, or restore it into another account"
```

---

## Task 17: Delete all data

The one path in the app that hard-deletes. Server rows go children first — the reverse of push order — because the foreign keys have no cascade; the `own_delete` policy from `0002_rls.sql` exists for exactly this. The device is cleared only after every server delete succeeds, so a failure part-way leaves something to retry from. Clearing includes `sync_meta`: the next sync is then a first sync, and setup recreates the library, plan and preferences.

`clearLocalData` on its own is what signing out uses (Task 19).

**Files:**
- Create: `src/sync/wipe.ts`, `src/sync/wipe.test.ts`
- Modify: `src/sync/supabaseSyncClient.ts`

- [ ] **Step 1: Write the failing test**

`src/sync/wipe.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/schema';
import { markSynced, resetDb } from '../test/fixtures';
import { bodyRow, sessionRow } from '../test/rows';
import { clearLocalData, wipeAccount, type WipeClient } from './wipe';

function fakeClient(failOn?: string): WipeClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async deleteAll(table, userId) {
      calls.push(`${table}:${userId}`);
      return { error: table === failOn ? new Error(`cannot delete ${table}`) : null };
    },
  };
}

describe('wipe', () => {
  beforeEach(async () => {
    await resetDb();
    await markSynced();
    await db.sessions.put(sessionRow('s1'));
    await db.body_metrics.put(bodyRow('b1', '2026-10-01'));
  });

  it('deletes server rows children first, then empties every local table', async () => {
    const client = fakeClient();
    await wipeAccount(client, 'user-1');

    expect(client.calls[0]).toBe('user_prefs:user-1');
    expect(client.calls.indexOf('set_entries:user-1')).toBeLessThan(client.calls.indexOf('session_exercises:user-1'));
    expect(client.calls.indexOf('session_exercises:user-1')).toBeLessThan(client.calls.indexOf('sessions:user-1'));
    expect(client.calls.at(-1)).toBe('exercises:user-1');
    expect(client.calls).toHaveLength(12);

    expect(await db.sessions.count()).toBe(0);
    expect(await db.body_metrics.count()).toBe(0);
    expect(await db.sync_meta.count()).toBe(0);
  });

  it('leaves the device untouched when a server delete fails', async () => {
    await expect(wipeAccount(fakeClient('sessions'), 'user-1')).rejects.toThrow('cannot delete sessions');
    expect(await db.sessions.count()).toBe(1);
    expect(await db.sync_meta.count()).toBe(1);
  });

  it('clears local data on its own, for signing out', async () => {
    await clearLocalData();
    expect(await db.sessions.count()).toBe(0);
    expect(await db.sync_meta.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/sync/wipe.test.ts`
Expected: FAIL — `Failed to resolve import "./wipe"`.

- [ ] **Step 3: Implement**

`src/sync/wipe.ts` (new file):

```ts
import { db } from '../db/schema';
import type { UUID } from '../types/domain';
import { SYNCED_TABLES } from './tables';

/** The slice of the Supabase client a wipe needs. Narrow for testability. */
export interface WipeClient {
  deleteAll(table: string, userId: UUID): Promise<{ error: Error | null }>;
}

/** Empties every local table, sync bookkeeping included, so the device is as if freshly installed. */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}

/**
 * Deletes the account's data everywhere: hard deletes on the server, then
 * this device. The one path in the app that does not soft-delete.
 *
 * Children go before parents — the reverse of push order — because the
 * foreign keys have no cascade. The device is cleared only after every server
 * delete succeeds, so a failure part-way leaves something to retry from.
 *
 * Other signed-in devices keep their local copy until they sign out; they
 * have no tombstones to learn of a hard delete from.
 */
export async function wipeAccount(client: WipeClient, userId: UUID): Promise<void> {
  for (const name of [...SYNCED_TABLES].reverse()) {
    const { error } = await client.deleteAll(name, userId);
    if (error) throw error;
  }
  await clearLocalData();
}
```

`src/sync/supabaseSyncClient.ts` (replace the whole file):

```ts
import { supabase } from '../supabase/client';
import type { PushClient } from './push';
import type { PullClient } from './pull';
import type { WipeClient } from './wipe';
import { fetchAllPages } from './paginate';
import type { BaseRow } from '../types/domain';

/**
 * The real Supabase-backed sync client.
 *
 * Deliberately separate from engine.ts. `../supabase/client` throws at module
 * load when VITE_SUPABASE_* are absent, so importing it from the engine would
 * make the sync tests depend on a gitignored .env file. The engine takes its
 * client as a parameter; only the UI reaches for this concrete one.
 */
export const supabaseSyncClient: PushClient & PullClient & WipeClient = {
  async upsert(table, rows) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    return { error: error ? new Error(error.message) : null };
  },

  async select(table, since) {
    return fetchAllPages<BaseRow>(async (from, to) => {
      let query = supabase.from(table).select('*');
      if (since) query = query.gte('server_updated_at', since);

      const { data, error } = await query
        // server_updated_at alone is not a total order — rows written in the
        // same transaction share it, and without a tiebreak the database may
        // order them differently between requests, so a row can be returned
        // twice or skipped across a page boundary.
        .order('server_updated_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to);

      return {
        rows: (data ?? []) as BaseRow[],
        error: error ? new Error(error.message) : null,
      };
    });
  },

  async deleteAll(table, userId) {
    // Row Level Security already limits a delete to the caller's rows; the
    // filter is still required: Supabase refuses a delete that has none.
    const { error } = await supabase.from(table).delete().eq('user_id', userId);
    return { error: error ? new Error(error.message) : null };
  },
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/sync/wipe.test.ts` — PASS, 3 tests. `npx tsc -b` — clean.

- [ ] **Step 5: Commit**

```bash
git add src/sync/wipe.ts src/sync/wipe.test.ts src/sync/supabaseSyncClient.ts
git commit -m "feat: delete all data — server hard deletes children first, then the device"
```

---

## Task 18: Spreadsheet exports

Three CSV files — sets, runs, body entries — one row each, joined with dates and names and with derived e1RM and pace. Raw tables full of ids are useless in a spreadsheet, and the JSON backup is the restore path, so this deliberately departs from the spec's "one file per table"; Task 29 updates the spec. RFC 4180 with a byte order mark, because Excel otherwise reads UTF-8 as the local code page and mangles names like "Kadıköy".

**Files:**
- Create: `src/features/settings/csv.ts`, `src/features/settings/csv.test.ts`

- [ ] **Step 1: Write the failing test**

`src/features/settings/csv.test.ts` (new file):

```ts
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { base, resetDb } from '../../test/fixtures';
import { bodyRow, childRow, exerciseRow, runRow, sessionRow, setRow } from '../../test/rows';
import type { WorkoutTemplate } from '../../types/domain';
import { bodyCsv, csvFileName, loadCsvSources, runsCsv, setsCsv, toCsv, type CsvSources } from './csv';

const lines = (csv: string) => csv.replace(/^﻿/, '').split('\r\n').filter(Boolean);

describe('toCsv', () => {
  it('starts with a byte order mark and ends lines with CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe('﻿a,b\r\n1,x\r\n');
  });

  it('quotes fields with commas, quotes or line breaks, and leaves nulls empty', () => {
    expect(toCsv(['note'], [['felt "easy", fast'], ['two\nlines'], [null]])).toBe(
      '\uFEFFnote\r\n"felt ""easy"", fast"\r\n"two\nlines"\r\n\r\n',
    );
  });
});

function sources(): CsvSources {
  const template: WorkoutTemplate = { ...base('t1'), name: 'Legs', notes: null };
  return {
    sessions: [
      sessionRow('s2', { date: '2026-10-02', template_id: 't1' }),
      sessionRow('s1', { date: '2026-09-28', status: 'partial', was_planned: false }),
      sessionRow('gone', { date: '2026-09-29', deleted_at: '2026-09-29T08:00:00.000Z' }),
      sessionRow('r', { date: '2026-09-30', kind: 'run' }),
    ],
    children: [childRow('c2', 's2', 'squat'), childRow('c1', 's1', 'bench'), childRow('cg', 'gone', 'squat')],
    sets: [
      setRow('b', 'c2', { set_index: 1, weight_kg: 102.5, rpe: 8.5 }),
      setRow('a', 'c2', { set_index: 0, weight_kg: 60, reps: 8, is_warmup: true }),
      setRow('x', 'c1', { notes: 'grip, slipped' }),
      setRow('d', 'c2', { set_index: 2, deleted_at: '2026-10-02T08:00:00.000Z' }),
      setRow('g', 'cg'),
    ],
    runs: [runRow('run', 'r', { exercise_id: 'easy', distance_km: 8, duration_s: 2880, avg_hr: 142 })],
    exercises: [exerciseRow('squat', 'Back Squat'), exerciseRow('bench', 'Bench Press'), exerciseRow('easy', 'Easy Run')],
    templates: [template],
    body: [bodyRow('b2', '2026-10-02', { weight_kg: 80.4 }), bodyRow('b1', '2026-09-27', { resting_hr: 55, note: 'rested' })],
  };
}

describe('setsCsv', () => {
  it('writes one row per live set, oldest first, with names, numbering and e1RM', () => {
    expect(lines(setsCsv(sources()))).toEqual([
      'date,workout,status,exercise,set,reps,weight_kg,rpe,warmup,e1rm_kg,note',
      '2026-09-28,Unplanned workout,partial,Bench Press,1,5,100,8,false,116.7,"grip, slipped"',
      '2026-10-02,Legs,done,Back Squat,1,8,60,8,true,,',
      '2026-10-02,Legs,done,Back Squat,2,5,102.5,8.5,false,119.6,',
    ]);
  });
});

describe('runsCsv and bodyCsv', () => {
  it('writes runs with duration and pace', () => {
    expect(lines(runsCsv(sources()))).toEqual([
      'date,run,run_type,status,distance_km,duration,duration_s,pace_per_km,rpe,avg_hr,weather,route_note',
      '2026-09-30,Easy Run,easy,done,8,48:00,2880,6:00,6,142,,',
    ]);
  });

  it('writes body entries oldest first', () => {
    expect(lines(bodyCsv(sources()))).toEqual(['date,weight_kg,resting_hr,note', '2026-09-27,,55,rested', '2026-10-02,80.4,,']);
  });

  it('names files by kind and date', () => {
    expect(csvFileName('sets', '2026-10-04')).toBe('fit-tracker-sets-2026-10-04.csv');
  });
});

describe('loadCsvSources', () => {
  beforeEach(resetDb);

  it('reads the tables the exports need', async () => {
    await db.sessions.bulkPut([sessionRow('s1'), sessionRow('s2')]);
    await db.set_entries.put(setRow('a', 'c1'));
    const loaded = await loadCsvSources();
    expect(loaded.sessions).toHaveLength(2);
    expect(loaded.sets).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/features/settings/csv.test.ts`
Expected: FAIL — `Failed to resolve import "./csv"`.

- [ ] **Step 3: Implement**

`src/features/settings/csv.ts` (new file):

```ts
import { db } from '../../db/schema';
import { epley1RM } from '../../lib/strength';
import { formatDuration, formatPace, paceSecondsPerKm } from '../../lib/running';
import type { BodyMetric, Exercise, ISODate, Run, Session, SessionExercise, SetEntry, WorkoutTemplate } from '../../types/domain';
import { sessionTitle } from '../log/cards';

type Cell = string | number | boolean | null;

/** Excel reads a UTF-8 file as its local code page unless the file starts with a byte order mark. */
const BOM = '﻿';

function cell(value: Cell): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180: comma-separated, CRLF line ends, fields quoted when they need it. */
export function toCsv(header: string[], rows: Cell[][]): string {
  return BOM + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const live = <T extends { deleted_at: string | null }>(rows: T[]) => rows.filter((r) => r.deleted_at === null);

export interface CsvSources {
  sessions: Session[];
  children: SessionExercise[];
  sets: SetEntry[];
  runs: Run[];
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  body: BodyMetric[];
}

/**
 * Spreadsheet exports, one row per set, run or body entry — joined with
 * dates and names, since raw rows of ids are no use in a spreadsheet. These
 * are for reading; the JSON backup is the restore path. Deleted rows are left out.
 */
export function setsCsv(src: CsvSources): string {
  const sessions = new Map(live(src.sessions).map((s) => [s.id, s]));
  const children = new Map(live(src.children).filter((c) => sessions.has(c.session_id)).map((c) => [c.id, c]));
  const exercises = new Map(src.exercises.map((e) => [e.id, e.name]));
  const templates = new Map(src.templates.map((t) => [t.id, t.name]));

  const rows = live(src.sets)
    .filter((s) => children.has(s.session_exercise_id))
    .map((s) => {
      const child = children.get(s.session_exercise_id)!;
      const session = sessions.get(child.session_id)!;
      return { s, child, session };
    })
    .sort(
      (a, b) =>
        a.session.date.localeCompare(b.session.date) ||
        a.session.id.localeCompare(b.session.id) ||
        a.child.position - b.child.position ||
        a.s.set_index - b.s.set_index,
    );

  return toCsv(
    ['date', 'workout', 'status', 'exercise', 'set', 'reps', 'weight_kg', 'rpe', 'warmup', 'e1rm_kg', 'note'],
    rows.map(({ s, child, session }, i, all) => [
      session.date,
      sessionTitle(session, session.template_id ? templates.get(session.template_id) : undefined, undefined),
      session.status,
      exercises.get(child.exercise_id) ?? 'Unknown exercise',
      // Numbered within the exercise, from 1, counting only the rows exported.
      all.slice(0, i + 1).filter((r) => r.child.id === child.id).length,
      s.reps,
      s.weight_kg,
      s.rpe,
      s.is_warmup,
      s.is_warmup ? null : round1(epley1RM(s.weight_kg, s.reps)),
      s.notes,
    ]),
  );
}

export function runsCsv(src: CsvSources): string {
  const sessions = new Map(live(src.sessions).map((s) => [s.id, s]));
  const exercises = new Map(src.exercises.map((e) => [e.id, e.name]));
  const rows = live(src.runs)
    .filter((r) => sessions.has(r.session_id))
    .map((r) => ({ r, session: sessions.get(r.session_id)! }))
    .sort((a, b) => a.session.date.localeCompare(b.session.date));

  return toCsv(
    ['date', 'run', 'run_type', 'status', 'distance_km', 'duration', 'duration_s', 'pace_per_km', 'rpe', 'avg_hr', 'weather', 'route_note'],
    rows.map(({ r, session }) => [
      session.date,
      exercises.get(r.exercise_id) ?? 'Run',
      r.run_type,
      session.status,
      r.distance_km,
      formatDuration(r.duration_s),
      r.duration_s,
      r.distance_km > 0 ? formatPace(paceSecondsPerKm(r.duration_s, r.distance_km)) : null,
      r.rpe,
      r.avg_hr,
      r.weather,
      r.route_note,
    ]),
  );
}

export function bodyCsv(src: CsvSources): string {
  return toCsv(
    ['date', 'weight_kg', 'resting_hr', 'note'],
    live(src.body)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((b) => [b.date, b.weight_kg, b.resting_hr, b.note]),
  );
}

export const CSV_EXPORTS = [
  { key: 'sets', label: 'Sets', build: setsCsv },
  { key: 'runs', label: 'Runs', build: runsCsv },
  { key: 'body', label: 'Body', build: bodyCsv },
] as const;

export function csvFileName(key: string, date: ISODate): string {
  return `fit-tracker-${key}-${date}.csv`;
}

export async function loadCsvSources(): Promise<CsvSources> {
  const [sessions, children, sets, runs, exercises, templates, body] = await Promise.all([
    db.sessions.toArray(),
    db.session_exercises.toArray(),
    db.set_entries.toArray(),
    db.runs.toArray(),
    db.exercises.toArray(),
    db.workout_templates.toArray(),
    db.body_metrics.toArray(),
  ]);
  return { sessions, children, sets, runs, exercises, templates, body };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/features/settings/csv.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/features/settings/csv.ts src/features/settings/csv.test.ts
git commit -m "feat: spreadsheet exports — sets, runs and body entries as CSV"
```

---

## Task 19: Settings — backup, import, delete all, sign out

- **Backup and export:** Export backup (JSON); Sets, Runs and Body CSV; Import backup. A backup from this account shows its date and size and offers *Merge*. One from another account explains that restoring replaces everything, and needs RESTORE typed.
- **Account:** Sign out, and Delete all data behind DELETE typed. Both destructive actions refuse to start offline: half a wipe is worse than none.
- **Sign out clears the device.** Rows left behind would be pushed under whichever account signs in next — stamped with that account's id by `stripLocal`. With unsynced changes the app says how many, and offers Sync now before Sign out anyway. `signOut` uses local scope, so it works offline.

`ConfirmPhrase` is the typed confirmation: harder to trigger by accident than a dialog, which matters for the one action in the app that cannot be undone.

`saveTextFile` here is the browser version: a download. Task 25 gives it an Android path; its signature — resolving to whether the file was handed over — does not change.

**Files:**
- Create: `src/platform/files.ts`, `src/components/ConfirmPhrase.tsx`, `src/features/settings/DataSection.tsx`, `src/features/settings/AccountSection.tsx`
- Modify: `src/features/settings/SettingsScreen.tsx`, `src/features/auth/useAuth.ts`

- [ ] **Step 1: Files and confirmation**

`src/platform/files.ts` (new file):

```ts
/**
 * Hands a text file to the user: a download in the browser. Returns false if
 * they backed out — a browser download never reports that, so here it is
 * always true.
 */
export async function saveTextFile(name: string, text: string, mime: string): Promise<boolean> {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
```

`src/components/ConfirmPhrase.tsx` (new file):

```tsx
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
```

- [ ] **Step 2: The sections**

`src/features/settings/DataSection.tsx` (new file):

```tsx
import { useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useSingleFlight } from '../../app/useSingleFlight';
import Button from '../../components/Button';
import ConfirmPhrase from '../../components/ConfirmPhrase';
import { formatDateLong, formatNumber } from '../../lib/format';
import { today, toISODate } from '../../lib/time';
import { saveTextFile } from '../../platform/files';
import { supabaseSyncClient } from '../../sync/supabaseSyncClient';
import { wipeAccount } from '../../sync/wipe';
import { backupFileName, backupRowCount, buildBackup, parseBackup, type Backup } from './backup';
import { CSV_EXPORTS, csvFileName, loadCsvSources } from './csv';
import { forAccount, importBackup, type ImportResult } from './restore';

type ImportState =
  | { step: 'idle' }
  | { step: 'ready'; backup: Backup; sameAccount: boolean }
  | { step: 'message'; text: string; error?: boolean };

function describeImport(r: ImportResult): string {
  return `Imported: ${r.added} added, ${r.updated} updated, ${r.unchanged} already up to date.`;
}

export default function DataSection() {
  const { userId, exclusive, requestSync } = useApp();
  const { busy, run } = useSingleFlight();
  const [state, setState] = useState<ImportState>({ step: 'idle' });
  const fileInput = useRef<HTMLInputElement>(null);

  function attempt(action: () => Promise<string | void>) {
    return run(async () => {
      try {
        const text = await action();
        if (text) setState({ step: 'message', text });
      } catch (e) {
        setState({ step: 'message', text: e instanceof Error ? e.message : String(e), error: true });
      }
    });
  }

  async function pickFile(file: File | undefined) {
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (fileInput.current) fileInput.current.value = '';
    setState(
      parsed.ok
        ? { step: 'ready', backup: parsed.backup, sameAccount: parsed.backup.user_id === userId }
        : { step: 'message', text: parsed.error, error: true },
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-medium">Backup and export</h2>
      <p className="text-sm text-muted">
        A backup is a complete copy of your data that you keep, independent of the server. Free Supabase projects pause
        after about a week without use, so keep a recent one.
      </p>

      <Button
        variant="primary"
        block
        disabled={busy}
        onClick={() =>
          void attempt(async () => {
            const backup = await buildBackup(userId);
            const saved = await saveTextFile(backupFileName(today()), JSON.stringify(backup), 'application/json');
            return saved ? `Backup ready: ${formatNumber(backupRowCount(backup))} rows.` : undefined;
          })
        }
      >
        Export backup (JSON)
      </Button>

      <div>
        <p className="mb-1 text-sm text-muted">Spreadsheet (CSV)</p>
        <div className="grid grid-cols-3 gap-2">
          {CSV_EXPORTS.map((x) => (
            <Button
              key={x.key}
              disabled={busy}
              onClick={() =>
                void attempt(async () => {
                  await saveTextFile(csvFileName(x.key, today()), x.build(await loadCsvSources()), 'text/csv');
                })
              }
            >
              {x.label}
            </Button>
          ))}
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => void pickFile(e.target.files?.[0])}
      />
      <Button block disabled={busy} onClick={() => fileInput.current?.click()}>
        Import backup…
      </Button>

      {state.step === 'ready' && state.sameAccount && (
        <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
          <p>
            Backup from {formatDateLong(toISODate(new Date(state.backup.exported_at)))} with{' '}
            {formatNumber(backupRowCount(state.backup))} rows. Merging keeps whichever copy of each row was changed
            last, so nothing you have edited since is overwritten.
          </p>
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Button disabled={busy} onClick={() => setState({ step: 'idle' })}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                void attempt(async () => {
                  const result = await exclusive(() => importBackup(state.backup));
                  requestSync();
                  return describeImport(result);
                })
              }
            >
              Merge into this account
            </Button>
          </div>
        </div>
      )}

      {state.step === 'ready' && !state.sameAccount && (
        <ConfirmPhrase
          phrase="RESTORE"
          action="Replace with backup"
          busy={busy}
          onCancel={() => setState({ step: 'idle' })}
          onConfirm={() =>
            void attempt(async () => {
              if (!navigator.onLine) throw new Error('You are offline. Restoring needs a connection.');
              const result = await exclusive(async () => {
                await wipeAccount(supabaseSyncClient, userId);
                return importBackup(forAccount(state.backup, userId, today()));
              });
              requestSync();
              return `Restored. ${describeImport(result)}`;
            })
          }
        >
          <p className="mb-2">
            This backup is from a different account, made{' '}
            {formatDateLong(toISODate(new Date(state.backup.exported_at)))}.
          </p>
          <p>
            Restoring it <strong>replaces everything in this account</strong>, on the server and on this device, with
            the backup's {formatNumber(backupRowCount(state.backup))} rows. Needs a connection.
          </p>
        </ConfirmPhrase>
      )}

      {state.step === 'message' && (
        <p role="status" className={`text-sm ${state.error ? 'text-red-400' : 'text-muted'}`}>
          {state.text}
        </p>
      )}
    </div>
  );
}
```

`src/features/settings/AccountSection.tsx` (new file):

```tsx
import { useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useSingleFlight } from '../../app/useSingleFlight';
import Button from '../../components/Button';
import ConfirmPhrase from '../../components/ConfirmPhrase';
import { supabaseSyncClient } from '../../sync/supabaseSyncClient';
import { clearLocalData, wipeAccount } from '../../sync/wipe';
import { signOut } from '../auth/useAuth';

type Panel = 'none' | 'sign-out' | 'delete';

export default function AccountSection() {
  const { userId, syncStatus, syncBusy, exclusive, requestSync } = useApp();
  const { busy, run } = useSingleFlight();
  const [panel, setPanel] = useState<Panel>('none');
  const [error, setError] = useState<string | null>(null);
  const pending = syncStatus?.pendingCount ?? 0;

  /**
   * Signing out empties this device. Rows left behind would otherwise be
   * pushed under whichever account signs in next.
   */
  const signOutAndClear = () =>
    run(() =>
      exclusive(async () => {
        await clearLocalData();
        await signOut();
      }),
    );

  const deleteEverything = () =>
    run(async () => {
      setError(null);
      if (!navigator.onLine) {
        setError('You are offline. Deleting needs a connection, so the server copy goes too.');
        return;
      }
      try {
        await exclusive(() => wipeAccount(supabaseSyncClient, userId));
        setPanel('none');
        // The first sync after the wipe sets the library, plan and preferences up afresh.
        requestSync();
      } catch (e) {
        setError(`Nothing was deleted on this device: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h2 className="font-medium">Account</h2>

      {panel === 'sign-out' ? (
        <div className="space-y-3 rounded-xl border border-amber-400/60 p-3 text-sm">
          <p>
            {pending} {pending === 1 ? 'change on this device has' : 'changes on this device have'} not reached the
            server yet. Signing out removes this device's copy, so {pending === 1 ? 'it' : 'they'} would be lost.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button disabled={busy || syncBusy} onClick={requestSync}>
              Sync now
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void signOutAndClear()}>
              Sign out anyway
            </Button>
          </div>
          <Button variant="ghost" block onClick={() => setPanel('none')}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button block disabled={busy} onClick={() => (pending > 0 ? setPanel('sign-out') : void signOutAndClear())}>
          Sign out
        </Button>
      )}

      {panel === 'delete' ? (
        <ConfirmPhrase phrase="DELETE" action="Delete everything" busy={busy} onCancel={() => setPanel('none')} onConfirm={() => void deleteEverything()}>
          <p className="mb-2">
            Deletes every workout, session, run, plan, body entry and setting — on the server and on this device. This
            cannot be undone. Export a backup first if you might want any of it.
          </p>
          <p className="text-muted">Needs a connection. Other signed-in devices keep their copy until they sign out.</p>
        </ConfirmPhrase>
      ) : (
        <Button variant="danger" block disabled={busy} onClick={() => setPanel('delete')}>
          Delete all data…
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
```

`src/features/settings/SettingsScreen.tsx` (replace the whole file):

```tsx
import { useApp } from '../../app/AppContext';
import { Checkbox } from '../../components/Fields';
import ScreenHeader from '../../components/ScreenHeader';
import Stepper from '../../components/Stepper';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import AccountSection from './AccountSection';
import DataSection from './DataSection';
import DemoSection from './DemoSection';
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

        <DataSection />
        <DemoSection />
        <AccountSection />
      </div>
    </section>
  );
}
```

`src/features/auth/useAuth.ts` (replace the whole file):

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

/** Local scope: signing out must work offline, and there is only this device's session to end. */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}
```

- [ ] **Step 3: Verify and commit**

Run: `npx tsc -b` — clean. `npm test` — 501 tests pass.

```bash
git add src/platform/files.ts src/components/ConfirmPhrase.tsx src/features/settings src/features/auth/useAuth.ts
git commit -m "feat: Settings — backup export and import, CSV, delete all, sign-out that clears the device"
```

---

## Task 20: Phase 8 checkpoint

- [ ] **Step 1: Full verification**

Run: `npm test` three times — 501 tests pass every time. `npx tsc -b` — clean. `npm run build` — succeeds.

- [ ] **Step 2: Run the app and check**

**What to check:**

1. **Export backup (JSON).** A `fit-tracker-backup-<date>.json` downloads; the status reads "Backup ready: N rows". Open it: `"format": "fit-tracker-backup"`, your user id, twelve tables.
2. **CSV.** Sets, Runs and Body each download a file that opens in a spreadsheet with readable dates and names.
3. **Merge.** Import the file you just exported → *Merge into this account* → "0 added, 0 updated, N already up to date".
4. **Merge wins only when newer.** Change a set's reps in a session, then import the same backup again: the reported count includes "0 updated" and the edit stays.
5. **Bad file.** Import any other JSON file: "This file is not a Fit Tracker backup." Nothing changes.
6. **Another account's backup.** In the downloaded file, change `user_id` to any other value and import it: the panel explains the restore and the button stays disabled until RESTORE is typed. **Cancel** — do not restore into your real account.
7. **Offline.** With the network off (browser devtools → Network → Offline), *Delete all data…* → type DELETE → *Delete everything*: "You are offline…", nothing deleted.
8. **Sign out with pending changes.** Offline, log a set, then Sign out: the warning names the unsynced change. Cancel, go back online, let it sync.

Do **not** run *Delete all data* against your real account unless you mean it. To try it safely, sign in to a second, throwaway user created in the Supabase dashboard (and delete that user afterwards).

- [ ] **Step 3: Commit anything the checkpoint fixed**

---

# Phase 9 — The Android app

From here on, every command runs on **Node 22**. Task 21 creates `.nvmrc`; the shell's fnm hook switches on entering the folder, or run `fnm use`.

## Task 21: Node 22, Capacitor, and the Android project

Capacitor 8 needs Node 22. `.nvmrc` moves only this project; other projects keep their own Node. The `android/` project is committed — its manifest, theme, icon and signing setup are source — so the root `.gitignore` stops ignoring it; Capacitor's own `android/.gitignore` already excludes build output and the copied web assets.

`capacitor.config.ts` sets up SystemBars now (used by Task 24) and a dark background so nothing flashes white before the first paint. It is type-checked by adding it to `tsconfig.node.json`.

**Files:**
- Create: `.nvmrc`, `capacitor.config.ts`, `android/` (generated)
- Modify: `tsconfig.node.json`, `.gitignore`, `package.json`, `package-lock.json`

- [ ] **Step 1: Node 22 for this project**

`.nvmrc` (new file):

```text
22
```

```bash
fnm use
node -v
```

Expected: `v22.x`. If fnm reports 22 is not installed: `fnm install 22`, then `fnm use`.

Run: `npm test` — all 501 pass on Node 22 too.

- [ ] **Step 2: Install Capacitor**

```bash
npm install @capacitor/core@8.5.2 @capacitor/android@8.5.2 @capacitor/app@8.1.2 @capacitor/haptics@8.0.2 @capacitor/filesystem@8.1.4 @capacitor/share@8.0.3
npm install -D @capacitor/cli@8.5.2
```

- [ ] **Step 3: Configuration**

`capacitor.config.ts` (new file):

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.huseyin.fittracker',
  appName: 'Fit Tracker',
  webDir: 'dist',
  // The app's background, so nothing flashes white before the first paint.
  backgroundColor: '#0b0f14',
  plugins: {
    SystemBars: {
      // Older Android WebViews report wrong env(safe-area-inset-*) values;
      // 'css' injects correct ones as --safe-area-inset-*, which index.css prefers.
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      // Light status bar icons on the dark app.
      style: 'DARK',
    },
  },
};

export default config;
```

`tsconfig.node.json` (replace the whole file):

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
  "include": ["vite.config.ts", "capacitor.config.ts"]
}
```

`.gitignore` (replace the whole file):

```text
node_modules
dist
*.tsbuildinfo
.env
.env.local
*.keystore
keystore.properties
.DS_Store
.claude/launch.json
```

Run: `npx tsc -b` — clean.

- [ ] **Step 4: Generate the Android project**

```bash
npm run build
npx cap add android
```

Expected: `[success] android platform added!`, listing four plugins: app, filesystem, haptics, share. `android/variables.gradle` has `minSdkVersion = 24`, `compileSdkVersion = 36`, `targetSdkVersion = 36`.

Run: `git status --short android | head` — the project's sources appear; `android/app/build/` and `android/app/src/main/assets/public/` do not.

- [ ] **Step 5: Commit**

```bash
git add .nvmrc capacitor.config.ts tsconfig.node.json .gitignore package.json package-lock.json android
git commit -m "feat: Capacitor 8 Android project, on Node 22 for this repository"
```

---

## Task 22: Build the APK from the command line

`scripts/android.sh` builds the web app, syncs it into the Android project and runs Gradle. It checks Node 22 and `ANDROID_HOME`, and finds JDK 21 — `JAVA_HOME` when it is 21, else `/usr/libexec/java_home -v 21`, else Homebrew's `openjdk@21` — exporting it for this build only. A release build refuses to run without `android/keystore.properties` rather than produce an unsigned APK.

Release signing reads `android/keystore.properties`, which `.gitignore` already excludes (`keystore.properties`, `*.keystore`). Creating the key is the user's step, in the README (Task 27) — its password is theirs to choose and type.

**Files:**
- Create: `scripts/android.sh`
- Modify: `android/app/build.gradle`, `package.json`

- [ ] **Step 1: The script**

`scripts/android.sh` (new file):

```bash
#!/usr/bin/env bash
# Builds the Android APK from the command line — Android Studio is not needed.
#
#   npm run android:debug     debug APK, signed with the SDK's debug key
#   npm run android:release   release APK, signed with your key (see README)
set -euo pipefail

variant="${1:-debug}"
case "$variant" in
  debug) task=assembleDebug ;;
  release) task=assembleRelease ;;
  *) echo "Usage: scripts/android.sh debug|release" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."

fail() { echo "error: $*" >&2; exit 1; }

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[ "$node_major" -ge 22 ] || fail "Capacitor 8 needs Node 22 or newer (this is Node $node_major). With fnm: fnm use 22"

[ -n "${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}" ] ||
  fail "ANDROID_HOME is not set. Point it at your Android SDK — see README, \"Android build\"."

# Capacitor 8's Gradle build needs JDK 21. Use JAVA_HOME when it is one;
# otherwise find one, without changing the machine's default Java.
java_major() { "$1/bin/java" -version 2>&1 | awk -F'"' '/version/ { split($2, v, "."); print v[1]; exit }'; }
if [ -z "${JAVA_HOME:-}" ] || [ "$(java_major "$JAVA_HOME")" != "21" ]; then
  candidate="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  if [ -z "$candidate" ] && command -v brew >/dev/null; then
    candidate="$(brew --prefix openjdk@21 2>/dev/null)/libexec/openjdk.jdk/Contents/Home"
  fi
  [ -n "$candidate" ] && [ -x "$candidate/bin/java" ] || fail "JDK 21 not found. Install it with: brew install openjdk@21"
  export JAVA_HOME="$candidate"
fi

if [ "$variant" = release ] && [ ! -f android/keystore.properties ]; then
  fail "android/keystore.properties is missing, so the release APK cannot be signed. See README, \"Release signing\"."
fi

npm run build
npx cap sync android
(cd android && ./gradlew --quiet "$task")

apk="$(find android/app/build/outputs/apk/"$variant" -name '*.apk' | head -n 1)"
echo
echo "APK: $apk"
```

```bash
chmod +x scripts/android.sh
npm pkg set scripts.android:debug="scripts/android.sh debug" scripts.android:release="scripts/android.sh release"
```

- [ ] **Step 2: Release signing**

`android/app/build.gradle` (replace the whole file):

```groovy
apply plugin: 'com.android.application'

// Release signing reads android/keystore.properties, which stays out of git.
// Without it a release build is left unsigned; debug builds never need it.
def keystorePropertiesFile = rootProject.file('keystore.properties')
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.withInputStream { keystoreProperties.load(it) }
}

android {
    namespace = "com.huseyin.fittracker"
    compileSdk = rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "com.huseyin.fittracker"
        minSdkVersion rootProject.ext.minSdkVersion
        targetSdkVersion rootProject.ext.targetSdkVersion
        versionCode 1
        versionName "1.0"
        testInstrumentationRunner "androidx.test.runner.AndroidJUnitRunner"
        aaptOptions {
             // Files and dirs to omit from the packaged assets dir, modified to accommodate modern web apps.
             // Default: https://android.googlesource.com/platform/frameworks/base/+/282e181b58cf72b6ca770dc7ca5f91f135444502/tools/aapt/AaptAssets.cpp#61
            ignoreAssetsPattern = '!.svn:!.git:!.ds_store:!*.scc:.*:!CVS:!thumbs.db:!picasa.ini:!*~'
        }
    }
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            if (keystorePropertiesFile.exists()) {
                signingConfig signingConfigs.release
            }
            minifyEnabled false
            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        }
    }
}

repositories {
    flatDir{
        dirs '../capacitor-cordova-android-plugins/src/main/libs', 'libs'
    }
}

dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    implementation "androidx.appcompat:appcompat:$androidxAppCompatVersion"
    implementation "androidx.coordinatorlayout:coordinatorlayout:$androidxCoordinatorLayoutVersion"
    implementation "androidx.core:core-splashscreen:$coreSplashScreenVersion"
    implementation project(':capacitor-android')
    testImplementation "junit:junit:$junitVersion"
    androidTestImplementation "androidx.test.ext:junit:$androidxJunitVersion"
    androidTestImplementation "androidx.test.espresso:espresso-core:$androidxEspressoCoreVersion"
    implementation project(':capacitor-cordova-android-plugins')
}

apply from: 'capacitor.build.gradle'

try {
    def servicesJSON = file('google-services.json')
    if (servicesJSON.text) {
        apply plugin: 'com.google.gms.google-services'
    }
} catch(Exception e) {
    logger.info("google-services.json not found, google-services plugin not applied. Push Notifications won't work")
}
```

- [ ] **Step 3: Build**

```bash
npm run android:debug
```

The first run downloads Gradle and the Android Gradle plugin — several minutes. Expected last line: `APK: android/app/build/outputs/apk/debug/app-debug.apk` (about 4.4 MB). A warning that the SDK tools "only understand SDK XML versions up to 3" is harmless: the command-line tools and SDK packages were released at different times.

```bash
"$ANDROID_HOME/build-tools/36.0.0/aapt2" dump permissions android/app/build/outputs/apk/debug/app-debug.apk
```

Expected: `INTERNET` and `VIBRATE` — the second merged in from the Haptics plugin.

- [ ] **Step 4: Commit**

```bash
git add scripts/android.sh package.json android/app/build.gradle
git commit -m "feat: build the APK from the command line; release signing from keystore.properties"
```

---

## Task 23: Dark theme, splash and icon

On Android WebViews before Chromium 140 — the emulator's is 134 — Capacitor pads the WebView below the status bar and above the navigation bar, and the Android window background shows in those strips. The template's theme is light, so with the dark app and light status-bar icons the bars came out white with white icons. The window and splash backgrounds become the app's colour.

The icon is a dumbbell in the accent blue on the app background, drawn as a vector — no image tooling, no new dependency — with a monochrome layer for Android's themed icons. The template's Capacitor splash images are deleted: the splash is now the app colour with the icon.

**Files:**
- Create: `android/app/src/main/res/values/colors.xml`
- Modify: `android/app/src/main/res/values/styles.xml`, `values/ic_launcher_background.xml`, `drawable-v24/ic_launcher_foreground.xml`, `mipmap-anydpi-v26/ic_launcher.xml`, `mipmap-anydpi-v26/ic_launcher_round.xml`
- Delete: `android/app/src/main/res/drawable*/splash.png`

- [ ] **Step 1: Theme and splash**

`android/app/src/main/res/values/colors.xml` (new file):

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- The web app's background colour (color-bg in index.css). Shows behind the WebView and the system bars, and on the splash screen. -->
    <color name="app_background">#0B0F14</color>
</resources>
```

`android/app/src/main/res/values/styles.xml` (replace the whole file):

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>

    <!-- Base application theme. -->
    <style name="AppTheme" parent="Theme.AppCompat.Light.DarkActionBar">
        <!-- Customize your theme here. -->
        <item name="colorPrimary">@color/colorPrimary</item>
        <item name="colorPrimaryDark">@color/colorPrimaryDark</item>
        <item name="colorAccent">@color/colorAccent</item>
    </style>

    <!--
        The app is dark throughout. On older Android WebViews Capacitor insets
        the WebView below the status bar and above the navigation bar, and the
        window background shows in those strips — it must match the app.
    -->
    <style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:background">@null</item>
        <item name="android:windowBackground">@color/app_background</item>
    </style>


    <style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="windowSplashScreenBackground">@color/app_background</item>
        <item name="android:windowBackground">@color/app_background</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>
</resources>
```

- [ ] **Step 2: Icon**

`android/app/src/main/res/values/ic_launcher_background.xml` (replace the whole file):

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0B0F14</color>
</resources>
```

`android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml` (replace the whole file):

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- A dumbbell in the app's accent blue, inside the adaptive icon's 66dp safe zone. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <!-- Bar -->
    <path android:fillColor="#4EA1FF" android:pathData="M38,51h32v6h-32z" />
    <!-- Inner plates -->
    <path android:fillColor="#4EA1FF" android:pathData="M33,40a2,2 0,0 1,2 -2h3a2,2 0,0 1,2 2v28a2,2 0,0 1,-2 2h-3a2,2 0,0 1,-2 -2z" />
    <path android:fillColor="#4EA1FF" android:pathData="M68,40a2,2 0,0 1,2 -2h3a2,2 0,0 1,2 2v28a2,2 0,0 1,-2 2h-3a2,2 0,0 1,-2 -2z" />
    <!-- Outer plates -->
    <path android:fillColor="#4EA1FF" android:pathData="M27,46a2,2 0,0 1,2 -2h1a2,2 0,0 1,2 2v16a2,2 0,0 1,-2 2h-1a2,2 0,0 1,-2 -2z" />
    <path android:fillColor="#4EA1FF" android:pathData="M76,46a2,2 0,0 1,2 -2h1a2,2 0,0 1,2 2v16a2,2 0,0 1,-2 2h-1a2,2 0,0 1,-2 -2z" />
</vector>
```

`android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` (replace the whole file):

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
```

`android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` (replace the whole file):

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
```

- [ ] **Step 3: Remove the template splash images**

```bash
rm android/app/src/main/res/drawable*/splash.png
find android/app/src/main/res -type d -empty -delete
```

- [ ] **Step 4: Build and commit**

Run: `npm run android:debug` — succeeds.

```bash
git add -A android/app/src/main/res
git commit -m "feat: dark window and splash behind the system bars; dumbbell launcher icon"
```

---

## Task 24: Safe areas

`env(safe-area-inset-*)` is wrong in Android WebViews before Chromium 140. With `insetsHandling: 'css'` (Task 21) Capacitor injects correct values as `--safe-area-inset-*` on `<html>`; `index.css` defines `--inset-top` and `--inset-bottom` preferring them, falling back to `env()` in a browser and to 0 on a desktop. The four places that used `env()` switch to the variables.

**Files:**
- Modify: `src/index.css`, `src/app/AppShell.tsx`, `src/components/TabBar.tsx`, `src/features/log/RestTimerBar.tsx`

- [ ] **Step 1: The variables and their users**

`src/index.css` (replace the whole file):

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

:root {
  /*
   * Safe-area insets. Inside the Android app, Capacitor's SystemBars plugin
   * injects --safe-area-inset-*, because older Android WebViews report wrong
   * env() values. A browser falls back to env(); a desktop browser to 0.
   */
  --inset-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  --inset-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
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

`src/app/AppShell.tsx` (replace the whole file):

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
    <div className="min-h-full pt-[var(--inset-top)]">
      <div className="mx-auto max-w-xl px-4 pt-2 pb-[calc(9rem+var(--inset-bottom))]">
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

`src/components/TabBar.tsx` (replace the whole file):

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
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-bg/95 pb-[var(--inset-bottom)] backdrop-blur"
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

`src/features/log/RestTimerBar.tsx` (replace the whole file):

```tsx
import Button from '../../components/Button';
import { formatDuration } from '../../lib/running';
import type { RestTimerControls } from './useRestTimer';

/** Floats just above the tab bar while a rest is running, so it is visible from any exercise. */
export default function RestTimerBar({ timer }: { timer: RestTimerControls }) {
  if (!timer.active) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+var(--inset-bottom))] z-10 px-4">
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

Run: `grep -rn "env(safe-area" src` — only the two lines in `index.css`.

- [ ] **Step 2: Verify and commit**

Run: `npx tsc -b` — clean. `npm run dev` — in a browser nothing moves.

```bash
git add src/index.css src/app/AppShell.tsx src/components/TabBar.tsx src/features/log/RestTimerBar.tsx
git commit -m "feat: safe areas from Capacitor's injected insets, falling back to env()"
```

---

## Task 25: Files, haptics and the Back button

- **Files.** A download link does nothing inside the WebView. In the app, `saveTextFile` writes to the cache and opens the share sheet; dismissing it resolves `false`, not an error. The template's FileProvider already covers the cache directory.
- **Haptics.** The rest-over buzz goes through `@capacitor/haptics` in the app, and the Vibration API in a browser.
- **Back.** Without a listener, Back on the first screen does nothing. Every screen is a hash route, so Back walks `history`, and on the first screen it minimises the app like other Android apps. Chromium skips history entries made without a user gesture, so to test Back, navigate by tapping — not by setting `location.hash` from devtools.

**Files:**
- Create: `src/platform/vibrate.ts`, `src/platform/backButton.ts`
- Modify: `src/platform/files.ts`, `src/main.tsx`, `src/features/log/useRestTimer.ts`

- [ ] **Step 1: Platform modules**

`src/platform/files.ts` (replace the whole file):

```ts
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/**
 * Hands a text file to the user. Returns false if they backed out.
 *
 * In the browser that is a download. Inside the Android app a download link
 * does nothing — the WebView has no download manager — so the file is written
 * to the app's cache and offered through the share sheet: save it to Drive,
 * Files, email, wherever.
 */
export async function saveTextFile(name: string, text: string, mime: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({ path: name, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    try {
      await Share.share({ title: name, files: [uri] });
      return true;
    } catch (e) {
      // Dismissing the share sheet rejects; that is a choice, not a failure.
      if (e instanceof Error && /cancel/i.test(e.message)) return false;
      throw e;
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
```

`src/platform/vibrate.ts` (new file):

```ts
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';

const PULSE_MS = 300;
const GAP_MS = 150;

/**
 * Two firm pulses — "rest is over". In the Android app this goes through
 * Capacitor Haptics, which works whatever the WebView supports; in a browser,
 * through the Vibration API where there is one.
 */
export function vibrate(): void {
  if (Capacitor.isNativePlatform()) {
    void Haptics.vibrate({ duration: PULSE_MS });
    setTimeout(() => void Haptics.vibrate({ duration: PULSE_MS }), PULSE_MS + GAP_MS);
  } else if (typeof navigator.vibrate === 'function') {
    navigator.vibrate([PULSE_MS, GAP_MS, PULSE_MS]);
  }
}
```

`src/platform/backButton.ts` (new file):

```ts
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/**
 * Android's back button walks the app's own history, as Back does in a
 * browser — every screen is a hash route. From the first screen it sends the
 * app to the background, as other Android apps do; without a listener it
 * would do nothing there.
 */
export function installBackButton(): void {
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else void App.minimizeApp();
  });
}
```

- [ ] **Step 2: Use them**

`src/main.tsx` (replace the whole file):

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { installBackButton } from './platform/backButton';

installBackButton();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/features/log/useRestTimer.ts` (replace the whole file):

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { vibrate as buzz } from '../../platform/vibrate';
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
    if (vibrate) buzz();
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

- [ ] **Step 3: Verify and commit**

Run: `npx tsc -b` — clean. `npm test` — 501 pass. `npm run dev` — the app still runs in a browser: `Capacitor.isNativePlatform()` is false there, and the plugins' web versions load.

```bash
git add src/platform src/main.tsx src/features/log/useRestTimer.ts
git commit -m "feat: share-sheet export, haptics and the Back button in the Android app"
```

---

## Task 26: The rest alert with the screen locked

See decision 4. `useRestAlert` listens to `appStateChange`: leaving the foreground mid-rest schedules notification 1 for the end time; returning cancels it and clears it from the shade. It is keyed on the timer, not on whether it has finished, so the timer running out in the background does not re-run its cleanup and clear the alert as it lands.

Notification permission is asked during the first rest — while the user is looking at the app, since a dialog cannot appear from the background. The channel vibrates at maximum importance. The plugin opens the system "Alarms & reminders" screen whenever an exact alarm is not allowed; `USE_EXACT_ALARM` (granted at install from Android 13) avoids that, and if exact alarms are still unavailable the alert is scheduled inexact instead of interrupting the workout.

**Files:**
- Create: `src/platform/restAlert.ts`, `android/app/src/main/res/drawable/ic_stat_rest.xml`
- Modify: `src/features/log/useRestTimer.ts`, `android/app/src/main/AndroidManifest.xml`, `src/features/settings/SettingsScreen.tsx`, `package.json`, `package-lock.json`

- [ ] **Step 1: Install the plugin**

```bash
npm install @capacitor/local-notifications@8.3.1
```

8.3 is the first version with `isExactNotification`.

- [ ] **Step 2: The alert**

`src/platform/restAlert.ts` (new file):

```ts
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useEffect } from 'react';

/**
 * The rest-over alert while the app is in the background.
 *
 * Android ignores haptic vibration from an app that is not in the foreground
 * — screen off counts — so the in-app buzz cannot reach a phone locked
 * between sets. Instead, whenever the app leaves the foreground mid-rest, a
 * notification is scheduled for the moment rest ends, on a channel that
 * vibrates. Coming back cancels it, and the in-app buzz takes over again, so
 * the alert never fires twice.
 */

const CHANNEL = 'rest-timer';
const NOTIFICATION_ID = 1;

let ready: Promise<boolean> | null = null;

/**
 * Asks for notification permission (once, on first use) and creates the
 * channel. Resolves to whether alerts can be shown. In a browser: false.
 */
export function prepareRestAlert(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(false);
  ready ??= (async () => {
    let { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') {
      ({ display } = await LocalNotifications.requestPermissions());
    }
    if (display !== 'granted') return false;
    await LocalNotifications.createChannel({
      id: CHANNEL,
      name: 'Rest timer',
      description: 'When the rest between sets is over',
      importance: 5,
      visibility: 1,
      vibration: true,
    });
    return true;
  })().catch(() => false);
  return ready;
}

async function arm(endsAt: number): Promise<void> {
  if (!(await prepareRestAlert())) return;
  // USE_EXACT_ALARM, declared in the manifest, makes exact alarms available.
  // If they are not, schedule inexact rather than let the plugin open the
  // system settings screen in the middle of a workout.
  const { exact_alarm } = await LocalNotifications.checkExactNotificationSetting();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: NOTIFICATION_ID,
        title: 'Rest over',
        body: 'Time for your next set.',
        channelId: CHANNEL,
        smallIcon: 'ic_stat_rest',
        schedule: { at: new Date(endsAt), allowWhileIdle: true },
        isExactNotification: exact_alarm === 'granted',
      },
    ],
  });
}

async function disarm(): Promise<void> {
  await LocalNotifications.cancel({ notifications: [{ id: NOTIFICATION_ID }] });
  await LocalNotifications.removeAllDeliveredNotifications();
}

/** Keeps the background alert in step with the rest timer and the app's foreground state. */
export function useRestAlert(endsAt: number | null, enabled: boolean): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || endsAt === null || !enabled) return;
    const listener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void disarm().catch(() => undefined);
      else if (endsAt > Date.now()) void arm(endsAt).catch(() => undefined);
    });
    return () => {
      void listener.then((l) => l.remove());
      void disarm().catch(() => undefined);
    };
  }, [endsAt, enabled]);
}
```

`src/features/log/useRestTimer.ts` (replace the whole file):

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { prepareRestAlert, useRestAlert } from '../../platform/restAlert';
import { vibrate as buzz } from '../../platform/vibrate';
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
    if (vibrate) buzz();
  }, [timer, done, vibrate]);

  // Keyed on the timer, not on `done`: the timer running out in the background
  // must not re-run the hook's cleanup, which would clear the alert as it lands.
  useRestAlert(timer ? timer.endsAt : null, vibrate);

  const start = useCallback(
    (seconds: number) => {
      // The first rest asks for notification permission, for the locked-screen alert.
      if (vibrate) void prepareRestAlert();
      const next = startRest(Date.now(), seconds);
      save(next);
      setNow(Date.now());
      setTimer(next);
    },
    [vibrate],
  );

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

`src/features/settings/SettingsScreen.tsx` (replace the whole file):

```tsx
import { useApp } from '../../app/AppContext';
import { Checkbox } from '../../components/Fields';
import ScreenHeader from '../../components/ScreenHeader';
import Stepper from '../../components/Stepper';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import AccountSection from './AccountSection';
import DataSection from './DataSection';
import DemoSection from './DemoSection';
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
              <p className="text-xs text-muted">
                In the Android app, a locked phone gets the alert as a notification — allow notifications when asked.
              </p>
            </>
          )}
        </div>

        <DataSection />
        <DemoSection />
        <AccountSection />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Android resources**

`android/app/src/main/AndroidManifest.xml` (replace the whole file):

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme">

        <activity
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
            android:name=".MainActivity"
            android:label="@string/title_activity_main"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:launchMode="singleTask"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>

        <provider
            android:name="androidx.core.content.FileProvider"
            android:authorities="${applicationId}.fileprovider"
            android:exported="false"
            android:grantUriPermissions="true">
            <meta-data
                android:name="android.support.FILE_PROVIDER_PATHS"
                android:resource="@xml/file_paths"></meta-data>
        </provider>
    </application>

    <!-- Permissions -->

    <uses-permission android:name="android.permission.INTERNET" />
    <!--
        Lets the rest-over notification fire on time with the screen off.
        Granted at install from Android 13; Play Store restrictions on it do
        not apply to a sideloaded app.
    -->
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
</manifest>
```

`android/app/src/main/res/drawable/ic_stat_rest.xml` (new file):

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Status bar icon for the rest-over notification: the launcher dumbbell, in white. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="60"
    android:viewportHeight="60">
    <group android:translateX="-24" android:translateY="-24">
        <path android:fillColor="#FFFFFF" android:pathData="M38,51h32v6h-32z" />
        <path android:fillColor="#FFFFFF" android:pathData="M33,40a2,2 0,0 1,2 -2h3a2,2 0,0 1,2 2v28a2,2 0,0 1,-2 2h-3a2,2 0,0 1,-2 -2z" />
        <path android:fillColor="#FFFFFF" android:pathData="M68,40a2,2 0,0 1,2 -2h3a2,2 0,0 1,2 2v28a2,2 0,0 1,-2 2h-3a2,2 0,0 1,-2 -2z" />
        <path android:fillColor="#FFFFFF" android:pathData="M27,46a2,2 0,0 1,2 -2h1a2,2 0,0 1,2 2v16a2,2 0,0 1,-2 2h-1a2,2 0,0 1,-2 -2z" />
        <path android:fillColor="#FFFFFF" android:pathData="M76,46a2,2 0,0 1,2 -2h1a2,2 0,0 1,2 2v16a2,2 0,0 1,-2 2h-1a2,2 0,0 1,-2 -2z" />
    </group>
</vector>
```

- [ ] **Step 4: Build and check the permissions**

Run: `npx tsc -b` — clean. `npm test` — 501 pass. `npm run android:debug` — succeeds, listing five plugins.

```bash
"$ANDROID_HOME/build-tools/36.0.0/aapt2" dump permissions android/app/build/outputs/apk/debug/app-debug.apk
```

Expected, among others: `USE_EXACT_ALARM`, `VIBRATE`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/platform/restAlert.ts src/features/log/useRestTimer.ts src/features/settings/SettingsScreen.tsx android/app/src/main/AndroidManifest.xml android/app/src/main/res/drawable/ic_stat_rest.xml
git commit -m "feat: rest-over notification when the phone is locked"
```

---

## Task 27: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write it**

`README.md` (new file):

````markdown
# Fit Tracker

A personal fitness tracker for weekday strength training and weekly runs: plan a week, log every set with RPE in the gym, log runs, and see whether you are getting stronger, running more, or accumulating fatigue.

It runs as an Android app installed from an APK you build yourself, and as a plain web app for development. It costs nothing: no Play Store, no paid build service, and only free tiers that never ask for a card.

- **Offline first.** Everything is written to the phone first and syncs to Supabase when there is a connection. A whole session can be logged with no signal.
- **RPE on every set and run.** The app does not accept a set without one.
- **Progress:** estimated 1RM with PR markers, rep maxes, weekly volume, adherence, RPE trends with a fatigue warning, running distance and pace, body weight and resting heart rate.
- **Your data stays yours:** a complete JSON backup you can restore anywhere, plus CSV for spreadsheets.

## Stack

Vite, React, TypeScript and Tailwind CSS; Dexie (IndexedDB) on the device; Supabase (Postgres with row level security) as the off-device copy; Recharts; Vitest; Capacitor 8 for Android.

## Setup

### 1. Tools

- **Node 22.** The repository has an `.nvmrc`, so `fnm` or `nvm` switch to it inside this folder: `fnm install 22` once, then `fnm use`.
- `npm install`

### 2. A Supabase project (free)

1. Create a project at [supabase.com](https://supabase.com). The free plan needs no card.
2. **SQL Editor → New query.** Paste and run each file in `supabase/migrations`, in order: `0001_init.sql`, `0002_rls.sql`, `0003_reject_stale_writes.sql`.
3. **Authentication → Users → Add user.** Your email and a password; tick *Auto Confirm User*.
4. **Authentication → Sign In / Providers → Email:** turn **off** *Allow new users to sign up*. The key below ships inside the APK, where anyone holding the file can read it. Row level security keeps them out of your data; closing sign-ups stops them creating accounts that use up your free quota.

### 3. `.env`

```bash
cp .env.example .env
```

Fill both values from **Project Settings → API**:

- `VITE_SUPABASE_URL` — the project URL, `https://<project-ref>.supabase.co`. Not the dashboard address.
- `VITE_SUPABASE_ANON_KEY` — the **anon** (public) key. Never the `service_role` key: it bypasses row level security.

`.env` is gitignored. A build without it fails on purpose rather than producing an empty app.

## Development

```bash
npm run dev        # http://localhost:5173
npm test           # unit tests
npx tsc -b         # type check (not --noEmit: the project uses references)
npm run build      # production web build
```

Sign in with the user you created. The first sync loads the exercise library and sets up an empty weekly plan. To see the charts before you have history, **Settings → Load demo data** adds twelve weeks of example training; **Remove demo data** takes it away again without touching your own entries.

## Android build

Android Studio is not needed: the APK builds from the command line.

### One-time setup

1. **JDK 21.** `brew install openjdk@21`. The build script finds it on its own, so your default `java` can stay as it is.
2. **Android SDK command-line tools.** `brew install --cask android-commandlinetools`, then set `ANDROID_HOME` in your shell profile:

   ```bash
   export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
   ```

3. Install the platform and accept the licences:

   ```bash
   sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"
   sdkmanager --licenses
   ```

Android Studio's SDK works just as well, if you have it.

### Build

```bash
npm run android:debug
```

This builds the web app, copies it into the Android project, and runs Gradle. The first run downloads Gradle and takes a few minutes. The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

### Install on your phone

- **Over USB:** enable *Developer options → USB debugging* on the phone, connect it, then `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`.
- **Without a cable:** copy the APK to the phone (Drive, email, anything), open it, and allow your file manager to *install unknown apps* when asked.

### Release signing

A debug APK is fine for personal use. A release APK is smaller and faster, and is signed with your own key. Android only installs an update over an existing app when both are signed with the **same** key, so keep it safe.

1. Create a key once, somewhere outside the repository. `keytool` asks for a password; remember it.

   ```bash
   mkdir -p ~/keys
   keytool -genkeypair -v -keystore ~/keys/fit-tracker.keystore -alias fittracker -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Create `android/keystore.properties` (gitignored), using absolute paths:

   ```properties
   storeFile=/Users/you/keys/fit-tracker.keystore
   storePassword=the password you chose
   keyAlias=fittracker
   keyPassword=the password you chose
   ```

3. `npm run android:release`. The APK is at `android/app/build/outputs/apk/release/app-release.apk`.

A debug build and a release build are signed with different keys, so Android will not update one with the other. Uninstall first when switching, after taking a backup.

### On the phone

- **Rest timer alert.** With the app open the phone buzzes. With the screen locked the alert comes as a notification, so allow notifications when the app asks during your first rest.
- **Back button.** Walks back through the screens you visited; from the first screen it leaves the app.
- **Exports** open the share sheet: save to Drive or Files, or send them anywhere.

## Your data

- **Sync** runs when the app opens, when it comes back to the foreground, when the connection returns, after you finish a session, and on **Settings → Sync now**.
- **Free Supabase projects pause after about a week without use.** Daily use keeps yours awake. After a long break, resume it from the Supabase dashboard; until then the app keeps working offline and syncs once the project is back.
- **Settings → Export backup (JSON)** saves everything, deleted rows included. Keep a recent one.
- **Settings → Import backup** merges a backup into the account. Each row keeps whichever copy was changed last, so an old backup never overwrites newer edits. A backup from a *different* account — say, after moving to a new Supabase project — can be restored too: that replaces everything in the current account and asks you to type RESTORE first.
- **CSV exports** (sets, runs, body) are for spreadsheets. They cannot be imported back; the JSON backup can.
- **Delete all data** removes everything from the server and this device, after you type DELETE. Other signed-in devices keep their copy until they sign out.
- **Signing out** clears this device. If changes have not synced yet, the app warns you first.

## Project layout

```
src/
  app/          routing, app shell, first-run setup
  components/   shared UI, charts
  db/           Dexie schema and write helpers
  features/     plan, log, progress, library, settings, auth
  lib/          pure calculations: e1RM, PRs, pace, adherence, streak, fatigue
  platform/     Android integration: files, haptics, back button, rest alert
  sync/         push, pull, merge, wipe
supabase/migrations/   SQL, applied by hand in the SQL editor
android/               the Capacitor Android project
docs/superpowers/      design spec and implementation plans
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README — setup, development, APK build and install, data safety"
```

---

## Task 28: Phase 9 checkpoint — on the phone

- [ ] **Step 1: Full verification**

Run: `npm test` three times — 501 pass every time. `npx tsc -b` — clean. `npm run android:debug` — succeeds.

- [ ] **Step 2: Install**

Enable *Developer options → USB debugging* on the phone, connect it, then:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Or copy the APK to the phone and open it, allowing the file manager to install unknown apps. The user signs in on the phone themselves.

- [ ] **Step 3: What to check**

1. **Icon and launch.** A blue dumbbell on dark; the splash is dark; no white flash.
2. **System bars.** The status bar is dark with light icons; the title is below it; the tab bar sits above the gesture bar.
3. **Sync.** The first sync brings the library, plan and history from Supabase. "Synced" with a time.
4. **Rest timer, app open.** Log a set: the first rest asks to allow notifications — allow. When rest ends, the phone buzzes twice.
5. **Rest timer, phone locked.** Log a set, lock the phone. When rest ends, the phone vibrates and shows "Rest over". Unlock and open the app: the notification is gone and there is no second buzz.
6. **Back button.** From Settings, Back returns through the screens you visited; on the first screen it leaves the app.
7. **Progress.** Charts draw; ranges switch.
8. **Export.** Settings → Export backup: the share sheet opens with `fit-tracker-backup-<date>.json`; save it to Drive or Files. Dismissing the sheet shows no error.
9. **Import.** Import backup opens the system file picker; pick the saved file → Merge → "already up to date".
10. **Offline.** Airplane mode: log a set, then turn the network back on. The pending change syncs on its own.

- [ ] **Step 4: Optional — a signed release build**

Follow README → *Release signing*: the user creates the keystore and `android/keystore.properties` (their password, typed by them), then `npm run android:release`. Note that a debug and a release build are signed with different keys: uninstall the debug app first, after an export.

- [ ] **Step 5: Commit anything the checkpoint fixed**

---

## Task 29: Spec update

Bring the spec in line with what was built.

- [ ] **Step 1: Replace §10**

In `docs/superpowers/specs/2026-09-22-fitness-tracker-design.md`, replace section 10, from its heading up to `## 11. Testing`, with:

```markdown
## 10. Export, import, and data safety

- **Export JSON** — every table including tombstones, with a format version and the account's user id. This is a complete, restorable backup. Every row carries exactly its table's columns; a compile-time check fails the build if a domain type gains a column the backup would miss.
- **Export CSV** — three files for spreadsheets: sets, runs and body entries, one row each, joined with dates, workout and exercise names, and derived e1RM and pace. Raw tables full of ids are no use in a spreadsheet, and the JSON backup is the restore path, so CSV is not one.
- **Import / merge JSON** — validated first: a row missing any column of its table is refused, since one bad row would stall every later push. Rows then match on `id` and the newer `updated_at` wins, as in sync, so importing an older export cannot clobber newer data. A row the import wins is queued for push.
- **Restore into another account** — a backup whose user id differs (a new Supabase project means a new account) first deletes everything in the current account, then imports a re-keyed copy: every row gets a new id, since ids are global in the database; rows derived by name (preferences, the default plan and its days, planned sessions) get the ids this account derives; untouched planned sessions from today on are dropped and re-materialized. Behind a typed confirmation.
- **Delete all data** — hard deletes on the server, children before parents (no cascade), then clears the device including sync bookkeeping, behind a typed confirmation. The next sync sets the library, plan and preferences up afresh. Other devices keep their copy until they sign out: a hard delete leaves no tombstone to sync.
- **Sign out** clears the device, so rows can never be pushed under whichever account signs in next. Unsynced changes are reported first.
- **Demo data** — twelve weeks of plausible training, each row marked with the note "Demo data", removable in one action without touching real entries.
- Wiping, restoring and signing out run under the same lock as sync, so a sync can never push rows back mid-wipe.
- Supabase is the off-device backup. Note that **free-tier projects pause after about 7 days of inactivity**; daily use prevents this, but after a long break the first sync may need the project resumed from the dashboard.

On Android, exports are written to the app cache with `@capacitor/filesystem` and handed to the share sheet with `@capacitor/share`; a download link does nothing inside the WebView. Import uses a file input, which the WebView serves with the system file picker.
```

- [ ] **Step 2: Replace §14**

Replace section 14, from its heading up to `## 15. Build order`, with:

```markdown
## 14. Android build

Capacitor 8 (`com.huseyin.fittracker`). The APK builds from the command line with `npm run android:debug` or `npm run android:release`; Android Studio is not needed.

- **Node 22**, which Capacitor 8 requires, pinned for this project by `.nvmrc`.
- **JDK 21**, which Capacitor 8's Gradle build requires. `scripts/android.sh` finds one (`JAVA_HOME` if it is 21, then `java_home -v 21`, then Homebrew's `openjdk@21`) without changing the machine's default Java.
- **Android SDK** command-line tools with platform 36 and build-tools, via `ANDROID_HOME`.
- **The `android/` project is committed.** Its manifest, theme, icon and signing configuration are source; build output and the copied web assets are ignored by its own `.gitignore`.
- **Release signing** reads `android/keystore.properties` (gitignored), which points at a keystore kept outside the repository. Without it a release build fails in the script rather than producing an unsigned APK.

### Android-specific behaviour

- **Safe areas.** Android WebViews before Chromium 140 report wrong `env(safe-area-inset-*)` values. Capacitor's SystemBars plugin (`insetsHandling: 'css'`) pads the WebView and injects `--safe-area-inset-*`, which `index.css` prefers over `env()`. The window background is the app's dark colour, since it shows behind the padded system bars.
- **Rest timer.** Remaining time is computed from a stored absolute end time, never counted in ticks. In the foreground the end is signalled through `@capacitor/haptics`. Android drops haptic vibration from an app that is not in the foreground, screen off included, so whenever the app leaves the foreground mid-rest it schedules a local notification for the end time on a vibrating channel; returning cancels it. `USE_EXACT_ALARM` makes that alarm exact; it is granted at install, and Play's policy on it does not apply to a sideloaded app. Notification permission is asked during the first rest.
- **Back button.** `@capacitor/app` walks the WebView history, every screen being a hash route; on the first screen it sends the app to the background.
- **Icon.** An adaptive vector icon, a dumbbell in the accent colour on the app background, with a monochrome layer for themed icons.
```

- [ ] **Step 3: Append §18**

Append at the end of the file:

```markdown
## 18. Progress, as built

- **Views:** Strength (adherence, sessions, weekly volume, sessions per week), Exercises (every lifted exercise, then per exercise: e1RM with PR markers, best set, volume, RPE, rep maxes), RPE (fatigue banner, weekly session RPE, volume against RPE), Running (distance, runs, longest, weekly distance, pace per run type, monthly distance, pace against RPE), Body (weight and resting heart rate, with entry).
- **Ranges** are whole Monday-start weeks ending with the current one — 4, 12 and 26 weeks — or everything, from the week of the earliest data. View and range live in the route and are replaced, not pushed, when changed.
- **PRs are judged against all history**, whatever range is shown; a session's first appearance is never a PR, having nothing to beat. Warm-ups never count.
- **Adherence** counts planned sessions up to today; today's counts only once finished.
- **Body entries:** one per day, so each chart is a single line.
- The charts library loads only when Progress opens, keeping it out of the startup path of the screens used in the gym.
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-09-22-fitness-tracker-design.md
git commit -m "docs: spec updated for data safety, Android and Progress as built"
```

---

## Self-review

**Spec coverage — Phases 7 to 9 and the remaining brief:**

| Requirement (spec / brief) | Task |
|---|---|
| e1RM trend with PR markers, best set, rep-count PRs (spec §8, §9 Exercise detail) | 3, 11 |
| Weekly volume, sessions per week, adherence % (§9 Strength) | 3, 10 |
| Average RPE over time, volume-vs-RPE, fatigue-flag banner (§9 RPE) | 4, 10 |
| Weekly km, pace trend per run type, longest run, monthly totals, pace vs RPE (§9 Running) | 5, 10 |
| Weight and resting HR charts; body metrics entry (§9 Body) | 6, 10, 11 |
| Range filters 4w, 12w, 6m, all (§8) | 1, 8, 10 |
| Export JSON with tombstones and a schema version (§10) | 15, 19 |
| Export CSV (§10; three joined files instead of one per table — Task 29 updates the spec) | 18, 19 |
| Import/merge by `id` with the sync rule (§10, §11 "Import/merge dedupe by id") | 16, 19 |
| Delete all data, hard deletes, typed confirmation (§6, §10) | 17, 19 |
| Load demo data; sign out (§9 Settings, brief) | 7, 12, 19 |
| Last-synced time, sync now (brief) | existing `SyncStatus`, unchanged |
| Capacitor Android build, install over USB or file (§14) | 21, 22, 28 |
| Filesystem + Share for export on Android (§10) | 25 |
| Rest timer from an absolute timestamp; vibration through Haptics (§14) | existing; 25, 26 |
| Safe-area insets, reduced motion, accessible labels (brief, §9) | 9, 24, every screen |
| README covering setup and the APK build (brief) | 27 |

Beyond the spec, found while validating: sign-out clears the device (cross-account pushes), restoring a backup into another account (§17's derived ids), the locked-screen rest notification (Android drops background haptics), the dark window behind padded system bars, and Back on the first screen.

**Placeholder scan:** no step defers work. `files.ts` is written twice on purpose — the browser version in Task 19, the Android version in Task 25 — with the same signature. `useRestTimer.ts` and `SettingsScreen.tsx` change in more than one task; each task shows the whole file as it stands then.

**Type consistency:** `ProgressData`, `Lift` and `RunPoint` are defined once in `progressData.ts`; `ViewProps` in `ProgressScreen.tsx`; `Backup` in `backup.ts`; `ImportResult` in `restore.ts`; `WipeClient` in `wipe.ts`; `RangeKey` in `lib/ranges.ts`; `ProgressView` in `routes.ts`. `saveTextFile(name, text, mime): Promise<boolean>`, `forAccount(backup, userId, today)`, `wipeAccount(client, userId)` and `useRestAlert(endsAt, enabled)` have one signature each.

---

## Post-execution amendments

Tasks 1–27 and 29 were executed verbatim — every file matched the plan's blocks, and the Android project, scripts and lockfile were byte-identical to the validation replay. Phase 7 and 8 checkpoints passed in a browser against the real Supabase project. The blocks above are the *as-planned* version; the commits below are the current state.

**Plan gap.** Task 26's stage list missed `android/app/capacitor.build.gradle` and `android/capacitor.settings.gradle`, which `cap sync` rewrites to wire in the local-notifications plugin. They were committed with Task 26 (`660cab1`).

**Whole-implementation review**, findings confirmed against the real modules (three with reproducing tests) before fixing:

| Ref | Defect | Fix |
|---|---|---|
| Critical | Sign-out trusted `syncStatus.pendingCount`, a snapshot no local write refreshed, so it could clear unsynced edits without warning | Live pending count via `liveQuery` in `useSync`; sign-out recounts and clears in one transaction (`clearLocalDataUnlessPending`) (`9aeca7f`) |
| Important | Delete all, then importing your own backup, doubled the library: the post-wipe bootstrap re-seeds with new ids | `importBackup` retires unreferenced same-name local exercises (`0bc570f`), judged by the merge's winner (`7470ad0`) |
| Important | A delete-all failing part-way left the server half-deleted while every local row read as synced | On failure every row is marked dirty, so the next sync restores the server (`e91bd44`) |
| Minor | Copies of demo workouts carried the demo note and were removed with it (`4c67438`); demo weigh-ins collided with the user's own (`846f4c4`); a notification denial was cached for the process (`5d7fd2b`); rest-alert schedule and cancel were unordered (`4eb84dd`); export read tables outside a transaction (`23dab16`); a hung request held the sync lock (`59f5f27`, guarded for old WebViews in `851b638`); other devices after delete-all (wording, `341962b`) | — |

Final state: 510 tests in 53 files, stable across repeated runs; `tsc -b` clean; debug APK built from the repository with the fixes.
