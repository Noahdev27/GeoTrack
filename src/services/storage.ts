import { Preferences } from '@capacitor/preferences';
import type { Trip, TripSummary } from '../types';
import { computeStats } from '../utils/geo';

/**
 * Stockage offline des trajets via Capacitor Preferences
 * (SharedPreferences sur Android, localStorage sur le web).
 *
 * Schéma :
 *  - `geotrack:index`      → TripSummary[] (historique léger, du plus récent au plus ancien)
 *  - `geotrack:trip:<id>`  → Trip complet (avec tous les points)
 *  - `geotrack:active`     → Trip en cours, pour reprise après fermeture / crash de l'app
 */
const INDEX_KEY = 'geotrack:index';
const ACTIVE_KEY = 'geotrack:active';
const tripKey = (id: string) => `geotrack:trip:${id}`;

async function readJson<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key });
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    console.warn(`[storage] Valeur corrompue pour ${key}, ignorée`);
    return null;
  }
}

const writeJson = (key: string, value: unknown) => Preferences.set({ key, value: JSON.stringify(value) });

// Les mises à jour de l'index sont sérialisées pour éviter les écritures concurrentes (read-modify-write).
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export function toSummary(trip: Trip): TripSummary {
  return {
    id: trip.id,
    name: trip.name,
    mode: trip.mode,
    startedAt: trip.startedAt,
    endedAt: trip.endedAt,
    stats: computeStats(trip, trip.endedAt ?? trip.updatedAt),
    syncedAt: trip.syncedAt,
  };
}

export const tripStorage = {
  async listTrips(): Promise<TripSummary[]> {
    return (await readJson<TripSummary[]>(INDEX_KEY)) ?? [];
  },

  getTrip(id: string): Promise<Trip | null> {
    return readJson<Trip>(tripKey(id));
  },

  saveTrip(trip: Trip): Promise<void> {
    return serialized(async () => {
      await writeJson(tripKey(trip.id), trip);
      const index = (await readJson<TripSummary[]>(INDEX_KEY)) ?? [];
      const next = [toSummary(trip), ...index.filter((t) => t.id !== trip.id)].sort((a, b) => b.startedAt - a.startedAt);
      await writeJson(INDEX_KEY, next);
    });
  },

  deleteTrip(id: string): Promise<void> {
    return serialized(async () => {
      await Preferences.remove({ key: tripKey(id) });
      const index = (await readJson<TripSummary[]>(INDEX_KEY)) ?? [];
      await writeJson(
        INDEX_KEY,
        index.filter((t) => t.id !== id),
      );
    });
  },

  async markSynced(id: string, syncedAt: number): Promise<void> {
    const trip = await this.getTrip(id);
    if (!trip) return;
    await this.saveTrip({ ...trip, syncedAt });
  },

  async listUnsynced(): Promise<TripSummary[]> {
    return (await this.listTrips()).filter((t) => t.endedAt !== null && t.syncedAt === null);
  },

  loadActiveTrip(): Promise<Trip | null> {
    return readJson<Trip>(ACTIVE_KEY);
  },

  async saveActiveTrip(trip: Trip | null): Promise<void> {
    if (trip) await writeJson(ACTIVE_KEY, trip);
    else await Preferences.remove({ key: ACTIVE_KEY });
  },
};

export type TripStorage = typeof tripStorage;
