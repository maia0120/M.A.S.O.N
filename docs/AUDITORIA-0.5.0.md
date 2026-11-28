# Auditoria do MASON 0.5.0

27/11/2026. Etapas 1 e 2 do pedido "Auditoria, correções e aprimoramento geral". Nenhum código de produto foi alterado nesta etapa.

Base: leitura integral de `docs/DECISOES.md` (D0–D34), leitura do código (`src/`, `plugins/`, CI) e uma medição nova de compreensão num conjunto independente.

> O pedido recebido estava cortado na seção 16 ("Regras importantes"). As regras visíveis foram seguidas; o restante precisa ser reenviado.

---

## 1. Como a voz funciona hoje (o caminho real no código)

1. **Abertura do microfone:** `ChatPanel.mic()`. Primeiro para a fala (`stopSpeaking`), depois pausa a palavra de ativação (`pauseWake`, espera fixa de 350 ms) e então chama `recognizer.listen()`.
2. **Reconhecimento no Android:** plugin `@capacitor-community/speech-recognition`, com `partialResults: true` e `maxResults: 1`. O texto final é o **último resultado parcial**, recebido quando o evento `listeningState: stopped` chega.
3. **Correções aprendidas:** `applyCorrections` substitui trechos em qualquer lugar da frase depois de 3 ocorrências.
4. **Envio:** `send()` → `sendToMason()` → interpretação → resposta salva em texto.
5. **Fala:** `speak(forVoice(...))`. Ao terminar, se a mensagem veio por voz e a conversa contínua está ligada (**padrão: ligada**, D32), chama `mic(true)` de novo.
6. **Palavra de ativação:** um observador do estado do orbe pausa o Vosk quando não está "em espera" e o retoma 3 s depois de voltar a "em espera".

---

## 2. Diagnóstico por camada (transcrição × interpretação)

| Camada | Situação | Achado |
|---|---|---|
| Captura e permissões | ⚠️ | Microfone pedido pelo plugin; sem verificação de foco de áudio |
| Conflito Vosk × Android | ❌ **provável causa de "abre mas não reconhece"** | A pausa do Vosk é um pedido assíncrono ao serviço, seguido de uma espera fixa de 350 ms. Não há confirmação de que o microfone foi solto. Se o Android começa a ouvir antes, ele recebe silêncio ou erro de "ocupado" |
| Início e fim do reconhecimento | ❌ | Sem tempo-limite: se o evento `stopped` não chegar (comportamento varia por aparelho), o estado fica preso em OUVINDO. `removeAllListeners` a cada sessão pode remover ouvintes de uma sessão ainda ativa |
| Transcrição | ❌ **provável causa de "não corresponde ao que falei"** | O texto usado é o último **parcial**, não o resultado final. No Android, os parciais costumam ser menos precisos (o final revisa palavras). Com `maxResults: 1`, também não há alternativas para escolher |
| Pausas naturais | ❌ | O plugin não permite ajustar o tempo de silêncio. O padrão do Android encerra cedo e corta frases com pausa |
| Fala × microfone | ⚠️ | Na conversa contínua, o microfone reabre logo após a fala. O fim da voz e o eco podem entrar na captura |
| Aprendizado de correções | ❌ | (a) Desde a D32 (enviar direto, sem revisar), o aprendizado praticamente **não acontece**, porque só aprende quando o texto revisado é editado antes do envio. (b) A aplicação automática após 3 vezes não verifica o contexto nem o tamanho da palavra |
| Interpretação | ⚠️ | Detalhes na seção 3 |
| Reabertura automática | ❌ **causa dos itens 1 e 2 do pedido** | É o comportamento padrão (D32). Não há modo "controlado" |
| Estados | ❌ | O estado está espalhado: `busy` e `listening` (React), `core.mode` (orbe), `speakingRef`, `paused` (ativação) e `state` (diálogo). Não existe uma máquina de estados única, o que abre espaço para estados presos, sessões duplas e fala depois de fechar |

**Conclusão:** os quatro problemas de voz relatados têm causa técnica identificável, e nenhum deles está no "cérebro". Dois exigem uma mudança estrutural: o reconhecimento passa a ser feito no nosso plugin nativo, com controle de tempos, resultado final e alternativas, e a conversa passa a ter uma máquina de estados única.

