import { useEffect, useRef, useState } from 'react';
import { nav, useNav } from '../navigation/navStore';
import { sectionById } from '../navigation/sections';
import { sendToMason, confirmPending, cancelPending, startNewConversation, type ActionRecord, type PendingAction } from '../../assistant/core/mason';
import { currentConversationId, getMessages } from '../../memory/history/conversationRepo';
import { listCorrections, applyCorrections, recordCorrection } from '../../memory/preferences/profileRepo';
import { extractCorrections } from '../../voice/corrections';
import { conversation, useConversation, STATE_TEXT } from '../../voice/conversation';
import { Orb } from '../components/Orb';
import { Icon } from '../components/ui';

interface UiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actions?: ActionRecord[];
}

/**
 * Tela da conversa. Toda a lógica de voz (ouvir, falar, continuar, encerrar) fica na máquina de estados
 * em voice/conversation.ts; aqui só se mostra o estado e se repassam os toques.
 */
export function ChatPanel() {
  const { chatOpen, section } = useNav();
  const conv = useConversation();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [input, setInput] = useState('');
  const transcriptRef = useRef<string | null>(null); // transcrição original, para aprender com correções
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
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight }); }, [messages, conv.state, pending, chatOpen, conv.partial]);

  // O "cérebro" que a máquina de estados chama a cada mensagem
  useEffect(() => {
    conversation.setProcessor(async (text, meta) => {
      let clean = text;
      if (meta.fromVoice) clean = applyCorrections(text, await listCorrections());
      setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', content: clean }]);
      const reply = await sendToMason(clean, { voice: meta.fromVoice });
      setMessages((m) => [...m, { id: reply.message.id, role: 'assistant', content: reply.message.content, actions: reply.actions }]);
      if (reply.pending.length) setPending((p) => [...p, ...reply.pending]);
      return { reply: reply.message.content, needsConfirmation: reply.pending.length > 0, debug: reply.debug };
    });
    // Revisão antes de enviar (opcional): o texto ouvido vai para o campo, para corrigir
    conversation.setReviewer((text) => { transcriptRef.current = text; setInput(text); });
    return () => conversation.setReviewer(null);
  }, []);

  // Chamado pela palavra de ativação ("MASON")
  useEffect(() => {
    const onWake = () => {
      nav.setChat(true);
      setTimeout(() => void conversation.listen('wake'), 250);
    };
    window.addEventListener('mason:wake', onWake);
    return () => window.removeEventListener('mason:wake', onWake);
  }, []);

  // Botões "Pedir ao MASON" espalhados pelo app
  useEffect(() => {
    const handler = (e: Event) => { nav.setChat(true); void conversation.sendText((e as CustomEvent<string>).detail); };
    window.addEventListener('mason:ask', handler);
    return () => window.removeEventListener('mason:ask', handler);
  }, []);

  const sendTyped = async () => {
    const clean = input.trim();
    if (!clean) return;
    // Aprende com correções feitas na transcrição revisada
    if (transcriptRef.current && transcriptRef.current !== clean) {
      for (const c of extractCorrections(transcriptRef.current, clean)) await recordCorrection(c.heard, c.correct).catch(() => undefined);
    }
    transcriptRef.current = null;
    setInput('');
    await conversation.sendText(clean);
  };

  const onOrb = () => {
    if (conv.state === 'SPEAKING') return void conversation.interrupt();
    if (conv.state === 'LISTENING') return void conversation.stopListening();
    void conversation.listen('button');
  };

  const close = () => {
    void conversation.end();
    nav.setChat(false);
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

  const listening = conv.state === 'LISTENING' || conv.state === 'TRANSCRIBING';
  const working = conv.state === 'PROCESSING' || conv.state === 'RESPONDING';
  const waiting = conv.state === 'WAITING_FOR_USER' || conv.state === 'ERROR';

  return (
    <div className="chat" role="dialog" aria-label="Conversa com o MASON">
      <div className="chat-head">
        <div><strong>MASON</strong><small>em {sectionById(section)?.title ?? section} · modo {conv.mode === 'continua' ? 'contínuo' : conv.mode === 'botao' ? 'só botão' : 'controlado'}</small></div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={async () => { if (window.confirm('Começar uma nova conversa? A atual fica guardada no histórico.')) { await conversation.end(); await startNewConversation(); setPending([]); await loadHistory(); } }}>Nova</button>
          <button className="btn" onClick={close} aria-label="Fechar">Fechar</button>
        </div>
      </div>
      <div className={`chat-stage ${messages.length ? 'compact' : ''}`}>
        <Orb size={messages.length ? 96 : 170} onClick={onOrb} showLabel />
      </div>
      <div className="conv-status" data-state={conv.state}>{conv.notice ?? STATE_TEXT[conv.state]}</div>
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
        {listening && conv.partial && <div className="msg user partial">{conv.partial}</div>}
        {pending.map((p) => (
          <div key={p.id} className="confirm-box">
            <span>{p.question}</span>
            <div className="row"><button className="btn danger" onClick={() => decide(p, true)}>Confirmar</button><button className="btn" onClick={() => decide(p, false)}>Cancelar</button></div>
          </div>
        ))}
        {working && <div className="typing" aria-label="MASON está pensando"><i /><i /><i /></div>}
      </div>

      {/* Controles da conversa: o microfone só abre por ação do Gabriel (ou no modo contínuo) */}
      {(waiting || conv.state === 'SPEAKING' || listening || (conv.mode === 'continua' && conv.state !== 'IDLE')) && (
        <div className="conv-controls">
          {conv.state === 'SPEAKING' && <button className="btn" onClick={() => void conversation.interrupt()}>Interromper</button>}
          {listening && <button className="btn primary" onClick={() => void conversation.stopListening()}>Terminei de falar</button>}
          {waiting && conv.mode !== 'botao' && <button className="btn primary" onClick={() => void conversation.listen('continue')}><Icon name="mic" /> Continuar</button>}
          <button className="btn danger" onClick={() => void conversation.end()}>Encerrar conversa</button>
        </div>
      )}

      <div className="chat-input">
        <button className="icon-btn" disabled title="Anexar arquivos (em breve)" aria-label="Anexar arquivos (em breve)"><Icon name="plus" /></button>
        <textarea
          rows={1}
          placeholder={listening ? 'Ouvindo…' : 'Escreva ou fale…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendTyped(); } }}
        />
        <button className={`icon-btn ${listening ? 'recording' : ''}`} onClick={onOrb} aria-label={listening ? 'Terminar de falar' : 'Falar'}>
          {listening ? <Icon name="stop" /> : <Icon name="mic" />}
        </button>
        <button className="icon-btn primary" onClick={() => void sendTyped()} disabled={!input.trim() || working} aria-label="Enviar"><Icon name="send" /></button>
      </div>
    </div>
  );
}
