import { SECTION_ALIASES, VOCABULARY } from '../knowledge/seed';
import { fold } from './normalize';

/** Área do app mencionada na frase. Prefere o nome mais longo ("central de ideias" ganha de "ideias"). */
export function findSection(text: string): string | null {
  const t = ` ${fold(text)} `;
  let best: { id: string; len: number } | null = null;
  for (const [id, aliases] of Object.entries(SECTION_ALIASES)) {
    for (const a of aliases) {
      const f = fold(a);
      if (t.includes(` ${f} `) && (!best || f.length > best.len)) best = { id, len: f.length };
    }
  }
  return best?.id ?? null;
}

/** Tipo de ideia pelo vocabulário (site, app, marketplace...). */
export function findCategory(text: string): string | null {
  const t = ` ${fold(text)} `;
  const hit = VOCABULARY.filter((v) => v.kind === 'tipo_ideia').find((v) => t.includes(` ${fold(v.term)} `));
  if (!hit) return null;
  const map: Record<string, string> = { app: 'aplicativo', 'landing page': 'site' };
  return map[fold(hit.term)] ?? hit.term;
}

export interface TimeWindow {
  from: Date;
  to: Date;
  label: string;
}

/** Referências de tempo ("ontem", "semana passada"...) → intervalo de datas. */
export function findTimeWindow(text: string, now = new Date()): TimeWindow | null {
  const t = fold(text);
  const day = (d: number) => {
    const x = new Date(now);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() + d);
    return x;
  };
  const end = new Date(now.getTime() + 1);
  if (/\banteontem\b/.test(t)) return { from: day(-2), to: day(-1), label: 'anteontem' };
  if (/\bontem\b/.test(t)) return { from: day(-1), to: day(0), label: 'ontem' };
  if (/\bhoje\b/.test(t)) return { from: day(0), to: end, label: 'hoje' };
  if (/\bsemana passada\b/.test(t)) {
    const dow = (now.getDay() + 6) % 7; // segunda = 0
    return { from: day(-dow - 7), to: day(-dow), label: 'semana passada' };
  }
  if (/\b(essa|esta|nessa|nesta) semana\b/.test(t)) return { from: day(-((now.getDay() + 6) % 7)), to: end, label: 'esta semana' };
  if (/\bmes passado\b/.test(t)) {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { from, to: new Date(now.getFullYear(), now.getMonth(), 1), label: 'mês passado' };
  }
  if (/\b(uns dias|outro dia|dias atras|esses dias)\b/.test(t)) return { from: day(-10), to: end, label: 'nos últimos dias' };
  return null;
}

/** Palavras que indicam o pedido, não o assunto — saem da busca. */
const REQUEST_WORDS = new Set(fold(
  'abre abrir abra mostra mostrar me lembra lembrar puxa puxar acha achar procura procurar busca buscar ' +
  'ideia ideias projeto projetos aquela aquele aquilo essa esse isso dessa desse daquela daquele naquela naquele ' +
  'que eu te voce falei falou tive tivemos gente a o os as um uma de da do das dos no na em pra para com sobre como era ' +
  'mesmo ta tava esta estava ligado qual quais onde tem alguma coisa ontem hoje semana passada mes anteontem dias outro ' +
  'analisa analise acha opiniao aprova aprovar arquiva arquivar tira deixa lado vamos seguir vai frente bora tocar ' +
  'acrescenta adiciona complementa inclui coloca tambem lembrei mais sobre nessa nesse',
).split(' '));

/** O assunto de uma referência ("aquela ideia do comparador de preços" → "comparador precos"). */
export function subjectOf(text: string): string {
  return fold(text).split(' ').filter((w) => w.length > 1 && !REQUEST_WORDS.has(w)).join(' ');
}

const LEAD_FILLERS = /^(mano |e ai |entao |olha |seguinte |o |oh )+/;
const IDEA_TRIGGERS = [
  LEAD_FILLERS,
  /^(eu )?tive (uma|um) (ideia|insight|sacada)( aqui)?( mano)?/,
  /^(bota|salva|anota|guarda|registra|coloca) ai( uma ideia)?/,
  /^(bota|coloca|anota) (uma|essa) ideia( ai)?/,
  /^e se a gente (criasse|fizesse|montasse|lancasse|abrisse)/,
  /^anota (uma parada|um negocio|isso|ai|essa)( aqui| ai)?/,
  /^(guarda|registra|salva|bota|coloca) (essa ideia|esse negocio|isso|nas ideias|nas nossas ideias)( pra depois| ai| aqui)?/,
  /^pensei (num|em um|numa|em uma) (negocio|parada|coisa)( aqui)?/,
  /^olha essa ideia/,
  /^deixa isso guardado( que depois a gente continua)?/,
];

/** A frase começa com um pedido claro de registrar ideia ("tive uma ideia", "anota aí"...). */
export function hasIdeaTrigger(raw: string): boolean {
  const f = fold(raw).replace(LEAD_FILLERS, '');
  return IDEA_TRIGGERS.slice(1).some((re) => re.test(f));
}

/** Conteúdo da ideia sem a frase de pedido ("tive uma ideia, quero criar..." → "quero criar..."). */
export function ideaContent(raw: string): string {
  let text = raw.trim();
  for (let pass = 0; pass < 3; pass++) {
    const f = fold(text);
    for (const re of IDEA_TRIGGERS) {
      const m = f.match(re);
      if (m && m[0].length) {
        // corta o mesmo número de palavras do texto original
        const n = m[0].trim().split(' ').length;
        text = text.split(/\s+/).slice(n).join(' ').replace(/^[\s,.:;!-]+/, '');
        break;
      }
    }
  }
  return text.trim();
}

/** Tira o pedido da frente ("quero colocar uma ideia nova de um app…" → "um app…"). */
export function stripRequest(content: string): string {
  return content
    .replace(/^(eu )?(quero|queria|vou|preciso|gostaria de|to querendo|tô querendo|estou querendo|pensei em|to pensando em|tô pensando em|estou pensando em)\s+/i, '')
    .replace(/^(colocar|registrar|anotar|salvar|guardar|cadastrar|adicionar|botar|te contar|contar|te explicar|explicar|te passar|passar|lançar|lancar)\s+/i, '')
    .replace(/^(uma |a )?(nova )?(ideia|proposta|sacada)( nova)?\s*(de |do |da |sobre |para |pra |:|,)?\s*/i, '')
    .replace(/^(de|do|da|sobre)\s+(?=(um|uma|o|a)\s)/i, '')
    .trim() || content.trim();
}

/** Título curto a partir do conteúdo, sem inventar nada. */
export function titleFrom(content: string): string {
  let t = content
    .replace(/^(eu )?(quero|queria|pensei em|e se a gente|a gente podia|bora|vamos)\s+/i, '')
    .replace(/^(criar|fazer|montar|desenvolver|lançar|lancar|criasse|fizesse|montasse)\s+/i, '')
    .replace(/^(um|uma|o|a)\s+/i, '')
    .split(/[.!?;\n]/)[0]
    .trim();
  const words = t.split(/\s+/);
  if (words.length > 8) t = words.slice(0, 8).join(' ') + '…';
  return t ? t[0].toUpperCase() + t.slice(1) : 'Ideia sem título';
}
