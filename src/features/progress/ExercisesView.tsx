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
