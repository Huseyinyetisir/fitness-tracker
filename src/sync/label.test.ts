import { describe, it, expect } from 'vitest';
import { syncLabel } from './label';
import type { SyncStatus } from './types';

function status(partial: Partial<SyncStatus>): SyncStatus {
  return { phase: 'idle', pendingCount: 0, lastSyncedAt: null, error: null, ...partial };
}

describe('syncLabel', () => {
  it('says offline when the device has no connection', () => {
    expect(syncLabel(status({}), false, false)).toBe('Offline');
  });

  it('counts queued changes while offline', () => {
    expect(syncLabel(status({ pendingCount: 3 }), false, false)).toBe('Offline · 3 pending');
  });

  it('reports a sync in progress', () => {
    expect(syncLabel(status({}), true, true)).toBe('Syncing…');
  });

  it('treats a failed fetch as being offline, not as an error', () => {
    expect(syncLabel(status({ error: 'TypeError: Failed to fetch' }), false, true)).toBe('Offline · will retry');
  });

  it('shows queued changes alongside a network failure', () => {
    expect(syncLabel(status({ error: 'Failed to fetch', pendingCount: 2 }), false, true)).toBe('Offline · 2 pending');
  });

  it('shows any other error verbatim', () => {
    expect(syncLabel(status({ error: 'permission denied for table sessions' }), false, true)).toBe(
      'Sync error: permission denied for table sessions',
    );
  });

  it('shows the pending count', () => {
    expect(syncLabel(status({ pendingCount: 5 }), false, true)).toBe('5 pending');
  });

  it('shows the last sync time in 24-hour form', () => {
    expect(syncLabel(status({ lastSyncedAt: '2026-10-04T10:08:00.000Z' }), false, true)).toMatch(
      /^Synced \d{2}:\d{2}$/,
    );
  });

  it('says when nothing has synced yet', () => {
    expect(syncLabel(null, false, true)).toBe('Not synced yet');
  });
});
