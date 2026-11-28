import { getPref, setPref } from '../memory/preferences/profileRepo';

export type ReplyMode = 'sempre' | 'quando_falo' | 'nunca';

export interface VoicePrefs {
  /** Quando o MASON responde falando. As respostas ficam salvas em texto de qualquer forma. */
  replyMode: ReplyMode;
  /** Depois de responder a uma fala, volta a ouvir sozinho (conversa contínua). */
  continuous: boolean;
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
  continuous: true,
  reviewBeforeSend: false,
  voiceName: null,
  rate: 0.98,
  pitch: 0.8,
};

export async function loadVoicePrefs(): Promise<VoicePrefs> {
  const raw = await getPref('voice');
  if (!raw) return { ...DEFAULT_VOICE };
  const saved = JSON.parse(raw) as Partial<VoicePrefs> & { speakReplies?: boolean };
  // versão anterior: speakReplies (só respondia por voz quando falava)
  delete saved.speakReplies;
  return { ...DEFAULT_VOICE, ...saved };
}

export async function saveVoicePrefs(p: VoicePrefs): Promise<void> {
  await setPref('voice', JSON.stringify(p));
}
