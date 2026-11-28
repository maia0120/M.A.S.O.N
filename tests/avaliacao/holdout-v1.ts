import { interpret } from '../../src/assistant/intent/interpreter';
/**
 * CONJUNTO INDEPENDENTE DE AVALIAÇÃO (v1, 27/11/2026)
 * Regra: estas frases NUNCA podem ser usadas para ajustar a base, os sinais fortes ou os limiares.
 * Servem só para medir. Quando um ajuste for feito, cria-se um conjunto v2 com frases novas.
 * Rodar: npm run avaliar
 */
// Conjunto independente: frases escritas para a auditoria, NÃO usadas em nenhum ajuste.
const C: [string,string][] = [
 ['olá mason, beleza?','cumprimentar'],['opa, bom dia','cumprimentar'],['salve salve','cumprimentar'],['e aí meu chapa','cumprimentar'],
 ['valeu demais','agradecer'],['obrigado pela força','agradecer'],['show de bola, obrigado','agradecer'],['muito obrigado mason','agradecer'],
 ['pode sim, manda','confirmar'],['isso mesmo, essa aí','confirmar'],['claro','confirmar'],['positivo, pode seguir','confirmar'],
 ['não, não é isso','negar'],['errado, não é essa','negar'],['nada a ver mano','negar'],['não quero não','negar'],
 ['para tudo, esquece','cancelar'],['deixa pra lá mesmo','cancelar'],['cancela essa parada','cancelar'],['desconsidera o que eu falei','cancelar'],
 ['opa, falei besteira, corrige','corrigir'],['na verdade não era isso, era outra coisa','corrigir'],['espera, me confundi','corrigir'],['muda isso aí que eu errei','corrigir'],
 ['ah, e tem outra coisa','continuar'],['deixa eu completar','continuar'],['só mais um detalhe','continuar'],['ainda não terminei','continuar'],
 ['o que você consegue fazer?','ajuda'],['me explica como te usar','ajuda'],['quais são suas funções?','ajuda'],['não sei usar isso aqui','ajuda'],
 ['como foi teu dia?','papo'],['tô morto de sono','papo'],['hoje foi corrido','papo'],['tudo certo por aí?','papo'],
 ['escuta essa ideia: um app de receitas com o que tem na geladeira','registrar_ideia'],['tive uma ideia de um site de aluguel de ferramentas','registrar_ideia'],['anota: sistema de ponto pra pequenas empresas','registrar_ideia'],['pensei em montar uma loja virtual de camisetas','registrar_ideia'],
 ['na ideia do aluguel acrescenta que vai ter entrega','complementar_ideia'],['adiciona nessa ideia que o app é grátis','complementar_ideia'],['complementa a ideia das camisetas com estampas personalizadas','complementar_ideia'],['coloca também que vai ter versão premium','complementar_ideia'],
 ['me mostra a ideia das receitas','ver_ideia'],['cadê aquela ideia da loja de camisetas?','ver_ideia'],['abre a ideia do sistema de ponto','ver_ideia'],['lembra da ideia do aluguel de ferramentas?','ver_ideia'],
 ['lista todas as minhas ideias','listar_ideias'],['quantas ideias eu tenho?','listar_ideias'],['quais ideias foram aprovadas?','listar_ideias'],['mostra as ideias arquivadas','listar_ideias'],
 ['analisa a ideia das receitas pra mim','analisar_ideia'],['quais os pontos fracos do sistema de ponto?','analisar_ideia'],['você acha que a loja de camisetas dá dinheiro?','analisar_ideia'],['faz uma análise crítica dessa ideia','analisar_ideia'],
 ['pode aprovar a ideia das receitas','aprovar_ideia'],['aprovada a do aluguel','aprovar_ideia'],['vamos tocar a ideia do ponto','aprovar_ideia'],['essa ideia tá aprovada, pode marcar','aprovar_ideia'],
 ['arquiva a ideia das camisetas','arquivar_ideia'],['tira a ideia do ponto da lista','arquivar_ideia'],['essa das receitas não vai rolar','arquivar_ideia'],['deixa a do aluguel de lado por enquanto','arquivar_ideia'],
 ['procura o que eu falei sobre entrega','buscar'],['tem alguma coisa salva sobre assinatura?','buscar'],['acha aí o que decidimos sobre preço','buscar'],['busca por camisetas','buscar'],
 ['como tá o projeto da loja?','status_projeto'],['em que pé tá o projeto de ponto?','status_projeto'],['o que falta no projeto das receitas?','status_projeto'],['me dá um resumo do projeto do aluguel','status_projeto'],
 ['abre a parte de projetos','abrir_area'],['vai pra memória','abrir_area'],['me leva pras configurações','abrir_area'],['abre o design','abrir_area'],
];
const per = new Map<string,{ok:number,n:number,errs:string[]}>();
let ok=0;
for (const [t,e] of C) { const r=await interpret(t); const g=r.top?.intent??'NENHUM'; const s=per.get(e)??{ok:0,n:0,errs:[]}; s.n++; const hit=g===e||(e==='cancelar'&&g==='negar'); if(hit){s.ok++;ok++;} else s.errs.push(`"${t}" → ${g} (${r.top?.score.toFixed(2)??'-'}${r.confident?'':', incerto'})`); per.set(e,s); }
console.log(`TOTAL ${ok}/${C.length} = ${Math.round(ok/C.length*100)}%`);
for (const [k,v] of per) console.log(`${k.padEnd(18)} ${v.ok}/${v.n}${v.errs.length?'  ✗ '+v.errs.join(' | '):''}`);
