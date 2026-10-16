import { Capacitor, registerPlugin } from '@capacitor/core';
import { Geolocation, type Position } from '@capacitor/geolocation';
import type { BackgroundGeolocationPlugin, Location } from '@capacitor-community/background-geolocation';

export interface GeoFix {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
  heading: number | null;
}

/** Erreur transmise par une source de position (message brut + code éventuel du plugin). */
export interface WatchError {
  message: string;
  code?: string | number;
}

/** Arrête l'écoute des positions. */
export type StopWatching = () => Promise<void>;

/**
 * Plugin natif de suivi en arrière-plan : un service Android de premier plan (notification
 * persistante) maintient l'app en vie et continue de livrer les positions écran éteint.
 * Le paquet ne fournit que des types : l'objet est enregistré par son nom natif.
 */
const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

export const BACKGROUND_NOTIFICATION = {
  backgroundTitle: 'GeoTrack — suivi en cours',
  backgroundMessage: 'Votre trajet est enregistré. Ouvrez GeoTrack pour le mettre en pause ou le terminer.',
};

export function fromBackgroundLocation(l: Location): GeoFix {
  return {
    lat: l.latitude,
    lng: l.longitude,
    timestamp: l.time ?? Date.now(),
    accuracy: l.accuracy ?? null,
    speed: l.speed ?? null,
    altitude: l.altitude ?? null,
    heading: l.bearing ?? null,
  };
}

export function fromPosition(p: Position): GeoFix {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    timestamp: p.timestamp,
    accuracy: p.coords.accuracy ?? null,
    speed: p.coords.speed ?? null,
    altitude: p.coords.altitude ?? null,
    heading: p.coords.heading ?? null,
  };
}

const toWatchError = (err: unknown): WatchError => {
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown };
    return {
      message: typeof e.message === 'string' ? e.message : JSON.stringify(err),
      code: typeof e.code === 'string' || typeof e.code === 'number' ? e.code : undefined,
    };
  }
  return { message: String(err) };
};

/**
 * Démarre l'écoute des positions.
 *  - Android : plugin d'arrière-plan (suivi écran éteint). La permission doit déjà être accordée.
 *  - Web : navigator.geolocation via @capacitor/geolocation (premier plan uniquement).
 */
export async function watchLocation(
  onFix: (fix: GeoFix) => void,
  onError: (error: WatchError) => void,
): Promise<StopWatching> {
  if (Capacitor.isNativePlatform()) {
    const id = await BackgroundGeolocation.addWatcher(
      { ...BACKGROUND_NOTIFICATION, requestPermissions: false, stale: false, distanceFilter: 0 },
      (location, error) => {
        if (error) onError(toWatchError(error));
        else if (location) onFix(fromBackgroundLocation(location));
      },
    );
    return () => BackgroundGeolocation.removeWatcher({ id });
  }

  const id = await Geolocation.watchPosition(
    { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0, minimumUpdateInterval: 1000 },
    (position, err) => {
      if (err) onError(toWatchError(err));
      else if (position) onFix(fromPosition(position));
    },
  );
  return () => Geolocation.clearWatch({ id });
}

/** Ouvre les réglages de l'app (permissions, batterie). Android uniquement. */
export async function openAppSettings(): Promise<void> {
  if (Capacitor.isNativePlatform()) await BackgroundGeolocation.openSettings();
}
