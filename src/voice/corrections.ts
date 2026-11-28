/**
 * Compara a transcrição original com o texto que o usuário enviou depois de corrigir,
 * e extrai pares curtos "ouvido → correto" para aprender com erros recorrentes.
 */
export function extractCorrections(heard: string, sent: string): { heard: string; correct: string }[] {
  const a = heard.trim().split(/\s+/).filter(Boolean);
  const b = sent.trim().split(/\s+/).filter(Boolean);
  if (!a.length || !b.length) return [];
  const norm = (w: string) => w.toLowerCase().replace(/[.,!?;:]+$/g, '');
  // LCS em tabela (textos de voz são curtos)
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = norm(a[i]) === norm(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  // Se o usuário reescreveu quase tudo, não é correção de transcrição.
  if (dp[0][0] < Math.min(a.length, b.length) * 0.5) return [];

  const out: { heard: string; correct: string }[] = [];
  let i = 0, j = 0;
  let ha: string[] = [], hb: string[] = [];
  const flush = () => {
    if (ha.length && hb.length && ha.length <= 3 && hb.length <= 3) {
      out.push({ heard: ha.map(norm).join(' '), correct: hb.join(' ').replace(/[.,!?;:]+$/g, '') });
    }
    ha = []; hb = [];
  };
  while (i < a.length && j < b.length) {
    if (norm(a[i]) === norm(b[j])) { flush(); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ha.push(a[i++]);
    else hb.push(b[j++]);
  }
  while (i < a.length) ha.push(a[i++]);
  while (j < b.length) hb.push(b[j++]);
  flush();
  return out;
}
