import { INTENTS } from '../knowledge/seed';
import { LexicalIndex } from './lexical';
import { getEncoder, cosine } from './semantic';
import { normalize, fold, type Normalized } from './normalize';
import { analyzeFrame, penalties, type Frame } from './frame';

export interface IntentScore {
  intent: string;
  score: number;
  lexical: number;
  semantic: number | null;
  /** Evidência da análise da frase (ação + objeto + novidade). */
  frame: number;
  why: string | null;
}

export interface Interpretation {
  msg: Normalized;
  frame: Frame;
  ranked: IntentScore[];
  top: IntentScore | null;
  /** Certeza suficiente para agir sem perguntar. */
  confident: boolean;
  /** Dois candidatos próximos demais: perguntar na hora (D7). */
  ambiguous: boolean;
}

/** Limiares — calibrados com os testes de frases novas; revisar com uso real. */
export const THRESHOLDS = { act: 0.42, minimum: 0.28, ambiguityGap: 0.06 };

const GREETING = /^(e ai|opa|fala|bom dia|boa tarde|boa noite|salve|oi|ola)\b/;
/** Palavras que não mudam o pedido em nenhuma intenção. */
const NEUTRAL = new Set(['mason', 'mano', 'cara', 'velho']);
const classText = (t: string) => t.split(' ').filter((w) => !NEUTRAL.has(w)).join(' ');

let lexical: LexicalIndex | null = null;
let exampleKeys: string[] = [];
let exampleVecs: Float32Array[] | null = null;
let extraExamples: { intent: string; text: string }[] = [];

function build() {
  const entries = [
    ...INTENTS.flatMap((i) => i.examples.map((e) => ({ key: i.id, text: classText(fold(e)) }))),
    ...extraExamples.map((e) => ({ key: e.intent, text: classText(fold(e.text)) })),
  ];
  exampleKeys = entries.map((e) => e.key);
  lexical = new LexicalIndex(entries);
  exampleVecs = null;
}

/** Exemplos aprendidos com o uso (correções do Gabriel) entram aqui. */
export function setLearnedExamples(list: { intent: string; text: string }[]) {
  extraExamples = list;
  build();
}

async function semanticScores(text: string): Promise<Map<string, number> | null> {
  const enc = getEncoder();
  if (!enc) return null;
  if (!exampleVecs) {
    const texts = [...INTENTS.flatMap((i) => i.examples), ...extraExamples.map((e) => e.text)];
    exampleVecs = await enc.encode(texts);
  }
  const [q] = await enc.encode([text]);
  const best = new Map<string, number>();
  exampleVecs.forEach((v, i) => {
    const s = cosine(q, v);
    const k = exampleKeys[i];
    if (s > (best.get(k) ?? -1)) best.set(k, s);
  });
  return best;
}

export async function interpret(raw: string): Promise<Interpretation> {
  if (!lexical) build();
  const msg = normalize(raw);
  const ct = classText(msg.text);
  const lex = lexical!.score(ct || msg.text);
  if (GREETING.test(ct) && ct.split(' ').length <= 5) lex.set('cumprimentar', Math.max(lex.get('cumprimentar') ?? 0, 0.95));
  const frame = analyzeFrame(raw);
  const pen = penalties(frame);
  // Frase idêntica a uma que o Gabriel já confirmou: a confirmação dele vale mais que qualquer regra.
  const learnedHit = extraExamples.find((e) => classText(fold(e.text)) === (ct || msg.text));
  const sem = await semanticScores(raw).catch(() => null);
  const ranked: IntentScore[] = INTENTS.map((i) => {
    const p = pen.get(i.id) ?? 1;
    const l = (lex.get(i.id) ?? 0) * p;
    const s = sem ? sem.get(i.id) ?? 0 : null;
    // Modelo de significados: cossenos de paráfrases ficam ~0,55–0,85; abaixo de 0,35 é ruído.
    const semNorm = s === null ? null : Math.max(0, (s - 0.35) / 0.5) * p;
    const fe = frame.evidence.get(i.id);
    const fscore = fe?.score ?? 0;
    const examples = semNorm === null ? l : Math.max(l, 0.6 * semNorm + 0.4 * l);
    // A análise da frase e os exemplos se reforçam quando concordam
    let score = Math.min(1, Math.max(fscore, examples) + (fscore > 0 && examples > 0.3 ? 0.05 : 0));
    let why = fe?.why ?? null;
    if (learnedHit) {
      if (learnedHit.intent === i.id) { score = 0.97; why = 'frase confirmada antes pelo Gabriel'; }
      else score = Math.min(score, 0.5);
    }
    return { intent: i.id, score, lexical: l, semantic: s, frame: fscore, why };
  }).sort((a, b) => b.score - a.score);

  const top = ranked[0] && ranked[0].score >= THRESHOLDS.minimum ? ranked[0] : null;
  const second = ranked[1];
  // Evidência estrutural forte só "empata" com outra evidência estrutural forte.
  const strongWins = Boolean(top && (top.frame >= 0.8 || top.score >= 0.97) && second && second.frame < 0.8);
  const ambiguous = Boolean(top && second && !strongWins && top.score - second.score < THRESHOLDS.ambiguityGap && second.score >= THRESHOLDS.minimum && !compatible(top.intent, second.intent));
  return { msg, frame, ranked, top, confident: Boolean(top && top.score >= THRESHOLDS.act && !ambiguous), ambiguous };
}

/** Pares que não exigem pergunta: as duas leituras levam à mesma resposta. */
function compatible(a: string, b: string): boolean {
  const same = [['confirmar', 'agradecer'], ['negar', 'cancelar'], ['ver_ideia', 'buscar'], ['listar_ideias', 'ver_ideia']];
  return same.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

export function intentLabel(id: string): string {
  return INTENTS.find((i) => i.id === id)?.label ?? id;
}
