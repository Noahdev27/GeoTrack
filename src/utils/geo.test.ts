import { describe, expect, it } from 'vitest';
import type { TrackPoint } from '../types';
import { activeDuration, bearing, computeStats, haversineDistance, shouldAcceptPoint, totalDistance } from './geo';

const pt = (lat: number, lng: number, timestamp: number, segment = 0, extra: Partial<TrackPoint> = {}): TrackPoint => ({
  lat,
  lng,
  timestamp,
  segment,
  ...extra,
});

describe('haversineDistance', () => {
  it('vaut 0 pour un même point', () => {
    expect(haversineDistance({ lat: 48.85, lng: 2.35 }, { lat: 48.85, lng: 2.35 })).toBe(0);
  });

  it('calcule Paris → Londres (~343,5 km)', () => {
    const d = haversineDistance({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 });
    expect(d / 1000).toBeCloseTo(343.5, 0);
  });

  it('1° de latitude ≈ 111,2 km', () => {
    expect(haversineDistance({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -1);
  });
});

describe('bearing', () => {
  it('nord = 0°, est = 90°', () => {
    expect(bearing({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(0);
    expect(bearing({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(90);
  });
});

describe('totalDistance', () => {
  it("ne compte pas la distance entre deux segments (reprise après pause)", () => {
    const a = pt(0, 0, 0, 0);
    const b = pt(0.001, 0, 10_000, 0);
    const c = pt(0.01, 0, 20_000, 1); // saut pendant la pause
    const d = pt(0.011, 0, 30_000, 1);
    const seg = haversineDistance(a, b);
    expect(totalDistance([a, b, c, d])).toBeCloseTo(seg * 2, 3);
  });
});

describe('activeDuration', () => {
  it('ajoute la phase active courante', () => {
    expect(activeDuration({ activeDurationMs: 5000, resumedAt: 10_000 }, 13_000)).toBe(8000);
  });
  it('est figée en pause', () => {
    expect(activeDuration({ activeDurationMs: 5000, resumedAt: null }, 99_000)).toBe(5000);
  });
});

describe('computeStats', () => {
  // 0,001° de latitude ≈ 111,2 m toutes les 10 s → ≈ 40 km/h
  const points = [pt(0, 0, 0), pt(0.001, 0, 10_000), pt(0.002, 0, 20_000)];

  it('calcule distance, durée et vitesses', () => {
    const s = computeStats({ points, activeDurationMs: 0, resumedAt: 0 }, 20_000);
    expect(s.distanceMeters).toBeCloseTo(222.4, 0);
    expect(s.durationMs).toBe(20_000);
    expect(s.avgSpeedKmh).toBeCloseTo(40, 0);
    expect(s.currentSpeedKmh).toBeCloseTo(40, 0);
    expect(s.maxSpeedKmh).toBeCloseTo(40, 0);
  });

  it('privilégie la vitesse fournie par le GPS', () => {
    const withSpeed = [...points.slice(0, 2), pt(0.002, 0, 20_000, 0, { speed: 5 })];
    const s = computeStats({ points: withSpeed, activeDurationMs: 0, resumedAt: 0 }, 20_000);
    expect(s.currentSpeedKmh).toBeCloseTo(18);
  });

  it('vitesse instantanée nulle en pause ou sans relevé récent', () => {
    expect(computeStats({ points, activeDurationMs: 20_000, resumedAt: null }, 20_000).currentSpeedKmh).toBe(0);
    expect(computeStats({ points, activeDurationMs: 0, resumedAt: 0 }, 60_000).currentSpeedKmh).toBe(0);
  });

  it('gère un trajet vide', () => {
    const s = computeStats({ points: [], activeDurationMs: 0, resumedAt: null }, 0);
    expect(s).toEqual({ distanceMeters: 0, durationMs: 0, avgSpeedKmh: 0, currentSpeedKmh: 0, maxSpeedKmh: 0 });
  });
});

describe('shouldAcceptPoint', () => {
  const prev = pt(0, 0, 0);
  it('accepte le premier point', () => expect(shouldAcceptPoint(undefined, pt(0, 0, 0))).toBe(true));
  it('rejette une précision insuffisante', () => {
    expect(shouldAcceptPoint(prev, pt(0.001, 0, 10_000, 0, { accuracy: 120 }))).toBe(false);
  });
  it('rejette le jitter à l’arrêt', () => {
    expect(shouldAcceptPoint(prev, pt(0.00001, 0, 10_000))).toBe(false); // ~1 m
  });
  it('rejette un saut aberrant', () => {
    expect(shouldAcceptPoint(prev, pt(0.1, 0, 1000))).toBe(false); // 11 km en 1 s
  });
  it('rejette un horodatage non croissant', () => {
    expect(shouldAcceptPoint(prev, pt(0.001, 0, 0))).toBe(false);
  });
  it('accepte un déplacement normal', () => {
    expect(shouldAcceptPoint(prev, pt(0.001, 0, 10_000))).toBe(true);
  });
});
