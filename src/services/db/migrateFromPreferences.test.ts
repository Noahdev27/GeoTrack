import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from '../../test/mocks';
import { sqljsDriver } from '../../test/sqljsDriver';
import type { Trip } from '../../types';
import { SqliteTripRepository } from './sqliteRepository';

vi.mock('@capacitor/preferences', async () => (await import('../../test/mocks')).preferencesMock);

const { migrateFromPreferences } = await import('./migrateFromPreferences');

const legacyTrip = (id: string, endedAt: number | null): Trip => ({
  id,
  name: id,
  mode: 'gps',
  startedAt: 1000,
  endedAt,
  points: [
    { lat: 0, lng: 0, timestamp: 1000, segment: 0 },
    { lat: 0.001, lng: 0, timestamp: 11_000, segment: 0 },
  ],
  activeDurationMs: 10_000,
  resumedAt: endedAt === null ? 1000 : null,
  updatedAt: 11_000,
  syncedAt: null,
});

describe('migrateFromPreferences (stockage v0.1 → base locale)', () => {
  beforeEach(() => {
    memoryStore.clear();
    memoryStore.set('geotrack:index', JSON.stringify([{ id: 'a' }, { id: 'b' }, { id: 'perdu' }]));
    memoryStore.set('geotrack:trip:a', JSON.stringify(legacyTrip('a', 20_000)));
    memoryStore.set('geotrack:trip:b', JSON.stringify({ ...legacyTrip('b', 30_000), syncedAt: 99 }));
    memoryStore.set('geotrack:active', JSON.stringify(legacyTrip('live', null)));
  });

  it('importe les trajets terminés et le trajet en cours, puis nettoie les anciennes clés', async () => {
    const repo = new SqliteTripRepository(await sqljsDriver());
    await repo.init();

    expect(await migrateFromPreferences(repo)).toBe(3);
    expect((await repo.listTrips()).map((t) => t.id).sort()).toEqual(['a', 'b']);
    expect((await repo.getTrip('b'))!.syncedAt).toBe(99);
    expect((await repo.getTrip('a'))!.points).toHaveLength(2);
    expect((await repo.loadActiveTrip())!.id).toBe('live');
    expect([...memoryStore.keys()]).toEqual([]);

    // Deuxième passage : plus rien à importer, aucune donnée perdue.
    expect(await migrateFromPreferences(repo)).toBe(0);
    expect(await repo.listTrips()).toHaveLength(2);
  });

  it('ignore une valeur corrompue', async () => {
    memoryStore.set('geotrack:trip:a', '{oops');
    const repo = new SqliteTripRepository(await sqljsDriver());
    await repo.init();
    expect(await migrateFromPreferences(repo)).toBe(2);
  });
});
