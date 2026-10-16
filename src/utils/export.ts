import type { TrackPoint, Trip } from '../types';
import { computeStats } from './geo';

export type ExportFormat = 'gpx' | 'geojson' | 'csv';

export const EXPORT_FORMATS: Record<ExportFormat, { label: string; extension: string; mimeType: string }> = {
  gpx: { label: 'GPX', extension: 'gpx', mimeType: 'application/gpx+xml' },
  geojson: { label: 'GeoJSON', extension: 'geojson', mimeType: 'application/geo+json' },
  csv: { label: 'CSV', extension: 'csv', mimeType: 'text/csv' },
};

const iso = (epochMs: number) => new Date(epochMs).toISOString();

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Regroupe les points par segment (un segment = une phase entre deux pauses). */
export function groupBySegment(points: readonly TrackPoint[]): TrackPoint[][] {
  const out: TrackPoint[][] = [];
  for (const p of points) {
    const current = out.at(-1);
    if (current && current[0].segment === p.segment) current.push(p);
    else out.push([p]);
  }
  return out;
}

/** GPX 1.1 : une piste, un <trkseg> par segment. */
export function toGPX(trip: Trip): string {
  const segments = groupBySegment(trip.points)
    .map((seg) => {
      const pts = seg
        .map((p) => {
          const ele = p.altitude != null ? `<ele>${p.altitude}</ele>` : '';
          return `      <trkpt lat="${p.lat}" lon="${p.lng}">${ele}<time>${iso(p.timestamp)}</time></trkpt>`;
        })
        .join('\n');
      return `    <trkseg>\n${pts}\n    </trkseg>`;
    })
    .join('\n');
  const name = escapeXml(trip.name);
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GeoTrack" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${name}</name><time>${iso(trip.startedAt)}</time></metadata>
  <trk>
    <name>${name}</name>
    <type>${trip.mode === 'gps' ? 'gps' : 'simulation'}</type>
${segments}
  </trk>
</gpx>
`;
}

/** GeoJSON (RFC 7946) : un Feature MultiLineString, coordonnées [lng, lat(, alt)]. */
export function toGeoJSON(trip: Trip): string {
  const segments = groupBySegment(trip.points);
  const stats = computeStats(trip, trip.endedAt ?? trip.updatedAt);
  return JSON.stringify(
    {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'MultiLineString',
            coordinates: segments.map((seg) =>
              seg.map((p) => (p.altitude != null ? [p.lng, p.lat, p.altitude] : [p.lng, p.lat])),
            ),
          },
          properties: {
            id: trip.id,
            name: trip.name,
            mode: trip.mode,
            startedAt: iso(trip.startedAt),
            endedAt: trip.endedAt !== null ? iso(trip.endedAt) : null,
            distanceMeters: Math.round(stats.distanceMeters),
            durationSeconds: Math.round(stats.durationMs / 1000),
            avgSpeedKmh: Number(stats.avgSpeedKmh.toFixed(1)),
            maxSpeedKmh: Number(stats.maxSpeedKmh.toFixed(1)),
            // Convention reconnue par plusieurs outils (geojson.io, togeojson).
            coordTimes: segments.map((seg) => seg.map((p) => iso(p.timestamp))),
          },
        },
      ],
    },
    null,
    2,
  );
}

const CSV_HEADER = ['segment', 'timestamp', 'latitude', 'longitude', 'accuracy_m', 'speed_ms', 'altitude_m'];

/** CSV : séparateur « ; », décimales « . », une ligne par point. */
export function toCSV(trip: Trip): string {
  const cell = (v: number | null | undefined) => (v == null ? '' : String(v));
  const rows = trip.points.map((p) =>
    [p.segment, iso(p.timestamp), p.lat, p.lng, cell(p.accuracy), cell(p.speed), cell(p.altitude)].join(';'),
  );
  return [CSV_HEADER.join(';'), ...rows].join('\n') + '\n';
}

export function exportTrip(trip: Trip, format: ExportFormat): string {
  switch (format) {
    case 'gpx':
      return toGPX(trip);
    case 'geojson':
      return toGeoJSON(trip);
    case 'csv':
      return toCSV(trip);
  }
}

/** Nom de fichier sûr, ex. « geotrack-2026-10-16-1405.gpx ». */
export function exportFileName(trip: Trip, format: ExportFormat): string {
  const d = new Date(trip.startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `geotrack-${stamp}.${EXPORT_FORMATS[format].extension}`;
}
