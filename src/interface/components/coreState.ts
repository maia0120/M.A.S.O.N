import { useSyncExternalStore } from 'react';

/** Estado visual do núcleo do MASON (o orbe). */
export type CoreMode = 'idle' | 'listening' | 'thinking' | 'speaking';

let mode: CoreMode = 'idle';
let reducedMotion = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((s) => s());

export const core = {
  mode: () => mode,
  set(m: CoreMode) {
    if (m !== mode) { mode = m; notify(); }
  },
  reduced: () => reducedMotion,
  setReduced(v: boolean) {
    reducedMotion = v;
    document.documentElement.classList.toggle('reduced-motion', v);
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
  thinking: 'Pensando',
  speaking: 'Falando',
};
