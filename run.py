"""Inicia o escritório virtual: python run.py  →  abra http://localhost:8000"""
import os
import sys

import uvicorn

if __name__ == "__main__":
    host = os.environ.get("HOST", "127.0.0.1")
    if host not in ("127.0.0.1", "localhost") and not os.environ.get("MASON_PASSWORD"):
        sys.exit("Defina MASON_PASSWORD antes de abrir o escritório para a rede/internet.")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Aviso: ANTHROPIC_API_KEY não definida; os agentes não vão funcionar.", file=sys.stderr)
    uvicorn.run("mason.server:app", host=host, port=int(os.environ.get("PORT", "8000")),
                proxy_headers=True, forwarded_allow_ips="*")
