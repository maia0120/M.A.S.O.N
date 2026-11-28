import { useSyncExternalStore } from 'react';

/** Estado visual do núcleo do MASON (o orbe). */
export type CoreMode = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'waiting' | 'error';

let mode: CoreMode = 'idle';
let level = 0;
let reducedMotion = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((s) => s());

export const core = {
  mode: () => mode,
  set(m: CoreMode) {
    if (m !== mode) { mode = m; notify(); }
  },
  level: () => level,
  /** Nível da voz (0–1) enquanto ouve, para o orbe reagir. */
  setLevel(v: number) {
    level = v;
    if (typeof document !== 'undefined') document.documentElement.style.setProperty('--voice-level', v.toFixed(2));
  },
  reduced: () => reducedMotion,
  setReduced(v: boolean) {
    reducedMotion = v;
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('reduced-motion', v);
    notify();
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

export function useCoreMode(): CoreMode {
  return useSyncExternalStore(core.subscribe, core.mode, core.mode);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(core.subscribe, core.reduced, core.reduced);
}

export const MODE_LABEL: Record<CoreMode, string> = {
  idle: 'Em espera',
  listening: 'Ouvindo',
  transcribing: 'Transcrevendo',
  thinking: 'Pensando',
  speaking: 'Falando',
  waiting: 'Aguardando você',
  error: 'Erro',
};
