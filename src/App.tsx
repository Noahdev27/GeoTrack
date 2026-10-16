import { useCallback, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { MapView } from './components/MapView';
import { Dashboard } from './components/Dashboard';
import { Controls } from './components/Controls';
import { StatusBar } from './components/StatusBar';
import { TripHistory } from './components/TripHistory';
import { useTracker } from './hooks/useTracker';
import { useSync } from './hooks/useSync';
import { useTripHistory } from './hooks/useTripHistory';
import { DEMO_ROUTE } from './services/simulation';
import { isMockSync, syncService } from './services/sync';
import type { Trip } from './types';
import { computeStats } from './utils/geo';
import { formatDateTime } from './utils/format';
import { ExportActions } from './components/ExportActions';
import { shareTrip } from './services/exportService';
import { openAppSettings } from './services/location/locationWatcher';
import type { ExportFormat } from './utils/export';

/** Marqueur : le message affiché après l'enregistrement suit l'état de la synchro en direct. */
const SAVED_NOTICE = '__trip-saved__';

export default function App() {
  const tracker = useTracker();
  const sync = useSync();
  const [savedCount, setSavedCount] = useState(0);
  const history = useTripHistory(`${savedCount}-${sync.lastSyncAt}`);

  const [follow, setFollow] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewedTrip, setViewedTrip] = useState<Trip | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const active = tracker.trip;
  const shown = active ?? viewedTrip;
  const lastPoint = shown?.points.at(-1) ?? null;
  const position = active ? (tracker.liveFix ?? lastPoint) : lastPoint;
  const viewedStats = useMemo(
    () => (viewedTrip ? computeStats(viewedTrip, viewedTrip.endedAt ?? viewedTrip.updatedAt) : null),
    [viewedTrip],
  );

  const handleStart = useCallback(async () => {
    setViewedTrip(null);
    setNotice(null);
    setFollow(true);
    await tracker.start();
  }, [tracker]);

  const handleStop = useCallback(async () => {
    setBusy(true);
    try {
      const saved = await tracker.stop();
      if (saved) {
        setSavedCount((c) => c + 1);
        setViewedTrip(saved);
        setNotice(SAVED_NOTICE);
      }
    } finally {
      setBusy(false);
    }
  }, [tracker]);

  const handleSelectTrip = useCallback(
    async (id: string) => {
      const trip = await history.load(id);
      if (trip) {
        setViewedTrip(trip);
        setFollow(false);
        setNotice(null);
      }
      setHistoryOpen(false);
    },
    [history],
  );

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!viewedTrip) return;
      setBusy(true);
      try {
        await shareTrip(viewedTrip, format);
      } catch (err) {
        // Fermer la feuille de partage n'est pas une erreur.
        const message = err instanceof Error ? err.message : String(err);
        if (!/cancel/i.test(message)) setNotice(`Export impossible : ${message}`);
      } finally {
        setBusy(false);
      }
    },
    [viewedTrip],
  );

  const handleDeleteTrip = useCallback(
    async (id: string) => {
      await history.remove(id);
      if (viewedTrip?.id === id) setViewedTrip(null);
      void syncService.syncNow();
    },
    [history, viewedTrip],
  );

  const savedNotice = !sync.online
    ? 'Trajet enregistré hors-ligne : il sera synchronisé au retour du réseau.'
    : sync.syncing || sync.pendingCount > 0
      ? 'Trajet enregistré, synchronisation en cours…'
      : 'Trajet enregistré et synchronisé ✓';
  const message =
    tracker.error ??
    (tracker.restored
      ? 'Trajet interrompu récupéré : appuyez sur Reprendre ou Terminer.'
      : notice === SAVED_NOTICE
        ? savedNotice
        : notice);
  const messageIsError = !!tracker.error;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img src="./favicon.svg" alt="" width={28} height={28} />
          <span>GeoTrack</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setHistoryOpen(true)}
          aria-label="Historique des trajets"
        >
          🗂 <span className="hide-sm">Historique</span>
          {history.trips.length > 0 && <span className="counter">{history.trips.length}</span>}
        </button>
      </header>

      <main className="map-area">
        <MapView
          points={shown?.points ?? []}
          position={position}
          heading={active ? tracker.liveFix?.heading : null}
          accuracy={active && tracker.mode === 'gps' ? tracker.liveFix?.accuracy : null}
          plannedRoute={!active && !viewedTrip && tracker.mode === 'simulation' ? DEMO_ROUTE : undefined}
          follow={follow && !!active}
          onFollowChange={setFollow}
          fitKey={!active ? (viewedTrip?.id ?? null) : null}
          initialCenter={DEMO_ROUTE[0]}
        />
        <StatusBar
          sync={sync}
          mockSync={isMockSync}
          mode={tracker.mode}
          status={tracker.status}
          permission={tracker.permission}
          accuracy={tracker.liveFix?.accuracy ?? null}
          onSync={() => void sync.syncNow()}
        />
        {active && !follow && (
          <button type="button" className="fab" onClick={() => setFollow(true)} aria-label="Recentrer sur le véhicule">
            ◎
          </button>
        )}
      </main>

      <section className="panel">
        <div className="panel-handle" aria-hidden="true" />
        <div className="panel-title">
          {active ? (
            <>
              <span className={`live-dot ${tracker.status === 'tracking' ? 'on' : ''}`} />
              {tracker.status === 'tracking' ? 'Suivi en cours' : 'En pause'}
              <span className="muted"> · {active.mode === 'gps' ? 'GPS' : 'Simulation'}</span>
            </>
          ) : viewedTrip ? (
            <>
              <span>Trajet du {formatDateTime(viewedTrip.startedAt)}</span>
              <button type="button" className="link" onClick={() => setViewedTrip(null)}>
                Fermer
              </button>
            </>
          ) : (
            <span>Prêt à démarrer</span>
          )}
        </div>

        <Dashboard stats={active ? tracker.stats : viewedStats} live={tracker.status === 'tracking'} />

        {!active && viewedTrip && <ExportActions busy={busy} onExport={(f) => void handleExport(f)} />}

        {message && (
          <p className={`notice ${messageIsError ? 'notice-error' : ''}`} role={messageIsError ? 'alert' : 'status'}>
            {message}
            {tracker.error && (
              <button type="button" className="link" onClick={tracker.clearError} aria-label="Masquer">
                ✕
              </button>
            )}
          </p>
        )}
        {Capacitor.isNativePlatform() && tracker.mode === 'gps' && !active && !viewedTrip && (
          <p className="notice">
            Le suivi continue écran éteint (notification « suivi en cours »). Pour éviter que le téléphone ne
            l’interrompe, désactivez l’optimisation de batterie pour GeoTrack.
            <button type="button" className="link" onClick={() => void openAppSettings()}>
              Réglages
            </button>
          </p>
        )}
        {tracker.mode === 'gps' && tracker.approximateLocation && (
          <p className="notice">
            Localisation approximative uniquement : activez la « position exacte » pour un tracé précis.
          </p>
        )}

        <Controls
          mode={tracker.mode}
          status={tracker.status}
          simSpeed={tracker.simSpeed}
          busy={busy}
          onModeChange={tracker.setMode}
          onSimSpeedChange={tracker.setSimSpeed}
          onStart={() => void handleStart()}
          onPause={tracker.pause}
          onResume={() => void tracker.resume()}
          onStop={() => void handleStop()}
        />
      </section>

      {historyOpen && (
        <TripHistory
          trips={history.trips}
          loading={history.loading}
          selectedId={viewedTrip?.id ?? null}
          onSelect={(id) => void handleSelectTrip(id)}
          onDelete={(id) => void handleDeleteTrip(id)}
          onClose={() => setHistoryOpen(false)}
        />
      )}
    </div>
  );
}
