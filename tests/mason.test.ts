import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createNodeDriver } from './nodeDriver';
import { useDriver } from '../src/storage/database/db';
import { execute, confirmPending } from '../src/assistant/core/executor';
import { listIdeas, searchIdeas, updateIdea, getIdea } from '../src/work/ideas/ideasRepo';
import { createProject } from '../src/projects/projectsRepo';
import { importFiles, listFiles } from '../src/projects/versions/filesRepo';
import { workStats } from '../src/work/stats';
import { applyCorrections, recordCorrection, listCorrections } from '../src/memory/preferences/profileRepo';
import { extractCorrections } from '../src/voice/corrections';
import { TOOLS } from '../src/assistant/tools/registry';
import { validateArgs } from '../src/assistant/tools/toolkit';
import { nav } from '../src/interface/navigation/navStore';

before(async () => {
  await useDriver(await createNodeDriver());
});

test('declarações de ferramentas são válidas e únicas', () => {
  const names = TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const t of TOOLS) {
    assert.match(t.name, /^[a-z_]+$/);
    assert.ok(t.description.length > 10);
  }
  for (const required of ['open_section', 'create_idea', 'find_idea', 'update_idea', 'archive_idea', 'create_project', 'find_project', 'update_project', 'create_task', 'list_tasks', 'save_document', 'import_project_files', 'search_memory', 'update_user_preferences']) {
    assert.ok(names.includes(required), `falta ${required}`);
  }
});

test('validação rejeita argumentos ruins', () => {
  const t = TOOLS.find((x) => x.name === 'update_task_status')!;
  assert.throws(() => validateArgs(t, { task_id: 'x', status: 'feito' }), /inválido/);
  assert.throws(() => validateArgs(t, { status: 'concluida' }), /obrigatório/);
  assert.throws(() => validateArgs(t, { task_id: 'x', status: 'concluida', hack: 1 }), /desconhecido/);
});

test('executor registra ideia preservando as palavras do usuário', async () => {
  const fala = 'Mano, tive uma ideia. Quero criar um site onde as pessoas consigam comparar preços de produtos de várias lojas.';
  const out = await execute('create_idea', {
    title: 'Comparador de preços entre lojas',
    original_description: fala,
    organized_description: 'Plataforma web para comparar preços de produtos entre diferentes lojas.',
    ai_suggestions: 'Validar fontes de dados das lojas (APIs, parcerias).',
    category: 'site',
  });
  assert.equal(out.result.ok, true);
  assert.equal(out.record.summary, 'Ideia registrada: Comparador de preços entre lojas');
  const ideas = await listIdeas();
  assert.equal(ideas.length, 1);
  assert.equal(ideas[0].original_description, fala);
  assert.ok(ideas[0].ai_suggestions?.includes('Validar'));
});

test('busca tolerante encontra a ideia sem título exato e sem acentos', async () => {
  assert.equal((await searchIdeas('aquela ideia de comparacao de preco')).length, 1);
  assert.equal((await searchIdeas('lojas preços')).length, 1);
  assert.equal((await searchIdeas('receitas de bolo')).length, 0);
});

test('o MASON não consegue reescrever a descrição original', async () => {
  const [idea] = await listIdeas();
  await assert.rejects(updateIdea(idea.id, { original_description: 'outra coisa' }, 'ia'), /pertence ao usuário/);
});

test('erros de ferramenta voltam como resultado, sem exceção', async () => {
  const out = await execute('update_task_status', { task_id: 'nao-existe', status: 'concluida' });
  assert.equal(out.result.ok, false);
  assert.match(out.result.error!, /não encontrada/);
  const bad = await execute('acao_inexistente', {});
  assert.equal(bad.result.ok, false);
  const invalid = await execute('update_task_status', { task_id: 'x', status: 'feito' });
  assert.match(invalid.result.error!, /inválido/);
});

test('exclusão exige confirmação explícita', async () => {
  const [idea] = await listIdeas();
  const out = await execute('delete_idea', { idea_id: idea.id });
  assert.equal(out.result.ok, false);
  assert.ok(out.pending);
  assert.ok(await getIdea(idea.id), 'não pode excluir antes da confirmação');
  const r = await confirmPending(out.pending!.id);
  assert.equal(r.ok, true);
  assert.equal(await getIdea(idea.id), null);
});

test('open_section navega e import_project_files lê o conteúdo real', async () => {
  const p = await createProject({ name: 'Agenda para pequenos negócios' });
  await importFiles([{ name: 'index.html', mime: 'text/html', size: 30, text: '<h1>Agenda</h1>', storage_ref: null }]);
  assert.equal((await listFiles({ inbox: true })).length, 1);
  const open = await execute('open_section', { section: 'projects', record_id: p.id });
  assert.equal(open.result.ok, true);
  assert.equal(nav.get().section, 'projects');
  assert.equal(nav.get().recordId, p.id);
  const imp = await execute('import_project_files', { project_id: p.id, version_label: 'v1 Claude' });
  assert.equal((imp.result.data as any).files[0].content, '<h1>Agenda</h1>');
  assert.equal((await listFiles({ project_id: p.id }))[0].version_label, 'v1 Claude');
});

test('indicadores vêm do banco', async () => {
  const s = await workStats();
  assert.equal(s.ideasTotal, 0);
  assert.equal(s.projectsActive, 1);
  assert.equal(s.filesInbox, 0);
});

test('correções de voz: extração e aplicação automática após 3 vezes', async () => {
  assert.deepEqual(extractCorrections('joga isso pro cloud de um jeito', 'joga isso pro Claude de um jeito'), [{ heard: 'cloud', correct: 'Claude' }]);
  assert.deepEqual(extractCorrections('oi', 'texto completamente diferente aqui agora'), []);
  for (let i = 0; i < 3; i++) await recordCorrection('cloud', 'Claude');
  const list = await listCorrections();
  assert.equal(list[0].auto_apply, 1);
  assert.equal(applyCorrections('manda pro cloud agora', list), 'manda pro Claude agora');
  assert.equal(applyCorrections('cloudflare', list), 'cloudflare');
});
