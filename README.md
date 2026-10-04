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
