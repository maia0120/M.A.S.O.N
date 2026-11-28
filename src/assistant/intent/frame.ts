import { fold } from './normalize';
import { NORMALIZATION, SECTION_ALIASES } from '../knowledge/seed';

/**
 * ANÁLISE DA FRASE (camada 2 da nova compreensão — docs/COMPREENSAO-PROPOSTA.md).
 *
 * Em vez de comparar a frase inteira com exemplos, identifica PAPÉIS:
 *  - ação (criar, encontrar, acrescentar, corrigir, analisar…), por classes de verbos e expressões;
 *  - objeto (ideia, projeto, produto, informação);
 *  - novidade: algo NOVO ("uma ideia nova", "tive", "surgiu") × algo que JÁ EXISTE ("aquela", "antiga", "a ideia do X");
 *  - negação, pergunta, assunto.
 * Depois gera EVIDÊNCIAS por intenção. Nenhuma palavra isolada decide: as regras combinam ação + objeto + novidade.
 */
export type Action =
  | 'criar' | 'pensar' | 'guardar' | 'encontrar' | 'acrescentar' | 'corrigir' | 'analisar' | 'aprovar' | 'arquivar'
  | 'consultar_estado' | 'navegar' | 'projeto_de_ideia' | 'preparar' | 'encerrar' | 'continuar' | 'anotar';

export interface Frame {
  text: string;
  actions: Set<Action>;
  objects: { ideia: boolean; projeto: boolean; produto: string | null; informacao: boolean };
  nova: boolean;
  existente: boolean;
  plural: boolean;
  pergunta: boolean;
  negada: boolean;
  secao: string | null;
  /** O que vem depois de "de/do/da/sobre/para…" — o assunto da mensagem. */
  assunto: string;
  /** Evidência por intenção (0–1) e o motivo, para o diagnóstico. */
  evidence: Map<string, { score: number; why: string }>;
}

const ABBREV: Record<string, string> = Object.fromEntries(Object.entries(NORMALIZATION).map(([k, v]) => [fold(k), fold(v)]));
const EXTRA: Record<string, string> = { vamo: 'vamos', bora: 'vamos', cade: 'cade', sisteminha: 'sistema', appzinho: 'app', ideiazinha: 'ideia', mto: 'muito' };

export function prepare(raw: string): string {
  return fold(raw).split(' ').filter(Boolean).map((w) => EXTRA[w] ?? ABBREV[w] ?? w).join(' ');
}

const R = (src: string) => new RegExp(`(^| )(${src})( |$)`);

const PRODUTO = 'app|aplicativo|site|plataforma|sistema|loja|marketplace|negocio|empresa|servico|ferramenta|bot|curso|canal|delivery|landing page|software|jogo|blog|ecommerce|e commerce';

