"""Executor em segundo plano: roda as tarefas dos departamentos, as revisões do MASON
e os relatórios periódicos. O estado fica no banco, então reiniciar o servidor não perde trabalho."""
from __future__ import annotations

import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from . import agents, db

log = logging.getLogger("mason.worker")

MAX_PARALLEL = int(os.environ.get("MASON_MAX_PARALLEL", "3"))


class Worker:
    def __init__(self) -> None:
        self.pool = ThreadPoolExecutor(max_workers=MAX_PARALLEL)
        self.running: set[str] = set()
        self.lock = threading.Lock()
        self.stop = threading.Event()

    def start(self) -> None:
        # tarefas que estavam rodando quando o servidor caiu voltam para a fila
        for t in db.rows("SELECT id FROM tasks WHERE status='em_andamento'"):
            db.set_task_status(t["id"], "pendente", "sistema", "retomada após reinício")
        threading.Thread(target=self._loop, daemon=True, name="mason-dispatcher").start()

    def _submit(self, key: str, fn, *args) -> None:
        with self.lock:
            if key in self.running or len(self.running) >= MAX_PARALLEL:
                return
            self.running.add(key)

        def wrapped():
            try:
                fn(*args)
            except Exception as e:  # registra e segue
                log.exception("Falha em %s", key)
                if key.startswith("task:"):
                    tid = int(key.split(":")[1])
                    db.set_task_status(tid, "falhou", "sistema", str(e))
                    db.send_message("sistema", "mason", f"Falha na tarefa #{tid}", str(e), tid)
                elif key.startswith("review:"):
                    tid = int(key.split(":")[1])
                    db.execute("UPDATE tasks SET review_pending=0 WHERE id=?", (tid,))
                    db.add_update(tid, "sistema", "erro", f"Revisão automática falhou: {e}")
                db.log("sistema", "erro", f"{key}: {e}")
            finally:
                with self.lock:
                    self.running.discard(key)

        self.pool.submit(wrapped)

    def tick(self) -> None:
        for t in db.rows("SELECT id FROM tasks WHERE status='pendente' ORDER BY "
                         "CASE priority WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, id"):
            self._submit(f"task:{t['id']}", agents.run_department_task, t["id"])
        for t in db.rows("SELECT id FROM tasks WHERE status='em_revisao' AND review_pending=1"):
            self._submit(f"review:{t['id']}", self._review, t["id"])
        self._maybe_report()

    def _review(self, task_id: int) -> None:
        agents.mason_review(task_id)
        t = db.get_task(task_id)
        if t["status"] == "em_revisao" and t["review_pending"]:
            # MASON não decidiu: evita repetir a revisão sem fim
            db.execute("UPDATE tasks SET review_pending=0 WHERE id=?", (task_id,))
            db.add_update(task_id, "sistema", "aviso", "Revisão sem decisão; aguardando o MASON ou o proprietário.")

    def _maybe_report(self) -> None:
        hours = float(db.get_setting("report_interval_hours", os.environ.get("MASON_REPORT_HOURS", "0")) or 0)
        if hours <= 0:
            return
        last = db.get_setting("last_report_at")
        if last and (datetime.now(timezone.utc) - datetime.fromisoformat(last)).total_seconds() < hours * 3600:
            return
        db.set_setting("last_report_at", db.now())
        self._submit("report", agents.mason_periodic_report)

    def request_report(self) -> None:
        db.set_setting("last_report_at", db.now())
        self._submit("report", agents.mason_periodic_report)

    def _loop(self) -> None:
        while not self.stop.is_set():
            try:
                self.tick()
            except Exception:
                log.exception("Erro no despachante")
            time.sleep(2)

    def status(self) -> list[str]:
        with self.lock:
            return sorted(self.running)


worker = Worker()
