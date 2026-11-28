import { useSyncExternalStore } from 'react';
import { getRecognizer, LISTEN_ERROR_TEXT, type Alternative } from './speech-recognition/recognizer';
import { speak as ttsSpeak, stopSpeaking } from './speech-synthesis/speaker';
import { loadVoicePrefs, type VoicePrefs } from './voicePrefs';
import { forVoice } from '../assistant/core/responses';
import { core, type CoreMode } from '../interface/components/coreState';
import { recordDiag } from './diagnostics';

/**
 * Máquina de estados ÚNICA da conversa (P0 da auditoria 0.5.0, decisão D35).
 *
 *   IDLE ─ouvir→ LISTENING ─fim da fala→ TRANSCRIBING ─texto→ PROCESSING → RESPONDING → SPEAKING
 *     ↑                                                                                   │
 *     └──── encerrar ── WAITING_FOR_USER ←── (controlada / botão) ────────────────────────┘
 *                         (contínua: volta a LISTENING sozinho)          ERROR ← falhas
 *
 * Garantias:
 * - uma sessão por vez: cada escuta/turno tem um número; resultados de sessões antigas são descartados
 *   (nada de resposta duplicada nem fala depois de encerrar);
 * - nunca microfone e fala juntos: ouvir sempre para a fala antes, e a fala só começa depois da escuta terminar;
 * - nada preso: escuta com limite de 30 s, processamento 15 s, fala com limite pelo tamanho do texto;
 * - o microfone só reabre sozinho no modo contínuo.
 */
export type ConvState =
  | 'IDLE' | 'REQUESTING_PERMISSION' | 'LISTENING' | 'TRANSCRIBING' | 'PROCESSING'
  | 'RESPONDING' | 'SPEAKING' | 'WAITING_FOR_USER' | 'ERROR';

export type ListenSource = 'button' | 'continue' | 'wake' | 'auto';

export interface ProcessResult {
  reply: string;
  /** Há uma confirmação na tela (ex.: exclusão): não reabrir o microfone. */
  needsConfirmation: boolean;
  debug?: { intent: string | null; score: number; confident: boolean; ambiguous: boolean };
}

export interface ConvSnapshot {
  state: ConvState;
  partial: string;
  notice: string | null;
  mode: VoicePrefs['mode'];
}

type Processor = (text: string, meta: { fromVoice: boolean }) => Promise<ProcessResult>;
type Reviewer = (text: string, alternatives: Alternative[]) => void;

const CONTINUE_PROMPTS = ['Quer continuar?', 'Mais alguma coisa, Gabriel?', 'Posso ajudar em mais algo?', 'Quer seguir com isso?'];
const PROCESS_TIMEOUT_MS = 15_000;

const MODE_OF: Record<ConvState, CoreMode> = {
  IDLE: 'idle', REQUESTING_PERMISSION: 'waiting', LISTENING: 'listening', TRANSCRIBING: 'transcribing',
  PROCESSING: 'thinking', RESPONDING: 'thinking', SPEAKING: 'speaking', WAITING_FOR_USER: 'waiting', ERROR: 'error',
};

