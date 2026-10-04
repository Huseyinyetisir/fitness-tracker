import { addDays, startOfWeek } from '../../lib/time';
import type { ISODate, SessionStatus } from '../../types/domain';
import type { SessionCard } from './cards';

export type HistoryState = 'done' | 'partial' | 'skipped' | 'missed' | 'unfinished';

export interface HistoryEntry extends SessionCard {
  state: HistoryState;
}

/**
 * How a session reads in history, or null if it is not history yet.
 *
 * A finished session shows its status. A planned session from a past day
 * reads as "missed" — that is what keeps adherence honest. Work logged but
 * never finished reads as "unfinished". Today's untouched plan belongs on
 * Today, future plans on Plan, and an unplanned session abandoned before
 * anything was logged is not shown at all.
 */
export function historyState(card: SessionCard, todayDate: ISODate): HistoryState | null {
  const { session } = card;
  if (session.status !== 'planned') return session.status;
  if (session.date > todayDate) return null;
  if (card.workingSets > 0 || card.run !== null) return 'unfinished';
  if (session.date === todayDate || !session.was_planned) return null;
  return 'missed';
}

export function buildHistory(cards: SessionCard[], todayDate: ISODate): HistoryEntry[] {
  return cards
    .flatMap((card) => {
      const state = historyState(card, todayDate);
      return state ? [{ ...card, state }] : [];
    })
    .sort(
      (a, b) =>
        b.session.date.localeCompare(a.session.date) ||
        (b.session.completed_at ?? b.session.created_at).localeCompare(a.session.completed_at ?? a.session.created_at),
    );
}

/** Groups newest-first entries into Monday-start weeks, keeping their order. */
export function groupByWeek(entries: HistoryEntry[]): { weekStart: ISODate; entries: HistoryEntry[] }[] {
  const groups: { weekStart: ISODate; entries: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const weekStart = startOfWeek(entry.session.date);
    const last = groups.at(-1);
    if (last && last.weekStart === weekStart) last.entries.push(entry);
    else groups.push({ weekStart, entries: [entry] });
  }
  return groups;
}

/** 0 nothing completed · 1 partial only · 2 done · 3 two or more completed sessions. */
export type HeatLevel = 0 | 1 | 2 | 3;

export interface HeatCell {
  date: ISODate;
  level: HeatLevel;
  future: boolean;
}

/** `weeks` columns, oldest first, each Monday to Sunday, ending with this week. */
export function heatmap(
  sessions: { date: ISODate; status: SessionStatus }[],
  todayDate: ISODate,
  weeks = 12,
): HeatCell[][] {
  const first = addDays(startOfWeek(todayDate), -7 * (weeks - 1));
  const completed = new Map<ISODate, { done: number; partial: number }>();
  for (const s of sessions) {
    if (s.status !== 'done' && s.status !== 'partial') continue;
    const counts = completed.get(s.date) ?? { done: 0, partial: 0 };
    counts[s.status]++;
    completed.set(s.date, counts);
  }

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = addDays(first, w * 7 + d);
      const c = completed.get(date);
      const level: HeatLevel = !c ? 0 : c.done + c.partial >= 2 ? 3 : c.done > 0 ? 2 : 1;
      return { date, level, future: date > todayDate };
    }),
  );
}
