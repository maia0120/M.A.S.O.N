"""Funcionários de IA: o supervisor MASON e os líderes de departamento.

Cada agente recebe um conjunto de ferramentas de acordo com suas permissões:
- Departamentos veem apenas as próprias tarefas e a memória geral + do departamento.
- Pesquisa e Inovação tem visão transversal (leitura) de todos os departamentos.
- MASON vê e coordena tudo, e é o único que fala com o proprietário.
"""
from __future__ import annotations

import json
from typing import Any

from . import db
from .company import AGENT_TO_DEPT, COMPANY_NAME, DEPARTMENTS, DEPT_BY_ID
from .llm import WEB_SEARCH_TOOL, RunResult, StopLoop, Tool, run_agent

MAX_REVIEW_ROUNDS = 2


def _compact_task(t: dict[str, Any]) -> dict[str, Any]:
    keys = ("id", "title", "department_id", "status", "priority", "created_by", "created_at",
            "updated_at", "due_at", "completed_at", "overdue", "parent_task_id")
    return {k: t.get(k) for k in keys}


def _task_detail(task_id: int, scope_dept: str | None = None) -> dict[str, Any]:
    t = db.get_task(int(task_id))
    if not t:
        raise ValueError(f"Tarefa #{task_id} não existe")
    if scope_dept and t["department_id"] != scope_dept:
        raise ValueError("Sem permissão: a tarefa pertence a outro departamento")
    t = dict(t)
    t.pop("next_input", None)
    t["updates"] = [{k: u[k] for k in ("author", "kind", "content", "created_at")} for u in t["updates"][-30:]]
    return t


def company_snapshot() -> dict[str, Any]:
    ov = db.overview()
    return {
        "agora_utc": ov["now"],
        "departamentos": [
            {"id": d["id"], "nome": d["name"], "tarefas_por_status": d["counts"], "atrasadas": d["overdue"],
             "em_execucao": d["active"]}
            for d in ov["departments"]
        ],
        "tarefas_abertas": [_compact_task(t) for t in ov["open_tasks"]],
        "concluidas_recentes": [_compact_task(t) for t in ov["recent_done"]],
        "falhas": [_compact_task(t) for t in ov["failed"]],
        "aprovacoes_pendentes": ov["pending_approvals"],
        "recomendacoes_novas": [{k: r[k] for k in ("id", "department_id", "target_department", "title")}
                                for r in ov["recommendations"]],
        "mensagens_nao_lidas_para_mason": len(ov["unread_for_mason"]),
    }


DEPT_IDS = [d["id"] for d in DEPARTMENTS]
DEPT_ENUM = {"type": "string", "enum": DEPT_IDS}
PRIORITY_ENUM = {"type": "string", "enum": list(db.PRIORITIES)}


# =====================================================================  MASON

MASON_SYSTEM = f"""Você é MASON, o supervisor geral do {COMPANY_NAME}: uma empresa virtual operada por \
funcionários de inteligência artificial. Você é o principal ponto de contato entre o PROPRIETÁRIO e os departamentos.

Departamentos oficiais (id → responsabilidade):
""" + "\n".join(f"- {d['id']}: {d['name']} — {d['description']}" for d in DEPARTMENTS) + """

Suas responsabilidades:
- Entender as solicitações do proprietário e decidir qual departamento executa cada trabalho.
- Distribuir atividades (criar_tarefa), dividindo pedidos grandes em tarefas claras por departamento.
- Acompanhar o andamento, cobrar atualizações (enviar_orientacao) e destravar bloqueios.
- Verificar resultados e identificar problemas antes de considerar um trabalho concluído.
- Reunir informações de vários departamentos e apresentar relatórios.
- Informar tarefas concluídas, atrasadas e pendentes; alertar sobre erros, bloqueios e decisões necessárias.
- Manter a visão geral de tudo o que acontece no escritório.

Como trabalhar:
- Antes de responder perguntas sobre o estado da empresa, consulte os dados (visao_geral_empresa,
  listar_tarefas, ver_tarefa, ler_mensagens). Nunca invente status, números ou resultados.
- Ao delegar, escreva uma descrição de tarefa completa: objetivo, contexto que o proprietário deu,
  formato de entrega esperado e critérios de qualidade. O departamento não vê esta conversa.
- As tarefas rodam em segundo plano; depois de criá-las, diga ao proprietário o que foi distribuído
  e que você acompanhará. Não espere elas terminarem para responder.
- Decisões que envolvem dinheiro, contato com clientes ou pessoas de fora, publicação, mudanças em
  sistemas de produção ou compromissos da empresa exigem aprovação do proprietário (pedir_aprovacao).
- Guarde na memória compartilhada (salvar_memoria) fatos duradouros sobre a empresa: produtos,
  público, preços, decisões do proprietário, preferências. Consulte-a (buscar_memoria) quando útil.
- Responda ao proprietário em português, de forma direta e organizada. Em relatórios, use seções
  curtas: Concluído, Em andamento, Atrasado, Bloqueios/Problemas, Aguardando sua aprovação,
  Recomendações dos departamentos, Próximas prioridades.
"""


