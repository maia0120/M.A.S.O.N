/** Barramento simples: avisa a interface que os dados mudaram (ex.: depois que o MASON executa uma ferramenta). */
type Listener = (topic: string) => void;
const listeners = new Set<Listener>();

export function emitChange(topic: string) {
  for (const l of listeners) l(topic);
}

export function onChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
