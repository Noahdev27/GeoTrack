import { beforeEach, describe, expect, it, vi } from 'vitest';

const bg = {
  addWatcher: vi.fn(),
  removeWatcher: vi.fn(async () => {}),
  openSettings: vi.fn(async () => {}),
};
const native = { value: true };

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.value },
  registerPlugin: () => bg,
}));
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: { watchPosition: vi.fn(async () => 'web-1'), clearWatch: vi.fn(async () => {}) },
}));

const { watchLocation, openAppSettings, BACKGROUND_NOTIFICATION } = await import('./locationWatcher');
const { Geolocation } = await import('@capacitor/geolocation');

describe('watchLocation — Android (arrière-plan)', () => {
  beforeEach(() => {
    native.value = true;
    vi.clearAllMocks();
  });

  it('démarre un watcher avec notification persistante, sans redemander la permission', async () => {
    bg.addWatcher.mockResolvedValue('bg-1');
    const stop = await watchLocation(vi.fn(), vi.fn());
    expect(bg.addWatcher).toHaveBeenCalledWith(
      expect.objectContaining({ ...BACKGROUND_NOTIFICATION, requestPermissions: false, stale: false }),
      expect.any(Function),
    );
    await stop();
    expect(bg.removeWatcher).toHaveBeenCalledWith({ id: 'bg-1' });
  });

  it('convertit les positions et transmet les erreurs avec leur code', async () => {
    let callback!: (location?: unknown, error?: unknown) => void;
    bg.addWatcher.mockImplementation(async (_opts, cb) => {
      callback = cb;
      return 'bg-1';
    });
    const onFix = vi.fn();
    const onError = vi.fn();
    await watchLocation(onFix, onError);

    callback({
      latitude: 48.85,
      longitude: 2.35,
      accuracy: 6,
      altitude: null,
      altitudeAccuracy: null,
      simulated: false,
      bearing: 90,
      speed: 12,
      time: 1234,
    });
    expect(onFix).toHaveBeenCalledWith({
      lat: 48.85,
      lng: 2.35,
      timestamp: 1234,
      accuracy: 6,
      speed: 12,
      altitude: null,
      heading: 90,
    });

    callback(undefined, Object.assign(new Error('Permission denied.'), { code: 'NOT_AUTHORIZED' }));
    expect(onError).toHaveBeenCalledWith({ message: 'Permission denied.', code: 'NOT_AUTHORIZED' });
  });

  it('horodate une position sans heure', async () => {
    let callback!: (location?: unknown) => void;
    bg.addWatcher.mockImplementation(async (_opts, cb) => {
      callback = cb;
      return 'bg-1';
    });
    const onFix = vi.fn();
    await watchLocation(onFix, vi.fn());
    callback({ latitude: 1, longitude: 2, accuracy: 5, time: null });
    expect(onFix.mock.calls[0][0].timestamp).toBeGreaterThan(0);
  });

  it('ouvre les réglages de l’app', async () => {
    await openAppSettings();
    expect(bg.openSettings).toHaveBeenCalled();
  });
});

describe('watchLocation — web', () => {
  beforeEach(() => {
    native.value = false;
    vi.clearAllMocks();
  });

  it('utilise navigator.geolocation via @capacitor/geolocation', async () => {
    const stop = await watchLocation(vi.fn(), vi.fn());
    expect(Geolocation.watchPosition).toHaveBeenCalled();
    expect(bg.addWatcher).not.toHaveBeenCalled();
    await stop();
    expect(Geolocation.clearWatch).toHaveBeenCalledWith({ id: 'web-1' });
    await openAppSettings();
    expect(bg.openSettings).not.toHaveBeenCalled();
  });
});