def mason_tools(actor: str = "mason") -> list[Tool]:
    def visao_geral_empresa() -> Any:
        return company_snapshot()

    def listar_tarefas(departamento: str | None = None, status: str | None = None,
                       apenas_atrasadas: bool = False) -> Any:
        return [_compact_task(t) for t in db.list_tasks(departamento, status, apenas_atrasadas)]

    def ver_tarefa(task_id: int) -> Any:
        return _task_detail(task_id)

    def criar_tarefa(departamento: str, titulo: str, descricao: str, prioridade: str = "media",
                     prazo_horas: float | None = None) -> Any:
        tid = db.create_task(titulo, descricao, departamento, actor, prioridade, prazo_horas)
        return {"task_id": tid, "status": "pendente", "mensagem": "Tarefa criada; o departamento começará em instantes."}

    def enviar_orientacao(task_id: int, mensagem: str) -> Any:
        t = db.get_task(int(task_id))
        if not t:
            raise ValueError("Tarefa não existe")
        if t["status"] in ("concluida", "cancelada"):
            raise ValueError(f"A tarefa está {t['status']}; crie uma nova tarefa se precisar de mais trabalho.")
        queue_input(int(task_id), f"[Mensagem do MASON] {mensagem}", "mason")
        return "Orientação enviada; o departamento retomará a tarefa."

    def revisar_tarefa(task_id: int, decisao: str, comentario: str) -> Any:
        t = db.get_task(int(task_id))
        if not t:
            raise ValueError("Tarefa não existe")
        if t["status"] != "em_revisao":
            raise ValueError(f"A tarefa não está em revisão (status: {t['status']})")
        db.execute("UPDATE tasks SET review_pending=0 WHERE id=?", (t["id"],))
        db.add_update(t["id"], "mason", "revisao", f"{decisao}: {comentario}")
        if decisao == "aprovar" or t["review_rounds"] >= MAX_REVIEW_ROUNDS:
            note = comentario if decisao == "aprovar" else f"concluída após {MAX_REVIEW_ROUNDS} revisões; ressalvas: {comentario}"
            db.set_task_status(t["id"], "concluida", "mason", note)
            db.log("mason", "concluiu_tarefa", f"#{t['id']} {t['title']}")
            return "Tarefa marcada como concluída."
        db.execute("UPDATE tasks SET review_rounds=review_rounds+1 WHERE id=?", (t["id"],))
        queue_input(t["id"], f"[Revisão do MASON] O resultado precisa de ajustes antes de ser aceito:\n{comentario}\n"
                    "Corrija e entregue novamente com concluir_tarefa (envie o resultado completo).", "mason")
        return "Tarefa devolvida ao departamento com os ajustes pedidos."

    def cancelar_tarefa(task_id: int, motivo: str) -> Any:
        db.set_task_status(int(task_id), "cancelada", actor, motivo, review_pending=0, next_input=None)
        return "Tarefa cancelada."

    def pedir_aprovacao(titulo: str, detalhes: str, task_id: int | None = None) -> Any:
        aid = db.create_approval("mason", titulo, detalhes, task_id)
        return {"approval_id": aid, "mensagem": "Pedido registrado no painel do proprietário."}

    def listar_aprovacoes(status: str = "pendente") -> Any:
        return db.rows("SELECT * FROM approvals WHERE status=? ORDER BY id DESC LIMIT 30", (status,))

    def ler_mensagens(apenas_nao_lidas: bool = True) -> Any:
        sql = "SELECT * FROM internal_messages WHERE to_agent='mason'"
        if apenas_nao_lidas:
            sql += " AND read=0"
        msgs = db.rows(sql + " ORDER BY id DESC LIMIT 30")
        if msgs:
            db.execute(f"UPDATE internal_messages SET read=1 WHERE id IN ({','.join('?' * len(msgs))})",
                       tuple(m["id"] for m in msgs))
        return msgs

    def listar_recomendacoes(status: str = "nova") -> Any:
        return db.rows("SELECT * FROM recommendations WHERE status=? ORDER BY id DESC LIMIT 30", (status,))

    def atualizar_recomendacao(recomendacao_id: int, status: str) -> Any:
        db.execute("UPDATE recommendations SET status=? WHERE id=?", (status, int(recomendacao_id)))
        return "Recomendação atualizada."

    def buscar_memoria(consulta: str) -> Any:
        return db.search_memory(consulta, None) or "Nada encontrado."

    def salvar_memoria(chave: str, conteudo: str, escopo: str = "geral") -> Any:
        db.save_memory(escopo, chave, conteudo, actor)
        return "Memória salva."

    def salvar_relatorio(titulo: str, conteudo: str) -> Any:
        rid = db.execute("INSERT INTO reports(title, content, created_at) VALUES (?,?,?)", (titulo, conteudo, db.now()))
        db.log("mason", "relatorio", titulo)
        return {"report_id": rid}

    def ver_relatorios_anteriores(quantidade: int = 3) -> Any:
        return db.rows("SELECT * FROM reports ORDER BY id DESC LIMIT ?", (int(quantidade),))

    S = {"type": "string"}
    I = {"type": "integer"}
    return [
        Tool("visao_geral_empresa", "Retorna o estado atual da empresa: tarefas por departamento e status, atrasos, "
             "falhas, aprovações pendentes, recomendações novas e mensagens não lidas.", {}, [], visao_geral_empresa),
        Tool("listar_tarefas", "Lista tarefas com filtros. status pode ser 'abertas' ou um status específico "
             f"({', '.join(db.ALL_STATUSES)}).",
             {"departamento": DEPT_ENUM, "status": S, "apenas_atrasadas": {"type": "boolean"}}, [], listar_tarefas),
        Tool("ver_tarefa", "Mostra uma tarefa completa: descrição, resultado entregue e histórico de atualizações.",
             {"task_id": I}, ["task_id"], ver_tarefa),
        Tool("criar_tarefa", "Cria uma tarefa e a atribui a um departamento. Ela começa a ser executada em segundo plano.",
             {"departamento": DEPT_ENUM, "titulo": S, "descricao": S, "prioridade": PRIORITY_ENUM,
              "prazo_horas": {"type": "number", "description": "Prazo em horas a partir de agora (opcional)."}},
             ["departamento", "titulo", "descricao"], criar_tarefa),
        Tool("enviar_orientacao", "Envia uma mensagem a uma tarefa em andamento, bloqueada ou pendente: cobrar "
             "atualização, dar informação que faltava, destravar um bloqueio ou mudar a direção. A tarefa é retomada.",
             {"task_id": I, "mensagem": S}, ["task_id", "mensagem"], enviar_orientacao),
        Tool("revisar_tarefa", "Revisa uma tarefa em_revisao: 'aprovar' conclui; 'devolver' manda ajustes ao departamento.",
             {"task_id": I, "decisao": {"type": "string", "enum": ["aprovar", "devolver"]}, "comentario": S},
             ["task_id", "decisao", "comentario"], revisar_tarefa),
        Tool("cancelar_tarefa", "Cancela uma tarefa.", {"task_id": I, "motivo": S}, ["task_id", "motivo"], cancelar_tarefa),
        Tool("pedir_aprovacao", "Registra um pedido de aprovação para o proprietário decidir no painel.",
             {"titulo": S, "detalhes": S, "task_id": I}, ["titulo", "detalhes"], pedir_aprovacao),
        Tool("listar_aprovacoes", "Lista pedidos de aprovação por status (pendente, aprovada, rejeitada).",
             {"status": {"type": "string", "enum": ["pendente", "aprovada", "rejeitada"]}}, [], listar_aprovacoes),
        Tool("ler_mensagens", "Lê mensagens internas que os departamentos enviaram ao MASON (marca como lidas).",
             {"apenas_nao_lidas": {"type": "boolean"}}, [], ler_mensagens),
        Tool("listar_recomendacoes", "Lista recomendações feitas pelos departamentos.",
             {"status": {"type": "string", "enum": ["nova", "aceita", "descartada"]}}, [], listar_recomendacoes),
        Tool("atualizar_recomendacao", "Marca uma recomendação como aceita ou descartada.",
             {"recomendacao_id": I, "status": {"type": "string", "enum": ["aceita", "descartada"]}},
             ["recomendacao_id", "status"], atualizar_recomendacao),
        Tool("buscar_memoria", "Busca na memória compartilhada da empresa (todas as áreas).", {"consulta": S},
             ["consulta"], buscar_memoria),
        Tool("salvar_memoria", "Salva ou atualiza um fato duradouro na memória. escopo: 'geral' ou id do departamento.",
             {"chave": S, "conteudo": S, "escopo": {"type": "string", "enum": ["geral"] + DEPT_IDS}},
             ["chave", "conteudo"], salvar_memoria),
        Tool("salvar_relatorio", "Salva um relatório no arquivo de relatórios da empresa.", {"titulo": S, "conteudo": S},
             ["titulo", "conteudo"], salvar_relatorio),
        Tool("ver_relatorios_anteriores", "Lê os últimos relatórios salvos.", {"quantidade": I}, [],
             ver_relatorios_anteriores),
    ]


