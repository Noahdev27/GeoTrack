import { useCallback, useEffect, useState } from 'react';
import type { Trip, TripSummary } from '../types';
import { tripStorage } from '../services/storage';

/** Historique des trajets enregistrés localement. */
export function useTripHistory(refreshKey: unknown) {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setTrips(await tripStorage.listTrips());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  const remove = useCallback(
    async (id: string) => {
      await tripStorage.deleteTrip(id);
      await refresh();
    },
    [refresh],
  );

  const load = useCallback((id: string): Promise<Trip | null> => tripStorage.getTrip(id), []);

  return { trips, loading, refresh, remove, load };
}
