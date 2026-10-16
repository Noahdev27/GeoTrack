import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trip } from '../types';
import { FAKE_TIMERS } from '../test/mocks';

vi.mock('@capacitor/preferences', async () => (await import('../test/mocks')).preferencesMock);
vi.mock('@capacitor/network', () => ({ Network: {} }));

const { tripStorage, resetTripStorageForTests } = await import('./storage');
const { SyncService, httpTransport, mockTransport } = await import('./sync');

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
  beforeEach(() => resetTripStorageForTests());
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
    vi.useFakeTimers(FAKE_TIMERS);
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

describe('transports', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('httpTransport envoie le trajet en POST JSON', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await httpTransport('https://api.example.test/trips').upload(trip('a'));
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trip('a')),
    });
  });

  it('httpTransport rejette une réponse en erreur', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 503 })),
    );
    await expect(httpTransport('https://api.example.test/trips').upload(trip('a'))).rejects.toThrow('HTTP 503');
  });

  it('mockTransport échoue hors-ligne', async () => {
    vi.useFakeTimers(FAKE_TIMERS);
    vi.stubGlobal('navigator', { onLine: false });
    const upload = mockTransport(10).upload(trip('a'));
    const assertion = expect(upload).rejects.toThrow('Réseau indisponible');
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });
});
