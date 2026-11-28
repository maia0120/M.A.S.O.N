export const now = () => new Date().toISOString();

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Minúsculas, sem acentos e sem pontuação — para comparar texto em português. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOPWORDS = new Set(
  'a o as os um uma de da do das dos e em no na nos nas para pra pro por com que se aquele aquela aquilo isso esse essa este esta ideia projeto mano tipo ai la ta tava'.split(' '),
);

export function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Pontuação simples de relevância: fração dos termos da busca presentes no texto (com prefixo). */
export function relevance(query: string, haystack: string): number {
  const q = tokens(query);
  if (q.length === 0) return 0;
  const h = tokens(haystack);
  let hits = 0;
  for (const term of q) {
    const stem = term.slice(0, Math.max(4, term.length - 2));
    if (h.some((w) => w === term || w.startsWith(stem) || term.startsWith(w.slice(0, Math.max(4, w.length - 2))))) hits++;
  }
  return hits / q.length;
}

export function rankBy<T>(items: T[], query: string, text: (t: T) => string, min = 0.34): T[] {
  return items
    .map((item) => ({ item, score: relevance(query, text(item)) }))
    .filter((x) => x.score >= min)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1).trimEnd() + '…';
}
