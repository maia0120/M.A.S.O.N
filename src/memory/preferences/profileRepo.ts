import { db } from '../../storage/database/db';
import { now, uid, normalize } from '../../core/util';
import { emitChange } from '../../core/events';
import type { Expression, TranscriptCorrection } from '../../core/types';

/* ---------- Preferências chave/valor ---------- */

export async function getPref(key: string): Promise<string | null> {
  return (await db().all<{ value: string }>('SELECT value FROM preferences WHERE key = ?', [key]))[0]?.value ?? null;
}

export async function setPref(key: string, value: string): Promise<void> {
  await db().run('INSERT INTO preferences (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, now()]);
  emitChange('preferences');
}

export async function allPrefs(): Promise<Record<string, string>> {
  const rows = await db().all<{ key: string; value: string }>('SELECT key, value FROM preferences');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/* ---------- Expressões do usuário (perfil de comunicação) ---------- */

export async function saveExpression(expression: string, meaning: string, example?: string | null): Promise<Expression> {
  const e = expression.trim();
  const m = meaning.trim();
  if (!e || !m) throw new Error('Informe a expressão e o significado.');
  const existing = (await listExpressions()).find((x) => normalize(x.expression) === normalize(e));
  const t = now();
  if (existing) {
    await db().run('UPDATE expressions SET meaning = ?, example = COALESCE(?, example), updated_at = ? WHERE id = ?', [m, example ?? null, t, existing.id]);
    emitChange('profile');
    return { ...existing, meaning: m, updated_at: t };
  }
  const x: Expression = { id: uid(), expression: e, meaning: m, example: example ?? null, created_at: t, updated_at: t };
  await db().run('INSERT INTO expressions (id,expression,meaning,example,created_at,updated_at) VALUES (?,?,?,?,?,?)', [x.id, x.expression, x.meaning, x.example, t, t]);
  emitChange('profile');
  return x;
}

export async function listExpressions(): Promise<Expression[]> {
  return db().all<Expression>('SELECT * FROM expressions ORDER BY expression');
}

export async function deleteExpression(id: string): Promise<void> {
  await db().run('DELETE FROM expressions WHERE id = ?', [id]);
  emitChange('profile');
}

/* ---------- Correções de transcrição de voz ---------- */

/** Registra que o reconhecimento ouviu `heard` quando o usuário disse `correct`. Após 3 repetições, passa a aplicar automaticamente. */
export async function recordCorrection(heard: string, correct: string): Promise<TranscriptCorrection> {
  const h = heard.trim().toLowerCase();
  const c = correct.trim();
  if (!h || !c || h === c.toLowerCase()) throw new Error('Correção inválida.');
  const rows = await db().all<TranscriptCorrection>('SELECT * FROM transcript_corrections WHERE heard = ?', [h]);
  const t = now();
  if (rows[0] && rows[0].correct === c) {
    const count = rows[0].count + 1;
    const auto = count >= 3 ? 1 : rows[0].auto_apply;
    await db().run('UPDATE transcript_corrections SET count = ?, auto_apply = ?, updated_at = ? WHERE id = ?', [count, auto, t, rows[0].id]);
    emitChange('profile');
    return { ...rows[0], count, auto_apply: auto, updated_at: t };
  }
  if (rows[0]) await db().run('DELETE FROM transcript_corrections WHERE id = ?', [rows[0].id]);
  const x: TranscriptCorrection = { id: uid(), heard: h, correct: c, count: 1, auto_apply: 0, created_at: t, updated_at: t };
  await db().run('INSERT INTO transcript_corrections (id,heard,correct,count,auto_apply,created_at,updated_at) VALUES (?,?,?,?,?,?,?)',
    [x.id, x.heard, x.correct, 1, 0, t, t]);
  emitChange('profile');
  return x;
}

export async function listCorrections(): Promise<TranscriptCorrection[]> {
  return db().all<TranscriptCorrection>('SELECT * FROM transcript_corrections ORDER BY count DESC');
}

export async function setCorrectionAuto(id: string, auto: boolean): Promise<void> {
  await db().run('UPDATE transcript_corrections SET auto_apply = ?, updated_at = ? WHERE id = ?', [auto ? 1 : 0, now(), id]);
  emitChange('profile');
}

export async function deleteCorrection(id: string): Promise<void> {
  await db().run('DELETE FROM transcript_corrections WHERE id = ?', [id]);
  emitChange('profile');
}

/** Aplica correções confirmadas (auto_apply) a uma transcrição, respeitando limites de palavra. */
export function applyCorrections(text: string, corrections: TranscriptCorrection[]): string {
  let out = text;
  for (const c of corrections.filter((x) => x.auto_apply)) {
    const escaped = c.heard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`(^|[^\\p{L}])${escaped}(?=$|[^\\p{L}])`, 'giu'), (_m, pre: string) => pre + c.correct);
  }
  return out;
}
