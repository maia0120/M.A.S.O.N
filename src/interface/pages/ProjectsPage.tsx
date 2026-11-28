import { useRef, useState } from 'react';
import { nav, useNav } from '../navigation/navStore';
import { useData, Empty, PageHeader, StatusBadge, AskMason, Field } from '../components/ui';
import { listProjects, getProject, createProject, updateProject, projectHistory } from '../../projects/projectsRepo';
import { listTasks, createTask, setTaskStatus } from '../../projects/tasks/tasksRepo';
import { listDocuments } from '../../projects/documents/documentsRepo';
import { listFiles, importFiles, assignFiles, isTextFile, type ImportInput } from '../../projects/versions/filesRepo';
import { listClients, createClient } from '../../projects/clients/clientsRepo';
import { getIdea } from '../../work/ideas/ideasRepo';
import { getFileStore } from '../../storage/files/fileStore';
import { DocumentView } from './DocumentsSection';
import { formatDate } from '../../core/util';
import { PROJECT_STAGES, PROJECT_STATUSES, label, type ProjectStatus } from '../../core/types';

export function ProjectsPage() {
  const { recordId } = useNav();
  const [docId, setDocId] = useState<string | null>(null);
  if (recordId && docId) return <DocumentView id={docId} backTo={{ section: 'projects', recordId, label: 'Projeto' }} onBack={() => setDocId(null)} />;
  return recordId ? <ProjectDetail id={recordId} onOpenDoc={setDocId} /> : <ProjectsList />;
}

