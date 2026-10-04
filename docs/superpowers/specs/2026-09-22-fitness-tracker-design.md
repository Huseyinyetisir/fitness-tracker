# Fit Tracker — Design Spec

**Date:** 2026-09-22
**Status:** Approved, ready for implementation planning

## 1. Purpose

A single-user fitness tracker for planning and logging weekday strength training and 1–3 weekly runs, with RPE on every set and run, and progress charts. Runs as an Android app installed from a locally built APK, and as a plain web app for development.

**Hard constraint:** zero cost. No service that requires a credit card or payment at any point. No Play Store, no EAS, no paid build or hosting service.

### Success criteria

- A full session can be logged one-handed, in the gym, with no network, and reaches Supabase later without loss.
- Every set and every run carries an RPE; the app does not accept a set without one.
- Progress charts answer: am I getting stronger, am I running more, and am I accumulating fatigue.
- All data can be exported and re-imported without going through any server.

## 2. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Plan model | Recurring weekly template + materialized dated rows | Past weeks stay historically accurate after the template changes; adherence does not rewrite itself |
| Auth | Email + password, single account | Identical in web and APK, no deep-link configuration, works without waiting on an email |
| v1 scope | Full brief, built in phases | Usable app from the logging phase onward; ergonomics get real-world feedback early |
| Sync | Dirty-flag push + watermark pull, row-level last-write-wins | Merge reduces to a pure function; smallest code and test surface that is actually correct |
| Derived data | Computed, never stored | Nothing derived can go stale or conflict during sync |

### Rejected alternatives

- **Operation-log sync.** Better conflict resolution and true multi-device, at roughly 3× the code and test surface. One user with one phone gains nothing observable.
- **Supabase Realtime.** Free-tier capable, but a websocket is useless without signal and does not remove the need for catch-up sync. Can be layered on later with no rework.
- **Pure recurring template (no materialization).** Simplest schema, but editing the template retroactively rewrites past adherence and cannot represent "this Tuesday I swapped legs for a run".

## 3. Architecture

```
React UI  ──writes──▶  Dexie (IndexedDB)  ──push/pull──▶  Supabase Postgres
   ▲                        │                                    (RLS)
   └────reads───────────────┘
```

Every write goes to Dexie first and is marked `_dirty`. The UI reads only from Dexie, so it behaves identically online and offline. The sync layer is a background process that pushes dirty rows and pulls remote changes; it is never in the path of a user action.

Derived values (e1RM, volume, PRs, streak, adherence, RPE aggregates) are computed in `/lib` as pure functions over Dexie rows. They are not stored and not synced.

## 4. Data model

Every synced table carries this common block:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | Client-generated at insert time |
| `user_id` | uuid | FK to `auth.users`, defaults to `auth.uid()` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | **Client-set.** The last-write-wins comparand |
| `server_updated_at` | timestamptz | **Trigger-set.** The pull watermark only |
| `deleted_at` | timestamptz | Soft delete; the app never hard-deletes |

Two timestamps, not one. If a single client-set timestamp served as both the LWW comparand and the pull watermark, a phone with a fast clock could write a row whose timestamp is already behind the watermark, and that row would silently never pull down again. Splitting the two costs one trigger and eliminates the class of bug.

### Library and planning

- **`exercises`** — `name`, `muscle_group`, `modality` (`strength` | `cardio`), `run_type` (`easy` | `tempo` | `intervals` | `long`, cardio only), `default_sets`, `default_reps`, `default_weight_kg`, `default_duration_s`, `default_distance_km`, `sort_order`. Seeded with 47 strength exercises plus the four run types.

  Seeding runs only after a sync has completed, never merely because the local table is empty. An empty table is also what a fresh install, cleared storage, or a second device looks like; seeding then mints new UUIDs for exercises that already exist on the server, and since rows are soft-delete-only those duplicates can never be cleanly removed.
