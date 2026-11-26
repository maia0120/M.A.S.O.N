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
- **Torcedor:** toque em *Sou torcedor → Diga seu nome e sala*. O cadastro fica salvo no aparelho; se a pessoa limpar o navegador, precisa se identificar de novo (os posts antigos continuam no mural).
- **Moderação:** a aba *Mural* do painel mostra os posts de todas as salas, com os denunciados no topo. Dá para apagar qualquer post.

## Topo da Torcida (leilão do post fixado)
Um único post fica fixado no topo de todos os murais (e na tela inicial). Para tirá-lo de lá, é preciso dar um lance maior, pago por Pix.

- **Abrir os lances:** no painel, aba *Mural* → *Pix para receber os lances*, cadastre a chave Pix, o nome do titular e a cidade e toque em *Salvar e abrir lances*. *Fechar lances* tira o botão de lance da torcida.
- **Valores:** o primeiro lance do dia é R$ 0,50; cada lance seguinte precisa ser pelo menos R$ 0,25 maior. Todo dia (horário de Brasília) o mínimo volta para R$ 0,50. Lance máximo: R$ 200.
- **Proteção:** quem entra no topo fica pelo menos 5 minutos lá antes de poder ser superado.
- **Como o torcedor paga:** ele escreve o post, escolhe o valor e o site gera o QR Code e o *Pix copia e cola* já com o valor e um código de 5 letras do lance. Depois de pagar, toca em *Enviar lance*.
- **Como o gerenciador aprova:** os lances aparecem na aba *Mural* (com aviso na aba). Confira no extrato do banco o **valor** e o **código** e toque em:
  - *Pix ok → Topo*: o post vai para o topo; o anterior continua no mural com o selo "Já foi Topo";
  - *Pix ok → Destaque*: quando o topo está protegido ou alguém já passou na frente, o post entra no mural com borda e selo de destaque;
  - *Recusar*: Pix não caiu ou texto ofensivo (sem devolução, como avisado na tela de lance).
- O painel mostra quanto foi arrecadado no dia e no total. Apagar o post do topo também limpa o topo.

## Custos do Firebase
Cada post é um documento e cada pessoa carrega só os 50 posts mais recentes da sala que está vendo (o gerenciador vê os 100 mais recentes). Assim, abrir o site custa cerca de 55 leituras, e um post novo custa 1 leitura para cada pessoa com aquela sala aberta. O plano gratuito (Spark) dá 50 mil leituras por dia; se precisar de mais, ative o plano Blaze com um alerta de orçamento.

## Boas práticas
- Para evitar abuso, você pode ativar o **App Check** no Firebase (opcional; exige pequena alteração no site).
- Cada post tem até 280 caracteres, cada torcedor pode fazer até 300 posts, com intervalo mínimo de 10 segundos entre posts e de 30 segundos entre lances (tudo validado nas regras do banco).
- Para trocar as cores, edite as variáveis `--color-*` usadas em `styles.css` (paleta: `ink`, `paper`, `card`, `line`, `mute`, `accent`, `live`, `win`).
