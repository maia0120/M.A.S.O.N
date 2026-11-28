import { db } from '../../storage/database/db';
import { now, uid } from '../../core/util';
import { emitChange } from '../../core/events';
import { logActivity } from '../../memory/history/activityRepo';
import { TASK_STATUSES, type Task, type TaskStatus } from '../../core/types';
import { getProject } from '../projectsRepo';

export async function createTask(input: { title: string; description?: string | null; project_id?: string | null; due_date?: string | null }): Promise<Task> {
  const title = input.title.trim();
  if (!title) throw new Error('A tarefa precisa de um título.');
  if (input.project_id && !(await getProject(input.project_id))) throw new Error('Projeto não encontrado.');
  if (input.due_date && Number.isNaN(Date.parse(input.due_date))) throw new Error('Data inválida. Use AAAA-MM-DD.');
  const t = now();
  const task: Task = {
    id: uid(), title, description: input.description?.trim() || null, project_id: input.project_id ?? null,
    status: 'pendente', due_date: input.due_date ?? null, created_at: t, updated_at: t,
  };
  await db().run('INSERT INTO tasks (id,title,description,project_id,status,due_date,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)',
    [task.id, task.title, task.description, task.project_id, task.status, task.due_date, t, t]);
  await logActivity({ type: 'task_created', entity_type: 'task', entity_id: task.id, summary: `Tarefa criada: ${title}`, section: 'projects' });
  emitChange('tasks');
  return task;
}

export async function listTasks(opts: { project_id?: string | null; status?: TaskStatus | 'abertas' } = {}): Promise<Task[]> {
  const where: string[] = [];
  const params: string[] = [];
  if (opts.project_id) { where.push('project_id = ?'); params.push(opts.project_id); }
  if (opts.status === 'abertas') where.push("status != 'concluida'");
  else if (opts.status) { where.push('status = ?'); params.push(opts.status); }
  const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (due_date IS NULL), due_date, created_at DESC`;
  return db().all<Task>(sql, params);
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  if (!TASK_STATUSES.includes(status)) throw new Error(`Situação inválida: ${status}`);
  const rows = await db().all<Task>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!rows[0]) throw new Error('Tarefa não encontrada.');
  await db().run('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
  if (status === 'concluida') {
    await logActivity({ type: 'task_done', entity_type: 'task', entity_id: id, summary: `Tarefa concluída: ${rows[0].title}`, section: 'projects' });
  }
  emitChange('tasks');
  return { ...rows[0], status };
}
