/**
 * Respostas faladas. Android: @capacitor-community/text-to-speech. Navegador: speechSynthesis.
 * A voz exata pode ser configurada depois (lista de vozes do aparelho).
 */
export interface SpeakOptions {
  rate: number; // 0.5 – 2
  pitch: number; // 0.5 – 2
}

/** Remove Markdown e trechos que não fazem sentido em voz alta. */
export function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' (trecho de código omitido) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'o link')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_>#]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\[ações executadas:[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

let speaking = false;

export async function speak(text: string, opts: SpeakOptions): Promise<void> {
  const clean = toSpeakable(text);
  if (!clean) return;
  await stopSpeaking();
  const { Capacitor } = await import('@capacitor/core');
  speaking = true;
  try {
    if (Capacitor.isNativePlatform()) {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      await TextToSpeech.speak({ text: clean, lang: 'pt-BR', rate: opts.rate, pitch: opts.pitch, volume: 1.0, category: 'playback' });
    } else if ('speechSynthesis' in window) {
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = 'pt-BR';
        u.rate = opts.rate;
        u.pitch = opts.pitch;
        const ptVoice = speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('pt-br'));
        if (ptVoice) u.voice = ptVoice;
        u.onend = () => resolve();
        u.onerror = () => resolve();
        speechSynthesis.speak(u);
      });
    }
  } finally {
    speaking = false;
  }
}

export async function stopSpeaking(): Promise<void> {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await TextToSpeech.stop().catch(() => undefined);
  } else if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
  speaking = false;
}

export const isSpeaking = () => speaking;
