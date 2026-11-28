# MASON — Compreensão de linguagem: diagnóstico e proposta

27/11/2026. Primeira entrega do pedido "Reconstrução e aprimoramento da compreensão de linguagem natural". Nenhum código de produto foi alterado nesta entrega.

## 1. Por que ele confunde registrar e pesquisar

Rodei as frases do pedido no interpretador atual (só classificador léxico):

| Frase | 1º lugar | 2º | 3º | Resultado |
|---|---|---|---|---|
| "Quero colocar uma ideia nova de gestão de um aplicativo de gestão financeira." | listar_ideias 0,52 | negar 0,34 | registrar 0,32 | **errado** (listou ideias) |
| "Quero desenvolver um aplicativo" | abrir_area 0,30 | negar 0,30 | registrar 0,27 | **ambíguo → pergunta "registrar ou pesquisar"** |
| "Estou pensando em criar algo" | buscar 0,35 | registrar 0,27 | | **incerto → pergunta** |
| "Tenho um projeto em mente" | listar_ideias 0,44 | status_projeto 0,42 | | **errado** |
| "Agora quero procurar aquela ideia de marketplace" | buscar 0,32 | negar 0,30 | | ambíguo |
| "Quero ver uma ideia antiga" | **negar 0,42** | registrar 0,27 | | **errado** |
| "Vamos melhorar aquela ideia" | corrigir 0,38 | aprovar 0,34 | | **errado** |
| "Quero criar um projeto com aquela ideia" | registrar 0,64 | | | **errado** (não existe a intenção "projeto a partir de ideia") |
| "Também pensei em colocar controle de despesas" | complementar 0,54 | | | certo |
| "Mano, tive uma ideia para um aplicativo." | registrar 0,95 | | | certo, mas trata "para um aplicativo." como a ideia inteira e registra na hora, sem deixar continuar |

**Causas:**
1. **A frase inteira é comparada com exemplos, palavra por palavra, sem estrutura.** As palavras de conteúdo dominam:
   - "ideia nova" se parece com o exemplo de listar "tem ideia nova?";
   - "quero" se parece com o exemplo de negar "**não quero**".

   O sistema não sabe que "colocar" é a ação, "ideia" é o objeto e "nova" indica algo que ainda não existe.
2. **Não há noção de ação, objeto e novidade.** As frases "**uma** ideia **nova**" e "**aquela** ideia **antiga**" usam as mesmas palavras, mas significam coisas opostas. Hoje o sistema não enxerga essa diferença.
3. **Os "sinais fortes" são remendos de palavra única**, o problema que o pedido descreve. Por exemplo, "acrescenta" sempre vira complementar.
4. **O contexto só é usado depois da classificação.** Uma ideia em andamento não muda como a próxima frase é entendida.
5. **A regra de pergunta é cega.** Com confiança baixa, ele pergunta "A ou B" mesmo quando A é muito mais provável ou quando as duas levam à mesma ação.
6. **O registro de ideia é imediato.** Com 3 ou mais palavras de conteúdo, ele já registra. Não existe uma "ideia em construção" que cresce com as próximas mensagens.
7. **O modelo de significados** (~120 MB) entra só como "o maior entre léxico e semântico". O ruído do léxico vence, e o desempenho dele nunca foi medido.

## 2. Arquitetura atual

normalização → classificador (n-gramas contra ~150 exemplos + sinais fortes + semântico) → maior pontuação → limiares → pergunta ou executa. O contexto guarda só uma pergunta pendente, a ideia em foco e uma explicação sendo coletada.

## 3. Limitações (honestas)
- Mesmo com a nova arquitetura, o MASON **não vai ter compreensão irrestrita**. Ele vai entender bem o que está dentro do domínio dele (ideias, projetos, busca, conversa de trabalho) e as formas variadas de pedir isso. Assuntos fora do domínio continuam fora.
- Não cabe um modelo de linguagem num aparelho de 4 GB (D5a).
- O modelo de significados ajuda com paráfrases, mas o efeito dele **só pode ser medido no aparelho**. Os testes daqui medem a parte léxica e estrutural.

## 4. Nova arquitetura de compreensão (em camadas)

1. **Normalização sem destruir o sentido.** Continua como hoje, mas preserva negação ("não"), artigos ("uma"/"aquela") e tempo verbal.
2. **Análise da frase.** Uma análise linguística do português, sem lista de frases, extrai:
   - **ação**, por classe: CRIAR (criar, montar, desenvolver, colocar, anotar, guardar, salvar, "tive", "pensei em", "surgiu", "tirar do papel"…), ENCONTRAR (procurar, ver, mostrar, lembrar, recuperar, "cadê", "qual era"…), ACRESCENTAR, CORRIGIR, ANALISAR, APROVAR, ARQUIVAR, CONSULTAR ESTADO, NAVEGAR, TRANSFORMAR EM PROJETO, PREPARAR PARA O CLAUDE, ENCERRAR ("é isso", "pronto");
   - **objeto**: ideia, projeto, informação, ou produto (app, site, plataforma…);
   - **novidade**: nova ("uma", "nova", "tive", "surgiu") ou existente ("aquela", "antiga", "que eu falei", "a ideia do X", "já");
   - **negação, tempo e assunto** (o que vem depois de "de", "para", "sobre").

   Cada classe de ação tolera erros de digitação e conjugações (raiz da palavra + distância de edição).
