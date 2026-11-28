import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createNodeDriver } from './nodeDriver';
import { useDriver } from '../src/storage/database/db';
import { sendToMason } from '../src/assistant/core/mason';
import { listIdeas, getIdea } from '../src/work/ideas/ideasRepo';
import { listMemories } from '../src/memory/repository/memoryRepo';
import { nav } from '../src/interface/navigation/navStore';

/** Conversas completas com o núcleo próprio (sem nenhuma IA externa). */
const say = async (t: string) => (await sendToMason(t)).message.content;

before(async () => {
  await useDriver(await createNodeDriver());
});

test('cumprimenta pelo nome', async () => {
  assert.match(await say('Bom dia, Mason'), /Gabriel/);
});

test('registra ideia com as palavras do Gabriel e oferece análise', async () => {
  const fala = 'Mano, tive uma ideia. Quero criar um site onde as pessoas consigam comparar preços de produtos de várias lojas.';
  const r = await sendToMason(fala);
  assert.equal(r.actions[0]?.tool, 'create_idea');
  assert.equal(r.actions[0]?.ok, true);
  assert.match(r.message.content, /Registrei a ideia/);
  const [idea] = await listIdeas();
  assert.equal(idea.original_description, fala);
  assert.equal(idea.category, 'site');
  assert.match(idea.organized_description!, /Proposta: Quero criar um site/);
});

test('aceita a análise: crítica por critérios, salva separada como sugestão', async () => {
  const r = await say('pode ser');
  assert.match(r, /^Senhor, analisando a proposta/);
  assert.match(r, /concorrência|monetização/i);
  const [idea] = await listIdeas();
  assert.match(idea.ai_suggestions!, /Análise do MASON/);
  assert.match(idea.ai_suggestions!, /Origem dos dados/);
});

test('explicação em várias mensagens vira uma ideia só', async () => {
  assert.match(await say('seguinte, tive uma ideia...'), /Pode continuar/);
  const r = await say('um app pra barbearia agendar horário pelo celular');
  assert.match(r, /Registrei a ideia/);
  const ideas = await listIdeas();
  assert.equal(ideas.length, 2);
  const barber = ideas.find((i) => /barbearia/.test(i.title))!;
  assert.equal(barber.category, 'aplicativo');
  assert.match(barber.original_description, /tive uma ideia\.\.\.\n.*barbearia/);
  assert.match(await say('não precisa'), /Fica salva/);
});

test('referência vaga é confirmada; discorda, insiste uma vez e cumpre registrando', async () => {
  assert.match(await say('aprova a ideia do comparador'), /Você está falando de "/);
  assert.match(await say('isso'), /^Senhor, eu não recomendo isso: ainda faltam definir/);
  assert.match(await say('pode aprovar mesmo assim'), /Só reforço uma última vez/);
  assert.match(await say('sim'), /Feito como o senhor decidiu/);
  const comp = (await listIdeas()).find((i) => /preços/.test(i.title))!;
  assert.equal(comp.status, 'aprovada');
  const mem = await listMemories();
  assert.equal(mem[0].source, 'decisao_confirmada');
  assert.match(mem[0].content, /apesar do aviso/);
});

test('abre áreas pelo nome falado', async () => {
  assert.match(await say('abre aquele negócio lá de desenvolvimento'), /Abrindo Desenvolvimento/);
  assert.equal(nav.get().section, 'development');
  await say('me leva pra central de ideias');
  assert.equal(nav.get().section, 'ideas');
});

test('lista as ideias', async () => {
  const r = await say('quais ideias eu tenho?');
  assert.match(r, /Você tem 2 ideias/);
});

test('ideia parecida: pergunta se é nova ou complemento', async () => {
  assert.match(await say('anota aí: site pra comparar preço de produtos em lojas diferentes com cupons'), /lembra "/);
  assert.match(await say('é um complemento'), /Acrescentei/);
  assert.equal((await listIdeas()).length, 2);
  const comp = (await listIdeas()).find((i) => /preços/.test(i.title))!;
  assert.match(comp.original_description, /\[Complemento\].*cupons/);
});

test('arquiva com confirmação da referência', async () => {
  assert.match(await say('arquiva a ideia da barbearia'), /Você está falando de/);
  assert.match(await say('é essa mesma'), /Arquivei/);
  const all = await listIdeas({ includeArchived: true });
  assert.equal(all.find((i) => /barbearia/.test(i.title))!.status, 'arquivada');
});

test('não entende: pergunta na hora, sem inventar', async () => {
  const before = (await listIdeas({ includeArchived: true })).length;
  const r = await sendToMason('qual a capital da França?');
  assert.equal(r.actions.length, 0);
  assert.match(r.message.content, /Não entendi|não tenho certeza/);
  assert.equal((await listIdeas({ includeArchived: true })).length, before);
});

test('referência por tempo: "ideia de hoje" lista e pede para escolher', async () => {
  const r = await say('lembra da ideia que eu tive hoje?');
  assert.match(r, /Você está falando de|Encontrei \d ideias/);
});

test('busca no que foi salvo', async () => {
  const r = await say('procura aí se a gente já falou de cupom');
  assert.match(r, /encontrei|Não encontrei/);
});
