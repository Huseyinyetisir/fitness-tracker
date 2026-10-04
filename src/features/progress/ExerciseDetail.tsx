import { BarSeriesChart, ChartCard, LineSeriesChart } from '../../components/charts';
import Loading from '../../components/Loading';
import NotFound from '../../components/NotFound';
import ScreenHeader from '../../components/ScreenHeader';
import Stat from '../../components/Stat';
import { useLiveQuery } from '../../db/useLiveQuery';
import { formatKg, formatNumber, formatShortDate } from '../../lib/format';
import { DEFAULT_RANGE, inRange, rangeStart, type RangeKey } from '../../lib/ranges';
import { today } from '../../lib/time';
import type { UUID } from '../../types/domain';
import { loadProgressData } from './progressData';
import { RangePicker } from './ProgressNav';
import { bestSet, exerciseDays, repMaxTable } from './strengthStats';

export default function ExerciseDetail({ id, range = DEFAULT_RANGE }: { id: UUID; range?: RangeKey }) {
  const todayDate = today();
  const data = useLiveQuery(() => loadProgressData(todayDate), [todayDate]);
  const back = { name: 'progress', view: 'exercises', range } as const;

  if (!data) return <Loading />;
  const exercise = data.exercises.find((e) => e.id === id);
  const allDays = exerciseDays(data.lifts, id);
  if (!exercise && allDays.length === 0) return <NotFound what="exercise" back={back} />;

  const start = rangeStart(range, todayDate, data.earliest);
  const days = allDays.filter((d) => inRange(d.date, start, todayDate));
  const best = bestSet(data.lifts, id);
  const repMaxes = repMaxTable(data.lifts, id);
  const loaded = (best?.e1rm ?? 0) > 0;
  const prs = days.filter((d) => d.pr).length;
  const empty = days.length === 0 ? 'Not trained in this range.' : null;

  return (
    <section>
      <ScreenHeader title={exercise?.name ?? 'Exercise'} back={back} />
      <RangePicker value={range} route={(r) => ({ name: 'progress-exercise', id, range: r })} />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Best e1RM, all time" value={loaded && best ? formatKg(Math.round(best.e1rm)) : '—'} />
          <Stat
            label={best ? `Best set · ${formatShortDate(best.date)} · RPE ${best.rpe}` : 'Best set'}
            value={best ? `${formatNumber(best.weight_kg, best.weight_kg % 1 ? 2 : 0)} × ${best.reps}` : '—'}
          />
        </div>

        {loaded ? (
          <ChartCard
            title="Estimated 1RM"
            summary={`Estimated one-rep max over ${days.length} sessions, with ${prs} personal records marked.`}
            empty={empty}
          >
            <LineSeriesChart
              data={days}
              xKey="date"
              xFormat={formatShortDate}
              series={[{ key: 'e1rm', name: 'e1RM' }]}
              yFormat={(v) => formatNumber(v)}
              highlightKey="pr"
            />
            <p className="mt-2 text-xs text-muted">
              <span aria-hidden className="mr-1 inline-block size-2.5 rounded-full bg-[#f5a524]" />
              New e1RM record
            </p>
          </ChartCard>
        ) : (
          <p className="text-sm text-muted">A bodyweight exercise has no estimated 1RM; its reps and RPE are below.</p>
        )}

        <ChartCard title="Volume per session" summary={`Volume across ${days.length} sessions.`} empty={loaded ? empty : 'Bodyweight sets add no volume.'}>
          <BarSeriesChart
            data={days}
            xKey="date"
            xFormat={formatShortDate}
            series={[{ key: 'volume', name: 'Volume' }]}
            yFormat={(v) => formatNumber(v)}
          />
        </ChartCard>

        <ChartCard title="Average RPE per session" summary={`Average set RPE across ${days.length} sessions.`} empty={empty}>
          <LineSeriesChart
            data={days}
            xKey="date"
            xFormat={formatShortDate}
            series={[{ key: 'rpe', name: 'RPE' }]}
            yFormat={(v) => formatNumber(v, 1)}
          />
        </ChartCard>

        {repMaxes.length > 0 && (
          <div className="rounded-2xl border border-border bg-surface p-3">
            <h2 className="mb-2 text-sm font-medium">Rep maxes, all time</h2>
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-muted">
                <tr>
                  <th className="py-1 font-normal">Reps</th>
                  <th className="py-1 font-normal">Best weight</th>
                  <th className="py-1 text-right font-normal">Date</th>
                </tr>
              </thead>
              <tbody>
                {repMaxes.map((r) => (
                  <tr key={r.reps} className="border-t border-border">
                    <td className="py-1.5">{r.reps}</td>
                    <td className="py-1.5">{formatKg(r.weight_kg)}</td>
                    <td className="py-1.5 text-right text-muted">{formatShortDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
