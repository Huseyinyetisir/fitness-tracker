import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import { addDays, eachDateInRange, isSystemTimestamp, weekdayIndex } from '../../lib/time';
import { deterministicId } from '../../lib/uuidv5';
import type {
  Exercise,
  ISODate,
  Local,
  Modality,
  Session,
  SessionExercise,
  SessionKind,
  UUID,
  WeekPlan,
  WeekPlanDay,
  WorkoutTemplate,
  WorkoutTemplateItem,
} from '../../types/domain';
import { pickActivePlan } from './planRepo';

export interface DesiredItem {
  itemId: UUID;
  exerciseId: UUID;
  position: number;
  targetSets: number | null;
  targetReps: number | null;
  targetWeightKg: number | null;
}

/** What the plan says should happen on a date. */
export interface DesiredSession {
  templateId: UUID;
  kind: SessionKind;
  items: DesiredItem[];
}

export type Decision = 'insert' | 'revive' | 'rewrite' | 'remove' | 'leave';

export function sessionKindFor(modalities: Modality[]): SessionKind {
  const cardio = modalities.includes('cardio');
  const strength = modalities.includes('strength');
  if (cardio && strength) return 'mixed';
  return cardio ? 'run' : 'strength';
}

/** The workout the plan assigns to a date, or null for a rest day. */
export function desiredFor(
  date: ISODate,
  plan: WeekPlan | undefined,
  days: WeekPlanDay[],
  templates: WorkoutTemplate[],
  items: WorkoutTemplateItem[],
  exercises: Exercise[],
): DesiredSession | null {
  if (!plan || date < plan.active_from) return null;
  const weekday = weekdayIndex(date);
  const day = days.find((d) => d.week_plan_id === plan.id && d.weekday === weekday && d.deleted_at === null);
  if (!day?.template_id) return null;
  const template = templates.find((t) => t.id === day.template_id && t.deleted_at === null);
  if (!template) return null;

  const ordered = items
    .filter((i) => i.template_id === template.id && i.deleted_at === null)
    .sort((a, b) => a.position - b.position);
  const modalityOf = (exerciseId: UUID): Modality => exercises.find((e) => e.id === exerciseId)?.modality ?? 'strength';

  return {
    templateId: template.id,
    kind: sessionKindFor(ordered.map((i) => modalityOf(i.exercise_id))),
    items: ordered.map((i) => ({
      itemId: i.id,
      exerciseId: i.exercise_id,
      position: i.position,
      targetSets: i.target_sets,
      targetReps: i.target_reps,
      targetWeightKg: i.target_weight_kg,
    })),
  };
}

/** A comparable fingerprint of what a session should contain. */
export function desiredSignature(desired: DesiredSession | null): string {
  if (!desired) return '';
  return desired.items
    .map((i) => [i.exerciseId, i.position, i.targetSets, i.targetReps, i.targetWeightKg].join('|'))
    .join(';');
}

/** The same fingerprint, read from a session's existing exercises. */
export function childrenSignature(children: SessionExercise[]): string {
  return children
    .filter((c) => c.deleted_at === null)
    .sort((a, b) => a.position - b.position)
    .map((c) => [c.exercise_id, c.position, c.target_sets, c.target_reps, c.target_weight_kg].join('|'))
    .join(';');
}

/**
 * What to do with one date's materialized session.
 *
 * A row is the user's — and is never touched again — once it carries a real
 * timestamp (any edit, start or removal), leaves 'planned', or has work logged
 * in it. Past dates are never rewritten either, so history stays as planned.
 * Everything else is the app's to keep in step with the template.
 */
export function decide(args: {
  existing: Session | undefined;
  existingSignature: string;
  desired: DesiredSession | null;
  date: ISODate;
  today: ISODate;
  hasLoggedWork: boolean;
}): Decision {
  const { existing, desired } = args;
  if (!existing) return desired ? 'insert' : 'leave';

  const ownedByUser =
    !isSystemTimestamp(existing.updated_at) || existing.status !== 'planned' || args.hasLoggedWork;
  if (ownedByUser || args.date < args.today) return 'leave';

  if (existing.deleted_at !== null) return desired ? 'revive' : 'leave';
  if (!desired) return 'remove';

  const unchanged =
    existing.template_id === desired.templateId && args.existingSignature === desiredSignature(desired);
  return unchanged ? 'leave' : 'rewrite';
}

