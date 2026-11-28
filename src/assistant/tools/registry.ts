import { type ToolDef, str } from './toolkit';
import { nav } from '../../interface/navigation/navStore';
import { SECTIONS, sectionById } from '../../interface/navigation/sections';
import { createIdea, getIdea, searchIdeas, listIdeas, updateIdea, deleteIdea } from '../../work/ideas/ideasRepo';
import { createProject, getProject, searchProjects, listProjects, updateProject } from '../../projects/projectsRepo';
import { createTask, listTasks, setTaskStatus } from '../../projects/tasks/tasksRepo';
import { saveDocument, getDocument, latestVersion, listDocuments } from '../../projects/documents/documentsRepo';
import { assignFiles, listFiles } from '../../projects/versions/filesRepo';
import { remember, searchMemories } from '../../memory/repository/memoryRepo';
import { saveExpression, setPref, listExpressions } from '../../memory/preferences/profileRepo';
import { rankBy, truncate } from '../../core/util';
import {
  IDEA_STATUSES, PROJECT_STAGES, PROJECT_STATUSES, TASK_STATUSES, DOCUMENT_KINDS, MEMORY_KINDS, MEMORY_SOURCES,
  type Idea, type Project, type TaskStatus, type DocumentKind, type MemoryKind, type MemorySource, type IdeaStatus,
  type ProjectStage, type ProjectStatus,
} from '../../core/types';

const SECTION_IDS = SECTIONS.map((s) => s.id);
const DEPARTMENTS = ['ideas', 'development', 'design', 'marketing', 'commercial', 'projects'] as const;

const ideaBrief = (i: Idea) => ({ id: i.id, title: i.title, status: i.status, category: i.category, project_id: i.project_id, updated_at: i.updated_at });
const projectBrief = (p: Project) => ({ id: p.id, name: p.name, stage: p.stage, status: p.status, origin_idea_id: p.origin_idea_id });

const fail = (error: string) => ({ ok: false, error });

