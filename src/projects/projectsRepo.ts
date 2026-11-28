import { db } from '../storage/database/db';
import { now, uid, rankBy } from '../core/util';
import { emitChange } from '../core/events';
import { logActivity } from '../memory/history/activityRepo';
import { PROJECT_STAGES, PROJECT_STATUSES, label, type Project } from '../core/types';
import { getIdea, updateIdea } from '../work/ideas/ideasRepo';

export interface NewProject {
  name: string;
  description?: string | null;
  origin_idea_id?: string | null;
  client_id?: string | null;
}

export async function createProject(input: NewProject): Promise<Project> {
  const name = input.name.trim();
  if (!name) throw new Error('O projeto precisa de um nome.');
  if (input.origin_idea_id && !(await getIdea(input.origin_idea_id))) throw new Error('Ideia de origem não encontrada.');
  const t = now();
  const p: Project = {
    id: uid(), name, description: input.description?.trim() || null,
    origin_idea_id: input.origin_idea_id ?? null, client_id: input.client_id ?? null,
    stage: 'planejamento', status: 'ativo', external_links: '[]', created_at: t, updated_at: t,
  };
  await db().run(
    `INSERT INTO projects (id,name,description,origin_idea_id,client_id,stage,status,external_links,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [p.id, p.name, p.description, p.origin_idea_id, p.client_id, p.stage, p.status, p.external_links, t, t],
  );
  if (p.origin_idea_id) {
    await updateIdea(p.origin_idea_id, { project_id: p.id, status: 'em_desenvolvimento' }, 'usuario');
  }
  await addProjectHistory(p.id, 'Projeto criado', p.origin_idea_id ? 'A partir de uma ideia da Central' : null);
  await logActivity({ type: 'project_created', entity_type: 'project', entity_id: p.id, summary: `Projeto criado: ${p.name}`, section: 'projects' });
  emitChange('projects');
  return p;
}

export async function getProject(id: string): Promise<Project | null> {
  return (await db().all<Project>('SELECT * FROM projects WHERE id = ?', [id]))[0] ?? null;
}

export async function listProjects(includeArchived = false): Promise<Project[]> {
  return includeArchived
    ? db().all<Project>('SELECT * FROM projects ORDER BY updated_at DESC')
    : db().all<Project>("SELECT * FROM projects WHERE status != 'arquivado' ORDER BY updated_at DESC");
}

export async function searchProjects(query: string): Promise<Project[]> {
  const all = await listProjects(true);
  if (!query.trim()) return all;
  return rankBy(all, query, (p) => `${p.name} ${p.description ?? ''}`);
}

type Editable = 'name' | 'description' | 'stage' | 'status' | 'client_id' | 'external_links';

export async function updateProject(id: string, changes: Partial<Pick<Project, Editable>>): Promise<Project> {
  const p = await getProject(id);
  if (!p) throw new Error('Projeto não encontrado.');
  if (changes.stage && !PROJECT_STAGES.includes(changes.stage)) throw new Error(`Etapa inválida: ${changes.stage}`);
  if (changes.status && !PROJECT_STATUSES.includes(changes.status)) throw new Error(`Situação inválida: ${changes.status}`);
  if (changes.name !== undefined && !changes.name.trim()) throw new Error('O nome não pode ficar vazio.');
  if (changes.external_links !== undefined) {
    const parsed = JSON.parse(changes.external_links);
    if (!Array.isArray(parsed)) throw new Error('Links externos inválidos.');
  }
  const sets: string[] = [];
  const params: (string | null)[] = [];
  const described: string[] = [];
  for (const [field, value] of Object.entries(changes) as [Editable, string | null][]) {
    if (value === undefined || value === p[field]) continue;
    sets.push(`${field} = ?`);
    params.push(value);
    described.push(field === 'stage' ? `etapa → ${label(value)}` : field === 'status' ? `situação → ${label(value)}` : `${field} atualizado`);
  }
  if (sets.length === 0) return p;
  await db().run(`UPDATE projects SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`, [...params, now(), id]);
  await addProjectHistory(id, 'Projeto atualizado', described.join('; '));
  await logActivity({ type: 'project_updated', entity_type: 'project', entity_id: id, summary: `${p.name}: ${described.join('; ')}`, section: 'projects' });
  emitChange('projects');
  return (await getProject(id))!;
}

export async function addProjectHistory(projectId: string, event: string, details: string | null) {
  await db().run('INSERT INTO project_history (id, project_id, event, details, created_at) VALUES (?,?,?,?,?)',
    [uid(), projectId, event, details, now()]);
}

export async function projectHistory(projectId: string) {
  return db().all<{ id: string; event: string; details: string | null; created_at: string }>(
    'SELECT * FROM project_history WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
}
