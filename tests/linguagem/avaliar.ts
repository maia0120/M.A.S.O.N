import { interpret } from '../../src/assistant/intent/interpreter';
import { DESENVOLVIMENTO } from './desenvolvimento';
import { VALIDACAO } from './validacao';
import { INDEPENDENTE } from './independente';

/** Relatório por intenção para as três bases. Uso: npm run avaliar:linguagem [dev|val|ind|todas] */
const EQUIV: Record<string, string[]> = { cancelar: ['negar'], negar: ['cancelar'], papo: ['cumprimentar'] };

async function report(name: string, base: [string, string][]) {
  const per = new Map<string, { ok: number; n: number; conf: number }>();
  const errors: string[] = [];
  let ok = 0;
  for (const [text, exp] of base) {
    const r = await interpret(text);
    const got = r.top?.intent ?? 'nenhuma';
    const hit = got === exp || (EQUIV[exp] ?? []).includes(got);
    const s = per.get(exp) ?? { ok: 0, n: 0, conf: 0 };
    s.n++; s.conf += r.top?.score ?? 0;
    if (hit) { s.ok++; ok++; } else errors.push(`  ✗ [${exp}] "${text}" → ${got} (${(r.top?.score ?? 0).toFixed(2)}${r.confident ? '' : ', incerto'}${r.ambiguous ? ', ambíguo' : ''})`);
    per.set(exp, s);
  }
  console.log(`\n=== ${name}: ${ok}/${base.length} = ${Math.round((ok / base.length) * 100)}% ===`);
  for (const [k, v] of [...per.entries()].sort()) console.log(`${k.padEnd(24)} ${String(v.ok).padStart(2)}/${String(v.n).padEnd(3)} confiança média ${(v.conf / v.n).toFixed(2)}`);
  if (process.argv.includes('--erros')) errors.forEach((e) => console.log(e));
  return ok / base.length;
}

const which = process.argv[2] ?? 'todas';
if (which === 'dev' || which === 'todas') await report('DESENVOLVIMENTO', DESENVOLVIMENTO);
if (which === 'val' || which === 'todas') await report('VALIDAÇÃO', VALIDACAO);
if (which === 'ind' || which === 'todas') await report('TESTE INDEPENDENTE', INDEPENDENTE);
