import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation, type PermissionStatus as CapPermissionStatus, type Position } from '@capacitor/geolocation';
import type { PermissionStatus } from '../types';

export interface GeoFix {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
  heading: number | null;
}

const toFix = (p: Position): GeoFix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  timestamp: p.timestamp,
  accuracy: p.coords.accuracy ?? null,
  speed: p.coords.speed ?? null,
  altitude: p.coords.altitude ?? null,
  heading: p.coords.heading ?? null,
});

function mapPermission(s: CapPermissionStatus): PermissionStatus {
  if (s.location === 'granted' || s.coarseLocation === 'granted') return 'granted';
  if (s.location === 'denied') return 'denied';
  return 'prompt';
}

/** Traduit les erreurs natives / web en messages compréhensibles. */
export function describeGeoError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err);
  const msg = raw.toLowerCase();
  if (msg.includes('denied') || msg.includes('permission')) {
    return "Accès à la localisation refusé. Autorisez GeoTrack dans les réglages de l'appareil.";
  }
  if (msg.includes('disabled') || msg.includes('not enabled') || msg.includes('location services')) {
    return 'Les services de localisation sont désactivés. Activez le GPS puis réessayez.';
  }
  if (msg.includes('timeout')) return 'Aucun signal GPS pour le moment. Placez-vous à découvert.';
  if (msg.includes('not available') || msg.includes('unavailable'))
    return 'Géolocalisation indisponible sur cet appareil.';
  return `Erreur de géolocalisation : ${raw}`;
}

interface PermissionState {
  permission: PermissionStatus;
  /** Seule la localisation approximative est accordée (Android 12+). */
  approximate: boolean;
}

/** Lit l'état courant de la permission de localisation (sans rien demander à l'utilisateur). */
async function readPermission(): Promise<PermissionState> {
  if (!Capacitor.isNativePlatform() && !('geolocation' in navigator)) {
    return { permission: 'unavailable', approximate: false };
  }
  try {
    const status = await Geolocation.checkPermissions();
    return {
      permission: mapPermission(status),
      approximate: status.location !== 'granted' && status.coarseLocation === 'granted',
    };
  } catch {
    // Android lève une erreur si les services de localisation sont coupés ;
    // certains navigateurs n'exposent pas l'API Permissions.
    return { permission: Capacitor.isNativePlatform() ? 'unavailable' : 'prompt', approximate: false };
  }
}

/**
 * Accès à la géolocalisation native (plugin Capacitor) avec gestion des permissions.
 * Sur le web, le plugin délègue à `navigator.geolocation` (le navigateur affiche sa propre invite).
 */
export function useGeolocation() {
  const [permission, setPermission] = useState<PermissionStatus>('unknown');
  const [approximate, setApproximate] = useState(false);
  const watchId = useRef<string | null>(null);

  const applyPermission = useCallback((state: PermissionState) => {
    setPermission(state.permission);
    setApproximate(state.approximate);
    return state.permission;
  }, []);

  const checkPermission = useCallback(
    async (): Promise<PermissionStatus> => applyPermission(await readPermission()),
    [applyPermission],
  );

  /** Demande l'autorisation si nécessaire. Retourne `true` si le suivi peut démarrer. */
  const requestPermission = useCallback(async (): Promise<boolean> => {
    const current = await checkPermission();
    if (current === 'granted') return true;
    if (current === 'unavailable' && !Capacitor.isNativePlatform()) return false;

    if (!Capacitor.isNativePlatform()) {
      // Pas de requestPermissions sur le web : l'invite apparaît au premier watchPosition.
      return current !== 'denied';
    }
    try {
      const result = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      const mapped = applyPermission({
        permission: mapPermission(result),
        approximate: result.location !== 'granted' && result.coarseLocation === 'granted',
      });
      return mapped === 'granted';
    } catch (err) {
      setPermission('unavailable');
      throw new Error(describeGeoError(err));
    }
  }, [checkPermission, applyPermission]);

  const stopWatch = useCallback(() => {
    if (watchId.current) {
      void Geolocation.clearWatch({ id: watchId.current });
      watchId.current = null;
    }
  }, []);

  const startWatch = useCallback(
    async (onFix: (fix: GeoFix) => void, onError: (message: string) => void) => {
      stopWatch();
      const id = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0, minimumUpdateInterval: 1000 },
        (position, err) => {
          if (err) {
            onError(describeGeoError(err));
            if (!Capacitor.isNativePlatform() && (err as GeolocationPositionError).code === 1) setPermission('denied');
            return;
          }
          if (position) {
            setPermission('granted');
            onFix(toFix(position));
          }
        },
      );
      watchId.current = id;
    },
    [stopWatch],
  );

  useEffect(() => {
    let cancelled = false;
    void readPermission().then((state) => {
      if (!cancelled) applyPermission(state);
    });
    return () => {
      cancelled = true;
      stopWatch();
    };
  }, [applyPermission, stopWatch]);

  return { permission, approximate, checkPermission, requestPermission, startWatch, stopWatch };
}