---

## 3. Inteligência

### 3.1 Medição independente (nova)
Foram escritas 76 frases que **nunca** foram usadas em ajustes (`tests/avaliacao/holdout-v1.ts`, comando `npm run avaliar`). A medição usou só o classificador léxico: o modelo de significados não roda neste ambiente e ainda não foi medido no aparelho.

**Resultado: 61/76 = 80%.** O número anterior (97%) era otimista porque foi medido nas mesmas frases usadas para ajustar.

| Intenção | Acerto | Erros |
|---|---|---|
| cumprimentar, agradecer, negar, cancelar, continuar, complementar_ideia, analisar_ideia, aprovar_ideia, buscar, status_projeto, abrir_area | 4/4 | — |
| confirmar | 3/4 | "claro" → nenhuma |
| ver_ideia | 3/4 | "cadê aquela ideia…" → nenhuma |
| listar_ideias | 3/4 | "mostra as ideias arquivadas" → arquivar |
| arquivar_ideia | 3/4 | "tira a ideia… da lista" → listar |
| corrigir | 2/4 | "falei besteira, corrige" → cumprimentar; "me confundi" → nenhuma |
| registrar_ideia | 2/4 | sem palavra de pedido ("pensei em montar…", "escuta essa ideia") falha |
| ajuda | 1/4 | variações sem as palavras dos exemplos |
| papo | **0/4** | confundido com negar e cumprimentar |

> A partir de agora, este conjunto também já foi visto. Depois dos ajustes, o acerto será medido nele **e** num conjunto v2 com frases novas.

### 3.2 Outros achados
- **Explicação em várias mensagens:** o exemplo "tive uma ideia / seria um site / tipo… / e talvez ganhar dinheiro" hoje vira uma ideia só. Só que ele salva na 3ª mensagem e trata a 4ª como complemento. Funciona, mas sem um momento claro de "terminei". Falta também um resumo antes de salvar.
- **Responder às perguntas do MASON:** não existe. A análise lista perguntas, como "Como isso gera dinheiro?", mas ele não fica esperando a resposta. Por isso "Talvez assinatura mensal" não é ligado à monetização da ideia em foco.
- **Mudança de assunto:** é detectada só quando a nova intenção é confiante e de ação.
- **Confiança:** existe internamente (limiares de 0,42 e 0,28), mas não aparece para o Gabriel nem é registrada.
- **Respostas:** de 1 a 2 versões por situação, então se repetem rápido. O tamanho não se adapta ao tipo de pergunta, exceto pela versão falada.
- **Modelo de significados:** carrega sempre ao abrir o app (~120 MB de RAM). Os 150 exemplos são codificados na primeira mensagem, o que torna a primeira resposta lenta. Nunca foi medido no aparelho.

---

## 4. Memória e dados
- **SQLite:** existe só a migração v1, e não há teste de atualização de esquema. Para as próximas fases, o plano é: migrações só aditivas + testes de migração sobre uma cópia de banco populado.
- **Backup:** exporta JSON, mas **não existe restauração**. Isso é um risco real para atualizações.
- **Busca na memória:** é só por palavras. Não há busca por significado nem tabela de ligações entre ideias, projetos e conversas.
- **Informações pendentes de confirmação:** não existem como categoria própria.
- **Transparência:** a tela Memória já permite ver, corrigir e apagar memórias, expressões e correções de voz.

## 5. Funcionalidades
- **Projetos e tarefas pela conversa (Fase 2):** só a consulta de status existe. O executor já tem `create_project`, `create_task` e `update_project`; falta ligá-los ao interpretador.
- **Documentos, prompts e arquivos pela conversa (Fase 3):** não existem. As telas existem.
- **Design, Marketing, Comercial, Estudos e Pessoal:** são telas "em breve", cumprindo o pedido de não criar áreas vazias. O Comercial lista clientes.

