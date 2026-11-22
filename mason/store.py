"""Onde os dados ficam guardados.

- FirestoreBackend: Cloud Firestore (produção). Ativado quando FIREBASE_SERVICE_ACCOUNT ou
  FIRESTORE_EMULATOR_HOST estão definidos. O servidor usa o Admin SDK; as Security Rules
  bloqueiam qualquer acesso direto de navegadores/apps ao banco.
- LocalBackend: arquivo SQLite (desenvolvimento no computador e testes).

Os dados são documentos (dicionários) dentro de coleções. Coleções aninhadas usam caminhos
como "tasks/12/updates".
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from typing import Any


class LocalBackend:
    def __init__(self, path: str) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        self._c = sqlite3.connect(path, check_same_thread=False)
        self._lock = threading.Lock()
        with self._lock:
            self._c.executescript("""
                CREATE TABLE IF NOT EXISTS docs (path TEXT, id TEXT, data TEXT, PRIMARY KEY (path, id));
                CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER);
            """)

    def load(self, path: str) -> list[dict[str, Any]]:
        with self._lock:
            rs = self._c.execute("SELECT id, data FROM docs WHERE path=?", (path,)).fetchall()
        return [{**json.loads(d), "_id": i} for i, d in rs]

    def load_recent(self, path: str, field: str, limit: int) -> list[dict[str, Any]]:
        docs = [d for d in self.load(path) if d.get(field) is not None]
        return sorted(docs, key=lambda d: d[field], reverse=True)[:limit]

    def put(self, path: str, doc_id: str, data: dict[str, Any]) -> None:
        with self._lock:
            self._c.execute("INSERT OR REPLACE INTO docs(path, id, data) VALUES (?,?,?)",
                            (path, str(doc_id), json.dumps(data, ensure_ascii=False)))
            self._c.commit()

    def next_id(self, name: str) -> int:
        with self._lock:
            self._c.execute("INSERT OR IGNORE INTO counters(name, value) VALUES (?, 0)", (name,))
            self._c.execute("UPDATE counters SET value = value + 1 WHERE name=?", (name,))
            (v,) = self._c.execute("SELECT value FROM counters WHERE name=?", (name,)).fetchone()
            self._c.commit()
            return int(v)


SECRET_FILE = "/etc/secrets/firebase-service-account.json"  # "Secret File" do Render


def service_account() -> dict[str, Any] | None:
    """Credencial do servidor: variável FIREBASE_SERVICE_ACCOUNT (JSON) ou arquivo secreto."""
    raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if raw:
        return json.loads(raw)
    path = os.environ.get("FIREBASE_SERVICE_ACCOUNT_FILE") or SECRET_FILE
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return None


class FirestoreBackend:
    @staticmethod
    def ensure_app() -> None:
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            sa = service_account()
            if sa:
                firebase_admin.initialize_app(credentials.Certificate(sa))
            else:  # emuladores locais
                firebase_admin.initialize_app(options={"projectId": os.environ.get("FIREBASE_PROJECT_ID", "demo-mason")})

    def __init__(self) -> None:
        from google.cloud import firestore

        self.ensure_app()
        self._fs = firestore
        if service_account():
            from firebase_admin import firestore as admin_firestore
            self._db = admin_firestore.client()
        else:  # emulador local: sem credenciais reais
            from google.auth.credentials import AnonymousCredentials
            self._db = firestore.Client(project=os.environ.get("FIREBASE_PROJECT_ID", "demo-mason"),
                                        credentials=AnonymousCredentials())

    def load(self, path: str) -> list[dict[str, Any]]:
        return [{**d.to_dict(), "_id": d.id} for d in self._db.collection(path).stream()]

    def load_recent(self, path: str, field: str, limit: int) -> list[dict[str, Any]]:
        q = self._db.collection(path).order_by(field, direction=self._fs.Query.DESCENDING).limit(limit)
        return [{**d.to_dict(), "_id": d.id} for d in q.stream()]

    def put(self, path: str, doc_id: str, data: dict[str, Any]) -> None:
        self._db.collection(path).document(str(doc_id)).set(data)

    def next_id(self, name: str) -> int:
        ref = self._db.collection("counters").document(name)
        fs = self._fs

        @fs.transactional
        def bump(tx):
            snap = ref.get(transaction=tx)
            value = (snap.to_dict() or {}).get("value", 0) + 1 if snap.exists else 1
            tx.set(ref, {"value": value})
            return value

        return int(bump(self._db.transaction()))


def make_backend(local_path: str):
    if service_account() or os.environ.get("FIRESTORE_EMULATOR_HOST"):
        return FirestoreBackend()
    return LocalBackend(local_path)
