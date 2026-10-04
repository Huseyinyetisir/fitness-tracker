import { db } from '../../db/schema';
import { insertRow, softDeleteRow, updateRow } from '../../db/repo';
import type { BodyMetric, ISODate, Local, UUID } from '../../types/domain';
import { validateBody, type BodyDraft } from './bodyRules';

/** Creates an entry (`id` null) or updates one. Throws with the validation messages if the draft is invalid. */
export async function saveBodyMetric(id: UUID | null, draft: BodyDraft, todayDate: ISODate): Promise<Local<BodyMetric>> {
  return db.transaction('rw', db.body_metrics, async () => {
    const sameDay = await db.body_metrics.where('date').equals(draft.date).toArray();
    const taken = sameDay.filter((b) => b._deleted === 0 && b.id !== id).map((b) => b.date);
    const messages = Object.values(validateBody(draft, todayDate, taken));
    if (messages.length > 0) throw new Error(messages.join('; '));

    const fields = {
      date: draft.date,
      weight_kg: draft.weight_kg === null ? null : Math.round(draft.weight_kg * 100) / 100,
      resting_hr: draft.resting_hr,
      note: draft.note.trim() || null,
    };
    return id ? updateRow<BodyMetric>('body_metrics', id, fields) : insertRow<BodyMetric>('body_metrics', fields);
  });
}

export async function deleteBodyMetric(id: UUID): Promise<void> {
  await softDeleteRow('body_metrics', id);
}
