import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interpret } from '../src/assistant/intent/interpreter';

/**
 * Frases que NÃO estão na base inicial: medem se o MASON entende variações.
 * Só o classificador léxico roda aqui (o modelo de significados não é carregado nos testes).
 * Pares equivalentes contam como acerto (negar/cancelar levam à mesma resposta).
 */
const EQUIV: Record<string, string[]> = { cancelar: ['negar'], papo: ['cumprimentar'] };
const CASES: [string, string][] = [
 ['Mano, tive uma ideia. Quero criar um site onde as pessoas consigam comparar preços de produtos de várias lojas.','registrar_ideia'],
 ['anota aí: app pra controlar gastos de academia','registrar_ideia'],
 ['pensei numa parada, um marketplace de freelancers locais','registrar_ideia'],
 ['guarda pra mim essa ideia de um sistema de agendamento pra barbearia','registrar_ideia'],
 ['valeu, Mason','agradecer'],
 ['obrigadão','agradecer'],
 ['bom dia mason','cumprimentar'],
 ['e aí, beleza?','cumprimentar'],
 ['isso aí','confirmar'],
 ['pode sim','confirmar'],
 ['não, não é essa','negar'],
 ['esquece','cancelar'],
 ['deixa quieto, cancela isso','cancelar'],
 ['pera, falei errado','corrigir'],
 ['abre o desenvolvimento','abrir_area'],
 ['me leva pra central de ideias','abrir_area'],
 ['vai pras configurações','abrir_area'],
 ['quais ideias eu tenho guardadas?','listar_ideias'],
 ['lembra da ideia do comparador?','ver_ideia'],
 ['tá ligado naquela ideia de semana passada?','ver_ideia'],
 ['o que você acha do comparador de preços?','analisar_ideia'],
 ['quais os riscos dessa ideia?','analisar_ideia'],
 ['aprova a ideia do comparador','aprovar_ideia'],
 ['arquiva essa','arquivar_ideia'],
 ['essa ideia não vai rolar não','arquivar_ideia'],
 ['acrescenta na ideia do comparador que vai ter cupom de desconto','complementar_ideia'],
 ['procura aí se a gente já falou de cupom','buscar'],
 ['como tá o projeto da agenda?','status_projeto'],
 ['o que você sabe fazer?','ajuda'],
 ['tô cansado hoje','papo'],
 ['e tem mais uma coisa','continuar'],
 ['qual a capital da França?', 'NENHUM'],
 ['bota aí uma ideia: curso online de edição de vídeo','registrar_ideia'],
 ['tive uma sacada, um bot de whatsapp pra pizzaria','registrar_ideia'],
 ['quero criar uma plataforma pra conectar personal trainers e alunos','registrar_ideia'],
 ['e se a gente fizesse um app de lista de compras compartilhada','registrar_ideia'],
 ['salva aí: landing page pra advogados','registrar_ideia'],
 ['brigado mason','agradecer'],
 ['valeu pela ajuda','agradecer'],
 ['boa noite','cumprimentar'],
 ['fala aí','cumprimentar'],
 ['exato','confirmar'],
 ['é isso aí','confirmar'],
 ['pode mandar','confirmar'],
 ['não é isso não','negar'],
 ['nada disso','negar'],
 ['esquece, deixa pra lá','cancelar'],
 ['cancela tudo','cancelar'],
 ['peraí, me enganei','corrigir'],
 ['na real é outra coisa','corrigir'],
 ['abre os projetos aí','abrir_area'],
 ['quero ver a memória','abrir_area'],
 ['vai para o marketing','abrir_area'],
 ['mostra as ideias aprovadas','listar_ideias'],
 ['tem alguma ideia nova aí?','listar_ideias'],
 ['puxa aquela ideia do app de academia','ver_ideia'],
 ['como era a ideia da barbearia?','ver_ideia'],
 ['essa ideia presta?','analisar_ideia'],
 ['me fala os pontos fracos dessa ideia','analisar_ideia'],
 ['dá uma analisada na ideia do comparador','analisar_ideia'],
 ['pode aprovar essa aí','aprovar_ideia'],
 ['bora seguir com a ideia do bot','aprovar_ideia'],
 ['arquiva a do curso','arquivar_ideia'],
 ['deixa essa ideia de lado','arquivar_ideia'],
 ['coloca na ideia do bot que ele também aceita pix','complementar_ideia'],
 ['acha pra mim o que a gente falou sobre pix','buscar'],
 ['a gente já decidiu algo sobre preço?','buscar'],
 ['em que pé tá o projeto do site?','status_projeto'],
 ['como funciona isso aqui?','ajuda'],
 ['como você tá hoje?','papo'],
 ['tá aí, mason?','papo'],
 ['ah, e outra coisa','continuar'],
];

test('compreensão de frases novas (mínimo 90%)', async () => {
  let ok = 0;
  const misses: string[] = [];
  for (const [text, expected] of CASES) {
    const got = (await interpret(text)).top?.intent ?? 'NENHUM';
    if (got === expected || EQUIV[expected]?.includes(got)) ok++;
    else misses.push(`${text} → ${got} (esperado ${expected})`);
  }
  const rate = ok / CASES.length;
  console.log(`compreensão: ${ok}/${CASES.length} (${Math.round(rate * 100)}%)`);
  for (const m of misses) console.log('  ' + m);
  assert.ok(rate >= 0.9, `taxa ${rate}`);
});
