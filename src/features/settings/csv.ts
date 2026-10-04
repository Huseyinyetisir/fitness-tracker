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
