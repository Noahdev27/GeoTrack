// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { FAKE_TIMERS, memoryStore } from '../test/mocks';
import type { Trip } from '../types';

vi.mock('@capacitor/preferences', async () => (await import('../test/mocks')).preferencesMock);
vi.mock('@capacitor/network', async () => (await import('../test/mocks')).networkMock);
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' })),
    requestPermissions: vi.fn(async () => ({ location: 'granted', coarseLocation: 'granted' })),
    watchPosition: vi.fn(async () => 'watch-1'),
    clearWatch: vi.fn(async () => {}),
  },
}));
vi.mock('../services/sync', () => ({ syncService: { syncNow: vi.fn(async () => {}) } }));

const { useTracker } = await import('./useTracker');
const { Geolocation } = await import('@capacitor/geolocation');
const { tripStorage, resetTripStorageForTests } = await import('../services/storage');
const { syncService } = await import('../services/sync');

/** Laisse s'écouler `ms` (timers + promesses) dans un act(). */
const elapse = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

/**
 * Attend une condition en laissant tourner les vraies macro-tâches (fake-indexeddb utilise setImmediate,
 * que vi.waitFor ne laisse pas s'exécuter sous faux timers).
 */
async function until(condition: () => boolean) {
  for (let i = 0; i < 100 && !condition(); i++) {
    await act(() => new Promise<void>((resolve) => setImmediate(resolve)));
  }
  expect(condition()).toBe(true);
}

