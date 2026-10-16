import type { TripSummary } from '../types';
import { formatDateTime, formatDistance, formatDuration, formatSpeed } from '../utils/format';

interface TripHistoryProps {
  trips: TripSummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function TripHistory({ trips, loading, selectedId, onSelect, onDelete, onClose }: TripHistoryProps) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <aside className="sheet" role="dialog" aria-modal="true" aria-label="Historique des trajets" onClick={(e) => e.stopPropagation()}>
        <header className="sheet-header">
          <h2>Mes trajets</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        {loading ? (
          <p className="muted">Chargement…</p>
        ) : trips.length === 0 ? (
          <p className="muted">Aucun trajet enregistré pour l’instant. Démarrez un suivi pour commencer.</p>
        ) : (
          <ul className="trip-list">
            {trips.map((t) => (
              <li key={t.id} className={t.id === selectedId ? 'selected' : ''}>
                <button type="button" className="trip-main" onClick={() => onSelect(t.id)}>
                  <span className="trip-title">
                    {t.mode === 'gps' ? '📡' : '🧪'} {formatDateTime(t.startedAt)}
                  </span>
                  <span className="trip-meta">
                    {formatDistance(t.stats.distanceMeters)} · {formatDuration(t.stats.durationMs)} · {formatSpeed(t.stats.avgSpeedKmh)}
                  </span>
                  <span className={`badge ${t.syncedAt ? 'badge-ok' : 'badge-pending'}`}>
                    {t.syncedAt ? 'Synchronisé' : 'En attente de synchro'}
                  </span>
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label="Supprimer le trajet"
                  onClick={() => {
                    if (window.confirm('Supprimer ce trajet ?')) onDelete(t.id);
                  }}
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
