import { db } from '../../storage/database/db';
import { now, uid, rankBy } from '../../core/util';
import { emitChange } from '../../core/events';
import { logActivity } from '../../memory/history/activityRepo';
import { IDEA_STATUSES, label, type Idea, type IdeaHistory, type IdeaStatus } from '../../core/types';

export interface NewIdea {
  title: string;
  original_description: string;
  organized_description?: string | null;
  ai_suggestions?: string | null;
  category?: string | null;
}

export async function createIdea(input: NewIdea, source: 'usuario' | 'ia' = 'usuario'): Promise<Idea> {
  const title = input.title.trim();
  const original = input.original_description.trim();
  if (!title) throw new Error('A ideia precisa de um título.');
  if (!original) throw new Error('A descrição original não pode ficar vazia.');
  const t = now();
  const idea: Idea = {
    id: uid(), title, original_description: original,
    organized_description: input.organized_description?.trim() || null,
    ai_suggestions: input.ai_suggestions?.trim() || null,
    category: input.category?.trim() || null,
    status: 'nova', project_id: null, created_at: t, updated_at: t,
  };
  await db().run(
    `INSERT INTO ideas (id,title,original_description,organized_description,ai_suggestions,category,status,project_id,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [idea.id, idea.title, idea.original_description, idea.organized_description, idea.ai_suggestions, idea.category, idea.status, null, t, t],
  );
  await addHistory(idea.id, 'criacao', null, idea.title, source);
  await logActivity({ type: 'idea_created', entity_type: 'idea', entity_id: idea.id, summary: `Ideia registrada: ${idea.title}`, section: 'ideas' });
  emitChange('ideas');
  return idea;
}

export async function getIdea(id: string): Promise<Idea | null> {
  const rows = await db().all<Idea>('SELECT * FROM ideas WHERE id = ?', [id]);
  return rows[0] ?? null;
}

export async function listIdeas(opts: { status?: IdeaStatus | 'todas'; includeArchived?: boolean } = {}): Promise<Idea[]> {
  if (opts.status && opts.status !== 'todas') {
    return db().all<Idea>('SELECT * FROM ideas WHERE status = ? ORDER BY updated_at DESC', [opts.status]);
  }
  if (opts.includeArchived) return db().all<Idea>('SELECT * FROM ideas ORDER BY updated_at DESC');
  return db().all<Idea>("SELECT * FROM ideas WHERE status != 'arquivada' ORDER BY updated_at DESC");
}

const ideaText = (i: Idea) =>
  [i.title, i.category, i.original_description, i.organized_description].filter(Boolean).join(' ');

/** Busca tolerante: sem acentos, por termos, sem exigir correspondência exata. */
export async function searchIdeas(query: string, includeArchived = true): Promise<Idea[]> {
  const all = await listIdeas({ includeArchived });
  if (!query.trim()) return all;
  return rankBy(all, query, ideaText);
}

type Editable = 'title' | 'organized_description' | 'ai_suggestions' | 'category' | 'status' | 'project_id' | 'original_description';

export async function updateIdea(id: string, changes: Partial<Pick<Idea, Editable>>, source: 'usuario' | 'ia'): Promise<Idea> {
  const idea = await getIdea(id);
  if (!idea) throw new Error('Ideia não encontrada.');
  if (changes.original_description !== undefined && source === 'ia') {
    throw new Error('A descrição original pertence ao usuário e não pode ser alterada pela IA.');
  }
  if (changes.status && !IDEA_STATUSES.includes(changes.status)) throw new Error(`Situação inválida: ${changes.status}`);
  if (changes.title !== undefined && !changes.title.trim()) throw new Error('O título não pode ficar vazio.');

  const sets: string[] = [];
  const params: (string | null)[] = [];
  for (const [field, value] of Object.entries(changes) as [Editable, string | null][]) {
    if (value === undefined || value === idea[field]) continue;
    sets.push(`${field} = ?`);
    params.push(value);
    await addHistory(id, field, idea[field] as string | null, value, source);
  }
  if (sets.length === 0) return idea;
  const t = now();
  await db().run(`UPDATE ideas SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...params, t, id]);
  const updated = (await getIdea(id))!;
  const what = changes.status ? `situação → ${label(changes.status)}` : 'conteúdo atualizado';
  await logActivity({ type: 'idea_updated', entity_type: 'idea', entity_id: id, summary: `${updated.title}: ${what}`, section: 'ideas' });
  emitChange('ideas');
  return updated;
}

export async function ideaHistory(id: string): Promise<IdeaHistory[]> {
  return db().all<IdeaHistory>('SELECT * FROM idea_history WHERE idea_id = ? ORDER BY created_at DESC', [id]);
}

async function addHistory(ideaId: string, field: string, oldV: string | null, newV: string | null, source: 'usuario' | 'ia') {
  await db().run(
    'INSERT INTO idea_history (id, idea_id, field, old_value, new_value, source, created_at) VALUES (?,?,?,?,?,?,?)',
    [uid(), ideaId, field, oldV, newV, source, now()],
  );
}

export async function deleteIdea(id: string): Promise<void> {
  await db().run('DELETE FROM idea_history WHERE idea_id = ?', [id]);
  await db().run('DELETE FROM ideas WHERE id = ?', [id]);
  emitChange('ideas');
}
