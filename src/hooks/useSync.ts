import { useEffect, useState } from 'react';
import type { SyncState } from '../types';
import { syncService } from '../services/sync';

/** État de la synchronisation offline-first (réseau, trajets en attente, dernière synchro). */
export function useSync() {
  const [state, setState] = useState<SyncState>(() => syncService.getState());

  useEffect(() => {
    const unsubscribe = syncService.subscribe(setState);
    void syncService.init();
    return () => {
      unsubscribe();
    };
  }, []);

  return { ...state, syncNow: () => syncService.syncNow() };
}
