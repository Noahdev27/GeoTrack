import { describe, expect, it } from 'vitest';
import { cumulativeDistances, DEMO_ROUTE, GpsSimulator, positionAlongRoute } from './simulation';
import { haversineDistance } from '../utils/geo';

const route = [
  { lat: 0, lng: 0 },
  { lat: 0.001, lng: 0 },
  { lat: 0.002, lng: 0 },
];

describe('positionAlongRoute', () => {
  const cumul = cumulativeDistances(route);

  it('interpole au milieu d’un tronçon', () => {
    const { position, finished } = positionAlongRoute(route, cumul, cumul[1] / 2);
    expect(position.lat).toBeCloseTo(0.0005, 6);
    expect(finished).toBe(false);
  });

  it('signale la fin de l’itinéraire', () => {
    const r = positionAlongRoute(route, cumul, cumul[2] + 10);
    expect(r.finished).toBe(true);
    expect(r.position).toEqual(route[2]);
  });
});

describe('GpsSimulator', () => {
  const fixed = () => 0.5; // pas de bruit, vitesse constante

  it('avance à la vitesse demandée', () => {
    let t = 0;
    const sim = new GpsSimulator({
      route,
      minSpeedKmh: 36,
      maxSpeedKmh: 36,
      jitterMeters: 0,
      random: fixed,
      now: () => (t += 1000),
    });
    const start = sim.currentFix();
    const fix = sim.step();
    expect(haversineDistance(start, fix)).toBeCloseTo(10, 1); // 36 km/h = 10 m/s
    expect(fix.speed).toBeCloseTo(10);
  });

  it('applique le multiplicateur de vitesse', () => {
    const sim = new GpsSimulator({
      route,
      minSpeedKmh: 36,
      maxSpeedKmh: 36,
      jitterMeters: 0,
      random: fixed,
      speedMultiplier: 5,
    });
    const start = sim.currentFix();
    expect(haversineDistance(start, sim.step())).toBeCloseTo(50, 1);
  });

  it('fait demi-tour en fin de parcours', () => {
    const sim = new GpsSimulator({ route, minSpeedKmh: 100, maxSpeedKmh: 100, jitterMeters: 0, random: fixed });
    const fixes = Array.from({ length: 20 }, () => sim.step());
    const maxLat = Math.max(...fixes.map((f) => f.lat));
    expect(maxLat).toBeLessThanOrEqual(0.002 + 1e-9);
    expect(fixes.at(-1)!.lat).toBeLessThan(maxLat); // repart en sens inverse
  });

  it('l’itinéraire de démo fait plusieurs kilomètres', () => {
    expect(new GpsSimulator({ route: DEMO_ROUTE }).routeLength).toBeGreaterThan(4000);
  });
});