def _mason_conversation() -> str:
    return f"mason:{db.get_setting('mason_session', '1')}"


def chat_with_mason(message: str) -> RunResult:
    return run_agent(_mason_conversation(), MASON_SYSTEM, mason_tools(), message, effort="high")


def reset_mason_chat() -> None:
    n = int(db.get_setting("mason_session", "1")) + 1
    db.set_setting("mason_session", str(n))


def mason_chat_history() -> list[dict[str, str]]:
    out = []
    for m in db.load_conversation(_mason_conversation()):
        blocks = db._as_blocks(m["content"])
        text = "\n\n".join(b["text"] for b in blocks if b.get("type") == "text" and b.get("text", "").strip())
        if text:
            out.append({"role": m["role"], "text": text})
    return out


def mason_review(task_id: int) -> RunResult:
    t = db.get_task(task_id)
    brief = (
        f"O departamento {DEPT_BY_ID[t['department_id']]['name']} entregou a tarefa #{t['id']} para revisão.\n\n"
        f"TÍTULO: {t['title']}\n\nPEDIDO ORIGINAL:\n{t['description']}\n\nRESULTADO ENTREGUE:\n{t['result']}\n\n"
        "Verifique se o resultado atende ao pedido (completo, correto, utilizável, sem contradições). "
        "Use revisar_tarefa com 'aprovar' ou 'devolver' (com ajustes objetivos). Seja exigente, mas não "
        "devolva por detalhes menores. Se identificar uma decisão que o proprietário precisa tomar, use pedir_aprovacao."
    )
    tools = [t_ for t_ in mason_tools() if t_.name in
             ("revisar_tarefa", "ver_tarefa", "buscar_memoria", "pedir_aprovacao", "salvar_memoria")]
    return run_agent(f"review:{task_id}:{t['review_rounds']}", MASON_SYSTEM, tools,
                     brief, effort="medium", max_steps=8)


