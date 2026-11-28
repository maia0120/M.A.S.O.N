import { useEffect, useState } from 'react';
import { useData, PageHeader, Field, copyText } from '../components/ui';
import { loadVoicePrefs, saveVoicePrefs, type VoicePrefs } from '../../voice/voicePrefs';
import { getRecognizer } from '../../voice/speech-recognition/recognizer';
import { speak } from '../../voice/speech-synthesis/speaker';
import { getPref, setPref } from '../../memory/preferences/profileRepo';
import { clearAllConversations } from '../../memory/history/conversationRepo';
import { exportAll, tableCounts, schemaVersion } from '../../storage/backup';
import { db } from '../../storage/database/db';
import { INTEGRATIONS } from '../../integrations';
import { APP_VERSION } from '../../core/version';
import { semanticStatus } from '../../assistant/intent/semantic';
import { core, useReducedMotion } from '../components/coreState';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Configurações" />
      <CoreSettings />
      <VoiceSettings />
      <CommunicationSettings />
      <AppearanceSettings />
      <StorageSettings />
      <IntegrationsSettings />
      <SecurityNotes />
      <Diagnostics />
    </>
  );
}

function CoreSettings() {
  const [st, setSt] = useState(semanticStatus());
  useEffect(() => { const t = setInterval(() => setSt(semanticStatus()), 1000); return () => clearInterval(t); }, []);
  const desc = st.state === 'ready' ? `carregado (${(st.loadMs / 1000).toFixed(1)} s)`
    : st.state === 'loading' ? 'carregando…'
    : st.state === 'failed' ? `não carregou — usando só o classificador léxico (${st.reason})`
    : 'desligado — usando só o classificador léxico';
  return (
    <section className="card stack">
      <h2>Núcleo do MASON</h2>
      <p className="small">Inteligência própria, executada no aparelho. Não usa APIs de IA de terceiros e não tem chaves para configurar.</p>
      <p className="small muted">Modelo de significados: {desc}</p>
      <p className="small muted">Fase 1: entende ideias, buscas e navegação. Projetos, tarefas e documentos pela conversa chegam na Fase 2.</p>
    </section>
  );
}

function VoiceSettings() {
  const { data: prefs } = useData(loadVoicePrefs, ['preferences']);
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => { void getRecognizer().then((r) => r.available()).then(setAvailable).catch(() => setAvailable(false)); }, []);
  if (!prefs) return null;
  const set = (p: Partial<VoicePrefs>) => saveVoicePrefs({ ...prefs, ...p });
  return (
    <section className="card stack">
      <h2>Voz</h2>
      <p className="small muted">Reconhecimento de fala: {available === null ? 'verificando…' : available ? 'disponível (pt-BR)' : 'indisponível neste aparelho/navegador'}</p>
      <label className="row small"><input type="checkbox" checked={prefs.reviewBeforeSend} onChange={(e) => set({ reviewBeforeSend: e.target.checked })} /> Revisar a transcrição antes de enviar (permite corrigir e ensinar o MASON)</label>
      <label className="row small"><input type="checkbox" checked={prefs.speakReplies} onChange={(e) => set({ speakReplies: e.target.checked })} /> Responder em voz quando eu falar pelo microfone</label>
      <Field label={`Velocidade da fala: ${prefs.rate.toFixed(2)}`}><input type="range" min={0.6} max={1.6} step={0.05} value={prefs.rate} onChange={(e) => set({ rate: Number(e.target.value) })} /></Field>
      <Field label={`Tom: ${prefs.pitch.toFixed(2)}`}><input type="range" min={0.7} max={1.3} step={0.05} value={prefs.pitch} onChange={(e) => set({ pitch: Number(e.target.value) })} /></Field>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => speak('Oi. Esta é a minha voz atual. Dá pra ajustar a velocidade e o tom aqui.', prefs)}>Ouvir exemplo</button>
      <p className="small muted">A escolha de uma voz específica do aparelho será adicionada numa próxima versão.</p>
    </section>
  );
}

