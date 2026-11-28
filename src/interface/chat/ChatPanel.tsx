import { useEffect, useRef, useState } from 'react';
import { nav, useNav } from '../navigation/navStore';
import { sectionById } from '../navigation/sections';
import { sendToMason, confirmPending, cancelPending, startNewConversation, type ActionRecord, type PendingAction } from '../../assistant/core/mason';
import { currentConversationId, getMessages } from '../../memory/history/conversationRepo';
import { listCorrections, applyCorrections, recordCorrection } from '../../memory/preferences/profileRepo';
import { getRecognizer } from '../../voice/speech-recognition/recognizer';
import { speak, stopSpeaking } from '../../voice/speech-synthesis/speaker';
import { loadVoicePrefs } from '../../voice/voicePrefs';
import { extractCorrections } from '../../voice/corrections';
import { Orb } from '../components/Orb';
import { Icon } from '../components/ui';
import { core } from '../components/coreState';

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: ActionRecord[];
}

export function ChatPanel() {
  const { chatOpen, section } = useNav();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceInfo, setVoiceInfo] = useState<string | null>(null);
  const transcriptRef = useRef<string | null>(null); // transcrição original, para aprender com correções
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const loadHistory = async () => {
    const conv = await currentConversationId();
    const rows = await getMessages(conv, 100);
    setMessages(rows.filter((m) => m.role !== 'tool').map((m) => ({
      id: m.id, role: m.role as 'user' | 'assistant', content: m.content,
      actions: m.meta ? (JSON.parse(m.meta) as { actions?: ActionRecord[] }).actions : undefined,
    })));
  };

  useEffect(() => { void loadHistory(); }, []);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }); }, [messages, busy, pending, chatOpen]);

  const send = async (text: string, fromVoice = false) => {
    const clean = text.trim();
    if (!clean || busy) return;
    // Aprende com correções feitas na transcrição antes do envio.
    if (transcriptRef.current && transcriptRef.current !== clean) {
      for (const c of extractCorrections(transcriptRef.current, clean)) await recordCorrection(c.heard, c.correct).catch(() => undefined);
    }
    const wasVoice = fromVoice || transcriptRef.current !== null;
    transcriptRef.current = null;
    setInput('');
    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: clean }]);
    setBusy(true);
    core.set('thinking');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const reply = await sendToMason(clean, { voice: wasVoice, signal: ctrl.signal });
      setMessages((m) => [...m, { id: reply.message.id, role: 'assistant', content: reply.message.content, actions: reply.actions }]);
      if (reply.pending.length) setPending((p) => [...p, ...reply.pending]);
      const prefs = await loadVoicePrefs();
      core.set('idle');
      if (wasVoice && prefs.speakReplies && !ctrl.signal.aborted) {
        core.set('speaking');
        void speak(reply.message.content, prefs).finally(() => core.set('idle'));
      }
    } finally {
      if (core.mode() === 'thinking') core.set('idle');
      setBusy(false);
      abortRef.current = null;
    }
  };

  // Botões "Pedir ao MASON" espalhados pelo app
  useEffect(() => {
    const handler = (e: Event) => { nav.setChat(true); void send((e as CustomEvent<string>).detail); };
    window.addEventListener('mason:ask', handler);
    return () => window.removeEventListener('mason:ask', handler);
  });

  const mic = async () => {
    if (listening) {
      await (await getRecognizer()).stop();
      return;
    }
    await stopSpeaking(); // interromper a fala ao começar a ouvir
    core.set('idle');
    setVoiceInfo(null);
    try {
      const rec = await getRecognizer();
      if (!(await rec.available())) { setVoiceInfo('Reconhecimento de voz indisponível neste aparelho.'); return; }
      const corrections = await listCorrections();
      const before = input ? input.trim() + ' ' : '';
      setListening(true);
      core.set('listening');
      const raw = await rec.listen((partial) => setInput(before + partial)).finally(() => core.set('idle'));
      setListening(false);
      const fixed = applyCorrections(raw, corrections);
      const full = (before + fixed).trim();
      if (!full) { setVoiceInfo('Não captei nada. Tente de novo.'); return; }
      const prefs = await loadVoicePrefs();
      if (prefs.reviewBeforeSend) {
        transcriptRef.current = full;
        setInput(full);
        setVoiceInfo('Confira o texto, corrija se precisar e envie. Toque no microfone para continuar falando.');
      } else {
        transcriptRef.current = null;
        await send(full, true);
      }
    } catch (e) {
      setListening(false);
      setVoiceInfo((e as Error).message);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    void stopSpeaking();
    core.set('idle');
  };

  const decide = async (p: PendingAction, ok: boolean) => {
    setPending((list) => list.filter((x) => x.id !== p.id));
    if (!ok) { cancelPending(p.id); setMessages((m) => [...m, { id: `c-${p.id}`, role: 'assistant', content: 'Certo, não fiz nada.' }]); return; }
    await confirmPending(p.id);
    await loadHistory();
  };

  if (!chatOpen) {
    if (section === 'work-dashboard') return null; // no painel, o orbe já está em destaque
    return <div className="fab-orb"><Orb size={64} onClick={() => nav.setChat(true)} /></div>;
  }

  return (
    <div className="chat" role="dialog" aria-label="Conversa com o MASON">
      <div className="chat-head">
        <div><strong>MASON</strong><small>em {sectionById(section)?.title ?? section}</small></div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={async () => { if (window.confirm('Começar uma nova conversa? A atual fica guardada no histórico.')) { await startNewConversation(); setPending([]); await loadHistory(); } }}>Nova</button>
          <button className="btn" onClick={() => nav.setChat(false)} aria-label="Fechar">Fechar</button>
        </div>
      </div>
      <div className={`chat-stage ${messages.length ? 'compact' : ''}`}>
        <Orb size={messages.length ? 96 : 170} onClick={mic} showLabel />
      </div>
      <div className="chat-body" ref={bodyRef}>
        {messages.length === 0 && <div className="muted small" style={{ textAlign: 'center', marginTop: 20 }}>Toque no núcleo para falar, ou escreva do seu jeito. Ex.: “Mano, tive uma ideia…”</div>}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            {m.content}
            {m.actions && m.actions.length > 0 && (
              <div className="actions">
                {m.actions.map((a, i) => <span key={i} className={`badge ${a.ok ? 'ok' : 'warn'}`} title={a.tool}>{a.ok ? '✓' : '•'} {a.summary}</span>)}
              </div>
            )}
          </div>
        ))}
        {pending.map((p) => (
          <div key={p.id} className="confirm-box">
            <span>{p.question}</span>
            <div className="row"><button className="btn danger" onClick={() => decide(p, true)}>Confirmar</button><button className="btn" onClick={() => decide(p, false)}>Cancelar</button></div>
          </div>
        ))}
        {busy && <div className="typing" aria-label="MASON está pensando"><i /><i /><i /></div>}
      </div>
      {voiceInfo && <div className="voice-hint">{voiceInfo}</div>}
      <div className="chat-input">
        <button className="icon-btn" disabled title="Anexar arquivos (em breve)" aria-label="Anexar arquivos (em breve)"><Icon name="plus" /></button>
        <textarea
          rows={1}
          placeholder={listening ? 'Ouvindo…' : 'Escreva ou fale…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
        />
        <button className={`icon-btn ${listening ? 'recording' : ''}`} onClick={mic} aria-label={listening ? 'Parar de ouvir' : 'Falar'}>{listening ? <Icon name="stop" /> : <Icon name="mic" />}</button>
        {busy
          ? <button className="icon-btn" onClick={stop} aria-label="Interromper"><Icon name="stop" /></button>
          : <button className="icon-btn primary" onClick={() => { stop(); void send(input); }} disabled={!input.trim()} aria-label="Enviar"><Icon name="send" /></button>}
      </div>
    </div>
  );
}
