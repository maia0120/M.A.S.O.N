"""Login por senha para o painel.

Defina MASON_PASSWORD para exigir senha. Sem ela, o servidor só aceita rodar em 127.0.0.1
(acesso local), para nunca ficar aberto na internet sem proteção.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import threading
import time

from . import db

COOKIE = "mason_session"
SESSION_DAYS = 30
_attempts: dict[str, list[float]] = {}
_lock = threading.Lock()


def password() -> str | None:
    return os.environ.get("MASON_PASSWORD") or None


def _secret() -> bytes:
    s = os.environ.get("MASON_SECRET") or db.get_setting("session_secret")
    if not s:
        s = secrets.token_hex(32)
        db.set_setting("session_secret", s)
    # trocar a senha invalida todas as sessões abertas
    return hashlib.sha256((s + (password() or "")).encode()).digest()


def make_token() -> str:
    expires = str(int(time.time()) + SESSION_DAYS * 86400)
    sig = hmac.new(_secret(), expires.encode(), hashlib.sha256).hexdigest()
    return f"{expires}.{sig}"


def valid_token(token: str | None) -> bool:
    if not password():
        return True
    if not token or "." not in token:
        return False
    expires, sig = token.split(".", 1)
    good = hmac.new(_secret(), expires.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(sig, good) and expires.isdigit() and int(expires) > time.time()


def check_password(candidate: str, client: str) -> bool:
    """Confere a senha, com limite de 5 tentativas erradas a cada 15 minutos por endereço."""
    now = time.time()
    with _lock:
        recent = [t for t in _attempts.get(client, []) if now - t < 900]
        _attempts[client] = recent
        if len(recent) >= 5:
            raise PermissionError("Muitas tentativas. Aguarde 15 minutos.")
    ok = hmac.compare_digest(candidate.encode(), (password() or "").encode())
    if not ok:
        with _lock:
            _attempts[client].append(now)
    return ok
