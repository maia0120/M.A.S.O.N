import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { onChange } from '../../core/events';
import { label } from '../../core/types';

/** Carrega dados e recarrega sempre que um dos tópicos mudar (inclusive por ação do MASON). */
export function useData<T>(loader: () => Promise<T>, topics: string[], deps: unknown[] = []): { data: T | undefined; reload: () => void; error: string | null } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const reload = useCallback(() => {
    loaderRef.current().then((d) => { setData(d); setError(null); }).catch((e: Error) => setError(e.message));
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, deps);
  useEffect(() => onChange((t) => { if (topics.includes(t)) reload(); }), [reload, topics.join(',')]);
  return { data, reload, error };
}

const TONE: Record<string, string> = {
  aprovada: 'ok', concluida: 'ok', concluido: 'ok', entregue: 'ok', decisao_confirmada: 'ok',
  em_desenvolvimento: 'primary', em_andamento: 'primary', ativo: 'primary', desenvolvimento: 'primary', ia_sugestao: 'primary',
  em_analise: 'warn', pausado: 'warn', nao_verificado: 'warn', qualidade: 'warn',
  arquivada: '', arquivado: '',
};

export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  return <span className={`badge ${TONE[value] ?? ''}`}>{label(value)}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="row between">
      <div className="stack" style={{ gap: 4 }}>
        <h1>{title}</h1>
        {subtitle && <p className="muted small">{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Field({ label: l, children }: { label: string; children: ReactNode }) {
  return <div className="field"><label>{l}</label>{children}</div>;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function CopyButton({ text, label: l = 'Copiar' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button className="btn primary" onClick={async () => { setDone(await copyText(text)); setTimeout(() => setDone(false), 1800); }}>
      {done ? 'Copiado' : l}
    </button>
  );
}

export function AskMason({ prompt, children }: { prompt: string; children: ReactNode }) {
  return (
    <button className="btn" onClick={() => window.dispatchEvent(new CustomEvent('mason:ask', { detail: prompt }))}>
      {children}
    </button>
  );
}

/** Número que sobe até o valor (anima quando o valor muda). */
export function CountUp({ value }: { value: number | undefined }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (value === undefined) return;
    const start = performance.now();
    const a = from.current;
    const dur = 900;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{value === undefined ? '…' : shown}</>;
}

/** Ícones de traço simples (SVG). */
export function Icon({ name }: { name: 'mic' | 'send' | 'stop' | 'plus' }) {
  const paths: Record<string, string> = {
    mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm-7 9a7 7 0 0 0 14 0M12 19v3',
    send: 'M4 12 20 4l-6 16-3-7-7-1Z',
    stop: 'M7 7h10v10H7z',
    plus: 'M12 5v14M5 12h14',
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
