"""Truy vấn phục vụ tầng HTTP trên bốn bảng của ADR-011.

**Không định nghĩa schema.** Hình dạng bảng có đúng một nguồn:
``src/services/persistence.py`` (SQLAlchemy Core, ADR-011 §3.2). Module này chỉ
đọc/ghi trên schema đó bằng ``sqlite3`` thuần cho các đường HTTP đồng bộ.

Vì sao không viết lại ``CREATE TABLE`` ở đây cho tiện: hai định nghĩa cùng trỏ
vào một file ``app.db`` thì ``CREATE TABLE IF NOT EXISTS`` khiến bên nào chạy
trước sẽ thắng, bên còn lại đọc/ghi trên schema không khớp **mà không có lỗi
nào bắn ra**. Đó là loại hỏng chỉ lộ ra ở production, sau khi dữ liệu đã sai.

Ranh giới với ``ScenarioRepository``: repository sở hữu các **transition có
bất biến** (persist một lần sinh, áp một quyết định duyệt) và ép chúng bằng
transaction. Module này phục vụ các truy vấn đọc và các cập nhật tiến độ không
mang bất biến nào.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from src.config import get_settings
from src.models.schemas import ScenarioStatus, VerificationLevel
from src.services.llm import EMBEDDING_MODEL
from src.services.persistence import make_engine, metadata

logger = logging.getLogger(__name__)


def _db_path() -> Path:
    """Đường dẫn file SQLite lấy từ ``settings.database_url``.

    Hard-code ``./data/app.db`` sẽ làm mọi test dùng chung một file với bản dev,
    và làm biến môi trường ``DATABASE_URL`` trở thành lời nói dối.
    """
    url = get_settings().database_url
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        raise RuntimeError(f"db.py chỉ chạy trên SQLite; database_url hiện tại là {url!r}")
    return Path(url[len(prefix) :])


def _get_connection() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Dựng schema từ định nghĩa dùng chung ở ``persistence.py``.

    Cố ý **không** gọi lúc import: import một module không nên đẻ ra file trên
    đĩa. ``scripts/init_db.py`` và fixture của test là chỗ gọi nó.
    """
    metadata.create_all(make_engine(get_settings().database_url))


# ---------------------------------------------------------------------------
# Generation Requests CRUD
# ---------------------------------------------------------------------------


