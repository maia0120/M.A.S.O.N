import { listIdeas } from '../../work/ideas/ideasRepo';
import { relevance } from '../../core/util';
import { fold } from '../intent/normalize';
import { subjectOf, findTimeWindow } from '../intent/entities';
import { recentFocus } from './dialogState';
import type { Idea } from '../../core/types';

export interface IdeaReference {
  /** Candidatas, da mais provável para a menos. */
  ideas: Idea[];
  /** A frase aponta para a ideia em foco ("essa", "nessa"...): não precisa confirmar. */
  fromFocus: boolean;
  /** Havia alguma pista (assunto ou tempo) na frase. */
  hadClue: boolean;
}

const DEMONSTRATIVE = /\b(essa|esse|nessa|nesse|dessa|desse|ela|isso)\b/;

/** Resolve "aquela ideia do comparador", "a ideia de semana passada", "essa"... (decisões D10 e D11). */
export async function resolveIdea(text: string): Promise<IdeaReference> {
  // Pedido vindo de um botão do app: "a ideia "X" (id abc123)" aponta direto para o registro.
  const byId = text.match(/\(id ([\w-]+)\)/);
  if (byId) {
    const idea = (await listIdeas({ includeArchived: true })).find((i) => i.id === byId[1]);
    if (idea) return { ideas: [idea], fromFocus: true, hadClue: true };
  }
  const f = fold(text);
  const subject = subjectOf(text);
  const window = findTimeWindow(text);
  const includeArchived = /\barquivad/.test(f);
  let ideas = await listIdeas({ includeArchived });
  if (window) {
    ideas = ideas.filter((i) => {
      const c = new Date(i.created_at).getTime();
      const u = new Date(i.updated_at).getTime();
      return (c >= window.from.getTime() && c < window.to.getTime()) || (u >= window.from.getTime() && u < window.to.getTime());
    });
  }
  if (subject) {
    const ranked = ideas
      .map((i) => ({ i, s: relevance(subject, `${i.title} ${i.category ?? ''} ${i.original_description} ${i.organized_description ?? ''}`) }))
      .filter((x) => x.s >= 0.34)
      .sort((a, b) => b.s - a.s);
    if (ranked.length) {
      // se a melhor é bem mais forte, ela vem sozinha
      const top = ranked[0].s;
      return { ideas: ranked.filter((x) => x.s >= top - 0.15).map((x) => x.i), fromFocus: false, hadClue: true };
    }
  }
  // "essa ideia" aponta para a ideia em foco (mesmo que a frase tenha outras palavras, como "pro Claude")
  const focus = recentFocus();
  if (!window && focus && DEMONSTRATIVE.test(f)) {
    const idea = ideas.find((i) => i.id === focus);
    if (idea) return { ideas: [idea], fromFocus: true, hadClue: true };
  }
  if (subject && !window) return { ideas: [], fromFocus: false, hadClue: true };
  if (window) return { ideas: ideas.slice(0, 5), fromFocus: false, hadClue: true };
  return { ideas: [], fromFocus: false, hadClue: false };
}

/** Escolha numa lista: "a primeira", "2", "a do comparador"... */
export function pickFromList(text: string, ideas: Idea[]): Idea | null {
  const f = fold(text);
  const ord = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta'];
  const m = f.match(/\b([1-5])\b/);
  if (m) return ideas[Number(m[1]) - 1] ?? null;
  const o = ord.findIndex((w) => f.includes(w));
  if (o >= 0) return ideas[o] ?? null;
  if (/\bultima\b/.test(f)) return ideas[ideas.length - 1] ?? null;
  const subject = subjectOf(text);
  if (!subject) return null;
  const ranked = ideas.map((i) => ({ i, s: relevance(subject, i.title + ' ' + i.original_description) })).sort((a, b) => b.s - a.s);
  return ranked[0] && ranked[0].s >= 0.5 ? ranked[0].i : null;
}
