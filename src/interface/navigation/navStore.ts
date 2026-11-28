import { useSyncExternalStore } from 'react';

/** Estado de navegação global (sem dependência de roteador). */
export interface NavState {
  section: string;
  /** Registro aberto na seção (ex.: id de uma ideia ou projeto). */
  recordId: string | null;
  chatOpen: boolean;
}

let state: NavState = { section: 'work-dashboard', recordId: null, chatOpen: false };
const subs = new Set<() => void>();
const set = (patch: Partial<NavState>) => {
  state = { ...state, ...patch };
  subs.forEach((s) => s());
};

export const nav = {
  get: () => state,
  open(section: string, recordId: string | null = null) {
    set({ section, recordId });
  },
  setChat(open: boolean) {
    set({ chatOpen: open });
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

export function useNav(): NavState {
  return useSyncExternalStore(nav.subscribe, nav.get, nav.get);
}