- **`workout_templates`** — `name`, `notes`. A run day is a template containing a single cardio item, which keeps planning uniform across strength and running.
- **`workout_template_items`** — `template_id`, `exercise_id`, `position`, `target_sets`, `target_reps`, `target_weight_kg`, `target_duration_s`, `target_distance_km`, `target_rpe`, `rest_seconds`, `notes`.
- **`week_plans`** — `name` (a training block), `active_from`.
- **`week_plan_days`** — `week_plan_id`, `weekday` (1 = Monday … 7 = Sunday), `template_id` (null = rest day).

### Logging

Planned and logged sessions share one table. This is what makes adherence honest: there is no way for a plan row and its session to disagree about whether they are the same thing.

- **`sessions`** — `date`, `kind` (`strength` | `run` | `mixed`), `status` (`planned` | `done` | `partial` | `skipped`), `template_id`, `was_planned`, `energy` (1–5), `notes`, `started_at`, `completed_at`.

  Opening a week materializes `planned` rows for its seven dates from the active template. Editing one of those rows is the dated override. Logging flips its status. An unplanned session inserts directly with `status = 'done'`, `was_planned = false`.

- **`session_exercises`** — `session_id`, `exercise_id`, `position`, `notes`, and a snapshot of `target_sets` / `target_reps` / `target_weight_kg` taken at materialization time.
- **`set_entries`** — `session_exercise_id`, `set_index`, `reps`, `weight_kg`, `rpe` (**required**, 1–10, half steps), `is_warmup`, `notes`.
- **`runs`** — `session_id`, `exercise_id`, `run_type`, `distance_km`, `duration_s`, `rpe` (**required**), `avg_hr`, `weather`, `route_note`. Pace is derived, never stored.
- **`run_splits`** — `run_id`, `split_index`, `distance_km`, `duration_s`.
- **`body_metrics`** — `date`, `weight_kg`, `resting_hr`, `note`.
- **`user_prefs`** — single row: `rest_seconds_default`, `vibration`, `theme`.

### Local-only Dexie tables

Never pushed to Supabase:

- **`sync_meta`** — per-table pull watermark, last successful sync time, last error.
- `_dirty` (`0 | 1`) and `_deleted` (`0 | 1`) are indexed on every synced Dexie table, both stripped before push. They are `0 | 1` rather than booleans because IndexedDB cannot index a boolean and cannot key on `null` — so `deleted_at` itself is unqueryable, and `_deleted` mirrors it.

## 5. Supabase schema

```sql
create function touch_server_updated_at() returns trigger as $$
begin
  new.server_updated_at := now();
  new.user_id := coalesce(new.user_id, auth.uid());
  return new;
end $$ language plpgsql;
-- attached before insert or update on every table
```

The trigger deliberately does not touch `updated_at`. The client owns that value, which is what makes last-write-wins deterministic for rows written while offline.

Table-specific columns beyond the common block:

| Table | Columns |
|---|---|
| `exercises` | `name text not null`, `muscle_group text`, `modality text check (modality in ('strength','cardio'))`, `run_type text`, `default_sets int`, `default_reps int`, `default_weight_kg numeric(6,2)`, `default_duration_s int`, `default_distance_km numeric(6,2)`, `sort_order int` |
| `workout_templates` | `name text not null`, `notes text` |
| `workout_template_items` | `template_id uuid`, `exercise_id uuid`, `position int`, `target_sets int`, `target_reps int`, `target_weight_kg numeric(6,2)`, `target_duration_s int`, `target_distance_km numeric(6,2)`, `target_rpe numeric(3,1)`, `rest_seconds int`, `notes text` |
| `week_plans` | `name text not null`, `active_from date not null` |
| `week_plan_days` | `week_plan_id uuid`, `weekday int check (weekday between 1 and 7)`, `template_id uuid` |
| `sessions` | `date date not null`, `kind text`, `status text check (status in ('planned','done','partial','skipped'))`, `template_id uuid`, `was_planned bool default true`, `energy int check (energy between 1 and 5)`, `notes text`, `started_at timestamptz`, `completed_at timestamptz` |
| `session_exercises` | `session_id uuid`, `exercise_id uuid`, `position int`, `notes text`, `target_sets int`, `target_reps int`, `target_weight_kg numeric(6,2)` |
| `set_entries` | `session_exercise_id uuid`, `set_index int`, `reps int`, `weight_kg numeric(6,2)`, `rpe numeric(3,1) not null check (rpe between 1 and 10)`, `is_warmup bool default false`, `notes text` |
| `runs` | `session_id uuid`, `exercise_id uuid`, `run_type text`, `distance_km numeric(6,2)`, `duration_s int`, `rpe numeric(3,1) not null check (rpe between 1 and 10)`, `avg_hr int`, `weather text`, `route_note text` |
| `run_splits` | `run_id uuid`, `split_index int`, `distance_km numeric(6,2)`, `duration_s int` |
| `body_metrics` | `date date not null`, `weight_kg numeric(5,2)`, `resting_hr int`, `note text` |
| `user_prefs` | `rest_seconds_default int default 120`, `vibration bool default true`, `theme text default 'dark'` |

