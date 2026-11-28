import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createNodeDriver } from './nodeDriver';
import { useDriver } from '../src/storage/database/db';
import { setPref } from '../src/memory/preferences/profileRepo';
import { conversation, type ConvState } from '../src/voice/conversation';
import { setRecognizer, type ListenResult, type Recognizer } from '../src/voice/speech-recognition/recognizer';
import { DEFAULT_VOICE, type VoicePrefs } from '../src/voice/voicePrefs';

/**
 * Máquina de estados da conversa (P0, D35/D36), com reconhecedor e fala simulados.
 * Verifica: modos, nada de microfone reabrindo fora do modo contínuo, nada de microfone durante a fala,
 * encerramento descarta resultados pendentes, e nada fica preso.
 */
const events: string[] = [];
let queue: ListenResult[] = [];
let listenCalls = 0;
let speaking = false;
let releaseSpeech: (() => void) | null = null;
let holdSpeech = false;
let processDelay = 0;

const fakeRec: Recognizer = {
  async available() { return true; },
  async listen(h) {
    listenCalls++;
    assert.equal(speaking, false, 'microfone abriu com a fala tocando');
    events.push('listen');
    h.onState?.('ready');
    await new Promise((r) => setTimeout(r, 5));
    h.onState?.('end');
    return queue.shift() ?? { alternatives: [], error: 'silence' };
  },
  async stop() { events.push('stop'); },
  async cancel() { events.push('cancel'); },
};

const say = (text: string): ListenResult => ({ alternatives: [{ text, confidence: 0.9 }] });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(state: ConvState, ms = 2000) {
  const t = Date.now();
  while (conversation.get().state !== state) {
    if (Date.now() - t > ms) throw new Error(`esperava ${state}, está em ${conversation.get().state}`);
    await sleep(5);
  }
}
async function prefs(p: Partial<VoicePrefs>) { await setPref('voice', JSON.stringify({ ...DEFAULT_VOICE, ...p })); }

before(async () => {
  await useDriver(await createNodeDriver());
  setRecognizer(fakeRec);
  conversation.speakImpl = async (text) => {
    speaking = true;
    events.push('speak:' + text);
    if (holdSpeech) await new Promise<void>((r) => { releaseSpeech = r; });
    else await sleep(5);
    speaking = false;
  };
  conversation.stopSpeakImpl = async () => { if (speaking) events.push('stopSpeak'); speaking = false; releaseSpeech?.(); releaseSpeech = null; };
  conversation.setProcessor(async (text) => {
    events.push('process:' + text);
    if (processDelay) await sleep(processDelay);
    return { reply: text === 'pergunta' ? 'Quer que eu analise?' : 'Feito.', needsConfirmation: false };
  });
});

beforeEach(async () => {
  await conversation.end();
  events.length = 0; queue = []; listenCalls = 0; holdSpeech = false; processDelay = 0;
});

test('modo controlado (padrão): responde, pergunta se quer continuar e NÃO reabre o microfone', async () => {
  await prefs({});
  queue = [say('bom dia')];
  await conversation.listen('button');
  await until('WAITING_FOR_USER');
  await sleep(50);
  assert.equal(listenCalls, 1);
  assert.ok(events.some((e) => e.startsWith('speak:Feito.') && /\?$/.test(e)), 'deveria perguntar se quer continuar');
  // tentativa de reabrir sozinho é ignorada fora do modo contínuo
  await conversation.listen('auto');
  assert.equal(listenCalls, 1);
  // continuar por ação do Gabriel
  queue = [say('valeu')];
  await conversation.listen('continue');
  await until('WAITING_FOR_USER');
  assert.equal(listenCalls, 2);
});

test('resposta que já é uma pergunta não ganha outra pergunta', async () => {
  await prefs({});
  queue = [say('pergunta')];
  await conversation.listen('button');
  await until('WAITING_FOR_USER');
  const spoken = events.find((e) => e.startsWith('speak:'))!;
  assert.equal(spoken, 'speak:Quer que eu analise?');
});

test('modo contínuo: volta a ouvir sozinho e pausa no silêncio', async () => {
  await prefs({ mode: 'continua' });
  queue = [say('um'), say('dois')]; // depois: silêncio
  await conversation.listen('button');
  await until('WAITING_FOR_USER', 3000);
  await sleep(50);
  assert.equal(listenCalls, 3);
  assert.match(conversation.get().notice ?? '', /pausada/);
  assert.equal(events.filter((e) => e.startsWith('speak:')).length, 2);
  assert.ok(!events.some((e) => /Quer continuar/.test(e)), 'no contínuo não pergunta');
});

test('modo só botão: termina em espera e nunca reabre', async () => {
  await prefs({ mode: 'botao' });
  queue = [say('oi')];
  await conversation.listen('button');
  await until('IDLE');
  await conversation.listen('auto');
  assert.equal(listenCalls, 1);
});

test('interromper a fala: para o áudio e não reabre o microfone, mesmo no contínuo', async () => {
  await prefs({ mode: 'continua' });
  holdSpeech = true;
  queue = [say('fala longa')];
  void conversation.listen('button');
  await until('SPEAKING');
  await conversation.interrupt();
  assert.equal(conversation.get().state, 'WAITING_FOR_USER');
  await sleep(500);
  assert.equal(listenCalls, 1);
  assert.ok(events.includes('stopSpeak'));
});

test('encerrar durante o processamento descarta a resposta (sem fala depois de encerrar)', async () => {
  await prefs({});
  processDelay = 80;
  queue = [say('demorado')];
  void conversation.listen('button');
  await until('PROCESSING');
  await conversation.end();
  await sleep(150);
  assert.equal(conversation.get().state, 'IDLE');
  assert.ok(!events.some((e) => e.startsWith('speak:')), 'falou depois de encerrar');
});

test('erro de permissão vai para ERRO com mensagem; dá para tentar de novo', async () => {
  await prefs({});
  queue = [{ alternatives: [], error: 'permission' }, say('agora vai')];
  await conversation.listen('button');
  assert.equal(conversation.get().state, 'ERROR');
  assert.match(conversation.get().notice ?? '', /permissão/i);
  await conversation.listen('button');
  await until('WAITING_FOR_USER');
  assert.equal(listenCalls, 2);
});

test('mensagem digitada durante a fala interrompe a fala antes de processar', async () => {
  await prefs({});
  holdSpeech = true;
  queue = [say('primeira')];
  void conversation.listen('button');
  await until('SPEAKING');
  holdSpeech = false;
  await conversation.sendText('segunda');
  await until('WAITING_FOR_USER');
  const iStop = events.indexOf('stopSpeak');
  const iProc = events.indexOf('process:segunda');
  assert.ok(iStop >= 0 && iStop < iProc, 'deveria parar a fala antes de processar');
});
