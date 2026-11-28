import type { SqlDriver, SqlValue } from './driver';

/** SQLite real no Android, via @capacitor-community/sqlite. */
export async function createNativeDriver(dbName = 'mason'): Promise<SqlDriver> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const exists = (await sqlite.isConnection(dbName, false)).result;
  const db = exists
    ? await sqlite.retrieveConnection(dbName, false)
    : await sqlite.createConnection(dbName, false, 'no-encryption', 1, false);
  await db.open();

  return {
    kind: 'native',
    async exec(sql) {
      await db.execute(sql, false);
    },
    async run(sql, params: SqlValue[] = []) {
      const res = await db.run(sql, params, false);
      return { changes: res.changes?.changes ?? 0 };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      const res = await db.query(sql, params);
      return (res.values ?? []) as T[];
    },
    async close() {
      await sqlite.closeConnection(dbName, false);
    },
  };
}
