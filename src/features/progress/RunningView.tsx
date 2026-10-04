import { BarSeriesChart, CHART_COLORS, ChartCard, LineSeriesChart, ScatterPlot } from '../../components/charts';
import Stat from '../../components/Stat';
import { formatKm, formatMonth, formatNumber, formatShortDate } from '../../lib/format';
import { formatPace } from '../../lib/running';
import type { RunType } from '../../types/domain';
import type { ViewProps } from './ProgressScreen';
import { longestRun, monthlyTotals, paceByType, paceVsRpe, runTotals, weeklyKm } from './runStats';

/** Each run type keeps its colour whichever types the range happens to contain. */
const RUN_TYPES: { key: RunType; name: string; color: string }[] = [
  { key: 'easy', name: 'Easy', color: CHART_COLORS.series[0] },
  { key: 'tempo', name: 'Tempo', color: CHART_COLORS.series[1] },
  { key: 'intervals', name: 'Intervals', color: CHART_COLORS.series[2] },
  { key: 'long', name: 'Long', color: CHART_COLORS.series[3] },
];

const pace = (v: number) => formatPace(v);

export default function RunningView({ data, start, todayDate }: ViewProps) {
  const totals = runTotals(data.runs, start, todayDate);
  const weekly = weeklyKm(data.runs, start, todayDate);
  const paces = paceByType(data.runs, start, todayDate);
  const months = monthlyTotals(data.runs, start, todayDate);
  const scatter = paceVsRpe(data.runs, start, todayDate);
  const longest = longestRun(data.runs, start, todayDate);
  const empty = totals.runs === 0 ? 'No runs in this range yet.' : null;
  const types = RUN_TYPES.filter((t) => paces.some((p) => p[t.key] !== undefined));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Distance, km" value={formatNumber(totals.km, 1)} />
        <Stat label="Runs" value={String(totals.runs)} />
        <Stat
          label={longest ? `Longest, km · ${formatShortDate(longest.date)}` : 'Longest, km'}
          value={longest ? formatNumber(longest.distance_km, 1) : '—'}
        />
      </div>

      <ChartCard title="Weekly distance" summary={`${formatKm(totals.km)} over ${weekly.length} weeks.`} empty={empty}>
        <BarSeriesChart
          data={weekly}
          xKey="week"
          xFormat={formatShortDate}
          series={[{ key: 'km', name: 'km' }]}
          yFormat={(v) => formatNumber(v, 1)}
        />
      </ChartCard>

      <ChartCard
        title="Pace by run type, min/km"
        summary={`Pace of ${paces.length} runs by type; faster is higher.`}
        empty={paces.length === 0 ? 'No runs with a distance in this range yet.' : null}
      >
        <LineSeriesChart data={paces} xKey="date" xFormat={formatShortDate} series={types} yFormat={pace} reversed />
      </ChartCard>

      <ChartCard title="Monthly distance" summary={months.map((m) => `${formatMonth(m.month)} ${formatKm(m.km)}`).join(', ')} empty={empty}>
        <BarSeriesChart
          data={months}
          xKey="month"
          xFormat={formatMonth}
          series={[{ key: 'km', name: 'km' }]}
          yFormat={(v) => formatNumber(v, 1)}
        />
      </ChartCard>

      <ChartCard
        title="Pace against RPE"
        summary={`${scatter.length} runs plotted by RPE and pace.`}
        empty={scatter.length === 0 ? 'No runs with a distance in this range yet.' : null}
      >
        <ScatterPlot
          data={scatter}
          x={{ key: 'rpe', name: 'RPE', format: (v) => formatNumber(v, 1) }}
          y={{ key: 'pace', name: 'Pace', format: pace }}
          reversedY
        />
      </ChartCard>
    </div>
  );
}
