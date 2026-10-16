const pad = (n: number) => String(n).padStart(2, '0');

/** 845 → "845 m", 12_345 → "12,35 km". */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '0 m';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
}

/** Durée au format "mm:ss" ou "h:mm:ss". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Vitesse en km/h avec une décimale. */
export function formatSpeed(kmh: number): string {
  const v = Number.isFinite(kmh) && kmh > 0 ? kmh : 0;
  return `${v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km/h`;
}

/** Date + heure courte, ex. "16/10/2026 14:05". */
export function formatDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Identifiant unique (crypto.randomUUID si disponible). */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