describe('useTracker', () => {
  beforeEach(() => {
    memoryStore.clear();
    resetTripStorageForTests();
    vi.useFakeTimers(FAKE_TIMERS);
    vi.setSystemTime(new Date(2026, 9, 16, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('démarre une simulation et accumule distance et temps', async () => {
    const { result } = renderHook(() => useTracker());
    await elapse(0);
    expect(result.current.status).toBe('idle');

    await act(() => result.current.start());
    expect(result.current.status).toBe('tracking');
    await elapse(5000);

    expect(result.current.trip!.points.length).toBeGreaterThanOrEqual(4);
    expect(result.current.stats!.distanceMeters).toBeGreaterThan(20);
    expect(result.current.stats!.durationMs).toBe(5000);
    expect(result.current.stats!.currentSpeedKmh).toBeGreaterThan(0);
  });

  it('pause : temps figé, pas de nouveaux points ; reprise : nouveau segment', async () => {
    const { result } = renderHook(() => useTracker());
    await act(() => result.current.start());
    await elapse(3000);

    act(() => result.current.pause());
    const pointsAtPause = result.current.trip!.points.length;
    await elapse(10_000);
    expect(result.current.status).toBe('paused');
    expect(result.current.trip!.points.length).toBe(pointsAtPause);
    expect(result.current.stats!.durationMs).toBe(3000);
    expect(result.current.stats!.currentSpeedKmh).toBe(0);
    // L'état en pause est persisté pour une reprise après fermeture de l'app.
    expect((await tripStorage.loadActiveTrip())?.resumedAt).toBeNull();

    await act(() => result.current.resume());
    await elapse(3000);
    const points = result.current.trip!.points;
    expect(points.at(-1)!.segment).toBe(1);
    expect(points[0].segment).toBe(0);
    expect(result.current.stats!.durationMs).toBe(6000);
  });

  it('terminer : enregistre le trajet, vide le trajet actif et déclenche la synchro', async () => {
    const { result } = renderHook(() => useTracker());
    await act(() => result.current.start());
    await elapse(4000);

    let saved: Trip | null = null;
    await act(async () => {
      saved = await result.current.stop();
    });
    expect(saved).not.toBeNull();
    expect(saved!.endedAt).not.toBeNull();
    expect(result.current.status).toBe('idle');
    expect(result.current.trip).toBeNull();
    expect(await tripStorage.loadActiveTrip()).toBeNull();
    expect((await tripStorage.listTrips()).map((t) => t.id)).toEqual([saved!.id]);
    expect(syncService.syncNow).toHaveBeenCalled();
  });

  it("n'enregistre pas un trajet trop court", async () => {
    const { result } = renderHook(() => useTracker());
    await act(() => result.current.start());
    let saved: Trip | null = null;
    await act(async () => {
      saved = await result.current.stop();
    });
    expect(saved).toBeNull();
    expect(result.current.error).toMatch(/trop court/);
    expect(await tripStorage.listTrips()).toEqual([]);
  });

  it('restaure en pause un trajet interrompu (app tuée pendant un suivi)', async () => {
    const t0 = Date.now() - 60_000;
    const interrupted: Trip = {
      id: 'live',
      name: 'live',
      mode: 'simulation',
      startedAt: t0,
      endedAt: null,
      points: [
        { lat: 0, lng: 0, timestamp: t0, segment: 0 },
        { lat: 0.001, lng: 0, timestamp: t0 + 20_000, segment: 0 },
      ],
      activeDurationMs: 0,
      resumedAt: t0,
      updatedAt: t0 + 20_000,
      syncedAt: null,
    };
    await tripStorage.saveTrip(interrupted);

    const { result } = renderHook(() => useTracker());
    await until(() => result.current.status === 'paused');
    expect(result.current.restored).toBe(true);
    // Le temps écoulé pendant que l'app était fermée n'est pas compté.
    expect(result.current.stats!.durationMs).toBe(20_000);

    await act(() => result.current.resume());
    await elapse(2000);
    expect(result.current.trip!.points.at(-1)!.segment).toBe(1);
  });

  it('les points sont écrits pendant le suivi : un arrêt brutal de l’app ne perd que les 2 dernières secondes', async () => {
    const first = renderHook(() => useTracker());
    await act(() => first.result.current.start());
    await elapse(10_000);
    const recorded = first.result.current.trip!.points.length;
    await until(() => true); // laisse IndexedDB terminer les écritures en cours
    first.unmount(); // l'app est tuée sans « Terminer »

    resetTripStorageForTests();
    const second = renderHook(() => useTracker());
    await until(() => second.result.current.status === 'paused');
    const restoredPoints = second.result.current.trip!.points.length;
    expect(restoredPoints).toBeGreaterThanOrEqual(recorded - 2);
    expect(restoredPoints).toBeLessThanOrEqual(recorded);
    expect(second.result.current.stats!.distanceMeters).toBeGreaterThan(50);
  });

  it('interdit de changer de mode pendant un suivi', async () => {
    const { result } = renderHook(() => useTracker());
    await act(() => result.current.start());
    act(() => result.current.setMode('gps'));
    expect(result.current.mode).toBe('simulation');
  });

  describe('mode GPS', () => {
    beforeEach(() => {
      // jsdom n'expose pas navigator.geolocation : on le déclare pour passer la détection de support.
      Object.defineProperty(navigator, 'geolocation', { value: {}, configurable: true });
    });

    it('refuse de démarrer si la permission est refusée', async () => {
      vi.mocked(Geolocation.checkPermissions).mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });
      const { result } = renderHook(() => useTracker());
      act(() => result.current.setMode('gps'));
      await act(() => result.current.start());
      expect(result.current.status).toBe('idle');
      expect(result.current.error).toMatch(/localisation est nécessaire/);
      expect(result.current.permission).toBe('denied');
    });

    it('ingère les relevés GPS en filtrant le bruit', async () => {
      vi.mocked(Geolocation.checkPermissions).mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
      type Callback = Parameters<typeof Geolocation.watchPosition>[1];
      let emit: Callback = () => {};
      vi.mocked(Geolocation.watchPosition).mockImplementation(async (_opts, cb) => {
        emit = cb;
        return 'watch-1';
      });
      type Position = Parameters<Callback>[0] & object;
      const fix = (lat: number, dt: number, accuracy = 5): Position => ({
        timestamp: Date.now() + dt,
        coords: {
          latitude: lat,
          longitude: 0,
          accuracy,
          altitude: null,
          altitudeAccuracy: null,
          speed: null,
          heading: null,
          magneticHeading: null,
          trueHeading: null,
          headingAccuracy: null,
          course: null,
        },
      });

      const { result } = renderHook(() => useTracker());
      act(() => result.current.setMode('gps'));
      await act(() => result.current.start());
      await elapse(0);
      expect(Geolocation.watchPosition).toHaveBeenCalled();

      act(() => {
        emit(fix(0, 0), undefined);
        emit(fix(0.000005, 1000), undefined); // ~0,5 m : jitter ignoré
        emit(fix(0.001, 2000, 200), undefined); // précision 200 m : ignoré
        emit(fix(0.001, 10_000), undefined); // ~111 m en 10 s : accepté
      });
      expect(result.current.trip!.points).toHaveLength(2);
      expect(result.current.liveFix?.accuracy).toBe(5);

      await act(async () => {
        await result.current.stop();
      });
      expect(Geolocation.clearWatch).toHaveBeenCalledWith({ id: 'watch-1' });
    });
  });
});
