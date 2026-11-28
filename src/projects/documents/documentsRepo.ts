import { db } from '../../storage/database/db';
import { now, uid } from '../../core/util';
import { emitChange } from '../../core/events';
import { logActivity } from '../../memory/history/activityRepo';
import { DOCUMENT_KINDS, type DocumentKind, type DocumentRecord, type DocumentVersion } from '../../core/types';

/**
 * Salva um documento. Se `document_id` for informado, cria uma nova versão (nunca sobrescreve a anterior).
 */
export async function saveDocument(input: {
  document_id?: string | null;
  title: string;
  kind: DocumentKind;
  department: string;
  content: string;
  project_id?: string | null;
  idea_id?: string | null;
  note?: string | null;
  source: 'usuario' | 'ia';
}): Promise<{ document: DocumentRecord; version: DocumentVersion }> {
  if (!input.content.trim()) throw new Error('O documento está vazio.');
  if (!DOCUMENT_KINDS.includes(input.kind)) throw new Error(`Tipo de documento inválido: ${input.kind}`);
  const t = now();
  let doc: DocumentRecord;
  if (input.document_id) {
    const existing = await getDocument(input.document_id);
    if (!existing) throw new Error('Documento não encontrado para criar nova versão.');
    doc = { ...existing, current_version: existing.current_version + 1, updated_at: t };
    await db().run('UPDATE documents SET current_version = ?, updated_at = ? WHERE id = ?', [doc.current_version, t, doc.id]);
  } else {
    if (!input.title.trim()) throw new Error('O documento precisa de um título.');
    doc = {
      id: uid(), title: input.title.trim(), kind: input.kind, department: input.department,
      project_id: input.project_id ?? null, idea_id: input.idea_id ?? null, current_version: 1, created_at: t, updated_at: t,
    };
    await db().run(
      'INSERT INTO documents (id,title,kind,department,project_id,idea_id,current_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [doc.id, doc.title, doc.kind, doc.department, doc.project_id, doc.idea_id, 1, t, t],
    );
  }
  const version: DocumentVersion = {
    id: uid(), document_id: doc.id, version: doc.current_version, content: input.content,
    note: input.note ?? null, source: input.source, created_at: t,
  };
  await db().run('INSERT INTO document_versions (id,document_id,version,content,note,source,created_at) VALUES (?,?,?,?,?,?,?)',
    [version.id, doc.id, version.version, version.content, version.note, version.source, t]);
  await logActivity({
    type: 'document_saved', entity_type: 'document', entity_id: doc.id,
    summary: `${doc.title} — versão ${doc.current_version}`, section: doc.department,
  });
  emitChange('documents');
  return { document: doc, version };
}

export async function getDocument(id: string): Promise<DocumentRecord | null> {
  return (await db().all<DocumentRecord>('SELECT * FROM documents WHERE id = ?', [id]))[0] ?? null;
}

export async function listDocuments(filter: { project_id?: string; idea_id?: string; department?: string } = {}): Promise<DocumentRecord[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (filter.project_id) { where.push('project_id = ?'); params.push(filter.project_id); }
  if (filter.idea_id) { where.push('idea_id = ?'); params.push(filter.idea_id); }
  if (filter.department) { where.push('department = ?'); params.push(filter.department); }
  return db().all<DocumentRecord>(`SELECT * FROM documents ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`, params);
}

export async function documentVersions(documentId: string): Promise<DocumentVersion[]> {
  return db().all<DocumentVersion>('SELECT * FROM document_versions WHERE document_id = ? ORDER BY version DESC', [documentId]);
}

export async function latestVersion(documentId: string): Promise<DocumentVersion | null> {
  return (await documentVersions(documentId))[0] ?? null;
}
