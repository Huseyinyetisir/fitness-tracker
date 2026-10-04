import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/schema';
import { TABLE_COLUMNS } from '../../sync/columns';
import { SYNCED_TABLES } from '../../sync/tables';
import { resetDb } from '../../test/fixtures';
import { bodyRow, sessionRow } from '../../test/rows';
import { BACKUP_VERSION, backupFileName, backupRowCount, buildBackup, parseBackup } from './backup';

const USER = 'user-1';

describe('buildBackup', () => {
  beforeEach(resetDb);

  it('includes every table, tombstones too, without local-only fields', async () => {
    await db.sessions.bulkPut([sessionRow('s1'), sessionRow('gone', { deleted_at: '2026-10-02T06:00:00.000Z' })]);
    await db.body_metrics.put(bodyRow('b1', '2026-10-01', { weight_kg: 80 }));

    const backup = await buildBackup(USER, '2026-10-04T08:00:00.000Z');
    expect(backup).toMatchObject({ format: 'fit-tracker-backup', version: BACKUP_VERSION, user_id: USER });
    expect(Object.keys(backup.tables)).toEqual([...SYNCED_TABLES]);
    expect(backup.tables.sessions.map((s) => s.id).sort()).toEqual(['gone', 's1']);
    expect(Object.keys(backup.tables.sessions[0])).toEqual([...TABLE_COLUMNS.sessions]);
    expect(backupRowCount(backup)).toBe(3);
  });

  it('round-trips through JSON and parseBackup', async () => {
    await db.sessions.put(sessionRow('s1'));
    const backup = await buildBackup(USER, '2026-10-04T08:00:00.000Z');
    expect(parseBackup(JSON.stringify(backup))).toEqual({ ok: true, backup });
  });
});

describe('parseBackup', () => {
  async function valid() {
    await resetDb();
    await db.sessions.put(sessionRow('s1'));
    return JSON.parse(JSON.stringify(await buildBackup(USER, '2026-10-04T08:00:00.000Z')));
  }

  it('rejects text that is not JSON', () => {
    expect(parseBackup('{oops')).toEqual({ ok: false, error: 'This file is not a Fit Tracker backup: it is not valid JSON.' });
  });

  it('rejects other JSON', () => {
    expect(parseBackup('{"hello": 1}')).toEqual({ ok: false, error: 'This file is not a Fit Tracker backup.' });
  });

  it('rejects a backup from a newer app version', async () => {
    const file = await valid();
    file.version = BACKUP_VERSION + 1;
    expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, error: expect.stringContaining('newer version') });
  });

  it('rejects a row missing a column, naming it', async () => {
    const file = await valid();
    delete file.tables.sessions[0].status;
    expect(parseBackup(JSON.stringify(file))).toEqual({
      ok: false,
      error: 'This backup is damaged: sessions, row 1 has no "status".',
    });
  });

  it('rejects a row with an unparseable timestamp', async () => {
    const file = await valid();
    file.tables.sessions[0].updated_at = 'yesterday';
    expect(parseBackup(JSON.stringify(file))).toMatchObject({ ok: false, error: expect.stringContaining('invalid timestamp') });
  });

  it('treats a missing table as empty and ignores unknown ones', async () => {
    const file = await valid();
    delete file.tables.runs;
    file.tables.something_else = [{ id: 'x' }];
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok && parsed.backup.tables.runs).toEqual([]);
    expect(parsed.ok && 'something_else' in parsed.backup.tables).toBe(false);
  });

  it('names the file by date', () => {
    expect(backupFileName('2026-10-04')).toBe('fit-tracker-backup-2026-10-04.json');
  });
});
