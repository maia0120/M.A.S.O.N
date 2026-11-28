import { db } from '../storage/database/db';

/** Indicadores do dashboard — sempre calculados a partir dos dados gravados. */
export interface WorkStats {
  ideasTotal: number;
  ideasNew: number;
  ideasApproved: number;
  projectsActive: number;
  tasksOpen: number;
  tasksOverdue: number;
  documents: number;
  docsByDepartment: Record<string, number>;
  filesInbox: number;
  clients: number;
}

async function count(sql: string, params: (string | number)[] = []): Promise<number> {
  const r = await db().all<{ n: number }>(sql, params);
  return Number(r[0]?.n ?? 0);
}

export async function workStats(): Promise<WorkStats> {
  const today = new Date().toISOString().slice(0, 10);
  const byDept = await db().all<{ department: string; n: number }>('SELECT department, COUNT(*) AS n FROM documents GROUP BY department');
  return {
    ideasTotal: await count("SELECT COUNT(*) AS n FROM ideas WHERE status != 'arquivada'"),
    ideasNew: await count("SELECT COUNT(*) AS n FROM ideas WHERE status IN ('nova','em_analise')"),
    ideasApproved: await count("SELECT COUNT(*) AS n FROM ideas WHERE status = 'aprovada'"),
    projectsActive: await count("SELECT COUNT(*) AS n FROM projects WHERE status = 'ativo'"),
    tasksOpen: await count("SELECT COUNT(*) AS n FROM tasks WHERE status != 'concluida'"),
    tasksOverdue: await count("SELECT COUNT(*) AS n FROM tasks WHERE status != 'concluida' AND due_date IS NOT NULL AND due_date < ?", [today]),
    documents: await count('SELECT COUNT(*) AS n FROM documents'),
    docsByDepartment: Object.fromEntries(byDept.map((r) => [r.department, Number(r.n)])),
    filesInbox: await count('SELECT COUNT(*) AS n FROM files WHERE project_id IS NULL'),
    clients: await count('SELECT COUNT(*) AS n FROM clients'),
  };
}
