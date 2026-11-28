import { addMessage, currentConversationId, newConversation } from '../../memory/history/conversationRepo';
import { nav } from '../../interface/navigation/navStore';
import { sectionById } from '../../interface/navigation/sections';
import { getIdea, listIdeas } from '../../work/ideas/ideasRepo';
import { analyzeIdea } from '../../work/ideas/analysis';
import { relevance, truncate } from '../../core/util';
import { label, type ChatMessage, type Idea } from '../../core/types';
import { interpret, intentLabel, type Interpretation } from '../intent/interpreter';
import { fold } from '../intent/normalize';
import { ideaContent, titleFrom, findCategory, findSection, subjectOf, stripRequest } from '../intent/entities';
import { ensureLearned, learn } from '../intent/learning';
import { newDraft, absorb, organized, nextQuestion, ack, type IdeaDraft } from '../context/ideaDraft';
import { state, setFocus, recentFocus, type PendingThen } from '../context/dialogState';
import { resolveIdea, pickFromList } from '../context/resolve';
import { respond, shortDate, joinList } from './responses';
import { execute, type ActionRecord, type PendingAction } from './executor';

export type { ActionRecord, PendingAction } from './executor';
export { confirmPending, cancelPending } from './executor';

export interface MasonReply {
  message: ChatMessage;
  actions: ActionRecord[];
  pending: PendingAction[];
  /** Como a mensagem foi interpretada (para o diagnóstico de voz). */
  debug: { intent: string | null; score: number; confident: boolean; ambiguous: boolean };
}

let lastDebug: MasonReply['debug'] = { intent: null, score: 0, confident: false, ambiguous: false };

/**
 * Núcleo próprio do MASON (Fase 1).
 * normalização → interpretador → contexto (pendências e foco) → intenções → executor → respostas.
 * Nenhuma API de IA. Toda ação passa pelo executor, e a resposta só diz "feito" com resultado ok.
 */
class Turn {
  actions: ActionRecord[] = [];
  confirmations: PendingAction[] = [];
  async act(tool: string, args: Record<string, unknown>) {
    const out = await execute(tool, args);
    this.actions.push(out.record);
    if (out.pending) this.confirmations.push(out.pending);
    return out;
  }
}

export async function sendToMason(text: string, opts: { voice?: boolean; signal?: AbortSignal } = {}): Promise<MasonReply> {
  const conversationId = await currentConversationId();
  await addMessage(conversationId, 'user', text, { section: nav.get().section });
  const turn = new Turn();
  await ensureLearned().catch(() => undefined);
  let reply: string;
  try {
    reply = await think(text.trim(), turn);
  } catch (e) {
    reply = respond('falha', { erro: (e as Error).message });
  }
  // A resposta fica salva completa em texto; a versão falada (mais curta) é montada na hora de falar.
  void opts;
  const message = await addMessage(conversationId, 'assistant', reply, { actions: turn.actions });
  return { message, actions: turn.actions, pending: turn.confirmations, debug: lastDebug };
}

export async function startNewConversation(): Promise<void> {
  state.pending = null;
  state.draft = null;
  state.appendingTo = null;
  await newConversation();
}

/* ------------------------------------------------------------------ */

const ACTION_INTENTS = new Set(['registrar_ideia', 'complementar_ideia', 'ver_ideia', 'listar_ideias', 'analisar_ideia', 'aprovar_ideia', 'arquivar_ideia', 'buscar', 'status_projeto', 'abrir_area', 'ajuda', 'cumprimentar', 'criar_projeto_de_ideia', 'preparar_para_claude', 'anotar_informacao']);
/** Intenções que encerram a ideia em construção para tratar de outro assunto. */
const LEAVES_DRAFT = new Set([...ACTION_INTENTS].filter((i) => i !== 'registrar_ideia' && i !== 'complementar_ideia' && i !== 'cumprimentar' && i !== 'anotar_informacao'));
const wordsOf = (t: string) => t.split(/\s+/).filter(Boolean).length;

