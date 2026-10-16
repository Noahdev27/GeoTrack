import { beforeEach, describe, expect, it } from 'vitest';
import type { TrackPoint, Trip } from '../../types';
import { sqljsDriver } from '../../test/sqljsDriver';
import { IndexedDbTripRepository } from './indexedDbRepository';
import { SqliteTripRepository } from './sqliteRepository';
import { EMPTY_STATS, metaOf, type TripRepository } from './types';

const pt = (timestamp: number, segment = 0, lat = timestamp / 1e7): TrackPoint => ({
  lat,
  lng: 2.35,
  timestamp,
  accuracy: 5,
  speed: null,
  altitude: null,
  segment,
});

const trip = (id: string, startedAt: number, extra: Partial<Trip> = {}): Trip => ({
  id,
  name: `Trajet ${id}`,
  mode: 'simulation',
  startedAt,
  endedAt: startedAt + 20_000,
  points: [pt(startedAt), pt(startedAt + 10_000), pt(startedAt + 20_000)],
  activeDurationMs: 20_000,
  resumedAt: null,
  updatedAt: startedAt + 20_000,
  syncedAt: null,
  ...extra,
});

const implementations: [string, () => Promise<TripRepository>][] = [
  ['SQLite (sql.js)', async () => new SqliteTripRepository(await sqljsDriver())],
  ['IndexedDB', async () => new IndexedDbTripRepository(`test-${Math.random()}`)],
];

describe.each(implementations)('TripRepository — %s', (_name, create) => {
  let repo: TripRepository;

  beforeEach(async () => {
    repo = await create();
    await repo.init();
  });

  it('init est idempotent', async () => {
    await repo.init();
    await repo.saveTrip(trip('a', 1000));
    await repo.init();
    expect(await repo.listTrips()).toHaveLength(1);
  });

  it('enregistre et relit un trajet complet à l’identique', async () => {
    const t = trip('a', 1000, { syncedAt: null });
    await repo.saveTrip(t);
    expect(await repo.getTrip('a')).toEqual(t);
    expect(await repo.getTrip('inconnu')).toBeNull();
  });

  it('liste les trajets terminés, du plus récent au plus ancien, avec leurs stats', async () => {
    await repo.saveTrip(trip('ancien', 1000));
    await repo.saveTrip(trip('récent', 9000));
    await repo.saveTripMeta({ ...metaOf(trip('en-cours', 5000)), endedAt: null }, EMPTY_STATS);
    const list = await repo.listTrips();
    expect(list.map((t) => t.id)).toEqual(['récent', 'ancien']);
    expect(list[0].stats.distanceMeters).toBeGreaterThan(0);
    expect(list[0].stats.durationMs).toBe(20_000);
  });

  it('ajoute les points au fil de l’eau, sans doublon et triés', async () => {
    const meta = { ...metaOf(trip('live', 0)), endedAt: null, resumedAt: 0 };
    await repo.saveTripMeta(meta, EMPTY_STATS);
    await repo.appendPoints('live', [pt(3000), pt(1000)]);
    await repo.appendPoints('live', [pt(2000), pt(3000)]); // 3000 déjà présent
    const loaded = await repo.getTrip('live');
    expect(loaded!.points.map((p) => p.timestamp)).toEqual([1000, 2000, 3000]);
  });

  it('reprend le trajet actif le plus récent avec ses points', async () => {
    await repo.saveTrip(trip('terminé', 0));
    await repo.saveTripMeta({ ...metaOf(trip('actif-1', 100)), endedAt: null, updatedAt: 100 }, EMPTY_STATS);
    await repo.saveTripMeta({ ...metaOf(trip('actif-2', 200)), endedAt: null, updatedAt: 900 }, EMPTY_STATS);
    await repo.appendPoints('actif-2', [pt(201), pt(202, 1)]);
    const active = await repo.loadActiveTrip();
    expect(active?.id).toBe('actif-2');
    expect(active?.points.map((p) => p.segment)).toEqual([0, 1]);
  });

  it('aucun trajet actif → null', async () => {
    await repo.saveTrip(trip('terminé', 0));
    expect(await repo.loadActiveTrip()).toBeNull();
  });

  it('suit la synchronisation', async () => {
    await repo.saveTrip(trip('a', 1000));
    await repo.saveTrip(trip('b', 2000));
    await repo.saveTripMeta({ ...metaOf(trip('actif', 3000)), endedAt: null }, EMPTY_STATS);
    expect((await repo.listUnsynced()).map((t) => t.id)).toEqual(['a', 'b']);
    await repo.markSynced('a', 42);
    expect((await repo.listUnsynced()).map((t) => t.id)).toEqual(['b']);
    expect((await repo.getTrip('a'))!.syncedAt).toBe(42);
    await repo.markSynced('inconnu', 1); // sans effet
  });

  it('supprime un trajet et tous ses points', async () => {
    await repo.saveTrip(trip('a', 1000));
    await repo.saveTrip(trip('b', 2000));
    await repo.deleteTrip('a');
    expect((await repo.listTrips()).map((t) => t.id)).toEqual(['b']);
    // Un trajet recréé avec le même id ne récupère pas d'anciens points.
    await repo.saveTripMeta({ ...metaOf(trip('a', 1000)), endedAt: null }, EMPTY_STATS);
    expect((await repo.getTrip('a'))!.points).toEqual([]);
    expect((await repo.getTrip('b'))!.points).toHaveLength(3);
  });

  it('tient la charge : 20 000 points ajoutés par lots', async () => {
    await repo.saveTripMeta({ ...metaOf(trip('long', 0)), endedAt: null }, EMPTY_STATS);
    const all = Array.from({ length: 20_000 }, (_, i) => pt(i * 1000));
    for (let i = 0; i < all.length; i += 500) await repo.appendPoints('long', all.slice(i, i + 500));
    const loaded = await repo.getTrip('long');
    expect(loaded!.points).toHaveLength(20_000);
    expect(loaded!.points.at(-1)!.timestamp).toBe(19_999_000);
  });
});
