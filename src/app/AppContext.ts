import { createContext, useContext } from 'react';
import type { SyncStatus } from '../sync/types';

export interface AppContextValue {
  userId: string;
  syncStatus: SyncStatus | null;
  syncBusy: boolean;
  /** Ask for a sync now. Ignored while one is already running. */
  requestSync: () => void;
  /** Run a task that must not overlap a sync: wiping, restoring, signing out. */
  exclusive: <T>(task: () => Promise<T>) => Promise<T>;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppContext.Provider>');
  return value;
}
