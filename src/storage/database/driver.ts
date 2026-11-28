/**
 * Contrato mínimo de acesso ao SQLite.
 * Implementações: nativa (Android, @capacitor-community/sqlite) e web (sql.js, só para desenvolvimento no navegador).
 * Os testes usam uma implementação com node:sqlite.
 */
export type SqlValue = string | number | null;

export interface SqlDriver {
  readonly kind: 'native' | 'web' | 'test';
  /** Executa várias instruções sem parâmetros (migrações). */
  exec(sql: string): Promise<void>;
  /** Executa uma instrução com parâmetros. */
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  /** Consulta e retorna linhas como objetos. */
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Grava em disco quando o driver mantém o banco em memória (web). */
  persist?(): Promise<void>;
  close?(): Promise<void>;
}
