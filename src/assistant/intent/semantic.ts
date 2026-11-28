/**
 * Modelo de significados (embeddings) — roda no aparelho, sem internet (decisão D24).
 *
 * Modelo: paraphrase-multilingual-MiniLM-L12-v2 (versão quantizada, ~120 MB), executado com transformers.js
 * (ONNX Runtime em WebAssembly, dentro do WebView). Os arquivos ficam em public/models e vão dentro do APK:
 * `npm run model:download` baixa uma vez, no computador, antes do build.
 *
 * Se o modelo não estiver presente ou não carregar (pouca memória, por exemplo), o MASON continua funcionando
 * só com o classificador léxico, e o Diagnóstico mostra o motivo.
 */
export interface Encoder {
  encode(texts: string[]): Promise<Float32Array[]>;
}

export const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

export type SemanticStatus =
  | { state: 'off' }
  | { state: 'loading' }
  | { state: 'ready'; loadMs: number }
  | { state: 'failed'; reason: string };

let status: SemanticStatus = { state: 'off' };
let encoder: Encoder | null = null;
let loading: Promise<Encoder | null> | null = null;

export const semanticStatus = () => status;

/** Permite injetar outro encoder (testes) ou desligar (null). */
export function setEncoder(e: Encoder | null) {
  encoder = e;
  status = e ? { state: 'ready', loadMs: 0 } : { state: 'off' };
}

export function getEncoder(): Encoder | null {
  return encoder;
}

/** Carrega o modelo em segundo plano. Nunca lança erro: em falha, o núcleo segue só com o léxico. */
export function loadSemanticModel(): Promise<Encoder | null> {
  if (encoder) return Promise.resolve(encoder);
  if (loading) return loading;
  status = { state: 'loading' };
  const t0 = performance.now();
  loading = (async () => {
    try {
      const tf = await import('@huggingface/transformers');
      tf.env.allowRemoteModels = false; // nada de internet
      tf.env.allowLocalModels = true;
      tf.env.localModelPath = './models/';
      const ortWasm = tf.env.backends?.onnx?.wasm;
      if (ortWasm) {
        ortWasm.wasmPaths = './ort/';
        ortWasm.numThreads = 1; // WebView sem cross-origin isolation: uma thread
      }
      // `as any`: a tipagem de pipeline() do transformers.js é pesada demais para o compilador.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extractor: any = await (tf.pipeline as any)('feature-extraction', MODEL_ID, { dtype: 'q8' });
      const enc: Encoder = {
        async encode(texts) {
          const out = await extractor(texts, { pooling: 'mean', normalize: true });
          const dim = out.dims[out.dims.length - 1];
          const data = out.data as Float32Array;
          return texts.map((_, i) => data.slice(i * dim, (i + 1) * dim));
        },
      };
      encoder = enc;
      status = { state: 'ready', loadMs: Math.round(performance.now() - t0) };
      return enc;
    } catch (e) {
      status = { state: 'failed', reason: (e as Error).message ?? String(e) };
      return null;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s; // vetores já normalizados
}