3. **Pontuação por evidências.** Junta (a) a análise da frase, (b) os exemplos, como hoje, e (c) o modelo de significados. **Nenhuma palavra sozinha decide**: é preciso ação + objeto + contexto, ou exemplos muito próximos. Cada decisão guarda "por quê", e isso aparece no Diagnóstico de voz.
4. **Ato de fala, usando o contexto.** Decide se a mensagem **inicia**, **complementa**, **corrige**, **responde** a uma pergunta do MASON, **encerra** ou **muda de assunto**. Exemplos:
   - com uma ideia em construção, "também pensei em controle de despesas" é complemento, não ideia nova;
   - depois de o MASON perguntar "qual a finalidade?", "gestão financeira" é a resposta.
5. **Ideia em construção.** Um rascunho com campos: tipo, finalidade/problema, público, funcionalidades, monetização e observações, além das falas originais.
   - O MASON reconhece cada parte com uma resposta curta: "Entendi, um app de gestão financeira. Pode continuar."
   - Às vezes pergunta pelo próximo ponto que falta, **sem repetir pergunta já respondida**.
   - Finaliza quando o Gabriel diz que terminou, muda de assunto ou já há informação suficiente.
6. **Política de perguntas.** Ele só pergunta quando (a) a dúvida é real, (b) as opções levam a ações diferentes e (c) o contexto não resolve. A pergunta é sobre o palpite principal ("Você está começando uma ideia nova, certo?"), não "A ou B". Para exclusões e referências vagas, a confirmação continua (D11).
7. **Aprendizado com origem.** Quando o Gabriel corrige uma interpretação ("não, eu queria procurar"), o MASON guarda a frase como exemplo **daquela intenção**, com data e origem, e ela pode ser revista e apagada na tela Memória. Nada vira regra geral sozinho.

**Intenções novas:**
- `criar_projeto_de_ideia`: "quero criar um projeto com aquela ideia";
- `preparar_para_claude`: "prepara isso para o Claude", "organiza essa ideia";
- `encerrar_explicacao`: "é isso", "pronto, terminei";
- `anotar_informacao`: "anota essa informação" (vira complemento se houver ideia em construção; senão, memória).

## 5. Expansão do repertório
- **Classes de ação e objeto** com sinônimos e variações, incluindo todas as expressões do pedido. Isso não é lista de frases: cada classe cobre qualquer combinação, como "quero **montar** uma **plataforma**" ou "bora **tirar do papel** um **sistema**".
- **Exemplos** por intenção revistos: tirar palavras que confundem (por exemplo, "tem ideia nova?" em listar) e acrescentar variações.
- **Equivalências** como anota = guarda = registra = salva = coloca, tratadas como a mesma ação.

## 6. Plano de testes
- **Mais de 300 frases**, em três bases separadas:
  - **desenvolvimento** (~120): usadas para ajustar;
  - **validação** (~90): só para escolher limiares e pesos;
  - **teste independente** (~100): escritas antes dos ajustes e nunca olhadas durante o desenvolvimento.
- Relatório **por intenção**: acerto, confiança média e matriz de confusões.
- **Conversas completas:** ideia em várias mensagens, resposta a pergunta, complemento, correção, mudança de assunto, ideia → projeto. Elas verificam o que ele faz (registros criados ou alterados), não só a classificação.
- **Comparação antes e depois:** a linha de base atual também é medida no conjunto independente.

## 7. Etapas de implementação
1. Escrever as bases de teste (o conjunto independente primeiro, guardado) e medir a linha de base.
2. Análise da frase (ação, objeto, novidade, negação, assunto), com testes próprios.
3. Pontuação por evidências + revisão dos exemplos + intenções novas.
4. Ato de fala + ideia em construção + resposta a perguntas do MASON.
5. Nova política de perguntas.
6. Aprendizado com origem (tela Memória).
7. Medir no conjunto independente, registrar decisões e versão 0.7.0.

## 8. Resultado (0.7.0)
O que foi feito: as etapas 1 a 7. Ficaram de fora a tolerância a erros de digitação por distância de edição (por enquanto só o mapa de abreviações) e a separação automática de várias intenções numa só mensagem.

| Base | Linha de base | 0.7.0 |
|---|---|---|
| Desenvolvimento (120) | 54% | 100% |
| Validação (68) | 63% | 97% |
| Independente (90) | 54% | **97%** |
| Avaliação antiga (76, já vista antes) | 80% | 96% |

**Honestidade sobre os números:**
- As bases foram escritas pelo Claude. O conjunto independente foi escrito antes de qualquer ajuste e só foi medido no fim, mas tem o mesmo "jeito de escrever" de quem fez as regras. Com frases reais do Gabriel, o acerto deve ser menor.
- Por isso o Diagnóstico de voz e a tela "O que aprendi" importam: são o jeito de medir no uso real.
- Os números são só do léxico com a análise da frase. No aparelho, o modelo de significados entra junto; espera-se que ajude, mas isso ainda não foi medido.

**Erros que restam no conjunto independente (mantidos sem ajuste):**
- "na ideia de cursos coloca que vai ter certificado" → registrar (o certo: complementar);
- "peraí que ainda não acabei" → corrigir (o certo: continuar);
- "eai mason" → nenhuma (o certo: cumprimentar).
