import { fold } from '../intent/normalize';
import { findCategory } from '../intent/entities';

/**
 * IDEIA EM CONSTRUÇÃO (0.7.0, escolha do Gabriel: "salvar logo e ir completando").
 *
 * Assim que há um assunto, a ideia é criada; cada mensagem seguinte é guardada nas palavras do
 * Gabriel (descrição original) e também separada em partes — tipo, finalidade, público,
 * funcionalidades, monetização, observações — para montar a descrição organizada.
 * Nada é inventado: cada parte é um trecho do que ele disse.
 */
export type Slot = 'finalidade' | 'publico' | 'funcionalidades' | 'monetizacao' | 'observacoes';

export interface IdeaDraft {
  ideaId: string | null;
  /** As palavras do Gabriel, mensagem por mensagem (viram a descrição original). */
  raws: string[];
  lastAt: number;
  title: string | null;
  tipo: string | null;
  proposta: string | null;
  finalidade: string[];
  publico: string[];
  funcionalidades: string[];
  monetizacao: string[];
  observacoes: string[];
  /** Quantas mensagens do Gabriel entraram nesta ideia. */
  messages: number;
  /** Partes que o MASON já perguntou (nunca repete). */
  asked: Slot[];
  /** A última pergunta feita, cuja resposta preenche essa parte. */
  expecting: Slot | null;
  startedAt: number;
}

export function newDraft(): IdeaDraft {
  return { ideaId: null, raws: [], lastAt: Date.now(), title: null, tipo: null, proposta: null, finalidade: [], publico: [], funcionalidades: [], monetizacao: [], observacoes: [], messages: 0, asked: [], expecting: null, startedAt: Date.now() };
}

const PESSOAS = 'pessoas|gente|empresas?|empreendedor(es|as)?|donos?|donas?|clientes?|estudantes?|alunos?|maes|pais|idosos|jovens|adolescentes|freelancers?|autonomos?|pequenos|pequenas|profissionais|barbeiros?|cabeleireir[oa]s?|medicos?|dentistas?|motoristas?|familias?|casais|usuarios?|mei|lojistas?|criadores|comerciantes|vendedores|academias|restaurantes|saloes|igrejas|escolas|quem (tem|precisa|quer)';

const RX: Record<Exclude<Slot, 'observacoes'>, RegExp> = {
  publico: new RegExp(`(publico|voltad[oa]s? (a|para|pra)|focad[oa]s? em|pensad[oa] para|quem (vai )?usar|seria para|e para|seria pra|e pra|(para|pra) (as |os )?(${PESSOAS})( |$))`),
  monetizacao: /(cobra|cobrar|assinatura|mensalidade|plano (pago|mensal|anual|gratis)|gratis|gratuito|anuncio|comissao|taxa|vend(er|e|a) |pago|premium|freemium|ganhar dinheiro|monetiz|lucr|reais|r\$|por mes|por ano|preco)/,
  funcionalidades: /(vai ter|teria|tera |ter (um|uma)|funcionalidade|funcao|recurso|permit(e|ir|iria)|o usuario (pode|vai|poderia)|a pessoa (pode|vai|poderia)|da para|dava para|daria para|mostra(r|ria)?|notifica|alerta|lembrete|relatorio|grafico|cadastr|controle de|integra|agenda(r|mento)|chat|login|painel|dashboard|botao|tela de|aba de)/,
  finalidade: /(para (ajudar|resolver|facilitar|organizar|controlar|gerenciar|acompanhar|economizar|evitar|melhorar)|o problema|problema e|porque|ajudar a|ajuda a|serve para|serviria para|objetivo|a ideia e|a proposta e|a dor|dificuldade|ninguem|perde(m)? tempo)/,
};

