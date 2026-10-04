import { PROGRESS_VIEWS, type ProgressView, type Route } from '../../app/routes';
import { navigate } from '../../app/useRoute';
import { Segmented } from '../../components/Fields';
import { RANGE_KEYS, RANGE_LABELS, type RangeKey } from '../../lib/ranges';

const VIEW_LABELS: Record<ProgressView, string> = {
  strength: 'Strength',
  exercises: 'Exercises',
  rpe: 'RPE',
  running: 'Running',
  body: 'Body',
};

/**
 * Switching views or ranges replaces the history entry rather than adding
 * one, so Back leaves Progress instead of replaying every tap.
 */
export function ViewTabs({ view, range }: { view: ProgressView; range: RangeKey }) {
  return (
    <nav aria-label="Progress views" className="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none]">
      <ul className="flex gap-2">
        {PROGRESS_VIEWS.map((v) => (
          <li key={v}>
            <button
              type="button"
              aria-current={v === view ? 'page' : undefined}
              onClick={() => navigate({ name: 'progress', view: v, range }, { replace: true })}
              className={`min-h-11 whitespace-nowrap rounded-full border px-4 text-sm ${
                v === view ? 'border-accent bg-accent font-semibold text-black' : 'border-border text-muted'
              }`}
            >
              {VIEW_LABELS[v]}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function RangePicker({ value, route }: { value: RangeKey; route: (range: RangeKey) => Route }) {
  return (
    <div className="mb-4">
      <Segmented<RangeKey>
        label="Range"
        value={value}
        options={RANGE_KEYS.map((k) => ({ value: k, label: RANGE_LABELS[k] }))}
        onChange={(range) => navigate(route(range), { replace: true })}
      />
    </div>
  );
}