function ProjectsList() {
  const [showArchived, setShowArchived] = useState(false);
  const [name, setName] = useState('');
  const { data: projects } = useData(() => listProjects(showArchived), ['projects'], [showArchived]);
  const { data: tasks } = useData(() => listTasks({ status: 'abertas' }), ['tasks']);
  const add = async () => {
    if (!name.trim()) return;
    const p = await createProject({ name });
    setName('');
    nav.open('projects', p.id);
  };
  return (
    <>
      <PageHeader title="Projetos e clientes" subtitle="Acompanhamento de cada projeto: etapas, tarefas, documentos, arquivos e entregas." />
      <div className="card stack">
        <div className="row">
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Nome do novo projeto" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className="btn primary" onClick={add} disabled={!name.trim()}>Criar projeto</button>
        </div>
        <label className="small muted row" style={{ gap: 6 }}><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Mostrar arquivados</label>
        <div className="list">
          {projects?.length === 0 && <Empty>Nenhum projeto ainda.</Empty>}
          {projects?.map((p) => (
            <button key={p.id} className="list-item" onClick={() => nav.open('projects', p.id)}>
              <div><strong>{p.name}</strong><div className="small muted">{label(p.stage)} · {tasks?.filter((t) => t.project_id === p.id).length ?? 0} tarefa(s) aberta(s) · {formatDate(p.updated_at)}</div></div>
              <StatusBadge value={p.status} />
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

async function readForImport(files: FileList): Promise<ImportInput[]> {
  const store = await getFileStore();
  const out: ImportInput[] = [];
  for (const f of Array.from(files)) {
    const text = isTextFile(f.name, f.type || null) ? await f.text() : null;
    const ref = await store.save(f.name, await f.arrayBuffer()).catch(() => null);
    out.push({ name: f.name, mime: f.type || null, size: f.size, text, storage_ref: ref });
  }
  return out;
}

function ProjectDetail({ id, onOpenDoc }: { id: string; onOpenDoc: (id: string) => void }) {
  const topics = ['projects', 'tasks', 'documents', 'files', 'clients'];
  const { data: project } = useData(() => getProject(id), topics, [id]);
  const { data: tasks } = useData(() => listTasks({ project_id: id }), topics, [id]);
  const { data: docs } = useData(() => listDocuments({ project_id: id }), topics, [id]);
  const { data: files } = useData(() => listFiles({ project_id: id }), topics, [id]);
  const { data: inbox } = useData(() => listFiles({ inbox: true }), topics, [id]);
  const { data: history } = useData(() => projectHistory(id), topics, [id]);
  const { data: clients } = useData(listClients, topics);
  const { data: idea } = useData(async () => { const p = await getProject(id); return p?.origin_idea_id ? getIdea(p.origin_idea_id) : null; }, topics, [id]);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [newClient, setNewClient] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (project === undefined) return null;
  if (project === null) return <><button className="btn back" onClick={() => nav.open('projects')}>← Projetos</button><Empty>Projeto não encontrado.</Empty></>;
  const links = JSON.parse(project.external_links) as { label: string; url: string }[];
  const stageIdx = PROJECT_STAGES.indexOf(project.stage);

  const onImport = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      const items = await readForImport(list);
      await importFiles(items, null); // entram na caixa de entrada; o MASON (ou você) associa e registra a versão
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <>
      <button className="btn back" onClick={() => nav.open('projects')}>← Projetos</button>
      <div className="card stack">
        <div className="row between">
          <div className="stack" style={{ gap: 4 }}>
            <h1>{project.name}</h1>
            <p className="small muted">Criado {formatDate(project.created_at)}{idea ? ' · origem: ' : ''}{idea && <a href="#" onClick={(e) => { e.preventDefault(); nav.open('ideas', idea.id); }}>{idea.title}</a>}</p>
          </div>
          <select className="select" style={{ width: 'auto' }} value={project.status} onChange={(e) => updateProject(project.id, { status: e.target.value as ProjectStatus })}>
            {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
        </div>
        {project.description && <p className="prewrap">{project.description}</p>}
        <div className="pipeline">
          {PROJECT_STAGES.map((s, i) => (
            <span key={s} className={i < stageIdx ? 'done' : i === stageIdx ? 'current' : ''} style={{ cursor: 'pointer' }} onClick={() => updateProject(project.id, { stage: s })}>{label(s)}</span>
          ))}
        </div>
        <div className="row">
          <Field label="Cliente">
            <select className="select" value={project.client_id ?? ''} onChange={(e) => updateProject(project.id, { client_id: e.target.value || null })}>
              <option value="">Sem cliente</option>
              {clients?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Novo cliente">
            <div className="row"><input className="input" style={{ width: 180 }} value={newClient} onChange={(e) => setNewClient(e.target.value)} />
              <button className="btn" disabled={!newClient.trim()} onClick={async () => { const c = await createClient({ name: newClient }); setNewClient(''); await updateProject(project.id, { client_id: c.id }); }}>Adicionar</button></div>
          </Field>
        </div>
        {links.length > 0 && <div className="row">{links.map((l, i) => <a key={i} className="badge primary" href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}</div>}
        <div className="row">
          <AskMason prompt={`Como está o projeto "${project.name}" (id ${project.id})? Resume o andamento e sugere as próximas etapas.`}>Resumo e próximas etapas</AskMason>
        </div>
      </div>

      <div className="grid cols-2">
        <section className="card stack">
          <h2>Tarefas</h2>
          <div className="row">
            <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Nova tarefa" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
            <input className="input" style={{ width: 150 }} type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
            <button className="btn primary" disabled={!taskTitle.trim()} onClick={async () => { await createTask({ title: taskTitle, project_id: project.id, due_date: taskDue || null }); setTaskTitle(''); setTaskDue(''); }}>Adicionar</button>
          </div>
          <div className="list">
            {tasks?.length === 0 && <Empty>Sem tarefas.</Empty>}
            {tasks?.map((t) => (
              <label key={t.id} className="list-item">
                <span className="row" style={{ gap: 8 }}>
                  <input type="checkbox" checked={t.status === 'concluida'} onChange={(e) => setTaskStatus(t.id, e.target.checked ? 'concluida' : 'pendente')} />
                  <span style={{ textDecoration: t.status === 'concluida' ? 'line-through' : undefined }}>{t.title}</span>
                </span>
                {t.due_date && <span className={`badge ${t.status !== 'concluida' && t.due_date < new Date().toISOString().slice(0, 10) ? 'danger' : ''}`}>{t.due_date.split('-').reverse().join('/')}</span>}
              </label>
            ))}
          </div>
        </section>

        <section className="card stack">
          <h2>Documentos</h2>
          {docs?.length === 0 && <Empty>Nenhum documento vinculado.</Empty>}
          <div className="list">
            {docs?.map((d) => (
              <button key={d.id} className="list-item" onClick={() => onOpenDoc(d.id)}>
                <span>{d.title}</span><span className="badge">{label(d.kind)} · v{d.current_version}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="card stack">
        <div className="row between">
          <h2>Arquivos e versões</h2>
          <div className="row">
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => onImport(e.target.files)} />
            <button className="btn primary" disabled={busy} onClick={() => fileInput.current?.click()}>{busy ? 'Importando…' : 'Importar arquivos'}</button>
          </div>
        </div>
        {inbox && inbox.length > 0 && (
          <div className="notice stack">
            <span>{inbox.length} arquivo(s) importado(s) aguardando: {inbox.map((f) => f.name).join(', ')}</span>
            <div className="row">
              <AskMason prompt={`Associa os arquivos que eu importei ao projeto "${project.name}" (id ${project.id}), registra a versão e analisa o que foi entregue.`}>Pedir ao MASON para analisar</AskMason>
              <button className="btn" onClick={() => assignFiles(inbox.map((f) => f.id), project.id, null)}>Só associar a este projeto</button>
            </div>
          </div>
        )}
        <div className="list">
          {files?.length === 0 && <Empty>Nenhum arquivo associado.</Empty>}
          {files?.map((f) => (
            <div key={f.id} className="list-item" style={{ cursor: 'default' }}>
              <div><strong>{f.name}</strong><div className="small muted">{(f.size / 1024).toFixed(1)} KB · {formatDate(f.imported_at)}{f.text_content ? '' : ' · binário (não analisado)'}</div></div>
              {f.version_label && <span className="badge primary">{f.version_label}</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Histórico</h2>
        <div className="list">
          {history?.map((h) => (
            <div key={h.id} className="list-item" style={{ cursor: 'default' }}>
              <span className="small">{h.event}{h.details ? ` — ${h.details}` : ''}</span>
              <span className="small muted">{formatDate(h.created_at)}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
