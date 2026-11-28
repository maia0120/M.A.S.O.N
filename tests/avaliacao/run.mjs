// Mede a compreensão no conjunto independente (relatório por intenção; não é teste de aprovação).
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '..', '.build', 'holdout.mjs');
await build({ entryPoints: [path.join(dir, 'holdout-v1.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
  alias: { '@capacitor/core': path.join(dir, '..', 'stubs', 'capacitor-core.ts') }, external: ['node:*', '@huggingface/transformers'] });
process.exit(spawnSync(process.execPath, [out], { stdio: 'inherit' }).status ?? 1);