async function think(raw: string, turn: Turn): Promise<string> {
  if (!raw) return 'Pode falar, Gabriel.';
  const it = await interpret(raw);
  const top = it.top?.intent ?? null;
  lastDebug = { intent: top, score: Number((it.top?.score ?? 0).toFixed(2)), confident: it.confident, ambiguous: it.ambiguous };
  const switching = it.confident && top !== null && ACTION_INTENTS.has(top);

  // 1. Uma pergunta minha está esperando resposta
  if (state.pending) {
    const r = await answerPending(raw, it, turn);
    if (r !== null) return r;
  }

  // 2. Ideia em construção (já salva, sendo completada)
  if (state.draft && Date.now() - state.draft.lastAt > 30 * 60_000) state.draft = null;
  if (state.draft) {
    const d = state.draft;
    if (top === 'cancelar' && it.confident) {
      state.draft = null;
      return d.ideaId ? `Certo, parei de anotar. O que você já contou ficou salvo em "${d.title}"; se quiser, eu arquivo.` : 'Certo, descartei essa explicação.';
    }
    if (top === 'encerrar_explicacao' && it.confident) return finishDraft(turn, false);
    if (top === 'corrigir' && it.confident && d.ideaId) {
      d.observacoes.push(`Correção: ${raw}`);
      d.lastAt = Date.now();
      const out = await turn.act('update_idea', { idea_id: d.ideaId, append_user_info: raw, append_kind: 'correcao', organized_description: organized(d) });
      return out.result.ok ? 'Corrigido. O que você tinha dito antes continua no histórico.' : respond('falha', { erro: out.result.error ?? '' });
    }
    const anotherIdea = top === 'registrar_ideia' && it.confident && /(outra|nova) ideia|ideia (nova|diferente)/.test(it.frame.text) && d.ideaId !== null;
    // "o que você acha?" no meio da explicação fala da ideia que está sendo contada
    const ON_CURRENT: Record<string, PendingThen> = { analisar_ideia: 'analisar', preparar_para_claude: 'preparar', criar_projeto_de_ideia: 'projeto', aprovar_ideia: 'aprovar' };
    if (it.confident && top && ON_CURRENT[top] && d.ideaId && !(await resolveIdea(raw)).hadClue) {
      const id = d.ideaId;
      await finishDraft(turn, true);
      const idea = await getIdea(id);
      if (idea) return doWithIdea(idea, ON_CURRENT[top], null, turn);
    }
    if ((it.confident && top !== null && LEAVES_DRAFT.has(top) && !(top === 'analisar_ideia' && !d.ideaId)) || anotherIdea) {
      const done = await finishDraft(turn, true);
      return done + '\n\n' + (await dispatch(top!, raw, it, turn));
    }
    if (top === 'continuar' && wordsOf(raw) <= 4) return respond('ouvindo_explicacao');
    if ((top === 'confirmar' || top === 'agradecer') && it.confident && wordsOf(raw) <= 3) return 'Pode continuar, ou diga "é isso" quando terminar.';
    return draftStep(raw, turn);
  }

  // 3. Complementos seguidos de uma ideia ("e tem mais...")
  if (state.appendingTo) {
    if (switching || (it.confident && (top === 'cancelar' || top === 'agradecer'))) {
      state.appendingTo = null;
    } else if (top === 'encerrar_explicacao' && it.confident) {
      const id = state.appendingTo;
      state.appendingTo = null;
      const idea = await getIdea(id);
      state.pending = { kind: 'offer_analysis', ideaId: id };
      return `Certo, terminei de anotar em "${idea?.title ?? 'essa ideia'}". Quer que eu faça uma análise agora?`;
    } else if (top !== 'continuar' || wordsOf(raw) > 4) {
      const out = await turn.act('update_idea', { idea_id: state.appendingTo, append_user_info: raw });
      if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
      return `Acrescentei à ideia "${(out.result.data as { title: string }).title}". Pode continuar, ou me diga quando terminar.`;
    } else {
      return respond('ouvindo_explicacao');
    }
  }

  // 4. Intenção nova. Na dúvida, pergunto se entendi certo (uma pergunta só, sobre o palpite mais provável);
  // "A ou B?" fica para quando as duas leituras estão de fato empatadas.
  if (it.ambiguous && it.ranked[1] && Math.abs(it.ranked[0].score - it.ranked[1].score) < 0.03) return askClarify(raw, [it.ranked[0].intent, it.ranked[1].intent]);
  if (!it.confident) {
    if (top && CONFIRM_TEXT[top]) return askConfirm(raw, top, it.ranked[1]?.intent ?? null);
    // "aquele lance do mercado": aponta para algo que já existe, mesmo sem dizer o que fazer
    if (it.frame.existente && wordsOf(raw) >= 3) return askConfirm(raw, 'buscar', 'ver_ideia');
    if (top) return askClarify(raw, [top, it.ranked[1]?.intent ?? 'registrar_ideia']);
    if (wordsOf(raw) >= 6) return askConfirm(raw, it.frame.pergunta ? 'buscar' : 'registrar_ideia', it.frame.pergunta ? 'registrar_ideia' : 'buscar');
    return 'Não entendi, Gabriel. Pode dizer de outro jeito?';
  }
  return dispatch(top!, raw, it, turn);
}

const OPTION_TEXT: Record<string, string> = {
  registrar_ideia: 'registrar isso como ideia nova', complementar_ideia: 'acrescentar isso a uma ideia', ver_ideia: 'abrir uma ideia salva',
  listar_ideias: 'listar suas ideias', analisar_ideia: 'analisar uma ideia', aprovar_ideia: 'aprovar uma ideia', arquivar_ideia: 'arquivar uma ideia',
  buscar: 'procurar algo já salvo', status_projeto: 'ver como está um projeto', abrir_area: 'abrir uma área do app',
};

