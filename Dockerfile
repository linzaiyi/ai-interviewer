FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/requirements.txt

# 全部走清华源，稳定可靠
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple && \
    pip install --no-cache-dir torch -i https://pypi.tuna.tsinghua.edu.cn/simple && \
    pip install --no-cache-dir sentence-transformers==3.2.0 -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY backend/ /app/

# 预下载 sentence-transformers 模型（构建时下载，避免运行时网络问题）
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')"

# 预建 FAISS 索引（构建时内存充足，避免运行时 OOM）
RUN python -m app.build_faiss

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]