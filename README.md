# MASON — núcleo próprio (Fase 1)

Assistente pessoal privado: React + TypeScript + Vite, empacotado para Android com Capacitor, com dados locais em SQLite. **Não usa APIs de IA de terceiros.** O núcleo de inteligência é próprio, roda no aparelho e está sendo construído por fases. As decisões de produto estão em [`docs/DECISOES.md`](docs/DECISOES.md).

## Situação atual

**Fase 1 concluída:** o MASON conversa com um núcleo próprio, sem nenhuma API de IA.

Pela conversa, ele já:
- registra ideias (inclusive explicadas em várias mensagens), preservando suas palavras, e avisa quando a ideia parece com outra já salva;
- analisa ideias por critérios (público, problema, monetização, riscos…) e salva a análise separada como sugestão dele;
- aprova, arquiva, complementa e corrige ideias. Quando discorda, argumenta, reforça uma vez se você insistir e depois cumpre, registrando a decisão;
- confirma referências vagas ("aquela ideia de semana passada") antes de usar;
- procura no que foi salvo, diz como está um projeto e abre as áreas do app;
- pergunta na hora quando não entende, sem inventar.

Como entende: frases normalizadas (acentos, abreviações, muletas) → classificador próprio por pedaços de palavras + sinais fortes → modelo de significados no aparelho (quando presente) → contexto da conversa. Nos testes com 72 frases que não estão na base, acertou 97% só com o classificador léxico. O modelo de significados deve ajudar nas paráfrases mais distantes.

## Plano de fases

| Fase | Conteúdo |
|---|---|
| 0 ✅ | Remover o Gemini · rascunhar a base inicial de conhecimento |
| 1 ✅ | Núcleo: normalização, interpretador (intenções + modelo de significados de ~120 MB), contexto, respostas no tom Jarvis · ideias, busca, abrir áreas · análise crítica por critérios |
| 2 | Projetos, tarefas e atualizações · memória por associação · pedidos em etapas |
| 3 | Documentos, prompts por modelo, análise de arquivos |
| 4 | Voz grave com escolha de voz · Vosk offline · palavra de ativação "MASON" |
| 5 | Conversa contínua por voz · autonomia configurável · aprendizado de expressões recorrentes |

## Rodar no computador

```bash
npm install
npm run model:download   # uma vez: baixa o modelo de significados (~120 MB) para public/models
npm run dev              # http://localhost:5173 — usa sql.js + IndexedDB no navegador
npm test                 # banco, executor, conversas e compreensão (Node 22+)
```

## Atualizações (GitHub)

O APK é gerado automaticamente pelo GitHub Actions (`.github/workflows/android.yml`) a cada mudança na branch `main`:

1. O Gabriel pede a mudança na conversa com o Claude.
2. O Claude altera o código, roda os testes e envia para `main`.
3. O GitHub testa, baixa o modelo de significados, compila e **assina** o APK, e publica em **Releases** como `MASON-build-N.apk`.
4. No celular: abrir a página de Releases do repositório, baixar o APK mais recente e tocar em Instalar. Os dados continuam no aparelho.

**Configuração única:** criar o segredo `MASON_SIGNING_PASSWORD` (Settings → Secrets and variables → Actions → New repository secret) com uma senha forte de pelo menos 16 caracteres, que não fica em nenhum outro lugar. No primeiro build, o GitHub cria a chave de assinatura (`signing/mason-release.p12`, protegida por essa senha) e a guarda no repositório. Todas as versões seguintes usam a mesma chave, o que permite atualizar sem desinstalar. **Não troque a senha nem apague essa chave**: sem elas, o Android recusa a atualização e seria preciso desinstalar, perdendo os dados.

Antes de atualizações grandes, exporte um backup em Configurações → Armazenamento.

### Gerar o APK no computador (alternativa)

Requisitos: Android Studio (com SDK) e JDK 17.

```bash
npm install
npm run model:download
npm run build
npx cap add android && node scripts/patch-android.mjs && npx cap sync android
cd android && ./gradlew assembleDebug
```

Um APK de depuração tem outra assinatura que a do GitHub: para trocar entre os dois, é preciso desinstalar.

## Arquitetura

```
src/
  interface/      dashboard, navegação, componentes, chat, páginas
  assistant/      core (ponto de entrada do núcleo + executor), tools (ações validadas),
                  intent / context (interpretador e contexto — Fase 1)
  memory/         memórias, perfil de comunicação, correções de voz, conversas, atividades
  work/           ideias, departamentos, indicadores
  projects/       projetos, clientes, tarefas, documentos com versões, arquivos importados
  integrations/   claude, lovable, github, vercel (registradas, não conectadas)
  storage/        SQLite (drivers + migrações), arquivos, backup
  voice/          reconhecimento, síntese, preferências, aprendizado de correções
docs/             registro de decisões e base inicial de conhecimento
tests/            testes com node:sqlite
```

Fluxo planejado do núcleo (Fase 1 em diante): **normalização → interpretador → contexto → gerenciador de intenções → planejador → executor → gerenciador de respostas**, com memória e aprendizado consultados em cada etapa.
