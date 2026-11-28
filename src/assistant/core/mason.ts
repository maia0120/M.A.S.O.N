import { addMessage, currentConversationId, newConversation } from '../../memory/history/conversationRepo';
import { nav } from '../../interface/navigation/navStore';
import { sectionById } from '../../interface/navigation/sections';
import { getIdea, listIdeas } from '../../work/ideas/ideasRepo';
import { analyzeIdea } from '../../work/ideas/analysis';
import { relevance, truncate } from '../../core/util';
import { label, type ChatMessage, type Idea } from '../../core/types';
import { interpret, intentLabel, type Interpretation } from '../intent/interpreter';
import { fold } from '../intent/normalize';
import { ideaContent, titleFrom, findCategory, findSection, subjectOf } from '../intent/entities';
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
  state.collecting = null;
  state.appendingTo = null;
  await newConversation();
}

/* ------------------------------------------------------------------ */

const ACTION_INTENTS = new Set(['registrar_ideia', 'complementar_ideia', 'ver_ideia', 'listar_ideias', 'analisar_ideia', 'aprovar_ideia', 'arquivar_ideia', 'buscar', 'status_projeto', 'abrir_area', 'ajuda', 'cumprimentar']);
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

  // 2. Explicação de ideia em andamento
  if (state.collecting) {
    if (top === 'cancelar' && it.confident) {
      state.collecting = null;
      return 'Certo, descartei essa explicação.';
    }
    if (switching && top !== 'registrar_ideia') {
      const done = await finishCollecting(turn);
      return done + '\n\n' + (await dispatch(top!, raw, it, turn));
    }
    if (top !== 'confirmar' || !it.confident) state.collecting.raws.push(raw);
    const all = state.collecting.raws.map(ideaContent).join(' ');
    if (it.msg.trailing || top === 'continuar' || wordsOf(all) < 4) return respond('ouvindo_explicacao');
    return finishCollecting(turn);
  }

  // 3. Complementos seguidos de uma ideia ("e tem mais...")
  if (state.appendingTo) {
    if (switching || (it.confident && (top === 'cancelar' || top === 'agradecer'))) {
      state.appendingTo = null;
    } else if (top !== 'continuar' || wordsOf(raw) > 4) {
      const out = await turn.act('update_idea', { idea_id: state.appendingTo, append_user_info: raw });
      if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
      return `Acrescentei à ideia "${(out.result.data as { title: string }).title}". Pode continuar, ou me diga quando terminar.`;
    } else {
      return respond('ouvindo_explicacao');
    }
  }

  // 4. Intenção nova
  if (it.ambiguous && it.ranked[1]) return askClarify(raw, [it.ranked[0].intent, it.ranked[1].intent]);
  if (!it.confident) {
    if (top) return askClarify(raw, [top, it.ranked[1]?.intent ?? 'registrar_ideia']);
    if (wordsOf(raw) >= 6) return askClarify(raw, ['registrar_ideia', 'buscar']);
    return 'Não entendi, Gabriel. Pode dizer de outro jeito?';
  }
  return dispatch(top!, raw, it, turn);
}

const OPTION_TEXT: Record<string, string> = {
  registrar_ideia: 'registrar isso como ideia nova', complementar_ideia: 'acrescentar isso a uma ideia', ver_ideia: 'abrir uma ideia salva',
  listar_ideias: 'listar suas ideias', analisar_ideia: 'analisar uma ideia', aprovar_ideia: 'aprovar uma ideia', arquivar_ideia: 'arquivar uma ideia',
  buscar: 'procurar algo já salvo', status_projeto: 'ver como está um projeto', abrir_area: 'abrir uma área do app',
};

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
      return 'Por enquanto eu consigo:\n- registrar e organizar ideias, mesmo explicadas em várias mensagens;\n- analisar uma ideia e apontar o que falta e os riscos;\n- aprovar, arquivar e complementar ideias;\n- procurar ideias, projetos e o que já foi salvo;\n- abrir as áreas do app.\nProjetos, tarefas e documentos pela conversa chegam na próxima fase.';
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
      const content = ideaContent(raw);
      if (wordsOf(content) < 3 || it.msg.trailing) {
        state.collecting = { raws: [raw], startedAt: Date.now() };
        return respond('ouvindo_explicacao');
      }
      return registerIdea([raw], turn);
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
    default:
      return respond('fora_do_alcance');
  }
}

/* ---------------- Ideias ---------------- */

async function finishCollecting(turn: Turn): Promise<string> {
  const raws = state.collecting?.raws ?? [];
  state.collecting = null;
  return registerIdea(raws, turn);
}

async function registerIdea(raws: string[], turn: Turn): Promise<string> {
  const content = raws.map(ideaContent).filter(Boolean).join(' ');
  if (!content.trim()) return 'Não captei a ideia em si, Gabriel. Pode me contar?';
  const existing = await listIdeas();
  const similar = existing
    .map((i) => ({ i, s: relevance(content, `${i.title} ${i.original_description}`) }))
    .filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s)[0];
  if (similar) {
    state.pending = { kind: 'similar_idea', raw: raws.join('\n'), content, similarId: similar.i.id };
    return respond('ideia_parecida', { outra: similar.i.title, data: shortDate(similar.i.created_at) });
  }
  return createIdeaNow(raws.join('\n'), content, turn);
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
  }
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
    case 'clarify': {
      const f = fold(raw);
      const byNumber = /\b(1|primeira|primeiro)\b/.test(f) ? 0 : /\b(2|segunda|segundo)\b/.test(f) ? 1 : -1;
      let choice = byNumber >= 0 ? p.options[byNumber] : p.options.find((o) => relevance(raw, o.label) >= 0.5 || o.intent === top);
      if (!choice && cancel) { state.pending = null; return 'Certo, deixei pra lá.'; }
      if (!choice) return drop();
      state.pending = null;
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
      if (/\b(nova|outra|separada|diferente)\b/.test(f)) { state.pending = null; return createIdeaNow(p.raw, p.content, turn); }
      if (/\b(complement|mesma|junta|acrescenta|adiciona|essa)/.test(f) || yes) {
        state.pending = null;
        const out = await turn.act('update_idea', { idea_id: p.similarId, append_user_info: p.raw });
        if (!out.result.ok) return respond('falha', { erro: out.result.error ?? '' });
        setFocus(p.similarId);
        return `Acrescentei à ideia "${(out.result.data as { title: string }).title}".`;
      }
      if (cancel || no) { state.pending = null; return 'Certo, não salvei.'; }
      if (newTopic) return drop();
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
