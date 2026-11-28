export type IdeaStatus = 'nova' | 'em_analise' | 'aprovada' | 'em_desenvolvimento' | 'arquivada';
export const IDEA_STATUSES: IdeaStatus[] = ['nova', 'em_analise', 'aprovada', 'em_desenvolvimento', 'arquivada'];

export interface Idea {
  id: string;
  title: string;
  original_description: string;
  organized_description: string | null;
  ai_suggestions: string | null;
  category: string | null;
  status: IdeaStatus;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface IdeaHistory {
  id: string;
  idea_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  source: 'usuario' | 'ia';
  created_at: string;
}

export type ProjectStage = 'planejamento' | 'design' | 'desenvolvimento' | 'qualidade' | 'entregue';
export const PROJECT_STAGES: ProjectStage[] = ['planejamento', 'design', 'desenvolvimento', 'qualidade', 'entregue'];
export type ProjectStatus = 'ativo' | 'pausado' | 'concluido' | 'arquivado';
export const PROJECT_STATUSES: ProjectStatus[] = ['ativo', 'pausado', 'concluido', 'arquivado'];

export interface Project {
  id: string;
  name: string;
  description: string | null;
  origin_idea_id: string | null;
  client_id: string | null;
  stage: ProjectStage;
  status: ProjectStatus;
  external_links: string; // JSON
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  name: string;
  contact: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'pendente' | 'em_andamento' | 'concluida';
export const TASK_STATUSES: TaskStatus[] = ['pendente', 'em_andamento', 'concluida'];

export interface Task {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  status: TaskStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentKind = 'tecnico' | 'prompt_claude' | 'briefing' | 'estrategia' | 'outro';
export const DOCUMENT_KINDS: DocumentKind[] = ['tecnico', 'prompt_claude', 'briefing', 'estrategia', 'outro'];

export interface DocumentRecord {
  id: string;
  title: string;
  kind: DocumentKind;
  department: string;
  project_id: string | null;
  idea_id: string | null;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version: number;
  content: string;
  note: string | null;
  source: 'usuario' | 'ia';
  created_at: string;
}

export interface StoredFile {
  id: string;
  project_id: string | null;
  name: string;
  mime: string | null;
  size: number;
  storage_ref: string | null;
  text_content: string | null;
  analysis: string | null;
  version_label: string | null;
  imported_at: string;
}

export type MemorySource = 'usuario' | 'ia_sugestao' | 'decisao_confirmada' | 'nao_verificado';
export const MEMORY_SOURCES: MemorySource[] = ['usuario', 'ia_sugestao', 'decisao_confirmada', 'nao_verificado'];
export type MemoryKind = 'preferencia' | 'decisao' | 'fato' | 'contexto';
export const MEMORY_KINDS: MemoryKind[] = ['preferencia', 'decisao', 'fato', 'contexto'];

export interface Memory {
  id: string;
  kind: MemoryKind;
  subject: string | null;
  content: string;
  source: MemorySource;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface Expression {
  id: string;
  expression: string;
  meaning: string;
  example: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranscriptCorrection {
  id: string;
  heard: string;
  correct: string;
  count: number;
  auto_apply: number;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  type: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  section: string | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  meta: string | null;
  created_at: string;
}

/** Rótulos amigáveis */
export const LABELS: Record<string, string> = {
  nova: 'Nova', em_analise: 'Em análise', aprovada: 'Aprovada', em_desenvolvimento: 'Em desenvolvimento', arquivada: 'Arquivada',
  planejamento: 'Planejamento', design: 'Design', desenvolvimento: 'Desenvolvimento', qualidade: 'Qualidade e entrega', entregue: 'Entregue',
  ativo: 'Ativo', pausado: 'Pausado', concluido: 'Concluído', arquivado: 'Arquivado',
  pendente: 'Pendente', em_andamento: 'Em andamento', concluida: 'Concluída',
  tecnico: 'Documento técnico', prompt_claude: 'Prompt para Claude', briefing: 'Briefing', estrategia: 'Estratégia', outro: 'Outro',
  usuario: 'Fornecido por você', ia_sugestao: 'Sugestão da IA', decisao_confirmada: 'Decisão confirmada', nao_verificado: 'Não verificado',
  preferencia: 'Preferência', decisao: 'Decisão', fato: 'Fato', contexto: 'Contexto',
};
export const label = (k: string | null | undefined) => (k ? LABELS[k] ?? k : '—');
