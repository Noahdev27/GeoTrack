import type { TrackingMode, TrackingStatus } from '../types';

interface ControlsProps {
  mode: TrackingMode;
  status: TrackingStatus;
  simSpeed: number;
  busy: boolean;
  onModeChange: (mode: TrackingMode) => void;
  onSimSpeedChange: (speed: number) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

const SIM_SPEEDS = [1, 2, 5, 10];

export function Controls(props: ControlsProps) {
  const { mode, status, simSpeed, busy, onModeChange, onSimSpeedChange, onStart, onPause, onResume, onStop } = props;
  const idle = status === 'idle';

  return (
    <section className="controls" aria-label="Commandes de suivi">
      <div className="segmented" role="radiogroup" aria-label="Source de position">
        {(['simulation', 'gps'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={mode === m ? 'active' : ''}
            disabled={!idle && mode !== m}
            onClick={() => onModeChange(m)}
          >
            {m === 'gps' ? '📡 GPS réel' : '🧪 Simulation'}
          </button>
        ))}
      </div>

      {mode === 'simulation' && (
        <div className="sim-speed" role="radiogroup" aria-label="Vitesse de simulation">
          <span>Vitesse</span>
          {SIM_SPEEDS.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={simSpeed === v}
              className={simSpeed === v ? 'chip active' : 'chip'}
              onClick={() => onSimSpeedChange(v)}
            >
              ×{v}
            </button>
          ))}
        </div>
      )}

      <div className="actions">
        {idle && (
          <button type="button" className="btn btn-primary btn-lg" onClick={onStart} disabled={busy}>
            ▶ Démarrer le trajet
          </button>
        )}
        {status === 'tracking' && (
          <>
            <button type="button" className="btn btn-secondary" onClick={onPause}>
              ⏸ Pause
            </button>
            <button type="button" className="btn btn-danger" onClick={onStop} disabled={busy}>
              ■ Terminer
            </button>
          </>
        )}
        {status === 'paused' && (
          <>
            <button type="button" className="btn btn-primary" onClick={onResume} disabled={busy}>
              ▶ Reprendre
            </button>
            <button type="button" className="btn btn-danger" onClick={onStop} disabled={busy}>
              ■ Terminer
            </button>
          </>
        )}
      </div>
    </section>
  );
}
