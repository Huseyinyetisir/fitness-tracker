import Button from '../../components/Button';
import { formatDuration } from '../../lib/running';
import type { RestTimerControls } from './useRestTimer';

/** Floats just above the tab bar while a rest is running, so it is visible from any exercise. */
export default function RestTimerBar({ timer }: { timer: RestTimerControls }) {
  if (!timer.active) return null;
  return (
    <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 px-4">
      <div
        role="timer"
        aria-label={timer.done ? 'Rest over' : `Rest, ${timer.remaining} seconds left`}
        className={`mx-auto flex max-w-xl items-center gap-2 rounded-2xl border px-4 py-2 shadow-lg ${
          timer.done ? 'border-green-500 bg-green-950' : 'border-border bg-surface'
        }`}
      >
        <span className="flex-1 text-2xl font-semibold tabular-nums">
          {timer.done ? 'Rest over' : formatDuration(timer.remaining)}
        </span>
        {!timer.done && <Button onClick={() => timer.extend(30)}>+30 s</Button>}
        <Button variant={timer.done ? 'primary' : 'secondary'} onClick={timer.stop}>
          {timer.done ? 'Dismiss' : 'Skip'}
        </Button>
      </div>
    </div>
  );
}