def mason_periodic_report() -> RunResult:
    return run_agent(
        f"report:{db.now()}", MASON_SYSTEM, mason_tools(),
        "Gere o relatório periódico da empresa para o proprietário. Consulte os dados, verifique tarefas "
        "atrasadas e bloqueadas (cobre os departamentos com enviar_orientacao quando fizer sentido), leia as "
        "mensagens internas e as recomendações. Depois salve o relatório com salvar_relatorio.",
        effort="medium",
    )


# =====================================================================  DEPARTAMENTOS

def department_system(dept: dict[str, Any]) -> str:
    transversal = dept.get("transversal")
    return f"""Você é o(a) {dept['agent_name']} ({dept['agent_role']}), funcionário(a) de IA do departamento \
{dept['name']} no {COMPANY_NAME}. O supervisor geral é MASON, que distribui tarefas e revisa os resultados; \
ele reporta ao proprietário da empresa.

{dept['instructions']}

Outros departamentos: {', '.join(f"{d['id']} ({d['name']})" for d in DEPARTMENTS if d['id'] != dept['id'])}.

Regras de trabalho em cada tarefa:
- Leia o pedido com atenção e consulte a memória da empresa (buscar_memoria) quando o contexto ajudar.
- Em trabalhos longos, registre progresso com registrar_progresso.
- Quando terminar, chame concluir_tarefa com o RESULTADO COMPLETO (o próprio entregável, não um resumo).
  MASON revisará e poderá devolver com ajustes.
- Se faltar informação essencial ou acesso que só o proprietário tem, use registrar_bloqueio explicando
  exatamente o que precisa. Não invente dados que deveriam vir do proprietário.
- Ações que envolvem dinheiro, contato externo, publicação ou compromissos exigem pedir_aprovacao_proprietario.
- Se precisar de trabalho de outro departamento, use solicitar_apoio.
- Ideias de melhoria que vão além da tarefa: use propor_recomendacao.
- Guarde aprendizados duradouros com salvar_memoria.
{"- Você tem visão transversal: pode usar ver_tarefas_empresa e ver_tarefa_qualquer para estudar os outros departamentos." if transversal else ""}
Escreva em português."""


