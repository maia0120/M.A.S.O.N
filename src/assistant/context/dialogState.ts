/**
 * Gerenciador de contexto: o assunto em foco e a pergunta que o MASON está esperando ver respondida.
 * Vive na memória enquanto o app está aberto.
 */
export type PendingThen = 'ver' | 'analisar' | 'aprovar' | 'arquivar' | 'complementar';

export type Pending =
  /** D7: mensagem confusa, perguntou entre duas leituras. */
  | { kind: 'clarify'; options: { label: string; intent: string }[]; raw: string }
  /** D11: confirma a referência antes de usar. */
  | { kind: 'confirm_ref'; ideaId: string; then: PendingThen; extra: string | null }
  /** Várias correspondências: Gabriel escolhe uma. */
  | { kind: 'choose_ref'; ideaIds: string[]; then: PendingThen; extra: string | null }
  /** Ideia parecida com outra já salva: nova ou complemento? */
  | { kind: 'similar_idea'; raw: string; content: string; similarId: string }
  /** Ofereceu análise depois de registrar. */
  | { kind: 'offer_analysis'; ideaId: string }
  /** D4/D4a: discordou; conta as insistências do Gabriel. */
  | { kind: 'disagree'; ideaId: string; action: 'aprovar'; round: 1 | 2; reason: string }
  /** Pediu o que corrigir na última ideia. */
  | { kind: 'correction'; ideaId: string }
  /** Perguntou qual área abrir. */
  | { kind: 'which_area' }
  /** Perguntou qual ideia (sem nenhuma pista). */
  | { kind: 'which_idea'; then: PendingThen; extra: string | null };

export interface DialogState {
  focusIdeaId: string | null;
  focusAt: number;
  pending: Pending | null;
  /** Explicação de ideia em andamento (várias mensagens). */
  collecting: { raws: string[]; startedAt: number } | null;
  /** Complementos seguidos à ideia em foco ("e tem mais..."). */
  appendingTo: string | null;
}

export const state: DialogState = { focusIdeaId: null, focusAt: 0, pending: null, collecting: null, appendingTo: null };

export function setFocus(ideaId: string | null) {
  state.focusIdeaId = ideaId;
  state.focusAt = Date.now();
}

/** Foco recente (até 30 min) vale como "essa ideia". */
export function recentFocus(): string | null {
  return state.focusIdeaId && Date.now() - state.focusAt < 30 * 60_000 ? state.focusIdeaId : null;
}

export function resetDialog() {
  state.focusIdeaId = null;
  state.focusAt = 0;
  state.pending = null;
  state.collecting = null;
  state.appendingTo = null;
}
