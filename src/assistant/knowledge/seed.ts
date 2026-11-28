/**
 * BASE INICIAL DE CONHECIMENTO DO MASON — REVISADA PELO GABRIEL EM 27/11/2026 (Fase 0)
 *
 * É daqui que o interpretador aprende a entender as mensagens desde o primeiro uso (decisões D6 e D6a).
 * Nada aqui é regra de palavra exata: as frases são EXEMPLOS de significado. O interpretador compara
 * a mensagem real com esses exemplos pelo sentido (modelo de significados) e pela forma (pedaços de palavras).
 */

export interface IntentSeed {
  id: string;
  label: string;
  group: 'conversa' | 'ideias' | 'busca' | 'navegacao';
  examples: string[];
}

export const INTENTS: IntentSeed[] = [
  /* ---------------- Conversa básica ---------------- */
  {
    id: 'cumprimentar', label: 'Cumprimentar', group: 'conversa',
    examples: ['e aí mason', 'opa', 'fala mason', 'bom dia', 'boa tarde', 'boa noite', 'e aí, tudo certo?', 'cheguei'],
  },
  {
    id: 'agradecer', label: 'Agradecer', group: 'conversa',
    examples: ['valeu', 'obrigado', 'brigadão', 'show, valeu', 'perfeito, obrigado', 'tmj', 'muito bom, valeu'],
  },
  {
    id: 'confirmar', label: 'Confirmar (sim)', group: 'conversa',
    examples: ['sim', 'isso', 'isso mesmo', 'exatamente', 'pode ser', 'pode', 'manda ver', 'beleza', 'fechou', 'confirmo', 'é essa mesma', 'pode fazer', 'tá certo', 'positivo'],
  },
  {
    id: 'negar', label: 'Negar (não)', group: 'conversa',
    examples: ['não', 'nada a ver', 'não é essa', 'não foi isso', 'errado', 'não quero', 'deixa quieto'],
  },
  {
    id: 'cancelar', label: 'Cancelar', group: 'conversa',
    examples: ['cancela', 'esquece', 'deixa pra lá', 'esquece isso', 'não precisa mais', 'desconsidera'],
  },
  {
    id: 'corrigir', label: 'Corrigir o que acabou de dizer', group: 'conversa',
    examples: ['não, pera aí', 'pensei melhor', 'na verdade é outra coisa', 'muda essa parte', 'corrige aí', 'não é bem isso, é assim', 'troca isso', 'falei errado', 'me expressei mal'],
  },
  {
    id: 'continuar', label: 'Continuar a explicação', group: 'conversa',
    examples: ['e tem mais', 'deixa eu terminar', 'peraí que tem mais', 'continuando', 'e outra coisa', 'além disso', 'ah, e também', 'só complementando'],
  },
  {
    id: 'ajuda', label: 'Perguntar o que ele faz', group: 'conversa',
    examples: ['o que você faz?', 'como você funciona?', 'me ajuda', 'quais comandos você entende?', 'o que dá pra fazer aqui?', 'tô perdido'],
  },
  {
    id: 'papo', label: 'Papo casual', group: 'conversa',
    examples: ['como você tá?', 'tudo bem contigo?', 'tá aí?', 'dia puxado hoje', 'tô cansado', 'bora trabalhar', 'que dia, hein'],
  },

  /* ---------------- Ideias ---------------- */
  {
    id: 'registrar_ideia', label: 'Registrar ideia nova', group: 'ideias',
    examples: [
      'tive uma ideia', 'seguinte, tive uma ideia', 'anota uma parada aqui', 'anota isso',
      'guarda essa ideia', 'registra esse negócio', 'coloca isso nas nossas ideias', 'pensei num negócio aqui',
      'e se a gente criasse um site', 'quero criar um app que', 'salva essa ideia pra depois', 'deixa isso guardado que depois a gente continua',
      'bota nas ideias', 'olha essa ideia',
    ],
  },
  {
    id: 'complementar_ideia', label: 'Acrescentar algo a uma ideia', group: 'ideias',
    examples: [
      'acrescenta nessa ideia', 'coloca também que', 'adiciona isso na ideia do comparador', 'complementa aquela ideia',
      'lembrei de mais uma coisa sobre aquela ideia', 'nessa ideia também tem', 'inclui isso',
    ],
  },
  {
    id: 'ver_ideia', label: 'Ver/abrir uma ideia', group: 'ideias',
    examples: [
      'lembra daquela ideia?', 'tá ligado naquela ideia que eu te falei ontem?', 'abre a ideia do comparador', 'me mostra aquela ideia',
      'como era aquela ideia mesmo?', 'puxa aquela ideia de agendamento', 'qual era a ideia do site de preços?',
    ],
  },
  {
    id: 'listar_ideias', label: 'Listar ideias', group: 'ideias',
    examples: [
      'quais ideias eu tenho?', 'mostra minhas ideias', 'lista as ideias', 'o que tem na central de ideias?',
      'quais ideias tão paradas?', 'ideias aprovadas', 'tem ideia nova?',
    ],
  },
  {
    id: 'analisar_ideia', label: 'Analisar ideia criticamente', group: 'ideias',
    examples: [
      'o que você acha dessa ideia?', 'não sei se essa ideia vale a pena', 'analisa essa ideia', 'essa ideia é boa?',
      'quais os riscos disso?', 'onde essa ideia pode dar errado?', 'me dá tua opinião sincera', 'vale a pena investir nisso?',
    ],
  },
  {
    id: 'aprovar_ideia', label: 'Aprovar ideia', group: 'ideias',
    examples: ['aprova essa ideia', 'essa vai pra frente', 'bora tocar essa', 'pode aprovar', 'essa ideia tá aprovada', 'vamos seguir com essa'],
  },
  {
    id: 'arquivar_ideia', label: 'Arquivar ideia', group: 'ideias',
    examples: ['arquiva essa ideia', 'tira essa das ideias ativas', 'essa não vai rolar', 'deixa essa de lado', 'esquece essa ideia por enquanto'],
  },

  /* ---------------- Busca ---------------- */
  {
    id: 'buscar', label: 'Procurar algo salvo', group: 'busca',
    examples: [
      'procura aquele negócio de', 'acha pra mim', 'onde tá aquela parada de', 'busca', 'tem alguma coisa sobre',
      'a gente já falou sobre', 'eu já tinha pensado em algo parecido?', 'o que a gente decidiu sobre',
    ],
  },
  {
    id: 'status_projeto', label: 'Perguntar como está um projeto', group: 'busca',
    examples: ['como é que tá aquele projeto mesmo?', 'em que pé tá o projeto', 'como anda o projeto da agenda?', 'o que falta no projeto', 'resumo do projeto'],
  },

  /* ---------------- Navegação ---------------- */
  {
    id: 'abrir_area', label: 'Abrir uma área do app', group: 'navegacao',
    examples: [
      'abre aquele negócio lá de desenvolvimento', 'vai pra central de ideias', 'abre os projetos', 'me leva pro dashboard',
      'abre as configurações', 'mostra a memória', 'volta pro início', 'abre o comercial', 'vai pro design', 'abre o marketing',
    ],
  },
];

