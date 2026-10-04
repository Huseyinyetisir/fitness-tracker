import { routeHref } from '../../app/routes';
import { PRIMARY_LINK, ROW_LINK } from '../../components/Button';
import { ChartCard, LineSeriesChart } from '../../components/charts';
import { formatDateLong, formatKg, formatNumber, formatShortDate } from '../../lib/format';
import { bodySeries } from './bodyRules';
import type { ViewProps } from './ProgressScreen';

export default function BodyView({ data, start, todayDate }: ViewProps) {
  const { weight, restingHr } = bodySeries(data.body, start, todayDate);
  const entries = data.body.filter((b) => b.date >= start).reverse();
  // One entry per day: once today has one, the button opens it instead.
  const todays = data.body.find((b) => b.date === todayDate);

  return (
    <div className="space-y-4">
      <a href={routeHref({ name: 'body', id: todays?.id ?? 'new' })} className={PRIMARY_LINK}>
        {todays ? "Edit today's entry" : 'Add body entry'}
      </a>

      <ChartCard
        title="Weight, kg"
        summary={`${weight.length} weigh-ins; latest ${weight.at(-1) ? formatKg(weight.at(-1)!.value) : 'none'}.`}
        empty={weight.length === 0 ? 'No weigh-ins in this range yet.' : null}
      >
        <LineSeriesChart
          data={weight}
          xKey="date"
          xFormat={formatShortDate}
          series={[{ key: 'value', name: 'Weight' }]}
          yFormat={(v) => formatNumber(v, 1)}
        />
      </ChartCard>

      <ChartCard
        title="Resting heart rate, bpm"
        summary={`${restingHr.length} readings; latest ${restingHr.at(-1)?.value ?? 'none'} bpm.`}
        empty={restingHr.length === 0 ? 'No resting heart rate readings in this range yet.' : null}
      >
        <LineSeriesChart
          data={restingHr}
          xKey="date"
          xFormat={formatShortDate}
          series={[{ key: 'value', name: 'Resting HR' }]}
          yFormat={(v) => String(Math.round(v))}
        />
      </ChartCard>

      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((b) => (
            <li key={b.id}>
              <a href={routeHref({ name: 'body', id: b.id })} className={ROW_LINK}>
                <span className="py-2">
                  <span className="block">{formatDateLong(b.date)}</span>
                  {b.note && <span className="block text-sm text-muted">{b.note}</span>}
                </span>
                <span className="pl-3 text-right text-sm tabular-nums">
                  {b.weight_kg !== null && <span className="block">{formatKg(b.weight_kg)}</span>}
                  {b.resting_hr !== null && <span className="block text-muted">{b.resting_hr} bpm</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
