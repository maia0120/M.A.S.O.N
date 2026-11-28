import { nav, useNav } from '../navigation/navStore';
import { sectionById } from '../navigation/sections';
import { useData, Empty, PageHeader, AskMason } from '../components/ui';
import { listDocuments } from '../../projects/documents/documentsRepo';
import { listClients } from '../../projects/clients/clientsRepo';
import { DocumentView } from './DocumentsSection';
import { label } from '../../core/types';

/** Departamentos previstos na arquitetura, ainda sem tela dedicada. Já mostram os documentos reais salvos neles. */
export function PlannedPage() {
  const { section, recordId } = useNav();
  const s = sectionById(section)!;
  const { data: docs } = useData(() => listDocuments({ department: section }), ['documents'], [section]);
  const { data: clients } = useData(listClients, ['clients']);

  if (recordId) return <DocumentView id={recordId} backTo={{ section, label: s.title }} />;
  const isWork = s.env === 'work';

  return (
    <>
      <PageHeader title={s.title} subtitle={s.description} />
      <div className="notice info">Esta área está prevista e será construída nas próximas fases. {isWork && 'O MASON já consegue salvar documentos aqui pela conversa.'}</div>
      <section className="card stack">
        <h2>Funcionalidades previstas</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          {s.planned?.map((p) => <li key={p}>{p}</li>)}
        </ul>
      </section>
      {section === 'commercial' && (
        <section className="card stack">
          <h2>Clientes cadastrados</h2>
          {clients?.length === 0 && <Empty>Nenhum cliente. Você pode adicionar clientes dentro de um projeto.</Empty>}
          <div className="list">{clients?.map((c) => <div key={c.id} className="list-item" style={{ cursor: 'default' }}><span>{c.name}</span><span className="small muted">{c.contact ?? ''}</span></div>)}</div>
        </section>
      )}
      {isWork && (
        <section className="card stack">
          <div className="row between">
            <h2>Documentos</h2>
            <AskMason prompt={`Quero trabalhar em ${s.title}. Qual projeto ou ideia você sugere começarmos?`}>Conversar sobre esta área</AskMason>
          </div>
          {docs?.length === 0 && <Empty>Nenhum documento em {s.title}.</Empty>}
          <div className="list">
            {docs?.map((d) => (
              <button key={d.id} className="list-item" onClick={() => nav.open(section, d.id)}>
                <span>{d.title}</span><span className="badge">{label(d.kind)} · v{d.current_version}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
