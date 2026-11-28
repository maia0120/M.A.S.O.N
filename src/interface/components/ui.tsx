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
