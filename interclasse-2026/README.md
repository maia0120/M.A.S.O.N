# Interclasse 2026

Site do campeonato de futsal entre turmas: placar ao vivo gol a gol, classificação (J, V, E, D), artilharia, turmas e o Topo da Torcida: um post fixado pago (R$ 1,50 por 5 minutos) que a escola toda vê.

- **Torcedor:** acompanha os jogos ao vivo sem cadastro; para fixar um post, informa só nome e sala (sem senha, sem CPF) e paga por Pix.
- **Gerenciador:** uma única conta (e-mail e senha) que lança placares, edita súmulas, cuida das turmas e aprova os posts fixados.

O site é estático (HTML + CSS + JS, sem etapa de build). O banco de dados, o login e o tempo real ficam no **Firebase** (projeto `interclasse-2026-32312`, plano gratuito Spark serve).

Site no ar: <https://interclasse-2026.vercel.app>

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html` | O site inteiro |
| `styles.css` | Estilos (Tailwind já compilado) |
| `config.js` | Configuração pública do app Web do Firebase (já preenchida) |
| `firestore.rules` | Regras de segurança do Firestore |
| `qrcode.js` | Gerador de QR Code do Pix ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator), licença MIT) |

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
- **Torcedor:** toque em *Sou torcedor*. O nome e a sala só são pedidos na hora de fixar um post e ficam salvos no aparelho; se a pessoa limpar o navegador, precisa se identificar de novo.

## Topo da Torcida (post fixado pago)
O site não tem mural público. O único post que aparece é o do **Topo da Torcida**, no alto da área do torcedor e na tela inicial.

- **Preço:** R$ 1,50 por 5 minutos no topo (o valor também é exigido pelas regras do banco).
- **Fila:** cada post aprovado entra no fim da fila e fica 5 minutos no topo; a troca acontece sozinha. Se ninguém comprar depois, o último continua lá.
- **Abrir as vendas:** no painel, aba *Topo* → *Pix para receber os posts fixados*, cadastre a chave Pix, o nome do titular e a cidade e toque em *Salvar e abrir*. *Fechar posts fixados* tira o botão de compra.
- **Como o torcedor compra:** toca em *Fixar meu post*, diz nome e sala (só na primeira vez), escreve a mensagem e paga pelo QR Code ou *Pix copia e cola*, que já vêm com o valor e um código de 5 letras. Depois toca em *Já paguei · Enviar*.
- **Como o gerenciador aprova:** os pedidos aparecem na aba *Topo* (com aviso na aba). Confira no extrato do banco o **valor** e o **código** e toque em *Pix ok → Aprovar* ou *Recusar* (Pix que não caiu ou texto ofensivo, sem devolução, como avisado na tela de compra).
- **Tirar um post:** na lista *Topo e fila*, *Tirar* remove o post; os próximos andam para frente.
- O painel mostra quanto foi arrecadado no dia e no total.

## Custos do Firebase
Sem mural público, abrir o site custa poucas leituras (placar, topo, Pix e o próprio pedido). Cada gol ou troca de post custa 1 leitura para cada pessoa com o site aberto. Um dia cheio de jogos deve ficar dentro das 50 mil leituras diárias do plano gratuito (Spark).

## Visual
O `styles.css` é gerado pelo Tailwind a partir de `tailwind.input.css` (cores do tema, fontes e componentes). Depois de mudar classes no `index.html` ou o tema, gere de novo:

```bash
npx @tailwindcss/cli@4.3.3 -i tailwind.input.css -o styles.css
```

## Boas práticas
- Para evitar abuso, você pode ativar o **App Check** no Firebase (opcional; exige pequena alteração no site).
- Cada post fixado tem até 280 caracteres, e cada torcedor pode fazer no máximo 1 pedido a cada 30 segundos (validado nas regras do banco).
- Para trocar as cores, edite as variáveis `--color-*` usadas em `styles.css` (paleta: `ink`, `paper`, `card`, `line`, `mute`, `accent`, `live`, `win`).
