import { useState } from 'react';
import { nav } from '../navigation/navStore';
import { useData, Empty, CopyButton, StatusBadge } from '../components/ui';
import { getDocument, documentVersions, saveDocument } from '../../projects/documents/documentsRepo';
import { getIdea } from '../../work/ideas/ideasRepo';
import { getProject } from '../../projects/projectsRepo';
import { formatDate } from '../../core/util';
import { label } from '../../core/types';

/** Visualização de um documento com versões, cópia e edição (nova versão). Reutilizada pelos departamentos. */
export function DocumentView({ id, backTo, onBack }: { id: string; backTo: { section: string; recordId?: string | null; label: string }; onBack?: () => void }) {
  const { data: doc } = useData(() => getDocument(id), ['documents'], [id]);
  const { data: versions } = useData(() => documentVersions(id), ['documents'], [id]);
  const { data: links } = useData(async () => {
    const d = await getDocument(id);
    return { idea: d?.idea_id ? await getIdea(d.idea_id) : null, project: d?.project_id ? await getProject(d.project_id) : null };
  }, ['documents', 'ideas', 'projects'], [id]);
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState('');

  if (doc === undefined) return null;
  const back = <button className="btn back" onClick={() => (onBack ? onBack() : nav.open(backTo.section, backTo.recordId ?? null))}>← {backTo.label}</button>;
  if (doc === null) return <>{back}<Empty>Documento não encontrado.</Empty></>;
  const v = versions?.find((x) => x.version === (selected ?? doc.current_version));

  const saveVersion = async () => {
    if (editing === null) return;
    await saveDocument({ document_id: doc.id, title: doc.title, kind: doc.kind, department: doc.department, content: editing, note: note || 'Edição manual', source: 'usuario' });
    setEditing(null);
    setNote('');
    setSelected(null);
  };

  return (
    <>
      {back}
      <div className="card stack">
        <div className="row between">
          <div className="stack" style={{ gap: 4 }}>
            <h1>{doc.title}</h1>
            <p className="small muted">{label(doc.kind)} · versão {doc.current_version} · atualizado {formatDate(doc.updated_at)}</p>
          </div>
          <div className="row">
            {links?.idea && <button className="btn" onClick={() => nav.open('ideas', links.idea!.id)}>Ideia: {links.idea.title}</button>}
            {links?.project && <button className="btn" onClick={() => nav.open('projects', links.project!.id)}>Projeto: {links.project.name}</button>}
          </div>
        </div>
        {versions && versions.length > 1 && (
          <div className="tabs">
            {versions.map((x) => (
              <button key={x.id} className={`tab ${(selected ?? doc.current_version) === x.version ? 'active' : ''}`} onClick={() => setSelected(x.version)}>
                v{x.version} · {x.source === 'ia' ? 'MASON' : 'você'}
              </button>
            ))}
          </div>
        )}
        {v?.note && <p className="small muted">Nota da versão: {v.note}</p>}
        {editing === null ? (
          <>
            <div className="block doc-view prewrap">{v?.content}</div>
            <div className="row">
              {v && <CopyButton text={v.content} label="Copiar para o Claude" />}
              {v && <button className="btn" onClick={() => setEditing(v.content)}>Editar (nova versão)</button>}
            </div>
          </>
        ) : (
          <div className="stack">
            <textarea className="textarea" style={{ minHeight: 320, fontFamily: 'monospace', fontSize: '0.82rem' }} value={editing} onChange={(e) => setEditing(e.target.value)} />
            <input className="input" placeholder="O que mudou? (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="row"><button className="btn primary" onClick={saveVersion}>Salvar nova versão</button><button className="btn" onClick={() => setEditing(null)}>Cancelar</button></div>
          </div>
        )}
      </div>
    </>
  );
}

export function DocBadge({ kind, version }: { kind: string; version: number }) {
  return <span className="row" style={{ gap: 4 }}><StatusBadge value={kind} /><span className="badge">v{version}</span></span>;
}
