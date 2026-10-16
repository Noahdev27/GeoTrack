import initSqlJs from 'sql.js';
import type { SqlDriver, SqlValue } from '../services/db/sqlDriver';

/** Pilote SQLite en mémoire (sql.js / WebAssembly) pour tester le vrai SQL sans appareil. */
export async function sqljsDriver(): Promise<SqlDriver> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  return {
    async execute(sql) {
      db.exec(sql);
    },
    async run(sql, params: SqlValue[] = []) {
      db.run(sql, params);
    },
    async query<T>(sql: string, params: SqlValue[] = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return rows;
    },
    async batch(statements) {
      db.exec('BEGIN');
      try {
        for (const s of statements) db.run(s.sql, s.params ?? []);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
