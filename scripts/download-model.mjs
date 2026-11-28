// Baixa, uma única vez, o modelo de significados do MASON e os arquivos do ONNX Runtime para public/.
// Depois disso o app funciona offline: os arquivos vão dentro do APK.
import { mkdir, writeFile, readdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const FILES = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/model_quantized.onnx'];
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const modelDir = path.join(root, 'public', 'models', MODEL);

for (const f of FILES) {
  const dest = path.join(modelDir, f);
  try { if ((await stat(dest)).size > 0) { console.log('já existe', f); continue; } } catch {}
  const url = `https://huggingface.co/${MODEL}/resolve/main/${f}`;
  process.stdout.write(`baixando ${f}... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.status}`);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  console.log('ok');
}

// Arquivos WebAssembly do ONNX Runtime (usados pelo transformers.js), servidos localmente.
const ortDist = path.join(root, 'node_modules', 'onnxruntime-web', 'dist');
const ortDest = path.join(root, 'public', 'ort');
await mkdir(ortDest, { recursive: true });
for (const f of await readdir(ortDist)) {
  if (/^ort-wasm.*\.(wasm|mjs)$/.test(f)) await copyFile(path.join(ortDist, f), path.join(ortDest, f));
}
console.log('Pronto. Modelo em public/models e runtime em public/ort.');
