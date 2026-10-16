import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, TrackPoint, TrackingMode, TrackingStatus, Trip } from '../types';
import { GpsSimulator } from '../services/simulation';
import { tripStorage } from '../services/storage';
import { syncService } from '../services/sync';
import { activeDuration, computeStats, DEFAULT_GPS_FILTER, shouldAcceptPoint, type PointFilterOptions } from '../utils/geo';
import { formatDateTime, generateId } from '../utils/format';
import { useGeolocation, type GeoFix } from './useGeolocation';

/** Sauvegarde périodique du trajet en cours (reprise après crash / fermeture). */
const ACTIVE_SAVE_INTERVAL_MS = 10_000;

// Le simulateur peut être accéléré (×10) : pas de plafond de vitesse « aberrante » en simulation.
const SIM_FILTER: PointFilterOptions = { ...DEFAULT_GPS_FILTER, minDistance: 0.5, maxSpeedKmh: Number.POSITIVE_INFINITY };

export interface LiveFix extends LatLng {
  accuracy: number | null;
  heading: number | null;
}

function newTrip(mode: TrackingMode, now: number): Trip {
  return {
    id: generateId(),
    name: `Trajet du ${formatDateTime(now)}`,
    mode,
    startedAt: now,
    endedAt: null,
    points: [],
    activeDurationMs: 0,
    resumedAt: now,
    updatedAt: now,
    syncedAt: null,
  };
}

/** Met le trajet en pause en figeant le temps actif. */
function freeze(trip: Trip, now: number): Trip {
  return { ...trip, activeDurationMs: activeDuration(trip, now), resumedAt: null, updatedAt: now };
}

/**
 * Machine à états du suivi de trajet : idle → tracking ⇄ paused → idle.
 * Alimente le trajet à partir du GPS natif ou du simulateur et persiste l'état localement.
 */
