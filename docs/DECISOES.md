# MASON — Registro de decisões

Entrevista de definição (Prompt 02), 27/11/2026. Cada decisão foi escolhida pelo Gabriel. Mudanças futuras entram no fim, com o motivo.

## Direção geral
- **D0.** O MASON não usa Gemini, Claude, OpenAI nem nenhuma outra API de IA como cérebro. O núcleo é próprio, modular e evolui por etapas. O Claude é usado só como ferramenta externa de desenvolvimento.

## Bloco A — Personalidade
- **D1.** Natural, tranquilo, inteligente e profissional, no estilo Jarvis: cumpre ordens e percebe o que o usuário precisa além do pedido literal.
- **D2.** Tratamento: **"Gabriel"** no dia a dia e **"senhor"** em situações sérias (riscos, exclusões, discordâncias).
- **D3.** Diante de uma ideia: organiza, sugere melhorias, analisa criticamente e aponta riscos. As sugestões dele ficam sempre separadas do que o usuário disse.
- **D3a.** Limite aceito (por causa do aparelho de 4 GB, ver D5a): a análise crítica usa uma base de critérios por tipo de ideia, campos faltantes, semelhança com registros e decisões anteriores. Não faz raciocínio livre sobre temas desconhecidos.
- **D4.** Quando discorda: é crítico, argumenta e sugere alternativas.
- **D4a.** Se o usuário mantiver a decisão, ele argumenta **mais uma vez** e depois cumpre.

## Bloco B — Compreensão da linguagem
- **D5.** Arquitetura **progressiva**: começa com o núcleo híbrido (intenções + similaridade de significado + contexto + memória). Um modelo de linguagem local é um módulo opcional futuro.
- **D5a.** O aparelho atual tem **4 GB de RAM ou menos**, então um LLM local fica inviável nele. O módulo só será considerado num aparelho com 8 GB ou mais.
- **D6.** Ele entende comandos e conversa informal **desde o primeiro uso**, graças a uma **base inicial de conhecimento** carregada antes do primeiro uso.
- **D6a.** A base inicial é **rascunhada pelo desenvolvedor e revisada pelo Gabriel**.
- **D7.** Mensagem incompleta ou confusa: **pergunta na hora**, de forma curta e com opções concretas.
- **D8.** Aprendizado contínuo: correções + expressões recorrentes, com revisão do que foi aprendido.

## Bloco C — Memória
- **D9.** Memória organizada que identifica sozinha o que é relevante, sob controle do usuário (ver, corrigir, apagar). Mantém a distinção entre fornecido pelo usuário, sugestão do MASON, decisão confirmada e não verificado.
- **D10.** Recuperação **por contexto e associação** entre assuntos, projetos e conversas. Por trás, também usa datas e termos para resolver referências de tempo.
- **D11.** Referências vagas ("aquela ideia da semana passada"): **sempre mostra o que encontrou e confirma** antes de usar.

## Bloco D — Voz
- **D12.** A voz evolui aos poucos: primeiro transcrição + resposta em áudio, depois conversa contínua com interrupção.
- **D13.** Ativação por **botão e pela palavra "MASON"**, com escuta **sempre ligada** e um botão para desligar. Limites aceitos: notificação fixa obrigatória do Android, gasto de bateria perceptível, liberação nas configurações de bateria em alguns fabricantes, acerto não garantido com ruído.
- **D14.** Reconhecimento: o do **Android** (mais preciso) com **Vosk offline** quando não houver internet. Correção manual sempre disponível.
- **D15.** Voz de resposta **masculina, grave e séria**, usando as vozes gratuitas do Android (pt-BR, tom reduzido).

## Bloco E — Autonomia e execução
- **D16.** Autonomia **progressiva e configurável**: ações comuns sozinho; exclusões, publicações e envios com confirmação.
- **D17.** Execução: interpretação + planejamento em etapas para pedidos complexos + ferramentas internas com validação, sempre informando o resultado real.
- **D18.** Primeira versão com 8 ações: ideias, busca, projetos e tarefas, abrir áreas, atualizar projetos, documentos, prompts e análise de arquivos (sem IA: estrutura, tipos e comparação com o planejado).
- **D18a.** Ordem de construção: **ideias + busca + abrir áreas** primeiro.

## Bloco F — Tecnologia e limites
- **D19.** Funciona **localmente quase sempre**. A internet só melhora o reconhecimento de voz quando houver sinal.
- **D20.** Desempenho **equilibrado** dentro do que um aparelho de 4 GB aguenta.
- **D21.** Desenvolvimento em **versão básica + etapas**, sem quebrar o que já funciona.
- **D22.** Remover as partes do Gemini (cliente, proxy, configuração de chave, ciclo do agente). Ferramentas, dados e telas ficam.
- **D23.** Limites aceitos: cerca de 150 MB de espaço, 250–400 MB de RAM com o app aberto, bateria perceptível com a escuta ligada, Vosk menos preciso, Android 8 ou mais recente, respostas baseadas em modelos e sem conversa livre.

## Após a entrevista
- **D24.** O modelo de significados de **~120 MB entra desde a Fase 1** (escolha do Gabriel, em vez de começar só com o classificador leve). Revisão de D23 por causa disso: espaço total de **~200 MB**; RAM com o app aberto estimada em **~350–500 MB**, a ser medida no aparelho.
- **D25.** A arquitetura do núcleo (normalização → interpretador → contexto → intenções → planejador → executor → respostas, com memória e aprendizado) e o plano de fases 0–5 estão **aprovados**.

- **D26.** A base inicial foi revisada pelo Gabriel (convenção usada: item marcado = manter). Foram removidos 13 itens: "salve", "oi", "tô na área", "valeu mano", "negativo", "para", "aborta", "mano, tive uma ideia", "tive um insight", "engaveta essa", "MVP", a resposta "Disponha." e a resposta "Anotado: {titulo}…". Ficaram 149 frases de exemplo, 20 expressões, 36 abreviações, 19 termos de vocabulário, 19 critérios e 18 modelos de resposta.

- **D27.** Atualizações pelo GitHub: o app novo **substitui o conteúdo do repositório `maia0120/M.A.S.O.N`**. O projeto antigo (Escritório Virtual em Python) fica preservado no histórico e na tag `escritorio-virtual-python`. O APK assinado é gerado pelo GitHub Actions e publicado em Releases. A instalação no celular é sempre feita pelo Gabriel, porque o Android exige isso.

## Histórico de execução
- **Fase 0 (27/11/2026):** o Gemini foi removido (cliente, proxy, configuração de chave, ciclo do agente). O executor de ferramentas passou para `src/assistant/core/executor.ts`. O chat responde que o núcleo chega na Fase 1. A base inicial foi rascunhada (`src/assistant/knowledge/seed.ts`) e enviada para revisão no documento "MASON — Base inicial de conhecimento (revisão)".
- **Fase 1 (27/11/2026):** núcleo próprio em funcionamento: normalização, classificador léxico com sinais fortes, modelo de significados (transformers.js, carregado no aparelho, com o léxico como reserva), contexto com perguntas pendentes, respostas a partir dos modelos revisados e análise crítica por critérios. Comportamentos D2, D3, D4, D4a, D7 e D11 cobertos por testes de conversa. Compreensão: 30 de 40 frases novas na primeira medição; 70 de 72 (97%) depois dos ajustes técnicos, só com o léxico. O desempenho do modelo de significados ainda precisa ser medido no aparelho.