def department_tools(dept: dict[str, Any], task_id: int) -> list[Tool]:
    agent = dept["agent_id"]
    dept_id = dept["id"]
    transversal = bool(dept.get("transversal"))
    S = {"type": "string"}
    I = {"type": "integer"}

    def registrar_progresso(nota: str) -> Any:
        db.add_update(task_id, agent, "progresso", nota)
        return "Progresso registrado."

    def concluir_tarefa(resultado: str, resumo: str) -> Any:
        if not resultado.strip():
            raise ValueError("O resultado não pode estar vazio.")
        db.add_update(task_id, agent, "resultado", resumo)
        if auto_review_enabled():
            db.set_task_status(task_id, "em_revisao", agent, "entregue para revisão do MASON",
                               result=resultado, review_pending=1)
        else:
            db.set_task_status(task_id, "concluida", agent, resumo, result=resultado)
        raise StopLoop("Resultado entregue. Encerre esta etapa com uma frase curta.")

    def registrar_bloqueio(motivo: str, o_que_precisa: str) -> Any:
        db.set_task_status(task_id, "bloqueada", agent, motivo)
        db.send_message(agent, "mason", f"Bloqueio na tarefa #{task_id}", f"{motivo}\n\nPreciso de: {o_que_precisa}", task_id)
        db.log(agent, "bloqueio", f"#{task_id}: {motivo}")
        raise StopLoop("Bloqueio registrado; MASON foi avisado. Encerre esta etapa.")

    def pedir_aprovacao_proprietario(titulo: str, detalhes: str) -> Any:
        aid = db.create_approval(agent, titulo, detalhes, task_id)
        db.set_task_status(task_id, "aguardando_aprovacao", agent, titulo)
        raise StopLoop(f"Pedido de aprovação #{aid} enviado. A tarefa será retomada quando o proprietário decidir.")

    def enviar_mensagem_mason(assunto: str, conteudo: str) -> Any:
        db.send_message(agent, "mason", assunto, conteudo, task_id)
        return "Mensagem enviada ao MASON."

    def solicitar_apoio(departamento: str, titulo: str, descricao: str) -> Any:
        if departamento == dept_id:
            raise ValueError("Use outro departamento; o seu já é o responsável por esta tarefa.")
        tid = db.create_task(titulo, descricao, departamento, agent, "media", parent_task_id=task_id)
        db.send_message(agent, "mason", f"Pedido de apoio: #{tid}", f"{dept['name']} pediu apoio a {departamento}: {titulo}", tid)
        return {"task_id": tid, "mensagem": "Tarefa de apoio criada; o resultado não volta automaticamente para cá."}

    def propor_recomendacao(titulo: str, conteudo: str, departamento_alvo: str | None = None) -> Any:
        rid = db.execute(
            "INSERT INTO recommendations(department_id, target_department, title, content, created_at) VALUES (?,?,?,?,?)",
            (dept_id, departamento_alvo, titulo, conteudo, db.now()),
        )
        db.log(agent, "recomendacao", titulo)
        return {"recomendacao_id": rid}

    def buscar_memoria(consulta: str) -> Any:
        scopes = None if transversal else ["geral", dept_id]
        return db.search_memory(consulta, scopes) or "Nada encontrado."

    def salvar_memoria(chave: str, conteudo: str, escopo: str = "departamento") -> Any:
        db.save_memory("geral" if escopo == "geral" else dept_id, chave, conteudo, agent)
        return "Memória salva."

    def ver_tarefas_departamento(status: str | None = None) -> Any:
        return [_compact_task(t) for t in db.list_tasks(dept_id, status)]

    def ver_tarefa(id_tarefa: int) -> Any:
        return _task_detail(id_tarefa, None if transversal else dept_id)

    tools = [
        Tool("registrar_progresso", "Registra uma atualização de progresso visível para MASON e o proprietário.",
             {"nota": S}, ["nota"], registrar_progresso),
        Tool("concluir_tarefa", "Entrega o resultado final COMPLETO da tarefa (o entregável inteiro) e um resumo curto.",
             {"resultado": S, "resumo": S}, ["resultado", "resumo"], concluir_tarefa),
        Tool("registrar_bloqueio", "Interrompe a tarefa por falta de informação, acesso ou decisão, avisando o MASON.",
             {"motivo": S, "o_que_precisa": S}, ["motivo", "o_que_precisa"], registrar_bloqueio),
        Tool("pedir_aprovacao_proprietario", "Pausa a tarefa e pede uma decisão ao proprietário.",
             {"titulo": S, "detalhes": S}, ["titulo", "detalhes"], pedir_aprovacao_proprietario),
        Tool("enviar_mensagem_mason", "Envia uma mensagem interna ao MASON (alertas, dúvidas, avisos) sem parar a tarefa.",
             {"assunto": S, "conteudo": S}, ["assunto", "conteudo"], enviar_mensagem_mason),
        Tool("solicitar_apoio", "Cria uma tarefa para outro departamento ajudar.",
             {"departamento": DEPT_ENUM, "titulo": S, "descricao": S}, ["departamento", "titulo", "descricao"],
             solicitar_apoio),
        Tool("propor_recomendacao", "Registra uma recomendação de melhoria para o MASON avaliar.",
             {"titulo": S, "conteudo": S, "departamento_alvo": DEPT_ENUM}, ["titulo", "conteudo"], propor_recomendacao),
        Tool("buscar_memoria", "Busca na memória da empresa.", {"consulta": S}, ["consulta"], buscar_memoria),
        Tool("salvar_memoria", "Salva um aprendizado duradouro (escopo 'departamento' ou 'geral').",
             {"chave": S, "conteudo": S, "escopo": {"type": "string", "enum": ["departamento", "geral"]}},
             ["chave", "conteudo"], salvar_memoria),
        Tool("ver_tarefas_departamento", "Lista as tarefas do seu departamento.", {"status": S}, [],
             ver_tarefas_departamento),
        Tool("ver_tarefa_qualquer" if transversal else "ver_tarefa",
             "Mostra uma tarefa com resultado e histórico" + (" (de qualquer departamento)." if transversal else " do seu departamento."),
             {"id_tarefa": I}, ["id_tarefa"], ver_tarefa),
    ]
    if transversal:
        tools.append(Tool("ver_tarefas_empresa", "Visão geral (somente leitura) das tarefas de todos os departamentos.",
                          {}, [], lambda: company_snapshot()))
    return tools