const P = {
  // ---- ações
  pensar: R('tive|tenho|tava com|estou com|me veio|surgiu|bolei|pensei|pensando|planejando|imaginei|imaginando|querendo|explicar uma|contar uma|te contar|te explicar uma|te passar'),
  criar: R('criar|crio|cria|crie|fazer|faco|faz|montar|monta|monte|desenvolver|desenvolve|lancar|construir|comecar|iniciar|abrir uma|abrir um|tirar do papel|tirar uma ideia do papel'),
  guardar: R('anota|anotar|anote|guarda|guardar|registra|registrar|registre|salva|salvar|bota|botar|coloca|colocar|adiciona|adicionar|cadastra|cadastrar|vamos adicionar'),
  encontrar: R('abre a ideia|abre aquela|abrir a ideia|abre a do|abre a da|procura|procurar|busca|buscar|acha|achar|encontra|encontrar|recupera|recuperar|ver|rever|mostra|mostrar|lembra da|lembra do|lembra daquela|lembra daquele|lembra das|cade|onde ficou|onde esta|qual era|quais|lista|listar|volta naquela|volta naquele|voltar naquela|voltar naquele|voltar no|puxa|quantas|quantos'),
  acrescentar: R('adiciona nessa|adiciona nesse|adiciona na|adiciona no|acrescenta nessa|bota nessa|coloca nessa|melhora|melhorar|acrescenta|acrescentar|complementa|complementar|complementando aquilo|adiciona mais|adicionar mais|inclui na|inclui no|coloca na|coloca no|esqueci de mencionar|mais uma funcionalidade|dava para ter|poderia ter|tambem pensei|tambem poderia|tambem dava'),
  corrigir: /(nao pera|pera nao|nao foi isso|explicar melhor|na verdade|na real|corrigindo|corrige o|esquece essa ultima|nao era bem|nao e bem assim|mudar o que falei|mudar uma parte|me enganei|falei errado|falei besteira|pensando melhor|me confundi|me expressei mal)/,
  analisar: /(o que voce acha|que voce acha|que acha d|opiniao|riscos?|pontos? fracos?|vale a pena|tem futuro|presta|e boa|da certo|dar errado|da dinheiro|analisa|analise|analisada|o que falta para comecar|e viavel)/,
  aprovar: /((^| )(aprova|aprovar|aprove)( |$))|marcar como aprovad|pode seguir com|vamos seguir com|(ta|esta) aprovada( |$)|aprovada a /,
  arquivar: /((^| )(arquiva|arquivar|arquive)( |$))|desisti|deixa essa ideia de lado|deixa essa de lado|deixa a d.* de lado|tira da lista|tira essa|nao vai rolar|engaveta/,
  estado: /(como (esta|anda|estava|ta|vai) (o |aquele |a |aquela |esse )?(projeto|app|aplicativo|site|sistema|loja)|em que pe|que etapa|andou|resumo do projeto|o que falta no projeto|qual era aquele projeto|como estava aquele)/,
  projeto_de_ideia: /(projeto (com|para|dessa|desta|da|do|daquela) .*ideia|cria(r)? (o|um) projeto (para|da|do|dessa)|transforma(r)? .*(em|num) projeto|virar projeto|comecar a desenvolver|vamos desenvolver|desenvolver a ideia|primeira versao|cria(r)? o projeto|criar o projeto dessa)/,
  preparar: /(claude|organiza|organizar|estrutura|estruturar|documento tecnico|um prompt|o prompt|como (a gente )?poderia construir|como poderiamos construir)/,
  encerrar: /(^(e isso|pronto|terminei|e so isso|so isso|acabou|era isso|por enquanto e so)( |$))|(e isso ai terminei|pronto terminei|era isso que eu queria|acho que e so isso|e so isso por enquanto|por enquanto e so)/,
  continuar: /^(tem mais|outra coisa|alem disso|ah e|e tem mais|tem outro ponto|so complementando|continuando|pera ai que|pera que|peraí que|ainda nao (acabei|terminei)|deixa eu terminar)/,
  anotar: /((anota|guarda|registra|salva) (essa|esta) informacao)|((anota|guarda|lembra|registra) (que|isso para mim|essa))|^lembra que/,
  // ---- objetos e marcadores
  ideia: R('ideia|ideias|insight|sacada|proposta|possibilidade|conceito'),
  projeto: R('projeto|projetos'),
  produto: R(PRODUTO),
  informacao: R('informacao|detalhe|lembrete'),
  nova: R('nova|novo|uma ideia|tive|surgiu|me veio|pensei|pensando|em mente|tirar do papel|uma coisa|uma proposta|uma sacada|uma possibilidade|na cabeca|' + PRODUTO.split('|').map((p) => `um ${p}|uma ${p}`).join('|')),
  existente: R('aquela|aquele|aquilo|antiga|antigo|daquela|daquele|naquela|naquele|a ideia do|a ideia da|a ideia de|a ideia dos|a ideia das|o projeto do|o projeto da|que eu falei|que eu te falei|a gente tinha|a gente falou|ja|salvas|salva|registrada|registradas|registrado|guardadas|essa ideia|dessa ideia|nessa ideia|minhas ideias|na ideia|da ideia'),
  plural: R('ideias|todas|todos|quais|quantas|minhas|lista|listar|tudo'),
  sobreAssunto: /(sobre|falou de|falei de|falamos de|disse sobre|conversamos|decidimos|decidiu|assunto|algo salvo|alguma coisa)/,
};

const NEGACAO = /(^| )nao (quero|vou|precisa|e para|e pra) /;

export function findSectionIn(text: string): string | null {
  const t = ` ${text} `;
  let best: { id: string; len: number } | null = null;
  for (const [id, aliases] of Object.entries(SECTION_ALIASES)) {
    for (const a of aliases) {
      const f = fold(a);
      if (t.includes(` ${f} `) && (!best || f.length > best.len)) best = { id, len: f.length };
    }
  }
  return best?.id ?? null;
}

function extractAssunto(t: string): string {
  const m = t.match(/ (?:de|do|da|dos|das|sobre|para|pra|com) (.+)$/);
  return (m ? m[1] : '').replace(/\b(mesmo|ai|aqui|por favor)\b/g, '').trim();
}