/** Como cada área pode ser chamada na fala. */
export const SECTION_ALIASES: Record<string, string[]> = {
  'work-dashboard': ['início', 'dashboard', 'painel', 'visão geral', 'tela inicial', 'home'],
  ideas: ['ideias', 'central de ideias', 'central', 'banco de ideias'],
  development: ['desenvolvimento', 'dev', 'parte técnica', 'programação'],
  design: ['design', 'criação', 'visual', 'design e criação'],
  marketing: ['marketing', 'estratégia', 'divulgação'],
  commercial: ['comercial', 'vendas', 'clientes comerciais', 'propostas'],
  projects: ['projetos', 'projetos e clientes', 'acompanhamento'],
  memory: ['memória', 'o que você sabe', 'lembranças'],
  settings: ['configurações', 'ajustes', 'config'],
};

/** Gírias e expressões. O significado é uma pista, o contexto continua mandando (D8). */
export const EXPRESSIONS: { expression: string; meaning: string }[] = [
  { expression: 'mano', meaning: 'Vocativo informal; não muda o pedido.' },
  { expression: 'parada', meaning: 'Coisa, assunto, ideia (genérico).' },
  { expression: 'negócio', meaning: 'Coisa, assunto (genérico) — também pode ser "empresa/negócio" de fato.' },
  { expression: 'seguinte', meaning: 'Vai começar uma explicação.' },
  { expression: 'ó', meaning: 'Chamar atenção antes de falar algo.' },
  { expression: 'tá ligado', meaning: 'Você lembra / você entende?' },
  { expression: 'pera aí', meaning: 'Vai corrigir ou complementar o que disse.' },
  { expression: 'joga pro Claude', meaning: 'Preparar o material/prompt para enviar ao Claude.' },
  { expression: 'deixa guardado', meaning: 'Salvar para continuar depois.' },
  { expression: 'bora', meaning: 'Vamos / pode começar.' },
  { expression: 'fechou', meaning: 'Concordo / combinado.' },
  { expression: 'tmj', meaning: 'Agradecimento ("tamo junto").' },
  { expression: 'de boa', meaning: 'Tudo bem / sem problema.' },
  { expression: 'engavetar', meaning: 'Arquivar, deixar de lado.' },
  { expression: 'tocar (um projeto)', meaning: 'Levar adiante, executar.' },
  { expression: 'subir (um site)', meaning: 'Publicar.' },
  { expression: 'dar um gás', meaning: 'Priorizar, acelerar.' },
  { expression: 'tá osso', meaning: 'Está difícil.' },
  { expression: 'mó / mó cota', meaning: 'Muito / faz muito tempo.' },
  { expression: 'pra ontem', meaning: 'Urgente.' },
];

