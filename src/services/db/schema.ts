import type { SqlDriver } from './sqlDriver';

/**
 * Migrations numérotées, appliquées dans l'ordre et une seule fois.
 * Ne jamais modifier une migration publiée : en ajouter une nouvelle.
 */
export const MIGRATIONS: readonly string[] = [
  // v1 — trajets + points append-only
  `CREATE TABLE trips (
     id TEXT PRIMARY KEY NOT NULL,
     name TEXT NOT NULL,
     mode TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     ended_at INTEGER,
     active_duration_ms INTEGER NOT NULL DEFAULT 0,
     resumed_at INTEGER,
     updated_at INTEGER NOT NULL,
     synced_at INTEGER,
     stats TEXT NOT NULL
   );
   CREATE INDEX idx_trips_started ON trips (started_at);
   CREATE TABLE points (
     trip_id TEXT NOT NULL,
     timestamp INTEGER NOT NULL,
     lat REAL NOT NULL,
     lng REAL NOT NULL,
     accuracy REAL,
     speed REAL,
     altitude REAL,
     segment INTEGER NOT NULL,
     PRIMARY KEY (trip_id, timestamp)
   );`,
];

export async function migrate(db: SqlDriver): Promise<void> {
  await db.execute('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL);');
  const rows = await db.query<{ version: number | null }>('SELECT MAX(version) AS version FROM schema_migrations;');
  const current = rows[0]?.version ?? 0;
  for (let v = current + 1; v <= MIGRATIONS.length; v++) {
    // DDL puis enregistrement de la version dans la même transaction.
    const statements = MIGRATIONS[v - 1]
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((sql) => ({ sql }));
    await db.batch([...statements, { sql: 'INSERT INTO schema_migrations (version) VALUES (?);', params: [v] }]);
  }
}
