import { useState } from 'react';
import { nav, useNav } from '../navigation/navStore';
import { useData, StatusBadge, Empty, PageHeader, Field, AskMason } from '../components/ui';
import { searchIdeas, listIdeas, getIdea, updateIdea, ideaHistory, deleteIdea, createIdea } from '../../work/ideas/ideasRepo';
import { createProject } from '../../projects/projectsRepo';
import { listDocuments } from '../../projects/documents/documentsRepo';
import { formatDate, truncate } from '../../core/util';
import { IDEA_STATUSES, label, type Idea, type IdeaStatus } from '../../core/types';

export function IdeasPage() {
  const { recordId } = useNav();
  return recordId ? <IdeaDetail id={recordId} /> : <IdeasList />;
}

function IdeasList() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<IdeaStatus | 'todas'>('todas');
  const [draft, setDraft] = useState('');
  const { data: ideas } = useData(
    async () => {
      const base = q.trim() ? await searchIdeas(q) : await listIdeas({ includeArchived: status === 'arquivada' });
      return status === 'todas' ? base.filter((i) => q.trim() || i.status !== 'arquivada') : base.filter((i) => i.status === status);
    },
    ['ideas'], [q, status],
  );

  const quickSave = async () => {
    const text = draft.trim();
    if (!text) return;
    const first = text.split('\n')[0];
    await createIdea({ title: truncate(first, 80), original_description: text });
    setDraft('');
  };

  return (
    <>
      <PageHeader title="Central de ideias" subtitle="Fale com o MASON para registrar e organizar ideias. Suas palavras originais ficam sempre preservadas." />
      <div className="card stack">
        <div className="row">
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Procurar por assunto (ex.: comparação de preços)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tabs">
          {(['todas', ...IDEA_STATUSES] as const).map((s) => (
            <button key={s} className={`tab ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>{s === 'todas' ? 'Todas' : label(s)}</button>
          ))}
        </div>
        <div className="list">
          {ideas?.length === 0 && <Empty>Nenhuma ideia aqui. Diga ao MASON algo como “tive uma ideia…”.</Empty>}
          {ideas?.map((i) => (
            <button key={i.id} className="list-item" onClick={() => nav.open('ideas', i.id)}>
              <div>
                <strong>{i.title}</strong>
                <div className="small muted">{i.category ? `${i.category} · ` : ''}atualizada {formatDate(i.updated_at)}</div>
              </div>
              <StatusBadge value={i.status} />
            </button>
          ))}
        </div>
      </div>
      <details className="card">
        <summary className="small muted" style={{ cursor: 'pointer' }}>Anotar rapidamente sem conversar</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          <textarea className="textarea" placeholder="Primeira linha vira o título" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={quickSave} disabled={!draft.trim()}>Salvar ideia</button>
        </div>
      </details>
    </>
  );
}

function IdeaDetail({ id }: { id: string }) {
  const { data: idea } = useData(() => getIdea(id), ['ideas'], [id]);
  const { data: history } = useData(() => ideaHistory(id), ['ideas'], [id]);
  const { data: docs } = useData(() => listDocuments({ idea_id: id }), ['documents'], [id]);
  const [editing, setEditing] = useState(false);

  if (idea === undefined) return null;
  if (idea === null) return <><button className="btn back" onClick={() => nav.open('ideas')}>← Ideias</button><Empty>Ideia não encontrada.</Empty></>;

  const set = (changes: Partial<Idea>) => updateIdea(idea.id, changes, 'usuario');
  const forward = async () => {
    const p = await createProject({ name: idea.title, description: idea.organized_description ?? idea.original_description, origin_idea_id: idea.id });
    nav.open('projects', p.id);
  };
  const remove = async () => {
    if (window.confirm(`Excluir definitivamente "${idea.title}"? Isso não pode ser desfeito.`)) {
      await deleteIdea(idea.id);
      nav.open('ideas');
    }
  };

  return (
    <>
      <button className="btn back" onClick={() => nav.open('ideas')}>← Ideias</button>
      <div className="card stack">
        <div className="row between">
          <div className="stack" style={{ gap: 4 }}>
            <h1>{idea.title}</h1>
            <p className="small muted">{idea.category ?? 'Sem categoria'} · criada {formatDate(idea.created_at)} · atualizada {formatDate(idea.updated_at)}</p>
          </div>
          <StatusBadge value={idea.status} />
        </div>

        {editing ? <IdeaEditor idea={idea} onDone={() => setEditing(false)} /> : (
          <>
            <div className="block user stack"><span className="small muted">O que você disse</span><p className="prewrap">{idea.original_description}</p></div>
            {idea.organized_description && <div className="block ai stack"><span className="small muted">Organização feita pelo MASON</span><p className="prewrap">{idea.organized_description}</p></div>}
            {idea.ai_suggestions && <div className="block ai stack"><span className="small muted">Sugestões do MASON (não decididas)</span><p className="prewrap">{idea.ai_suggestions}</p></div>}
          </>
        )}

        <div className="row">
          {!editing && <button className="btn" onClick={() => setEditing(true)}>Editar</button>}
          {idea.status !== 'aprovada' && idea.status !== 'arquivada' && <button className="btn" onClick={() => set({ status: 'aprovada' })}>Aprovar</button>}
          {!idea.project_id && idea.status !== 'arquivada' && <button className="btn primary" onClick={forward}>Encaminhar para desenvolvimento</button>}
          {idea.project_id && <button className="btn" onClick={() => nav.open('projects', idea.project_id)}>Abrir projeto</button>}
          <AskMason prompt={`Organiza a ideia "${idea.title}" (id ${idea.id}) num documento técnico para eu passar pro Claude.`}>Gerar prompt para o Claude</AskMason>
          <AskMason prompt={`O que você acha da ideia "${idea.title}" (id ${idea.id})? Separa benefícios, riscos e o que precisa ser validado.`}>Pedir análise</AskMason>
          {idea.status === 'arquivada'
            ? <button className="btn" onClick={() => set({ status: 'nova' })}>Restaurar</button>
            : <button className="btn" onClick={() => set({ status: 'arquivada' })}>Arquivar</button>}
          <button className="btn danger" onClick={remove}>Excluir</button>
        </div>
      </div>

      {docs && docs.length > 0 && (
        <div className="card stack">
          <h2>Documentos desta ideia</h2>
          <div className="list">
            {docs.map((d) => (
              <button key={d.id} className="list-item" onClick={() => nav.open('development', d.id)}>
                <span>{d.title}</span><span className="badge">{label(d.kind)} · v{d.current_version}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card stack">
        <h2>Histórico de alterações</h2>
        <div className="list">
          {history?.map((h) => (
            <div key={h.id} className="list-item" style={{ cursor: 'default' }}>
              <span className="small">{h.field === 'criacao' ? 'Criada' : `${h.field}${h.field === 'status' ? `: ${label(h.old_value)} → ${label(h.new_value)}` : ' alterado'}`}</span>
              <span className="small muted">{h.source === 'ia' ? 'MASON' : 'Você'} · {formatDate(h.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function IdeaEditor({ idea, onDone }: { idea: Idea; onDone: () => void }) {
  const [title, setTitle] = useState(idea.title);
  const [category, setCategory] = useState(idea.category ?? '');
  const [original, setOriginal] = useState(idea.original_description);
  const [organized, setOrganized] = useState(idea.organized_description ?? '');
  const [suggestions, setSuggestions] = useState(idea.ai_suggestions ?? '');
  const save = async () => {
    await updateIdea(idea.id, { title, category: category || null, original_description: original, organized_description: organized || null, ai_suggestions: suggestions || null }, 'usuario');
    onDone();
  };
  return (
    <div className="stack">
      <Field label="Título"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
      <Field label="Categoria"><input className="input" value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
      <Field label="O que você disse (descrição original)"><textarea className="textarea" value={original} onChange={(e) => setOriginal(e.target.value)} /></Field>
      <Field label="Descrição organizada"><textarea className="textarea" value={organized} onChange={(e) => setOrganized(e.target.value)} /></Field>
      <Field label="Sugestões da IA"><textarea className="textarea" value={suggestions} onChange={(e) => setSuggestions(e.target.value)} /></Field>
      <div className="row"><button className="btn primary" onClick={save}>Salvar</button><button className="btn" onClick={onDone}>Cancelar</button></div>
    </div>
  );
}
