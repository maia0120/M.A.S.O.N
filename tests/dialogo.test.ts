import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createNodeDriver } from './nodeDriver';
import { useDriver } from '../src/storage/database/db';
import { sendToMason, startNewConversation } from '../src/assistant/core/mason';
import { interpret } from '../src/assistant/intent/interpreter';
import { listIdeas } from '../src/work/ideas/ideasRepo';
import { listMemories } from '../src/memory/repository/memoryRepo';
import { listLearned, forgetLearned } from '../src/assistant/intent/learning';

/** Conversas completas da compreensão 0.7.0: ideia em construção, perguntas de confirmação, aprendizado. */
const send = (t: string) => sendToMason(t);
const say = async (t: string) => (await sendToMason(t)).message.content;

before(async () => {
  await useDriver(await createNodeDriver());
});

test('exemplo do Gabriel: começa a registrar sem perguntar "registrar ou pesquisar"', async () => {
  const r = await send('Quero colocar uma ideia nova de gestão de um aplicativo de gestão financeira');
  assert.equal(r.actions[0]?.tool, 'create_idea');
  assert.doesNotMatch(r.message.content, /ou procurar|não tenho certeza/);
  assert.match(r.message.content, /^Anotei: Gestão de um aplicativo de gestão financeira\. Qual problema isso resolve\?$/);
});

test('a resposta à minha pergunta preenche a parte perguntada; as próximas mensagens completam a mesma ideia', async () => {
  assert.match(await say('o pessoal perde o controle das contas no fim do mês'), /^(Anot|Certo|Entendi|Beleza)/);
  await say('ele seria para pequenos empreendedores');
  await say('vai ter um relatório mensal de gastos');
  await say('a ideia é cobrar uma assinatura de 20 reais por mês');
  const fim = await say('é isso');
  assert.match(fim, /Problema\/finalidade: .*perde o controle das contas/);
  assert.match(fim, /Público: .*pequenos empreendedores/);
  assert.match(fim, /Funcionalidades:\n- Vai ter um relatório mensal/);
  assert.match(fim, /Monetização: .*assinatura de 20 reais/);
  const ideas = await listIdeas();
  assert.equal(ideas.length, 1, 'continua sendo uma ideia só');
  assert.match(ideas[0].original_description, /\[Complemento\] vai ter um relatório/);
  assert.match(ideas[0].organized_description!, /Monetização/);
  assert.match(await say('agora não'), /Fica salva/);
});

test('mudar de assunto no meio salva a ideia e atende o pedido novo', async () => {
  await say('tive uma ideia de um site de receitas para quem tem pouco tempo');
  const r = await say('quais ideias eu tenho?');
  assert.match(r, /^Salvei a ideia "/);
  assert.match(r, /Você tem 2 ideias/);
});

test('"o que você acha?" no meio da explicação analisa a ideia que está sendo contada', async () => {
  await say('pensei num app de carona para universitários');
  const r = await say('o que você acha?');
  assert.match(r, /^Senhor, analisando a proposta/);
});

test('"quero ver uma ideia antiga" não é negação', async () => {
  const it = await interpret('Quero ver uma ideia antiga');
  assert.equal(it.top?.intent, 'ver_ideia');
});

test('anota uma informação na memória, com origem "usuário"', async () => {
  assert.match(await say('anota que o cliente da barbearia paga todo dia 10'), /Anotado/);
  const [m] = await listMemories();
  assert.equal(m.source, 'usuario');
  assert.match(m.content, /cliente da barbearia paga todo dia 10/);
});

test('transforma a ideia em projeto só depois de confirmar', async () => {
  await startNewConversation();
  const ask = await say('quero criar um projeto com a ideia do aplicativo de gestão financeira');
  assert.match(ask, /Você está falando de "|Posso criar o projeto/);
  const conf = /Posso criar/.test(ask) ? ask : await say('isso');
  assert.match(conf, /Crio\?$/);
  const r = await send('pode');
  assert.equal(r.actions.find((a) => a.tool === 'create_project')?.ok, true);
  const idea = (await listIdeas()).find((i) => /financeira/.test(i.title))!;
  assert.equal(idea.status, 'em_desenvolvimento');
});

test('prepara o documento para o Claude a partir da ideia em foco', async () => {
  const r = await send('prepara essa ideia pro Claude');
  assert.equal(r.actions.find((a) => a.tool === 'save_document')?.ok, true);
  assert.match(r.message.content, /documento para o Claude/);
});

test('na dúvida, pergunta se entendeu certo; o "sim" vira exemplo aprendido, revisável e apagável', async () => {
  await startNewConversation();
  const frase = 'aquele lance do mercado';
  const first = await say(frase);
  assert.match(first, /certo\?$/);
  await say('sim');
  const learned = await listLearned();
  assert.equal(learned[0].text, frase);
  assert.equal(learned[0].origin, 'confirmou_pergunta');
  const again = await interpret(frase);
  assert.equal(again.top?.intent, learned[0].intent);
  assert.equal(again.confident, true);
  await forgetLearned(learned[0].id);
  assert.equal((await listLearned()).length, 0);
  assert.notEqual((await interpret(frase)).top?.score, 0.97);
});

test('"não" à pergunta de confirmação não aprende nada e oferece a outra leitura ou pergunta de novo', async () => {
  await startNewConversation();
  const r = await say('aquele lance do mercado');
  assert.match(r, /certo\?$/);
  const no = await say('não');
  assert.match(no, /Entendi errado/);
  assert.equal((await listLearned()).length, 0);
  await say('cancela');
});