Foreign keys between app tables are declared **without** `on delete cascade`. Soft delete is the only delete path the app uses; a cascade would silently erase rows that the sync layer still needs to propagate as tombstones.

**Indexes:** `(user_id, server_updated_at)` on every table, for the pull query. Additionally `(user_id, date)` on `sessions` and `body_metrics`, and `(session_exercise_id)` on `set_entries`.

Migrations are numbered SQL files in `/supabase/migrations`, applied by hand in the Supabase SQL editor, in order: `0001_init.sql`, `0002_rls.sql`, `0003_reject_stale_writes.sql`. No CLI link, no account upgrade, nothing that asks for a card.

## 6. Row Level Security

Applied identically to all twelve tables:

```sql
alter table <t> enable row level security;

create policy "own_select" on <t> for select using (auth.uid() = user_id);
create policy "own_insert" on <t> for insert with check (auth.uid() = user_id);
create policy "own_update" on <t> for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_delete" on <t> for delete using (auth.uid() = user_id);

revoke all on <t> from anon;
```

Three points matter as much as the policies:

1. **`revoke all ... from anon`.** The anon key ships inside the APK and is extractable by anyone holding the file. RLS is what actually protects the data; removing the anon role's grants is the second layer.
2. **The `with check` clause on update is not optional.** Without it, a row's `user_id` can be reassigned to another account.
3. **Disable open signups** in Supabase Auth once the single account exists (Auth → Providers → turn off "Allow new users to sign up"). Otherwise anyone with the extracted anon key can create accounts on the project. They still could not read any rows, but they could exhaust the free tier — denial of service by quota.

The `delete` policy exists solely for the Settings → "Delete all data" action. Normal operation only ever sets `deleted_at`.

## 7. Sync layer

### Push

1. Collect rows where `_dirty = 1`, grouped by table.
2. Upsert them in foreign-key-safe order:
   `exercises → workout_templates → workout_template_items → week_plans → week_plan_days → sessions → session_exercises → set_entries → runs → run_splits → body_metrics → user_prefs`
3. On success, clear `_dirty` — but only for rows whose `updated_at` still matches what was uploaded. A write landing during the upsert's network round trip bumps `updated_at`, and clearing it unconditionally would mark an unsent edit as synced. Sync fires on `visibilitychange`, i.e. exactly when the user returns to the app and logs a set, so this window is reachable in ordinary use.

Tombstones push like any other row — a soft-deleted row is a normal update with `deleted_at` set.

### Pull

For each table, in the same order:

```sql
select * from <t>
where server_updated_at >= :watermark
order by server_updated_at
```

`>=` rather than `>`, because two rows can share a `server_updated_at` value and a strict comparison would drop the ones written after the watermark was recorded. Re-applying a row is idempotent, so the overlap is harmless. The watermark advances to the maximum `server_updated_at` in the received batch, and only after that batch has been applied.

### Merge

```
mergeRow(local, remote):
  local missing           -> take remote, _dirty = 0
  remote missing          -> keep local
  remote newer            -> take remote, _dirty = 0
  local newer             -> keep local, _dirty = 1   (server is behind)
  same instant            -> take remote, _dirty = 0
```

