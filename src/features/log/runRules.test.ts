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
