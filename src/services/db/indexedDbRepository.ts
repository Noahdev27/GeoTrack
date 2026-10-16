import type { TrackPoint, Trip, TripStats, TripSummary } from '../../types';
import { computeStats } from '../../utils/geo';
import { metaOf, summaryOf, type TripMeta, type TripRepository } from './types';

/** Stockage web (navigateur, dev, E2E) : IndexedDB, sans dépendance. */

const DB_VERSION = 1;
const TRIPS = 'trips';
const POINTS = 'points';

interface TripRecord extends TripMeta {
  stats: TripStats;
}

interface PointRecord extends TrackPoint {
  tripId: string;
}

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction IndexedDB annulée'));
  });

/** Tous les points d'un trajet : clé composée [tripId, timestamp], donc triés par horodatage. */
const tripPointsRange = (tripId: string) => IDBKeyRange.bound([tripId, -Infinity], [tripId, Infinity]);

const recordToSummary = ({ stats, ...meta }: TripRecord): TripSummary => summaryOf(meta, stats);

const toPoint = ({ tripId: _tripId, ...point }: PointRecord): TrackPoint => point;

export class IndexedDbTripRepository implements TripRepository {
  private db: IDBDatabase | null = null;

  constructor(private readonly name = 'geotrack') {}

  async init(): Promise<void> {
    if (this.db) return;
    const open = indexedDB.open(this.name, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      // v1
      if (!db.objectStoreNames.contains(TRIPS)) db.createObjectStore(TRIPS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(POINTS)) db.createObjectStore(POINTS, { keyPath: ['tripId', 'timestamp'] });
    };
    this.db = await request(open);
  }

  /** Ferme la connexion (tests, changement de base). */
  close(): void {
    this.db?.close();
    this.db = null;
  }

  private tx(stores: string[], mode: IDBTransactionMode) {
    if (!this.db) throw new Error('IndexedDbTripRepository : init() non appelé');
    return this.db.transaction(stores, mode);
  }

  private async allTrips(): Promise<TripRecord[]> {
    return request(this.tx([TRIPS], 'readonly').objectStore(TRIPS).getAll() as IDBRequest<TripRecord[]>);
  }

  async listTrips(): Promise<TripSummary[]> {
    return (await this.allTrips())
      .filter((t) => t.endedAt !== null)
      .sort((a, b) => b.startedAt - a.startedAt)
      .map(recordToSummary);
  }

  async getTrip(id: string): Promise<Trip | null> {
    const tx = this.tx([TRIPS, POINTS], 'readonly');
    const [record, points] = await Promise.all([
      request(tx.objectStore(TRIPS).get(id) as IDBRequest<TripRecord | undefined>),
      request(tx.objectStore(POINTS).getAll(tripPointsRange(id)) as IDBRequest<PointRecord[]>),
    ]);
    if (!record) return null;
    const { stats: _stats, ...meta } = record;
    return { ...meta, points: points.map(toPoint) };
  }

  saveTrip(trip: Trip): Promise<void> {
    const tx = this.tx([TRIPS, POINTS], 'readwrite');
    const record: TripRecord = { ...metaOf(trip), stats: computeStats(trip, trip.endedAt ?? trip.updatedAt) };
    tx.objectStore(TRIPS).put(record);
    const store = tx.objectStore(POINTS);
    for (const p of trip.points) store.put({ ...p, tripId: trip.id } satisfies PointRecord);
    return done(tx);
  }

  saveTripMeta(meta: TripMeta, stats: TripStats): Promise<void> {
    const tx = this.tx([TRIPS], 'readwrite');
    tx.objectStore(TRIPS).put({ ...meta, stats } satisfies TripRecord);
    return done(tx);
  }

  appendPoints(tripId: string, points: readonly TrackPoint[]): Promise<void> {
    if (points.length === 0) return Promise.resolve();
    const tx = this.tx([POINTS], 'readwrite');
    const store = tx.objectStore(POINTS);
    // put() sur la clé [tripId, timestamp] : un point déjà présent est simplement réécrit à l'identique.
    for (const p of points) store.put({ ...p, tripId } satisfies PointRecord);
    return done(tx);
  }

  deleteTrip(id: string): Promise<void> {
    const tx = this.tx([TRIPS, POINTS], 'readwrite');
    tx.objectStore(TRIPS).delete(id);
    tx.objectStore(POINTS).delete(tripPointsRange(id));
    return done(tx);
  }

  async markSynced(id: string, syncedAt: number): Promise<void> {
    const tx = this.tx([TRIPS], 'readwrite');
    const store = tx.objectStore(TRIPS);
    const record = await request(store.get(id) as IDBRequest<TripRecord | undefined>);
    if (record) store.put({ ...record, syncedAt });
    return done(tx);
  }

  async listUnsynced(): Promise<TripSummary[]> {
    return (await this.allTrips())
      .filter((t) => t.endedAt !== null && t.syncedAt === null)
      .sort((a, b) => a.startedAt - b.startedAt)
      .map(recordToSummary);
  }

  async loadActiveTrip(): Promise<Trip | null> {
    const active = (await this.allTrips())
      .filter((t) => t.endedAt === null)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return active ? this.getTrip(active.id) : null;
  }
}
