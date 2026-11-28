/**
 * Reconhecimento de fala em pt-BR.
 * Android: @capacitor-community/speech-recognition (reconhecedor do sistema, sem popup).
 * Navegador: Web Speech API (Chrome/Edge). O WebView do Android não oferece essa API — por isso o plugin.
 */
export interface Recognizer {
  available(): Promise<boolean>;
  /** onPartial recebe o texto parcial; a Promise resolve com o texto final quando a escuta termina. */
  listen(onPartial: (text: string) => void): Promise<string>;
  stop(): Promise<void>;
}

async function nativeRecognizer(): Promise<Recognizer> {
  const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
  let finish: (() => void) | null = null;
  return {
    async available() {
      return (await SpeechRecognition.available()).available;
    },
    async listen(onPartial) {
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') throw new Error('Permissão de microfone negada. Libere nas configurações do Android.');
      await SpeechRecognition.removeAllListeners();
      let last = '';
      return new Promise<string>((resolve, reject) => {
        finish = () => resolve(last);
        void SpeechRecognition.addListener('partialResults', (d: { matches?: string[] }) => {
          if (d.matches?.[0]) {
            last = d.matches[0];
            onPartial(last);
          }
        });
        void SpeechRecognition.addListener('listeningState', (d: { status: 'started' | 'stopped' }) => {
          if (d.status === 'stopped') finish?.();
        });
        SpeechRecognition.start({ language: 'pt-BR', maxResults: 1, partialResults: true, popup: false }).catch(reject);
      });
    },
    async stop() {
      await SpeechRecognition.stop().catch(() => undefined);
      finish?.();
    },
  };
}

type WebSR = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
};

function webRecognizer(): Recognizer {
  const Ctor = (window as unknown as { SpeechRecognition?: new () => WebSR; webkitSpeechRecognition?: new () => WebSR }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => WebSR }).webkitSpeechRecognition;
  let current: WebSR | null = null;
  return {
    async available() {
      return Boolean(Ctor);
    },
    listen(onPartial) {
      if (!Ctor) return Promise.reject(new Error('Este navegador não tem reconhecimento de voz.'));
      const rec = new Ctor();
      current = rec;
      rec.lang = 'pt-BR';
      rec.continuous = true;
      rec.interimResults = true;
      let finalText = '';
      let interim = '';
      return new Promise<string>((resolve, reject) => {
        rec.onresult = (e) => {
          interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalText += r[0].transcript + ' ';
            else interim += r[0].transcript;
          }
          onPartial((finalText + interim).trim());
        };
        rec.onerror = (e) => {
          if (e.error === 'no-speech' || e.error === 'aborted') return;
          reject(new Error(e.error === 'not-allowed' ? 'Permissão de microfone negada.' : `Erro no reconhecimento: ${e.error}`));
        };
        rec.onend = () => resolve((finalText + interim).trim());
        rec.start();
      });
    },
    async stop() {
      current?.stop();
    },
  };
}

let instance: Recognizer | null = null;
export async function getRecognizer(): Promise<Recognizer> {
  if (instance) return instance;
  const { Capacitor } = await import('@capacitor/core');
  instance = Capacitor.isNativePlatform() ? await nativeRecognizer() : webRecognizer();
  return instance;
}
