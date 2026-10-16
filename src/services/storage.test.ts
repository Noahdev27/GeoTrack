import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trip } from '../types';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
  },
}));

const { tripStorage } = await import('./storage');

const makeTrip = (id: string, startedAt: number, extra: Partial<Trip> = {}): Trip => ({
  id,
  name: id,
  mode: 'simulation',
  startedAt,
  endedAt: startedAt + 20_000,
  points: [
    { lat: 0, lng: 0, timestamp: startedAt, segment: 0 },
    { lat: 0.001, lng: 0, timestamp: startedAt + 10_000, segment: 0 },
  ],
  activeDurationMs: 20_000,
  resumedAt: null,
  updatedAt: startedAt + 20_000,
  syncedAt: null,
  ...extra,
});

describe('tripStorage', () => {
  beforeEach(() => store.clear());

  it('enregistre un trajet et met à jour l’index trié', async () => {
    await tripStorage.saveTrip(makeTrip('a', 1000));
    await tripStorage.saveTrip(makeTrip('b', 5000));
    const list = await tripStorage.listTrips();
    expect(list.map((t) => t.id)).toEqual(['b', 'a']);
    expect(list[0].stats.distanceMeters).toBeCloseTo(111.2, 0);
    expect((await tripStorage.getTrip('a'))?.points).toHaveLength(2);
  });

  it('supporte les écritures concurrentes sans perdre d’entrée', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => tripStorage.saveTrip(makeTrip(`t${i}`, i))));
    expect(await tripStorage.listTrips()).toHaveLength(10);
  });

  it('suit l’état de synchronisation', async () => {
    await tripStorage.saveTrip(makeTrip('a', 1000));
    await tripStorage.saveTrip(makeTrip('b', 2000));
    expect((await tripStorage.listUnsynced()).map((t) => t.id).sort()).toEqual(['a', 'b']);
    await tripStorage.markSynced('a', 99);
    expect((await tripStorage.listUnsynced()).map((t) => t.id)).toEqual(['b']);
  });

  it('supprime un trajet', async () => {
    await tripStorage.saveTrip(makeTrip('a', 1000));
    await tripStorage.deleteTrip('a');
    expect(await tripStorage.listTrips()).toEqual([]);
    expect(await tripStorage.getTrip('a')).toBeNull();
  });

  it('sauvegarde et efface le trajet actif', async () => {
    await tripStorage.saveActiveTrip(makeTrip('live', 0, { endedAt: null }));
    expect((await tripStorage.loadActiveTrip())?.id).toBe('live');
    await tripStorage.saveActiveTrip(null);
    expect(await tripStorage.loadActiveTrip()).toBeNull();
  });

  it('ignore une valeur corrompue', async () => {
    store.set('geotrack:index', '{oops');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await tripStorage.listTrips()).toEqual([]);
  });
});
