import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trip } from '../types';

const store = new Map<string, string>();
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => void store.set(key, value),
    remove: async ({ key }: { key: string }) => void store.delete(key),
  },
}));
vi.mock('@capacitor/network', () => ({ Network: {} }));

const { tripStorage } = await import('./storage');
const { SyncService } = await import('./sync');

const trip = (id: string): Trip => ({
  id,
  name: id,
  mode: 'gps',
  startedAt: 0,
  endedAt: 1000,
  points: [],
  activeDurationMs: 1000,
  resumedAt: null,
  updatedAt: 1000,
  syncedAt: null,
});

function fakeNetwork(initial: boolean) {
  let listener: ((online: boolean) => void) | null = null;
  let online = initial;
  return {
    isOnline: async () => online,
    onChange: (l: (o: boolean) => void) => {
      listener = l;
      return () => (listener = null);
    },
    set(o: boolean) {
      online = o;
      listener?.(o);
    },
  };
}

describe('SyncService', () => {
  beforeEach(() => store.clear());
  afterEach(() => vi.useRealTimers());

  it('envoie les trajets en attente quand le réseau est disponible', async () => {
    await tripStorage.saveTrip(trip('a'));
    await tripStorage.saveTrip(trip('b'));
    const upload = vi.fn(async () => {});
    const svc = new SyncService({ upload }, tripStorage, fakeNetwork(true));
    await svc.init();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(await tripStorage.listUnsynced()).toEqual([]);
    expect(svc.getState().pendingCount).toBe(0);
    svc.dispose();
  });

  it('attend le retour du réseau pour synchroniser', async () => {
    await tripStorage.saveTrip(trip('a'));
    const upload = vi.fn(async () => {});
    const net = fakeNetwork(false);
    const svc = new SyncService({ upload }, tripStorage, net);
    await svc.init();
    expect(upload).not.toHaveBeenCalled();
    expect(svc.getState()).toMatchObject({ online: false, pendingCount: 1 });

    net.set(true);
    await svc.syncNow();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(svc.getState().pendingCount).toBe(0);
    svc.dispose();
  });

  it('réessaie après un échec (backoff)', async () => {
    vi.useFakeTimers();
    await tripStorage.saveTrip(trip('a'));
    const upload = vi.fn().mockRejectedValueOnce(new Error('HTTP 503')).mockResolvedValue(undefined);
    const svc = new SyncService({ upload }, tripStorage, fakeNetwork(true));
    await svc.init();
    expect(svc.getState()).toMatchObject({ lastError: 'HTTP 503', pendingCount: 1 });

    await vi.advanceTimersByTimeAsync(5_000);
    await svc.syncNow();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(svc.getState()).toMatchObject({ lastError: null, pendingCount: 0 });
    svc.dispose();
  });

  it('enchaîne une passe pour un trajet ajouté pendant une synchro', async () => {
    await tripStorage.saveTrip(trip('a'));
    let release!: () => void;
    const upload = vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((r) => (release = r)))
      .mockResolvedValue(undefined);
    const svc = new SyncService({ upload }, tripStorage, fakeNetwork(true));
    const first = svc.init();
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    await tripStorage.saveTrip(trip('b'));
    void svc.syncNow();
    release();
    await first;
    await svc.syncNow();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(await tripStorage.listUnsynced()).toEqual([]);
    svc.dispose();
  });
});
