import { db } from '../../storage/database/db';
import { now, uid, rankBy } from '../../core/util';
import { emitChange } from '../../core/events';
import { MEMORY_KINDS, MEMORY_SOURCES, type Memory, type MemoryKind, type MemorySource } from '../../core/types';

export async function remember(input: { kind: MemoryKind; content: string; source: MemorySource; subject?: string | null }): Promise<Memory> {
  if (!MEMORY_KINDS.includes(input.kind)) throw new Error(`Tipo de memória inválido: ${input.kind}`);
  if (!MEMORY_SOURCES.includes(input.source)) throw new Error(`Origem inválida: ${input.source}`);
  if (!input.content.trim()) throw new Error('Memória vazia.');
  const t = now();
  const m: Memory = { id: uid(), kind: input.kind, subject: input.subject?.trim() || null, content: input.content.trim(), source: input.source, active: 1, created_at: t, updated_at: t };
  await db().run('INSERT INTO memories (id,kind,subject,content,source,active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    [m.id, m.kind, m.subject, m.content, m.source, 1, t, t]);
  emitChange('memories');
  return m;
}

export async function listMemories(includeInactive = false): Promise<Memory[]> {
  return db().all<Memory>(`SELECT * FROM memories ${includeInactive ? '' : 'WHERE active = 1'} ORDER BY updated_at DESC`);
}

export async function updateMemory(id: string, changes: Partial<Pick<Memory, 'content' | 'source' | 'kind' | 'subject' | 'active'>>): Promise<void> {
  const fields = Object.entries(changes).filter(([, v]) => v !== undefined);
  if (!fields.length) return;
  if (changes.source && !MEMORY_SOURCES.includes(changes.source)) throw new Error('Origem inválida.');
  await db().run(`UPDATE memories SET ${fields.map(([k]) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    [...fields.map(([, v]) => v as string | number), now(), id]);
  emitChange('memories');
}

export async function deleteMemory(id: string): Promise<void> {
  await db().run('DELETE FROM memories WHERE id = ?', [id]);
  emitChange('memories');
}

export async function searchMemories(query: string): Promise<Memory[]> {
  const all = await listMemories();
  return rankBy(all, query, (m) => `${m.subject ?? ''} ${m.content}`, 0.3);
}
