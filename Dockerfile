FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Com o Firebase configurado, os dados ficam no Firestore. Sem ele, num SQLite em /data.
ENV HOST=0.0.0.0 PORT=8000 MASON_DB=/data/mason-local.db PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "run.py"]
