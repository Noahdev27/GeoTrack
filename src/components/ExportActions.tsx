import { EXPORT_FORMATS, type ExportFormat } from '../utils/export';

interface ExportActionsProps {
  busy: boolean;
  onExport: (format: ExportFormat) => void;
}

const FORMATS = Object.keys(EXPORT_FORMATS) as ExportFormat[];

/** Boutons d'export d'un trajet terminé (GPX, GeoJSON, CSV). */
export function ExportActions({ busy, onExport }: ExportActionsProps) {
  return (
    <div className="export-actions" role="group" aria-label="Exporter le trajet">
      <span>Exporter</span>
      {FORMATS.map((f) => (
        <button key={f} type="button" className="chip" disabled={busy} onClick={() => onExport(f)}>
          {EXPORT_FORMATS[f].label}
        </button>
      ))}
    </div>
  );
}
