import { db } from './database/db';

const TABLES = ['ideas', 'idea_history', 'clients', 'projects', 'project_history', 'tasks', 'documents', 'document_versions', 'files',
  'memories', 'expressions', 'transcript_corrections', 'preferences', 'conversations', 'messages', 'activities'];

/** Exporta todos os dados locais em JSON (sem segredos: chaves ficam fora do banco). */
export async function exportAll(): Promise<string> {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) out[t] = await db().all(`SELECT * FROM ${t}`);
  return JSON.stringify({ app: 'MASON', exported_at: new Date().toISOString(), data: out }, null, 2);
}

export async function tableCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = Number((await db().all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`))[0]?.n ?? 0);
  return out;
}

export async function schemaVersion(): Promise<number> {
  return Number((await db().all<{ version: number }>('SELECT version FROM schema_version'))[0]?.version ?? 0);
}
