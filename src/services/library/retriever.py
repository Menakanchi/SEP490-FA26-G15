"""src/services/library/retriever.py — Abstract Retriever Interface & SQLite BLOB Implementation (ADR-013, ADR-006, ADR-011).

Thiết kế:
  1. BaseRetriever (ABC): Class trừu tượng cho mọi dịch vụ Retrieve kịch bản mẫu.
  2. SQLiteRetriever: Implement tìm kiếm kịch bản trên SQLite bằng Pre-filtering SQL WHERE + NumPy Cosine Similarity trên cột BLOB embedding.
  3. Seamless Embedding Service: Sử dụng OpenAI text-embedding-3-small (1536 chiều) qua src.services.llm (có deterministic fallback cho offline test).
"""

from __future__ import annotations

import hashlib
import json
import logging
import sqlite3
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import numpy as np

from src.services.llm import get_embeddings

logger = logging.getLogger(__name__)


def generate_text_embedding(text: str, dim: int = 1536) -> np.ndarray:
    """Sinh vector Float32 (1536 chiều) cho văn bản.
    
    Thử gọi OpenAI Embeddings Service (text-embedding-3-small).
    Nếu offline hoặc không có API key, sinh vector chuẩn hóa từ hash văn bản (deterministic fallback cho unit tests).
    """
    if not text or not text.strip():
        return np.zeros(dim, dtype=np.float32)

    embedder = get_embeddings()
    if embedder:
        try:
            vec_list = embedder.embed_query(text)
            vec = np.array(vec_list, dtype=np.float32)
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            return vec
        except Exception as exc:
            logger.warning(f"Lỗi khi gọi OpenAI Embeddings API: {exc}")

    # Fallback deterministic generator cho local dev & unit test offline
    seed_bytes = hashlib.sha256(text.encode("utf-8")).digest()
    seed_int = int.from_bytes(seed_bytes[:4], "big")
    rng = np.random.RandomState(seed_int)
    raw_vec = rng.randn(dim).astype(np.float32)
    norm = np.linalg.norm(raw_vec)
    return raw_vec / norm if norm > 0 else raw_vec


def unpack_blob_embedding(blob: bytes | None, expected_dim: int = 1536) -> np.ndarray | None:
    """Giải mã BLOB byte stream từ SQLite thành NumPy float32 vector."""
    if not blob:
        return None
    try:
        arr = np.frombuffer(blob, dtype=np.float32)
        if len(arr) == 0:
            return None
        return arr
    except Exception:
        return None


def compute_cosine_similarity(v1: np.ndarray, v2: np.ndarray) -> float:
    """Tính Cosine Similarity giữa 2 numpy float32 vectors."""
    if v1 is None or v2 is None or len(v1) == 0 or len(v2) == 0:
        return 0.0
    norm1 = np.linalg.norm(v1)
    norm2 = np.linalg.norm(v2)
    if norm1 == 0 or norm2 == 0:
        return 0.0
    dot = float(np.dot(v1, v2))
    sim = dot / (norm1 * norm2)
    return float(np.clip(sim, 0.0, 1.0))


class BaseRetriever(ABC):
    """Abstract Retriever Interface cho việc truy vấn kịch bản mẫu."""

    @abstractmethod
    def retrieve(self, query_text: str, odd_query: Any = None, limit: int = 3) -> list[dict]:
        """Truy vấn Top-K kịch bản mẫu từ Library."""
        pass


