import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(dir, '..', '.build', 'avaliar-linguagem.mjs');
await build({ entryPoints: [path.join(dir, 'avaliar.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'warning',
  alias: { '@capacitor/core': path.join(dir, '..', 'stubs', 'capacitor-core.ts') }, external: ['node:*', '@huggingface/transformers'] });
process.exit(spawnSync(process.execPath, [out, ...process.argv.slice(2)], { stdio: 'inherit' }).status ?? 1);
