import { describe, it, expect } from 'vitest';
import { mergeRow } from './merge';
import type { BaseRow, Local } from '../types/domain';

function row(updated_at: string, extra: Partial<BaseRow> = {}): BaseRow {
  return {
    id: 'r1',
    user_id: 'u1',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at,
    server_updated_at: '2026-09-01T00:00:01.000Z',
    deleted_at: null,
    ...extra,
  };
}

function local(updated_at: string, dirty: 0 | 1, extra: Partial<BaseRow> = {}): Local<BaseRow> {
  const r = row(updated_at, extra);
  return { ...r, _dirty: dirty, _deleted: r.deleted_at ? 1 : 0 };
}

describe('mergeRow', () => {
  it('takes the remote row when there is no local row', () => {
    const remote = row('2026-09-10T00:00:00.000Z');
    expect(mergeRow(undefined, remote)).toEqual({ ...remote, _dirty: 0, _deleted: 0 });
  });

  it('keeps the local row when there is no remote row', () => {
    const l = local('2026-09-10T00:00:00.000Z', 1);
    expect(mergeRow(l, undefined)).toBe(l);
  });

  it('takes the remote row when remote is newer', () => {
    const l = local('2026-09-10T00:00:00.000Z', 1);
    const remote = row('2026-09-11T00:00:00.000Z');
    expect(mergeRow(l, remote)).toEqual({ ...remote, _dirty: 0, _deleted: 0 });
  });

  it('keeps the local row and its dirty flag when local is newer', () => {
    const l = local('2026-09-12T00:00:00.000Z', 1);
    const remote = row('2026-09-11T00:00:00.000Z');
    const merged = mergeRow(l, remote);
    expect(merged).toBe(l);
    expect(merged!._dirty).toBe(1);
  });

  it('re-queues a clean local row that wins, so the server gets repaired', () => {
    const l = local('2026-09-12T00:00:00.000Z', 0);
    const remote = row('2026-09-11T00:00:00.000Z');
    const merged = mergeRow(l, remote);
    expect(merged!.updated_at).toBe('2026-09-12T00:00:00.000Z');
    expect(merged!._dirty).toBe(1);
  });

  it('resolves a tie to the remote row so repeated syncs converge', () => {
    const ts = '2026-09-11T00:00:00.000Z';
    const l = local(ts, 1);
    const remote = row(ts, { deleted_at: '2026-09-11T00:00:00.000Z' });
    const merged = mergeRow(l, remote);
    expect(merged!.deleted_at).toBe('2026-09-11T00:00:00.000Z');
    expect(merged!._dirty).toBe(0);
  });

  it('accepts a remote tombstone that is newer than the local row', () => {
    const l = local('2026-09-10T00:00:00.000Z', 0);
    const remote = row('2026-09-11T00:00:00.000Z', {
      deleted_at: '2026-09-11T00:00:00.000Z',
    });
    expect(mergeRow(l, remote)!.deleted_at).toBe('2026-09-11T00:00:00.000Z');
  });

  it('keeps a local tombstone that is newer than the remote row', () => {
    const l = local('2026-09-12T00:00:00.000Z', 1, {
      deleted_at: '2026-09-12T00:00:00.000Z',
    });
    const remote = row('2026-09-11T00:00:00.000Z');
    expect(mergeRow(l, remote)!.deleted_at).toBe('2026-09-12T00:00:00.000Z');
  });

  it('returns undefined when both sides are missing', () => {
    expect(mergeRow(undefined, undefined)).toBeUndefined();
  });

  it('treats the Postgres and JS renderings of one instant as a tie', () => {
    // PostgREST omits the fraction when it is zero and uses +00:00, not Z.
    const l = local('2026-09-11T00:00:00.000Z', 1);
    const remote = row('2026-09-11T00:00:00+00:00');
    expect(mergeRow(l, remote)!._dirty).toBe(0);
  });

  it('compares sub-second precision across both renderings', () => {
    const l = local('2026-09-11T00:00:00.500Z', 1);
    const remote = row('2026-09-11T00:00:00.250000+00:00');
    // Local is genuinely 250ms newer, so it wins and stays queued.
    expect(mergeRow(l, remote)!._dirty).toBe(1);
    expect(mergeRow(l, remote)!.updated_at).toBe('2026-09-11T00:00:00.500Z');
  });
});
