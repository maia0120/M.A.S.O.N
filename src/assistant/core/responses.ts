import { RESPONSES } from '../knowledge/seed';

/**
 * Gerenciador de respostas: monta o texto a partir dos modelos revisados pelo Gabriel (tom Jarvis).
 * Nunca descreve uma ação como feita: quem chama só usa modelos de sucesso depois do resultado ok do executor.
 */
let lastPick = new Map<string, number>();

export function respond(situation: string, vars: Record<string, string> = {}): string {
  const options = RESPONSES.filter((r) => r.situation === situation);
  if (!options.length) throw new Error(`Sem modelo de resposta para "${situation}"`);
  // alterna entre as versões para não repetir a mesma frase em seguida
  const prev = lastPick.get(situation) ?? -1;
  const idx = options.length === 1 ? 0 : (prev + 1) % options.length;
  lastPick.set(situation, idx);
  let text = options[idx].text;
  if (situation === 'cumprimento') text = text.replace(/^Boa tarde/, greetingByHour());
  return fill(text, vars);
}

export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? '').replace(/\s+([.,?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
}

export function greetingByHour(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

export function resetResponseRotation() {
  lastPick = new Map();
}

/** "27/11" ou "hoje", "ontem". */
export function shortDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1]}`;
}

/** Versão falada: curta, sem listas (D12). */
export function forVoice(text: string): string {
  const plain = text.replace(/^\s*[-•\d.)]+\s+/gm, '').replace(/\n+/g, ' ');
  const sentences = plain.match(/[^.!?]+[.!?]+/g) ?? [plain];
  if (plain.length <= 220) return plain.trim();
  return sentences.slice(0, 2).join(' ').trim() + ' Os detalhes estão na tela.';
}
