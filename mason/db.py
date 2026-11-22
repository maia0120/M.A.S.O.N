"""Dados do escritório virtual.

Tudo o que acontece na empresa fica registrado aqui: tarefas e seu histórico, aprovações,
comunicação interna, memória compartilhada, recomendações, relatórios, atividade,
configurações e as conversas dos agentes.

O servidor mantém uma cópia em memória das coleções principais e grava cada mudança no
banco (Firestore ou SQLite local). Assim as consultas do painel não gastam leituras do
Firestore: o banco só é lido ao iniciar o servidor e ao abrir históricos/conversas.
"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from .store import make_backend

DB_PATH = os.environ.get("MASON_DB", os.path.join(os.path.dirname(__file__), "..", "data", "mason-local.db"))

OPEN_STATUSES = ("pendente", "em_andamento", "bloqueada", "aguardando_aprovacao", "em_revisao")
ALL_STATUSES = OPEN_STATUSES + ("concluida", "cancelada", "falhou")
PRIORITIES = ("baixa", "media", "alta", "urgente")
PRIORITY_ORDER = {"urgente": 0, "alta": 1, "media": 2, "baixa": 3}
ACTIVITY_KEEP = 300

_lock = threading.RLock()
_backend: Any = None
_S: dict[str, Any] = {}
work_available = threading.Event()   # avisa o executor que há tarefa para rodar


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def in_hours(hours: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat(timespec="seconds")


def _clean(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if not k.startswith("_")}


def init_db() -> None:
    """Conecta ao banco e carrega as coleções principais para a memória."""
    global _backend
    with _lock:
        _backend = make_backend(DB_PATH)
        b = _backend
        _S.clear()
        _S["tasks"] = {int(d["id"]): _clean(d) for d in b.load("tasks")}
        _S["approvals"] = {int(d["id"]): _clean(d) for d in b.load("approvals")}
        _S["messages"] = {int(d["id"]): _clean(d) for d in b.load("internal_messages")}
        _S["memory"] = {(d["scope"], d["key"]): _clean(d) for d in b.load("memory")}
        _S["recs"] = {int(d["id"]): _clean(d) for d in b.load("recommendations")}
        _S["reports"] = {int(d["id"]): _clean(d) for d in b.load("reports")}
        _S["activity"] = sorted((_clean(d) for d in b.load_recent("activity", "created_at", ACTIVITY_KEEP)),
                                key=lambda a: a["created_at"])
        _S["settings"] = {d["_id"]: d.get("value") for d in b.load("settings")}
        _S["updates"] = {}        # task_id -> lista (carregada sob demanda)
        _S["conversations"] = {}  # nome -> lista (carregada sob demanda)
    work_available.set()


def _put(path: str, doc_id: Any, data: dict[str, Any]) -> None:
    _backend.put(path, str(doc_id), data)


def _new_id(name: str) -> int:
    return _backend.next_id(name)


def log(actor: str, action: str, details: str) -> None:
    with _lock:
        a = {"id": _new_id("activity"), "actor": actor, "action": action, "details": details, "created_at": now()}
        _put("activity", a["id"], a)
        _S["activity"].append(a)
        del _S["activity"][:-ACTIVITY_KEEP]


def recent_activity(limit: int = 30) -> list[dict[str, Any]]:
    with _lock:
        return [dict(a) for a in reversed(_S["activity"][-limit:])]


# ---------------------------------------------------------------- tarefas

def create_task(title: str, description: str, department_id: str, created_by: str,
                priority: str = "media", due_in_hours: float | None = None,
                parent_task_id: int | None = None) -> int:
    from .company import DEPT_BY_ID

    dept = DEPT_BY_ID.get(department_id)
    if not dept:
        raise ValueError(f"Departamento desconhecido: {department_id}")
    if priority not in PRIORITIES:
        priority = "media"
    ts = now()
    with _lock:
        tid = _new_id("tasks")
        t = {"id": tid, "title": title, "description": description, "department_id": department_id,
             "assigned_agent": dept["agent_id"], "status": "pendente", "priority": priority,
             "created_by": created_by, "parent_task_id": parent_task_id, "result": None,
             "review_rounds": 0, "review_pending": 0, "next_input": None,
             "created_at": ts, "updated_at": ts, "due_at": in_hours(due_in_hours) if due_in_hours else None,
             "completed_at": None}
        _S["tasks"][tid] = t
        _put("tasks", tid, t)
    add_update(tid, created_by, "sistema", f"Tarefa criada e atribuída a {dept['name']}.")
    log(created_by, "criou_tarefa", f"#{tid} {title} → {dept['name']}")
    work_available.set()
    return tid


def update_task(task_id: int, **fields: Any) -> None:
    with _lock:
        t = _S["tasks"].get(int(task_id))
        if not t:
            raise ValueError(f"Tarefa #{task_id} não existe")
        t.update(fields)
        t["updated_at"] = now()
        _put("tasks", t["id"], t)
    if fields.get("status") in ("pendente", "em_revisao") or fields.get("review_pending"):
        work_available.set()


def set_task_status(task_id: int, status: str, author: str, note: str | None = None, **fields: Any) -> None:
    if status not in ALL_STATUSES:
        raise ValueError(f"Status inválido: {status}")
    if status == "concluida":
        fields["completed_at"] = now()
    update_task(task_id, status=status, **fields)
    add_update(task_id, author, "status", f"Status → {status}" + (f": {note}" if note else ""))


def _updates(task_id: int) -> list[dict[str, Any]]:
    if task_id not in _S["updates"]:
        docs = _backend.load(f"tasks/{task_id}/updates")
        _S["updates"][task_id] = sorted((_clean(d) for d in docs), key=lambda u: u["seq"])
    return _S["updates"][task_id]


def add_update(task_id: int, author: str, kind: str, content: str) -> None:
    task_id = int(task_id)
    with _lock:
        ups = _updates(task_id)
        u = {"seq": len(ups) + 1, "author": author, "kind": kind, "content": content, "created_at": now()}
        _put(f"tasks/{task_id}/updates", f"{u['seq']:06d}", u)
        ups.append(u)
        t = _S["tasks"].get(task_id)
        if t:
            t["updated_at"] = u["created_at"]


def is_overdue(t: dict[str, Any]) -> bool:
    return bool(t.get("due_at")) and t["status"] in OPEN_STATUSES and t["due_at"] < now()


def _with_flags(t: dict[str, Any]) -> dict[str, Any]:
    out = dict(t)
    out["overdue"] = is_overdue(t)
    return out


def get_task(task_id: int) -> dict[str, Any] | None:
    with _lock:
        t = _S["tasks"].get(int(task_id))
        if not t:
            return None
        out = _with_flags(t)
        out["updates"] = [dict(u) for u in _updates(t["id"])]
        out["approvals"] = [dict(a) for a in _S["approvals"].values() if a.get("task_id") == t["id"]]
        return out


def list_tasks(department_id: str | None = None, status: str | None = None,
               overdue_only: bool = False, limit: int = 100) -> list[dict[str, Any]]:
    with _lock:
        ts = list(_S["tasks"].values())
    if department_id:
        ts = [t for t in ts if t["department_id"] == department_id]
    if status == "abertas":
        ts = [t for t in ts if t["status"] in OPEN_STATUSES]
    elif status:
        ts = [t for t in ts if t["status"] == status]
    ts.sort(key=lambda t: (PRIORITY_ORDER.get(t["priority"], 2), -t["id"]))
    out = [_with_flags(t) for t in ts]
    if overdue_only:
        out = [t for t in out if t["overdue"]]
    return out[:limit]


def task_ids(status: str, **match: Any) -> list[int]:
    with _lock:
        ts = [t for t in _S["tasks"].values() if t["status"] == status
              and all(t.get(k) == v for k, v in match.items())]
    ts.sort(key=lambda t: (PRIORITY_ORDER.get(t["priority"], 2), t["id"]))
    return [t["id"] for t in ts]


# ---------------------------------------------------------------- aprovações

def create_approval(requested_by: str, title: str, details: str, task_id: int | None = None) -> int:
    with _lock:
        aid = _new_id("approvals")
        a = {"id": aid, "task_id": task_id, "requested_by": requested_by, "title": title, "details": details,
             "status": "pendente", "decision_note": None, "created_at": now(), "decided_at": None}
        _S["approvals"][aid] = a
        _put("approvals", aid, a)
    log(requested_by, "pediu_aprovacao", f"#{aid} {title}")
    return aid


def list_approvals(status: str = "pendente", limit: int = 30) -> list[dict[str, Any]]:
    with _lock:
        out = [dict(a) for a in _S["approvals"].values() if a["status"] == status]
    return sorted(out, key=lambda a: a["id"], reverse=status != "pendente")[:limit]


def decide_approval(approval_id: int, approved: bool, note: str) -> dict[str, Any]:
    with _lock:
        a = _S["approvals"].get(int(approval_id))
        if not a:
            raise ValueError("Aprovação não encontrada")
        if a["status"] != "pendente":
            raise ValueError("Esta aprovação já foi decidida")
        a.update(status="aprovada" if approved else "rejeitada", decision_note=note, decided_at=now())
        _put("approvals", a["id"], a)
        out = dict(a)
    log("proprietario", f"aprovacao_{out['status']}", f"#{out['id']} {out['title']}")
    return out


# ---------------------------------------------------------------- comunicação interna

def send_message(from_agent: str, to_agent: str, subject: str, content: str, task_id: int | None = None) -> int:
    with _lock:
        mid = _new_id("internal_messages")
        m = {"id": mid, "from_agent": from_agent, "to_agent": to_agent, "subject": subject, "content": content,
             "task_id": task_id, "read": 0, "created_at": now()}
        _S["messages"][mid] = m
        _put("internal_messages", mid, m)
        return mid


def messages_for(agent: str, unread_only: bool = True, mark_read: bool = False, limit: int = 30) -> list[dict[str, Any]]:
    with _lock:
        ms = [m for m in _S["messages"].values() if m["to_agent"] == agent and (not unread_only or not m["read"])]
        ms = sorted(ms, key=lambda m: m["id"], reverse=True)[:limit]
        out = [dict(m) for m in ms]
        if mark_read:
            for m in ms:
                if not m["read"]:
                    m["read"] = 1
                    _put("internal_messages", m["id"], m)
        return out


# ---------------------------------------------------------------- memória

def save_memory(scope: str, key: str, content: str, author: str) -> None:
    with _lock:
        ts = now()
        m = _S["memory"].get((scope, key)) or {"scope": scope, "key": key, "created_at": ts}
        m.update(content=content, author=author, updated_at=ts)
        _S["memory"][(scope, key)] = m
        _put("memory", f"{scope}__{key}".replace("/", "_")[:1400], m)


def search_memory(query: str, scopes: list[str] | None) -> list[dict[str, Any]]:
    q = query.lower()
    with _lock:
        ms = [dict(m) for m in _S["memory"].values()
              if (scopes is None or m["scope"] in scopes) and (q in m["key"].lower() or q in m["content"].lower())]
    return sorted(ms, key=lambda m: m["updated_at"], reverse=True)[:20]


def list_memory(limit: int = 200) -> list[dict[str, Any]]:
    with _lock:
        ms = [dict(m) for m in _S["memory"].values()]
    return sorted(ms, key=lambda m: m["updated_at"], reverse=True)[:limit]


# ---------------------------------------------------------------- recomendações e relatórios

def add_recommendation(department_id: str, title: str, content: str, target_department: str | None) -> int:
    with _lock:
        rid = _new_id("recommendations")
        r = {"id": rid, "department_id": department_id, "target_department": target_department, "title": title,
             "content": content, "status": "nova", "created_at": now()}
        _S["recs"][rid] = r
        _put("recommendations", rid, r)
        return rid


def get_recommendation(rec_id: int) -> dict[str, Any] | None:
    with _lock:
        r = _S["recs"].get(int(rec_id))
        return dict(r) if r else None


def set_recommendation_status(rec_id: int, status: str) -> None:
    with _lock:
        r = _S["recs"].get(int(rec_id))
        if not r:
            raise ValueError("Recomendação não encontrada")
        r["status"] = status
        _put("recommendations", r["id"], r)


def list_recommendations(status: str = "nova", limit: int = 30) -> list[dict[str, Any]]:
    with _lock:
        rs = [dict(r) for r in _S["recs"].values() if r["status"] == status]
    return sorted(rs, key=lambda r: r["id"], reverse=True)[:limit]


def save_report(title: str, content: str) -> int:
    with _lock:
        rid = _new_id("reports")
        r = {"id": rid, "title": title, "content": content, "created_at": now()}
        _S["reports"][rid] = r
        _put("reports", rid, r)
        return rid


def get_report(report_id: int) -> dict[str, Any] | None:
    with _lock:
        r = _S["reports"].get(int(report_id))
        return dict(r) if r else None


def list_reports(limit: int = 10, with_content: bool = False) -> list[dict[str, Any]]:
    with _lock:
        rs = sorted(_S["reports"].values(), key=lambda r: r["id"], reverse=True)[:limit]
        return [dict(r) if with_content else {k: r[k] for k in ("id", "title", "created_at")} for r in rs]


# ---------------------------------------------------------------- conversas dos agentes

def _as_blocks(content: Any) -> list[dict[str, Any]]:
    return [{"type": "text", "text": content}] if isinstance(content, str) else list(content)


def _conversation(name: str) -> list[dict[str, Any]]:
    if name not in _S["conversations"]:
        path = f"conversations/{name.replace('/', '_')}/messages"
        docs = sorted(_backend.load(path), key=lambda d: d["seq"])
        _S["conversations"][name] = [{"role": d["role"], "content": json.loads(d["content_json"])} for d in docs]
    return _S["conversations"][name]


def append_conversation(conversation: str, role: str, content: Any) -> None:
    with _lock:
        msgs = _conversation(conversation)
        seq = len(msgs) + 1
        _put(f"conversations/{conversation.replace('/', '_')}/messages", f"{seq:06d}",
             {"seq": seq, "role": role, "content_json": json.dumps(content, ensure_ascii=False), "created_at": now()})
        msgs.append({"role": role, "content": content})


def load_conversation(conversation: str) -> list[dict[str, Any]]:
    """Carrega a conversa; mensagens seguidas do mesmo papel são unidas numa só."""
    with _lock:
        raw = list(_conversation(conversation))
    out: list[dict[str, Any]] = []
    for m in raw:
        content = json.loads(json.dumps(m["content"]))  # cópia independente
        if out and out[-1]["role"] == m["role"]:
            out[-1]["content"] = _as_blocks(out[-1]["content"]) + _as_blocks(content)
        else:
            out.append({"role": m["role"], "content": content})
    return out


# ---------------------------------------------------------------- configurações

def get_setting(key: str, default: str | None = None) -> str | None:
    with _lock:
        v = _S["settings"].get(key)
    return default if v is None else v


def set_setting(key: str, value: str) -> None:
    with _lock:
        _S["settings"][key] = value
        _put("settings", key, {"value": value})


# ---------------------------------------------------------------- visão geral

def overview() -> dict[str, Any]:
    from .company import DEPARTMENTS

    tasks = list_tasks(limit=100000)
    depts = []
    for d in DEPARTMENTS:
        mine = [t for t in tasks if t["department_id"] == d["id"]]
        counts: dict[str, int] = {}
        for t in mine:
            counts[t["status"]] = counts.get(t["status"], 0) + 1
        active = sorted((t for t in mine if t["status"] in ("em_andamento", "em_revisao")), key=lambda t: -t["id"])[:5]
        depts.append({"id": d["id"], "name": d["name"], "description": d["description"], "counts": counts,
                      "overdue": sum(1 for t in mine if t["overdue"]),
                      "active": [{k: t[k] for k in ("id", "title", "status", "priority")} for t in active]})
    slim = lambda t: {k: v for k, v in t.items() if k not in ("result", "next_input", "description")}  # noqa: E731
    done = sorted((t for t in tasks if t["status"] == "concluida"), key=lambda t: t["completed_at"] or "", reverse=True)
    failed = sorted((t for t in tasks if t["status"] == "falhou"), key=lambda t: t["updated_at"], reverse=True)
    return {
        "now": now(),
        "departments": depts,
        "open_tasks": [slim(t) for t in tasks if t["status"] in OPEN_STATUSES],
        "recent_done": [slim(t) for t in done[:15]],
        "failed": [slim(t) for t in failed[:10]],
        "pending_approvals": list_approvals("pendente"),
        "recommendations": list_recommendations("nova", 20),
        "unread_for_mason": messages_for("mason", unread_only=True, limit=20),
        "reports": list_reports(10),
        "activity": recent_activity(30),
    }
