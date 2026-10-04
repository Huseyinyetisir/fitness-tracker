import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { resetDb } from '../../test/fixtures';
import { deleteBodyMetric, saveBodyMetric } from './bodyRepo';

const TODAY = '2026-10-04';
const draft = { date: '2026-10-03', weight_kg: 81.456, resting_hr: 55, note: '  after the long run  ' };

describe('body repository', () => {
  beforeEach(resetDb);

  it('creates an entry, rounding weight to the stored precision and trimming the note', async () => {
    const row = await saveBodyMetric(null, draft, TODAY);
    expect(row).toMatchObject({ date: '2026-10-03', weight_kg: 81.46, resting_hr: 55, note: 'after the long run', _dirty: 1 });
  });

  it('updates an entry in place', async () => {
    const row = await saveBodyMetric(null, draft, TODAY);
    await saveBodyMetric(row.id, { ...draft, weight_kg: 80, note: '' }, TODAY);
    expect(await db.body_metrics.get(row.id)).toMatchObject({ weight_kg: 80, note: null });
    expect(await db.body_metrics.count()).toBe(1);
  });

  it('refuses a second entry on the same day, but not re-saving the same one', async () => {
    const row = await saveBodyMetric(null, draft, TODAY);
    await expect(saveBodyMetric(null, draft, TODAY)).rejects.toThrow('already an entry');
    await expect(saveBodyMetric(row.id, draft, TODAY)).resolves.toBeDefined();
  });

  it('allows a new entry on a day whose entry was deleted', async () => {
    const row = await saveBodyMetric(null, draft, TODAY);
    await deleteBodyMetric(row.id);
    await expect(saveBodyMetric(null, draft, TODAY)).resolves.toBeDefined();
  });

  it('refuses invalid input', async () => {
    await expect(saveBodyMetric(null, { ...draft, weight_kg: null, resting_hr: null }, TODAY)).rejects.toThrow(
      'Enter a weight',
    );
  });

  it('soft-deletes', async () => {
    const row = await saveBodyMetric(null, draft, TODAY);
    await deleteBodyMetric(row.id);
    expect(await db.body_metrics.get(row.id)).toMatchObject({ _deleted: 1, _dirty: 1 });
  });
});
