// Baixa o modelo pequeno de português do Vosk (~31 MB) para dentro do plugin da palavra de ativação.
// Vai dentro do APK: a escuta de "MASON" funciona sem internet.
import { mkdir, writeFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const MODEL_URL = 'https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dest = path.join(root, 'plugins', 'mason-wakeword', 'android', 'src', 'main', 'assets', 'model-pt');

try { await stat(path.join(dest, 'uuid')); console.log('Modelo Vosk já presente.'); process.exit(0); } catch {}

const tmp = path.join(root, '.vosk-tmp');
await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
process.stdout.write('baixando modelo Vosk pt... ');
const res = await fetch(MODEL_URL);
if (!res.ok) throw new Error(`Falha ao baixar ${MODEL_URL}: ${res.status}`);
await writeFile(path.join(tmp, 'model.zip'), Buffer.from(await res.arrayBuffer()));
console.log('ok');
execSync(`unzip -q model.zip`, { cwd: tmp });
const folder = (await readdir(tmp)).find((f) => f.startsWith('vosk-model'));
if (!folder) throw new Error('Pasta do modelo não encontrada no zip.');
await rm(dest, { recursive: true, force: true });
await mkdir(path.dirname(dest), { recursive: true });
await rename(path.join(tmp, folder), dest);
await writeFile(path.join(dest, 'uuid'), randomUUID()); // o Vosk usa para saber se já descompactou no aparelho
await rm(tmp, { recursive: true, force: true });
console.log('Modelo Vosk em', path.relative(root, dest));
