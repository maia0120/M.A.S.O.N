import { toolByName } from '../tools/registry';
import { validateArgs, type ToolResult } from '../tools/toolkit';
import { nav } from '../../interface/navigation/navStore';
import { addMessage, currentConversationId } from '../../memory/history/conversationRepo';
import { uid } from '../../core/util';

/**
 * Executor de ferramentas — independente de qualquer IA.
 * Valida os parâmetros, trata erros, segura ações que exigem confirmação e devolve o resultado real.
 */
export interface ActionRecord {
  tool: string;
  ok: boolean;
  summary: string;
}

export interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  question: string;
}

export interface ExecOutcome {
  result: ToolResult;
  record: ActionRecord;
  pending?: PendingAction;
}

const pendingActions = new Map<string, PendingAction>();

export async function execute(name: string, rawArgs: unknown): Promise<ExecOutcome> {
  const tool = toolByName(name);
  const done = (result: ToolResult, pending?: PendingAction): ExecOutcome => ({
    result, pending,
    record: { tool: name, ok: result.ok, summary: result.summary ?? result.error ?? (result.ok ? 'ok' : 'falhou') },
  });
  if (!tool) return done({ ok: false, error: `Ação desconhecida: ${name}` });
  let args: Record<string, unknown>;
  try {
    args = validateArgs(tool, rawArgs);
  } catch (e) {
    return done({ ok: false, error: (e as Error).message });
  }
  if (tool.confirm) {
    const pending: PendingAction = { id: uid(), tool: name, args, question: await tool.confirm(args) };
    pendingActions.set(pending.id, pending);
    return done({ ok: false, data: { status: 'aguardando_confirmacao' }, summary: 'Aguardando sua confirmação' }, pending);
  }
  try {
    return done(await tool.run(args, { section: nav.get().section }));
  } catch (e) {
    return done({ ok: false, error: (e as Error).message });
  }
}

/** Executa uma ação que o usuário confirmou tocando no botão. */
export async function confirmPending(id: string): Promise<ActionRecord> {
  const p = pendingActions.get(id);
  if (!p) return { tool: '?', ok: false, summary: 'Essa confirmação expirou. Peça de novo.' };
  pendingActions.delete(id);
  const tool = toolByName(p.tool)!;
  let result: ToolResult;
  try {
    result = await tool.run(p.args, { section: nav.get().section });
  } catch (e) {
    result = { ok: false, error: (e as Error).message };
  }
  const record = { tool: p.tool, ok: result.ok, summary: result.summary ?? result.error ?? '' };
  await addMessage(await currentConversationId(), 'assistant', result.ok ? `Confirmado. ${record.summary}.` : `Não foi possível: ${record.summary}`, { actions: [record] });
  return record;
}

export function cancelPending(id: string) {
  pendingActions.delete(id);
}
