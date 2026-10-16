import type { PermissionStatus, SyncState, TrackingMode, TrackingStatus } from '../types';

interface StatusBarProps {
  sync: SyncState;
  mockSync: boolean;
  mode: TrackingMode;
  status: TrackingStatus;
  permission: PermissionStatus;
  accuracy: number | null;
  onSync: () => void;
}

const PERMISSION_LABEL: Record<PermissionStatus, string> = {
  unknown: 'GPS…',
  granted: 'GPS autorisé',
  denied: 'GPS refusé',
  prompt: 'GPS à autoriser',
  unavailable: 'GPS indisponible',
};

export function StatusBar({ sync, mockSync, mode, status, permission, accuracy, onSync }: StatusBarProps) {
  const syncLabel = sync.syncing
    ? 'Synchronisation…'
    : sync.pendingCount > 0
      ? `${sync.pendingCount} en attente`
      : 'Synchronisé';

  return (
    <div className="status-bar">
      <span
        className={`pill ${sync.online ? 'pill-ok' : 'pill-warn'}`}
        title={sync.online ? 'Réseau disponible' : 'Hors-ligne : les trajets sont conservés localement'}
      >
        <span className="dot" /> {sync.online ? 'En ligne' : 'Hors-ligne'}
      </span>
      <button
        type="button"
        className={`pill pill-button ${sync.lastError ? 'pill-warn' : ''}`}
        onClick={onSync}
        disabled={sync.syncing || !sync.online || sync.pendingCount === 0}
        title={
          sync.lastError ??
          (mockSync ? 'Serveur de synchronisation simulé (VITE_SYNC_ENDPOINT non défini)' : 'Synchroniser maintenant')
        }
      >
        {sync.syncing ? '⟳' : '☁'} {syncLabel}
      </button>
      {mode === 'gps' && (
        <span
          className={`pill ${permission === 'granted' ? 'pill-ok' : permission === 'denied' || permission === 'unavailable' ? 'pill-error' : ''}`}
        >
          {status === 'tracking' && accuracy != null ? `± ${Math.round(accuracy)} m` : PERMISSION_LABEL[permission]}
        </span>
      )}
    </div>
  );
}
