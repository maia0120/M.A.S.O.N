import type { SqlDriver } from './driver';
import { MIGRATIONS } from './schema';

let current: SqlDriver | null = null;

export async function migrate(driver: SqlDriver): Promise<void> {
  await driver.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const rows = await driver.all<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
  let version = rows[0]?.version ?? 0;
  if (rows.length === 0) await driver.run('INSERT INTO schema_version (version) VALUES (0)');
  while (version < MIGRATIONS.length) {
    await driver.exec(MIGRATIONS[version]);
    version += 1;
    await driver.run('UPDATE schema_version SET version = ?', [version]);
  }
}

/** Abre o banco adequado à plataforma e aplica migrações. */
export async function openDatabase(): Promise<SqlDriver> {
  if (current) return current;
  const { Capacitor } = await import('@capacitor/core');
  const driver = Capacitor.isNativePlatform()
    ? await (await import('./nativeDriver')).createNativeDriver()
    : await (await import('./webDriver')).createWebDriver();
  await migrate(driver);
  current = driver;
  return driver;
}

/** Usado pelos testes e pelo smoke test para injetar outro driver. */
export async function useDriver(driver: SqlDriver): Promise<SqlDriver> {
  await migrate(driver);
  current = driver;
  return driver;
}

export function db(): SqlDriver {
  if (!current) throw new Error('Banco de dados ainda não foi aberto.');
  return current;
}
