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
