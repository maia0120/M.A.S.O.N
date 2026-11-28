import { getPref, setPref } from '../../memory/preferences/profileRepo';
import { uid } from '../../core/util';
import { setLearnedExamples } from './interpreter';
import { fold } from './normalize';

/**
 * APRENDIZADO COM ORIGEM (0.7.0).
 * Só entra aqui uma frase cuja intenção o Gabriel CONFIRMOU (respondeu "sim" à minha pergunta ou escolheu
 * uma das opções). Nada é aprendido sozinho a partir de um palpite. Cada item guarda de onde veio e quando,
 * aparece na tela Memória e pode ser apagado.
 */
export interface LearnedExample {
  id: string;
  text: string;
  intent: string;
  origin: 'confirmou_pergunta' | 'escolheu_opcao';
  at: string;
}

const KEY = 'nlu.learned';
const MAX = 300;
let cache: LearnedExample[] | null = null;

export async function listLearned(): Promise<LearnedExample[]> {
  if (cache) return cache;
  try {
    const raw = await getPref(KEY);
    cache = raw ? (JSON.parse(raw) as LearnedExample[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

async function save(list: LearnedExample[]) {
  cache = list;
  setLearnedExamples(list.map((l) => ({ intent: l.intent, text: l.text })));
  try {
    await setPref(KEY, JSON.stringify(list));
  } catch {
    /* sem banco (testes): fica só na memória */
  }
}

let loaded = false;
/** Carrega os exemplos aprendidos no interpretador (uma vez por sessão do app). */
export async function ensureLearned(): Promise<void> {
  if (loaded) return;
  loaded = true;
  const list = await listLearned();
  if (list.length) setLearnedExamples(list.map((l) => ({ intent: l.intent, text: l.text })));
}

export async function learn(text: string, intent: string, origin: LearnedExample['origin']): Promise<void> {
  const t = text.trim();
  if (!t || t.split(/\s+/).length > 30) return;
  const key = fold(t);
  const list = (await listLearned()).filter((l) => fold(l.text) !== key);
  list.unshift({ id: uid(), text: t, intent, origin, at: new Date().toISOString() });
  await save(list.slice(0, MAX));
}

export async function forgetLearned(id: string): Promise<void> {
  await save((await listLearned()).filter((l) => l.id !== id));
}

/** Para os testes. */
export function resetLearnedCache() {
  cache = [];
  loaded = true;
  setLearnedExamples([]);
}
