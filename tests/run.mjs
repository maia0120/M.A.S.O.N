// Empacota os testes com esbuild (já instalado pelo Vite) e roda com o test runner do Node 22+.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(dir, 'mason.test.ts'), path.join(dir, 'conversa.test.ts'), path.join(dir, 'compreensao.test.ts'), path.join(dir, 'voz.test.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outdir: path.join(dir, '.build'),
  outExtension: { '.js': '.mjs' },
  logLevel: 'warning',
  alias: {
    '@capacitor/core': path.join(dir, 'stubs/capacitor-core.ts'),
  },
  external: ['node:*', 'react', '@capacitor-community/*', '@capacitor/filesystem', 'sql.js', 'sql.js/*', '@huggingface/transformers'],
});

const r = spawnSync(process.execPath, ['--experimental-sqlite', '--no-warnings', '--test', path.join(dir, '.build', 'mason.test.mjs'), path.join(dir, '.build', 'conversa.test.mjs'), path.join(dir, '.build', 'compreensao.test.mjs'), path.join(dir, '.build', 'voz.test.mjs')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