export function analyzeFrame(raw: string): Frame {
  const text = prepare(raw);
  const has = (re: RegExp) => re.test(text);
  const actions = new Set<Action>();
  const map: [Action, RegExp][] = [
    ['pensar', P.pensar], ['criar', P.criar], ['guardar', P.guardar], ['encontrar', P.encontrar], ['acrescentar', P.acrescentar],
    ['corrigir', P.corrigir], ['analisar', P.analisar], ['aprovar', P.aprovar], ['arquivar', P.arquivar], ['consultar_estado', P.estado],
    ['projeto_de_ideia', P.projeto_de_ideia], ['preparar', P.preparar], ['encerrar', P.encerrar], ['continuar', P.continuar], ['anotar', P.anotar],
  ];
  for (const [a, re] of map) if (has(re)) actions.add(a);
  const secao = findSectionIn(text);
  if (secao && /(^| )(abre|abrir|vai para|vai pra|me leva|leva para|entra n|entra em|volta para|ir para|quero ver a tela|mostra a tela)/.test(text)) actions.add('navegar');

  const produtoMatch = text.match(P.produto);
  const f: Frame = {
    text,
    actions,
    objects: { ideia: has(P.ideia), projeto: has(P.projeto), produto: produtoMatch ? produtoMatch[2] : null, informacao: has(P.informacao) },
    nova: has(P.nova),
    existente: has(P.existente),
    plural: has(P.plural),
    pergunta: /\?\s*$/.test(raw) || /^(qual|quais|como|onde|cade|o que|quantas|quantos|tem )/.test(text),
    negada: NEGACAO.test(` ${text} `),
    secao,
    assunto: extractAssunto(text),
    evidence: new Map(),
  };
  scoreFrame(f);
  return f;
}

function ev(f: Frame, intent: string, score: number, why: string) {
  const cur = f.evidence.get(intent);
  if (!cur || score > cur.score) f.evidence.set(intent, { score, why });
}

