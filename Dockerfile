FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# o banco fica em /data: monte um volume persistente nesse caminho
ENV HOST=0.0.0.0 PORT=8000 MASON_DB=/data/escritorio.db PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "run.py"]
