import type { TrackPoint, Trip, TripStats, TripSummary } from '../../types';
import { computeStats } from '../../utils/geo';
import { migrate } from './schema';
import type { SqlDriver, SqlStatement } from './sqlDriver';
import { metaOf, summaryOf, type TripMeta, type TripRepository } from './types';

interface TripRow {
  id: string;
  name: string;
  mode: Trip['mode'];
  started_at: number;
  ended_at: number | null;
  active_duration_ms: number;
  resumed_at: number | null;
  updated_at: number;
  synced_at: number | null;
  stats: string;
}

interface PointRow {
  timestamp: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  speed: number | null;
  altitude: number | null;
  segment: number;
}

const POINT_COLUMNS = 8;
/** Lignes par INSERT multi-valeurs (8 × 100 = 800 paramètres, sous la limite historique de 999). */
const POINTS_PER_INSERT = 100;

const rowToMeta = (r: TripRow): TripMeta => ({
  id: r.id,
  name: r.name,
  mode: r.mode,
  startedAt: r.started_at,
  endedAt: r.ended_at,
  activeDurationMs: r.active_duration_ms,
  resumedAt: r.resumed_at,
  updatedAt: r.updated_at,
  syncedAt: r.synced_at,
});

const rowToSummary = (r: TripRow): TripSummary => summaryOf(rowToMeta(r), JSON.parse(r.stats) as TripStats);

const rowToPoint = (r: PointRow): TrackPoint => ({
  lat: r.lat,
  lng: r.lng,
  timestamp: r.timestamp,
  accuracy: r.accuracy,
  speed: r.speed,
  altitude: r.altitude,
  segment: r.segment,
});

// INSERT OR REPLACE plutôt qu'un upsert ON CONFLICT : compatible avec les anciennes versions de SQLite (Android 7).
function upsertTrip(meta: TripMeta, stats: TripStats): SqlStatement {
  return {
    sql: `INSERT OR REPLACE INTO trips
            (id, name, mode, started_at, ended_at, active_duration_ms, resumed_at, updated_at, synced_at, stats)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    params: [
      meta.id,
      meta.name,
      meta.mode,
      meta.startedAt,
      meta.endedAt,
      meta.activeDurationMs,
      meta.resumedAt,
      meta.updatedAt,
      meta.syncedAt,
      JSON.stringify(stats),
    ],
  };
}

function insertPoints(tripId: string, points: readonly TrackPoint[]): SqlStatement[] {
  const out: SqlStatement[] = [];
  for (let i = 0; i < points.length; i += POINTS_PER_INSERT) {
    const chunk = points.slice(i, i + POINTS_PER_INSERT);
    const placeholders = chunk.map(() => `(${new Array(POINT_COLUMNS).fill('?').join(', ')})`).join(', ');
    out.push({
      sql: `INSERT OR IGNORE INTO points (trip_id, timestamp, lat, lng, accuracy, speed, altitude, segment)
            VALUES ${placeholders};`,
      params: chunk.flatMap((p) => [
        tripId,
        p.timestamp,
        p.lat,
        p.lng,
        p.accuracy ?? null,
        p.speed ?? null,
        p.altitude ?? null,
        p.segment,
      ]),
    });
  }
  return out;
}

export class SqliteTripRepository implements TripRepository {
  constructor(private readonly db: SqlDriver) {}

  init(): Promise<void> {
    return migrate(this.db);
  }

  async listTrips(): Promise<TripSummary[]> {
    const rows = await this.db.query<TripRow>(
      'SELECT * FROM trips WHERE ended_at IS NOT NULL ORDER BY started_at DESC;',
    );
    return rows.map(rowToSummary);
  }

  async getTrip(id: string): Promise<Trip | null> {
    const [row] = await this.db.query<TripRow>('SELECT * FROM trips WHERE id = ?;', [id]);
    if (!row) return null;
    const points = await this.db.query<PointRow>(
      `SELECT timestamp, lat, lng, accuracy, speed, altitude, segment
         FROM points WHERE trip_id = ? ORDER BY timestamp;`,
      [id],
    );
    return { ...rowToMeta(row), points: points.map(rowToPoint) };
  }

  saveTrip(trip: Trip): Promise<void> {
    const stats = computeStats(trip, trip.endedAt ?? trip.updatedAt);
    return this.db.batch([upsertTrip(metaOf(trip), stats), ...insertPoints(trip.id, trip.points)]);
  }

  saveTripMeta(meta: TripMeta, stats: TripStats): Promise<void> {
    const { sql, params } = upsertTrip(meta, stats);
    return this.db.run(sql, params);
  }

  appendPoints(tripId: string, points: readonly TrackPoint[]): Promise<void> {
    return this.db.batch(insertPoints(tripId, points));
  }

  deleteTrip(id: string): Promise<void> {
    return this.db.batch([
      { sql: 'DELETE FROM points WHERE trip_id = ?;', params: [id] },
      { sql: 'DELETE FROM trips WHERE id = ?;', params: [id] },
    ]);
  }

  markSynced(id: string, syncedAt: number): Promise<void> {
    return this.db.run('UPDATE trips SET synced_at = ? WHERE id = ?;', [syncedAt, id]);
  }

  async listUnsynced(): Promise<TripSummary[]> {
    const rows = await this.db.query<TripRow>(
      'SELECT * FROM trips WHERE ended_at IS NOT NULL AND synced_at IS NULL ORDER BY started_at;',
    );
    return rows.map(rowToSummary);
  }

  async loadActiveTrip(): Promise<Trip | null> {
    const [row] = await this.db.query<{ id: string }>(
      'SELECT id FROM trips WHERE ended_at IS NULL ORDER BY updated_at DESC LIMIT 1;',
    );
    return row ? this.getTrip(row.id) : null;
  }
}
