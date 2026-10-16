import { Network } from '@capacitor/network';
import type { SyncState, Trip } from '../types';
import { tripStorage, type TripStorage } from './storage';

/** Transport réseau vers le backend. */
export interface SyncTransport {
  upload(trip: Trip): Promise<void>;
}

/** Envoie le trajet en POST JSON vers `endpoint`. */
export function httpTransport(endpoint: string): SyncTransport {
  return {
    async upload(trip) {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trip),
      });
      if (!res.ok) throw new Error(`Serveur : HTTP ${res.status}`);
    },
  };
}

/** Backend simulé (aucun endpoint configuré) : latence artificielle, échoue hors-ligne. */
export function mockTransport(latencyMs = 700): SyncTransport {
  return {
    async upload() {
      await new Promise((r) => setTimeout(r, latencyMs));
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new Error('Réseau indisponible');
      }
    },
  };
}

export interface NetworkAdapter {
  isOnline(): Promise<boolean>;
  onChange(listener: (online: boolean) => void): () => void;
}

export const capacitorNetwork: NetworkAdapter = {
  async isOnline() {
    try {
      return (await Network.getStatus()).connected;
    } catch {
      return typeof navigator === 'undefined' ? true : navigator.onLine;
    }
  },
  onChange(listener) {
    const handle = Network.addListener('networkStatusChange', (s) => listener(s.connected));
    return () => void handle.then((h) => h.remove());
  },
};

const MIN_RETRY_MS = 5_000;
const MAX_RETRY_MS = 5 * 60_000;

/**
 * File de synchronisation offline-first :
 * les trajets terminés sont stockés localement puis envoyés dès que le réseau est disponible.
 * En cas d'échec, nouvel essai avec backoff exponentiel.
 */
export class SyncService {
  private state: SyncState = { online: true, syncing: false, pendingCount: 0, lastSyncAt: null, lastError: null };
  private listeners = new Set<(s: SyncState) => void>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = MIN_RETRY_MS;
  private unsubscribeNetwork: (() => void) | null = null;
  private running: Promise<void> | null = null;
  private rerunRequested = false;

  constructor(
    private readonly transport: SyncTransport,
    private readonly storage: TripStorage = tripStorage,
    private readonly network: NetworkAdapter = capacitorNetwork,
  ) {}

  async init(): Promise<void> {
    if (this.unsubscribeNetwork) return;
    this.unsubscribeNetwork = this.network.onChange((online) => {
      this.update({ online });
      if (online) void this.syncNow();
    });
    this.update({ online: await this.network.isOnline() });
    await this.syncNow();
  }

  dispose(): void {
    this.unsubscribeNetwork?.();
    this.unsubscribeNetwork = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  getState(): SyncState {
    return this.state;
  }

  subscribe(listener: (s: SyncState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /**
   * Lance une synchronisation. Si une synchro est déjà en cours, une nouvelle passe
   * est enchaînée à la fin pour prendre en compte les trajets ajoutés entre-temps.
   */
  syncNow(): Promise<void> {
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.rerunRequested = false;
        await this.run();
      } while (this.rerunRequested && this.state.online && !this.state.lastError);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<void> {
    const pending = await this.storage.listUnsynced();
    this.update({ pendingCount: pending.length });
    if (pending.length === 0 || !this.state.online) return;

    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.update({ syncing: true, lastError: null });
    let failed: string | null = null;

    for (const summary of pending) {
      const trip = await this.storage.getTrip(summary.id);
      if (!trip) continue;
      try {
        await this.transport.upload(trip);
        const now = Date.now();
        await this.storage.markSynced(trip.id, now);
        this.update({ pendingCount: Math.max(0, this.state.pendingCount - 1), lastSyncAt: now });
      } catch (err) {
        failed = err instanceof Error ? err.message : String(err);
        break;
      }
    }

    this.update({ syncing: false, lastError: failed });
    if (failed) this.scheduleRetry();
    else this.retryDelay = MIN_RETRY_MS;
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RETRY_MS);
  }

  private update(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }
}

const endpoint = import.meta.env.VITE_SYNC_ENDPOINT as string | undefined;

/** Instance partagée par l'application. */
export const syncService = new SyncService(endpoint ? httpTransport(endpoint) : mockTransport());
export const isMockSync = !endpoint;