def create_generation_request(
    request_id: str, description_vi: str, validation_mode: str, limit: int = 3, created_by: str = "unknown"
) -> dict:
    conn = _get_connection()
    cursor = conn.cursor()
    now_str = datetime.now(UTC).isoformat()
    req_dict = {
        "request_id": request_id,
        "description_vi": description_vi,
        "validation_mode": validation_mode,
        "created_by": created_by,
        "limit": limit,
        "status": "running",
        "step": "queued",
        "progress": 0,
        "scenario_id": None,
        "error": None,
        "created_at": now_str,
        "updated_at": now_str,
    }
    cursor.execute(
        """
        INSERT OR REPLACE INTO generation_requests
        (request_id, description_vi, created_by, validation_mode, retrieve_limit, status, step,
         progress, scenario_id, issue_history, node_metrics, failed_reason, error, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (
            request_id,
            description_vi,
            created_by,
            validation_mode,
            limit,
            "running",
            "queued",
            0,
            None,
            # NOT NULL ở persistence.py: một lần sinh chưa có issue nào vẫn phải
            # ghi mảng rỗng, để "chưa có lỗi" và "chưa ghi gì" không lẫn vào nhau.
            "[]",
            "{}",
            None,
            None,
            now_str,
            now_str,
        ),
    )
    conn.commit()
    conn.close()
    return req_dict


def get_generation_request(request_id: str) -> dict | None:
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM generation_requests WHERE request_id = ?", (request_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["limit"] = d.get("retrieve_limit") or 3
    return d


def get_request_for_scenario(scenario_id: str) -> dict | None:
    """Lần ngược từ kịch bản về lần sinh ra nó.

    Cần để biết người dùng chọn ``validation_mode`` gì lúc gõ câu — thông tin
    đó sống ở ``generation_requests``, không nhân bản sang ``scenarios``. Một
    kịch bản ứng với đúng một lần sinh, nên không có chuyện nhiều hàng.
    """
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM generation_requests WHERE scenario_id = ? LIMIT 1", (scenario_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_generation_request(request_id: str, **kwargs) -> None:
    conn = _get_connection()
    cursor = conn.cursor()
    now_str = datetime.now(UTC).isoformat()
    kwargs["updated_at"] = now_str

    fields = ", ".join([f"{k} = ?" for k in kwargs.keys()])
    values = list(kwargs.values()) + [request_id]

    cursor.execute(f"UPDATE generation_requests SET {fields} WHERE request_id = ?", values)
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Scenarios CRUD
# ---------------------------------------------------------------------------


def _odd_axis(value: Any) -> str:
    """Một trục ODD về đúng chuỗi enum để ``WHERE`` còn khớp được.

    ADR-013 chốt lọc ODD bằng ``WHERE`` trên bốn cột có index. Ghi vào đó một
    chuỗi ghép kiểu ``"truck:xe container"`` sẽ làm mọi ``WHERE actor_type =
    'truck'`` trượt sạch — retrieval trả rỗng và **không có lỗi nào bắn ra**.
    Phần chi tiết ("xe container") sống trong ``spec.odd.specific_type``.
    """
    if isinstance(value, dict):
        value = value.get("category")
    if value is None:
        return "unknown"
    return str(getattr(value, "value", value))


def get_scenario_count() -> int:
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM scenarios")
    count = cursor.fetchone()[0]
    conn.close()
    return count


def save_scenario(
    scenario_id: str,
    title: str,
    description_vi: str,
    spec: dict,
    odd: dict,
    status: str = "pending_review",
    xosc_content: str = "",
    assumptions: list | None = None,
    tags: list | None = None,
    retrieved_examples: list | None = None,
    validation_mode: str = "fast",
) -> dict:
    conn = _get_connection()
    cursor = conn.cursor()
    now_str = datetime.now(UTC).isoformat()

    rt = _odd_axis(odd.get("road_type"))
    wt = _odd_axis(odd.get("weather"))
    at_str = _odd_axis(odd.get("actor_type"))
    mv_str = _odd_axis(odd.get("maneuver"))

    spec_json = json.dumps(spec, ensure_ascii=False)
    assumptions_json = json.dumps(assumptions or [], ensure_ascii=False)
    tags_json = json.dumps(tags or [], ensure_ascii=False)

    # `embedding` để NULL. ADR-011 §Hệ quả: vector chỉ được ghi trong đúng
    # transaction duyệt BEFORE_LIBRARY. Đó là cách FR-03/FR-11 ("chỉ scenario đã
    # duyệt mới tìm lại được") được thi hành bằng cấu trúc — không có vector thì
    # không lọt vào kết quả retrieval, kể cả khi người viết truy vấn quên
    # `WHERE status = 'approved_library'`.
    cursor.execute(
        """
        INSERT OR REPLACE INTO scenarios
        (scenario_id, status, title, description_vi, spec, xosc_content, assumptions, tags,
         road_type, weather, actor_type, maneuver, verification, embedding, embedding_model, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (
            scenario_id,
            status,
            title,
            description_vi,
            spec_json,
            xosc_content,
            assumptions_json,
            tags_json,
            rt,
            wt,
            at_str,
            mv_str,
            # Mọi kịch bản mới đều chưa chạy CARLA lần nào (ADR-017).
            VerificationLevel.UNVERIFIED.value,
            None,  # embedding — xem ghi chú ADR-011 phía trên
            None,  # embedding_model — ghi cùng lúc với embedding, không sớm hơn
            now_str,
        ),
    )

    conn.commit()
    conn.close()

    sc_dict = {
        "scenario_id": scenario_id,
        "title": title,
        "description_vi": description_vi,
        "status": status,
        "odd": odd,
        "time_of_day": "day",
        "retrieved_examples": retrieved_examples or [],
        "spec": spec,
        "xosc_content": xosc_content,
        "assumptions": assumptions or [],
        "tags": tags or [],
        "review_logs": get_review_decisions(scenario_id),
        "created_at": now_str,
        "validation_mode": validation_mode,
    }
    return sc_dict


def get_scenario(scenario_id: str) -> dict | None:
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM scenarios WHERE scenario_id = ?", (scenario_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None

    row_dict = dict(row)
    spec_obj = json.loads(row_dict["spec"]) if row_dict.get("spec") else {}
    assumptions_obj = json.loads(row_dict["assumptions"]) if row_dict.get("assumptions") else []
    tags_obj = json.loads(row_dict["tags"]) if row_dict.get("tags") else []

    odd_data = spec_obj.get("odd") or {
        "road_type": row_dict.get("road_type"),
        "weather": row_dict.get("weather"),
        "actor_type": row_dict.get("actor_type"),
        "maneuver": row_dict.get("maneuver"),
    }

    sc_dict = {
        "scenario_id": row_dict["scenario_id"],
        "title": row_dict["title"],
        "description_vi": row_dict["description_vi"],
        "status": row_dict["status"],
        "odd": odd_data,
        "time_of_day": spec_obj.get("time_of_day", "day"),
        "retrieved_examples": spec_obj.get("retrieved_examples", []),
        "spec": spec_obj,
        "xosc_content": row_dict.get("xosc_content", ""),
        "assumptions": assumptions_obj,
        "tags": tags_obj,
        "review_logs": get_review_decisions(row_dict["scenario_id"]),
        "created_by": row_dict.get("created_by") or "unknown",
        "verification": row_dict.get("verification") or VerificationLevel.UNVERIFIED.value,
        "created_at": row_dict.get("created_at"),
    }
    return sc_dict


def update_scenario_status(scenario_id: str, new_status: str) -> None:
    """Đổi trạng thái, và **chỉ khi** vào ``approved_library`` mới sinh embedding.

    Điều kiện gắn vào ``new_status`` chứ không gắn vào "embedding đang rỗng".
    Cách cũ — thấy chưa có vector thì sinh — sẽ ghi vector cho cả lần chuyển sang
    ``rejected``, và một kịch bản bị từ chối có vector là một kịch bản bị từ chối
    **vẫn tìm lại được**. Đúng thứ ADR-011 §Hệ quả dựng cơ chế này để chặn.
    """
    conn = _get_connection()
    cursor = conn.cursor()

    blob_bytes: bytes | None = None
    if new_status == ScenarioStatus.APPROVED_LIBRARY.value:
        cursor.execute("SELECT title, description_vi, embedding FROM scenarios WHERE scenario_id = ?", (scenario_id,))
        row = cursor.fetchone()
        if row is not None and not row["embedding"]:
            try:
                from src.services.library.retriever import generate_text_embedding, pack_blob_embedding

                vector = generate_text_embedding(f"{row['title']} {row['description_vi']}")
                if vector is not None and len(vector):
                    blob_bytes = pack_blob_embedding(vector)
            except Exception as exc:
                # Duyệt vẫn phải ăn: trạng thái là quyết định của con người, còn
                # embedding chỉ là chỉ mục. Ghi log rồi đi tiếp — thiếu vector thì
                # kịch bản chưa tìm lại được, chứ không mất.
                logger.warning("Không sinh được embedding cho %s: %s", scenario_id, exc)

    if blob_bytes is not None:
        cursor.execute(
            "UPDATE scenarios SET status = ?, embedding = ?, embedding_model = ? WHERE scenario_id = ?",
            (new_status, blob_bytes, EMBEDDING_MODEL, scenario_id),
        )
    else:
        cursor.execute("UPDATE scenarios SET status = ? WHERE scenario_id = ?", (new_status, scenario_id))

    conn.commit()
    conn.close()


def set_tags(scenario_id: str, tags: list[str]) -> None:
    """Thay toàn bộ tag của một kịch bản."""
    conn = _get_connection()
    try:
        conn.execute(
            "UPDATE scenarios SET tags = ? WHERE scenario_id = ?",
            (json.dumps(tags, ensure_ascii=False), scenario_id),
        )
        conn.commit()
    finally:
        conn.close()


def set_verification(scenario_id: str, level: VerificationLevel) -> None:
    """Ghi mức kiểm chứng suy từ kết quả chạy CARLA.

    Đây là chỗ **đóng vòng lặp**. Trước ADR-017, ``ExecutionResult`` worker gửi
    về chỉ nằm im trong ``scenario_jobs.result``: không gì đọc nó, không gì đổi
    theo nó, retrieval không biết nó tồn tại. Kịch bản chạy ra không đúng ý vẫn
    ở lại thư viện và tiếp tục làm ví dụ few-shot dạy LLM sinh ra thứ tương tự.

    Cố ý **không** đổi ``status``: kịch bản không bị rút khỏi thư viện. Số phận
    nó do người quyết ở cổng 1; đây chỉ là bằng chứng đi kèm.
    """
    conn = _get_connection()
    try:
        conn.execute("UPDATE scenarios SET verification = ? WHERE scenario_id = ?", (level.value, scenario_id))
        conn.commit()
    finally:
        conn.close()


def list_all_scenarios() -> list[dict]:
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT scenario_id FROM scenarios ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    scenarios = []
    for r in rows:
        sc = get_scenario(r["scenario_id"])
        if sc:
            scenarios.append(sc)
    return scenarios


# ---------------------------------------------------------------------------
# Review Decisions CRUD
# ---------------------------------------------------------------------------


def save_review_decision(scenario_id: str, gate: str, approved: bool, reviewer: str, reason: str) -> dict:
    conn = _get_connection()
    cursor = conn.cursor()
    now_str = datetime.now(UTC).isoformat()

    cursor.execute(
        """
        INSERT INTO review_decisions (scenario_id, gate, approved, reviewer, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """,
        (scenario_id, gate, 1 if approved else 0, reviewer, reason, now_str),
    )

    conn.commit()
    conn.close()

    return {
        "scenario_id": scenario_id,
        "gate": gate,
        "approved": approved,
        "reviewer": reviewer,
        "reason": reason,
        "decided_at": now_str,
    }


def get_review_decisions(scenario_id: str) -> list[dict]:
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT scenario_id, gate, approved, reviewer, reason, created_at as decided_at FROM review_decisions WHERE scenario_id = ? ORDER BY id ASC",
        (scenario_id,),
    )
    rows = cursor.fetchall()
    conn.close()
    decisions = []
    for r in rows:
        d = dict(r)
        d["approved"] = bool(d["approved"])
        decisions.append(d)
    return decisions