/** Abreviações e grafias informais → forma normalizada. */
export const NORMALIZATION: Record<string, string> = {
  vc: 'você', vcs: 'vocês', tb: 'também', tbm: 'também', pq: 'porque', q: 'que', oq: 'o que', cmg: 'comigo', ctg: 'contigo',
  ta: 'está', tá: 'está', tô: 'estou', to: 'estou', tava: 'estava', pra: 'para', pro: 'para o', pros: 'para os', num: 'em um', numa: 'em uma',
  blz: 'beleza', vlw: 'valeu', obg: 'obrigado', msg: 'mensagem', hj: 'hoje', amn: 'amanhã', qdo: 'quando', qnd: 'quando',
  mt: 'muito', mto: 'muito', msm: 'mesmo', ngm: 'ninguém', td: 'tudo', tds: 'todos', cê: 'você', ce: 'você', né: 'não é',
};

/** Termos do trabalho do Gabriel, usados para categorizar e extrair entidades. */
export const VOCABULARY: { term: string; kind: string }[] = [
  { term: 'site', kind: 'tipo_ideia' }, { term: 'landing page', kind: 'tipo_ideia' }, { term: 'aplicativo', kind: 'tipo_ideia' },
  { term: 'app', kind: 'tipo_ideia' }, { term: 'plataforma', kind: 'tipo_ideia' }, { term: 'sistema', kind: 'tipo_ideia' },
  { term: 'marketplace', kind: 'tipo_ideia' }, { term: 'serviço', kind: 'tipo_ideia' }, { term: 'conteúdo', kind: 'tipo_ideia' },
  { term: 'loja', kind: 'tipo_ideia' }, { term: 'Claude', kind: 'ferramenta' }, { term: 'Lovable', kind: 'ferramenta' },
  { term: 'GitHub', kind: 'ferramenta' }, { term: 'Vercel', kind: 'ferramenta' }, { term: 'cliente', kind: 'negocio' },
  { term: 'proposta', kind: 'negocio' }, { term: 'orçamento', kind: 'negocio' }, { term: 'prazo', kind: 'tempo' },
  { term: 'dashboard', kind: 'produto' },
];

