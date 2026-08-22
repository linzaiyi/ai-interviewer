import json
import os
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from app.core.config import get_settings

settings = get_settings()

# 使用 sentence-transformers 生成 embedding（轻量级多语言模型）
_embedding_model = None


def get_embedding_model():
    global _embedding_model
    if _embedding_model is None:
        try:
            _embedding_model = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
        except Exception as e:
            print(f"RAG: embedding model load failed (RAG disabled): {e}", flush=True)
            return None
    return _embedding_model


def _get_index_path(position: str) -> str:
    """获取岗位对应的 FAISS 索引文件路径"""
    os.makedirs(settings.faiss_index_dir, exist_ok=True)
    safe_name = position.replace(" ", "_").lower()
    return os.path.join(settings.faiss_index_dir, f"questions_{safe_name}.faiss")


def _get_metadata_path(position: str) -> str:
    """获取岗位对应的元数据文件路径"""
    os.makedirs(settings.faiss_index_dir, exist_ok=True)
    safe_name = position.replace(" ", "_").lower()
    return os.path.join(settings.faiss_index_dir, f"questions_{safe_name}_meta.json")


def index_questions(position: str, questions: list[dict]):
    """将题目入库到向量数据库"""
    model = get_embedding_model()
    documents = [q["content"] for q in questions]

    # 生成 embeddings（归一化后用内积等价于余弦相似度）
    embeddings = model.encode(documents, normalize_embeddings=True)

    # 创建 FAISS 索引
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings.astype(np.float32))

    # 保存索引
    faiss.write_index(index, _get_index_path(position))

    # 保存元数据
    metadatas = [
        {
            "content": q.get("content", ""),
            "ability_dimension": q.get("ability_dimension", ""),
            "difficulty": q.get("difficulty", "medium"),
            "reference_answer": q.get("reference_answer", ""),
        }
        for q in questions
    ]
    with open(_get_metadata_path(position), "w", encoding="utf-8") as f:
        json.dump(metadatas, f, ensure_ascii=False, indent=2)


def search_questions(position: str, query: str, n_results: int = 5) -> list[dict]:
    """根据语义检索相关题目"""
    index_path = _get_index_path(position)
    metadata_path = _get_metadata_path(position)

    if not os.path.exists(index_path) or not os.path.exists(metadata_path):
        return []

    try:
        # 加载索引和元数据
        index = faiss.read_index(index_path)
        with open(metadata_path, "r", encoding="utf-8") as f:
            metadatas = json.load(f)

        # 生成查询 embedding
        model = get_embedding_model()
        if model is None:
            return []
        query_embedding = model.encode([query], normalize_embeddings=True)

        # 搜索
        n_results = min(n_results, len(metadatas))
        distances, indices = index.search(query_embedding.astype(np.float32), n_results)

        results = []
        for i, idx in enumerate(indices[0]):
            if idx < len(metadatas):
                meta = metadatas[idx].copy()
                meta["score"] = float(distances[0][i])
                results.append(meta)

        return results
    except Exception as e:
        print(f"search_questions failed: {e}", flush=True)
        return []