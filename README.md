# Escritório Virtual MASON

Uma empresa virtual operada por funcionários de IA. Um supervisor central, **MASON**, coordena quatro
departamentos: Desenvolvimento, Comercial, Marketing Estratégico e Pesquisa e Inovação. Ele também é
o seu ponto de contato como proprietário.

## Como rodar

```bash
pip install -r requirements.txt
export ANTHROPIC_API_KEY=sk-ant-...      # sua chave da API da Anthropic
python run.py                            # abra http://localhost:8000
```

Variáveis opcionais:

| Variável | Padrão | Para que serve |
|---|---|---|
| `MASON_MODEL` | `claude-opus-5-5` | Modelo usado por todos os agentes |
| `MASON_MAX_PARALLEL` | `3` | Quantos trabalhos rodam ao mesmo tempo |
| `MASON_DB` | `data/mason-local.db` | Banco local (só quando o Firebase não está configurado) |
| `FIREBASE_WEB_API_KEY`, `FIREBASE_PROJECT_ID` | (vazio) | Ativam o login pelo Firebase |
| `MASON_OWNER_UID` | (vazio) | UID da única conta autorizada |
| `FIREBASE_SERVICE_ACCOUNT` | (vazio) | Credencial do servidor (JSON); alternativa ao arquivo secreto |
| `MASON_PASSWORD` | (vazio) | Senha simples para uso no computador, sem Firebase |
| `MASON_REPORT_HOURS` | `0` | Relatório automático a cada N horas (0 = desligado; também ajustável no painel) |

## Acesso exclusivo e uso no celular

O escritório tem **um único dono**. Não existe página de cadastro. O login usa **Firebase
Authentication** e só aceita a conta cujo UID está em `MASON_OWNER_UID`; novos cadastros ficam
desativados no próprio Firebase. Os dados ficam no **Cloud Firestore**, acessado somente pelo servidor
(Admin SDK). As Security Rules (`firestore.rules`) bloqueiam qualquer acesso direto de navegadores ou apps.

Para colocar no ar de graça (Firebase + Render) e instalar no celular, siga
**[docs/CONFIGURAR.md](docs/CONFIGURAR.md)**.

O app abre em tela cheia, com abas MASON / Empresa / Aprovações. As respostas do MASON são geradas no
servidor, então não se perdem se você bloquear a tela no meio de uma resposta.

## O que já funciona

- **Chat com o MASON.** Você pede trabalhos, atualizações e relatórios. O MASON consulta os dados
  reais da empresa antes de responder.
- **Distribuição de tarefas.** O MASON cria tarefas para o departamento certo, com prioridade e prazo.
  Elas rodam em segundo plano, várias ao mesmo tempo.
- **Funcionários por departamento.** Cada um tem seu papel, suas instruções e suas permissões.
  Registram progresso, entregam o resultado completo, registram bloqueios e pedem sua aprovação.
  Também mandam mensagens ao MASON, pedem apoio a outros departamentos, fazem recomendações e
  pesquisam na web.
- **Revisão pelo MASON.** Toda entrega passa pela revisão do MASON, que pode aprovar ou devolver com
  ajustes (até 2 rodadas). Isso pode ser desligado nas Configurações.
- **Aprovações.** Decisões que envolvem dinheiro, contato externo ou publicação pausam a tarefa. Ela
  volta a rodar sozinha quando você aprova ou rejeita no painel.
- **Acompanhamento.** Você vê tarefas atrasadas, bloqueadas e com falha. O MASON pode cobrar um
  departamento ou destravar uma tarefa (`enviar_orientacao`), e você também pode mandar mensagem
  direto para uma tarefa.
- **Memória compartilhada.** Guarda fatos duradouros: produtos, público, decisões e preferências. A
  memória geral é vista por todos. A de cada departamento só por ele, pela Pesquisa e pelo MASON.
- **Pesquisa e Inovação transversal.** Esse departamento lê as tarefas de todos os outros para sugerir
  melhorias.
- **Relatórios.** Sob demanda (botão) ou periódicos, ficam todos arquivados.
- **Persistência.** Tudo fica no SQLite. Se o servidor for reiniciado, os trabalhos interrompidos
  voltam para a fila.

## Estrutura

```
mason/
  company.py   departamentos, funcionários e as instruções de cada um (edite aqui)
  agents.py    MASON e departamentos: prompts, ferramentas e permissões
  llm.py       laço de execução dos agentes sobre a Messages API
  worker.py    executor em segundo plano (tarefas, revisões, relatórios)
  db.py        dados da empresa (tarefas, histórico, aprovações, mensagens, memória…)
  store.py     onde os dados ficam: Cloud Firestore (produção) ou SQLite (computador)
  auth.py      login exclusivo do proprietário (Firebase Authentication)
  server.py    API HTTP do painel
  static/      painel web (chat + quadro)
tests/test_flow.py   teste de ponta a ponta com modelo simulado (não gasta API)
```

Ciclo de vida de uma tarefa:
`pendente → em_andamento → (bloqueada | aguardando_aprovacao | em_revisao) → concluida`.
Os outros finais possíveis são `cancelada` e `falhou`.

## Observações

- Os departamentos **não agem fora da empresa**: não enviam mensagens a clientes, não publicam e não
  acessam seus sistemas. Eles produzem entregáveis e pedem aprovação quando necessário.
- Custos: cada tarefa usa várias chamadas ao modelo, e a revisão automática acrescenta outras. Ajuste
  `MASON_MAX_PARALLEL` e a revisão automática conforme o volume.

Testes: `python tests/test_flow.py`, `python tests/test_server.py` e, com os emuladores do Firebase
rodando (`firebase emulators:start --only auth,firestore --project demo-mason`), `python tests/test_firebase.py`.
