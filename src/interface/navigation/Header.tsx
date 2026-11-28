import { useEffect, useState } from 'react';
import { nav, useNav } from './navStore';
import { sectionById, ENVIRONMENTS } from './sections';
import { searchIdeas } from '../../work/ideas/ideasRepo';
import { searchProjects } from '../../projects/projectsRepo';
import { listDocuments } from '../../projects/documents/documentsRepo';
import { rankBy } from '../../core/util';
import { useData } from '../components/ui';
import { workStats } from '../../work/stats';

interface Hit { kind: string; title: string; open: () => void }

export function Header({ onMenu }: { onMenu: () => void }) {
  const { section } = useNav();
  const s = sectionById(section);
  const env = ENVIRONMENTS.find((e) => e.id === s?.env);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [showNotif, setShowNotif] = useState(false);
  const { data: stats } = useData(workStats, ['ideas', 'projects', 'tasks', 'files', 'documents']);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      const [ideas, projects, docs] = await Promise.all([searchIdeas(q), searchProjects(q), listDocuments()]);
      setHits([
        ...ideas.slice(0, 5).map((i) => ({ kind: 'Ideia', title: i.title, open: () => nav.open('ideas', i.id) })),
        ...projects.slice(0, 5).map((p) => ({ kind: 'Projeto', title: p.name, open: () => nav.open('projects', p.id) })),
        ...rankBy(docs, q, (d) => d.title).slice(0, 5).map((d) => ({ kind: 'Documento', title: d.title, open: () => nav.open(d.department === 'projects' ? 'projects' : 'development', d.department === 'projects' ? d.project_id : d.id) })),
      ]);
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  const notifications: string[] = [];
  if (stats) {
    if (stats.tasksOverdue) notifications.push(`${stats.tasksOverdue} tarefa(s) atrasada(s)`);
    if (stats.filesInbox) notifications.push(`${stats.filesInbox} arquivo(s) importado(s) aguardando projeto`);
    if (stats.ideasNew) notifications.push(`${stats.ideasNew} ideia(s) aguardando análise`);
  }

  return (
    <header className="header">
      <button className="icon-btn menu-btn" aria-label="Abrir menu" onClick={onMenu}>☰</button>
      <div className="env">
        {s?.title ?? 'MASON'}
        <small>{env?.title ?? 'Sistema'}</small>
      </div>
      <div className="search">
        <input placeholder="Buscar ideias, projetos, documentos…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setTimeout(() => setHits([]), 150)} />
        {hits.length > 0 && (
          <div className="search-results">
            {hits.map((h, i) => (
              <button key={i} onMouseDown={() => { h.open(); setQ(''); setHits([]); }}>
                <span className="badge">{h.kind}</span> {h.title}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <button className="icon-btn" aria-label="Notificações" onClick={() => setShowNotif((v) => !v)}>
          {notifications.length ? <span className="badge danger">{notifications.length}</span> : '🔔'}
        </button>
        {showNotif && (
          <div className="search-results" style={{ right: 0, left: 'auto', width: 280 }}>
            {notifications.length ? notifications.map((n) => <button key={n} onMouseDown={() => setShowNotif(false)}>{n}</button>) : <div className="empty small">Nada pendente.</div>}
          </div>
        )}
      </div>
      <button className="btn primary" onClick={() => nav.setChat(true)}>MASON</button>
    </header>
  );
}
