import type { TrackPoint, TripStats } from '../types';
import type { TripMeta, TripRepository } from './db/types';

type Storage = Pick<TripRepository, 'saveTripMeta' | 'appendPoints' | 'deleteTrip'>;

export interface TripPersisterOptions {
  /** Taille de lot déclenchant une écriture immédiate des points en attente. */
  maxBatch?: number;
  onError?: (err: unknown) => void;
}

/**
 * Persistance du trajet en cours : les points sont mis en tampon puis ajoutés par lots,
 * et toutes les écritures sont sérialisées (une suppression ne peut pas croiser un ajout).
 * En cas d'échec, le lot est remis en tête du tampon et retenté au prochain flush.
 */
export class TripPersister {
  private tripId: string | null = null;
  private pending: TrackPoint[] = [];
  private chain: Promise<void> = Promise.resolve();
  private readonly maxBatch: number;

  constructor(
    private readonly storage: Storage,
    private readonly options: TripPersisterOptions = {},
  ) {
    this.maxBatch = options.maxBatch ?? 20;
  }

  get pendingCount(): number {
    return this.pending.length;
  }

  /** Associe le persister à un trajet (nouveau ou restauré) et enregistre ses métadonnées. */
  begin(meta: TripMeta, stats: TripStats): void {
    this.tripId = meta.id;
    this.pending = [];
    this.saveMeta(meta, stats);
  }

  push(point: TrackPoint): void {
    if (!this.tripId) return;
    this.pending.push(point);
    if (this.pending.length >= this.maxBatch) this.flush();
  }

  flush(): void {
    const tripId = this.tripId;
    if (!tripId || this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];
    this.enqueue(async () => {
      try {
        await this.storage.appendPoints(tripId, batch);
      } catch (err) {
        if (this.tripId === tripId) this.pending = [...batch, ...this.pending];
        throw err;
      }
    });
  }

  saveMeta(meta: TripMeta, stats: TripStats): void {
    this.enqueue(() => this.storage.saveTripMeta(meta, stats));
  }

  /** Abandonne le trajet courant (trajet trop court) : tampon vidé, données supprimées. */
  discard(): void {
    const tripId = this.tripId;
    this.pending = [];
    this.tripId = null;
    if (tripId) this.enqueue(() => this.storage.deleteTrip(tripId));
  }

  /** Termine l'association avec le trajet courant (après la dernière écriture). */
  end(): void {
    this.flush();
    this.tripId = null;
  }

  /** Résout quand toutes les écritures en file sont terminées. */
  idle(): Promise<void> {
    return this.chain;
  }

  private enqueue(task: () => Promise<void>): void {
    this.chain = this.chain.then(task).catch((err: unknown) => {
      this.options.onError?.(err);
    });
  }
}
