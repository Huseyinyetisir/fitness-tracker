import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Colours for SVG, matching the @theme tokens in index.css. Recharts writes
 * them as SVG attributes, where CSS variables are not reliably resolved, so
 * they are spelled out here.
 */
export const CHART_COLORS = {
  accent: '#4ea1ff',
  grid: '#22303d',
  text: '#8b9bab',
  surface: '#141b23',
  pr: '#f5a524',
  series: ['#4ea1ff', '#f5a524', '#45d483', '#f871a0'],
} as const;

const HEIGHT = 200;
// Data keys below are cast to string at the Recharts boundary. Recharts types a
// key against the data it can see, and it cannot see through these generic
// props — the key is already checked against T by each component's own props.
const AXIS = { stroke: CHART_COLORS.grid, tick: { fill: CHART_COLORS.text, fontSize: 12 }, tickLine: false } as const;
const TOOLTIP = {
  contentStyle: { background: CHART_COLORS.surface, border: `1px solid ${CHART_COLORS.grid}`, borderRadius: 12 },
  labelStyle: { color: CHART_COLORS.text },
  cursor: { fill: 'rgba(78, 161, 255, 0.08)', stroke: CHART_COLORS.grid },
} as const;

/** Charts animate in unless the user asked the system for reduced motion. */
function animate(): boolean {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface Series {
  key: string;
  name: string;
  color?: string;
}

/**
 * A titled card around one chart. `summary` is the chart's text alternative
 * for screen readers; when `empty` is set the chart is replaced by it.
 */
export function ChartCard({
  title,
  summary,
  empty,
  children,
}: {
  title: string;
  summary: string;
  empty?: string | null;
  children: ReactNode;
}) {
  return (
    <figure className="rounded-2xl border border-border bg-surface p-3">
      <figcaption className="mb-2 text-sm font-medium">{title}</figcaption>
      {empty ? (
        <p className="py-6 text-center text-sm text-muted">{empty}</p>
      ) : (
        <div role="img" aria-label={summary}>
          {children}
        </div>
      )}
    </figure>
  );
}

export function BarSeriesChart<T extends object>({
  data,
  xKey,
  xFormat,
  series,
  yFormat,
  stacked = false,
}: {
  data: T[];
  xKey: keyof T & string;
  xFormat: (value: string) => string;
  series: Series[];
  yFormat: (value: number) => string;
  stacked?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey={xKey as string} tickFormatter={xFormat} minTickGap={16} {...AXIS} />
        <YAxis tickFormatter={yFormat} width={48} allowDecimals={false} {...AXIS} />
        <Tooltip {...TOOLTIP} labelFormatter={(label) => xFormat(String(label))} formatter={(v) => yFormat(Number(v))} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            fill={s.color ?? CHART_COLORS.series[i % CHART_COLORS.series.length]}
            stackId={stacked ? 'stack' : undefined}
            radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
            isAnimationActive={animate()}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineSeriesChart<T extends object>({
  data,
  xKey,
  xFormat,
  series,
  yFormat,
  reversed = false,
  highlightKey,
}: {
  data: T[];
  xKey: keyof T & string;
  xFormat: (value: string) => string;
  series: Series[];
  yFormat: (value: number) => string;
  /** Draw larger values lower — for pace, where lower is faster. */
  reversed?: boolean;
  /** A boolean field: points where it is true get a highlighted marker, such as a PR. */
  highlightKey?: keyof T & string;
}) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
        <XAxis dataKey={xKey as string} tickFormatter={xFormat} minTickGap={16} {...AXIS} />
        <YAxis tickFormatter={yFormat} width={48} domain={['auto', 'auto']} reversed={reversed} {...AXIS} />
        <Tooltip {...TOOLTIP} labelFormatter={(label) => xFormat(String(label))} formatter={(v) => yFormat(Number(v))} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => {
          const color = s.color ?? CHART_COLORS.series[i % CHART_COLORS.series.length];
          return (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={color}
              strokeWidth={2}
              connectNulls
              isAnimationActive={animate()}
              dot={(props: { cx?: number; cy?: number; index?: number; payload?: T }) => {
                const highlighted = highlightKey !== undefined && Boolean(props.payload?.[highlightKey]);
                if (props.cx === undefined || props.cy === undefined) return <g key={props.index} />;
                return (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={highlighted ? 5 : 2.5}
                    fill={highlighted ? CHART_COLORS.pr : color}
                    stroke="none"
                  />
                );
              }}
            />
          );
        })}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ScatterPlot<T extends object>({
  data,
  x,
  y,
  reversedY = false,
}: {
  data: T[];
  x: { key: keyof T & string; name: string; format: (value: number) => string };
  y: { key: keyof T & string; name: string; format: (value: number) => string };
  reversedY?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT}>
      <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART_COLORS.grid} />
        <XAxis type="number" dataKey={x.key as string} name={x.name} tickFormatter={x.format} domain={['auto', 'auto']} {...AXIS} />
        <YAxis
          type="number"
          dataKey={y.key as string}
          name={y.name}
          tickFormatter={y.format}
          width={48}
          domain={['auto', 'auto']}
          reversed={reversedY}
          {...AXIS}
        />
        <Tooltip
          {...TOOLTIP}
          formatter={(value, name) => [name === x.name ? x.format(Number(value)) : y.format(Number(value)), name]}
        />
        <Scatter data={data} fill={CHART_COLORS.accent} isAnimationActive={animate()} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
