/**
 * Respostas faladas. Android: @capacitor-community/text-to-speech (vozes do aparelho, gratuitas e offline).
 * Navegador: speechSynthesis.
 * Voz padrão (D15): masculina, grave e séria, em pt-BR.
 */
export interface SpeakOptions {
  rate: number; // 0.5 – 2
  pitch: number; // 0.5 – 2
  voiceName: string | null;
}

export interface VoiceInfo {
  /** Posição na lista do aparelho (o plugin Android escolhe a voz por índice). */
  index: number;
  name: string;
  lang: string;
  /** Pelo nome, parece masculina. */
  male: boolean;
  female: boolean;
}

/** Remove Markdown e trechos que não fazem sentido em voz alta. */
export function toSpeakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' (trecho de código omitido) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'o link')
    .replace(/^#+\s*/gm, '')
    .replace(/[*_>#"“”]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MALE = /(^|[^a-z])(male|masculin|homem|man|antonio|daniel|ricardo|felipe|fabio|julio|humberto|nicolau|donato)/i;
const FEMALE = /(female|feminin|mulher|woman|maria|francisca|luciana|helo|leticia|raquel|vitoria|thalita|brenda|elza|giovanna|manuela|yara)/i;

async function isNative() {
  const { Capacitor } = await import('@capacitor/core');
  return Capacitor.isNativePlatform();
}

function webVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve([]);
    const now = speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1500);
  });
}

/** Vozes em português disponíveis no aparelho. */
export async function listVoices(): Promise<VoiceInfo[]> {
  let raw: { name: string; lang: string }[] = [];
  if (await isNative()) {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    raw = (await TextToSpeech.getSupportedVoices()).voices.map((v) => ({ name: v.name, lang: v.lang }));
  } else {
    raw = (await webVoices()).map((v) => ({ name: v.name, lang: v.lang }));
  }
  return raw
    .map((v, index) => {
      const female = FEMALE.test(v.name) && !/\bmale/i.test(v.name.replace(/female/gi, ''));
      return { index, name: v.name, lang: v.lang, female, male: MALE.test(v.name.replace(/female/gi, '')) && !female };
    })
    .filter((v) => /^pt/i.test(v.lang.replace('_', '-')));
}

/** Voz escolhida pelo Gabriel; senão, a primeira pt-BR que pareça masculina; senão, qualquer pt-BR. */
export async function pickVoice(preferred: string | null): Promise<VoiceInfo | null> {
  const voices = await listVoices();
  if (preferred) {
    const v = voices.find((x) => x.name === preferred);
    if (v) return v;
  }
  const br = voices.filter((v) => /br/i.test(v.lang));
  return br.find((v) => v.male) ?? voices.find((v) => v.male) ?? br.find((v) => !v.female) ?? br[0] ?? voices[0] ?? null;
}

let speaking = false;

export async function speak(text: string, opts: SpeakOptions): Promise<void> {
  const clean = toSpeakable(text);
  if (!clean) return;
  await stopSpeaking();
  const voice = await pickVoice(opts.voiceName).catch(() => null);
  speaking = true;
  try {
    if (await isNative()) {
      const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
      await TextToSpeech.speak({
        text: clean, lang: voice?.lang ?? 'pt-BR', rate: opts.rate, pitch: opts.pitch, volume: 1.0, category: 'playback',
        ...(voice ? { voice: voice.index } : {}),
      });
    } else if ('speechSynthesis' in window) {
      const all = await webVoices();
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(clean);
        u.lang = 'pt-BR';
        u.rate = opts.rate;
        u.pitch = opts.pitch;
        if (voice) u.voice = all[voice.index] ?? null;
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
  if (await isNative()) {
    const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
    await TextToSpeech.stop().catch(() => undefined);
  } else if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
  }
  speaking = false;
}

export const isSpeaking = () => speaking;
