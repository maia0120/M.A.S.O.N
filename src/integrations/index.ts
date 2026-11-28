/**
 * Integrações futuras. Nenhuma está conectada: cada uma exigirá autenticação e permissões próprias.
 * O MASON não presume acesso a contas de outros aplicativos.
 */
export interface IntegrationInfo {
  id: 'claude' | 'lovable' | 'github' | 'vercel';
  name: string;
  purpose: string;
  status: 'manual' | 'nao_conectado';
  notes: string;
  /** Ações que sempre exigirão confirmação explícita. */
  guarded: string[];
}

export const INTEGRATIONS: IntegrationInfo[] = [
  {
    id: 'claude', name: 'Claude', purpose: 'Desenvolvimento de código e implementação', status: 'manual',
    notes: 'Fluxo manual: o MASON prepara o prompt em Desenvolvimento, você copia e envia ao Claude, depois importa os arquivos no projeto.',
    guarded: [],
  },
  { id: 'lovable', name: 'Lovable', purpose: 'Criação visual e interfaces', status: 'nao_conectado', notes: 'Prevista para Design e criação (prompts para Lovable).', guarded: ['Publicar projeto'] },
  { id: 'github', name: 'GitHub', purpose: 'Repositórios e código', status: 'nao_conectado', notes: 'Exigirá token com escopo mínimo, guardado fora do APK.', guarded: ['Enviar código (push)', 'Excluir repositório'] },
  { id: 'vercel', name: 'Vercel', purpose: 'Publicação de sites e aplicações', status: 'nao_conectado', notes: 'Publicação em produção sempre com confirmação explícita.', guarded: ['Publicar em produção'] },
];