const CONFIRM_TEXT: Record<string, string> = {
  registrar_ideia: 'Você está começando uma ideia nova, certo?',
  complementar_ideia: 'Isso é um complemento de uma ideia que já existe, certo?',
  ver_ideia: 'Quer abrir uma ideia que já está salva, certo?',
  listar_ideias: 'Quer ver a lista das suas ideias, certo?',
  analisar_ideia: 'Quer minha opinião sobre uma ideia, certo?',
  aprovar_ideia: 'Quer aprovar uma ideia, certo?',
  arquivar_ideia: 'Quer arquivar uma ideia, certo?',
  buscar: 'Quer que eu procure isso no que já está salvo, certo?',
  status_projeto: 'Quer saber como está um projeto, certo?',
  abrir_area: 'Quer que eu abra uma área do app, certo?',
  criar_projeto_de_ideia: 'Quer transformar uma ideia em projeto, certo?',
  preparar_para_claude: 'Quer que eu organize isso num documento para o Claude, certo?',
  anotar_informacao: 'Quer que eu anote essa informação, certo?',
  corrigir: 'Você está corrigindo o que disse antes, certo?',
};

function askConfirm(raw: string, intent: string, alt: string | null): string {
  state.pending = { kind: 'confirm_intent', intent, raw, alt: alt && alt !== intent && CONFIRM_TEXT[alt] ? alt : null };
  return CONFIRM_TEXT[intent];
}

function askClarify(raw: string, intents: string[]): string {
  const opts = [...new Set(intents)].filter((i) => OPTION_TEXT[i]).slice(0, 2);
  if (opts.length < 2) opts.push(opts[0] === 'registrar_ideia' ? 'buscar' : 'registrar_ideia');
  state.pending = { kind: 'clarify', options: opts.map((i) => ({ label: OPTION_TEXT[i] ?? intentLabel(i), intent: i })), raw };
  return respond('pergunta_confusa', { opcao1: OPTION_TEXT[opts[0]], opcao2: OPTION_TEXT[opts[1]] });
}

/* ------------------------------------------------------------------ */

async function dispatch(intent: string, raw: string, it: Interpretation, turn: Turn): Promise<string> {
  switch (intent) {
    case 'cumprimentar':
      return respond('cumprimento');
    case 'agradecer':
      return respond('agradecimento');
    case 'confirmar':
    case 'negar':
      return 'Não tenho nada pendente agora, Gabriel. No que posso ajudar?';
    case 'cancelar':
      return 'Certo, não há nada em andamento.';
    case 'ajuda':
      return 'Por enquanto eu consigo:\n- registrar uma ideia assim que você começa a contar, e ir completando a cada mensagem (diga "é isso" no fim);\n- analisar uma ideia e apontar o que falta e os riscos;\n- aprovar, arquivar, complementar e corrigir ideias;\n- transformar uma ideia em projeto e preparar o documento para o Claude;\n- anotar informações soltas na memória;\n- procurar ideias, projetos e o que já foi salvo;\n- abrir as áreas do app.\nTarefas pela conversa chegam numa próxima fase.';
    case 'papo':
      return respond('fora_do_alcance');
    case 'continuar': {
      const focus = recentFocus();
      if (focus) state.appendingTo = focus;
      return respond('ouvindo_explicacao');
    }
    case 'corrigir': {
      const focus = recentFocus();
      if (!focus) return 'O que você quer corrigir, Gabriel?';
      const idea = await getIdea(focus);
      state.pending = { kind: 'correction', ideaId: focus };
      return `Certo. O que muda em "${idea?.title ?? 'essa ideia'}"?`;
    }
    case 'registrar_ideia': {
      state.draft = newDraft();
      return draftStep(raw, turn);
    }
    case 'complementar_ideia':
      return withIdea(raw, 'complementar', extractAddition(raw), turn);
    case 'ver_ideia':
      return withIdea(raw, 'ver', null, turn);
    case 'analisar_ideia':
      return withIdea(raw, 'analisar', null, turn);
    case 'aprovar_ideia':
      return withIdea(raw, 'aprovar', null, turn);
    case 'arquivar_ideia':
      return withIdea(raw, 'arquivar', null, turn);
    case 'listar_ideias':
      return listIdeasReply(raw, turn);
    case 'buscar':
      return searchReply(raw, turn);
    case 'status_projeto':
      return projectStatusReply(raw, turn);
    case 'abrir_area':
      return openArea(raw, turn);
    case 'encerrar_explicacao':
      return 'Certo, Gabriel.';
    case 'anotar_informacao':
      return noteInfo(raw, turn);
    case 'criar_projeto_de_ideia':
      return withIdea(raw, 'projeto', null, turn);
    case 'preparar_para_claude':
      return withIdea(raw, 'preparar', null, turn);
    default:
      return respond('fora_do_alcance');
  }
}

