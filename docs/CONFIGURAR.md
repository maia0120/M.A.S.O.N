# Colocar o MASON no ar (Firebase + Render, sem mensalidade)

Tempo: uns 20 minutos, uma única vez. Dá para fazer tudo pelo celular, mas num computador é mais fácil.

Como funciona:

- **Firebase** guarda os dados (Cloud Firestore) e faz o seu login (Authentication).
- **Render** roda o MASON e te dá o endereço para abrir no celular.
- **cron-job.org** mantém o Render acordado.

Os três são gratuitos. O único custo é o uso da API da Anthropic.

---

## Parte 1 — Firebase

### 1.1 Criar o projeto
1. Acesse https://console.firebase.google.com e clique em **Criar um projeto**.
2. Dê um nome (ex.: `mason-escritorio`). O Google Analytics pode ficar **desativado**.
3. Fique no plano **Spark (gratuito)**. Não precisa de cartão.

### 1.2 Banco de dados (Firestore)
1. Menu **Criação → Firestore Database → Criar banco de dados**.
2. Local: **us-east1** (fica perto do servidor do Render; não dá para mudar depois).
3. Escolha **Iniciar no modo de produção**. Esse modo já bloqueia todo acesso direto ao banco.
4. Confira em **Regras**. Elas devem ser iguais ao arquivo `firestore.rules` deste projeto
   (`allow read, write: if false;`). Se não forem, cole o conteúdo e clique em **Publicar**.

> Só o servidor do MASON acessa o banco, com uma credencial própria. Nenhum navegador, app ou
> pessoa consegue ler ou gravar nele diretamente, nem mesmo com login.

### 1.3 Login (Authentication)
1. **Criação → Authentication → Vamos começar**.
2. Em **Método de login**, ative **E-mail/senha**. Deixe "Link do e-mail" desligado.
3. Em **Users → Adicionar usuário**, coloque **seu e-mail e uma senha forte**. Essa é a única conta.
4. Na lista de usuários, copie o **UID do usuário** (uma sequência como `GBOVri5Bo...`).
   Guarde: é o `MASON_OWNER_UID`.
5. **Bloqueie novos cadastros:** em **Settings → Ações do usuário**, **desmarque "Ativar a criação
   (inscrição)"** e salve. A partir daí ninguém consegue criar conta no seu projeto.
   Mesmo que alguém conseguisse, o MASON só aceita o seu UID.

### 1.4 Chaves que o servidor precisa
1. Clique na engrenagem → **Configurações do projeto → Geral**.
   - Anote o **ID do projeto** → `FIREBASE_PROJECT_ID`.
   - Em **Seus apps**, clique no ícone **`</>`** (Web), dê um apelido (ex.: `mason`) e registre o app.
     Não precisa de Hosting. Copie o valor de **`apiKey`** → `FIREBASE_WEB_API_KEY`.
     (Essa chave é pública por natureza e só identifica o projeto. Ela não dá acesso aos dados.)
2. Ainda nas configurações, aba **Contas de serviço → Gerar nova chave privada**.
   Vai baixar um arquivo `.json`. **Ele é secreto:** não envie para ninguém e não coloque no GitHub.

---

## Parte 2 — Render (servidor gratuito)

1. Acesse https://render.com e entre com o **GitHub**.
2. **New → Web Service** e escolha o repositório **M.A.S.O.N**. Se ele não aparecer, clique em
   "Configure account" e libere o acesso ao repositório, como foi feito no Railway.
3. Configure:
   - **Language / Runtime:** Docker
   - **Region:** Virginia (US East)
   - **Instance type:** **Free**
4. Em **Environment Variables**, adicione:

   | Nome | Valor |
   |---|---|
   | `ANTHROPIC_API_KEY` | sua chave da Anthropic (`sk-ant-...`) |
   | `FIREBASE_WEB_API_KEY` | a `apiKey` do passo 1.4 |
   | `FIREBASE_PROJECT_ID` | o ID do projeto |
   | `MASON_OWNER_UID` | o seu UID do passo 1.3 |
   | `MASON_MAX_PARALLEL` | `2` |

5. Em **Secret Files → Add Secret File**:
   - **Filename:** `firebase-service-account.json`
   - **Contents:** abra o arquivo `.json` baixado no passo 1.4 e cole todo o conteúdo.
6. Clique em **Deploy Web Service**. O primeiro deploy leva alguns minutos. Quando aparecer
   **Live**, o endereço fica no topo da página (algo como `https://mason-xxxx.onrender.com`).

## Parte 3 — Manter acordado (cron-job.org)

O Render gratuito desliga o servidor depois de 15 minutos sem visitas, e aí os agentes param no meio.
1. Crie uma conta em https://cron-job.org (gratuito).
2. **Create cronjob** com a URL `https://SEU-ENDERECO.onrender.com/healthz`, a cada **10 minutos**. Salve.

As horas gratuitas do Render dão para um serviço ligado o mês inteiro.

## Parte 4 — Instalar no celular

Abra o endereço do Render e entre com seu e-mail e senha do Firebase. Depois:
- **Android (Chrome):** menu ⋮ → **Instalar app**
- **iPhone (Safari):** Compartilhar → **Adicionar à Tela de Início**

---

## Se algo der errado

| Sintoma | Causa provável |
|---|---|
| Deploy falha com "falta a credencial do servidor" | O Secret File não foi criado ou o nome está diferente de `firebase-service-account.json` |
| "Nenhum proprietário configurado. Defina MASON_OWNER_UID = ..." | Copie o UID mostrado para a variável `MASON_OWNER_UID` |
| "Esta conta não tem acesso ao escritório" | O UID em `MASON_OWNER_UID` não é o da conta com que você entrou |
| "E-mail ou senha incorretos" | Use "Esqueci minha senha" na tela de login |
| O MASON responde com erro de API | Confira a `ANTHROPIC_API_KEY` e se há créditos em console.anthropic.com |

Limites gratuitos do Firestore: 50 mil leituras e 20 mil gravações por dia. O MASON guarda uma
cópia dos dados em memória, então um dia normal de uso fica bem abaixo disso.