export function plannedSessionId(userId: string, date: ISODate): UUID {
  return deterministicId(`${userId}:planned:${date}`);
}

export function plannedChildId(sessionId: UUID, itemId: UUID): UUID {
  return deterministicId(`${sessionId}:${itemId}`);
}

/**
 * Brings one Monday-to-Sunday week of planned sessions in line with the plan.
 * Returns how many dates changed. Safe to call on every screen open: it is
 * idempotent, and concurrent calls serialise on the read-write transaction.
 */
export async function materializeWeek(userId: string, weekStart: ISODate, todayDate: ISODate): Promise<number> {
  const dates = eachDateInRange(weekStart, addDays(weekStart, 6));

  return db.transaction(
    'rw',
    [
      db.week_plans,
      db.week_plan_days,
      db.workout_templates,
      db.workout_template_items,
      db.exercises,
      db.sessions,
      db.session_exercises,
      db.set_entries,
      db.runs,
    ],
    async () => {
      const plans = await db.week_plans.where('_deleted').equals(0).toArray();
      if (plans.length === 0) return 0;
      const days = await db.week_plan_days.toArray();
      const templates = await db.workout_templates.toArray();
      const items = await db.workout_template_items.toArray();
      const exercises = await db.exercises.toArray();

      let changed = 0;
      for (const date of dates) {
        const desired = desiredFor(date, pickActivePlan(plans, date), days, templates, items, exercises);
        const id = plannedSessionId(userId, date);
        const existing = await db.sessions.get(id);
        const children = existing ? await db.session_exercises.where('session_id').equals(id).toArray() : [];

        const decision = decide({
          existing,
          existingSignature: childrenSignature(children),
          desired,
          date,
          today: todayDate,
          hasLoggedWork: existing ? await hasLoggedWork(id, children) : false,
        });
        if (decision === 'leave') continue;
        changed++;

        if (decision === 'remove') {
          for (const c of children) {
            if (c._deleted === 0) await softDeleteRow('session_exercises', c.id, { system: true });
          }
          await softDeleteRow('sessions', id, { system: true });
          continue;
        }
        if (!desired) continue;

        const fields = { kind: desired.kind, template_id: desired.templateId, status: 'planned' as const };
        if (decision === 'insert') {
          await insertRow<Session>(
            'sessions',
            { date, ...fields, was_planned: true, energy: null, notes: null, started_at: null, completed_at: null },
            { id, system: true },
          );
        } else {
          await updateRow<Session>('sessions', id, fields, { system: true, undelete: decision === 'revive' });
        }
        await reconcileChildren(id, desired.items, children);
      }
      return changed;
    },
  );
}

async function hasLoggedWork(sessionId: UUID, children: Local<SessionExercise>[]): Promise<boolean> {
  const live = children.filter((c) => c._deleted === 0).map((c) => c.id);
  if (live.length > 0) {
    const sets = await db.set_entries.where('session_exercise_id').anyOf(live).toArray();
    if (sets.some((s) => s._deleted === 0)) return true;
  }
  const runs = await db.runs.where('session_id').equals(sessionId).toArray();
  return runs.some((r) => r._deleted === 0);
}

/** Makes a session's exercises match the desired items, as system writes. */
async function reconcileChildren(
  sessionId: UUID,
  items: DesiredItem[],
  children: Local<SessionExercise>[],
): Promise<void> {
  const wanted = new Map(items.map((i) => [plannedChildId(sessionId, i.itemId), i]));

  for (const c of children) {
    if (c._deleted === 0 && !wanted.has(c.id)) {
      await softDeleteRow('session_exercises', c.id, { system: true });
    }
  }

  for (const [childId, item] of wanted) {
    const fields = {
      exercise_id: item.exerciseId,
      position: item.position,
      target_sets: item.targetSets,
      target_reps: item.targetReps,
      target_weight_kg: item.targetWeightKg,
    };
    const current = children.find((c) => c.id === childId);
    if (!current) {
      await insertRow<SessionExercise>(
        'session_exercises',
        { session_id: sessionId, notes: null, ...fields },
        { id: childId, system: true },
      );
    } else {
      await updateRow<SessionExercise>('session_exercises', childId, fields, {
        system: true,
        undelete: current._deleted === 1,
      });
    }
  }
}
