// Aviso no build: sem o modelo, o MASON funciona só com o classificador léxico.
import { stat } from 'node:fs/promises';
const f = 'public/models/Xenova/paraphrase-multilingual-MiniLM-L12-v2/onnx/model_quantized.onnx';
try { await stat(f); } catch {
  console.warn('\n[MASON] Modelo de significados não encontrado. Rode "npm run model:download" antes do build.\n' +
    '        Sem ele o app funciona, mas entende menos variações de frase.\n');
}
