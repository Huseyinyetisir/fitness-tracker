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
