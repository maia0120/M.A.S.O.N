/**
 * BASE DE TESTE INDEPENDENTE — escrita em 27/11/2026, ANTES de qualquer ajuste da nova compreensão.
 * Regra: não usar para ajustar nada. Só para medir no fim de cada etapa.
 * Mensagens isoladas (sem contexto). Cenários que dependem de contexto estão nos testes de conversa.
 */
export const INDEPENDENTE: [string, string][] = [
  // registrar_ideia — inclusive sem "anota"/"tive uma ideia"
  ['Quero colocar uma ideia nova de gestão de um aplicativo de gestão financeira.', 'registrar_ideia'],
  ['mano tive uma ideia pra um aplicativo', 'registrar_ideia'],
  ['to pensando em criar um app de academia', 'registrar_ideia'],
  ['bora tirar do papel uma plataforma de cursos', 'registrar_ideia'],
  ['surgiu uma ideia aqui de um delivery de marmita', 'registrar_ideia'],
  ['queria registrar uma ideia', 'registrar_ideia'],
  ['deixa eu te contar uma ideia que eu tive', 'registrar_ideia'],
  ['tenho uma proposta de negócio pra te passar', 'registrar_ideia'],
  ['pensei num sisteminha pra controlar estoque de loja', 'registrar_ideia'],
  ['vamo adicionar uma ideia nova ai', 'registrar_ideia'],
  ['quero desenvolver um site de receitas', 'registrar_ideia'],
  ['ideia nova: app pra dividir conta de bar', 'registrar_ideia'],
  ['estou planejando montar um marketplace de artesanato', 'registrar_ideia'],
  ['tive uma sacada mto boa', 'registrar_ideia'],
  // ver_ideia
  ['quero ver aquela ideia antiga do delivery', 'ver_ideia'],
  ['cade a ideia do app de academia?', 'ver_ideia'],
  ['me mostra aquela ideia de cursos', 'ver_ideia'],
  ['qual era aquela ideia que eu te falei semana passada?', 'ver_ideia'],
  ['volta naquela ideia do marketplace', 'ver_ideia'],
  ['abre a ideia da marmita', 'ver_ideia'],
  ['lembra da plataforma de cursos?', 'ver_ideia'],
  // listar_ideias
  ['quais são minhas ideias?', 'listar_ideias'],
  ['me mostra todas as ideias salvas', 'listar_ideias'],
  ['o que já deixamos registrado de ideia?', 'listar_ideias'],
  ['tem quantas ideias guardadas?', 'listar_ideias'],
  ['lista as ideias aprovadas', 'listar_ideias'],
  // buscar
  ['procura o que a gente falou sobre pix', 'buscar'],
  ['recupera o que conversamos sobre preço', 'buscar'],
  ['onde ficou aquela proposta de parceria?', 'buscar'],
  ['tem algo salvo sobre assinatura mensal?', 'buscar'],
  ['agora quero procurar sobre entregas', 'buscar'],
  // complementar_ideia
  ['vamos melhorar aquela ideia do delivery colocando rastreio', 'complementar_ideia'],
  ['na ideia de cursos coloca que vai ter certificado', 'complementar_ideia'],
  ['esqueci de mencionar um detalhe na ideia da marmita', 'complementar_ideia'],
  ['adiciona mais uma funcionalidade na ideia do app de academia', 'complementar_ideia'],
  // analisar_ideia
  ['o que voce acha da ideia da marmita?', 'analisar_ideia'],
  ['essa ideia tem futuro?', 'analisar_ideia'],
  ['me fala os riscos do marketplace', 'analisar_ideia'],
  ['o que falta pra começar a ideia de cursos?', 'analisar_ideia'],
  ['analisa pra mim', 'analisar_ideia'],
  // aprovar / arquivar
  ['aprova a ideia do bar', 'aprovar_ideia'],
  ['pode marcar como aprovada', 'aprovar_ideia'],
  ['arquiva a ideia de receitas', 'arquivar_ideia'],
  ['desisti dessa ideia, arquiva', 'arquivar_ideia'],
  // criar_projeto_de_ideia
  ['quero criar um projeto com aquela ideia do delivery', 'criar_projeto_de_ideia'],
  ['transforma essa ideia em projeto', 'criar_projeto_de_ideia'],
  ['vamos começar a desenvolver a ideia de cursos', 'criar_projeto_de_ideia'],
  ['bora montar a primeira versão do app de academia', 'criar_projeto_de_ideia'],
  // preparar_para_claude
  ['prepara isso pro claude', 'preparar_para_claude'],
  ['organiza essa ideia pra eu mandar pro claude', 'preparar_para_claude'],
  ['estrutura melhor a ideia do marketplace', 'preparar_para_claude'],
  ['monta um prompt pro claude da ideia da marmita', 'preparar_para_claude'],
  // status_projeto
  ['como está aquele projeto do site?', 'status_projeto'],
  ['como anda o projeto da loja?', 'status_projeto'],
  ['o projeto do app tá em que etapa?', 'status_projeto'],
  // abrir_area
  ['abre os projetos', 'abrir_area'],
  ['me leva pra central de ideias', 'abrir_area'],
  ['entra nas configurações', 'abrir_area'],
  ['vai pra tela inicial', 'abrir_area'],
  // encerrar_explicacao
  ['é isso', 'encerrar_explicacao'],
  ['pronto, terminei', 'encerrar_explicacao'],
  ['acho que é só isso', 'encerrar_explicacao'],
  ['era isso que eu queria falar', 'encerrar_explicacao'],
  // anotar_informacao
  ['anota essa informação', 'anotar_informacao'],
  ['guarda isso pra mim: o cliente prefere azul', 'anotar_informacao'],
  ['lembra que a reunião é na sexta', 'anotar_informacao'],
  // continuar
  ['tem mais uma coisa', 'continuar'],
  ['outra coisa que eu pensei', 'continuar'],
  ['além disso', 'continuar'],
  ['peraí que ainda não acabei', 'continuar'],
  // corrigir
  ['não pera, não foi isso que eu quis dizer', 'corrigir'],
  ['deixa eu explicar melhor', 'corrigir'],
  ['corrigindo o que eu falei', 'corrigir'],
  ['esquece essa última parte', 'corrigir'],
  ['não era bem isso', 'corrigir'],
  // conversa básica
  ['bom dia meu consagrado', 'cumprimentar'],
  ['eai mason', 'cumprimentar'],
  ['valeuzão', 'agradecer'],
  ['brigado mano', 'agradecer'],
  ['isso', 'confirmar'],
  ['pode crer', 'confirmar'],
  ['não', 'negar'],
  ['negativo, não é esse', 'negar'],
  ['cancela', 'cancelar'],
  ['deixa quieto', 'cancelar'],
  ['como eu te uso?', 'ajuda'],
  ['o que você sabe fazer?', 'ajuda'],
  ['to cansadão hoje', 'papo'],
  ['e aí, como você tá?', 'papo'],
  ['hoje o dia foi puxado', 'papo'],
];
