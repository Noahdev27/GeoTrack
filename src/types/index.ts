/** Une coordonnée géographique simple (degrés décimaux, WGS84). */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Un relevé de position horodaté, issu du GPS natif ou du simulateur. */
export interface TrackPoint extends LatLng {
  /** Epoch en millisecondes. */
  timestamp: number;
  /** Précision horizontale en mètres, si connue. */
  accuracy?: number | null;
  /** Vitesse instantanée en m/s, si fournie par la source. */
  speed?: number | null;
  /** Altitude en mètres, si connue. */
  altitude?: number | null;
  /**
   * Index du segment (incrémenté à chaque reprise après une pause) :
   * aucune distance n'est comptée entre deux segments différents.
   */
  segment: number;
}

export type TrackingMode = 'gps' | 'simulation';

export type TrackingStatus = 'idle' | 'tracking' | 'paused';

export interface TripStats {
  /** Distance cumulée en mètres. */
  distanceMeters: number;
  /** Temps de déplacement actif (hors pauses) en millisecondes. */
  durationMs: number;
  /** Vitesse moyenne en km/h sur le temps actif. */
  avgSpeedKmh: number;
  /** Vitesse instantanée en km/h. */
  currentSpeedKmh: number;
  /** Vitesse maximale observée en km/h. */
  maxSpeedKmh: number;
}

export interface Trip {
  id: string;
  name: string;
  mode: TrackingMode;
  startedAt: number;
  endedAt: number | null;
  points: TrackPoint[];
  /** Temps actif accumulé avant la reprise courante (ms). */
  activeDurationMs: number;
  /** Début de la phase active courante, `null` si en pause ou terminé. */
  resumedAt: number | null;
  /** Date de dernière modification locale (epoch ms). */
  updatedAt: number;
  /** Date de synchronisation réussie avec le serveur, `null` si en attente. */
  syncedAt: number | null;
}

/** Résumé léger d'un trajet, utilisé pour l'historique sans charger tous les points. */
export interface TripSummary {
  id: string;
  name: string;
  mode: TrackingMode;
  startedAt: number;
  endedAt: number | null;
  stats: TripStats;
  syncedAt: number | null;
}

export type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'prompt' | 'unavailable';

export interface SyncState {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  lastSyncAt: number | null;
  lastError: string | null;
}
