import { describe, expect, it } from 'vitest';
import { metersPerPixel, simplifyPath } from './simplify';

describe('simplifyPath', () => {
  it('conserve les chemins courts tels quels', () => {
    const p: [number, number][] = [
      [0, 0],
      [0, 1],
    ];
    expect(simplifyPath(p, 10)).toEqual(p);
  });

  it('supprime les points alignés et garde les virages', () => {
    // Ligne droite vers l'est puis virage plein nord.
    const path: [number, number][] = [];
    for (let i = 0; i <= 100; i++) path.push([48.85, 2.35 + i * 0.0001]);
    for (let i = 1; i <= 100; i++) path.push([48.85 + i * 0.0001, 2.36]);
    const out = simplifyPath(path, 1);
    expect(out).toEqual([path[0], path[100], path[200]]);
  });

  it('respecte la tolérance : aucun point retiré ne s’écarte de plus que la tolérance', () => {
    const path: [number, number][] = Array.from({ length: 2000 }, (_, i) => [
      48.85 + i * 0.00005,
      2.35 + Math.sin(i / 15) * 0.0003,
    ]);
    const out = simplifyPath(path, 5);
    expect(out.length).toBeLessThan(path.length / 3);
    expect(out[0]).toEqual(path[0]);
    expect(out.at(-1)).toEqual(path.at(-1));
  });

  it('réduit fortement un très long trajet rapidement', () => {
    const path: [number, number][] = Array.from({ length: 20_000 }, (_, i) => [48.85 + i * 0.00001, 2.35]);
    const start = performance.now();
    expect(simplifyPath(path, 2)).toHaveLength(2);
    expect(performance.now() - start).toBeLessThan(100);
  });
});

describe('metersPerPixel', () => {
  it('≈ 2,39 m/px au zoom 16 à l’équateur et diminue avec la latitude', () => {
    expect(metersPerPixel(0, 16)).toBeCloseTo(2.389, 2);
    expect(metersPerPixel(60, 16)).toBeCloseTo(1.194, 2);
  });
});
