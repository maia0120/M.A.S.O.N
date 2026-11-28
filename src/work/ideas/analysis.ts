import { CRITERIA } from '../../assistant/knowledge/seed';
import { fold } from '../../assistant/intent/normalize';
import { relevance } from '../../core/util';
import type { Idea } from '../../core/types';

/**
 * Análise crítica baseada em critérios (decisões D3 e D3a).
 * Verifica quais critérios a ideia já responde, quais estão em aberto e quais riscos se aplicam.
 * Não avalia o mercado por conta própria: o que depende de conhecimento externo vira pergunta.
 */

/** Pistas técnicas de que um critério já foi respondido no texto da ideia. */
const HINTS: Record<string, string[]> = {
  'Público': ['publico', 'clientes', 'usuarios', 'pessoas', 'empresas', 'pequenos negocios', 'lojistas', 'estudantes', 'profissionais', 'donos', 'consumidores', 'barbearias', 'saloes'],
  'Problema': ['problema', 'dificuldade', 'perdem', 'nao conseguem', 'precisam', 'facilitar', 'resolver', 'consigam', 'economizar'],
  'Monetização': ['cobrar', 'assinatura', 'mensalidade', 'comissao', 'margem', 'pagar', 'vender', 'anuncio', 'anuncios', 'lucro', 'dinheiro', 'plano', 'planos', 'taxa'],
  'Diferencial': ['diferencial', 'diferente', 'melhor que', 'unico', 'ninguem faz', 'concorrente', 'concorrentes'],
  'Primeira versão': ['mvp', 'primeira versao', 'versao inicial', 'comecar com', 'prototipo', 'versao simples'],
  'Esforço': ['prazo', 'semanas', 'meses', 'simples de fazer', 'rapido de fazer', 'esforco'],
  'Origem dos dados': ['api', 'dados', 'cadastrar', 'cadastram', 'cadastro', 'integracao', 'planilha', 'parceria', 'parcerias'],
  'Tráfego': ['divulgacao', 'divulgar', 'instagram', 'google', 'seo', 'trafego', 'redes sociais', 'marketing'],
  'Dois lados': ['vendedores', 'compradores', 'prestadores', 'fornecedores', 'dois lados', 'oferta', 'demanda'],
  'Confiança': ['avaliacao', 'avaliacoes', 'reputacao', 'garantia', 'pagamento seguro', 'verificacao'],
  'Retenção': ['notificacao', 'notificacoes', 'todo dia', 'diario', 'rotina', 'lembrete', 'lembretes'],
  'Publicação': ['play store', 'loja de apps', 'uso interno', 'apk'],
  'Escala': ['automatizar', 'automatico', 'equipe', 'escala'],
  'Preço': ['preco', 'cobrar', 'valor', 'orcamento', 'pacote'],
  'Frequência': ['por semana', 'diario', 'frequencia', 'todo dia', 'semanal'],
  'Canal': ['youtube', 'instagram', 'tiktok', 'blog', 'podcast', 'canal'],
};

/** Riscos que só se aplicam quando o texto indica (Concorrência vale sempre). */
const RISK_TRIGGERS: Record<string, string[] | 'sempre'> = {
  'Dependência externa': ['api', 'integracao', 'plataforma', 'parceiro', 'parceria', 'scraping', 'marketplace', 'lojas'],
  'Legal': ['dados pessoais', 'pagamento', 'pagamentos', 'cpf', 'saude', 'menores', 'cartao'],
  'Concorrência': 'sempre',
};

export function criteriaGroups(category: string | null): string[] {
  const c = fold(category ?? '');
  const groups = ['geral'];
  if (/site|plataforma|sistema|loja|landing/.test(c)) groups.push('site/plataforma');
  if (/marketplace/.test(c)) groups.push('site/plataforma', 'marketplace');
  if (/aplicativo|app/.test(c)) groups.push('aplicativo');
  if (/servico/.test(c)) groups.push('serviço');
  if (/conteudo/.test(c)) groups.push('conteúdo');
  return groups;
}

export interface IdeaAnalysis {
  covered: string[];
  open: { criterion: string; question: string }[];
  risks: { criterion: string; question: string }[];
  similar: Idea[];
  generalMissing: number;
  text: string;
}

export function analyzeIdea(idea: Idea, others: Idea[]): IdeaAnalysis {
  const body = ` ${fold([idea.title, idea.original_description, idea.organized_description].filter(Boolean).join(' '))} `;
  const has = (words: string[]) => words.some((w) => body.includes(` ${w} `) || body.includes(` ${w}`));
  const groups = criteriaGroups(idea.category);
  const covered: string[] = [];
  const open: { criterion: string; question: string }[] = [];
  const risks: { criterion: string; question: string }[] = [];
  for (const c of CRITERIA) {
    if (c.category === 'riscos comuns') {
      const trig = RISK_TRIGGERS[c.criterion];
      if (trig === 'sempre' || (trig && has(trig))) risks.push({ criterion: c.criterion, question: c.question });
      continue;
    }
    if (!groups.includes(c.category)) continue;
    if (has(HINTS[c.criterion] ?? [])) covered.push(c.criterion);
    else open.push({ criterion: c.criterion, question: c.question });
  }
  const generalMissing = open.filter((o) => CRITERIA.find((c) => c.criterion === o.criterion)?.category === 'geral').length;
  const similar = others
    .filter((o) => o.id !== idea.id && o.status !== 'arquivada')
    .filter((o) => relevance(idea.title + ' ' + idea.original_description, o.title + ' ' + o.original_description) >= 0.5);

  const lines: string[] = [`Análise do MASON (${new Date().toLocaleDateString('pt-BR')}) — baseada em critérios, sem avaliação de mercado.`];
  lines.push(covered.length ? `Já definido: ${covered.join(', ')}.` : 'Ainda não há critérios definidos no texto da ideia.');
  if (open.length) {
    lines.push('', 'Em aberto:');
    for (const o of open) lines.push(`- ${o.criterion}: ${o.question}`);
  }
  if (risks.length) {
    lines.push('', 'Riscos a verificar:');
    for (const r of risks) lines.push(`- ${r.criterion}: ${r.question}`);
  }
  if (similar.length) lines.push('', `Parecida com: ${similar.map((s) => `"${s.title}"`).join(', ')}.`);
  return { covered, open, risks, similar, generalMissing, text: lines.join('\n') };
}
