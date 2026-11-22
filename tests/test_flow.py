"""Teste de ponta a ponta com um modelo simulado (não chama a API real)."""
import os
import sys
import tempfile
import time

os.environ["MASON_DB"] = os.path.join(tempfile.mkdtemp(), "t.db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from types import SimpleNamespace as NS  # noqa: E402

from mason import agents, db, llm  # noqa: E402
from mason.worker import Worker  # noqa: E402


def resp(*blocks, stop="end_turn"):
    return NS(content=list(blocks), stop_reason=stop)


def text(t):
    return {"type": "text", "text": t}


n = 0


def tool(name, **inp):
    global n
    n += 1
    return {"type": "tool_use", "id": f"tu_{n}", "name": name, "input": inp}


class FakeMessages:
    def __init__(self):
        self.calls = []

    def create(self, **kw):
        self.calls.append(kw)
        msgs, system = kw["messages"], kw["system"]
        # roles devem alternar e começar com user
        roles = [m["role"] for m in msgs]
        assert roles[0] == "user" and all(a != b for a, b in zip(roles, roles[1:])), roles
        last = msgs[-1]["content"]
        last_text = last if isinstance(last, str) else " ".join(
            b.get("text", "") + str(b.get("content", "")) for b in last)
        tool_names = {t["name"] for t in kw["tools"]}
        if "criar_tarefa" in tool_names and "visao_geral_empresa" in tool_names:  # MASON no chat
            if "Resultado" in last_text or "task_id" in last_text or "approval_id" in last_text:
                return resp(text("Distribuí o trabalho e vou acompanhar."))
            if "roteiro" in last_text:
                return resp(tool("criar_tarefa", departamento="marketing", titulo="Roteiro de vídeo",
                                 descricao="Roteiro de 60s", prioridade="alta", prazo_horas=24), stop="tool_use")
            if "status" in last_text:
                return resp(tool("visao_geral_empresa"), stop="tool_use")
            return resp(text("Aqui está o resumo."))
        if "revisar_tarefa" in tool_names:  # revisão
            if "Tarefa marcada" in last_text or "devolvida" in last_text:
                return resp(text("Revisado."))
            tid = int(last_text.split("tarefa #")[1].split(" ")[0].split(".")[0])
            return resp(tool("revisar_tarefa", task_id=tid, decisao="aprovar", comentario="ok"), stop="tool_use")
        # departamento
        if "Decisão do proprietário" in last_text:
            return resp(tool("concluir_tarefa", resultado="Plano final aprovado", resumo="feito"), stop="tool_use")
        if "Nova tarefa" in last_text and "Orçamento" in last_text:
            return resp(text("Preciso de aprovação."), tool("pedir_aprovacao_proprietario", titulo="Gastar R$500",
                                                            detalhes="Anúncios"), stop="tool_use")
        if "Nova tarefa" in last_text:
            return resp(tool("registrar_progresso", nota="começando"), stop="tool_use")
        if "Progresso registrado" in last_text:
            return resp(tool("concluir_tarefa", resultado="ROTEIRO COMPLETO...", resumo="roteiro pronto"), stop="tool_use")
        return resp(text("ok"))


fake = NS(beta=NS(messages=FakeMessages()))
llm.set_client(fake)
db.init_db()


def drain(w, secs=10):
    end = time.time() + secs
    while time.time() < end:
        w.tick()
        time.sleep(0.2)
        busy = w.status() or db.task_ids("pendente") or db.task_ids("em_revisao", review_pending=1)
        if not busy:
            return
    raise AssertionError("não drenou")


def test_all():
    w = Worker()
    r = agents.chat_with_mason("Quero um roteiro de vídeo")
    assert "Distribuí" in r.text, r
    t = db.list_tasks()[0]
    assert t["department_id"] == "marketing" and t["status"] == "pendente" and t["due_at"]
    drain(w)
    t = db.get_task(t["id"])
    assert t["status"] == "concluida", t["status"]
    assert t["result"] == "ROTEIRO COMPLETO..."
    kinds = [u["kind"] for u in t["updates"]]
    assert "progresso" in kinds and "revisao" in kinds

    # fluxo de aprovação
    tid = db.create_task("Orçamento de anúncios", "Planejar", "comercial", "mason")
    drain(w)
    assert db.get_task(tid)["status"] == "aguardando_aprovacao"
    ap = db.list_approvals("pendente")[0]
    agents.owner_decided(db.decide_approval(ap["id"], True, "pode"))
    drain(w)
    t = db.get_task(tid)
    assert t["status"] == "concluida" and t["result"] == "Plano final aprovado", t

    # chat continua coerente e histórico aparece
    r = agents.chat_with_mason("qual o status?")
    hist = agents.mason_chat_history()
    assert hist[0]["text"] == "Quero um roteiro de vídeo"
    ov = db.overview()
    assert len(ov["recent_done"]) == 2
    # parâmetros de API usados
    kw = fake.beta.messages.calls[0]
    assert kw["model"] == "claude-opus-5-5" and kw["fallbacks"] == "default"
    print("OK", len(fake.beta.messages.calls), "chamadas simuladas")


if __name__ == "__main__":
    test_all()
