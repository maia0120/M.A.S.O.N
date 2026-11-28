import { getPref, setPref } from '../memory/preferences/profileRepo';

export interface VoicePrefs {
  /** Ler as respostas em voz alta quando a mensagem veio do microfone. */
  speakReplies: boolean;
  /** Mostrar a transcrição para revisão antes de enviar (permite corrigir erros do reconhecimento). */
  reviewBeforeSend: boolean;
  rate: number;
  pitch: number;
}

export const DEFAULT_VOICE: VoicePrefs = { speakReplies: true, reviewBeforeSend: true, rate: 1.05, pitch: 1.0 };

export async function loadVoicePrefs(): Promise<VoicePrefs> {
  const raw = await getPref('voice');
  return raw ? { ...DEFAULT_VOICE, ...JSON.parse(raw) } : { ...DEFAULT_VOICE };
}

export async function saveVoicePrefs(p: VoicePrefs): Promise<void> {
  await setPref('voice', JSON.stringify(p));
}
