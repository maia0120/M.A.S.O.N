"""Testa login e rotas do servidor (sem chamar a API real)."""
import os
import sys
import tempfile

os.environ["MASON_DB"] = os.path.join(tempfile.mkdtemp(), "s.db")
os.environ["MASON_PASSWORD"] = "segredo-123"
os.environ["MASON_DISABLE_WORKER"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient  # noqa: E402

from mason.server import app  # noqa: E402


def test_login():
    with TestClient(app) as c:
        assert c.get("/").status_code == 200
        assert c.get("/manifest.webmanifest").status_code == 200
        assert c.get("/api/overview").status_code == 401
        s = c.get("/api/session").json(); assert s["logged_in"] is False and s["mode"] == "senha"
        assert c.post("/api/login", json={"password": "errada"}).status_code == 401
        r = c.post("/api/login", json={"password": "segredo-123"})
        assert r.status_code == 200 and "mason_session" in r.cookies
        assert c.get("/api/overview").status_code == 200
        assert c.get("/api/chat").json()["busy"] is False
        c.post("/api/logout")
        c.cookies.clear()
        assert c.get("/api/overview").status_code == 401
        c.cookies.set("mason_session", "9999999999.falso")
        assert c.get("/api/overview").status_code == 401
        for _ in range(4):
            c.post("/api/login", json={"password": "x"})
        assert c.post("/api/login", json={"password": "segredo-123"}).status_code == 429
    print("OK login")


if __name__ == "__main__":
    test_login()
