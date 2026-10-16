import type { LatLng, TrackPoint, Trip, TripStats } from '../types';

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Distance orthodromique (formule de Haversine) entre deux points, en mètres. */
export function haversineDistance(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cap initial de `a` vers `b`, en degrés [0, 360). */
export function bearing(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Interpolation linéaire entre deux coordonnées (suffisant sur de courtes distances). */
export function interpolate(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Distance totale d'une suite de points, sans compter les sauts entre segments. */
export function totalDistance(points: readonly TrackPoint[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].segment === points[i - 1].segment) {
      sum += haversineDistance(points[i - 1], points[i]);
    }
  }
  return sum;
}

export const msToKmh = (ms: number) => ms * 3.6;

/** Vitesse en km/h entre deux points consécutifs (0 si l'intervalle est nul). */
export function segmentSpeedKmh(a: TrackPoint, b: TrackPoint): number {
  const dt = (b.timestamp - a.timestamp) / 1000;
  if (dt <= 0) return 0;
  return msToKmh(haversineDistance(a, b) / dt);
}

/** Durée active d'un trajet à l'instant `now` (hors pauses). */
export function activeDuration(trip: Pick<Trip, 'activeDurationMs' | 'resumedAt'>, now: number): number {
  return trip.activeDurationMs + (trip.resumedAt !== null ? Math.max(0, now - trip.resumedAt) : 0);
}

/** Au-delà de ce délai sans nouveau point, la vitesse instantanée est considérée nulle. */
const STALE_SPEED_MS = 10_000;

/** Calcule l'ensemble des métriques d'un trajet. */
export function computeStats(trip: Pick<Trip, 'points' | 'activeDurationMs' | 'resumedAt'>, now: number): TripStats {
  const { points } = trip;
  const distanceMeters = totalDistance(points);
  const durationMs = activeDuration(trip, now);
  const avgSpeedKmh = durationMs > 0 ? msToKmh(distanceMeters / (durationMs / 1000)) : 0;

  let maxSpeedKmh = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].segment !== points[i - 1].segment) continue;
    const s = points[i].speed != null ? msToKmh(points[i].speed!) : segmentSpeedKmh(points[i - 1], points[i]);
    if (Number.isFinite(s)) maxSpeedKmh = Math.max(maxSpeedKmh, s);
  }

  let currentSpeedKmh = 0;
  const last = points.at(-1);
  if (last && trip.resumedAt !== null && now - last.timestamp <= STALE_SPEED_MS) {
    if (last.speed != null && last.speed >= 0) {
      currentSpeedKmh = msToKmh(last.speed);
    } else if (points.length >= 2 && points.at(-2)!.segment === last.segment) {
      currentSpeedKmh = segmentSpeedKmh(points.at(-2)!, last);
    }
  }

  return { distanceMeters, durationMs, avgSpeedKmh, currentSpeedKmh, maxSpeedKmh };
}

export interface PointFilterOptions {
  /** Précision maximale acceptée (m). Les relevés moins précis sont ignorés. */
  maxAccuracy: number;
  /** Déplacement minimal (m) pour enregistrer un nouveau point (anti-jitter). */
  minDistance: number;
  /** Vitesse maximale plausible (km/h) : au-delà, le point est considéré aberrant. */
  maxSpeedKmh: number;
}

export const DEFAULT_GPS_FILTER: PointFilterOptions = {
  maxAccuracy: 50,
  minDistance: 3,
  maxSpeedKmh: 250,
};

/**
 * Indique si un nouveau relevé doit être ajouté au tracé.
 * Filtre le bruit GPS (précision médiocre, micro-déplacements à l'arrêt, sauts aberrants).
 */
export function shouldAcceptPoint(
  prev: TrackPoint | undefined,
  next: TrackPoint,
  opts: PointFilterOptions = DEFAULT_GPS_FILTER,
): boolean {
  if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return false;
  if (next.accuracy != null && next.accuracy > opts.maxAccuracy) return false;
  if (!prev || prev.segment !== next.segment) return true;
  if (next.timestamp <= prev.timestamp) return false;
  const d = haversineDistance(prev, next);
  if (d < opts.minDistance) return false;
  return segmentSpeedKmh(prev, next) <= opts.maxSpeedKmh;
}
