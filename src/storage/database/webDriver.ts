import type { SqlDriver, SqlValue } from './driver';

/**
 * SQLite no navegador (sql.js), usado apenas para desenvolver com `npm run dev`.
 * O banco fica em memória e é gravado no IndexedDB após cada escrita.
 */
const IDB_NAME = 'mason-web';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'db';

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(IDB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(IDB_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(IDB_STORE, mode);
      const req = fn(tx.objectStore(IDB_STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    };
  });
}

export async function createWebDriver(): Promise<SqlDriver> {
  const initSqlJs = (await import('sql.js')).default;
  const wasmUrl = (await import('sql.js/dist/sql-wasm.wasm?url')).default;
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await idb<Uint8Array | undefined>('readonly', (s) => s.get(IDB_KEY)).catch(() => undefined);
  const db = saved ? new SQL.Database(saved) : new SQL.Database();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const persist = async () => {
    await idb('readwrite', (s) => s.put(db.export(), IDB_KEY));
  };
  const schedulePersist = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void persist(), 300);
  };

  return {
    kind: 'web',
    async exec(sql) {
      db.exec(sql);
      schedulePersist();
    },
    async run(sql, params: SqlValue[] = []) {
      db.run(sql, params);
      schedulePersist();
      return { changes: db.getRowsModified() };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return rows;
    },
    persist,
  };
}