export const TOOLS: ToolDef[] = [
  {
    name: 'open_section',
    description: 'Abre uma seção do aplicativo para o usuário. Use quando ele pedir para abrir, ir ou mostrar alguma área. Pode abrir um registro específico (ideia ou projeto) com record_id.',
    params: {
      section: { type: 'string', description: 'Seção a abrir', required: true, enum: SECTION_IDS },
      record_id: { type: 'string', description: 'ID da ideia ou do projeto a exibir (opcional)' },
    },
    async run(a) {
      const s = sectionById(a.section as string)!;
      const recordId = str(a.record_id) ?? null;
      if (recordId) {
        const exists = s.id === 'ideas' ? await getIdea(recordId) : s.id === 'projects' ? await getProject(recordId) : true;
        if (!exists) return fail('Registro não encontrado para abrir.');
      }
      nav.open(s.id, recordId);
      return { ok: true, data: { opened: s.id, implemented: s.implemented }, summary: `Abriu ${s.title}` };
    },
  },
  {
    name: 'create_idea',
    description: 'Registra uma nova ideia na Central de ideias. original_description deve conter as palavras do usuário (pode limpar vícios de fala, sem acrescentar nada). organized_description é a sua organização. ai_suggestions contém apenas o que VOCÊ sugere e o usuário não disse.',
    params: {
      title: { type: 'string', description: 'Título curto e claro', required: true, maxLength: 120 },
      original_description: { type: 'string', description: 'O que o usuário disse, sem invenções', required: true },
      organized_description: { type: 'string', description: 'Descrição organizada com base apenas no que foi dito' },
      ai_suggestions: { type: 'string', description: 'Sugestões suas, separadas do que o usuário disse (opcional)' },
      category: { type: 'string', description: 'Categoria (ex.: site, aplicativo, serviço, conteúdo, negócio)' },
    },
    async run(a) {
      const idea = await createIdea({
        title: a.title as string, original_description: a.original_description as string,
        organized_description: str(a.organized_description), ai_suggestions: str(a.ai_suggestions), category: str(a.category),
      }, 'ia');
      return { ok: true, data: ideaBrief(idea), summary: `Ideia registrada: ${idea.title}` };
    },
  },
  {
    name: 'find_idea',
    description: 'Procura ideias registradas por assunto (busca tolerante, sem precisar do título exato). Sem query, lista as mais recentes. Retorna também o conteúdo completo quando houver um único resultado ou quando idea_id for informado.',
    params: {
      query: { type: 'string', description: 'Assunto ou palavras-chave' },
      idea_id: { type: 'string', description: 'ID exato, se já souber' },
      status: { type: 'string', description: 'Filtrar por situação', enum: IDEA_STATUSES },
    },
    async run(a) {
      if (a.idea_id) {
        const i = await getIdea(a.idea_id as string);
        return i ? { ok: true, data: { idea: i } } : fail('Ideia não encontrada.');
      }
      let list = str(a.query) ? await searchIdeas(a.query as string) : await listIdeas({ includeArchived: false });
      if (a.status) list = list.filter((i) => i.status === a.status);
      list = list.slice(0, 10);
      if (list.length === 1) return { ok: true, data: { count: 1, idea: list[0] } };
      return { ok: true, data: { count: list.length, ideas: list.map(ideaBrief) } };
    },
  },
  {
    name: 'update_idea',
    description: 'Atualiza uma ideia existente. A descrição original do usuário NÃO pode ser alterada por esta ferramenta. Use status "aprovada" para aprovar e "em_analise" quando estiver sendo avaliada.',
    params: {
      idea_id: { type: 'string', description: 'ID da ideia', required: true },
      title: { type: 'string', description: 'Novo título', maxLength: 120 },
      organized_description: { type: 'string', description: 'Nova descrição organizada' },
      ai_suggestions: { type: 'string', description: 'Novas sugestões da IA' },
      category: { type: 'string', description: 'Nova categoria' },
      status: { type: 'string', description: 'Nova situação', enum: IDEA_STATUSES.filter((s) => s !== 'arquivada') },
      append_user_info: { type: 'string', description: 'Informação nova dita pelo usuário, que será acrescentada à descrição original (sem apagar o que já existe)' },
      append_kind: { type: 'string', description: 'Tipo do acréscimo', enum: ['complemento', 'correcao'] },
    },
    async run(a) {
      const idea = await getIdea(a.idea_id as string);
      if (!idea) return fail('Ideia não encontrada.');
      const changes: Partial<Idea> = {};
      if (a.title) changes.title = a.title as string;
      if (a.organized_description) changes.organized_description = a.organized_description as string;
      if (a.ai_suggestions) changes.ai_suggestions = a.ai_suggestions as string;
      if (a.category) changes.category = a.category as string;
      if (a.status) changes.status = a.status as IdeaStatus;
      let updated = await updateIdea(idea.id, changes, 'ia');
      if (a.append_user_info) {
        // O acréscimo vem do usuário; por isso é registrado com origem "usuario".
        const tag = a.append_kind === 'correcao' ? 'Correção' : 'Complemento';
        updated = await updateIdea(idea.id, { original_description: `${idea.original_description}\n\n[${tag}] ${a.append_user_info}` }, 'usuario');
      }
      return { ok: true, data: ideaBrief(updated), summary: `Ideia atualizada: ${updated.title}` };
    },
  },
  {
    name: 'archive_idea',
    description: 'Arquiva uma ideia (pode ser restaurada depois).',
    params: { idea_id: { type: 'string', description: 'ID da ideia', required: true } },
    async run(a) {
      const idea = await getIdea(a.idea_id as string);
      if (!idea) return fail('Ideia não encontrada.');
      await updateIdea(idea.id, { status: 'arquivada' }, 'ia');
      return { ok: true, data: { id: idea.id, status: 'arquivada' }, summary: `Ideia arquivada: ${idea.title}` };
    },
  },
  {
    name: 'delete_idea',
    description: 'Exclui definitivamente uma ideia. Ação irreversível: o aplicativo pedirá confirmação ao usuário antes de executar.',
    params: { idea_id: { type: 'string', description: 'ID da ideia', required: true } },
    async confirm(a) {
      const idea = await getIdea(a.idea_id as string);
      return idea ? `Excluir definitivamente a ideia "${idea.title}"? Isso não pode ser desfeito.` : 'Ideia não encontrada.';
    },
    async run(a) {
      const idea = await getIdea(a.idea_id as string);
      if (!idea) return fail('Ideia não encontrada.');
      await deleteIdea(idea.id);
      return { ok: true, data: { deleted: idea.id }, summary: `Ideia excluída: ${idea.title}` };
    },
  },
  {
    name: 'create_project',
    description: 'Cria um projeto em Projetos e clientes. Se vier de uma ideia, informe origin_idea_id: a ideia passa para "em desenvolvimento" e fica vinculada.',
    params: {
      name: { type: 'string', description: 'Nome do projeto', required: true, maxLength: 120 },
      description: { type: 'string', description: 'Descrição' },
      origin_idea_id: { type: 'string', description: 'ID da ideia de origem' },
    },
    async run(a) {
      const p = await createProject({ name: a.name as string, description: str(a.description), origin_idea_id: str(a.origin_idea_id) });
      return { ok: true, data: projectBrief(p), summary: `Projeto criado: ${p.name}` };
    },
  },
  {
    name: 'find_project',
    description: 'Procura projetos por assunto, ou retorna os detalhes de um projeto (tarefas, documentos e arquivos) quando houver um único resultado ou project_id for informado.',
    params: {
      query: { type: 'string', description: 'Assunto ou nome aproximado' },
      project_id: { type: 'string', description: 'ID exato' },
    },
    async run(a) {
      let list: Project[];
      if (a.project_id) {
        const p = await getProject(a.project_id as string);
        if (!p) return fail('Projeto não encontrado.');
        list = [p];
      } else {
        list = (str(a.query) ? await searchProjects(a.query as string) : await listProjects()).slice(0, 10);
      }
      if (list.length !== 1) return { ok: true, data: { count: list.length, projects: list.map(projectBrief) } };
      const p = list[0];
      const [tasks, docs, files] = await Promise.all([listTasks({ project_id: p.id }), listDocuments({ project_id: p.id }), listFiles({ project_id: p.id })]);
      return {
        ok: true,
        data: {
          project: { ...p, external_links: JSON.parse(p.external_links) },
          tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, due_date: t.due_date })),
          documents: docs.map((d) => ({ id: d.id, title: d.title, kind: d.kind, version: d.current_version })),
          files: files.map((f) => ({ id: f.id, name: f.name, version_label: f.version_label, has_text: Boolean(f.text_content) })),
        },
      };
    },
  },
  {
    name: 'update_project',
    description: 'Atualiza um projeto: nome, descrição, etapa do ciclo, situação ou adiciona um link externo.',
    params: {
      project_id: { type: 'string', description: 'ID do projeto', required: true },
      name: { type: 'string', description: 'Novo nome' },
      description: { type: 'string', description: 'Nova descrição' },
      stage: { type: 'string', description: 'Etapa atual', enum: PROJECT_STAGES },
      status: { type: 'string', description: 'Situação', enum: PROJECT_STATUSES },
      link_label: { type: 'string', description: 'Rótulo do link externo a adicionar' },
      link_url: { type: 'string', description: 'URL do link externo (https://...)' },
    },
    async run(a) {
      const p = await getProject(a.project_id as string);
      if (!p) return fail('Projeto não encontrado.');
      const changes: Partial<Project> = {};
      if (a.name) changes.name = a.name as string;
      if (a.description) changes.description = a.description as string;
      if (a.stage) changes.stage = a.stage as ProjectStage;
      if (a.status) changes.status = a.status as ProjectStatus;
      if (a.link_url) {
        const url = a.link_url as string;
        if (!/^https?:\/\//i.test(url)) return fail('O link precisa começar com http:// ou https://');
        const links = JSON.parse(p.external_links) as { label: string; url: string }[];
        links.push({ label: str(a.link_label) ?? url, url });
        changes.external_links = JSON.stringify(links);
      }
      const updated = await updateProject(p.id, changes);
      return { ok: true, data: projectBrief(updated), summary: `Projeto atualizado: ${updated.name}` };
    },
  },
  {
    name: 'create_task',
    description: 'Cria uma tarefa, opcionalmente ligada a um projeto e com prazo (AAAA-MM-DD).',
    params: {
      title: { type: 'string', description: 'O que precisa ser feito', required: true, maxLength: 200 },
      description: { type: 'string', description: 'Detalhes' },
      project_id: { type: 'string', description: 'ID do projeto' },
      due_date: { type: 'string', description: 'Prazo no formato AAAA-MM-DD' },
    },
    async run(a) {
      const t = await createTask({ title: a.title as string, description: str(a.description), project_id: str(a.project_id), due_date: str(a.due_date) });
      return { ok: true, data: { id: t.id, title: t.title, project_id: t.project_id, due_date: t.due_date }, summary: `Tarefa criada: ${t.title}` };
    },
  },
  {
    name: 'list_tasks',
    description: 'Lista tarefas. Por padrão retorna as que ainda não foram concluídas.',
    params: {
      project_id: { type: 'string', description: 'Filtrar por projeto' },
      status: { type: 'string', description: 'Filtrar por situação ("abertas" = não concluídas)', enum: ['abertas', ...TASK_STATUSES] },
    },
    async run(a) {
      const tasks = await listTasks({ project_id: str(a.project_id), status: (str(a.status) ?? 'abertas') as TaskStatus | 'abertas' });
      return { ok: true, data: { count: tasks.length, tasks: tasks.slice(0, 30).map((t) => ({ id: t.id, title: t.title, status: t.status, due_date: t.due_date, project_id: t.project_id })) } };
    },
  },
  {
    name: 'update_task_status',
    description: 'Muda a situação de uma tarefa (ex.: marcar como concluída).',
    params: {
      task_id: { type: 'string', description: 'ID da tarefa', required: true },
      status: { type: 'string', description: 'Nova situação', required: true, enum: TASK_STATUSES },
    },
    async run(a) {
      const t = await setTaskStatus(a.task_id as string, a.status as TaskStatus);
      return { ok: true, data: { id: t.id, status: t.status }, summary: `Tarefa "${t.title}" → ${t.status}` };
    },
  },
  {
    name: 'save_document',
    description: 'Salva um documento (técnico, prompt para Claude, briefing, estratégia). Para revisar um documento existente, informe document_id: será criada uma nova versão, sem apagar a anterior.',
    params: {
      title: { type: 'string', description: 'Título do documento', required: true, maxLength: 160 },
      kind: { type: 'string', description: 'Tipo', required: true, enum: DOCUMENT_KINDS },
      department: { type: 'string', description: 'Departamento ao qual pertence', required: true, enum: DEPARTMENTS },
      content: { type: 'string', description: 'Conteúdo completo em Markdown', required: true },
      project_id: { type: 'string', description: 'ID do projeto relacionado' },
      idea_id: { type: 'string', description: 'ID da ideia relacionada' },
      document_id: { type: 'string', description: 'ID do documento, para salvar nova versão' },
      note: { type: 'string', description: 'O que mudou nesta versão' },
    },
    async run(a) {
      if (a.idea_id && !(await getIdea(a.idea_id as string))) return fail('Ideia relacionada não encontrada.');
      if (a.project_id && !(await getProject(a.project_id as string))) return fail('Projeto relacionado não encontrado.');
      const { document, version } = await saveDocument({
        document_id: str(a.document_id), title: a.title as string, kind: a.kind as DocumentKind, department: a.department as string,
        content: a.content as string, project_id: str(a.project_id), idea_id: str(a.idea_id), note: str(a.note), source: 'ia',
      });
      return { ok: true, data: { document_id: document.id, version: version.version }, summary: `Documento salvo: ${document.title} (v${version.version})` };
    },
  },
  {
    name: 'get_document',
    description: 'Lê o conteúdo da versão mais recente de um documento salvo.',
    params: { document_id: { type: 'string', description: 'ID do documento', required: true } },
    async run(a) {
      const d = await getDocument(a.document_id as string);
      if (!d) return fail('Documento não encontrado.');
      const v = await latestVersion(d.id);
      return { ok: true, data: { document: d, content: v?.content ?? '' } };
    },
  },
  {
    name: 'import_project_files',
    description: 'Associa arquivos que o usuário já importou no aplicativo (caixa de entrada) a um projeto e registra a versão. Retorna o conteúdo real dos arquivos para análise. Você NÃO consegue buscar arquivos fora do aplicativo: se não houver arquivos importados, peça ao usuário que use o botão "Importar arquivos" no projeto.',
    params: {
      project_id: { type: 'string', description: 'ID do projeto', required: true },
      file_ids: { type: 'array', description: 'IDs dos arquivos; se omitido, usa todos da caixa de entrada', items: { type: 'string' } },
      version_label: { type: 'string', description: 'Rótulo da versão (ex.: "v1 — entrega do Claude")' },
    },
    async run(a) {
      let ids = (a.file_ids as string[] | undefined) ?? [];
      if (!ids.length) ids = (await listFiles({ inbox: true })).map((f) => f.id);
      if (!ids.length) return fail('Nenhum arquivo importado aguardando. O usuário precisa importar os arquivos pelo botão "Importar arquivos".');
      const files = await assignFiles(ids, a.project_id as string, str(a.version_label) ?? null);
      return {
        ok: true,
        summary: `${files.length} arquivo(s) associados ao projeto`,
        data: {
          files: files.map((f) => ({
            id: f.id, name: f.name, size: f.size,
            content: f.text_content ? truncate(f.text_content, 12_000) : null,
            note: f.text_content ? undefined : 'Arquivo binário: o conteúdo não pôde ser lido. Não faça afirmações sobre ele.',
          })),
        },
      };
    },
  },
  {
    name: 'search_memory',
    description: 'Procura em tudo o que o MASON guardou: memórias, ideias, projetos, documentos e expressões do usuário. Use antes de dizer que não sabe algo de conversas anteriores.',
    params: { query: { type: 'string', description: 'Assunto a procurar', required: true } },
    async run(a) {
      const q = a.query as string;
      const [memories, ideas, projects, docs, exprs] = await Promise.all([
        searchMemories(q), searchIdeas(q), searchProjects(q), listDocuments(), listExpressions(),
      ]);
      return {
        ok: true,
        data: {
          memories: memories.slice(0, 8).map((m) => ({ id: m.id, kind: m.kind, source: m.source, subject: m.subject, content: m.content })),
          ideas: ideas.slice(0, 5).map(ideaBrief),
          projects: projects.slice(0, 5).map(projectBrief),
          documents: rankBy(docs, q, (d) => d.title).slice(0, 5).map((d) => ({ id: d.id, title: d.title, kind: d.kind })),
          expressions: rankBy(exprs, q, (e) => `${e.expression} ${e.meaning}`).slice(0, 5).map((e) => ({ expression: e.expression, meaning: e.meaning })),
        },
      };
    },
  },
  {
    name: 'save_memory',
    description: 'Guarda uma informação importante em memória estruturada. Marque a origem com honestidade: "usuario" se ele disse, "decisao_confirmada" se ele decidiu explicitamente, "ia_sugestao" se foi ideia sua, "nao_verificado" se é incerto.',
    params: {
      kind: { type: 'string', description: 'Tipo', required: true, enum: MEMORY_KINDS },
      content: { type: 'string', description: 'A informação, em uma ou duas frases', required: true, maxLength: 1000 },
      source: { type: 'string', description: 'Origem da informação', required: true, enum: MEMORY_SOURCES },
      subject: { type: 'string', description: 'Assunto (ex.: nome do projeto)' },
    },
    async run(a) {
      const m = await remember({ kind: a.kind as MemoryKind, content: a.content as string, source: a.source as MemorySource, subject: str(a.subject) });
      return { ok: true, data: { id: m.id }, summary: 'Memória guardada' };
    },
  },
  {
    name: 'update_user_preferences',
    description: 'Atualiza o perfil de comunicação do usuário: o significado de uma expressão/gíria que ele explicou, ou uma preferência de resposta (ex.: response_length = curta).',
    params: {
      expression: { type: 'string', description: 'Expressão ou gíria explicada pelo usuário' },
      meaning: { type: 'string', description: 'Significado explicado pelo usuário' },
      example: { type: 'string', description: 'Exemplo de uso' },
      preference_key: { type: 'string', description: 'Preferência', enum: ['response_length', 'tone', 'voice_replies', 'other'] },
      preference_value: { type: 'string', description: 'Valor da preferência' },
    },
    async run(a) {
      const done: string[] = [];
      if (a.expression || a.meaning) {
        if (!a.expression || !a.meaning) return fail('Para registrar uma expressão, informe expression e meaning.');
        await saveExpression(a.expression as string, a.meaning as string, str(a.example));
        done.push(`expressão "${a.expression}"`);
      }
      if (a.preference_key) {
        if (!a.preference_value) return fail('Informe preference_value.');
        await setPref(`comm.${a.preference_key}`, a.preference_value as string);
        done.push(`preferência ${a.preference_key}`);
      }
      if (!done.length) return fail('Nada para atualizar.');
      return { ok: true, data: { updated: done }, summary: `Perfil atualizado: ${done.join(', ')}` };
    },
  },
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);
