import { NORMALIZATION } from '../knowledge/seed';

/** Minúsculas, sem acentos, sem pontuação. */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ABBREV: Record<string, string> = Object.fromEntries(
  Object.entries(NORMALIZATION).map(([k, v]) => [fold(k), fold(v)]),
);

/** Vocativos e muletas que não mudam o pedido. */
const FILLERS = new Set(['mano', 'mason', 'cara', 'velho', 'vei', 'oh', 'entao', 'po']);

export interface Normalized {
  /** Texto original. */
  raw: string;
  /** Sem acentos e com abreviações expandidas — usado para comparar. */
  text: string;
  /** Palavras de `text`. */
  words: string[];
  /** Mesma coisa, sem muletas no começo ("mano", "ó", "seguinte"...). */
  core: string;
  /** A mensagem parece terminar no meio ("...", "tipo", "e"). */
  trailing: boolean;
}

export function normalize(raw: string): Normalized {
  const words = fold(raw).split(' ').filter(Boolean).map((w) => ABBREV[w] ?? w).join(' ').split(' ').filter(Boolean);
  let i = 0;
  while (i < words.length - 1 && (FILLERS.has(words[i]) || words[i] === 'seguinte')) i++;
  const core = words.slice(i).join(' ');
  const trailing = /(\.\.\.|…)\s*$/.test(raw.trim()) || /\b(tipo|e|que|mas|porque|entao)$/.test(words.join(' '));
  return { raw, text: words.join(' '), words, core, trailing };
}
