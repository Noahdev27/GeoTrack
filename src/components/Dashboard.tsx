import type { TripStats } from '../types';
import { formatDistance, formatDuration, formatSpeed } from '../utils/format';

interface DashboardProps {
  stats: TripStats | null;
  live: boolean;
}

const EMPTY: TripStats = { distanceMeters: 0, durationMs: 0, avgSpeedKmh: 0, currentSpeedKmh: 0, maxSpeedKmh: 0 };

/** Métriques du trajet : distance, temps écoulé, vitesses moyenne / instantanée / max. */
export function Dashboard({ stats, live }: DashboardProps) {
  const s = stats ?? EMPTY;
  return (
    <section className="dashboard" aria-label="Métriques du trajet" aria-live="polite">
      <div className="metric metric-primary">
        <span className="metric-label">Distance</span>
        <span className="metric-value">{formatDistance(s.distanceMeters)}</span>
      </div>
      <div className="metric metric-primary">
        <span className="metric-label">Temps</span>
        <span className="metric-value tabular">{formatDuration(s.durationMs)}</span>
      </div>
      <div className="metric">
        <span className="metric-label">Vitesse moy.</span>
        <span className="metric-value">{formatSpeed(s.avgSpeedKmh)}</span>
      </div>
      <div className="metric">
        <span className="metric-label">{live ? 'Vitesse actuelle' : 'Vitesse max'}</span>
        <span className="metric-value">{formatSpeed(live ? s.currentSpeedKmh : s.maxSpeedKmh)}</span>
      </div>
    </section>
  );
}
