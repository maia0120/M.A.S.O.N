"""Inicia o escritório virtual: python run.py  →  abra http://localhost:8000"""
import os
import sys

import uvicorn

if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    if os.environ.get("FIREBASE_WEB_API_KEY") and not os.environ.get("FIRESTORE_EMULATOR_HOST"):
        from mason.store import service_account
        if not service_account():
            sys.exit("Login Firebase ativado, mas falta a credencial do servidor (FIREBASE_SERVICE_ACCOUNT "
                     "ou o arquivo secreto firebase-service-account.json). Sem ela os dados não seriam salvos.")
    if host not in ("127.0.0.1", "localhost"):
        if os.environ.get("FIREBASE_WEB_API_KEY"):
            if not os.environ.get("MASON_OWNER_UID"):
                print("Aviso: MASON_OWNER_UID não definido; ninguém conseguirá entrar até você defini-lo.", file=sys.stderr)
        elif not os.environ.get("MASON_PASSWORD"):
            sys.exit("Configure o login (Firebase ou MASON_PASSWORD) antes de abrir o escritório para a internet.")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Aviso: ANTHROPIC_API_KEY não definida; os agentes não vão funcionar.", file=sys.stderr)
    uvicorn.run("mason.server:app", host=host, port=int(os.environ.get("PORT", "8000")),
                proxy_headers=True, forwarded_allow_ips="*")