/* ---------------- Ideias ---------------- */

/** Uma mensagem entra na ideia em construção: cria a ideia assim que houver assunto, depois só completa. */
async function draftStep(raw: string, turn: Turn): Promise<string> {
  const d = state.draft!;
  d.lastAt = Date.now();
  const content = stripRequest(ideaContent(raw));
  if (!d.ideaId) {
    d.raws.push(raw);
    if (wordsOf(content) < 3 && d.raws.length === 1) return 'Pode contar.';
    const all = stripRequest(d.raws.map(ideaContent).filter(Boolean).join(' '));
    absorb(d, all, { first: true });
    const existing = await listIdeas();
    const similar = existing
      .map((i) => ({ i, s: relevance(all, `${i.title} ${i.original_description}`) }))
      .filter((x) => x.s >= 0.5)
      .sort((a, b) => b.s - a.s)[0];
    if (similar) {
      state.pending = { kind: 'similar_idea', raw: d.raws.join('\n'), content: all, similarId: similar.i.id };
      return respond('ideia_parecida', { outra: similar.i.title, data: shortDate(similar.i.created_at) });
    }
    const made = await createDraftIdea(d, turn);
    if (made) return made;
    const q = nextQuestion(d);
    return `Anotei: ${d.title}. ${q ?? 'Pode continuar.'}`;
  }
  d.raws.push(raw);
  const filled = absorb(d, content || raw);
  const out = await turn.act('update_idea', { idea_id: d.ideaId, append_user_info: raw, organized_description: organized(d), ...(d.tipo ? { category: d.tipo } : {}) });
  if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
  const q = nextQuestion(d);
  return q ? `${ack(d, filled)} ${q}` : ack(d, filled);
}

/** Cria o registro da ideia em construção. Devolve uma mensagem só se deu erro. */
async function createDraftIdea(d: IdeaDraft, turn: Turn): Promise<string | null> {
  d.title = truncate(titleFrom(d.proposta ?? ''), 120);
  const out = await turn.act('create_idea', {
    title: d.title,
    original_description: d.raws.join('\n'),
    organized_description: organized(d),
    category: d.tipo ?? undefined,
  });
  if (!out.result.ok) { state.draft = null; return respond('falha', { erro: out.result.error ?? '' }); }
  const idea = out.result.data as { id: string; title: string };
  d.ideaId = idea.id;
  d.title = idea.title;
  setFocus(idea.id);
  return null;
}

/** Fim da explicação ("é isso"), ou mudança de assunto (quiet). */
async function finishDraft(turn: Turn, quiet: boolean): Promise<string> {
  const d = state.draft!;
  state.draft = null;
  if (!d.ideaId) {
    if (!d.raws.length || !d.proposta) return quiet ? '' : 'Não cheguei a anotar nada, Gabriel. Pode me contar a ideia?';
    const err = await createDraftIdea(d, turn);
    if (err) return err;
  }
  if (quiet) return `Salvei a ideia "${d.title}".`;
  state.pending = { kind: 'offer_analysis', ideaId: d.ideaId! };
  return `Pronto. Organizei "${d.title}" assim:\n${organized(d)}\nQuer que eu faça uma análise agora?`;
}

async function createIdeaNow(original: string, content: string, turn: Turn): Promise<string> {
  const category = findCategory(content);
  const proposal = content.charAt(0).toUpperCase() + content.slice(1);
  const out = await turn.act('create_idea', {
    title: truncate(titleFrom(content), 120),
    original_description: original,
    organized_description: `${category ? `Tipo: ${category}\n` : ''}Proposta: ${proposal}`,
    category: category ?? undefined,
  });
  if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
  const idea = out.result.data as { id: string; title: string };
  setFocus(idea.id);
  state.pending = { kind: 'offer_analysis', ideaId: idea.id };
  return respond('ideia_registrada', { titulo: idea.title });
}

/** Parte nova num pedido de complemento ("acrescenta na ideia X que vai ter cupom" → "vai ter cupom"). */
function extractAddition(raw: string): string | null {
  const m = raw.match(/\b(?:que|:)\s+(.+)$/i);
  if (m && wordsOf(m[1]) >= 2) return m[1].trim();
  return null;
}