The tie resolves to the server so repeated syncs converge rather than oscillating. The local-wins branch sets `_dirty = 1` even when the row was clean: a clean row newer than the server would otherwise never be pushed again, and the two sides would stay diverged permanently.

Comparison is on parsed epoch milliseconds, not raw strings. The client writes `Date#toISOString` (`…00.000Z`) while PostgREST returns `…00+00:00`, dropping a zero fraction and using an offset rather than `Z`; those two renderings of one instant do not sort against each other.

`updated_at` is not merely a timestamp — it is the version token that this comparison and the push path both depend on — so the clock producing it is forced to increase strictly within a session. At `Date.now()`'s 1 ms resolution, two writes in the same millisecond share a token and become indistinguishable to both consumers.

### Server-side enforcement

Push has no pre-read: it upserts every dirty row and lets the database settle ordering. Last-write-wins is therefore also enforced by a trigger, which rejects an update carrying an older `updated_at` by rewriting the row with its existing values and a fresh `server_updated_at`. Without it, a device that has been offline overwrites a newer row and that logged session is gone. Rewriting rather than skipping is deliberate: the stale pusher cleared its dirty flag on the success response, so it only learns it lost by pulling the row back — and it only pulls rows at or beyond its watermark.

### Triggers and status

Sync runs on mount, on app foreground, on regaining connectivity, after a session is completed, and on the manual "sync now" button. The lifecycle lives in an app-level hook, not in the status widget: sync must keep running on screens where that widget is not mounted, and `visibilitychange` does not fire on initial load. Re-entry is guarded by a ref rather than React state, since two events in the same tick both read the same stale value. The Settings screen and a small header indicator show one of: synced (with last-synced time), pending *n* changes, syncing, offline, or error with the message.

## 8. Calculations

All pure functions in `/lib`, all unit-tested.

| Quantity | Definition |
|---|---|
| Estimated 1RM | Epley: `weight × (1 + reps / 30)`. Working sets only |
| Volume | `Σ (reps × weight_kg)` over working sets; warm-ups excluded |
| Pace | `duration_s / distance_km`, displayed as `m:ss /km` |
| PR | Both: (a) best e1RM per exercise, and (b) best weight for each rep count 1–12. Working sets only |
| Adherence | `(done + partial) / total planned` over the selected range |
| Streak | Consecutive weekday (Mon–Fri) mornings with a session in `done` or `partial`. Weekends are neutral — they neither extend nor break it |
| Session RPE | Mean RPE across working sets, or the run's RPE for a run session |
| Fatigue flag | Per exercise, trailing 2 weeks vs. the prior 2 weeks: raised when mean RPE increases by ≥ 0.5 while mean top-set load is flat (≤ +1% change). Never raised when the prior window's mean load is 0 — bodyweight work has no baseline, so "did load stay flat" has no answer, and treating it as flat fires on every RPE rise |

Range filters throughout Progress: 4w, 12w, 6m, all.

## 9. Screens

| Tab | Screen | Notes |
|---|---|---|
| — | Sign in | Email + password; shown only when no cached session exists |
| **Today** | Today | Planned session card, tap to start; quick actions for logging a run or an unplanned session |
| | Session logger | Full-screen, one exercise at a time. Set rows are reps / weight / RPE. Thumb-reachable RPE selector with half steps, "same as last set", rest timer with vibration |
| | Run logger | Distance, duration, RPE, optional avg HR, manual splits, weather and route note; live pace readout |
| **Plan** | Week view | Mon–Sun materialized rows; edit a single day without touching the template |
| | Template editor | Weekday → workout template mapping |
| | Workout editor | Ordered items, reorder, duplicate, targets, rest |
| | Exercise library | Seeded list, add / edit / soft-delete, search, filter by muscle group |
| **Progress** | Strength | Weekly volume, sessions per week, adherence % |
| | Exercise detail | e1RM trend with PR markers, best set, per-exercise volume and RPE |
| | RPE | Average RPE over time, volume-vs-RPE scatter, fatigue-flag banner |
| | Running | Weekly km, pace trend per run type, longest run, monthly totals, pace vs RPE |
| | Body | Weight and resting HR line charts |
| **Log** | History | Reverse-chronological sessions, 12-week calendar heatmap, weekday streak |
| | Session detail | View and edit any past session |
| **Settings** | Settings | Sync status, "sync now", last-synced time, export JSON/CSV, import/merge JSON, rest timer defaults, load demo data, delete all data, sign out |