/** Transições permitidas — qualquer outra é ignorada (e registrada no console). */
const ALLOWED: Record<ConvState, ConvState[]> = {
  IDLE: ['LISTENING', 'PROCESSING', 'REQUESTING_PERMISSION', 'IDLE'],
  REQUESTING_PERMISSION: ['LISTENING', 'ERROR', 'IDLE'],
  LISTENING: ['TRANSCRIBING', 'PROCESSING', 'WAITING_FOR_USER', 'ERROR', 'IDLE'],
  TRANSCRIBING: ['PROCESSING', 'WAITING_FOR_USER', 'ERROR', 'IDLE'],
  PROCESSING: ['RESPONDING', 'ERROR', 'IDLE'],
  RESPONDING: ['SPEAKING', 'WAITING_FOR_USER', 'LISTENING', 'IDLE', 'ERROR'],
  SPEAKING: ['WAITING_FOR_USER', 'LISTENING', 'IDLE', 'ERROR'],
  WAITING_FOR_USER: ['LISTENING', 'PROCESSING', 'IDLE', 'WAITING_FOR_USER'],
  ERROR: ['LISTENING', 'PROCESSING', 'IDLE', 'WAITING_FOR_USER'],
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Conversation {
  private snap: ConvSnapshot = { state: 'IDLE', partial: '', notice: null, mode: 'controlada' };
  private session = 0;
  private subs = new Set<() => void>();
  private promptIdx = 0;
  private processor: Processor | null = null;
  private reviewer: Reviewer | null = null;
  /** Para testes: substitui a fala. */
  speakImpl: (text: string, prefs: VoicePrefs) => Promise<void> = (t, p) => ttsSpeak(t, p);
  stopSpeakImpl: () => Promise<void> = () => stopSpeaking();

  get = () => this.snap;
  subscribe = (fn: () => void) => { this.subs.add(fn); return () => this.subs.delete(fn); };

  setProcessor(p: Processor) { this.processor = p; }
  setReviewer(r: Reviewer | null) { this.reviewer = r; }

  private patch(p: Partial<ConvSnapshot>) {
    this.snap = { ...this.snap, ...p };
    this.subs.forEach((s) => s());
  }

  private go(next: ConvState, extra: Partial<ConvSnapshot> = {}) {
    const from = this.snap.state;
    if (from !== next && !ALLOWED[from].includes(next)) {
      console.warn(`[MASON] transição ignorada: ${from} → ${next}`);
      return false;
    }
    core.set(MODE_OF[next]);
    if (next !== 'LISTENING') core.setLevel(0);
    this.patch({ state: next, ...extra });
    return true;
  }

  /** Quando o microfone está livre para começar a ouvir. */
  private canListen() {
    return ['IDLE', 'WAITING_FOR_USER', 'ERROR'].includes(this.snap.state);
  }

  /** Ouvir: só por ação do Gabriel (botão, Continuar, palavra de ativação) ou no modo contínuo. */
  async listen(source: ListenSource, chained = false): Promise<void> {
    if (!chained && this.snap.state === 'SPEAKING') await this.interrupt();
    if (this.snap.state === 'LISTENING') { await this.stopListening(); return; } // tocar de novo = terminar de falar
    if (!chained && !this.canListen()) return;
    const prefs = await loadVoicePrefs();
    if (source === 'auto' && prefs.mode !== 'continua') return; // reabertura automática só no modo contínuo
    const s = ++this.session;
    await this.stopSpeakImpl().catch(() => undefined); // nunca microfone com fala tocando
    const started = Date.now();
    if (!this.go('LISTENING', { partial: '', notice: null, mode: prefs.mode })) return;
    const rec = getRecognizer();
    const res = await rec.listen({
      onPartial: (t) => { if (s === this.session) this.patch({ partial: t }); },
      onLevel: (l) => { if (s === this.session) core.setLevel(l); },
      onState: (st) => { if (s === this.session && st === 'end' && this.snap.state === 'LISTENING') this.go('TRANSCRIBING'); },
    }, { silenceMs: prefs.silenceMs });
    if (s !== this.session) return; // conversa encerrada ou outra sessão começou
    const listenMs = Date.now() - started;

    if (!res.alternatives.length || !res.alternatives[0].text.trim()) {
      const err = res.error ?? 'no_match';
      recordDiag({ source, alternatives: [], error: err, listenMs });
      if (err === 'cancelled') { this.go(prefs.mode === 'botao' ? 'IDLE' : 'WAITING_FOR_USER', { partial: '' }); return; }
      const soft = ['silence', 'no_match', 'timeout'].includes(err);
      const notice = source === 'auto' && soft ? 'Conversa pausada. Toque em Continuar quando quiser.' : LISTEN_ERROR_TEXT[err] ?? `Falha no reconhecimento (${err}).`;
      this.go(soft ? 'WAITING_FOR_USER' : 'ERROR', { partial: '', notice });
      return;
    }

    const heard = res.alternatives[0].text.trim();
    if (prefs.reviewBeforeSend && this.reviewer) {
      recordDiag({ source, alternatives: res.alternatives, listenMs, note: 'enviado para revisão' });
      this.go('WAITING_FOR_USER', { partial: '', notice: 'Confira o texto e envie. Corrigir aqui ensina o MASON.' });
      this.reviewer(heard, res.alternatives);
      return;
    }
    this.go('TRANSCRIBING', { partial: heard });
    await this.turn(heard, { fromVoice: true, alternatives: res.alternatives, listenMs, source }, s);
  }

  /** Mensagem digitada. Interrompe fala/escuta em andamento. */
  async sendText(text: string): Promise<void> {
    const clean = text.trim();
    if (!clean) return;
    if (this.snap.state === 'SPEAKING') await this.interrupt();
    if (this.snap.state === 'LISTENING' || this.snap.state === 'TRANSCRIBING') await this.cancelListening();
    if (!this.canListen()) return; // já está processando outra mensagem
    const s = ++this.session;
    await this.turn(clean, { fromVoice: false }, s);
  }

  private async turn(text: string, meta: { fromVoice: boolean; alternatives?: Alternative[]; listenMs?: number; source?: ListenSource }, s: number) {
    const prefs = await loadVoicePrefs();
    if (!this.go('PROCESSING', { partial: '', notice: null, mode: prefs.mode })) return;
    const t0 = Date.now();
    let out: ProcessResult;
    try {
      if (!this.processor) throw new Error('Conversa não está pronta.');
      out = await Promise.race([
        this.processor(text, { fromVoice: meta.fromVoice }),
        sleep(PROCESS_TIMEOUT_MS).then(() => { throw new Error('O processamento demorou demais.'); }),
      ]);
    } catch (e) {
      if (s === this.session) this.go('ERROR', { notice: (e as Error).message });
      return;
    }
    if (s !== this.session) return;
    if (meta.fromVoice) {
      recordDiag({ source: meta.source ?? 'button', alternatives: meta.alternatives ?? [], chosen: text, listenMs: meta.listenMs, processMs: Date.now() - t0, intent: out.debug, reply: out.reply });
    }
    this.go('RESPONDING');

    const talk = prefs.replyMode === 'sempre' || (prefs.replyMode === 'quando_falo' && meta.fromVoice);
    if (talk) {
      let spoken = forVoice(out.reply);
      // D36: no modo controlado, terminar perguntando se quer continuar (se a resposta já não for uma pergunta).
      if (prefs.mode === 'controlada' && prefs.askToContinue && !out.needsConfirmation && !/\?\s*$/.test(spoken)) {
        spoken += ' ' + CONTINUE_PROMPTS[this.promptIdx++ % CONTINUE_PROMPTS.length];
      }
      this.go('SPEAKING');
      const limit = 8000 + spoken.length * 90; // a fala nunca prende o estado
      await Promise.race([this.speakImpl(spoken, prefs).catch(() => undefined), sleep(limit).then(() => this.stopSpeakImpl())]);
      if (s !== this.session) return; // interrompida ou encerrada
    }

    if (prefs.mode === 'continua' && meta.fromVoice && !out.needsConfirmation) {
      await sleep(350); // folga para o fim do áudio não entrar no microfone
      if (s === this.session) void this.listen('auto', true); // segue direto para OUVINDO
      return;
    }
    this.go(prefs.mode === 'botao' ? 'IDLE' : 'WAITING_FOR_USER');
  }

  /** Para a fala atual (tocar no núcleo enquanto ele fala). */
  async interrupt() {
    if (this.snap.state !== 'SPEAKING') return;
    this.session++;
    await this.stopSpeakImpl().catch(() => undefined);
    this.go('WAITING_FOR_USER');
  }

  /** Terminar de falar: entrega o que foi ouvido até agora. */
  async stopListening() {
    if (this.snap.state === 'LISTENING') await getRecognizer().stop().catch(() => undefined);
  }

  private async cancelListening() {
    this.session++;
    await getRecognizer().cancel().catch(() => undefined);
    this.go('IDLE', { partial: '' });
  }

  /** Encerrar a conversa: para escuta e fala, descarta qualquer resultado pendente. */
  async end() {
    this.session++;
    await getRecognizer().cancel().catch(() => undefined);
    await this.stopSpeakImpl().catch(() => undefined);
    // de qualquer estado para IDLE
    core.set('idle');
    core.setLevel(0);
    this.patch({ state: 'IDLE', partial: '', notice: null });
  }

  clearNotice() { this.patch({ notice: null }); }
}

export const conversation = new Conversation();

export function useConversation(): ConvSnapshot {
  return useSyncExternalStore(conversation.subscribe, conversation.get, conversation.get);
}

export const STATE_TEXT: Record<ConvState, string> = {
  IDLE: 'Toque no núcleo para falar',
  REQUESTING_PERMISSION: 'Pedindo permissão do microfone…',
  LISTENING: 'Ouvindo… toque no núcleo quando terminar',
  TRANSCRIBING: 'Transcrevendo…',
  PROCESSING: 'Pensando…',
  RESPONDING: 'Preparando a resposta…',
  SPEAKING: 'Falando… toque no núcleo para interromper',
  WAITING_FOR_USER: 'Aguardando você',
  ERROR: 'Algo falhou',
};