async function withIdea(raw: string, then: PendingThen, extra: string | null, turn: Turn): Promise<string> {
  const ref = await resolveIdea(raw);
  if (ref.fromFocus) return doWithIdea(ref.ideas[0], then, extra, turn);
  if (!ref.hadClue) {
    const focus = recentFocus();
    const idea = focus ? await getIdea(focus) : null;
    if (idea) {
      state.pending = { kind: 'confirm_ref', ideaId: idea.id, then, extra };
      return respond('confirmar_referencia', { titulo: idea.title, data: shortDate(idea.created_at) });
    }
    state.pending = { kind: 'which_idea', then, extra };
    return 'De qual ideia você está falando, Gabriel?';
  }
  if (!ref.ideas.length) return respond('nao_encontrado');
  if (ref.ideas.length === 1) {
    const idea = ref.ideas[0];
    state.pending = { kind: 'confirm_ref', ideaId: idea.id, then, extra };
    return respond('confirmar_referencia', { titulo: idea.title, data: shortDate(idea.created_at) });
  }
  const list = ref.ideas.slice(0, 4);
  state.pending = { kind: 'choose_ref', ideaIds: list.map((i) => i.id), then, extra };
  return `Encontrei ${list.length} ideias:\n${list.map((i, n) => `${n + 1}. ${i.title} (${shortDate(i.created_at)})`).join('\n')}\nQual delas?`;
}

async function doWithIdea(idea: Idea, then: PendingThen, extra: string | null, turn: Turn): Promise<string> {
  setFocus(idea.id);
  switch (then) {
    case 'ver': {
      const out = await turn.act('open_section', { section: 'ideas', record_id: idea.id });
      if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
      const summary = idea.organized_description ?? idea.original_description;
      return `Aqui está "${idea.title}" (${label(idea.status).toLowerCase()}, registrada ${shortDate(idea.created_at)}).\n${truncate(summary, 280)}`;
    }
    case 'analisar':
      return analyzeReply(idea, turn);
    case 'aprovar': {
      if (idea.status === 'aprovada') return `"${idea.title}" já está aprovada, Gabriel.`;
      const a = analyzeIdea(idea, await listIdeas());
      if (a.generalMissing >= 3) {
        const missing = a.open.filter((o) => ['Público', 'Problema', 'Monetização', 'Diferencial', 'Primeira versão', 'Esforço'].includes(o.criterion)).map((o) => o.criterion.toLowerCase());
        const reason = `ainda faltam definir ${joinList(missing)}`;
        state.pending = { kind: 'disagree', ideaId: idea.id, action: 'aprovar', round: 1, reason };
        return respond('discordar', { motivo: reason, alternativa: 'respondermos essas perguntas antes e aprovar em seguida' });
      }
      return approve(idea, turn, null);
    }
    case 'arquivar': {
      const out = await turn.act('archive_idea', { idea_id: idea.id });
      if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
      return `Arquivei "${idea.title}". Dá para restaurar quando quiser.`;
    }
    case 'complementar': {
      if (!extra) {
        state.appendingTo = idea.id;
        return `Pode falar o que entra em "${idea.title}".`;
      }
      const out = await turn.act('update_idea', { idea_id: idea.id, append_user_info: extra });
      if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
      return `Acrescentei à ideia "${idea.title}".`;
    }
    case 'projeto': {
      if (idea.project_id) return `"${idea.title}" já virou projeto, Gabriel. Quer que eu abra?`;
      state.pending = { kind: 'confirm_project', ideaId: idea.id };
      const a = analyzeIdea(idea, await listIdeas());
      const aviso = a.generalMissing >= 3 ? ` Antes, um aviso: ainda faltam definir ${joinList(a.open.slice(0, 3).map((o) => o.criterion.toLowerCase()))}.` : '';
      return `Posso criar o projeto "${idea.title}" a partir dessa ideia. Ela passa para "em desenvolvimento".${aviso} Crio?`;
    }
    case 'preparar':
      return prepareForClaude(idea, turn);
  }
}

/** Documento organizado para o Gabriel copiar e mandar ao Claude (o fluxo com o Claude continua manual). */
async function prepareForClaude(idea: Idea, turn: Turn): Promise<string> {
  const a = analyzeIdea(idea, await listIdeas());
  const content = [
    `# ${idea.title}`,
    '',
    '## O que o Gabriel disse',
    idea.original_description,
    '',
    '## Organização',
    idea.organized_description ?? '(ainda não organizada)',
    '',
    '## O que ainda precisa ser definido',
    a.open.length ? a.open.map((o) => `- ${o.criterion}: ${o.question}`).join('\n') : '- Nada em aberto nos critérios do MASON.',
    '',
    '## Pedido para o Claude',
    'Com base na ideia acima, proponha a arquitetura, as telas e um plano da primeira versão. Pergunte o que estiver em aberto antes de decidir por conta própria.',
  ].join('\n');
  const out = await turn.act('save_document', { title: `Prompt para o Claude: ${idea.title}`, kind: 'prompt_claude', department: 'development', content, idea_id: idea.id });
  if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
  await turn.act('open_section', { section: 'development' });
  const falta = a.open.length ? ` Deixei marcado o que ainda está em aberto: ${joinList(a.open.slice(0, 3).map((o) => o.criterion.toLowerCase()))}.` : '';
  return `Organizei "${idea.title}" num documento para o Claude, em Desenvolvimento. É só copiar e enviar.${falta}`;
}