The exercise library sits under Plan rather than taking a sixth bottom-tab slot; five tabs is already the practical limit for thumb targets.

### UX conventions

English UI. kg, km, 24-hour clock, week starts Monday. Dark mode by default. Safe-area insets respected. `prefers-reduced-motion` honoured. Accessible labels on all controls. Tap targets sized for one-handed use during a set.

## 10. Export, import, and data safety

- **Export JSON** — every table including tombstones, with a format version and the account's user id. This is a complete, restorable backup. Every row carries exactly its table's columns; a compile-time check fails the build if a domain type gains a column the backup would miss.
- **Export CSV** — three files for spreadsheets: sets, runs and body entries, one row each, joined with dates, workout and exercise names, and derived e1RM and pace. Raw tables full of ids are no use in a spreadsheet, and the JSON backup is the restore path, so CSV is not one.
- **Import / merge JSON** — validated first: a row missing any column of its table is refused, since one bad row would stall every later push. Rows then match on `id` and the newer `updated_at` wins, as in sync, so importing an older export cannot clobber newer data. A row the import wins is queued for push. An unreferenced local exercise with the same name as one in the backup is retired first, so importing after "Delete all" (which re-seeds the library) does not double it.
- **Restore into another account** — a backup whose user id differs (a new Supabase project means a new account) first deletes everything in the current account, then imports a re-keyed copy: every row gets a new id, since ids are global in the database; rows derived by name (preferences, the default plan and its days, planned sessions) get the ids this account derives; untouched planned sessions from today on are dropped and re-materialized. Behind a typed confirmation.
- **Delete all data** — hard deletes on the server, children before parents (no cascade), then clears the device including sync bookkeeping, behind a typed confirmation. The next sync sets the library, plan and preferences up afresh. Other signed-in devices should sign out first: a hard delete leaves no tombstone to sync, so they keep their copy and could upload it again. If a server delete fails part-way, every local row is queued for upload again, so the next sync makes the server whole before the delete is retried.
- **Sign out** clears the device, so rows can never be pushed under whichever account signs in next. Unsynced changes are counted in the same transaction as the clear — not taken from the sync status, which can lag a local write — and reported instead of lost.
- **Demo data** — twelve weeks of plausible training, each row marked with the note "Demo data", removable in one action without touching real entries.
- Wiping, restoring and signing out run under the same lock as sync, so a sync can never push rows back mid-wipe.
- Supabase is the off-device backup. Note that **free-tier projects pause after about 7 days of inactivity**; daily use prevents this, but after a long break the first sync may need the project resumed from the dashboard.

On Android, exports are written to the app cache with `@capacitor/filesystem` and handed to the share sheet with `@capacitor/share`; a download link does nothing inside the WebView. Import uses a file input, which the WebView serves with the system file picker.

## 11. Testing

Vitest, covering the pure logic where the real risk lives:

- Epley e1RM, including zero and one-rep edges
- Pace calculation and `m:ss` formatting
- Volume, with warm-up exclusion
- Streak across weekends, gaps, and partial sessions
- Adherence across ranges with skipped and unplanned sessions
- PR detection, both e1RM and per-rep-count
- RPE aggregates: per session, per exercise over time
- Fatigue flag: fires on rising RPE at flat load, does not fire on rising load
- `mergeRow`: all five branches, including the tie
- Push ordering and watermark advance, including the `>=` overlap
- Tombstone propagation in both directions
- Import/merge dedupe by `id`

UI is verified by running the app after each phase, not by component tests.

## 12. Project structure

