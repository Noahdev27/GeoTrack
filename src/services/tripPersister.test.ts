import { describe, expect, it, vi } from 'vitest';
import type { TrackPoint } from '../types';
import { EMPTY_STATS, type TripMeta } from './db/types';
import { TripPersister } from './tripPersister';

const meta = (id = 't1'): TripMeta => ({
  id,
  name: id,
  mode: 'simulation',
  startedAt: 0,
  endedAt: null,
  activeDurationMs: 0,
  resumedAt: 0,
  updatedAt: 0,
  syncedAt: null,
});
const pt = (timestamp: number): TrackPoint => ({ lat: 0, lng: timestamp / 1e6, timestamp, segment: 0 });

function fakeStorage() {
  const calls: string[] = [];
  return {
    calls,
    saveTripMeta: vi.fn(async (m: TripMeta) => void calls.push(`meta:${m.id}`)),
    appendPoints: vi.fn(async (id: string, p: readonly TrackPoint[]) => void calls.push(`points:${id}:${p.length}`)),
    deleteTrip: vi.fn(async (id: string) => void calls.push(`delete:${id}`)),
  };
}

describe('TripPersister', () => {
  it('écrit les points par lots et à la demande', async () => {
    const storage = fakeStorage();
    const p = new TripPersister(storage, { maxBatch: 3 });
    p.begin(meta(), EMPTY_STATS);
    [1, 2, 3, 4].forEach((t) => p.push(pt(t)));
    expect(p.pendingCount).toBe(1);
    p.flush();
    await p.idle();
    expect(storage.calls).toEqual(['meta:t1', 'points:t1:3', 'points:t1:1']);
  });

  it('sérialise les écritures (suppression après les ajouts)', async () => {
    const storage = fakeStorage();
    let release!: () => void;
    storage.appendPoints.mockImplementationOnce(() => new Promise<undefined>((r) => (release = () => r(undefined))));
    const p = new TripPersister(storage);
    p.begin(meta(), EMPTY_STATS);
    p.push(pt(1));
    p.flush();
    p.discard();
    await vi.waitFor(() => expect(storage.appendPoints).toHaveBeenCalled());
    expect(storage.deleteTrip).not.toHaveBeenCalled();
    release();
    await p.idle();
    expect(storage.deleteTrip).toHaveBeenCalledWith('t1');
  });

  it('remet le lot en attente si l’écriture échoue, et signale l’erreur', async () => {
    const storage = fakeStorage();
    storage.appendPoints.mockRejectedValueOnce(new Error('disque plein'));
    const onError = vi.fn();
    const p = new TripPersister(storage, { onError });
    p.begin(meta(), EMPTY_STATS);
    p.push(pt(1));
    p.push(pt(2));
    p.flush();
    await p.idle();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'disque plein' }));
    expect(p.pendingCount).toBe(2);
    p.flush();
    await p.idle();
    expect(storage.appendPoints).toHaveBeenLastCalledWith('t1', [pt(1), pt(2)]);
    expect(p.pendingCount).toBe(0);
  });

  it('ignore les points sans trajet associé', async () => {
    const storage = fakeStorage();
    const p = new TripPersister(storage);
    p.push(pt(1));
    p.flush();
    await p.idle();
    expect(storage.appendPoints).not.toHaveBeenCalled();
  });
});