/** Critérios de análise crítica por tipo de ideia (D3, D3a). Cada um vira pergunta ou risco. */
export const CRITERIA: { category: string; criterion: string; question: string }[] = [
  { category: 'geral', criterion: 'Público', question: 'Para quem exatamente é isso?' },
  { category: 'geral', criterion: 'Problema', question: 'Qual problema concreto resolve? Essas pessoas já tentam resolver de outro jeito?' },
  { category: 'geral', criterion: 'Monetização', question: 'Como isso gera dinheiro (ou qual é o retorno)?' },
  { category: 'geral', criterion: 'Diferencial', question: 'Por que alguém usaria isso e não uma alternativa que já existe?' },
  { category: 'geral', criterion: 'Primeira versão', question: 'Qual é a menor versão que já dá para testar?' },
  { category: 'geral', criterion: 'Esforço', question: 'Quanto trabalho a primeira versão exige comparado ao que você tem em andamento?' },
  { category: 'site/plataforma', criterion: 'Origem dos dados', question: 'De onde vêm as informações exibidas e como se mantêm atualizadas?' },
  { category: 'site/plataforma', criterion: 'Tráfego', question: 'Como as pessoas vão chegar até o site?' },
  { category: 'marketplace', criterion: 'Dois lados', question: 'Como atrair os dois lados (quem oferece e quem compra) no começo?' },
  { category: 'marketplace', criterion: 'Confiança', question: 'Como garantir confiança entre as partes (avaliações, pagamentos, disputas)?' },
  { category: 'aplicativo', criterion: 'Retenção', question: 'Por que a pessoa abriria o app de novo na semana seguinte?' },
  { category: 'aplicativo', criterion: 'Publicação', question: 'Vai para a loja (Play Store) ou é de uso interno?' },
  { category: 'serviço', criterion: 'Escala', question: 'O serviço depende do seu tempo? Como atender mais clientes sem travar?' },
  { category: 'serviço', criterion: 'Preço', question: 'Como vai precificar e quanto o cliente paga hoje por algo parecido?' },
  { category: 'conteúdo', criterion: 'Frequência', question: 'Qual frequência você consegue manter de verdade?' },
  { category: 'conteúdo', criterion: 'Canal', question: 'Em qual canal e formato esse conteúdo funciona melhor?' },
  { category: 'riscos comuns', criterion: 'Dependência externa', question: 'Depende de API, plataforma ou parceiro que pode mudar as regras?' },
  { category: 'riscos comuns', criterion: 'Legal', question: 'Envolve dados pessoais, pagamentos ou direitos de terceiros?' },
  { category: 'riscos comuns', criterion: 'Concorrência', question: 'Já existe algo muito parecido? (Eu não consigo verificar o mercado sozinho — você confirma.)' },
];

/**
 * Modelos de resposta no tom Jarvis (D1, D2). {nome} = "Gabriel" ou "senhor" conforme a seriedade.
 * Várias versões por situação para não soar repetitivo.
 */
export const RESPONSES: { situation: string; tone: 'diaadia' | 'serio'; text: string }[] = [
  { situation: 'cumprimento', tone: 'diaadia', text: 'Boa tarde, Gabriel. No que vamos trabalhar?' },
  { situation: 'cumprimento', tone: 'diaadia', text: 'Opa, Gabriel. Estou por aqui.' },
  { situation: 'agradecimento', tone: 'diaadia', text: 'Por nada, Gabriel.' },
  { situation: 'ideia_registrada', tone: 'diaadia', text: 'Registrei a ideia "{titulo}". Quer que eu faça uma análise agora ou prefere continuar explicando?' },
  { situation: 'ideia_parecida', tone: 'diaadia', text: 'Antes de salvar: essa ideia lembra "{outra}", registrada em {data}. É uma nova ou um complemento dela?' },
  { situation: 'ouvindo_explicacao', tone: 'diaadia', text: 'Pode continuar, estou acompanhando.' },
  { situation: 'pergunta_confusa', tone: 'diaadia', text: 'Gabriel, não tenho certeza do que você quer: {opcao1} ou {opcao2}?' },
  { situation: 'confirmar_referencia', tone: 'diaadia', text: 'Você está falando de "{titulo}", de {data}?' },
  { situation: 'nao_encontrado', tone: 'diaadia', text: 'Não encontrei nada sobre isso. Pode me dar mais um detalhe?' },
  { situation: 'area_aberta', tone: 'diaadia', text: 'Abrindo {area}.' },
  { situation: 'analise', tone: 'serio', text: 'Senhor, analisando a proposta: {pontos_fortes}. Os pontos que me preocupam são: {riscos}. Antes de seguir, eu validaria: {validar}.' },
  { situation: 'discordar', tone: 'serio', text: 'Senhor, eu não recomendo isso: {motivo}. Uma alternativa seria {alternativa}.' },
  { situation: 'discordar_insistencia', tone: 'serio', text: 'Entendido, senhor. Só reforço uma última vez: {motivo}. Se mantiver, eu sigo e deixo registrada a observação.' },
  { situation: 'cumprir_apos_discordar', tone: 'serio', text: 'Feito como o senhor decidiu. Registrei minha observação para referência futura.' },
  { situation: 'confirmar_exclusao', tone: 'serio', text: 'Senhor, isso vai apagar "{titulo}" definitivamente. Confirma?' },
  { situation: 'falha', tone: 'serio', text: 'Não consegui concluir, senhor: {erro}.' },
  { situation: 'nao_sei', tone: 'diaadia', text: 'Isso eu não sei, Gabriel. {complemento}' },
  { situation: 'fora_do_alcance', tone: 'diaadia', text: 'Esse tipo de conversa ainda está além do que eu consigo fazer bem. Posso registrar como ideia ou anotação, se quiser.' },
];
