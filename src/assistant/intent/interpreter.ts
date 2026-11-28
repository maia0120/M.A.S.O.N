import { INTENTS } from '../knowledge/seed';
import { LexicalIndex } from './lexical';
import { getEncoder, cosine } from './semantic';
import { normalize, fold, type Normalized } from './normalize';
import { hasIdeaTrigger } from './entities';

export interface IntentScore {
  intent: string;
  score: number;
  lexical: number;
  semantic: number | null;
}

export interface Interpretation {
  msg: Normalized;
  ranked: IntentScore[];
  top: IntentScore | null;
  /** Certeza suficiente para agir sem perguntar. */
  confident: boolean;
  /** Dois candidatos próximos demais: perguntar na hora (D7). */
  ambiguous: boolean;
}

/** Limiares — calibrados com os testes de frases novas; revisar com uso real. */
export const THRESHOLDS = { act: 0.42, minimum: 0.28, ambiguityGap: 0.06 };

/**
 * Sinais fortes: expressões que, quando aparecem, praticamente definem a intenção.
 * Complementam os exemplos (que comparam a frase inteira) em frases longas ou misturadas.
 */
const STRONG_SIGNALS: Record<string, string[]> = {
  analisar_ideia: ['analisada', 'pontos fracos', 'presta', 'o que voce acha', 'que voce acha', 'sua opiniao', 'tua opiniao', 'quais os riscos', 'quais riscos', 'vale a pena', 'da certo', 'analisa', 'analisar', 'critica'],
  aprovar_ideia: ['aprova', 'aprovar', 'aprovada', 'vai para frente', 'bora tocar'],
  arquivar_ideia: ['arquiva', 'arquivar', 'deixa essa de lado', 'nao vai rolar'],
  complementar_ideia: ['acrescenta', 'complementa', 'adiciona isso', 'inclui isso', 'coloca tambem'],
  abrir_area: ['abre o', 'abre a', 'abre os', 'abre as', 'me leva', 'vai para', 'volta para'],
  corrigir: ['me enganei', 'na real', 'na verdade', 'falei errado', 'pensei melhor', 'me expressei mal'],
  agradecer: ['valeu', 'obrigado', 'brigado', 'brigadao'],
  status_projeto: ['como esta o projeto', 'como anda o projeto', 'em que pe'],
  ver_ideia: ['lembra da', 'lembra daquela', 'lembra daquele', 'ligado naquela', 'como era aquela', 'abre a ideia', 'me mostra a ideia', 'puxa aquela'],
};
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
  const padded = ` ${ct} `;
  const strong = new Set<string>();
  for (const [intent, phrases] of Object.entries(STRONG_SIGNALS)) {
    if (phrases.some((p) => padded.includes(` ${p} `))) {
      strong.add(intent);
      lex.set(intent, Math.max(lex.get(intent) ?? 0, 0.85));
    }
  }
  if (hasIdeaTrigger(raw)) strong.add('registrar_ideia');
  if (hasIdeaTrigger(raw)) lex.set('registrar_ideia', Math.max(lex.get('registrar_ideia') ?? 0, 0.9));
  if (GREETING.test(ct) && ct.split(' ').length <= 5) lex.set('cumprimentar', Math.max(lex.get('cumprimentar') ?? 0, 0.95));
  const sem = await semanticScores(raw).catch(() => null);
  const ranked: IntentScore[] = INTENTS.map((i) => {
    const l = lex.get(i.id) ?? 0;
    const s = sem ? sem.get(i.id) ?? 0 : null;
    // Com o modelo: combina sentido e forma; a forma decide sozinha quando é muito clara.
    // Cossenos do MiniLM para paráfrases ficam ~0,55–0,85; abaixo de 0,35 é ruído.
    const semNorm = s === null ? null : Math.max(0, (s - 0.35) / 0.5);
    const score = semNorm === null ? l : Math.max(l, 0.6 * semNorm + 0.4 * l);
    return { intent: i.id, score, lexical: l, semantic: s };
  }).sort((a, b) => b.score - a.score);

  const top = ranked[0] && ranked[0].score >= THRESHOLDS.minimum ? ranked[0] : null;
  const second = ranked[1];
  // Um sinal forte só "empata" com outro sinal forte.
  const strongWins = Boolean(top && strong.has(top.intent) && second && !strong.has(second.intent));
  const ambiguous = Boolean(top && second && !strongWins && top.score - second.score < THRESHOLDS.ambiguityGap && second.score >= THRESHOLDS.minimum && !compatible(top.intent, second.intent));
  return { msg, ranked, top, confident: Boolean(top && top.score >= THRESHOLDS.act && !ambiguous), ambiguous };
}

/** Pares que não exigem pergunta: as duas leituras levam à mesma resposta. */
function compatible(a: string, b: string): boolean {
  const same = [['confirmar', 'agradecer'], ['negar', 'cancelar'], ['ver_ideia', 'buscar'], ['listar_ideias', 'ver_ideia']];
  return same.some(([x, y]) => (a === x && b === y) || (a === y && b === x));
}

export function intentLabel(id: string): string {
  return INTENTS.find((i) => i.id === id)?.label ?? id;
}
