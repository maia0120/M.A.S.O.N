# Interclasse 2026

Site do campeonato de futsal entre turmas: placar ao vivo gol a gol, classificação (J, V, E, D), artilharia, turmas e um mural da torcida separado por sala.

- **Torcedor:** entra só com nome e sala (sem senha, sem CPF), acompanha os jogos ao vivo e posta no mural de qualquer sala.
- **Gerenciador:** uma única conta (e-mail e senha) que lança placares, edita súmulas, cuida das turmas e modera o mural.

O site é estático (HTML + CSS + JS, sem etapa de build). O banco de dados, o login e o tempo real ficam no **Firebase** (projeto `interclasse-2026-32312`, plano gratuito Spark serve).

Site no ar: <https://interclasse-2026.vercel.app>

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html` | O site inteiro |
| `styles.css` | Estilos (Tailwind já compilado) |
| `config.js` | Configuração pública do app Web do Firebase (já preenchida) |
| `firestore.rules` | Regras de segurança do Firestore |

## Configuração do Firebase (uma vez só)

1. **Authentication → Sign-in method:** ative **Anônimo** (torcedor) e **E-mail/senha** (gerenciador).
2. **Firestore Database:** crie o banco (modo de produção, região `southamerica-east1`).
3. **Firestore Database → Regras:** apague tudo, cole o conteúdo de `firestore.rules` e clique em **Publicar**.
4. **Authentication → Settings → Domínios autorizados:** adicione `interclasse-2026.vercel.app`.
5. **Conta do gerenciador:**
   1. **Authentication → Users → Adicionar usuário:** e-mail e senha do organizador. Copie o **UID do usuário** que aparece na lista.
   2. **Firestore Database → Dados → Iniciar coleção:** ID da coleção `admins`; ID do documento = o UID copiado; adicione um campo qualquer (ex.: `nome` = `gerente`) e salve.

   Só quem tiver um documento em `admins` consegue abrir o painel e alterar o campeonato. Na primeira vez que o gerenciador entra, o site cria o campeonato com as turmas do 1º ano A–E.

A configuração em `config.js` é pública por natureza; quem protege os dados são as regras do `firestore.rules`.

## Publicação

O site está na Vercel (projeto `interclasse-2026`, pasta raiz `interclasse-2026`, Framework Preset `Other`, sem build).

## Usando no dia do jogo
- **Gerenciador:** na página inicial, toque em *Gerenciador do campeonato* e entre com o e-mail e a senha. Em *Jogos & Placares → Novo Jogo → Iniciar partida ao vivo*, toque em **Gol** no time que marcar e escolha o autor. No fim, *Encerrar partida*: o resultado entra na classificação.
- **Torcedor:** toque em *Sou torcedor → Diga seu nome e sala*. O cadastro fica salvo no aparelho; se a pessoa limpar o navegador, precisa se identificar de novo (os posts antigos continuam no mural).
- **Moderação:** a aba *Mural* do painel mostra os posts de todas as salas, com os denunciados no topo. Dá para apagar qualquer post.

## Boas práticas
- Para evitar abuso, você pode ativar o **App Check** no Firebase (opcional; exige pequena alteração no site).
- O mural aceita até 150 posts por torcedor (validado também nas regras do banco) e 280 caracteres por post (validado no site).
- Para trocar as cores, edite as variáveis `--color-*` usadas em `styles.css` (paleta: `ink`, `paper`, `card`, `line`, `mute`, `accent`, `live`, `win`).
