import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStore } from '../test/mocks';
import type { Trip } from '../types';

vi.mock('@capacitor/preferences', async () => (await import('../test/mocks')).preferencesMock);

const { tripStorage, resetTripStorageForTests, toSummary } = await import('./storage');

const trip = (id: string): Trip => ({
  id,
  name: id,
  mode: 'simulation',
  startedAt: 1000,
  endedAt: 21_000,
  points: [
    { lat: 0, lng: 0, timestamp: 1000, segment: 0 },
    { lat: 0.001, lng: 0, timestamp: 11_000, segment: 0 },
  ],
  activeDurationMs: 20_000,
  resumedAt: null,
  updatedAt: 21_000,
  syncedAt: null,
});

describe('tripStorage (façade)', () => {
  beforeEach(() => {
    memoryStore.clear();
    resetTripStorageForTests();
  });

  it('utilise IndexedDB hors plateforme native', async () => {
    await tripStorage.saveTrip(trip('a'));
    expect((await tripStorage.listTrips()).map((t) => t.id)).toEqual(['a']);
    const databases = await indexedDB.databases();
    expect(databases.map((d) => d.name)).toContain('geotrack');
  });

  it('migre les données v0.1 au premier accès', async () => {
    memoryStore.set('geotrack:index', JSON.stringify([{ id: 'legacy' }]));
    memoryStore.set('geotrack:trip:legacy', JSON.stringify(trip('legacy')));
    vi.spyOn(console, 'info').mockImplementation(() => {});
    expect((await tripStorage.listTrips()).map((t) => t.id)).toEqual(['legacy']);
    expect(memoryStore.size).toBe(0);
  });

  it('toSummary calcule les métriques', () => {
    expect(toSummary(trip('a')).stats.distanceMeters).toBeCloseTo(111.2, 0);
  });
});