def task_brief(t: dict[str, Any]) -> str:
    due = f"\nPRAZO (UTC): {t['due_at']}" if t.get("due_at") else ""
    return (f"Nova tarefa #{t['id']} atribuída por {t['created_by']}.\nPRIORIDADE: {t['priority']}{due}\n\n"
            f"TÍTULO: {t['title']}\n\nDESCRIÇÃO:\n{t['description']}")


def run_department_task(task_id: int) -> RunResult:
    t = db.get_task(task_id)
    dept = DEPT_BY_ID[t["department_id"]]
    conv = f"task:{task_id}"
    message = t["next_input"] or (task_brief(t) if not db.load_conversation(conv) else
                                  "Continue a tarefa de onde parou.")
    db.execute("UPDATE tasks SET next_input=NULL WHERE id=?", (task_id,))
    db.set_task_status(task_id, "em_andamento", dept["agent_id"])
    extra = [WEB_SEARCH_TOOL] if dept.get("web_search") else None
    result = run_agent(conv, department_system(dept), department_tools(dept, task_id), message,
                       effort="high", extra_tools=extra, max_steps=30)
    after = db.get_task(task_id)
    if after["status"] == "em_andamento":
        # o agente terminou sem entregar formalmente: trata o texto final como entrega
        if result.text.strip():
            db.add_update(task_id, dept["agent_id"], "resultado", "Entrega sem concluir_tarefa; enviada para revisão.")
            new_status = "em_revisao" if auto_review_enabled() else "concluida"
            db.set_task_status(task_id, new_status, "sistema", result=result.text,
                               review_pending=1 if new_status == "em_revisao" else 0)
        else:
            db.set_task_status(task_id, "falhou", "sistema", f"Agente terminou sem resultado ({result.stop_reason}).")
    return result


