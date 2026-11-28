/** Registro único de ambientes e seções — usado pelo menu, pelo roteador e pela ferramenta open_section. */
export type EnvironmentId = 'work' | 'studies' | 'personal';

export interface SectionDef {
  id: string;
  env: EnvironmentId | 'system';
  title: string;
  short: string;
  description: string;
  implemented: boolean;
  /** Funcionalidades planejadas (exibidas enquanto a seção não estiver pronta). */
  planned?: string[];
}

export const ENVIRONMENTS: { id: EnvironmentId; title: string; implemented: boolean }[] = [
  { id: 'work', title: 'Gestão de trabalho', implemented: true },
  { id: 'studies', title: 'Gestão de estudos', implemented: false },
  { id: 'personal', title: 'Pessoal', implemented: false },
];

export const SECTIONS: SectionDef[] = [
  { id: 'work-dashboard', env: 'work', title: 'Visão geral', short: 'Visão geral', description: 'Painel da Gestão de trabalho', implemented: true },
  { id: 'ideas', env: 'work', title: 'Central de ideias', short: 'Ideias', description: 'Biblioteca de ideias registradas em conversa', implemented: true },
  { id: 'development', env: 'work', title: 'Desenvolvimento', short: 'Desenvolvimento', description: 'Planejamento técnico e prompts para o Claude', implemented: true },
  {
    id: 'design', env: 'work', title: 'Design e criação', short: 'Design', description: 'Organização visual dos projetos', implemented: false,
    planned: ['Briefings', 'Referências', 'Identidade visual', 'Organização de telas', 'Paletas e tipografia', 'Prompts para Lovable', 'Arquivos visuais com versões'],
  },
  {
    id: 'marketing', env: 'work', title: 'Marketing e estratégia', short: 'Marketing', description: 'Posicionamento e divulgação', implemented: false,
    planned: ['Pesquisa de público', 'Análise de mercado', 'Posicionamento e diferenciais', 'Campanhas', 'Calendário de conteúdo', 'Roteiros de vídeo', 'Ideias para redes sociais'],
  },
  {
    id: 'commercial', env: 'work', title: 'Comercial', short: 'Comercial', description: 'Clientes, propostas e vendas', implemented: false,
    planned: ['Cadastro de clientes', 'Histórico de conversas', 'Propostas comerciais', 'Serviços e valores', 'Oportunidades', 'Modelos de mensagem', 'Vendas concluídas'],
  },
  { id: 'projects', env: 'work', title: 'Projetos e clientes', short: 'Projetos', description: 'Acompanhamento, tarefas, arquivos e entregas', implemented: true },
  {
    id: 'studies-dashboard', env: 'studies', title: 'Gestão de estudos', short: 'Estudos', description: 'Ambiente de estudos', implemented: false,
    planned: ['Previsto na arquitetura; será definido nas próximas fases.'],
  },
  {
    id: 'personal-dashboard', env: 'personal', title: 'Pessoal', short: 'Pessoal', description: 'Ambiente pessoal', implemented: false,
    planned: ['Previsto na arquitetura; será definido nas próximas fases.'],
  },
  { id: 'memory', env: 'system', title: 'Memória', short: 'Memória', description: 'O que o MASON sabe e de onde veio', implemented: true },
  { id: 'settings', env: 'system', title: 'Configurações', short: 'Configurações', description: 'IA, voz, memória, segurança e diagnóstico', implemented: true },
];

export const WORK_DEPARTMENTS = ['ideas', 'development', 'design', 'marketing', 'commercial', 'projects'];

export const sectionById = (id: string) => SECTIONS.find((s) => s.id === id);
