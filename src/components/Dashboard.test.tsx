// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Dashboard } from './Dashboard';

const norm = (s: string | null) => (s ?? '').replace(/\u202f|\u00a0/g, ' ');

describe('Dashboard', () => {
  it('affiche des valeurs nulles sans trajet', () => {
    render(<Dashboard stats={null} live={false} />);
    expect(screen.getByText('0 m')).toBeTruthy();
    expect(screen.getByText('00:00')).toBeTruthy();
    expect(screen.getByText('Vitesse max')).toBeTruthy();
  });

  it('affiche les métriques et la vitesse instantanée en direct', () => {
    const { container } = render(
      <Dashboard
        stats={{
          distanceMeters: 12_345,
          durationMs: 3_725_000,
          avgSpeedKmh: 42.26,
          currentSpeedKmh: 30,
          maxSpeedKmh: 80,
        }}
        live
      />,
    );
    const text = norm(container.textContent);
    expect(text).toContain('12,35 km');
    expect(text).toContain('1:02:05');
    expect(text).toContain('42,3 km/h');
    expect(text).toContain('Vitesse actuelle30,0 km/h');
    expect(text).not.toContain('80,0');
  });
});