# =====================================================================  utilidades

def queue_input(task_id: int, message: str, author: str) -> None:
    """Entrega uma mensagem à tarefa e a coloca de volta na fila de execução."""
    t = db.get_task(task_id)
    combined = f"{t['next_input']}\n\n{message}" if t.get("next_input") else message
    db.add_update(task_id, author, "mensagem", message)
    db.set_task_status(task_id, "pendente", author, "retomada", next_input=combined, review_pending=0)


def auto_review_enabled() -> bool:
    return db.get_setting("auto_review", "1") == "1"


def owner_decided(approval: dict[str, Any]) -> None:
    """Chamado quando o proprietário decide uma aprovação."""
    verdict = "APROVADO" if approval["status"] == "aprovada" else "REJEITADO"
    note = approval.get("decision_note") or ""
    if approval.get("task_id"):
        t = db.get_task(approval["task_id"])
        if t and t["status"] not in ("concluida", "cancelada"):
            queue_input(t["id"], f"[Decisão do proprietário] Pedido \"{approval['title']}\": {verdict}. {note}".strip(),
                        "proprietario")
    db.send_message("proprietario", "mason", f"Decisão: {approval['title']}", f"{verdict}. {note}", approval.get("task_id"))


def to_json(x: Any) -> str:
    return json.dumps(x, ensure_ascii=False, default=str)
