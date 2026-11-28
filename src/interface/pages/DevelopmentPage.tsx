import { nav, useNav } from '../navigation/navStore';
import { useData, Empty, PageHeader, AskMason } from '../components/ui';
import { listDocuments } from '../../projects/documents/documentsRepo';
import { listIdeas } from '../../work/ideas/ideasRepo';
import { DocumentView } from './DocumentsSection';
import { formatDate } from '../../core/util';
import { label } from '../../core/types';

export function DevelopmentPage() {
  const { recordId } = useNav();
  if (recordId) return <DocumentView id={recordId} backTo={{ section: 'development', label: 'Desenvolvimento' }} />;
  return <DevelopmentHome />;
}

function DevelopmentHome() {
  const { data: docs } = useData(() => listDocuments({ department: 'development' }), ['documents']);
  const { data: ready } = useData(async () => (await listIdeas()).filter((i) => i.status === 'aprovada' || i.status === 'em_desenvolvimento'), ['ideas']);

  return (
    <>
      <PageHeader title="Desenvolvimento" subtitle="Planejamento técnico, requisitos e prompts prontos para o Claude." />
      <div className="notice info">
        Fluxo com o Claude (manual nesta versão): o MASON prepara o documento → você copia e envia ao Claude → importa os arquivos gerados no projeto → o MASON analisa e registra a versão.
      </div>
      <section className="card stack">
        <h2>Documentos técnicos e prompts</h2>
        {docs?.length === 0 && <Empty>Nenhum documento ainda. Peça: “organiza aquela ideia pra eu passar pro Claude”.</Empty>}
        <div className="list">
          {docs?.map((d) => (
            <button key={d.id} className="list-item" onClick={() => nav.open('development', d.id)}>
              <div><strong>{d.title}</strong><div className="small muted">{label(d.kind)} · v{d.current_version} · {formatDate(d.updated_at)}</div></div>
              <span className="badge primary">v{d.current_version}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="card stack">
        <h2>Ideias prontas para planejar</h2>
        {ready?.length === 0 && <Empty>Aprove uma ideia na Central de ideias para ela aparecer aqui.</Empty>}
        <div className="list">
          {ready?.map((i) => (
            <div key={i.id} className="list-item" style={{ cursor: 'default' }}>
              <div><strong>{i.title}</strong><div className="small muted">{label(i.status)}</div></div>
              <AskMason prompt={`Organiza a ideia "${i.title}" (id ${i.id}) num documento técnico completo para eu passar pro Claude.`}>Preparar para o Claude</AskMason>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
