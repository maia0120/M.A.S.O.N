"""Servidor web: painel do proprietário + chat com o MASON."""
from __future__ import annotations

import logging
import os
import threading

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from . import agents, auth, db
from .worker import worker

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Escritório Virtual MASON")
STATIC = os.path.join(os.path.dirname(__file__), "static")
_chat_lock = threading.Lock()
_chat_state: dict[str, str | None] = {"error": None}

PUBLIC_PATHS = {"/", "/login", "/api/login", "/api/session", "/manifest.webmanifest", "/sw.js", "/firebase-auth.js",
                "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png", "/healthz"}


@app.middleware("http")
async def require_login(request: Request, call_next):
    if request.url.path not in PUBLIC_PATHS and not auth.valid_token(request.cookies.get(auth.COOKIE)):
        return JSONResponse({"detail": "Faça login"}, status_code=401)
    return await call_next(request)


@app.on_event("startup")
def _startup() -> None:
    db.init_db()
    if os.environ.get("MASON_DISABLE_WORKER") != "1":
        worker.start()


class LoginIn(BaseModel):
    password: str | None = None
    id_token: str | None = None


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
    return FileResponse(os.path.join(STATIC, "index.html"), headers={"Cache-Control": "no-cache"})


@app.get("/healthz")
def healthz():
    return {"ok": True}


for _name, _type in (("manifest.webmanifest", "application/manifest+json"), ("sw.js", "text/javascript"),
                     ("firebase-auth.js", "text/javascript"),
                     ("icon-192.png", "image/png"), ("icon-512.png", "image/png"),
                     ("apple-touch-icon.png", "image/png")):
    def _serve(name: str = _name, media: str = _type) -> FileResponse:
        return FileResponse(os.path.join(STATIC, name), media_type=media, headers={"Cache-Control": "no-cache"})
    app.add_api_route(f"/{_name}", _serve, methods=["GET"])


@app.get("/api/session")
def session(request: Request):
    return {"logged_in": auth.valid_token(request.cookies.get(auth.COOKIE)), "mode": auth.mode(),
            "firebase": auth.firebase_web_config()}


@app.post("/api/login")
def login(body: LoginIn, request: Request, response: Response):
    client = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0].strip()
    try:
        token = auth.login(client, password_value=body.password, id_token=body.id_token)
    except PermissionError as e:
        raise HTTPException(429 if "tentativas" in str(e) else 401, str(e))
    https = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
    response.set_cookie(auth.COOKIE, token, max_age=auth.SESSION_DAYS * 86400,
                        httponly=True, samesite="lax", secure=https)
    return {"ok": True}


@app.post("/api/logout")
def logout(response: Response):
    response.delete_cookie(auth.COOKIE)
    return {"ok": True}


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
    return {"messages": agents.mason_chat_history(), "busy": _chat_lock.locked(), "error": _chat_state["error"]}


@app.post("/api/chat")
def chat(body: ChatIn):
    """Inicia a resposta do MASON em segundo plano. O app acompanha por GET /api/chat,
    então a resposta não se perde se o celular bloquear a tela ou a conexão cair."""
    if not body.message.strip():
        raise HTTPException(400, "Mensagem vazia")
    if not _chat_lock.acquire(blocking=False):
        raise HTTPException(409, "MASON ainda está respondendo a mensagem anterior")
    _chat_state["error"] = None

    def run() -> None:
        try:
            agents.chat_with_mason(body.message)
        except Exception as e:
            logging.getLogger("mason.chat").exception("Falha no chat")
            _chat_state["error"] = str(e)
        finally:
            _chat_lock.release()

    threading.Thread(target=run, daemon=True, name="mason-chat").start()
    return {"ok": True}


@app.post("/api/chat/reset")
def chat_reset():
    if _chat_lock.locked():
        raise HTTPException(409, "Espere o MASON terminar de responder")
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
    r = db.get_report(report_id)
    if not r:
        raise HTTPException(404, "Relatório não encontrado")
    return r


@app.post("/api/reports/generate")
def generate_report():
    worker.request_report()
    return {"ok": True, "message": "MASON está preparando o relatório; ele aparecerá na lista em alguns instantes."}


@app.get("/api/recommendations/{rec_id}")
def recommendation(rec_id: int):
    r = db.get_recommendation(rec_id)
    if not r:
        raise HTTPException(404, "Recomendação não encontrada")
    return r


@app.post("/api/recommendations/{rec_id}/{status}")
def set_recommendation(rec_id: int, status: str):
    if status not in ("aceita", "descartada"):
        raise HTTPException(400, "Status inválido")
    try:
        db.set_recommendation_status(rec_id, status)
    except ValueError as e:
        raise HTTPException(404, str(e))
    return {"ok": True}


@app.get("/api/memory")
def memory():
    return db.list_memory()


@app.post("/api/settings")
def settings(body: SettingsIn):
    if body.auto_review is not None:
        db.set_setting("auto_review", "1" if body.auto_review else "0")
    if body.report_interval_hours is not None:
        db.set_setting("report_interval_hours", str(max(0.0, body.report_interval_hours)))
    return {"ok": True}
