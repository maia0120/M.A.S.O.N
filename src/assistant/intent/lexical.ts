/**
 * Classificador léxico próprio: compara pedaços de palavras (n-gramas de caracteres) e palavras inteiras.
 * Tolera erros de digitação, plurais e variações ("anota", "anotar", "anotaa").
 * É leve (< 1 MB em memória), instantâneo e funciona mesmo se o modelo de significados não carregar.
 */
export type SparseVec = Map<string, number>;

function grams(text: string): string[] {
  const out: string[] = [];
  for (const word of text.split(' ')) {
    if (!word) continue;
    out.push('w:' + word);
    const padded = ` ${word} `;
    for (const n of [3, 4]) for (let i = 0; i + n <= padded.length; i++) out.push(padded.slice(i, i + n));
  }
  return out;
}

export class LexicalIndex {
  private idf = new Map<string, number>();
  private docs: { key: string; vec: SparseVec; words: number; grams: Set<string> }[] = [];

  constructor(entries: { key: string; text: string }[]) {
    const df = new Map<string, number>();
    const raw = entries.map((e) => ({ ...e, g: grams(e.text) }));
    for (const r of raw) for (const g of new Set(r.g)) df.set(g, (df.get(g) ?? 0) + 1);
    const n = raw.length;
    for (const [g, c] of df) this.idf.set(g, Math.log(1 + n / c));
    this.docs = raw.map((r) => ({ key: r.key, vec: this.vectorFromGrams(r.g), words: r.text.split(' ').length, grams: new Set(r.g) }));
  }

  private vectorFromGrams(g: string[]): SparseVec {
    const v: SparseVec = new Map();
    for (const x of g) v.set(x, (v.get(x) ?? 0) + (this.idf.get(x) ?? Math.log(1 + this.docs.length + 1)));
    let norm = 0;
    for (const w of v.values()) norm += w * w;
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of v) v.set(k, w / norm);
    return v;
  }

  /**
   * Para cada entrada: o maior entre
   *  - cosseno com a mensagem inteira (bom para mensagens curtas: "valeu", "sim");
   *  - cobertura: quanto do exemplo aparece dentro da mensagem (bom para "tive uma ideia" + o conteúdo da ideia).
   * A cobertura só vale cheia para exemplos de 3+ palavras, para "pode" não disparar em "pode criar um app".
   */
  score(text: string): Map<string, number> {
    const g = grams(text);
    const q = this.vectorFromGrams(g);
    const qset = new Set(g);
    const best = new Map<string, number>();
    for (const d of this.docs) {
      let cos = 0;
      for (const [k, w] of d.vec) {
        const o = q.get(k);
        if (o) cos += w * o;
      }
      let covered = 0;
      let total = 0;
      for (const x of d.grams) {
        const w = this.idf.get(x) ?? 1;
        total += w;
        if (qset.has(x)) covered += w;
      }
      const coverage = total ? covered / total : 0;
      const lengthTrust = Math.min(1, d.words / 3);
      const s = Math.max(cos, coverage * coverage * lengthTrust * 0.95);
      if (s > (best.get(d.key) ?? 0)) best.set(d.key, s);
    }
    return best;
  }
}
