import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Reconhecimento de fala da conversa (P0 da auditoria 0.5.0).
 * Android: plugin próprio "MasonSpeech" — resultado FINAL, até 5 alternativas com confiança,
 * tolerância a pausas, e confirmação de que a palavra de ativação soltou o microfone.
 * Navegador: Web Speech API (só para desenvolvimento).
 */
export interface Alternative {
  text: string;
  /** 0–1; -1 quando o reconhecedor não informa. */
  confidence: number;
}

export type ListenError = 'no_match' | 'silence' | 'audio' | 'busy' | 'permission' | 'network' | 'server' | 'client' | 'cancelled' | 'start_failed' | 'timeout' | string;

export interface ListenResult {
  alternatives: Alternative[];
  error?: ListenError;
  detail?: string;
}

export interface ListenHandlers {
  onPartial?: (text: string) => void;
  /** Nível da voz 0–1 (para o orbe reagir). */
  onLevel?: (level: number) => void;
  /** ready = pode falar; speech = começou a falar; end = parou de falar (transcrevendo). */
  onState?: (s: 'starting' | 'ready' | 'speech' | 'end') => void;
}

export interface Recognizer {
  available(): Promise<boolean>;
  listen(h: ListenHandlers, opts?: { silenceMs?: number }): Promise<ListenResult>;
  /** Termina e entrega o que foi ouvido. */
  stop(): Promise<void>;
  /** Descarta a escuta atual. */
  cancel(): Promise<void>;
}

interface SpeechPlugin {
  available(): Promise<{ available: boolean }>;
  listen(o: { silenceMs?: number; minMs?: number; lang?: string }): Promise<ListenResult>;
  stop(): Promise<void>;
  cancel(): Promise<void>;
  requestPermissions(o?: { permissions: string[] }): Promise<Record<string, string>>;
  addListener(e: 'partial', cb: (d: { text: string }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'level', cb: (d: { level: number }) => void): Promise<PluginListenerHandle>;
  addListener(e: 'state', cb: (d: { state: 'starting' | 'ready' | 'speech' | 'end' }) => void): Promise<PluginListenerHandle>;
}

const MasonSpeech = registerPlugin<SpeechPlugin>('MasonSpeech');

export const LISTEN_TIMEOUT_MS = 30_000;

/** Protege contra uma escuta que nunca termina (estado preso em OUVINDO). */
function withTimeout(p: Promise<ListenResult>, onTimeout: () => void): Promise<ListenResult> {
  return new Promise((resolve) => {
    const t = setTimeout(() => { onTimeout(); resolve({ alternatives: [], error: 'timeout' }); }, LISTEN_TIMEOUT_MS);
    p.then((r) => { clearTimeout(t); resolve(r); }, (e: Error) => { clearTimeout(t); resolve({ alternatives: [], error: 'start_failed', detail: e.message }); });
  });
}

function nativeRecognizer(): Recognizer {
  return {
    async available() {
      return (await MasonSpeech.available()).available;
    },
    async listen(h, opts) {
      const perm = await MasonSpeech.requestPermissions({ permissions: ['microphone'] });
      if (perm.microphone !== 'granted') return { alternatives: [], error: 'permission' };
      const handles = await Promise.all([
        MasonSpeech.addListener('partial', (d) => h.onPartial?.(d.text)),
        MasonSpeech.addListener('level', (d) => h.onLevel?.(d.level)),
        MasonSpeech.addListener('state', (d) => h.onState?.(d.state)),
      ]);
      try {
        return await withTimeout(MasonSpeech.listen({ silenceMs: opts?.silenceMs ?? 2000, minMs: 1500, lang: 'pt-BR' }), () => void MasonSpeech.cancel());
      } finally {
        await Promise.all(handles.map((x) => x.remove()));
      }
    },
    stop: () => MasonSpeech.stop(),
    cancel: () => MasonSpeech.cancel(),
  };
}

type WebSR = {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; length: number; [i: number]: { transcript: string; confidence: number } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onaudiostart: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};

function webRecognizer(): Recognizer {
  const w = window as unknown as { SpeechRecognition?: new () => WebSR; webkitSpeechRecognition?: new () => WebSR };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  let current: WebSR | null = null;
  let cancelled = false;
  return {
    async available() { return Boolean(Ctor); },
    listen(h) {
      if (!Ctor) return Promise.resolve({ alternatives: [], error: 'start_failed', detail: 'Navegador sem reconhecimento de voz' });
      const rec = new Ctor();
      current = rec;
      cancelled = false;
      rec.lang = 'pt-BR';
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 5;
      let final: Alternative[] = [];
      let error: ListenError | undefined;
      const p = new Promise<ListenResult>((resolve) => {
        rec.onaudiostart = () => h.onState?.('ready');
        rec.onspeechstart = () => h.onState?.('speech');
        rec.onspeechend = () => h.onState?.('end');
        rec.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) {
              final = Array.from({ length: r.length }, (_, k) => ({ text: r[k].transcript, confidence: r[k].confidence ?? -1 }));
            } else h.onPartial?.(r[0].transcript);
          }
        };
        rec.onerror = (e) => { error = e.error === 'no-speech' ? 'silence' : e.error === 'not-allowed' ? 'permission' : e.error === 'aborted' ? 'cancelled' : e.error; };
        rec.onend = () => resolve(cancelled ? { alternatives: [], error: 'cancelled' } : { alternatives: final, error: final.length ? undefined : error ?? 'no_match' });
      });
      h.onState?.('starting');
      rec.start();
      return withTimeout(p, () => rec.abort());
    },
    async stop() { current?.stop(); },
    async cancel() { cancelled = true; current?.abort(); },
  };
}

let instance: Recognizer | null = null;
export function getRecognizer(): Recognizer {
  if (!instance) instance = Capacitor.isNativePlatform() ? nativeRecognizer() : webRecognizer();
  return instance;
}

/** Permite trocar o reconhecedor nos testes. */
export function setRecognizer(r: Recognizer | null) {
  instance = r;
}

export const LISTEN_ERROR_TEXT: Record<string, string> = {
  no_match: 'Não consegui entender o que foi dito.',
  silence: 'Não ouvi nada.',
  audio: 'O microfone não respondeu.',
  busy: 'O microfone está ocupado por outro app.',
  permission: 'Sem permissão de microfone. Libere nas configurações do Android.',
  network: 'O reconhecimento de voz do aparelho precisou de internet e não conseguiu. Instale o pacote offline de português nas configurações de voz do Google.',
  server: 'O serviço de reconhecimento do aparelho falhou.',
  client: 'O reconhecimento de voz falhou ao iniciar.',
  start_failed: 'Não consegui iniciar o reconhecimento de voz.',
  timeout: 'A escuta demorou demais e foi encerrada.',
};
