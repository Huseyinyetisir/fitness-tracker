import { BarSeriesChart, ChartCard } from '../../components/charts';
import Stat from '../../components/Stat';
import { formatKg, formatNumber, formatShortDate } from '../../lib/format';
import type { ViewProps } from './ProgressScreen';
import { adherenceInRange, weeklySessions, weeklyVolume } from './strengthStats';

export default function StrengthView({ data, start, todayDate }: ViewProps) {
  const volume = weeklyVolume(data.lifts, start, todayDate);
  const sessions = weeklySessions(data.sessions, start, todayDate);
  const adherence = adherenceInRange(data.sessions, start, todayDate);
  const totalVolume = volume.reduce((sum, w) => sum + w.volume, 0);
  const totalSessions = sessions.reduce((sum, w) => sum + w.strength + w.runs, 0);
  const weeks = volume.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label={adherence.planned > 0 ? `Adherence · ${adherence.completed} of ${adherence.planned}` : 'Adherence'}
          value={adherence.planned > 0 ? `${Math.round(adherence.pct)}%` : '—'}
        />
        <Stat label="Sessions done" value={String(totalSessions)} />
        <Stat label="Volume, tonnes" value={formatNumber(totalVolume / 1000, 1)} />
      </div>

      <ChartCard
        title="Weekly volume"
        summary={`Weekly volume over ${weeks} weeks, ${formatKg(totalVolume)} in total; latest week ${formatKg(volume.at(-1)?.volume ?? 0)}.`}
        empty={totalVolume === 0 ? 'No sets logged in this range yet.' : null}
      >
        <BarSeriesChart
          data={volume}
          xKey="week"
          xFormat={formatShortDate}
          series={[{ key: 'volume', name: 'Volume' }]}
          yFormat={(v) => formatNumber(v)}
        />
      </ChartCard>

      <ChartCard
        title="Sessions per week"
        summary={`${totalSessions} sessions done over ${weeks} weeks.`}
        empty={totalSessions === 0 ? 'No finished sessions in this range yet.' : null}
      >
        <BarSeriesChart
          data={sessions}
          xKey="week"
          xFormat={formatShortDate}
          series={[
            { key: 'strength', name: 'Strength' },
            { key: 'runs', name: 'Runs' },
          ]}
          yFormat={(v) => String(v)}
          stacked
        />
      </ChartCard>
    </div>
  );
}
