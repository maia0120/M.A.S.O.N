"""Teste com os emuladores do Firebase (Auth + Firestore).

Rode antes:  firebase emulators:start --only auth,firestore --project demo-mason
"""
import json
import os
import sys
import time
import urllib.request

os.environ.update(FIRESTORE_EMULATOR_HOST="127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099",
                  FIREBASE_PROJECT_ID="demo-mason", FIREBASE_WEB_API_KEY="demo-key", MASON_DISABLE_WORKER="1")
os.environ.pop("MASON_PASSWORD", None)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def post(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def emu_user(email, pw):
    # cria a conta direto no emulador (como o dono faz pelo console do Firebase)
    base = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts"
    st, r = post(f"{base}:signUp?key=demo-key", {"email": email, "password": pw, "returnSecureToken": True})
    if st != 200:
        st, r = post(f"{base}:signInWithPassword?key=demo-key", {"email": email, "password": pw, "returnSecureToken": True})
    return r["localId"], r["idToken"]


owner_uid, owner_token = emu_user("dono@exemplo.com", "senha-forte-1")
other_uid, other_token = emu_user("intruso@exemplo.com", "senha-forte-2")
os.environ["MASON_OWNER_UID"] = owner_uid

from fastapi.testclient import TestClient  # noqa: E402

from mason import db  # noqa: E402
from mason.server import app  # noqa: E402


def test_rules_block_direct_access():
    # mesmo logado, ninguém lê ou grava o Firestore direto: só o servidor (Admin SDK)
    url = "http://127.0.0.1:8080/v1/projects/demo-mason/databases/(default)/documents/tasks"
    for tok in (owner_token, other_token, None):
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {tok}"} if tok else {})
        try:
            urllib.request.urlopen(req)
            raise AssertionError("leitura direta deveria ser bloqueada")
        except urllib.error.HTTPError as e:
            assert e.code == 403, e.code
    print("OK regras bloqueiam acesso direto")


def test_login_and_data():
    with TestClient(app) as c:
        s = c.get("/api/session").json()
        assert s["mode"] == "firebase" and not s["logged_in"] and s["firebase"]["apiKey"] == "demo-key"
        assert c.get("/api/overview").status_code == 401
        r = c.post("/api/login", json={"id_token": other_token})
        assert r.status_code == 401 and "não tem acesso" in r.json()["detail"], r.json()
        assert c.post("/api/login", json={"id_token": "lixo"}).status_code == 401
        assert c.post("/api/login", json={"password": "qualquer"}).status_code == 401
        r = c.post("/api/login", json={"id_token": owner_token})
        assert r.status_code == 200, r.json()
        assert c.get("/api/overview").status_code == 200

        tid = db.create_task(f"Teste {time.time()}", "desc", "pesquisa", "mason", "alta", 2)
        db.add_update(tid, "pesquisa_lead", "progresso", "metade")
        db.set_task_status(tid, "concluida", "mason", result="pronto")
        db.save_memory("geral", "produto", "MASON", "mason")
        db.append_conversation("mason:teste", "user", "oi")
        db.append_conversation("mason:teste", "assistant", [{"type": "text", "text": "olá"}])
        db.set_setting("auto_review", "1")

        # recarrega tudo do Firestore, como num reinício do servidor
        db.init_db()
        t = db.get_task(tid)
        assert t["status"] == "concluida" and t["result"] == "pronto" and t["due_at"]
        assert [u["content"] for u in t["updates"]][1] == "metade"
        assert db.search_memory("mason", None)[0]["key"] == "produto"
        assert db.load_conversation("mason:teste")[1]["content"][0]["text"] == "olá"
        assert db.get_setting("auto_review") == "1"
        assert db.create_task("x", "y", "comercial", "mason") == tid + 1  # contador atômico
        assert any(x["id"] == tid for x in db.overview()["recent_done"])
    print("OK login Firebase + dados no Firestore")


if __name__ == "__main__":
    test_rules_block_direct_access()
    test_login_and_data()
