import type { SqlDriver, SqlValue } from '../src/storage/database/driver';

/** Driver de teste usando o SQLite embutido no Node 22+ (node:sqlite). */
export async function createNodeDriver(): Promise<SqlDriver> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return {
    kind: 'test',
    async exec(sql) { db.exec(sql); },
    async run(sql, params: SqlValue[] = []) {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return db.prepare(sql).all(...params).map((row) => ({ ...row })) as T[];
    },
  };
}