/** Partes de uma mensagem (uma mensagem pode ter mais de uma). */
export function classifyPieces(text: string): { slot: Slot; text: string }[] {
  const pieces = text
    .split(/(?<=[.!?;])\s+|\s+(?:e também|além disso|e tambem|alem disso)\s+/i)
    .map((s) => s.trim().replace(/^[,.;\s]+|[,;\s]+$/g, ''))
    .filter((s) => s.split(/\s+/).length >= 2);
  return pieces.map((p) => {
    const f = fold(p);
    const slot = (['monetizacao', 'publico', 'funcionalidades', 'finalidade'] as const).find((s) => RX[s].test(f)) ?? 'observacoes';
    return { slot, text: p };
  });
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Tira o rótulo que o Gabriel falou ("o público seria…" → "…"); o conteúdo continua sendo dele. */
const LABELS: Partial<Record<Slot, RegExp>> = {
  publico: /^(o |a )?(p[uú]blico( alvo)?|cliente|clientes)( principal)?( seria| é| e| vai ser| são| sao|:)?\s+/i,
  finalidade: /^(o |a )?(problema|objetivo|ideia|proposta|dor)( principal)?( seria| é| e|:)?\s+/i,
  monetizacao: /^(a )?(monetiza[cç][aã]o|forma de ganhar dinheiro)( seria| é| e|:)?\s+/i,
};
const clean = (slot: Slot, t: string) => cap((LABELS[slot] ? t.replace(LABELS[slot]!, '') : t).trim() || t);

/** Acrescenta uma mensagem do Gabriel. Devolve as partes que ela preencheu. */
export function absorb(d: IdeaDraft, content: string, opts: { first?: boolean } = {}): Slot[] {
  d.messages++;
  const filled: Slot[] = [];
  d.tipo = d.tipo ?? findCategory(content);
  const pieces = classifyPieces(content);
  if (opts.first || !d.proposta) {
    d.proposta = cap(content.trim());
    // a primeira frase é a proposta; outras partes dela ainda podem ser público, cobrança etc.
    for (const p of pieces.slice(1)) if (p.slot !== 'observacoes') { d[p.slot].push(clean(p.slot, p.text)); filled.push(p.slot); }
    if (pieces[0] && pieces[0].slot !== 'observacoes' && pieces[0].slot !== 'funcionalidades') { d[pieces[0].slot].push(clean(pieces[0].slot, pieces[0].text)); filled.push(pieces[0].slot); }
  } else {
    for (const p of pieces.length ? pieces : [{ slot: 'observacoes' as Slot, text: content }]) {
      // resposta a uma pergunta minha: o que não tiver parte clara vai para a parte perguntada
      const slot = p.slot === 'observacoes' && d.expecting ? d.expecting : p.slot;
      d[slot].push(clean(slot, p.text));
      filled.push(slot);
    }
  }
  d.expecting = null;
  return [...new Set(filled)];
}

export function organized(d: IdeaDraft): string {
  const lines: string[] = [];
  if (d.tipo) lines.push(`Tipo: ${d.tipo}`);
  if (d.proposta) lines.push(`Proposta: ${d.proposta}`);
  if (d.finalidade.length) lines.push(`Problema/finalidade: ${d.finalidade.join(' ')}`);
  if (d.publico.length) lines.push(`Público: ${d.publico.join(' ')}`);
  if (d.funcionalidades.length) lines.push(`Funcionalidades:\n${d.funcionalidades.map((f) => `- ${f}`).join('\n')}`);
  if (d.monetizacao.length) lines.push(`Monetização: ${d.monetizacao.join(' ')}`);
  if (d.observacoes.length) lines.push(`Observações:\n${d.observacoes.map((f) => `- ${f}`).join('\n')}`);
  return lines.join('\n');
}

const QUESTIONS: Record<Exclude<Slot, 'observacoes'>, string> = {
  finalidade: 'Qual problema isso resolve?',
  publico: 'Pra quem seria?',
  funcionalidades: 'O que não pode faltar nele?',
  monetizacao: 'Já pensou em como ganharia dinheiro com isso?',
};

/**
 * Pergunta de vez em quando pela próxima parte que falta (nunca repete, no máximo 3 por ideia).
 * Só pergunta em mensagens alternadas, para não interromper quem está explicando.
 */
export function nextQuestion(d: IdeaDraft): string | null {
  if (d.asked.length >= 3 || d.messages % 2 === 0) return null;
  const slot = (['finalidade', 'publico', 'funcionalidades', 'monetizacao'] as const).find((s) => !d[s].length && !d.asked.includes(s));
  if (!slot) return null;
  d.asked.push(slot);
  d.expecting = slot;
  return QUESTIONS[slot];
}

const ACKS = ['Anotado.', 'Certo.', 'Entendi.', 'Beleza, anotei.'];
const SLOT_NAME: Record<Slot, string> = { finalidade: 'o problema', publico: 'o público', funcionalidades: 'essa funcionalidade', monetizacao: 'a forma de ganhar dinheiro', observacoes: '' };

export function ack(d: IdeaDraft, filled: Slot[]): string {
  const named = filled.find((s) => s !== 'observacoes');
  if (named && d.messages % 2 === 0) return `Anotei ${SLOT_NAME[named]}.`;
  return ACKS[d.messages % ACKS.length];
}
