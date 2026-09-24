import type { ISODate, SessionStatus } from '../types/domain';
import { addDays, isWeekdayDate } from './time';

/** The minimum a session must expose for adherence and streak maths. */
export interface SessionSummary {
  date: ISODate;
  status: SessionStatus;
  was_planned: boolean;
}

export interface AdherenceResult {
  planned: number;
  completed: number;
  /** 0–100, one decimal place. 0 when nothing was planned. */
  pct: number;
}

function isCompleted(status: SessionStatus): boolean {
  return status === 'done' || status === 'partial';
}

export function adherence(sessions: SessionSummary[]): AdherenceResult {
  const planned = sessions.filter((s) => s.was_planned);
  const completed = planned.filter((s) => isCompleted(s.status));
  const pct =
    planned.length === 0
      ? 0
      : Math.round((completed.length / planned.length) * 1000) / 10;
  return { planned: planned.length, completed: completed.length, pct };
}

/**
 * Consecutive weekday (Mon–Fri) sessions ending at `todayDate`, walking
 * backwards. Weekends are skipped without breaking the chain. `todayDate`
 * itself is forgiven if not yet completed, so the streak does not read as
 * zero first thing in the morning; earlier gaps are not forgiven.
 */
export function weekdayStreak(sessions: SessionSummary[], todayDate: ISODate): number {
  const completedDates = new Set(
    sessions.filter((s) => isCompleted(s.status)).map((s) => s.date),
  );

  let streak = 0;
  let cursor = todayDate;
  let isFirstExamined = true;

  // Bound the walk so a corrupt date can never loop forever. Five years of
  // weekdays is far beyond any streak this app will legitimately report.
  for (let guard = 0; guard < 2000; guard++) {
    if (isWeekdayDate(cursor)) {
      if (completedDates.has(cursor)) {
        streak++;
      } else if (isFirstExamined && cursor === todayDate) {
        // Grace day for today only.
      } else {
        break;
      }
      isFirstExamined = false;
    }
    cursor = addDays(cursor, -1);
  }

  return streak;
}
