import { db } from '../../storage/database/db';
import { now, uid } from '../../core/util';
import { emitChange } from '../../core/events';
import { logActivity } from '../../memory/history/activityRepo';
import type { StoredFile } from '../../core/types';
import { getProject, addProjectHistory } from '../projectsRepo';

const TEXT_EXT = /\.(txt|md|markdown|json|js|jsx|ts|tsx|css|scss|html|htm|xml|yml|yaml|toml|ini|env\.example|py|java|kt|swift|go|rs|rb|php|sql|sh|csv|svg|gradle|properties)$/i;
const MAX_TEXT = 400_000; // caracteres guardados para análise

export function isTextFile(name: string, mime: string | null): boolean {
  return (mime?.startsWith('text/') ?? false) || mime === 'application/json' || TEXT_EXT.test(name);
}

export interface ImportInput {
  name: string;
  mime: string | null;
  size: number;
  text: string | null;
  storage_ref: string | null;
}

/** Arquivos entram na "caixa de entrada" (project_id NULL) ou direto num projeto. */
export async function importFiles(items: ImportInput[], project_id: string | null = null): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  for (const it of items) {
    const f: StoredFile = {
      id: uid(), project_id, name: it.name, mime: it.mime, size: it.size, storage_ref: it.storage_ref,
      text_content: it.text ? it.text.slice(0, MAX_TEXT) : null, analysis: null, version_label: null, imported_at: now(),
    };
    await db().run(
      'INSERT INTO files (id,project_id,name,mime,size,storage_ref,text_content,analysis,version_label,imported_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [f.id, f.project_id, f.name, f.mime, f.size, f.storage_ref, f.text_content, null, null, f.imported_at],
    );
    out.push(f);
  }
  if (out.length) {
    await logActivity({ type: 'files_imported', entity_type: 'file', entity_id: null, summary: `${out.length} arquivo(s) importado(s)`, section: 'projects' });
    emitChange('files');
  }
  return out;
}

export async function listFiles(filter: { project_id?: string | null; inbox?: boolean } = {}): Promise<StoredFile[]> {
  if (filter.inbox) return db().all<StoredFile>('SELECT * FROM files WHERE project_id IS NULL ORDER BY imported_at DESC');
  if (filter.project_id) return db().all<StoredFile>('SELECT * FROM files WHERE project_id = ? ORDER BY imported_at DESC', [filter.project_id]);
  return db().all<StoredFile>('SELECT * FROM files ORDER BY imported_at DESC');
}

export async function getFiles(ids: string[]): Promise<StoredFile[]> {
  if (!ids.length) return [];
  return db().all<StoredFile>(`SELECT * FROM files WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
}

/** Associa arquivos já importados a um projeto e registra a versão. */
export async function assignFiles(fileIds: string[], projectId: string, versionLabel: string | null): Promise<StoredFile[]> {
  const project = await getProject(projectId);
  if (!project) throw new Error('Projeto não encontrado.');
  const files = await getFiles(fileIds);
  const missing = fileIds.filter((id) => !files.some((f) => f.id === id));
  if (missing.length) throw new Error(`Arquivo(s) não encontrado(s): ${missing.join(', ')}`);
  for (const f of files) {
    await db().run('UPDATE files SET project_id = ?, version_label = ? WHERE id = ?', [projectId, versionLabel, f.id]);
  }
  await addProjectHistory(projectId, 'Arquivos recebidos', `${files.length} arquivo(s)${versionLabel ? ` — ${versionLabel}` : ''}: ${files.map((f) => f.name).join(', ')}`);
  await logActivity({ type: 'files_assigned', entity_type: 'project', entity_id: projectId, summary: `${files.length} arquivo(s) associados a ${project.name}`, section: 'projects' });
  emitChange('files');
  return getFiles(fileIds);
}

export async function saveFileAnalysis(fileId: string, analysis: string): Promise<void> {
  await db().run('UPDATE files SET analysis = ? WHERE id = ?', [analysis, fileId]);
  emitChange('files');
}
