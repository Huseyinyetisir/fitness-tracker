import { ChartCard, LineSeriesChart, ScatterPlot } from '../../components/charts';
import { formatNumber, formatShortDate } from '../../lib/format';
import type { ViewProps } from './ProgressScreen';
import { fatigueAlerts, sessionLoads, volumeVsRpe, weeklyRpe } from './rpeStats';

export default function RpeView({ data, start, todayDate }: ViewProps) {
  const loads = sessionLoads(data.lifts, data.runs);
  const weekly = weeklyRpe(loads, start, todayDate);
  const scatter = volumeVsRpe(loads, start, todayDate);
  const alerts = fatigueAlerts(data.lifts, data.exercises, todayDate);
  const rated = weekly.filter((w) => w.rpe !== null);

  return (
    <div className="space-y-4">
      {alerts.length > 0 ? (
        <div role="status" className="rounded-2xl border border-amber-400/60 bg-amber-400/10 p-4">
          <h2 className="font-medium text-amber-300">Fatigue building</h2>
          <p className="mb-2 text-sm text-muted">
            The same weight has felt harder over the last two weeks than the two before. Consider a lighter week.
          </p>
          <ul className="space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.exercise_id}>
                <span className="font-medium">{a.name}</span>: RPE +{formatNumber(a.rpe_delta, 1)} at{' '}
                {a.load_change_pct >= 0 ? '+' : ''}
                {formatNumber(a.load_change_pct * 100, 1)}% load
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted">
          No fatigue signals: no exercise has felt harder at the same weight over the last two weeks.
        </p>
      )}

      <ChartCard
        title="Average RPE per week"
        summary={`Average session RPE per week; latest ${rated.at(-1)?.rpe?.toFixed(1) ?? 'none'}.`}
        empty={rated.length === 0 ? 'No rated sessions in this range yet.' : null}
      >
        <LineSeriesChart
          data={weekly}
          xKey="week"
          xFormat={formatShortDate}
          series={[{ key: 'rpe', name: 'RPE' }]}
          yFormat={(v) => formatNumber(v, 1)}
        />
      </ChartCard>

      <ChartCard
        title="Volume against RPE"
        summary={`${scatter.length} strength sessions plotted by volume and RPE.`}
        empty={scatter.length === 0 ? 'No strength sessions in this range yet.' : null}
      >
        <ScatterPlot
          data={scatter}
          x={{ key: 'volume', name: 'Volume, kg', format: (v) => formatNumber(v) }}
          y={{ key: 'rpe', name: 'RPE', format: (v) => formatNumber(v, 1) }}
        />
      </ChartCard>
    </div>
  );
}
