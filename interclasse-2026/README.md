# Interclasse 2026

Site do campeonato de futsal entre turmas: placar ao vivo gol a gol, classificação (J, V, E, D), artilharia, turmas e um mural da torcida separado por sala.

- **Torcedor:** entra só com nome e sala (sem senha, sem CPF), acompanha os jogos ao vivo e posta no mural de qualquer sala.
- **Gerenciador:** uma única conta (e-mail e senha) que lança placares, edita súmulas, cuida das turmas e modera o mural.

O site é estático (HTML + CSS + JS, sem etapa de build). O banco de dados, o login e o tempo real ficam no **Supabase** (plano gratuito serve).

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html` | O site inteiro |
| `styles.css` | Estilos (Tailwind já compilado) |
| `config.js` | Endereço e chave pública do seu Supabase — **você preenche** |
| `supabase/schema.sql` | Tabelas, regras de segurança e dados iniciais |

## Passo a passo

### 1. Criar o banco no Supabase
1. Crie uma conta em <https://supabase.com> e um projeto novo (região São Paulo, de preferência).
2. Abra **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Authentication → Sign In / Providers**, ative **Allow anonymous sign-ins** (é assim que o torcedor entra sem senha).

### 2. Criar a conta do gerenciador
1. Em **Authentication → Users → Add user → Create new user**, informe o e-mail e a senha do organizador e marque **Auto Confirm User**.
2. Volte ao **SQL Editor** e rode, trocando o e-mail:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'seu-email@exemplo.com';
   ```
   Só essa conta consegue abrir o painel e alterar o campeonato.

### 3. Ligar o site ao banco
Em **Project Settings → API**, copie a **Project URL** e a **anon public key** e cole em `config.js`:
```js
window.SUPABASE_CONFIG = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA-ANON-KEY"
};
```
A *anon key* é pública por natureza; quem protege os dados são as regras do `schema.sql`. **Nunca** use a *service_role key* aqui.

### 4. Subir no GitHub
```bash
git init
git add .
git commit -m "Interclasse 2026"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/interclasse-2026.git
git push -u origin main
```

### 5. Publicar na Vercel
1. Em <https://vercel.com/new>, importe o repositório.
2. **Framework Preset:** `Other`. Deixe *Build Command* e *Output Directory* em branco.
3. Clique em **Deploy**. Pronto: compartilhe o link com a escola.

Cada `git push` na branch `main` publica uma versão nova automaticamente.

## Usando no dia do jogo
- **Gerenciador:** na página inicial, toque em *Gerenciador do campeonato* e entre com o e-mail e a senha. Em *Jogos & Placares → Novo Jogo → Iniciar partida ao vivo*, toque em **Gol** no time que marcar e escolha o autor. No fim, *Encerrar partida*: o resultado entra na classificação.
- **Torcedor:** toque em *Sou torcedor → Diga seu nome e sala*. O cadastro fica salvo no aparelho; se a pessoa limpar o navegador, precisa se identificar de novo (os posts antigos continuam no mural).
- **Moderação:** a aba *Mural* do painel mostra os posts de todas as salas, com os denunciados no topo. Dá para apagar qualquer post.

## Boas práticas
- Para evitar cadastros automáticos em massa, ative um CAPTCHA em **Authentication → Attack Protection** (opcional; exige pequena alteração no login anônimo).
- O mural aceita até 150 posts por torcedor e 280 caracteres por post (validado também no banco).
- Para trocar as cores, edite as variáveis `--color-*` usadas em `styles.css` (paleta: `ink`, `paper`, `card`, `line`, `mute`, `accent`, `live`, `win`).
