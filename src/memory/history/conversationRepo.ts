import { db } from '../../storage/database/db';
import { now, uid } from '../../core/util';
import type { ChatMessage } from '../../core/types';

/**
 * Uma conversa contínua por padrão (o MASON é um só). O usuário pode iniciar uma nova quando quiser.
 */
export async function currentConversationId(): Promise<string> {
  const rows = await db().all<{ id: string }>('SELECT id FROM conversations ORDER BY updated_at DESC LIMIT 1');
  if (rows[0]) return rows[0].id;
  return newConversation();
}

export async function newConversation(): Promise<string> {
  const id = uid();
  const t = now();
  await db().run('INSERT INTO conversations (id,title,summary,created_at,updated_at) VALUES (?,?,?,?,?)', [id, null, null, t, t]);
  return id;
}

export async function addMessage(conversationId: string, role: ChatMessage['role'], content: string, meta?: unknown): Promise<ChatMessage> {
  const m: ChatMessage = { id: uid(), conversation_id: conversationId, role, content, meta: meta ? JSON.stringify(meta) : null, created_at: now() };
  await db().run('INSERT INTO messages (id,conversation_id,role,content,meta,created_at) VALUES (?,?,?,?,?,?)',
    [m.id, m.conversation_id, m.role, m.content, m.meta, m.created_at]);
  await db().run('UPDATE conversations SET updated_at = ? WHERE id = ?', [m.created_at, conversationId]);
  return m;
}

export async function getMessages(conversationId: string, limit = 200): Promise<ChatMessage[]> {
  const rows = await db().all<ChatMessage>(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?', [conversationId, limit]);
  return rows.reverse();
}

export async function setConversationSummary(conversationId: string, summary: string): Promise<void> {
  await db().run('UPDATE conversations SET summary = ? WHERE id = ?', [summary, conversationId]);
}

export async function previousSummaries(excludeId: string, limit = 3): Promise<string[]> {
  const rows = await db().all<{ summary: string }>(
    'SELECT summary FROM conversations WHERE id != ? AND summary IS NOT NULL ORDER BY updated_at DESC LIMIT ?', [excludeId, limit]);
  return rows.map((r) => r.summary);
}

export async function clearAllConversations(): Promise<void> {
  await db().run('DELETE FROM messages');
  await db().run('DELETE FROM conversations');
}