```
/src
  /features
    /plan       /log       /progress    /library    /settings
  /db           Dexie schema, migrations, typed tables
  /sync         push, pull, mergeRow, status
  /supabase     client, generated types
  /lib          pure calculations
  /components   shared UI
/supabase
  /migrations   numbered SQL files
  policies.sql  RLS reference
/docs/superpowers/specs
```

Domain types live in one place and are shared by Dexie, the Supabase client, and the UI.

## 13. Configuration

```
# .env  (gitignored)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

`.env.example` is committed with empty values. The anon key is public by design — it ships in the APK — but it is still kept out of git so the repository does not identify the project. RLS and disabled signups are what protect the data.

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

## 15. Build order

Each phase ends with the app running and a short note on what to check.

1. Domain model + Dexie schema + seed data + calculation tests
2. Supabase schema, RLS, auth
3. Sync layer + sync tests
4. Plan: week view, template editor, workout editor, exercise library
5. Today + session logging + run logging + rest timer
6. Log history, session detail and editing
7. Progress charts
8. Export / import
9. Capacitor Android build and install

## 16. Out of scope

GPS route tracking. Strava, Garmin, or Health Connect import. Multiple users or sharing. Play Store distribution. Push notifications. Wearable companion. Realtime sync. Server-side computation of any kind.

## 17. Derived rows: system writes and deterministic ids

Some rows are derived by the app rather than typed by the user: the default week plan and its seven days, the preference row, and the planned sessions materialized from the weekly template, with their exercises.

- **Deterministic ids.** These rows get UUIDv5 ids derived from stable names (`<userId>:planned:<date>`), so every device creates the same row instead of a duplicate. The SHA-1 behind them is synchronous: awaiting `crypto.subtle` inside a Dexie transaction commits the transaction early.
- **System writes.** They are stamped with `systemISO()` — wall-clock time minus fifty years, strictly increasing. Every genuine user edit outranks every system write in last-write-wins, including the server's stale-write guard, so a fresh install materializing a week can never overwrite a session logged on another device.
- **Ownership.** A session is the user's once it carries a real timestamp: started, edited, noted, finished or removed. Any user write into it — a set, an added or removed exercise, a note, a saved run, a finish — claims it, and the claim re-stamps the session's exercises too. Claiming only the session row is not enough: a device that has not yet seen the claim can still rewrite the session from the plan, and the server rejects that for the session but would accept it for exercises still carrying a system stamp, deleting the ones logged into. Under a session the user owns, a live system-stamped exercise with no sets can only have been injected by such a device, so materialization removes it; an exercise with a logged set is never removed.
- **Materialization rules** live in one pure function, `decide()`: insert what is missing **from today forward**; revive a row the app removed when its day is planned again; rewrite or remove untouched future rows when the template, its exercises or its kind change; otherwise leave it. Past dates are never inserted: doing so would apply today's template to days that were rest days at the time, and history would read them as missed. The cost is leniency — a week in which the app was never opened is not counted against adherence.
- **A plan starts on the day it is created**, not on that week's Monday, so days before it existed are never planned.

Schema version 2 adds an `exercise_id` index on `session_exercises` for "last time". Versions are only ever added, never edited: devices hold real version 1 databases.

## 18. Progress, as built

- **Views:** Strength (adherence, sessions, weekly volume, sessions per week), Exercises (every lifted exercise, then per exercise: e1RM with PR markers, best set, volume, RPE, rep maxes), RPE (fatigue banner, weekly session RPE, volume against RPE), Running (distance, runs, longest, weekly distance, pace per run type, monthly distance, pace against RPE), Body (weight and resting heart rate, with entry).
- **Ranges** are whole Monday-start weeks ending with the current one — 4, 12 and 26 weeks — or everything, from the week of the earliest data. View and range live in the route and are replaced, not pushed, when changed.
- **PRs are judged against all history**, whatever range is shown; a session's first appearance is never a PR, having nothing to beat. Warm-ups never count.
- **Adherence** counts planned sessions up to today; today's counts only once finished.
- **Body entries:** one per day, so each chart is a single line.
- The charts library loads only when Progress opens, keeping it out of the startup path of the screens used in the gym.
