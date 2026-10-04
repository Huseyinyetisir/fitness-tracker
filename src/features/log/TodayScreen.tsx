import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { routeHref, sessionRoute } from '../../app/routes';
import { navigate } from '../../app/useRoute';
import Button, { PRIMARY_LINK } from '../../components/Button';
import Loading from '../../components/Loading';
import PickList from '../../components/PickList';
import ScreenHeader from '../../components/ScreenHeader';
import StatusBadge from '../../components/StatusBadge';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatDateLong, formatKm } from '../../lib/format';
import { formatDuration, formatPace, paceSecondsPerKm } from '../../lib/running';
import { startOfWeek, today } from '../../lib/time';
import type { UUID } from '../../types/domain';
import { exerciseSummary } from '../library/exerciseRules';
import { materializeWeek } from '../plan/materialize';
import { loadSessionCards, type SessionCard } from './cards';
import { createSessionFromTemplate } from './sessionsRepo';

export default function TodayScreen() {
  const { userId } = useApp();
  const date = today();
  const [picking, setPicking] = useState<'run' | 'workout' | null>(null);

  useEffect(() => {
    void materializeWeek(userId, startOfWeek(date), date);
  }, [userId, date]);

  const cards = useLiveQuery(() => loadSessionCards(date, date), [date]);
  const options = useLiveQuery(
    async () => ({
      runs: (await db.exercises.where('modality').equals('cardio').toArray())
        .filter((e) => e._deleted === 0)
        .sort((a, b) => a.sort_order - b.sort_order),
      workouts: (await db.workout_templates.where('_deleted').equals(0).toArray()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }),
    [],
  );

  async function startWorkout(templateId: UUID | null) {
    const session = await createSessionFromTemplate(date, templateId, { wasPlanned: false });
    navigate({ name: 'session', id: session.id });
  }

  return (
    <section>
      <ScreenHeader title="Today" />
      <p className="-mt-3 mb-4 text-muted">{formatDateLong(date)}</p>

      {cards === undefined ? (
        <Loading />
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="font-medium">Rest day</p>
          <p className="text-sm text-muted">Nothing planned. Log something anyway, or enjoy the rest.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {cards.map((card) => (
            <TodayCard key={card.session.id} card={card} />
          ))}
        </ul>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button onClick={() => setPicking(picking === 'run' ? null : 'run')}>Log a run</Button>
        <Button onClick={() => setPicking(picking === 'workout' ? null : 'workout')}>Log a workout</Button>
      </div>

      {picking === 'run' && (
        <div className="mt-3">
          <PickList
            items={(options?.runs ?? []).map((e) => ({ id: e.id, label: e.name, detail: exerciseSummary(e) }))}
            onPick={(exerciseId) => navigate({ name: 'run-new', exerciseId, date })}
            empty="No run types in your library."
          />
        </div>
      )}

      {picking === 'workout' && (
        <div className="mt-3">
          <PickList
            items={[
              { id: '', label: 'Empty workout', detail: 'Add exercises as you go' },
              ...(options?.workouts ?? []).map((t) => ({ id: t.id, label: t.name })),
            ]}
            onPick={(id) => void startWorkout(id || null)}
          />
        </div>
      )}
    </section>
  );
}

function TodayCard({ card }: { card: SessionCard }) {
  const { session, run } = card;
  const action =
    session.status !== 'planned' ? 'Open' : card.workingSets > 0 || run ? 'Continue' : 'Start';
  const detail =
    session.kind === 'run'
      ? run
        ? `${formatKm(run.distance_km)} · ${formatDuration(run.duration_s)} · ${formatPace(paceSecondsPerKm(run.duration_s, run.distance_km))} /km`
        : 'Not logged yet'
      : `${card.workingSets} of ${card.targetSets} sets`;

  return (
    <li className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-lg font-semibold">{card.title}</p>
          <p className="text-sm text-muted">{detail}</p>
        </div>
        <StatusBadge status={session.status} />
      </div>
      <a href={routeHref(sessionRoute(session))} className={`mt-3 ${PRIMARY_LINK}`}>
        {action}
      </a>
    </li>
  );
}
