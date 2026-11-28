/** Esquema de parâmetro: usado para validar os dados extraídos pelo interpretador antes de executar. */
export type Param =
  | { type: 'string'; description: string; required?: boolean; enum?: readonly string[]; maxLength?: number }
  | { type: 'number'; description: string; required?: boolean }
  | { type: 'boolean'; description: string; required?: boolean }
  | { type: 'array'; description: string; required?: boolean; items: { type: 'string' } };

export interface ToolContext {
  /** Seção em que o usuário está agora. */
  section: string;
}

export interface ToolResult {
  ok: boolean;
  /** Dados devolvidos ao núcleo, usados para montar a resposta. */
  data?: unknown;
  error?: string;
  /** Resumo curto, exibido na interface como prova do que foi executado. */
  summary?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  params: Record<string, Param>;
  /** Se definido, a ação só é executada depois que o usuário toca em "Confirmar" na interface. */
  confirm?: (args: Record<string, unknown>) => Promise<string> | string;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

/** Valida e limpa os argumentos extraídos da mensagem. Lança erro com mensagem legível. */
export function validateArgs(t: ToolDef, raw: unknown): Record<string, unknown> {
  const args = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const [name, p] of Object.entries(t.params)) {
    let v = args[name];
    if (v === undefined || v === null || v === '') {
      if (p.required) throw new Error(`Parâmetro obrigatório ausente: ${name}`);
      continue;
    }
    switch (p.type) {
      case 'string':
        if (typeof v === 'number') v = String(v);
        if (typeof v !== 'string') throw new Error(`${name} deve ser texto`);
        if (p.enum && !p.enum.includes(v)) throw new Error(`${name} inválido: "${v}". Aceitos: ${p.enum.join(', ')}`);
        if (p.maxLength && v.length > p.maxLength) throw new Error(`${name} excede ${p.maxLength} caracteres`);
        break;
      case 'number':
        if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) v = Number(v);
        if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`${name} deve ser número`);
        break;
      case 'boolean':
        if (v === 'true' || v === 'false') v = v === 'true';
        if (typeof v !== 'boolean') throw new Error(`${name} deve ser verdadeiro/falso`);
        break;
      case 'array':
        if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw new Error(`${name} deve ser uma lista de textos`);
        break;
    }
    clean[name] = v;
  }
  const unknown = Object.keys(args).filter((k) => !(k in t.params));
  if (unknown.length) throw new Error(`Parâmetro(s) desconhecido(s): ${unknown.join(', ')}`);
  return clean;
}

export const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