# ---------------------------------------------------------------------------
# Scenario Jobs CRUD
# ---------------------------------------------------------------------------


def create_scenario_job(job_id: str, scenario_id: str, xosc_content: str) -> dict:
    conn = _get_connection()
    cursor = conn.cursor()
    now_str = datetime.now(UTC).isoformat()
    job_dict = {
        "job_id": job_id,
        "scenario_id": scenario_id,
        "status": "pending",
        "claimed_by": None,
        "claimed_at": None,
        "result": None,
        "xosc_content": xosc_content,
        "created_at": now_str,
        "updated_at": now_str,
    }

    cursor.execute(
        """
        INSERT OR REPLACE INTO scenario_jobs
        (job_id, scenario_id, status, xosc_content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """,
        (job_id, scenario_id, "pending", xosc_content, now_str, now_str),
    )

    conn.commit()
    conn.close()
    return job_dict


def get_pending_jobs() -> list[dict]:
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM scenario_jobs WHERE status = 'pending' ORDER BY created_at ASC")
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_job(job_id: str) -> dict | None:
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM scenario_jobs WHERE job_id = ?", (job_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    if d.get("result"):
        try:
            d["result"] = json.loads(d["result"])
        except Exception:
            pass
    return d


def update_job_result(job_id: str, status: str, result: dict) -> None:
    conn = _get_connection()
    cursor = conn.cursor()
    now_str = datetime.now(UTC).isoformat()
    result_json = json.dumps(result, ensure_ascii=False)

    cursor.execute(
        """
        UPDATE scenario_jobs
        SET status = ?, result = ?, updated_at = ?
        WHERE job_id = ?
    """,
        (status, result_json, now_str, job_id),
    )
    conn.commit()
    conn.close()