export function useTracker() {
  const geo = useGeolocation();
  const [mode, setModeState] = useState<TrackingMode>('simulation');
  const [status, setStatus] = useState<TrackingStatus>('idle');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [liveFix, setLiveFix] = useState<LiveFix | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [simSpeed, setSimSpeedState] = useState(1);
  const [restored, setRestored] = useState(false);

  const tripRef = useRef<Trip | null>(null);
  const segmentRef = useRef(0);
  const simulatorRef = useRef<GpsSimulator | null>(null);
  const lastSaveRef = useRef(0);
  tripRef.current = trip;

  // --- Reprise d'un trajet interrompu (app tuée pendant un suivi) ---------------------------
  useEffect(() => {
    let cancelled = false;
    void tripStorage.loadActiveTrip().then((saved) => {
      if (cancelled || !saved || saved.endedAt !== null) return;
      // On ignore le temps écoulé pendant que l'app était fermée : reprise en pause.
      const recovered = saved.resumedAt !== null ? freeze(saved, saved.updatedAt) : saved;
      segmentRef.current = (recovered.points.at(-1)?.segment ?? -1) + 1;
      setModeState(recovered.mode);
      setTrip(recovered);
      setStatus('paused');
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Ingestion des relevés -----------------------------------------------------------------
  const ingest = useCallback((fix: GeoFix, filter: PointFilterOptions) => {
    setLiveFix({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, heading: fix.heading });
    setTrip((prev) => {
      if (!prev || prev.resumedAt === null) return prev;
      const point: TrackPoint = {
        lat: fix.lat,
        lng: fix.lng,
        timestamp: fix.timestamp,
        accuracy: fix.accuracy,
        speed: fix.speed,
        altitude: fix.altitude,
        segment: segmentRef.current,
      };
      if (!shouldAcceptPoint(prev.points.at(-1), point, filter)) return prev;
      return { ...prev, points: [...prev.points, point], updatedAt: point.timestamp };
    });
  }, []);

  // --- Sources de position (actives uniquement en statut "tracking") -------------------------
  const { startWatch, stopWatch, requestPermission } = geo;
  useEffect(() => {
    if (status !== 'tracking') return;

    if (mode === 'simulation') {
      const sim = (simulatorRef.current ??= new GpsSimulator({ speedMultiplier: simSpeed }));
      sim.start((f) => ingest({ ...f, altitude: null }, SIM_FILTER));
      return () => sim.stop();
    }

    let cancelled = false;
    startWatch(
      (f) => {
        setError(null);
        ingest(f, DEFAULT_GPS_FILTER);
      },
      setError,
    )
      .then(() => {
        if (cancelled) stopWatch();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      stopWatch();
    };
    // simSpeed est volontairement absent : il est appliqué à chaud ci-dessous sans redémarrer la source.
  }, [status, mode, ingest, startWatch, stopWatch]);

  useEffect(() => {
    simulatorRef.current?.setSpeedMultiplier(simSpeed);
  }, [simSpeed]);

  // --- Horloge (chrono en direct) -----------------------------------------------------------
  useEffect(() => {
    if (status !== 'tracking') return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  // --- Persistance du trajet en cours -------------------------------------------------------
  useEffect(() => {
    if (!trip || status !== 'tracking') return;
    if (Date.now() - lastSaveRef.current < ACTIVE_SAVE_INTERVAL_MS) return;
    lastSaveRef.current = Date.now();
    void tripStorage.saveActiveTrip(trip);
  }, [trip, status]);

  useEffect(() => {
    // Passage en arrière-plan : on force une sauvegarde (la WebView peut être tuée par l'OS).
    const onHide = () => {
      if (document.visibilityState === 'hidden' && tripRef.current) void tripStorage.saveActiveTrip(tripRef.current);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  // --- Actions ------------------------------------------------------------------------------
  const start = useCallback(async () => {
    setError(null);
    setRestored(false);
    if (mode === 'gps') {
      try {
        const ok = await requestPermission();
        if (!ok) {
          setError("L'accès à la localisation est nécessaire pour le suivi GPS. Autorisez-le dans les réglages, ou utilisez le mode Simulation.");
          return;
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    const t = Date.now();
    segmentRef.current = 0;
    simulatorRef.current = null;
    lastSaveRef.current = 0;
    setLiveFix(null);
    setNow(t);
    setTrip(newTrip(mode, t));
    setStatus('tracking');
  }, [mode, requestPermission]);

  const pause = useCallback(() => {
    const current = tripRef.current;
    if (!current || current.resumedAt === null) return;
    const frozen = freeze(current, Date.now());
    setTrip(frozen);
    setStatus('paused');
    void tripStorage.saveActiveTrip(frozen);
  }, []);

  const resume = useCallback(async () => {
    const current = tripRef.current;
    if (!current) return;
    if (current.mode === 'gps') {
      const ok = await requestPermission().catch(() => false);
      if (!ok) {
        setError('Impossible de reprendre : accès à la localisation refusé.');
        return;
      }
    }
    setError(null);
    setRestored(false);
    segmentRef.current = (current.points.at(-1)?.segment ?? -1) + 1;
    const t = Date.now();
    setTrip({ ...current, resumedAt: t, updatedAt: t });
    setStatus('tracking');
  }, [requestPermission]);

  /** Termine le trajet, l'enregistre localement et déclenche la synchronisation. */
  const stop = useCallback(async (): Promise<Trip | null> => {
    const current = tripRef.current;
    setStatus('idle');
    setTrip(null);
    setLiveFix(null);
    setRestored(false);
    simulatorRef.current = null;
    await tripStorage.saveActiveTrip(null);
    if (!current) return null;

    const t = Date.now();
    const finished: Trip = { ...freeze(current, t), endedAt: t };
    if (finished.points.length < 2) {
      setError('Trajet trop court : il n’a pas été enregistré.');
      return null;
    }
    await tripStorage.saveTrip(finished);
    void syncService.syncNow();
    return finished;
  }, []);

  const setMode = useCallback(
    (m: TrackingMode) => {
      if (status !== 'idle') return;
      setError(null);
      setModeState(m);
    },
    [status],
  );

  const setSimSpeed = useCallback((v: number) => setSimSpeedState(v), []);

  const stats = useMemo(
    () => (trip ? computeStats(trip, status === 'tracking' ? Math.max(now, trip.updatedAt) : now) : null),
    [trip, now, status],
  );

  return {
    mode,
    setMode,
    status,
    trip,
    stats,
    liveFix,
    error,
    clearError: () => setError(null),
    restored,
    simSpeed,
    setSimSpeed,
    permission: geo.permission,
    approximateLocation: geo.approximate,
    start,
    pause,
    resume,
    stop,
  };
}
