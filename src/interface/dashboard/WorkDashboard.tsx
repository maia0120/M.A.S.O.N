import { nav } from '../navigation/navStore';
import { sectionById } from '../navigation/sections';
import { useData, StatusBadge, Empty, PageHeader } from '../components/ui';
import { workStats, type WorkStats } from '../../work/stats';
import { recentActivities } from '../../memory/history/activityRepo';
import { listProjects } from '../../projects/projectsRepo';
import { listTasks } from '../../projects/tasks/tasksRepo';
import { formatDate } from '../../core/util';
import { label } from '../../core/types';

const DEPTS: { id: string; icon: string; metric: (s: WorkStats) => string }[] = [
  { id: 'ideas', icon: 'ID', metric: (s) => `${s.ideasTotal} ideia(s) · ${s.ideasNew} para analisar` },
  { id: 'development', icon: 'DV', metric: (s) => `${s.docsByDepartment.development ?? 0} documento(s) técnico(s)` },
  { id: 'design', icon: 'DS', metric: (s) => `${s.docsByDepartment.design ?? 0} documento(s)` },
  { id: 'marketing', icon: 'MK', metric: (s) => `${s.docsByDepartment.marketing ?? 0} documento(s)` },
  { id: 'commercial', icon: 'CM', metric: (s) => `${s.clients} cliente(s)` },
  { id: 'projects', icon: 'PJ', metric: (s) => `${s.projectsActive} ativo(s) · ${s.tasksOpen} tarefa(s) aberta(s)` },
];

export function WorkDashboard() {
  const topics = ['ideas', 'projects', 'tasks', 'documents', 'files', 'clients', 'activities'];
  const { data: stats } = useData(workStats, topics);
  const { data: activities } = useData(() => recentActivities(8), topics);
  const { data: projects } = useData(() => listProjects(), topics);
  const { data: tasks } = useData(() => listTasks({ status: 'abertas' }), topics);

  return (
    <>
      <PageHeader title="Gestão de trabalho" subtitle="Ideias, planejamento e acompanhamento dos projetos" />

      <div className="grid cols-4">
        <Stat value={stats?.ideasTotal} label="Ideias registradas" />
        <Stat value={stats?.projectsActive} label="Projetos ativos" />
        <Stat value={stats?.tasksOpen} label="Tarefas abertas" warn={stats?.tasksOverdue ? `${stats.tasksOverdue} atrasada(s)` : undefined} />
        <Stat value={stats?.documents} label="Documentos" />
      </div>

      <div className="grid cols-3">
        {DEPTS.map((d) => {
          const s = sectionById(d.id)!;
          return (
            <button key={d.id} className="card clickable dept-card" onClick={() => nav.open(d.id)}>
              <h3><span className="dept-icon">{d.icon}</span>{s.title}</h3>
              <p className="muted small" style={{ marginTop: 6 }}>{s.description}</p>
              <div className="dept-metric">{stats ? d.metric(stats) : '…'}{!s.implemented && ' · em construção'}</div>
            </button>
          );
        })}
      </div>

      <div className="grid cols-2">
        <section className="card stack">
          <div className="row between"><h2>Projetos em andamento</h2><button className="btn ghost small" onClick={() => nav.open('projects')}>Ver todos</button></div>
          {projects && projects.filter((p) => p.status === 'ativo').length === 0 && <Empty>Nenhum projeto ativo. Peça ao MASON para transformar uma ideia em projeto.</Empty>}
          <div className="list">
            {projects?.filter((p) => p.status === 'ativo').slice(0, 6).map((p) => {
              const open = tasks?.filter((t) => t.project_id === p.id).length ?? 0;
              return (
                <button key={p.id} className="list-item" onClick={() => nav.open('projects', p.id)}>
                  <div><strong>{p.name}</strong><div className="small muted">{label(p.stage)} · {open} tarefa(s) aberta(s)</div></div>
                  <StatusBadge value={p.stage} />
                </button>
              );
            })}
          </div>
        </section>
        <section className="card stack">
          <h2>Atividades recentes</h2>
          {activities && activities.length === 0 && <Empty>Ainda não há atividades. Comece conversando com o MASON.</Empty>}
          <div className="list">
            {activities?.map((a) => (
              <div key={a.id} className="list-item" style={{ cursor: 'default' }}>
                <span>{a.summary}</span>
                <span className="small muted">{formatDate(a.created_at)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({ value, label: l, warn }: { value: number | undefined; label: string; warn?: string }) {
  return (
    <div className="card">
      <div className="stat-value">{value ?? '…'}</div>
      <div className="stat-label">{l}</div>
      {warn && <span className="badge danger" style={{ marginTop: 6 }}>{warn}</span>}
    </div>
  );
}
