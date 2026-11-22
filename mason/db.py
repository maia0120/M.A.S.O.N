"""Banco de dados do escritório virtual (SQLite).

Tudo o que acontece na empresa fica registrado aqui: departamentos, agentes,
tarefas, histórico de cada tarefa, aprovações, comunicação interna, memória
compartilhada, recomendações, relatórios e as conversas dos agentes.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator

DB_PATH = os.environ.get("MASON_DB", os.path.join(os.path.dirname(__file__), "..", "data", "escritorio.db"))
_lock = threading.RLock()

OPEN_STATUSES = ("pendente", "em_andamento", "bloqueada", "aguardando_aprovacao", "em_revisao")
ALL_STATUSES = OPEN_STATUSES + ("concluida", "cancelada", "falhou")
PRIORITIES = ("baixa", "media", "alta", "urgente")

SCHEMA = """
CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    department_id TEXT REFERENCES departments(id),
    name TEXT NOT NULL,
    role TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    department_id TEXT NOT NULL REFERENCES departments(id),
    assigned_agent TEXT REFERENCES agents(id),
    status TEXT NOT NULL DEFAULT 'pendente',
    priority TEXT NOT NULL DEFAULT 'media',
    created_by TEXT NOT NULL,
    parent_task_id INTEGER REFERENCES tasks(id),
    result TEXT,
    review_rounds INTEGER NOT NULL DEFAULT 0,
    review_pending INTEGER NOT NULL DEFAULT 0,
    next_input TEXT,                  -- próxima mensagem a entregar ao agente quando a tarefa voltar a rodar
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    due_at TEXT,
    completed_at TEXT
);
CREATE TABLE IF NOT EXISTS task_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    author TEXT NOT NULL,
    kind TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    requested_by TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente',
    decision_note TEXT,
    created_at TEXT NOT NULL,
    decided_at TEXT
);
CREATE TABLE IF NOT EXISTS internal_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_agent TEXT NOT NULL,
    to_agent TEXT NOT NULL,
    subject TEXT NOT NULL,
    content TEXT NOT NULL,
    task_id INTEGER,
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scope TEXT NOT NULL,              -- 'geral' ou id de departamento
    key TEXT NOT NULL,
    content TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(scope, key)
);
CREATE TABLE IF NOT EXISTS recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    department_id TEXT NOT NULL,
    target_department TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'nova',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversation_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation TEXT NOT NULL,
    role TEXT NOT NULL,
    content_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv ON conversation_messages(conversation, id);
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL
);
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def in_hours(hours: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat(timespec="seconds")


@contextmanager
def conn() -> Iterator[sqlite3.Connection]:
    with _lock:
        os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
        c = sqlite3.connect(DB_PATH)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA foreign_keys = ON")
        try:
            yield c
            c.commit()
        finally:
            c.close()


def rows(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    with conn() as c:
        return [dict(r) for r in c.execute(sql, params).fetchall()]


def row(sql: str, params: tuple = ()) -> dict[str, Any] | None:
    r = rows(sql, params)
    return r[0] if r else None


def execute(sql: str, params: tuple = ()) -> int:
    with conn() as c:
        cur = c.execute(sql, params)
        return cur.lastrowid


def init_db() -> None:
    from .company import DEPARTMENTS  # import local para evitar ciclo

    with conn() as c:
        c.executescript(SCHEMA)
        for d in DEPARTMENTS:
            c.execute(
                "INSERT OR IGNORE INTO departments(id, name, description) VALUES (?,?,?)",
                (d["id"], d["name"], d["description"]),
            )
            c.execute(
                "INSERT OR IGNORE INTO agents(id, department_id, name, role) VALUES (?,?,?,?)",
                (d["agent_id"], d["id"], d["agent_name"], d["agent_role"]),
            )
        c.execute(
            "INSERT OR IGNORE INTO agents(id, department_id, name, role) VALUES (?,?,?,?)",
            ("mason", None, "MASON", "Supervisor geral do escritório virtual"),
        )


def log(actor: str, action: str, details: str) -> None:
    execute(
        "INSERT INTO activity_log(actor, action, details, created_at) VALUES (?,?,?,?)",
        (actor, action, details, now()),
    )


# ---------------------------------------------------------------- tarefas

def create_task(title: str, description: str, department_id: str, created_by: str,
                priority: str = "media", due_in_hours: float | None = None,
                parent_task_id: int | None = None) -> int:
    dept = row("SELECT * FROM departments WHERE id=?", (department_id,))
    if not dept:
        raise ValueError(f"Departamento desconhecido: {department_id}")
    agent = row("SELECT id FROM agents WHERE department_id=? ORDER BY id LIMIT 1", (department_id,))
    if priority not in PRIORITIES:
        priority = "media"
    ts = now()
    due = in_hours(due_in_hours) if due_in_hours else None
    task_id = execute(
        """INSERT INTO tasks(title, description, department_id, assigned_agent, status, priority,
               created_by, parent_task_id, created_at, updated_at, due_at)
           VALUES (?,?,?,?, 'pendente', ?,?,?,?,?,?)""",
        (title, description, department_id, agent["id"] if agent else None, priority,
         created_by, parent_task_id, ts, ts, due),
    )
    add_update(task_id, created_by, "sistema", f"Tarefa criada e atribuída a {dept['name']}.")
    log(created_by, "criou_tarefa", f"#{task_id} {title} → {dept['name']}")
    return task_id


def set_task_status(task_id: int, status: str, author: str, note: str | None = None, **fields: Any) -> None:
    if status not in ALL_STATUSES:
        raise ValueError(f"Status inválido: {status}")
    sets = ["status=?", "updated_at=?"]
    params: list[Any] = [status, now()]
    if status == "concluida":
        sets.append("completed_at=?")
        params.append(now())
    for k, v in fields.items():
        sets.append(f"{k}=?")
        params.append(v)
    params.append(task_id)
    execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id=?", tuple(params))
    add_update(task_id, author, "status", f"Status → {status}" + (f": {note}" if note else ""))


def add_update(task_id: int, author: str, kind: str, content: str) -> None:
    ts = now()
    execute(
        "INSERT INTO task_updates(task_id, author, kind, content, created_at) VALUES (?,?,?,?,?)",
        (task_id, author, kind, content, ts),
    )
    execute("UPDATE tasks SET updated_at=? WHERE id=?", (ts, task_id))


def get_task(task_id: int) -> dict[str, Any] | None:
    t = row("SELECT * FROM tasks WHERE id=?", (task_id,))
    if not t:
        return None
    t["overdue"] = is_overdue(t)
    t["updates"] = rows("SELECT * FROM task_updates WHERE task_id=? ORDER BY id", (task_id,))
    t["approvals"] = rows("SELECT * FROM approvals WHERE task_id=? ORDER BY id", (task_id,))
    return t


def is_overdue(t: dict[str, Any]) -> bool:
    return bool(t.get("due_at")) and t["status"] in OPEN_STATUSES and t["due_at"] < now()


def list_tasks(department_id: str | None = None, status: str | None = None,
               overdue_only: bool = False, limit: int = 100) -> list[dict[str, Any]]:
    sql = "SELECT * FROM tasks WHERE 1=1"
    params: list[Any] = []
    if department_id:
        sql += " AND department_id=?"
        params.append(department_id)
    if status == "abertas":
        sql += f" AND status IN ({','.join('?' * len(OPEN_STATUSES))})"
        params.extend(OPEN_STATUSES)
    elif status:
        sql += " AND status=?"
        params.append(status)
    sql += " ORDER BY CASE priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, id DESC LIMIT ?"
    params.append(limit)
    out = rows(sql, tuple(params))
    for t in out:
        t["overdue"] = is_overdue(t)
    if overdue_only:
        out = [t for t in out if t["overdue"]]
    return out


# ---------------------------------------------------------------- aprovações

def create_approval(requested_by: str, title: str, details: str, task_id: int | None = None) -> int:
    aid = execute(
        "INSERT INTO approvals(task_id, requested_by, title, details, created_at) VALUES (?,?,?,?,?)",
        (task_id, requested_by, title, details, now()),
    )
    log(requested_by, "pediu_aprovacao", f"#{aid} {title}")
    return aid


def decide_approval(approval_id: int, approved: bool, note: str) -> dict[str, Any]:
    a = row("SELECT * FROM approvals WHERE id=?", (approval_id,))
    if not a:
        raise ValueError("Aprovação não encontrada")
    if a["status"] != "pendente":
        raise ValueError("Esta aprovação já foi decidida")
    status = "aprovada" if approved else "rejeitada"
    execute("UPDATE approvals SET status=?, decision_note=?, decided_at=? WHERE id=?",
            (status, note, now(), approval_id))
    log("proprietario", f"aprovacao_{status}", f"#{approval_id} {a['title']}")
    a.update(status=status, decision_note=note)
    return a


# ---------------------------------------------------------------- comunicação e memória

def send_message(from_agent: str, to_agent: str, subject: str, content: str, task_id: int | None = None) -> int:
    return execute(
        """INSERT INTO internal_messages(from_agent, to_agent, subject, content, task_id, created_at)
           VALUES (?,?,?,?,?,?)""",
        (from_agent, to_agent, subject, content, task_id, now()),
    )


def save_memory(scope: str, key: str, content: str, author: str) -> None:
    ts = now()
    execute(
        """INSERT INTO memory(scope, key, content, author, created_at, updated_at) VALUES (?,?,?,?,?,?)
           ON CONFLICT(scope, key) DO UPDATE SET content=excluded.content, author=excluded.author,
           updated_at=excluded.updated_at""",
        (scope, key, content, author, ts, ts),
    )


def search_memory(query: str, scopes: list[str] | None) -> list[dict[str, Any]]:
    sql = "SELECT scope, key, content, author, updated_at FROM memory WHERE (key LIKE ? OR content LIKE ?)"
    like = f"%{query}%"
    params: list[Any] = [like, like]
    if scopes is not None:
        sql += f" AND scope IN ({','.join('?' * len(scopes))})"
        params.extend(scopes)
    sql += " ORDER BY updated_at DESC LIMIT 20"
    return rows(sql, tuple(params))


# ---------------------------------------------------------------- conversas dos agentes

def append_conversation(conversation: str, role: str, content: Any) -> None:
    execute(
        "INSERT INTO conversation_messages(conversation, role, content_json, created_at) VALUES (?,?,?,?)",
        (conversation, role, json.dumps(content, ensure_ascii=False), now()),
    )


def _as_blocks(content: Any) -> list[dict[str, Any]]:
    return [{"type": "text", "text": content}] if isinstance(content, str) else list(content)


def load_conversation(conversation: str) -> list[dict[str, Any]]:
    """Carrega a conversa; mensagens seguidas do mesmo papel são unidas numa só."""
    out: list[dict[str, Any]] = []
    for r in rows("SELECT role, content_json FROM conversation_messages WHERE conversation=? ORDER BY id",
                  (conversation,)):
        content = json.loads(r["content_json"])
        if out and out[-1]["role"] == r["role"]:
            out[-1]["content"] = _as_blocks(out[-1]["content"]) + _as_blocks(content)
        else:
            out.append({"role": r["role"], "content": content})
    return out


def get_setting(key: str, default: str | None = None) -> str | None:
    r = row("SELECT value FROM settings WHERE key=?", (key,))
    return r["value"] if r else default


def set_setting(key: str, value: str) -> None:
    execute("INSERT INTO settings(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value))


# ---------------------------------------------------------------- visão geral

def overview() -> dict[str, Any]:
    depts = rows("SELECT * FROM departments ORDER BY rowid")
    for d in depts:
        counts = rows("SELECT status, COUNT(*) n FROM tasks WHERE department_id=? GROUP BY status", (d["id"],))
        d["counts"] = {c["status"]: c["n"] for c in counts}
        d["overdue"] = len(list_tasks(d["id"], "abertas", overdue_only=True))
        d["active"] = rows(
            "SELECT id, title, status, priority FROM tasks WHERE department_id=? AND status IN ('em_andamento','em_revisao') ORDER BY id DESC LIMIT 5",
            (d["id"],),
        )
    return {
        "now": now(),
        "departments": depts,
        "open_tasks": list_tasks(status="abertas"),
        "recent_done": rows("SELECT * FROM tasks WHERE status='concluida' ORDER BY completed_at DESC LIMIT 15"),
        "failed": rows("SELECT * FROM tasks WHERE status='falhou' ORDER BY updated_at DESC LIMIT 10"),
        "pending_approvals": rows("SELECT * FROM approvals WHERE status='pendente' ORDER BY id"),
        "recommendations": rows("SELECT * FROM recommendations WHERE status='nova' ORDER BY id DESC LIMIT 20"),
        "unread_for_mason": rows(
            "SELECT * FROM internal_messages WHERE to_agent='mason' AND read=0 ORDER BY id DESC LIMIT 20"),
        "reports": rows("SELECT id, title, created_at FROM reports ORDER BY id DESC LIMIT 10"),
        "activity": rows("SELECT * FROM activity_log ORDER BY id DESC LIMIT 30"),
    }
