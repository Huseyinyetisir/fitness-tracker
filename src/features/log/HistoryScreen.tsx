import { routeHref, sessionRoute } from '../../app/routes';
import Loading from '../../components/Loading';
import ScreenHeader from '../../components/ScreenHeader';
import StatusBadge from '../../components/StatusBadge';
import { useLiveQuery } from '../../db/useLiveQuery';
import { weekdayStreak } from '../../lib/adherence';
import { formatDayShort, formatKg, formatKm, formatWeekRange } from '../../lib/format';
import { formatDuration, formatPace, paceSecondsPerKm } from '../../lib/running';
import { today } from '../../lib/time';
import { loadSessionCards } from './cards';
import { buildHistory, groupByWeek, heatmap, type HeatCell, type HistoryEntry } from './history';

const LEVEL_STYLE = ['border border-border', 'bg-accent/30', 'bg-accent/65', 'bg-accent'];
const LEVEL_LABEL = ['nothing', 'partial', 'done', 'two or more sessions'];

export default function HistoryScreen() {
  const todayDate = today();
  const cards = useLiveQuery(() => loadSessionCards('0000-01-01', todayDate), [todayDate]);

  if (!cards) return <Loading />;

  const entries = buildHistory(cards, todayDate);
  const grid = heatmap(
    cards.map((c) => c.session),
    todayDate,
  );
  const streak = weekdayStreak(
    cards.map((c) => ({ date: c.session.date, status: c.session.status, was_planned: c.session.was_planned })),
    todayDate,
  );
  const trainingDays = grid.flat().filter((c) => c.level > 0).length;

  return (
    <section>
      <ScreenHeader title="Log" />
      <div className="mb-4 grid grid-cols-2 gap-3">
        <Stat label="Weekday streak" value={String(streak)} />
        <Stat label="Training days, 12 weeks" value={String(trainingDays)} />
      </div>
      <Heatmap grid={grid} trainingDays={trainingDays} />

      {entries.length === 0 ? (
        <p className="mt-6 text-muted">Nothing logged yet. Finished sessions and runs appear here.</p>
      ) : (
        groupByWeek(entries).map((group) => (
          <div key={group.weekStart} className="mt-6">
            <h2 className="mb-2 text-sm text-muted">
              {formatWeekRange(group.weekStart)} · {group.entries.length}{' '}
              {group.entries.length === 1 ? 'session' : 'sessions'}
            </h2>
            <ul className="space-y-2">
              {group.entries.map((entry) => (
                <HistoryRow key={entry.session.id} entry={entry} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function Heatmap({ grid, trainingDays }: { grid: HeatCell[][]; trainingDays: number }) {
  return (
    <figure className="rounded-2xl border border-border bg-surface p-3">
      <figcaption className="mb-2 text-sm text-muted">Last 12 weeks, Monday at the top</figcaption>
      <div
        role="img"
        aria-label={`Last 12 weeks: ${trainingDays} training days`}
        className="grid grid-flow-col grid-rows-7 gap-1"
      >
        {grid.flat().map((cell) => (
          <span
            key={cell.date}
            title={`${formatDayShort(cell.date)}: ${LEVEL_LABEL[cell.level]}`}
            className={`aspect-square rounded-sm ${LEVEL_STYLE[cell.level]} ${cell.future ? 'opacity-25' : ''}`}
          />
        ))}
      </div>
    </figure>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { session, run } = entry;
  const detail = run
    ? `${formatKm(run.distance_km)} · ${formatDuration(run.duration_s)} · ${formatPace(paceSecondsPerKm(run.duration_s, run.distance_km))} /km · RPE ${run.rpe}`
    : entry.workingSets > 0
      ? `${entry.workingSets} sets · ${formatKg(entry.volumeKg)}${entry.avgRpe !== null ? ` · RPE ${entry.avgRpe.toFixed(1)}` : ''}`
      : 'Nothing logged';

  return (
    <li>
      <a
        href={routeHref(sessionRoute(session, 'log'))}
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-2"
      >
        <span className="w-12 shrink-0 text-sm text-muted">{formatDayShort(session.date)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{entry.title}</span>
          <span className="block truncate text-sm text-muted">{detail}</span>
        </span>
        <StatusBadge status={entry.state} />
      </a>
    </li>
  );
}
