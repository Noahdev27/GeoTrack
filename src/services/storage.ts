import { Capacitor } from '@capacitor/core';
import type { Trip, TripSummary } from '../types';
import { computeStats } from '../utils/geo';
import { IndexedDbTripRepository } from './db/indexedDbRepository';
import { migrateFromPreferences } from './db/migrateFromPreferences';
import { SqliteTripRepository } from './db/sqliteRepository';
import { capacitorSqliteDriver } from './db/sqlDriver';
import { metaOf, summaryOf, type TripRepository } from './db/types';

/**
 * Stockage offline des trajets.
 *  - Android : SQLite (@capacitor-community/sqlite), points append-only.
 *  - Web : IndexedDB.
 * Au premier accès, le schéma est créé et les données du MVP (Capacitor Preferences) sont importées.
 */

export type { TripRepository, TripMeta } from './db/types';

let repository: Promise<TripRepository> | null = null;

async function createRepository(): Promise<TripRepository> {
  const repo = Capacitor.isNativePlatform()
    ? new SqliteTripRepository(await capacitorSqliteDriver())
    : new IndexedDbTripRepository();
  await repo.init();
  const imported = await migrateFromPreferences(repo);
  if (imported > 0) console.info(`[storage] ${imported} trajet(s) importé(s) depuis le stockage v0.1`);
  return repo;
}

function repo(): Promise<TripRepository> {
  repository ??= createRepository().catch((err: unknown) => {
    repository = null; // nouvel essai au prochain accès
    throw err;
  });
  return repository;
}

/** Réinitialise la connexion (tests uniquement). */
export function resetTripStorageForTests(): void {
  repository = null;
}

export function toSummary(trip: Trip): TripSummary {
  return summaryOf(metaOf(trip), computeStats(trip, trip.endedAt ?? trip.updatedAt));
}

/** Point d'accès unique au stockage, initialisé paresseusement. */
export const tripStorage: Omit<TripRepository, 'init'> = {
  listTrips: () => repo().then((r) => r.listTrips()),
  getTrip: (id) => repo().then((r) => r.getTrip(id)),
  saveTrip: (trip) => repo().then((r) => r.saveTrip(trip)),
  saveTripMeta: (meta, stats) => repo().then((r) => r.saveTripMeta(meta, stats)),
  appendPoints: (tripId, points) => repo().then((r) => r.appendPoints(tripId, points)),
  deleteTrip: (id) => repo().then((r) => r.deleteTrip(id)),
  markSynced: (id, at) => repo().then((r) => r.markSynced(id, at)),
  listUnsynced: () => repo().then((r) => r.listUnsynced()),
  loadActiveTrip: () => repo().then((r) => r.loadActiveTrip()),
};

export type TripStorage = typeof tripStorage;
