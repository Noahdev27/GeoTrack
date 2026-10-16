import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LatLng, TrackPoint, TrackingMode, TrackingStatus, Trip } from '../types';
import { EMPTY_STATS, metaOf } from '../services/db/types';
import { GpsSimulator } from '../services/simulation';
import { tripStorage } from '../services/storage';
import { syncService } from '../services/sync';
import { TripPersister } from '../services/tripPersister';
import {
  activeDuration,
  DEFAULT_GPS_FILTER,
  shouldAcceptPoint,
  TripAccumulator,
  type PointFilterOptions,
} from '../utils/geo';
import { formatDateTime, generateId } from '../utils/format';
import { useGeolocation, type GeoFix } from './useGeolocation';

/** Écriture périodique des points en attente (reprise après crash / fermeture). */
const FLUSH_INTERVAL_MS = 2_000;

// Le simulateur peut être accéléré (×10) : pas de plafond de vitesse « aberrante » en simulation.
const SIM_FILTER: PointFilterOptions = {
  ...DEFAULT_GPS_FILTER,
  minDistance: 0.5,
  maxSpeedKmh: Number.POSITIVE_INFINITY,
};

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

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Machine à états du suivi de trajet : idle → tracking ⇄ paused → idle.
 * Alimente le trajet à partir du GPS natif ou du simulateur. Les métriques sont incrémentales
 * (TripAccumulator) et les points sont ajoutés au stockage par lots (TripPersister).
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
  // L'accumulateur est muté à chaque point accepté ; `trip` change en même temps, ce qui recalcule les stats.
  const [accumulator, setAccumulator] = useState(() => new TripAccumulator());
  const [persister] = useState(
    () =>
      new TripPersister(tripStorage, {
        onError: (e) => setError(`Enregistrement local impossible : ${errorMessage(e)}`),
      }),
  );

  // Miroirs synchrones de l'état, lus par les callbacks (jamais pendant le rendu).
  const tripRef = useRef<Trip | null>(null);
  const accumulatorRef = useRef(accumulator);
  const segmentRef = useRef(0);
  const simulatorRef = useRef<GpsSimulator | null>(null);
  const simSpeedRef = useRef(simSpeed);

  const commitTrip = useCallback((next: Trip | null) => {
    tripRef.current = next;
    setTrip(next);
  }, []);

  const resetAccumulator = useCallback((points: readonly TrackPoint[]) => {
    const acc = new TripAccumulator(points);
    accumulatorRef.current = acc;
    setAccumulator(acc);
    return acc;
  }, []);

  // --- Reprise d'un trajet interrompu (app tuée pendant un suivi) ---------------------------
  useEffect(() => {
    let cancelled = false;
    void tripStorage.loadActiveTrip().then((saved) => {
      if (cancelled || !saved || saved.endedAt !== null) return;
      // Reprise en pause : le temps actif s'arrête au dernier relevé enregistré
      // (le temps écoulé pendant que l'app était fermée n'est pas compté).
      const lastSeen = Math.max(saved.updatedAt, saved.points.at(-1)?.timestamp ?? 0);
      const recovered = saved.resumedAt !== null ? freeze(saved, lastSeen) : saved;
      segmentRef.current = (recovered.points.at(-1)?.segment ?? -1) + 1;
      const acc = resetAccumulator(recovered.points);
      persister.begin(metaOf(recovered), acc.stats(recovered, lastSeen));
      setModeState(recovered.mode);
      commitTrip(recovered);
      setStatus('paused');
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [commitTrip, persister, resetAccumulator]);

  // --- Ingestion des relevés -----------------------------------------------------------------
  const ingest = useCallback(
    (fix: GeoFix, filter: PointFilterOptions) => {
      setLiveFix({ lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, heading: fix.heading });
      const prev = tripRef.current;
      if (!prev || prev.resumedAt === null) return;
      const point: TrackPoint = {
        lat: fix.lat,
        lng: fix.lng,
        timestamp: fix.timestamp,
        accuracy: fix.accuracy,
        speed: fix.speed,
        altitude: fix.altitude,
        segment: segmentRef.current,
      };
      if (!shouldAcceptPoint(prev.points.at(-1), point, filter)) return;
      accumulatorRef.current.add(point);
      persister.push(point);
      commitTrip({ ...prev, points: [...prev.points, point], updatedAt: point.timestamp });
    },
    [commitTrip, persister],
  );

  // --- Sources de position (actives uniquement en statut "tracking") -------------------------
  const { startWatch, stopWatch, requestPermission } = geo;
  useEffect(() => {
    if (status !== 'tracking') return;

    if (mode === 'simulation') {
      const sim = (simulatorRef.current ??= new GpsSimulator({ speedMultiplier: simSpeedRef.current }));
      sim.start((f) => ingest({ ...f, altitude: null }, SIM_FILTER));
      return () => sim.stop();
    }

    let cancelled = false;
    startWatch((f) => {
      setError(null);
      ingest(f, DEFAULT_GPS_FILTER);
    }, setError)
      .then(() => {
        if (cancelled) stopWatch();
      })
      .catch((e: unknown) => setError(errorMessage(e)));
    return () => {
      cancelled = true;
      stopWatch();
    };
  }, [status, mode, ingest, startWatch, stopWatch]);

  // La vitesse de simulation s'applique à chaud, sans redémarrer la source.
  useEffect(() => {
    simSpeedRef.current = simSpeed;
    simulatorRef.current?.setSpeedMultiplier(simSpeed);
  }, [simSpeed]);

  // --- Horloge (chrono en direct ; `now` est initialisé par start() / resume()) ---------------
  useEffect(() => {
    if (status !== 'tracking') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  // --- Persistance du trajet en cours -------------------------------------------------------
  useEffect(() => {
    if (status !== 'tracking') return;
    const id = setInterval(() => persister.flush(), FLUSH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [status, persister]);

  useEffect(() => {
    // Passage en arrière-plan : on écrit tout de suite (la WebView peut être tuée par l'OS).
    const onHide = () => {
      const current = tripRef.current;
      if (document.visibilityState !== 'hidden' || !current) return;
      persister.flush();
      persister.saveMeta(metaOf(current), accumulatorRef.current.stats(current, Date.now()));
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [persister]);

  // --- Actions ------------------------------------------------------------------------------
  const start = useCallback(async () => {
    setError(null);
    setRestored(false);
    if (mode === 'gps') {
      try {
        const ok = await requestPermission();
        if (!ok) {
          setError(
            "L'accès à la localisation est nécessaire pour le suivi GPS. Autorisez-le dans les réglages, ou utilisez le mode Simulation.",
          );
          return;
        }
      } catch (e) {
        setError(errorMessage(e));
        return;
      }
    }
    const t = Date.now();
    const trip = newTrip(mode, t);
    segmentRef.current = 0;
    simulatorRef.current = null;
    resetAccumulator([]);
    persister.begin(metaOf(trip), EMPTY_STATS);
    setLiveFix(null);
    setNow(t);
    commitTrip(trip);
    setStatus('tracking');
  }, [mode, requestPermission, commitTrip, persister, resetAccumulator]);

  const pause = useCallback(() => {
    const current = tripRef.current;
    if (!current || current.resumedAt === null) return;
    const t = Date.now();
    const frozen = freeze(current, t);
    commitTrip(frozen);
    setNow(t);
    setStatus('paused');
    persister.flush();
    persister.saveMeta(metaOf(frozen), accumulatorRef.current.stats(frozen, t));
  }, [commitTrip, persister]);

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
    const resumed = { ...current, resumedAt: t, updatedAt: t };
    setNow(t);
    commitTrip(resumed);
    setStatus('tracking');
    persister.saveMeta(metaOf(resumed), accumulatorRef.current.stats(resumed, t));
  }, [requestPermission, commitTrip, persister]);

  /** Termine le trajet, l'enregistre localement et déclenche la synchronisation. */
  const stop = useCallback(async (): Promise<Trip | null> => {
    const current = tripRef.current;
    setStatus('idle');
    commitTrip(null);
    setLiveFix(null);
    setRestored(false);
    simulatorRef.current = null;
    if (!current) return null;

    const t = Date.now();
    const finished: Trip = { ...freeze(current, t), endedAt: t };
    if (finished.points.length < 2) {
      persister.discard();
      await persister.idle();
      setError('Trajet trop court : il n’a pas été enregistré.');
      return null;
    }
    persister.flush();
    persister.saveMeta(metaOf(finished), accumulatorRef.current.stats(finished, t));
    persister.end();
    await persister.idle();
    void syncService.syncNow();
    return finished;
  }, [commitTrip, persister]);

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
    () => (trip ? accumulator.stats(trip, status === 'tracking' ? Math.max(now, trip.updatedAt) : now) : null),
    [accumulator, trip, now, status],
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
