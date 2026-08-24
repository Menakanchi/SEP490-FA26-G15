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
import time
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

import numpy as np

from src.config import get_settings
from src.models.schemas import odd_axis_value
from src.services.llm import (
    EMBEDDING_COST_PER_MILLION_TOKENS,
    EMBEDDING_DIM,
    EMBEDDING_MODEL,
    get_embeddings,
    record_provider_metric,
)
from src.services.persistence import EMBEDDING_DTYPE, connect_sqlite, encode_embedding, sqlite_path

logger = logging.getLogger(__name__)


def generate_text_embedding(text: str, dim: int = EMBEDDING_DIM) -> np.ndarray:
    """Sinh vector Float32 (1536 chiều) cho văn bản.

    Thử gọi OpenAI Embeddings Service (text-embedding-3-small).
    Nếu offline hoặc không có API key, sinh vector chuẩn hóa từ hash văn bản
    (deterministic fallback cho unit test chạy offline).
    """
    if not text or not text.strip():
        return np.zeros(dim, dtype=np.float32)

    embedder = get_embeddings()
    if embedder:
        try:
            started = time.perf_counter()
            vec_list = embedder.embed_query(text)
            latency = time.perf_counter() - started
            # LangChain chỉ trả vector, không chuyển tiếp ``usage`` của
            # Embeddings API. Token ở đây vì thế là estimate có nhãn rõ; latency
            # vẫn là wall-clock thật. Phần chat phía trên dùng usage thật.
            estimated_tokens = max(1, len(text) // 4)
            record_provider_metric(
                kind="embedding",
                operation="retrieve_embedding",
                model=EMBEDDING_MODEL,
                attempt=0,
                escalated=False,
                latency_s=round(latency, 6),
                input_tokens=estimated_tokens,
                cached_input_tokens=0,
                output_tokens=0,
                cost_usd=round(estimated_tokens * EMBEDDING_COST_PER_MILLION_TOKENS / 1_000_000, 9),
                token_source="estimated_chars_div_4",
            )
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


def pack_blob_embedding(vector: np.ndarray) -> bytes:
    """Vector -> BLOB. Chỉ là bí danh của codec dùng chung, để chỗ gọi đọc xuôi."""
    return encode_embedding(vector.tolist())


def unpack_blob_embedding(blob: bytes | None) -> np.ndarray | None:
    """BLOB -> vector float32, hoặc ``None`` nếu hàng chưa có embedding.

    Dùng ``np.frombuffer`` thay vì ``persistence.decode_embedding`` **chỉ vì tốc
    độ**: nó tạo view trên đúng bộ nhớ đó, không dựng tuple Python trung gian.
    Định dạng thì vẫn là một — ``EMBEDDING_DTYPE`` lấy thẳng từ persistence, và
    ``test_embedding_codec_has_one_definition`` ghim hai đường phải khớp nhau.
    """
    if not blob:
        return None
    try:
        arr = np.frombuffer(blob, dtype=EMBEDDING_DTYPE)
    except (ValueError, TypeError) as exc:
        logger.warning("BLOB embedding hỏng, bỏ qua hàng này: %s", exc)
        return None
    return arr if len(arr) else None


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


def _default_db_path() -> Path:
    """Đường dẫn SQLite lấy từ ``settings.database_url`` — một nguồn duy nhất."""
    return sqlite_path(get_settings().database_url, caller="SQLiteRetriever")


# Cổng trạng thái (ADR-011 / FR-03 / FR-11). Điều kiện `embedding IS NOT NULL`
# không thừa: nó là **hàng rào thứ hai**, và là hàng rào không quên được.
# `embedding` chỉ được ghi trong transaction duyệt BEFORE_LIBRARY, nên kịch bản
# chưa duyệt không có vector — dù ai đó về sau lỡ xoá mất mệnh đề `status` thì
# nó vẫn không lọt ra.
_STATUS_GATE = "status = 'approved_library' AND embedding IS NOT NULL"

_ROW_COLUMNS = "scenario_id, title, description_vi, road_type, weather, actor_type, maneuver, embedding"

_ODD_FILTER_AXES = ("road_type", "weather", "actor_type", "maneuver")

_EMPTY_AXIS_VALUES = frozenset({"unknown", "none", ""})


def _odd_filter_value(raw: Any) -> str | None:
    """Giá trị một trục ODD để đưa vào ``WHERE``, hoặc ``None`` nếu không lọc theo nó.

    Nhận cả hai hình dạng mà trục ODD đi tới: chuỗi enum thuần, và object
    ``{"category": ...}`` của ``parsed_intent``. Sentinel rỗng (``"unknown"``,
    ``"none"``) không phải giá trị lọc — lọc theo nó là chắc chắn trả rỗng.
    """
    value = odd_axis_value(raw, "")
    return None if value.lower() in _EMPTY_AXIS_VALUES else value


class BaseRetriever(ABC):
    """Abstract Retriever Interface cho việc truy vấn kịch bản mẫu."""

    @abstractmethod
    def retrieve(self, query_text: str, odd_query: Any = None, limit: int = 3) -> list[dict]:
        """Truy vấn Top-K kịch bản mẫu từ Library."""
        pass


class SQLiteRetriever(BaseRetriever):
    """SQLite Retriever theo ADR-013 (Pre-filtering SQL WHERE + BLOB Embedding + NumPy Cosine)."""

    def __init__(self, db_path: str | Path | None = None):
        """Mặc định đọc đúng database mà mọi thứ khác đang ghi vào.

        Bản trước hard-code ``./data/app.db``, bỏ qua ``settings.database_url``.
        Hỏng theo kiểu tệ nhất: retrieval **luôn trả rỗng** mà không có lỗi nào —
        node vẫn chạy, workflow vẫn đi tiếp, chỉ là không bao giờ có few-shot.
        Trong test dùng DB tạm thì nó rỗng 100% và không ai thấy gì bất thường.
        """
        self.db_path = Path(db_path) if db_path else _default_db_path()

    def _get_connection(self) -> sqlite3.Connection | None:
        if not self.db_path.exists():
            return None
        try:
            return connect_sqlite(self.db_path)
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

            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name = 'scenarios'")
            if cursor.fetchone() is None:
                conn.close()
                return []

            odd_filter = self._extract_odd_dict(odd_query)

            # Cổng trạng thái viết ĐÚNG MỘT LẦN. Trước đây chuỗi này được gõ hai
            # lần — một lần cho truy vấn có lọc ODD, một lần cho truy vấn nới —
            # nên sửa cổng ở một chỗ mà quên chỗ kia sẽ để kịch bản chưa duyệt
            # lọt ra qua đúng nhánh dự phòng, im lặng.
            where_clauses: list[str] = [_STATUS_GATE]
            params: list[Any] = []

            # ODD Pre-filtering WHERE clause (ADR-013). Bốn trục dùng chung một
            # phép so; viết rời từng trục thì lần thứ năm thêm trục là chép lại
            # lần thứ năm, và lần chép nào cũng có thể quên `LIKE`.
            for axis in _ODD_FILTER_AXES:
                value = _odd_filter_value(odd_filter.get(axis))
                if value is None:
                    continue
                where_clauses.append(f"({axis} = ? OR {axis} LIKE ?)")
                params.extend([value, f"%{value}%"])

            cursor.execute(f"SELECT {_ROW_COLUMNS} FROM scenarios WHERE {' AND '.join(where_clauses)}", params)
            rows = cursor.fetchall()

            # Lọc ODD không khớp gì thì nới ra, chỉ giữ cổng trạng thái: vài ví
            # dụ khác ô còn hơn few-shot rỗng. Cổng trạng thái thì **không** nới.
            if not rows:
                cursor.execute(f"SELECT {_ROW_COLUMNS} FROM scenarios WHERE {_STATUS_GATE}")
                rows = cursor.fetchall()

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

                candidates.append(
                    {
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
                    }
                )

            conn.close()

            # Sắp xếp các candidates theo Cosine Similarity giảm dần
            candidates.sort(key=lambda x: x["similarity_score"], reverse=True)

            return candidates[:limit]

        except Exception as exc:
            logger.warning(f"Lỗi khi thực thi SQLiteRetriever.retrieve: {exc}")
            if conn:
                conn.close()
            return []
