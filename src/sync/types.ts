import type { ISODateTime } from '../types/domain';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  pendingCount: number;
  lastSyncedAt: ISODateTime | null;
  error: string | null;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
}
