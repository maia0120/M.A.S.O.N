import { getPref, setPref } from '../memory/preferences/profileRepo';

export type ReplyMode = 'sempre' | 'quando_falo' | 'nunca';
/** D35: controlada (padrão) · contínua · só botão. */
export type ConvMode = 'controlada' | 'continua' | 'botao';

export interface VoicePrefs {
  /** Quando o MASON responde falando. As respostas ficam salvas em texto de qualquer forma. */
  replyMode: ReplyMode;
  /** Como a conversa por voz continua depois de cada resposta. */
  mode: ConvMode;
  /** No modo controlado, terminar a resposta perguntando se quer continuar (falado). */
  askToContinue: boolean;
  /** Tempo de silêncio (ms) antes de encerrar a captura — mais alto tolera pausas naturais. */
  silenceMs: number;
  /** Mostrar a transcrição para revisão antes de enviar (desligado = conversa fluida). */
  reviewBeforeSend: boolean;
  /** Nome da voz escolhida no aparelho; null = escolher automaticamente uma masculina pt-BR. */
  voiceName: string | null;
  rate: number;
  /** Tom: abaixo de 1 deixa a voz mais grave. */
  pitch: number;
}

export const DEFAULT_VOICE: VoicePrefs = {
  replyMode: 'sempre',
  mode: 'controlada',
  askToContinue: true,
  silenceMs: 2000,
  reviewBeforeSend: false,
  voiceName: null,
  rate: 0.98,
  pitch: 0.8,
};

export async function loadVoicePrefs(): Promise<VoicePrefs> {
  const raw = await getPref('voice');
  if (!raw) return { ...DEFAULT_VOICE };
  const saved = JSON.parse(raw) as Partial<VoicePrefs> & { speakReplies?: boolean; continuous?: boolean };
  // versões anteriores: speakReplies (0.3) e continuous (0.4–0.5). D35: o padrão passa a ser "controlada".
  delete saved.speakReplies;
  delete saved.continuous;
  return { ...DEFAULT_VOICE, ...saved };
}

export async function saveVoicePrefs(p: VoicePrefs): Promise<void> {
  await setPref('voice', JSON.stringify(p));
}
