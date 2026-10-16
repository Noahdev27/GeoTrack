import type { LatLng } from '../types';
import { bearing, haversineDistance, interpolate } from '../utils/geo';

/** Itinéraire de démonstration : Louvre → Champs-Élysées → Arc de Triomphe → Trocadéro → Tour Eiffel. */
export const DEMO_ROUTE: LatLng[] = [
  { lat: 48.8606, lng: 2.3376 },
  { lat: 48.8635, lng: 2.329 },
  { lat: 48.8656, lng: 2.3212 },
  { lat: 48.8676, lng: 2.314 },
  { lat: 48.8692, lng: 2.3096 },
  { lat: 48.872, lng: 2.3005 },
  { lat: 48.8738, lng: 2.295 },
  { lat: 48.87, lng: 2.293 },
  { lat: 48.866, lng: 2.29 },
  { lat: 48.8629, lng: 2.2876 },
  { lat: 48.86, lng: 2.2925 },
  { lat: 48.8584, lng: 2.2945 },
];

export interface RoutePosition {
  position: LatLng;
  heading: number;
  /** `true` si la distance demandée atteint ou dépasse la fin de l'itinéraire. */
  finished: boolean;
}

/** Distances cumulées depuis le début de l'itinéraire, pour chaque waypoint. */
export function cumulativeDistances(route: readonly LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < route.length; i++) out.push(out[i - 1] + haversineDistance(route[i - 1], route[i]));
  return out;
}

/** Position sur l'itinéraire après avoir parcouru `distance` mètres depuis le départ. */
export function positionAlongRoute(
  route: readonly LatLng[],
  cumul: readonly number[],
  distance: number,
): RoutePosition {
  if (route.length === 0) throw new Error('Itinéraire vide');
  if (route.length === 1 || distance <= 0) {
    return {
      position: route[0],
      heading: route.length > 1 ? bearing(route[0], route[1]) : 0,
      finished: route.length === 1,
    };
  }
  const total = cumul[cumul.length - 1];
  if (distance >= total) {
    const n = route.length;
    return { position: route[n - 1], heading: bearing(route[n - 2], route[n - 1]), finished: true };
  }
  // Recherche du tronçon contenant `distance` (itinéraires courts : recherche linéaire suffisante).
  let i = 1;
  while (cumul[i] < distance) i++;
  const segLen = cumul[i] - cumul[i - 1];
  const t = segLen > 0 ? (distance - cumul[i - 1]) / segLen : 0;
  return {
    position: interpolate(route[i - 1], route[i], t),
    heading: bearing(route[i - 1], route[i]),
    finished: false,
  };
}

export interface SimulatedFix {
  lat: number;
  lng: number;
  timestamp: number;
  accuracy: number;
  /** m/s */
  speed: number;
  heading: number;
}

export interface SimulatorOptions {
  route?: LatLng[];
  /** Intervalle entre deux relevés simulés (ms). */
  intervalMs?: number;
  /** Plage de vitesse du véhicule simulé (km/h). */
  minSpeedKmh?: number;
  maxSpeedKmh?: number;
  /** Multiplicateur appliqué à la vitesse du véhicule (x1, x2, x5…). */
  speedMultiplier?: number;
  /** Bruit GPS maximal ajouté à chaque relevé (m). */
  jitterMeters?: number;
  random?: () => number;
  now?: () => number;
}

/**
 * Simule un véhicule qui suit un itinéraire point par point.
 * À la fin du parcours, le véhicule repart en sens inverse (aller-retour continu).
 */
export class GpsSimulator {
  private route: LatLng[];
  private cumul: number[];
  private distance = 0;
  private speedKmh: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly opts: Required<Omit<SimulatorOptions, 'route'>>;

  constructor(options: SimulatorOptions = {}) {
    this.route = [...(options.route ?? DEMO_ROUTE)];
    if (this.route.length < 2) throw new Error("L'itinéraire simulé doit contenir au moins 2 points");
    this.cumul = cumulativeDistances(this.route);
    this.opts = {
      intervalMs: options.intervalMs ?? 1000,
      minSpeedKmh: options.minSpeedKmh ?? 20,
      maxSpeedKmh: options.maxSpeedKmh ?? 50,
      speedMultiplier: options.speedMultiplier ?? 1,
      jitterMeters: options.jitterMeters ?? 2,
      random: options.random ?? Math.random,
      now: options.now ?? Date.now,
    };
    this.speedKmh = (this.opts.minSpeedKmh + this.opts.maxSpeedKmh) / 2;
  }

  get running(): boolean {
    return this.timer !== null;
  }

  get routeLength(): number {
    return this.cumul[this.cumul.length - 1];
  }

  setSpeedMultiplier(multiplier: number): void {
    this.opts.speedMultiplier = Math.max(0.1, multiplier);
  }

  /** Position initiale (sans avancer), utile pour centrer la carte avant le départ. */
  currentFix(): SimulatedFix {
    return this.toFix(positionAlongRoute(this.route, this.cumul, this.distance));
  }

  /** Avance la simulation d'un pas et retourne le relevé correspondant. */
  step(): SimulatedFix {
    const { random, minSpeedKmh, maxSpeedKmh, intervalMs, speedMultiplier } = this.opts;
    // Marche aléatoire bornée pour une vitesse réaliste (accélérations / ralentissements).
    this.speedKmh = Math.min(maxSpeedKmh, Math.max(minSpeedKmh, this.speedKmh + (random() - 0.5) * 8));
    this.distance += ((this.speedKmh * speedMultiplier) / 3.6) * (intervalMs / 1000);

    let pos = positionAlongRoute(this.route, this.cumul, this.distance);
    if (pos.finished) {
      // Demi-tour : on repart de la fin en sens inverse avec le reliquat de distance.
      const overflow = this.distance - this.routeLength;
      this.route.reverse();
      this.cumul = cumulativeDistances(this.route);
      this.distance = Math.min(overflow, this.routeLength);
      pos = positionAlongRoute(this.route, this.cumul, this.distance);
    }
    return this.toFix(pos);
  }

  start(onFix: (fix: SimulatedFix) => void): void {
    if (this.timer) return;
    this.timer = setInterval(() => onFix(this.step()), this.opts.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private toFix(pos: RoutePosition): SimulatedFix {
    const { jitterMeters, random, now, speedMultiplier } = this.opts;
    // ~111 320 m par degré de latitude ; la longitude est corrigée par cos(lat).
    const jLat = ((random() - 0.5) * 2 * jitterMeters) / 111_320;
    const jLng = ((random() - 0.5) * 2 * jitterMeters) / (111_320 * Math.cos((pos.position.lat * Math.PI) / 180));
    return {
      lat: pos.position.lat + jLat,
      lng: pos.position.lng + jLng,
      timestamp: now(),
      accuracy: Math.max(3, jitterMeters * 2),
      speed: (this.speedKmh * speedMultiplier) / 3.6,
      heading: pos.heading,
    };
  }
}