function scoreFrame(f: Frame) {
  const a = f.actions;
  const o = f.objects;
  const algoNovo = f.nova && !f.existente;
  const algoExistente = f.existente && !(f.nova && /(nova|novo)/.test(f.text));

  if (a.has('encerrar')) ev(f, 'encerrar_explicacao', 0.95, 'fim da explicação ("é isso", "pronto")');
  if (a.has('continuar')) ev(f, 'continuar', a.has('corrigir') ? 0.7 : 0.9, 'continuação ("tem mais", "além disso")');
  if (a.has('corrigir')) ev(f, 'corrigir', 0.88, 'correção ("na verdade", "não foi isso")');
  if (a.has('projeto_de_ideia')) ev(f, 'criar_projeto_de_ideia', 0.9, 'transformar ideia em projeto');
  if (a.has('preparar') && !a.has('projeto_de_ideia')) ev(f, 'preparar_para_claude', 0.86, 'organizar/preparar para o Claude');
  if (a.has('anotar')) ev(f, 'anotar_informacao', 0.86, 'anotar uma informação');
  if (a.has('navegar')) ev(f, 'abrir_area', 0.88, `abrir a área ${f.secao}`);
  if (a.has('analisar')) ev(f, 'analisar_ideia', 0.86, 'pedido de opinião/análise');
  if (a.has('aprovar')) ev(f, 'aprovar_ideia', 0.88, 'aprovar');
  if (a.has('arquivar')) ev(f, 'arquivar_ideia', 0.88, 'arquivar/desistir');
  if (a.has('consultar_estado')) {
    if (o.ideia && !o.projeto) ev(f, 'ver_ideia', 0.8, 'como está + ideia');
    else ev(f, 'status_projeto', 0.86, 'como está + projeto/produto');
  }

  // Encontrar algo que já existe
  if (a.has('encontrar') && !f.negada) {
    if ((/(^| )(proposta|assunto)( |$)/.test(f.text) || P.sobreAssunto.test(f.text)) && !/(^| )ideias?( |$)/.test(f.text)) ev(f, 'buscar', 0.84, 'encontrar + assunto');
    else if (o.ideia && f.plural && !/a ideia d/.test(f.text)) ev(f, 'listar_ideias', 0.86, 'encontrar + várias ideias');
    else if ((o.ideia || o.produto) && !algoNovo) ev(f, 'ver_ideia', 0.84, 'encontrar + uma ideia que já existe');
    else if (P.sobreAssunto.test(f.text) || /proposta|assunto/.test(f.text)) ev(f, 'buscar', 0.84, 'encontrar + assunto');
    else if (/^(quais|quantas|lista)/.test(f.text) && o.ideia) ev(f, 'listar_ideias', 0.8, 'pergunta por ideias');
    else if (o.projeto && f.existente) ev(f, 'status_projeto', 0.7, 'aquele projeto');
    else if (!o.ideia) ev(f, 'buscar', 0.62, 'encontrar (genérico)');
  }
  if (!a.has('encontrar') && f.pergunta && P.sobreAssunto.test(f.text) && !a.has('analisar')) ev(f, 'buscar', 0.7, 'pergunta sobre o que foi dito/decidido');
  if (/(tem|ha) (alguma|algo|alguma coisa).*(sobre|salvo)/.test(f.text)) ev(f, 'buscar', 0.86, 'tem algo salvo sobre…');
  if (/o que (ja )?(deixamos|temos|tem|eu tenho|a gente tem) (de ideia )?(registrado|salvo|guardado)/.test(f.text)) ev(f, 'listar_ideias', 0.84, 'o que já está registrado');

  // Acrescentar a algo existente
  if (a.has('acrescentar') && !a.has('corrigir')) {
    ev(f, 'complementar_ideia', algoExistente || /(na|da) ideia/.test(f.text) ? 0.88 : 0.74, 'acrescentar/melhorar');
  }

  // Criar algo novo (ideia)
  // "tenho" numa pergunta/listagem é posse ("o que eu tenho de ideia"), não criação
  const soPosse = a.has('encontrar') && !a.has('criar') && !a.has('guardar') && !/(^| )(tive|surgiu|me veio|pensei|pensando)( |$)/.test(f.text);
  const criarAlgo = (a.has('criar') || a.has('pensar') || a.has('guardar')) && !soPosse;
  if (a.has('guardar') && /(^| )(essa|esta) ideia( |$)/.test(f.text) && !/(nessa|dessa|naquela|na) ideia/.test(f.text) && !a.has('acrescentar')) ev(f, 'registrar_ideia', 0.9, 'guardar a ideia que está sendo contada');
  if (criarAlgo && !f.negada && !a.has('projeto_de_ideia') && !a.has('anotar') && !a.has('acrescentar')) {
    if (o.ideia && !algoExistente) ev(f, 'registrar_ideia', 0.92, 'criar/guardar + ideia nova');
    else if (o.produto && !algoExistente && !a.has('navegar')) ev(f, 'registrar_ideia', 0.88, `criar + ${o.produto}`);
    else if (o.projeto && (f.nova || /em mente|novo/.test(f.text)) && !algoExistente) ev(f, 'registrar_ideia', 0.84, 'projeto novo em mente');
    else if (a.has('pensar') && f.nova && !o.projeto && !a.has('encontrar')) ev(f, 'registrar_ideia', 0.82, 'tive/pensei/surgiu algo');
    else if (a.has('guardar') && /(uma coisa|uma ideia|isso|ai)( |$)/.test(f.text) && !o.informacao) ev(f, 'registrar_ideia', 0.8, 'anota/guarda algo');
    else if (a.has('criar') && /(algo|alguma coisa)/.test(f.text)) ev(f, 'registrar_ideia', 0.8, 'criar algo');
  }
  if (/^ideia( nova)?( |$)/.test(f.text) && !f.pergunta) ev(f, 'registrar_ideia', 0.9, '"ideia: …"');
  if (a.has('guardar') && o.informacao) ev(f, 'anotar_informacao', 0.86, 'guardar informação');
}

/** Ajustes que o contexto da análise impõe às outras fontes (exemplos e modelo de significados). */
export function penalties(f: Frame): Map<string, number> {
  const p = new Map<string, number>();
  const set = (i: string, m: number) => p.set(i, Math.min(p.get(i) ?? 1, m));
  const top = [...f.evidence.values()].reduce((m, e) => Math.max(m, e.score), 0);
  if (f.nova && !f.existente) { set('listar_ideias', 0.5); set('ver_ideia', 0.5); set('buscar', 0.6); }
  if (f.existente && !f.nova) set('registrar_ideia', 0.55);
  if (f.actions.has('corrigir')) set('continuar', 0.7);
  if (f.actions.has('encerrar')) { set('confirmar', 0.6); set('continuar', 0.6); }
  // "quero …" não é negação sem "não"
  if (!/(^| )nao( |$)/.test(f.text) && /(^| )(quero|queria|vamos|preciso)( |$)/.test(f.text)) { set('negar', 0.45); set('cancelar', 0.7); }
  if (top >= 0.8) {
    for (const i of ['negar', 'confirmar', 'cumprimentar', 'agradecer', 'papo', 'ajuda']) set(i, 0.6);
  }
  return p;
}