/** "Anota que o cliente paga dia 10": vira uma anotação na Memória, com a origem "usuário". */
async function noteInfo(raw: string, turn: Turn): Promise<string> {
  const content = raw.replace(/^\s*(mason[,\s]+)?(anota|anote|guarda|guarde|registra|registre|salva|salve|lembra|lembre)( essa informa[cç][aã]o| isso)?( para mim| pra mim)?( que|:)?\s*/i, '').trim();
  if (wordsOf(content) < 2) {
    state.pending = null;
    return 'Pode falar, Gabriel. O que eu anoto?';
  }
  const out = await turn.act('save_memory', { kind: 'fato', source: 'usuario', content, subject: truncate(content, 60) });
  if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
  return 'Anotado na memória.';
}

async function analyzeReply(idea: Idea, turn: Turn): Promise<string> {
  const a = analyzeIdea(idea, await listIdeas());
  const out = await turn.act('update_idea', { idea_id: idea.id, ai_suggestions: a.text });
  const pontos = a.covered.length ? `já está definido ${joinList(a.covered.map((c) => c.toLowerCase()))}` : 'a proposta ainda está só no conceito, sem pontos definidos';
  const riscos = a.open.length ? joinList(a.open.slice(0, 3).map((o) => o.criterion.toLowerCase())) : 'nenhum critério em aberto';
  const validar = (a.open[0] ?? a.risks[0])?.question.replace(/\?$/, '').toLowerCase() ?? 'se o público realmente precisa disso';
  let text = respond('analise', { pontos_fortes: pontos, riscos, validar });
  if (a.similar.length) text += ` Ela também se parece com "${a.similar[0].title}".`;
  text += out.result.ok ? ' A análise completa ficou salva na ideia.' : ` Não consegui salvar a análise: ${out.result.error}.`;
  return text;
}

async function approve(idea: Idea, turn: Turn, disagreement: string | null): Promise<string> {
  const out = await turn.act('update_idea', { idea_id: idea.id, status: 'aprovada' });
  if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
  if (disagreement) {
    await turn.act('save_memory', {
      kind: 'decisao', source: 'decisao_confirmada', subject: idea.title,
      content: `Gabriel aprovou "${idea.title}" apesar do aviso do MASON: ${disagreement}.`,
    });
    return respond('cumprir_apos_discordar');
  }
  return `Feito, Gabriel. "${idea.title}" está aprovada.`;
}

async function listIdeasReply(raw: string, turn: Turn): Promise<string> {
  const f = fold(raw);
  let ideas = await listIdeas({ includeArchived: /arquivad/.test(f) });
  let what = 'registradas';
  if (/aprovad/.test(f)) { ideas = ideas.filter((i) => i.status === 'aprovada'); what = 'aprovadas'; }
  else if (/parad|nova|analis/.test(f)) { ideas = ideas.filter((i) => i.status === 'nova' || i.status === 'em_analise'); what = 'aguardando análise'; }
  else if (/arquivad/.test(f)) { ideas = ideas.filter((i) => i.status === 'arquivada'); what = 'arquivadas'; }
  await turn.act('open_section', { section: 'ideas' });
  if (!ideas.length) return `Não há ideias ${what} no momento.`;
  const shown = ideas.slice(0, 8);
  return `Você tem ${ideas.length} ideia${ideas.length > 1 ? 's' : ''} ${what}:\n${shown.map((i) => `- ${i.title} (${label(i.status).toLowerCase()})`).join('\n')}${ideas.length > 8 ? '\nAs demais estão na Central de ideias.' : ''}`;
}

/* ---------------- Busca, projetos, navegação ---------------- */

async function searchReply(raw: string, turn: Turn): Promise<string> {
  const subject = subjectOf(raw.replace(/\b(procura|busca|acha|encontra)\b/gi, ''));
  if (!subject) return 'O que você quer que eu procure, Gabriel?';
  const out = await turn.act('search_memory', { query: subject });
  if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
  const d = out.result.data as { memories: { content: string }[]; ideas: { title: string; id: string }[]; projects: { name: string }[]; documents: { title: string }[] };
  const parts: string[] = [];
  if (d.ideas.length) parts.push(`ideias: ${d.ideas.map((i) => `"${i.title}"`).join(', ')}`);
  if (d.projects.length) parts.push(`projetos: ${d.projects.map((p) => `"${p.name}"`).join(', ')}`);
  if (d.documents.length) parts.push(`documentos: ${d.documents.map((x) => `"${x.title}"`).join(', ')}`);
  if (d.memories.length) parts.push(`anotações: ${d.memories.slice(0, 3).map((m) => truncate(m.content, 80)).join(' / ')}`);
  if (!parts.length) return respond('nao_encontrado');
  if (d.ideas.length === 1) setFocus(d.ideas[0].id);
  return `Sobre "${subject}", encontrei ${parts.join('; ')}.`;
}

