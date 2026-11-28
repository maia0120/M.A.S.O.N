import { getPref, setPref } from '../memory/preferences/profileRepo';
import type { Alternative } from './speech-recognition/recognizer';

/**
 * Diagnóstico de voz: para cada fala, o que o reconhecedor ouviu (com alternativas e confiança),
 * o texto usado, a intenção escolhida e os tempos. Separa erro de TRANSCRIÇÃO de erro de INTERPRETAÇÃO.
 * Guarda as últimas 40 falas, só no aparelho.
 */
export interface DiagEntry {
  at: string;
  source: string;
  alternatives: Alternative[];
  chosen?: string;
  error?: string;
  note?: string;
  listenMs?: number;
  processMs?: number;
  intent?: { intent: string | null; score: number; confident: boolean; ambiguous: boolean };
  reply?: string;
}

const KEY = 'voice.diag';
const MAX = 40;
let cache: DiagEntry[] | null = null;
let saving: Promise<void> = Promise.resolve();

export async function listDiag(): Promise<DiagEntry[]> {
  if (cache) return cache;
  try {
    const raw = await getPref(KEY);
    cache = raw ? (JSON.parse(raw) as DiagEntry[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

export function recordDiag(e: Omit<DiagEntry, 'at'>) {
  saving = saving.then(async () => {
    const list = await listDiag();
    list.unshift({ at: new Date().toISOString(), ...e, reply: e.reply?.slice(0, 160) });
    cache = list.slice(0, MAX);
    await setPref(KEY, JSON.stringify(cache)).catch(() => undefined);
  });
}

export async function clearDiag() {
  cache = [];
  await setPref(KEY, '[]');
}
