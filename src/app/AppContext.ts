import { createContext, useContext } from 'react';
import type { SyncStatus } from '../sync/types';

export interface AppContextValue {
  userId: string;
  syncStatus: SyncStatus | null;
  syncBusy: boolean;
  /** Ask for a sync now. Ignored while one is already running. */
  requestSync: () => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used inside <AppContext.Provider>');
  return value;
}
