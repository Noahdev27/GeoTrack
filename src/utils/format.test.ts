import { describe, expect, it } from 'vitest';
import { formatDistance, formatDuration, formatSpeed } from './format';

// toLocaleString('fr-FR') utilise une virgule décimale (et parfois une espace insécable).
const norm = (s: string) => s.replace(/\u202f|\u00a0/g, ' ');

describe('format', () => {
  it('formatDistance', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(845.4)).toBe('845 m');
    expect(norm(formatDistance(12_345))).toBe('12,35 km');
    expect(formatDistance(Number.NaN)).toBe('0 m');
  });

  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65_000)).toBe('01:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });

  it('formatSpeed', () => {
    expect(norm(formatSpeed(42.26))).toBe('42,3 km/h');
    expect(norm(formatSpeed(-3))).toBe('0,0 km/h');
  });
});