async function projectStatusReply(raw: string, turn: Turn): Promise<string> {
  const subject = subjectOf(raw);
  const out = await turn.act('find_project', subject ? { query: subject } : {});
  if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
  const d = out.result.data as { count?: number; projects?: { name: string }[]; project?: { name: string; stage: string; status: string }; tasks?: { status: string }[] };
  if (d.project) {
    const open = d.tasks?.filter((t) => t.status !== 'concluida').length ?? 0;
    return `"${d.project.name}" está na etapa ${label(d.project.stage).toLowerCase()} (${label(d.project.status).toLowerCase()}), com ${open} tarefa${open === 1 ? '' : 's'} em aberto.`;
  }
  if (!d.count) return subject ? respond('nao_encontrado') : 'Ainda não há projetos cadastrados.';
  return `Encontrei ${d.count} projetos: ${d.projects!.map((p) => `"${p.name}"`).join(', ')}. Qual deles?`;
}

async function openArea(raw: string, turn: Turn): Promise<string> {
  const id = findSection(raw);
  if (!id) {
    state.pending = { kind: 'which_area' };
    return 'Qual área, Gabriel? Ideias, desenvolvimento, projetos, memória ou configurações?';
  }
  const out = await turn.act('open_section', { section: id });
  if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
  return respond('area_aberta', { area: sectionById(id)?.title ?? id });
}

/* ---------------- Respostas a perguntas pendentes ---------------- */

