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
