import type { TrackPoint, Trip, TripStats, TripSummary } from '../../types';

/** Métadonnées d'un trajet, sans les points. */
export type TripMeta = Omit<Trip, 'points'>;

/**
 * Accès aux trajets stockés localement.
 * Les points sont ajoutés au fil de l'eau (append-only) : un trajet n'est jamais réécrit en entier.
 */
export interface TripRepository {
  /** Crée le schéma / applique les migrations. Idempotent. */
  init(): Promise<void>;
  /** Trajets terminés, du plus récent au plus ancien. */
  listTrips(): Promise<TripSummary[]>;
  getTrip(id: string): Promise<Trip | null>;
  /** Enregistre un trajet complet (métadonnées + points). Les points déjà présents sont ignorés. */
  saveTrip(trip: Trip): Promise<void>;
  /** Met à jour uniquement les métadonnées et les statistiques résumées. */
  saveTripMeta(meta: TripMeta, stats: TripStats): Promise<void>;
  /** Ajoute des points ; un point déjà enregistré (même horodatage) est ignoré. */
  appendPoints(tripId: string, points: readonly TrackPoint[]): Promise<void>;
  deleteTrip(id: string): Promise<void>;
  markSynced(id: string, syncedAt: number): Promise<void>;
  /** Trajets terminés pas encore synchronisés. */
  listUnsynced(): Promise<TripSummary[]>;
  /** Trajet en cours (non terminé) le plus récent, avec ses points. */
  loadActiveTrip(): Promise<Trip | null>;
}

export const EMPTY_STATS: TripStats = {
  distanceMeters: 0,
  durationMs: 0,
  avgSpeedKmh: 0,
  currentSpeedKmh: 0,
  maxSpeedKmh: 0,
};

export function metaOf(trip: Trip): TripMeta {
  const { points: _points, ...meta } = trip;
  return meta;
}

export function summaryOf(meta: TripMeta, stats: TripStats): TripSummary {
  return {
    id: meta.id,
    name: meta.name,
    mode: meta.mode,
    startedAt: meta.startedAt,
    endedAt: meta.endedAt,
    stats,
    syncedAt: meta.syncedAt,
  };
}