/** Devolve null quando a mensagem não responde a pergunta (é um assunto novo). */
async function answerPending(raw: string, it: Interpretation, turn: Turn): Promise<string | null> {
  const p = state.pending!;
  const top = it.top?.intent;
  const yes = top === 'confirmar' || /^(e essa|essa mesma|essa|isso|sim|pode)\b/.test(fold(raw));
  const no = top === 'negar' && !yes;
  const cancel = top === 'cancelar';
  const newTopic = it.confident && top !== undefined && ACTION_INTENTS.has(top);
  const drop = () => { state.pending = null; return null; };

  switch (p.kind) {
    case 'confirm_intent': {
      if (yes) {
        state.pending = null;
        await learn(p.raw, p.intent, 'confirmou_pergunta').catch(() => undefined);
        const original = await interpret(p.raw);
        return dispatch(p.intent, p.raw, original, turn);
      }
      if (cancel) { state.pending = null; return 'Certo, deixei pra lá.'; }
      if (no && wordsOf(raw) <= 4) {
        if (p.alt) { state.pending = { kind: 'confirm_intent', intent: p.alt, raw: p.raw, alt: null }; return `Entendi errado. ${CONFIRM_TEXT[p.alt]}`; }
        state.pending = null;
        return 'Entendi errado, desculpe. O que você quer fazer?';
      }
      return drop();
    }
    case 'confirm_project': {
      if (yes) {
        state.pending = null;
        const idea = await getIdea(p.ideaId);
        if (!idea) return respond('nao_encontrado');
        const out = await turn.act('create_project', { name: idea.title, description: idea.organized_description ?? idea.original_description, origin_idea_id: idea.id });
        if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
        return `Feito. Criei o projeto "${idea.title}" e vinculei à ideia. Quer que eu prepare o documento para o Claude?`;
      }
      if (no || cancel) { state.pending = null; return 'Certo, não criei.'; }
      return drop();
    }
    case 'clarify': {
      const f = fold(raw);
      const byNumber = /\b(1|primeira|primeiro)\b/.test(f) ? 0 : /\b(2|segunda|segundo)\b/.test(f) ? 1 : -1;
      let choice = byNumber >= 0 ? p.options[byNumber] : p.options.find((o) => relevance(raw, o.label) >= 0.5 || o.intent === top);
      if (!choice && cancel) { state.pending = null; return 'Certo, deixei pra lá.'; }
      if (!choice) return drop();
      state.pending = null;
      await learn(p.raw, choice.intent, 'escolheu_opcao').catch(() => undefined);
      const original = await interpret(p.raw);
      return dispatch(choice.intent, p.raw, original, turn);
    }
    case 'confirm_ref': {
      if (yes) {
        state.pending = null;
        const idea = await getIdea(p.ideaId);
        return idea ? doWithIdea(idea, p.then, p.extra, turn) : respond('nao_encontrado');
      }
      if (no) { state.pending = { kind: 'which_idea', then: p.then, extra: p.extra }; return 'Certo. De qual ideia você está falando?'; }
      if (cancel) { state.pending = null; return 'Certo, deixei pra lá.'; }
      return drop();
    }
    case 'choose_ref': {
      const ideas = (await Promise.all(p.ideaIds.map(getIdea))).filter(Boolean) as Idea[];
      const pick = pickFromList(raw, ideas);
      if (pick) { state.pending = null; return doWithIdea(pick, p.then, p.extra, turn); }
      if (cancel || no) { state.pending = null; return 'Certo, deixei pra lá.'; }
      if (newTopic) return drop();
      return 'Não identifiquei qual. Pode dizer o número?';
    }
    case 'which_idea': {
      if (cancel) { state.pending = null; return 'Certo, deixei pra lá.'; }
      const ref = await resolveIdea(raw);
      if (!ref.ideas.length) { if (newTopic) return drop(); return respond('nao_encontrado'); }
      state.pending = null;
      if (ref.ideas.length === 1) return doWithIdea(ref.ideas[0], p.then, p.extra, turn);
      const list = ref.ideas.slice(0, 4);
      state.pending = { kind: 'choose_ref', ideaIds: list.map((i) => i.id), then: p.then, extra: p.extra };
      return `Encontrei ${list.length} ideias:\n${list.map((i, n) => `${n + 1}. ${i.title} (${shortDate(i.created_at)})`).join('\n')}\nQual delas?`;
    }
    case 'similar_idea': {
      const f = fold(raw);
      if (/\b(nova|outra|separada|diferente)\b/.test(f)) {
        state.pending = null;
        if (state.draft && !state.draft.ideaId) {
          const err = await createDraftIdea(state.draft, turn);
          return err ?? `Certo, registrei como nova: "${state.draft.title}". Pode continuar.`;
        }
        return createIdeaNow(p.raw, p.content, turn);
      }
      if (/\b(complement|mesma|junta|acrescenta|adiciona|essa)/.test(f) || yes) {
        state.pending = null;
        const out = await turn.act('update_idea', { idea_id: p.similarId, append_user_info: p.raw });
        if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
        setFocus(p.similarId);
        // o resto da explicação continua entrando na ideia que já existia
        if (state.draft) { state.draft = null; state.appendingTo = p.similarId; }
        return `Acrescentei à ideia "${(out.result.data as { title: string }).title}".`;
      }
      if (cancel || no) { state.pending = null; state.draft = null; return 'Certo, não salvei.'; }
      if (newTopic) { state.draft = null; return drop(); }
      return 'É uma ideia nova ou um complemento da outra?';
    }
    case 'offer_analysis': {
      if (yes || top === 'analisar_ideia') {
        state.pending = null;
        const idea = await getIdea(p.ideaId);
        return idea ? analyzeReply(idea, turn) : respond('nao_encontrado');
      }
      if (no || cancel || top === 'agradecer') { state.pending = null; return top === 'agradecer' ? respond('agradecimento') : 'Certo. Fica salva para depois.'; }
      if (newTopic || (it.confident && top !== 'continuar')) return drop();
      // continuou explicando: entra como complemento da ideia recém-registrada
      state.pending = null;
      state.appendingTo = p.ideaId;
      if (top === 'continuar' && wordsOf(raw) <= 4) return respond('ouvindo_explicacao');
      const out = await turn.act('update_idea', { idea_id: p.ideaId, append_user_info: raw });
      if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
      return `Acrescentei à ideia "${(out.result.data as { title: string }).title}". Pode continuar, ou me diga quando terminar.`;
    }
    case 'disagree': {
      const insist = yes || top === 'aprovar_ideia';
      if (insist) {
        const idea = await getIdea(p.ideaId);
        if (!idea) { state.pending = null; return respond('nao_encontrado'); }
        if (p.round === 1) {
          state.pending = { ...p, round: 2 };
          return respond('discordar_insistencia', { motivo: p.reason });
        }
        state.pending = null;
        return approve(idea, turn, p.reason);
      }
      if (no || cancel) { state.pending = null; return 'Certo, senhor. A ideia continua como está.'; }
      return drop();
    }
    case 'correction': {
      if (cancel) { state.pending = null; return 'Certo, nada foi alterado.'; }
      state.pending = null;
      const out = await turn.act('update_idea', { idea_id: p.ideaId, append_user_info: raw, append_kind: 'correcao' });
      if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
      return `Registrei a correção em "${(out.result.data as { title: string }).title}". O texto anterior continua no histórico.`;
    }
    case 'which_area': {
      const id = findSection(raw);
      if (!id) { if (cancel || newTopic) return drop(); return 'Não reconheci essa área. Pode repetir?'; }
      state.pending = null;
      const out = await turn.act('open_section', { section: id });
      return out.result.ok ? respond('area_aberta', { area: sectionById(id)?.title ?? id }) : respond('falha', { erro: out.result.error ?? '' });
    }
  }
}
