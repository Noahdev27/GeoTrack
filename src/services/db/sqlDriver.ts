export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}

/** Abstraction minimale d'un moteur SQLite (plugin natif en prod, sql.js en test). */
export interface SqlDriver {
  /** Exécute un script (plusieurs instructions, sans paramètres). */
  execute(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  query<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Exécute plusieurs instructions dans une même transaction. */
  batch(statements: SqlStatement[]): Promise<void>;
}

const DB_NAME = 'geotrack';

/** Pilote basé sur @capacitor-community/sqlite (Android). Chargé dynamiquement : absent du bundle web initial. */
export async function capacitorSqliteDriver(): Promise<SqlDriver> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;
  const db = exists
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);
  await db.open();

  return {
    async execute(sql) {
      await db.execute(sql, false);
    },
    async run(sql, params = []) {
      await db.run(sql, params, false);
    },
    async query<T>(sql: string, params: SqlValue[] = []) {
      return ((await db.query(sql, params)).values ?? []) as T[];
    },
    async batch(statements) {
      if (statements.length === 0) return;
      await db.executeSet(
        statements.map((s) => ({ statement: s.sql, values: s.params ?? [] })),
        true,
      );
    },
  };
}
