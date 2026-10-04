import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import type { Route } from '../../app/routes';
import { navigate } from '../../app/useRoute';
import { useSingleFlight } from '../../app/useSingleFlight';
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
  const adding = useSingleFlight();
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
          onPick={(exercise) =>
            adding.run(async () => {
              await addExerciseToSession(id, exercise);
              setIndex(view.blocks.length);
              setMode('log');
            })
          }
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