function CommunicationSettings() {
  const { data: length } = useData(() => getPref('comm.response_length'), ['preferences']);
  return (
    <section className="card stack">
      <h2>Comunicação</h2>
      <Field label="Tamanho das respostas">
        <select className="select" value={length ?? 'automatico'} onChange={(e) => setPref('comm.response_length', e.target.value)}>
          <option value="automatico">Automático (curto quando simples, detalhado quando precisa)</option>
          <option value="curta">Prefiro respostas curtas</option>
          <option value="detalhada">Prefiro respostas detalhadas</option>
        </select>
      </Field>
      <p className="small muted">Expressões, memórias e correções de voz ficam em Memória, onde você pode consultar e corrigir tudo.</p>
    </section>
  );
}

function AppearanceSettings() {
  const reduced = useReducedMotion();
  const set = async (v: boolean) => {
    core.setReduced(v);
    await setPref('ui.motion', v ? 'reduzido' : 'completo');
  };
  return (
    <section className="card stack">
      <h2>Aparência</h2>
      <p className="small muted">Tema escuro no estilo Jarvis. Com animações reduzidas, o fundo animado e os efeitos param, o que economiza bateria.</p>
      <div className="tabs">
        <button className={`tab ${!reduced ? 'active' : ''}`} onClick={() => set(false)}>Animações completas</button>
        <button className={`tab ${reduced ? 'active' : ''}`} onClick={() => set(true)}>Animações reduzidas</button>
      </div>
    </section>
  );
}

function StorageSettings() {
  const { data: counts } = useData(tableCounts, ['ideas', 'projects', 'tasks', 'documents', 'files', 'memories', 'activities']);
  const [msg, setMsg] = useState<string | null>(null);
  const backup = async () => {
    const json = await exportAll();
    if (db().kind === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = `mason-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setMsg('Backup baixado.');
    } else {
      setMsg((await copyText(json)) ? 'Backup copiado para a área de transferência (cole num arquivo seguro).' : 'Não foi possível copiar.');
    }
  };
  return (
    <section className="card stack">
      <h2>Armazenamento e memória</h2>
      <p className="small muted">Tudo fica neste aparelho (SQLite). Nada é enviado para banco remoto nem para serviços de IA.</p>
      {counts && <p className="small">Ideias: {counts.ideas} · Projetos: {counts.projects} · Tarefas: {counts.tasks} · Documentos: {counts.documents} · Arquivos: {counts.files} · Memórias: {counts.memories} · Mensagens: {counts.messages}</p>}
      <div className="row">
        <button className="btn" onClick={backup}>Exportar backup (JSON)</button>
        <button className="btn danger" onClick={async () => { if (window.confirm('Apagar todo o histórico de conversas? Ideias, projetos e memórias continuam.')) { await clearAllConversations(); setMsg('Histórico de conversas apagado.'); } }}>Apagar histórico de conversas</button>
      </div>
      {msg && <p className="small muted">{msg}</p>}
    </section>
  );
}

function IntegrationsSettings() {
  return (
    <section className="card stack">
      <h2>Integrações</h2>
      <div className="list">
        {INTEGRATIONS.map((i) => (
          <div key={i.id} className="list-item" style={{ cursor: 'default', alignItems: 'flex-start' }}>
            <div><strong>{i.name}</strong> <span className="small muted">— {i.purpose}</span><div className="small muted">{i.notes}</div></div>
            <span className={`badge ${i.status === 'manual' ? 'primary' : ''}`}>{i.status === 'manual' ? 'Manual' : 'Não conectado'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SecurityNotes() {
  return (
    <section className="card stack">
      <h2>Segurança</h2>
      <ul className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
                <li>O MASON não envia suas conversas para nenhum serviço de IA. Tudo é processado no aparelho.</li>
        <li>Exclusões pedidas ao MASON só acontecem depois que você toca em “Confirmar”.</li>
        <li>O backup do Android está desativado para o app (veja o README), para que os dados não sejam copiados para a nuvem sem você saber.</li>
      </ul>
    </section>
  );
}

function Diagnostics() {
  const { data } = useData(async () => {
    const { Capacitor } = await import('@capacitor/core');
    return { platform: Capacitor.getPlatform(), driver: db().kind, schema: await schemaVersion() };
  }, ['preferences']);
  return (
    <section className="card stack">
      <h2>Diagnóstico e versão</h2>
      {data && <p className="small">Plataforma: {data.platform} · Banco: {data.driver} (schema v{data.schema}) · Núcleo: próprio (Fase 1)</p>}
      <p className="small muted">MASON {APP_VERSION} — núcleo próprio, Fase 1. </p>
    </section>
  );
}
