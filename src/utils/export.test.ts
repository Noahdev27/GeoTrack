// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Trip } from '../types';
import { exportFileName, exportTrip, groupBySegment, toCSV, toGeoJSON, toGPX } from './export';

const T0 = Date.UTC(2026, 9, 16, 12, 5, 0);

const trip: Trip = {
  id: 'trip-1',
  name: 'Livraison <Rivoli> & "Concorde"',
  mode: 'gps',
  startedAt: T0,
  endedAt: T0 + 60_000,
  points: [
    { lat: 48.8606, lng: 2.3376, timestamp: T0, segment: 0, accuracy: 4, speed: 8.5, altitude: 35 },
    { lat: 48.8635, lng: 2.329, timestamp: T0 + 10_000, segment: 0, accuracy: 5, speed: null, altitude: null },
    { lat: 48.8656, lng: 2.3212, timestamp: T0 + 40_000, segment: 1 },
    { lat: 48.8676, lng: 2.314, timestamp: T0 + 50_000, segment: 1 },
  ],
  activeDurationMs: 30_000,
  resumedAt: null,
  updatedAt: T0 + 60_000,
  syncedAt: null,
};

describe('export GPX', () => {
  const xml = toGPX(trip);
  const doc = new DOMParser().parseFromString(xml, 'application/xml');

  it('est un XML valide (GPX 1.1)', () => {
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    expect(doc.documentElement.getAttribute('version')).toBe('1.1');
  });

  it('crée un <trkseg> par segment avec horodatage ISO et altitude si connue', () => {
    const segs = doc.getElementsByTagName('trkseg');
    expect(segs).toHaveLength(2);
    const first = segs[0].getElementsByTagName('trkpt')[0];
    expect(first.getAttribute('lat')).toBe('48.8606');
    expect(first.getAttribute('lon')).toBe('2.3376');
    expect(first.getElementsByTagName('time')[0].textContent).toBe('2026-10-16T12:05:00.000Z');
    expect(first.getElementsByTagName('ele')[0].textContent).toBe('35');
    expect(segs[0].getElementsByTagName('trkpt')[1].getElementsByTagName('ele')).toHaveLength(0);
  });

  it('échappe le nom', () => {
    expect(doc.getElementsByTagName('name')[0].textContent).toBe(trip.name);
    expect(xml).toContain('&lt;Rivoli&gt; &amp; &quot;Concorde&quot;');
  });
});

describe('export GeoJSON', () => {
  const geo = JSON.parse(toGeoJSON(trip));
  const feature = geo.features[0];

  it('produit un MultiLineString en [lng, lat(, alt)]', () => {
    expect(geo.type).toBe('FeatureCollection');
    expect(feature.geometry.type).toBe('MultiLineString');
    expect(feature.geometry.coordinates).toHaveLength(2);
    expect(feature.geometry.coordinates[0][0]).toEqual([2.3376, 48.8606, 35]);
    expect(feature.geometry.coordinates[1][1]).toEqual([2.314, 48.8676]);
  });

  it('inclut les métriques et les horodatages', () => {
    expect(feature.properties.durationSeconds).toBe(30);
    expect(feature.properties.distanceMeters).toBeGreaterThan(600);
    expect(feature.properties.coordTimes[1]).toEqual(['2026-10-16T12:05:40.000Z', '2026-10-16T12:05:50.000Z']);
  });
});

describe('export CSV', () => {
  it('une ligne par point, séparateur « ; », champs vides si inconnus', () => {
    expect(toCSV(trip).trimEnd().split('\n')).toEqual([
      'segment;timestamp;latitude;longitude;accuracy_m;speed_ms;altitude_m',
      '0;2026-10-16T12:05:00.000Z;48.8606;2.3376;4;8.5;35',
      '0;2026-10-16T12:05:10.000Z;48.8635;2.329;5;;',
      '1;2026-10-16T12:05:40.000Z;48.8656;2.3212;;;',
      '1;2026-10-16T12:05:50.000Z;48.8676;2.314;;;',
    ]);
  });
});

describe('utilitaires', () => {
  it('groupBySegment', () => {
    expect(groupBySegment(trip.points).map((s) => s.length)).toEqual([2, 2]);
    expect(groupBySegment([])).toEqual([]);
  });

  it('exportTrip aiguille vers le bon format', () => {
    expect(exportTrip(trip, 'gpx')).toContain('<gpx');
    expect(exportTrip(trip, 'geojson')).toContain('MultiLineString');
    expect(exportTrip(trip, 'csv').startsWith('segment;')).toBe(true);
  });

  it('nom de fichier daté', () => {
    expect(exportFileName(trip, 'gpx')).toMatch(/^geotrack-2026-10-16-\d{4}\.gpx$/);
    expect(exportFileName(trip, 'geojson').endsWith('.geojson')).toBe(true);
  });
});
