import { Preferences } from '@capacitor/preferences';
import type { Trip, TripSummary } from '../../types';
import type { TripRepository } from './types';

/** Clés utilisées par le stockage du MVP (v0.1, Capacitor Preferences). */
const LEGACY_INDEX = 'geotrack:index';
const LEGACY_ACTIVE = 'geotrack:active';
const legacyTripKey = (id: string) => `geotrack:trip:${id}`;

async function readLegacy<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key });
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Importe les trajets du MVP dans le nouveau stockage puis supprime les anciennes clés.
 * Idempotent : une clé n'est supprimée qu'après l'import réussi du trajet correspondant.
 * @returns nombre de trajets importés
 */
export async function migrateFromPreferences(repo: TripRepository): Promise<number> {
  let imported = 0;
  const index = await readLegacy<TripSummary[]>(LEGACY_INDEX);

  for (const { id } of index ?? []) {
    const trip = await readLegacy<Trip>(legacyTripKey(id));
    if (trip) {
      await repo.saveTrip(trip);
      imported++;
    }
    await Preferences.remove({ key: legacyTripKey(id) });
  }
  if (index) await Preferences.remove({ key: LEGACY_INDEX });

  const active = await readLegacy<Trip>(LEGACY_ACTIVE);
  if (active && active.endedAt === null) {
    await repo.saveTrip(active);
    imported++;
  }
  if (active) await Preferences.remove({ key: LEGACY_ACTIVE });

  return imported;
}
