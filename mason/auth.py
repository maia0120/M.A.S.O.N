"""Acesso exclusivo do proprietário.

Modos (escolhidos pelas variáveis de ambiente):
- firebase: login com Firebase Authentication (e-mail e senha). Só entra a conta cujo UID está
  em MASON_OWNER_UID. Não existe cadastro: a conta é criada uma única vez no console do Firebase.
- senha: uma senha única em MASON_PASSWORD (para usar no computador, sem Firebase).
- local: sem login, aceito somente quando o servidor escuta apenas em 127.0.0.1.

Depois do login, o navegador recebe um cookie de sessão assinado (HttpOnly) válido por 30 dias.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets
import threading
import time
from typing import Any

from . import db

log = logging.getLogger("mason.auth")

COOKIE = "mason_session"
SESSION_DAYS = 30
_attempts: dict[str, list[float]] = {}
_lock = threading.Lock()


def mode() -> str:
    if os.environ.get("FIREBASE_WEB_API_KEY"):
        return "firebase"
    if os.environ.get("MASON_PASSWORD"):
        return "senha"
    return "local"


def password() -> str | None:
    return os.environ.get("MASON_PASSWORD") or None


def owner_uids() -> set[str]:
    return {u.strip() for u in os.environ.get("MASON_OWNER_UID", "").split(",") if u.strip()}


def firebase_web_config() -> dict[str, Any] | None:
    if mode() != "firebase":
        return None
    project = os.environ.get("FIREBASE_PROJECT_ID", "")
    return {
        "apiKey": os.environ["FIREBASE_WEB_API_KEY"],
        "authDomain": os.environ.get("FIREBASE_AUTH_DOMAIN") or f"{project}.firebaseapp.com",
        "projectId": project,
        "emulatorHost": os.environ.get("FIREBASE_AUTH_EMULATOR_HOST"),
    }


def _secret() -> bytes:
    s = os.environ.get("MASON_SECRET") or db.get_setting("session_secret")
    if not s:
        s = secrets.token_hex(32)
        db.set_setting("session_secret", s)
    # trocar a senha ou o dono invalida todas as sessões abertas
    extra = (password() or "") + ",".join(sorted(owner_uids()))
    return hashlib.sha256((s + extra).encode()).digest()


def make_token(subject: str = "owner") -> str:
    payload = f"{subject}.{int(time.time()) + SESSION_DAYS * 86400}"
    sig = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()
    return f"{payload}.{sig}"


def valid_token(token: str | None) -> bool:
    if mode() == "local":
        return True
    if not token or token.count(".") != 2:
        return False
    subject, expires, sig = token.split(".")
    good = hmac.new(_secret(), f"{subject}.{expires}".encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, good) or not expires.isdigit() or int(expires) < time.time():
        return False
    if mode() == "firebase":
        return subject in owner_uids()
    return subject == "owner"


def _rate_limit(client: str) -> None:
    now = time.time()
    with _lock:
        recent = [t for t in _attempts.get(client, []) if now - t < 900]
        _attempts[client] = recent
        if len(recent) >= 5:
            raise PermissionError("Muitas tentativas. Aguarde 15 minutos.")


def _failed(client: str) -> None:
    with _lock:
        _attempts.setdefault(client, []).append(time.time())


def login(client: str, password_value: str | None = None, id_token: str | None = None) -> str:
    """Confere as credenciais e devolve o token de sessão. Lança PermissionError se recusar."""
    _rate_limit(client)
    m = mode()
    if m == "senha":
        if password_value and hmac.compare_digest(password_value.encode(), (password() or "").encode()):
            return make_token("owner")
        _failed(client)
        raise PermissionError("Senha incorreta")
    if m == "firebase":
        if not id_token:
            _failed(client)
            raise PermissionError("Faça login com e-mail e senha")
        from firebase_admin import auth as fb_auth

        from .store import FirestoreBackend  # garante o firebase_admin inicializado
        FirestoreBackend.ensure_app()
        try:
            claims = fb_auth.verify_id_token(id_token, check_revoked=True)
        except Exception as e:
            _failed(client)
            log.warning("Token do Firebase recusado: %s", e)
            raise PermissionError("Sessão do Firebase inválida; entre novamente")
        uid = claims.get("uid") or claims.get("sub")
        if uid not in owner_uids():
            _failed(client)
            log.warning("Login recusado para UID não autorizado: %s (%s)", uid, claims.get("email"))
            if not owner_uids():
                raise PermissionError(f"Nenhum proprietário configurado. Defina MASON_OWNER_UID = {uid}")
            raise PermissionError("Esta conta não tem acesso ao escritório")
        return make_token(uid)
    return make_token("owner")
