import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { routeHref, sessionRoute } from '../../app/routes';
import Button, { IconButton, ROW_LINK } from '../../components/Button';
import Loading from '../../components/Loading';
import PickList from '../../components/PickList';
import ScreenHeader from '../../components/ScreenHeader';
import StatusBadge from '../../components/StatusBadge';
import { db } from '../../db/schema';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatDayShort, formatWeekRange } from '../../lib/format';
import { addDays, eachDateInRange, startOfWeek, today } from '../../lib/time';
import type { ISODate } from '../../types/domain';
import { loadSessionCards, type SessionCard } from '../log/cards';
import { createSessionFromTemplate, removeSession } from '../log/sessionsRepo';
import { materializeWeek } from './materialize';

export default function WeekView({ week }: { week?: ISODate }) {
  const { userId } = useApp();
  const todayDate = today();
  const weekStart = startOfWeek(week ?? todayDate);
  const weekEnd = addDays(weekStart, 6);
  const [addingTo, setAddingTo] = useState<ISODate | null>(null);

  useEffect(() => {
    void materializeWeek(userId, weekStart, todayDate);
  }, [userId, weekStart, todayDate]);

  const cards = useLiveQuery(() => loadSessionCards(weekStart, weekEnd), [weekStart, weekEnd]);
  const templates = useLiveQuery(
    async () =>
      (await db.workout_templates.where('_deleted').equals(0).toArray()).sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  return (
    <section>
      <ScreenHeader title="Plan" />
      <div className="mb-3 flex items-center justify-between">
        <a href={routeHref({ name: 'plan', week: addDays(weekStart, -7) })} aria-label="Previous week" className="grid size-12 place-items-center text-2xl">
          ‹
        </a>
        <h2 className="font-medium">{formatWeekRange(weekStart)}</h2>
        <a href={routeHref({ name: 'plan', week: addDays(weekStart, 7) })} aria-label="Next week" className="grid size-12 place-items-center text-2xl">
          ›
        </a>
      </div>

      {!cards ? (
        <Loading />
      ) : (
        <ul className="space-y-2">
          {eachDateInRange(weekStart, weekEnd).map((date) => (
            <DayRow
              key={date}
              date={date}
              isToday={date === todayDate}
              cards={cards.filter((c) => c.session.date === date)}
              onAdd={() => setAddingTo(date)}
            />
          ))}
        </ul>
      )}

      {addingTo && (
        <div className="mt-4 space-y-2">
          <h3 className="font-medium">Add to {formatDayShort(addingTo)}</h3>
          <PickList
            items={(templates ?? []).map((t) => ({ id: t.id, label: t.name }))}
            onPick={async (templateId) => {
              await createSessionFromTemplate(addingTo, templateId, { wasPlanned: true });
              setAddingTo(null);
            }}
            empty="Create a workout first."
          />
          <Button variant="ghost" onClick={() => setAddingTo(null)}>
            Cancel
          </Button>
        </div>
      )}

      <nav className="mt-6 grid gap-2">
        <a href={routeHref({ name: 'plan-days' })} className={ROW_LINK}>
          Weekly template <span aria-hidden>›</span>
        </a>
        <a href={routeHref({ name: 'workouts' })} className={ROW_LINK}>
          Workouts <span aria-hidden>›</span>
        </a>
        <a href={routeHref({ name: 'library' })} className={ROW_LINK}>
          Exercise library <span aria-hidden>›</span>
        </a>
      </nav>
    </section>
  );
}

function DayRow({
  date,
  isToday,
  cards,
  onAdd,
}: {
  date: ISODate;
  isToday: boolean;
  cards: SessionCard[];
  onAdd: () => void;
}) {
  return (
    <li className={`rounded-2xl border bg-surface p-3 ${isToday ? 'border-accent' : 'border-border'}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {formatDayShort(date)}
          {isToday && <span className="ml-2 text-xs text-accent">Today</span>}
        </span>
        <IconButton label={`Add a session on ${formatDayShort(date)}`} onClick={onAdd}>
          +
        </IconButton>
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-muted">Rest</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {cards.map((card) => (
            <SessionChip key={card.session.id} card={card} />
          ))}
        </ul>
      )}
    </li>
  );
}

function SessionChip({ card }: { card: SessionCard }) {
  const removable = card.session.status === 'planned' && card.workingSets === 0 && !card.run;
  return (
    <li className="flex items-center gap-2">
      <a href={routeHref(sessionRoute(card.session))} className="flex min-h-12 flex-1 items-center gap-2">
        <span className="flex-1">{card.title}</span>
        <StatusBadge status={card.session.status} />
      </a>
      {removable && (
        <IconButton
          label={`Remove ${card.title}`}
          onClick={() => {
            if (window.confirm(`Remove ${card.title} from this day?`)) void removeSession(card.session.id);
          }}
        >
          ✕
        </IconButton>
      )}
    </li>
  );
}