## 6. Interface
- O orbe tem 4 estados (espera, ouvindo, pensando, falando). Faltam transcrevendo, aguardando autorização e erro.
- Não há botão "Continuar" nem "Encerrar conversa" visíveis.
- As Configurações são uma página longa e única. Em uso com uma mão, seções recolhíveis ajudariam.
- Mensagens de erro de voz aparecem como texto pequeno (`voice-hint`).

## 7. Desempenho e ativação por voz
- **Memória com o app aberto:** WebView + modelo de significados + Vosk (no serviço) + partículas. **Nada foi medido no aparelho.** É preciso uma tela de diagnóstico com tempos (início, carga do modelo, resposta).
- **Serviço de ativação:**
  - instância única: ok, porque o Android garante um serviço só;
  - encerramento: ok;
  - notificação: ok;
  - conflito de microfone: frágil (seção 2);
  - depois de um "Desligar" na notificação, o app só fica sabendo na próxima vez que abre.
- **Partículas:** limitadas a 46 e ~30 fps, com pausa em segundo plano. Ok.

---

## 8. Priorização

### P0 — impede o uso correto (voz)
1. **Máquina de estados única da conversa:** IDLE → LISTENING → TRANSCRIBING → PROCESSING → RESPONDING → SPEAKING → WAITING_FOR_USER / ERROR, com tempos-limite e garantias de nunca: microfone durante a fala, duas sessões ao mesmo tempo, fala depois de encerrar ou estado preso.
2. **Modos de conversa:** controlada (**padrão**), contínua (com botão "Encerrar conversa" visível) e só botão. Ficam independentes da palavra de ativação. Isso **revê a D32**.
3. **Reconhecimento no nosso plugin nativo:** `SpeechRecognizer` do Android com pt-BR, **resultado final**, até 5 alternativas com confiança, tempos de silêncio maiores para pausas naturais e confirmação de que o Vosk soltou o microfone antes de abrir.
4. **Orbe e botões refletindo o estado real:** "Continuar" e "Encerrar", mais os estados transcrevendo, aguardando e erro.
5. **Diagnóstico de voz** em Configurações: para cada fala, mostra o texto ouvido, as alternativas, a confiança, a intenção escolhida e a confiança dela. Isso separa erro de transcrição de erro de interpretação.

### P1 — funcionamento importante
6. **Correção de transcrição:** tocar na mensagem e corrigir. Ele aprende o par, aplica sozinho só com confirmação, com regras contra trocas ambíguas, e tudo editável. Isso substitui a regra cega de "3 vezes".
7. **Restaurar backup** e testes de migração do banco.
8. **Responder às perguntas do MASON:** uma pergunta pendente ligada à ideia e ao critério (por exemplo, monetização).
9. **Explicação em várias mensagens:** junta até "é isso" ou uma pausa longa, resume e confirma antes de salvar.

### P2 — inteligência e experiência
10. **Base de exemplos:** papo, ajuda, corrigir e registrar sem palavra de pedido. Medir antes e depois no conjunto v1 e num v2 novo.
11. **Mais variedade nas respostas** e tamanho adaptado ao tipo de mensagem.
12. **Memória:** busca por significado (usando o modelo de significados), ligações entre registros e categoria "pendente de confirmação".
13. **Medições no aparelho:** RAM, tempo de início, carga do modelo e bateria da ativação.
14. **Configurações em seções recolhíveis** e mensagens de erro mais visíveis.

### P3 — funcionalidades futuras (fases)
15. Fase 2: projetos e tarefas pela conversa, com confirmação e sem duplicar registros.
16. Fase 3: documentos, prompts, versões e comparação, além de arquivos importados ligados ao projeto.
17. Departamentos com funções reais; Estudos e Pessoal precisam de definição com o Gabriel.

## 9. Riscos de regressão
- **Trocar o plugin de reconhecimento** mexe em todo o caminho da voz. Mitigação: o plugin antigo continua como reserva até o novo ser validado no aparelho.
- **A máquina de estados** substitui lógica espalhada em `ChatPanel`. Mitigação: testes do controlador, independentes da interface.
- **Mudar o padrão para "controlada"** altera a experiência atual. Isso é intencional, foi pedido no novo documento e fica registrado em `DECISOES.md`.
