"""Servidor web: painel do proprietário + chat com o MASON."""
from __future__ import annotations

import logging
import os
import threading

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import agents, db
from .worker import worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Escritório Virtual MASON")
STATIC = os.path.join(os.path.dirname(__file__), "static")
_chat_lock = threading.Lock()


@app.on_event("startup")
def _startup() -> None:
    db.init_db()
    if os.environ.get("MASON_DISABLE_WORKER") != "1":
        worker.start()


class ChatIn(BaseModel):
    message: str


class DecisionIn(BaseModel):
    approved: bool
    note: str = ""


class TaskMessageIn(BaseModel):
    message: str


class SettingsIn(BaseModel):
    auto_review: bool | None = None
    report_interval_hours: float | None = None


@app.get("/")
def index() -> FileResponse:
    return FileResponse(os.path.join(STATIC, "index.html"))


@app.get("/api/overview")
def overview():
    ov = db.overview()
    ov["running"] = worker.status()
    ov["settings"] = {
        "auto_review": agents.auto_review_enabled(),
        "report_interval_hours": float(db.get_setting("report_interval_hours", "0") or 0),
    }
    return ov


@app.get("/api/tasks/{task_id}")
def task(task_id: int):
    t = db.get_task(task_id)
    if not t:
        raise HTTPException(404, "Tarefa não encontrada")
    t.pop("next_input", None)
    return t


@app.post("/api/tasks/{task_id}/message")
def task_message(task_id: int, body: TaskMessageIn):
    t = db.get_task(task_id)
    if not t:
        raise HTTPException(404, "Tarefa não encontrada")
    if t["status"] in ("concluida", "cancelada"):
        raise HTTPException(400, "Tarefa já encerrada")
    agents.queue_input(task_id, f"[Mensagem do proprietário] {body.message}", "proprietario")
    return {"ok": True}


@app.post("/api/tasks/{task_id}/cancel")
def task_cancel(task_id: int):
    db.set_task_status(task_id, "cancelada", "proprietario", "cancelada pelo proprietário", next_input=None, review_pending=0)
    return {"ok": True}


@app.get("/api/chat")
def chat_history():
    return agents.mason_chat_history()


@app.post("/api/chat")
def chat(body: ChatIn):
    if not body.message.strip():
        raise HTTPException(400, "Mensagem vazia")
    if not _chat_lock.acquire(blocking=False):
        raise HTTPException(409, "MASON ainda está respondendo a mensagem anterior")
    try:
        res = agents.chat_with_mason(body.message)
        return {"reply": res.text, "tools": res.tool_calls}
    except RuntimeError as e:
        raise HTTPException(502, str(e))
    finally:
        _chat_lock.release()


@app.post("/api/chat/reset")
def chat_reset():
    agents.reset_mason_chat()
    return {"ok": True}


@app.post("/api/approvals/{approval_id}")
def decide(approval_id: int, body: DecisionIn):
    try:
        a = db.decide_approval(approval_id, body.approved, body.note)
    except ValueError as e:
        raise HTTPException(400, str(e))
    agents.owner_decided(a)
    return {"ok": True}


@app.get("/api/reports/{report_id}")
def report(report_id: int):
    r = db.row("SELECT * FROM reports WHERE id=?", (report_id,))
    if not r:
        raise HTTPException(404, "Relatório não encontrado")
    return r


@app.post("/api/reports/generate")
def generate_report():
    worker.request_report()
    return {"ok": True, "message": "MASON está preparando o relatório; ele aparecerá na lista em alguns instantes."}


@app.get("/api/recommendations/{rec_id}")
def recommendation(rec_id: int):
    r = db.row("SELECT * FROM recommendations WHERE id=?", (rec_id,))
    if not r:
        raise HTTPException(404, "Recomendação não encontrada")
    return r


@app.post("/api/recommendations/{rec_id}/{status}")
def set_recommendation(rec_id: int, status: str):
    if status not in ("aceita", "descartada"):
        raise HTTPException(400, "Status inválido")
    db.execute("UPDATE recommendations SET status=? WHERE id=?", (status, rec_id))
    return {"ok": True}


@app.get("/api/memory")
def memory():
    return db.rows("SELECT * FROM memory ORDER BY updated_at DESC LIMIT 200")


@app.post("/api/settings")
def settings(body: SettingsIn):
    if body.auto_review is not None:
        db.set_setting("auto_review", "1" if body.auto_review else "0")
    if body.report_interval_hours is not None:
        db.set_setting("report_interval_hours", str(max(0.0, body.report_interval_hours)))
    return {"ok": True}
