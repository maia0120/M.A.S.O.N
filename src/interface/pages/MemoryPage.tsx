import { useState } from 'react';
import { useData, Empty, PageHeader, StatusBadge } from '../components/ui';
import { listMemories, updateMemory, deleteMemory, remember } from '../../memory/repository/memoryRepo';
import { listExpressions, saveExpression, deleteExpression, listCorrections, setCorrectionAuto, deleteCorrection, recordCorrection } from '../../memory/preferences/profileRepo';
import { formatDate } from '../../core/util';
import { MEMORY_SOURCES, MEMORY_KINDS, label, type Memory, type MemorySource, type MemoryKind } from '../../core/types';

export function MemoryPage() {
  const [tab, setTab] = useState<'memories' | 'expressions' | 'voice'>('memories');
  return (
    <>
      <PageHeader title="Memória" subtitle="Tudo o que o MASON guarda sobre você, com a origem de cada informação. Você pode corrigir ou apagar." />
      <div className="tabs">
        <button className={`tab ${tab === 'memories' ? 'active' : ''}`} onClick={() => setTab('memories')}>Memórias</button>
        <button className={`tab ${tab === 'expressions' ? 'active' : ''}`} onClick={() => setTab('expressions')}>Meu jeito de falar</button>
        <button className={`tab ${tab === 'voice' ? 'active' : ''}`} onClick={() => setTab('voice')}>Correções de voz</button>
      </div>
      {tab === 'memories' && <Memories />}
      {tab === 'expressions' && <Expressions />}
      {tab === 'voice' && <Corrections />}
    </>
  );
}

function Memories() {
  const { data } = useData(() => listMemories(true), ['memories']);
  const [content, setContent] = useState('');
  const [kind, setKind] = useState<MemoryKind>('fato');
  return (
    <div className="card stack">
      <div className="row">
        <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Ensinar algo ao MASON (ex.: prefiro respostas curtas)" value={content} onChange={(e) => setContent(e.target.value)} />
        <select className="select" style={{ width: 'auto' }} value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)}>
          {MEMORY_KINDS.map((k) => <option key={k} value={k}>{label(k)}</option>)}
        </select>
        <button className="btn primary" disabled={!content.trim()} onClick={async () => { await remember({ kind, content, source: 'usuario' }); setContent(''); }}>Guardar</button>
      </div>
      {data?.length === 0 && <Empty>Nada guardado ainda.</Empty>}
      <div className="list">{data?.map((m) => <MemoryRow key={m.id} m={m} />)}</div>
    </div>
  );
}

function MemoryRow({ m }: { m: Memory }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  return (
    <div className="list-item" style={{ cursor: 'default', alignItems: 'flex-start', opacity: m.active ? 1 : 0.5 }}>
      <div className="stack" style={{ gap: 6, flex: 1 }}>
        {editing ? <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} /> : <span>{m.subject ? <strong>{m.subject}: </strong> : null}{m.content}</span>}
        <div className="row small">
          <span className="badge">{label(m.kind)}</span>
          <StatusBadge value={m.source} />
          <span className="muted">{formatDate(m.updated_at)}</span>
        </div>
      </div>
      <div className="stack" style={{ gap: 4 }}>
        {editing
          ? <button className="btn small" onClick={async () => { await updateMemory(m.id, { content: text }); setEditing(false); }}>Salvar</button>
          : <button className="btn small" onClick={() => setEditing(true)}>Corrigir</button>}
        <select className="select small" value={m.source} onChange={(e) => updateMemory(m.id, { source: e.target.value as MemorySource })}>
          {MEMORY_SOURCES.map((s) => <option key={s} value={s}>{label(s)}</option>)}
        </select>
        <button className="btn small" onClick={() => updateMemory(m.id, { active: m.active ? 0 : 1 })}>{m.active ? 'Desativar' : 'Reativar'}</button>
        <button className="btn small danger" onClick={() => window.confirm('Apagar esta memória definitivamente?') && deleteMemory(m.id)}>Apagar</button>
      </div>
    </div>
  );
}

function Expressions() {
  const { data } = useData(listExpressions, ['profile']);
  const [exp, setExp] = useState('');
  const [meaning, setMeaning] = useState('');
  return (
    <div className="card stack">
      <p className="small muted">Expressões que você explicou. O MASON usa como pista — o contexto continua valendo.</p>
      <div className="row">
        <input className="input" style={{ flex: 1, minWidth: 140 }} placeholder="Expressão (ex.: “joga pro Claude”)" value={exp} onChange={(e) => setExp(e.target.value)} />
        <input className="input" style={{ flex: 2, minWidth: 180 }} placeholder="O que significa" value={meaning} onChange={(e) => setMeaning(e.target.value)} />
        <button className="btn primary" disabled={!exp.trim() || !meaning.trim()} onClick={async () => { await saveExpression(exp, meaning); setExp(''); setMeaning(''); }}>Adicionar</button>
      </div>
      {data?.length === 0 && <Empty>Nenhuma expressão registrada.</Empty>}
      <div className="list">
        {data?.map((e) => (
          <div key={e.id} className="list-item" style={{ cursor: 'default' }}>
            <span><strong>“{e.expression}”</strong> — {e.meaning}</span>
            <button className="btn small danger" onClick={() => deleteExpression(e.id)}>Remover</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Corrections() {
  const { data } = useData(listCorrections, ['profile']);
  const [heard, setHeard] = useState('');
  const [correct, setCorrect] = useState('');
  return (
    <div className="card stack">
      <p className="small muted">Quando o reconhecimento de voz erra, corrija o texto antes de enviar: o MASON registra o par. Depois de 3 vezes, a correção passa a ser aplicada automaticamente (você pode ligar/desligar).</p>
      <div className="row">
        <input className="input" style={{ flex: 1 }} placeholder="O que foi ouvido" value={heard} onChange={(e) => setHeard(e.target.value)} />
        <input className="input" style={{ flex: 1 }} placeholder="O correto" value={correct} onChange={(e) => setCorrect(e.target.value)} />
        <button className="btn primary" disabled={!heard.trim() || !correct.trim()} onClick={async () => { const c = await recordCorrection(heard, correct); await setCorrectionAuto(c.id, true); setHeard(''); setCorrect(''); }}>Adicionar</button>
      </div>
      {data?.length === 0 && <Empty>Nenhuma correção registrada.</Empty>}
      <div className="list">
        {data?.map((c) => (
          <div key={c.id} className="list-item" style={{ cursor: 'default' }}>
            <span>“{c.heard}” → <strong>{c.correct}</strong> <span className="small muted">({c.count}×)</span></span>
            <span className="row">
              <label className="small row" style={{ gap: 4 }}><input type="checkbox" checked={Boolean(c.auto_apply)} onChange={(e) => setCorrectionAuto(c.id, e.target.checked)} /> automática</label>
              <button className="btn small danger" onClick={() => deleteCorrection(c.id)}>Remover</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