class SQLiteRetriever(BaseRetriever):
    """SQLite Retriever theo ADR-013 (Pre-filtering SQL WHERE + BLOB Embedding + NumPy Cosine)."""

    def __init__(self, db_path: str | Path | None = None):
        self.db_path = Path(db_path or "./data/app.db")

    def _get_connection(self) -> sqlite3.Connection | None:
        if not self.db_path.exists():
            return None
        try:
            conn = sqlite3.connect(str(self.db_path))
            conn.row_factory = sqlite3.Row
            return conn
        except Exception as exc:
            logger.warning(f"Không thể kết nối tới SQLite DB tại {self.db_path}: {exc}")
            return None

    def _extract_odd_dict(self, odd_query: Any) -> dict:
        """Trích xuất dictionary từ ODDQuery / dict."""
        if not odd_query:
            return {}
        if hasattr(odd_query, "as_filter"):
            try:
                filter_dict = odd_query.as_filter()
                if isinstance(filter_dict, dict):
                    return filter_dict
            except Exception:
                pass
        if isinstance(odd_query, dict):
            return odd_query

        res = {}
        for axis in ("road_type", "weather", "actor_type", "maneuver"):
            val = getattr(odd_query, axis, None)
            if val is not None:
                if hasattr(val, "value"):
                    res[axis] = str(val.value)
                elif hasattr(val, "category"):
                    res[axis] = str(getattr(val, "category"))
                else:
                    res[axis] = str(val)
        return res

    def retrieve(self, query_text: str, odd_query: Any = None, limit: int = 3) -> list[dict]:
        """Lọc SQL WHERE theo ODD & status gate 'approved_library', sau đó xếp hạng bằng Cosine Sim NumPy."""
        conn = self._get_connection()
        if not conn:
            return []

        try:
            cursor = conn.cursor()

            # Kiểm tra xem bảng scenarios hay scenarios_seed đang tồn tại
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('scenarios', 'scenarios_seed')")
            existing_tables = [row["name"] for row in cursor.fetchall()]

            if not existing_tables:
                conn.close()
                return []

            target_table = "scenarios" if "scenarios" in existing_tables else "scenarios_seed"

            odd_filter = self._extract_odd_dict(odd_query)
            
            # Xây dựng câu truy vấn SQL Pre-filtering
            where_clauses: list[str] = []
            params: list[Any] = []

            # 1. Status Gate (ADR-011): Chỉ truy vấn kịch bản đã qua duyệt library hoặc seed
            if target_table == "scenarios":
                where_clauses.append("(status IN ('approved_library', 'seed') AND embedding IS NOT NULL)")
            else:
                where_clauses.append("embedding IS NOT NULL")

            # 2. ODD Pre-filtering WHERE clause (ADR-013)
            road_type = odd_filter.get("road_type")
            if road_type and str(road_type).lower() not in ("unknown", "none", ""):
                where_clauses.append("(road_type = ? OR road_type LIKE ?)")
                params.extend([str(road_type), f"%{road_type}%"])

            weather = odd_filter.get("weather")
            if weather and str(weather).lower() not in ("unknown", "none", ""):
                where_clauses.append("(weather = ? OR weather LIKE ?)")
                params.extend([str(weather), f"%{weather}%"])

            actor_type = odd_filter.get("actor_type")
            if isinstance(actor_type, dict):
                actor_cat = actor_type.get("category")
            else:
                actor_cat = str(actor_type) if actor_type else None

            if actor_cat and str(actor_cat).lower() not in ("unknown", "none", ""):
                where_clauses.append("(actor_type = ? OR actor_type LIKE ?)")
                params.extend([str(actor_cat), f"%{actor_cat}%"])

            maneuver = odd_filter.get("maneuver")
            if isinstance(maneuver, dict):
                man_cat = maneuver.get("category")
            else:
                man_cat = str(maneuver) if maneuver else None

            if man_cat and str(man_cat).lower() not in ("unknown", "none", ""):
                where_clauses.append("(maneuver = ? OR maneuver LIKE ?)")
                params.extend([str(man_cat), f"%{man_cat}%"])

            where_sql = " AND ".join(where_clauses)
            if target_table == "scenarios":
                sql = f"SELECT scenario_id, title, description_vi, road_type, weather, actor_type, maneuver, embedding FROM scenarios WHERE {where_sql}"
            else:
                sql = f"SELECT scenario_id, title, description_vi, road_type, weather, actor_type, maneuver, embedding_json, embedding FROM scenarios_seed WHERE {where_sql}"

            cursor.execute(sql, params)
            rows = cursor.fetchall()

            # Bước 2: Nối lỏng filter (Relaxed Pre-filtering) nếu nới hẹp 100% ODD trả về 0 bản ghi
            if not rows and len(where_clauses) > 2:
                relaxed_clauses = [where_clauses[0]]  # Giữ Status Gate
                relaxed_params = []
                
                # Chỉ lọc theo actor_type hoặc maneuver
                if actor_cat and str(actor_cat).lower() not in ("unknown", "none", ""):
                    relaxed_clauses.append("(actor_type = ? OR actor_type LIKE ?)")
                    relaxed_params.extend([str(actor_cat), f"%{actor_cat}%"])
                elif man_cat and str(man_cat).lower() not in ("unknown", "none", ""):
                    relaxed_clauses.append("(maneuver = ? OR maneuver LIKE ?)")
                    relaxed_params.extend([str(man_cat), f"%{man_cat}%"])

                if len(relaxed_clauses) > 1:
                    relaxed_sql_str = " AND ".join(relaxed_clauses)
                    if target_table == "scenarios":
                        rel_sql = f"SELECT scenario_id, title, description_vi, road_type, weather, actor_type, maneuver, embedding FROM scenarios WHERE {relaxed_sql_str}"
                    else:
                        rel_sql = f"SELECT scenario_id, title, description_vi, road_type, weather, actor_type, maneuver, embedding_json, embedding FROM scenarios_seed WHERE {relaxed_sql_str}"
                    cursor.execute(rel_sql, relaxed_params)
                    rows = cursor.fetchall()

            # NẾU PRE-FILTERING KHÔNG KHỚP BẤT KỲ KỊCH BẢN NÀO:
            # Trả về [] để Node 3 (generate_draft) chạy ở chế độ Zero-Shot mượt mà
            if not rows:
                conn.close()
                return []

            # Sinh Vector Query Embedding (OpenAI text-embedding-3-small)
            query_vec = generate_text_embedding(query_text)

            candidates = []
            for row in rows:
                sc_id = row["scenario_id"]
                title = row["title"]
                desc = row["description_vi"]
                r_type = row["road_type"]
                w_type = row["weather"]
                a_type = row["actor_type"]
                m_type = row["maneuver"]

                # Lấy BLOB embedding từ DB
                raw_blob = row["embedding"] if "embedding" in row.keys() else None
                row_vec = unpack_blob_embedding(raw_blob)

                # Fallback nếu row cũ lưu dưới dạng embedding_json text
                if row_vec is None and "embedding_json" in row.keys() and row["embedding_json"]:
                    try:
                        emb_arr = json.loads(row["embedding_json"])
                        row_vec = np.array(emb_arr, dtype=np.float32)
                    except Exception:
                        row_vec = None

                sim_score = 0.0
                if row_vec is not None and len(row_vec) > 0:
                    sim_score = compute_cosine_similarity(query_vec, row_vec)
                else:
                    # Text overlap Fallback nếu chưa có vector
                    words = set(query_text.lower().split())
                    target_text = f"{title} {desc}".lower()
                    matches = sum(1 for w in words if len(w) > 1 and w in target_text)
                    sim_score = min(1.0, 0.5 + (matches * 0.1))

                candidates.append({
                    "id": sc_id,
                    "title": title,
                    "content": desc or title,
                    "description_vi": desc,
                    "metadata": {
                        "scenario_id": sc_id,
                        "road_type": str(r_type or ""),
                        "weather": str(w_type or ""),
                        "actor_type": str(a_type or ""),
                        "maneuver": str(m_type or ""),
                    },
                    "similarity_score": round(float(sim_score), 2),
                })

            conn.close()

            # Sắp xếp các candidates theo Cosine Similarity giảm dần
            candidates.sort(key=lambda x: x["similarity_score"], reverse=True)

            return candidates[:limit]

        except Exception as exc:
            logger.warning(f"Lỗi khi thực thi SQLiteRetriever.retrieve: {exc}")
            if conn:
                conn.close()
            return []
