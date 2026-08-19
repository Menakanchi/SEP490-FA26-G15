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
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from src.config import get_settings
from src.models.schemas import ScenarioStatus, VerificationLevel, odd_axis_value
from src.services.llm import EMBEDDING_MODEL
from src.services.persistence import connect_sqlite, make_engine, metadata, sqlite_path

logger = logging.getLogger(__name__)


def _db_path() -> Path:
    """Đường dẫn file SQLite lấy từ ``settings.database_url``.

    Hard-code ``./data/app.db`` sẽ làm mọi test dùng chung một file với bản dev,
    và làm biến môi trường ``DATABASE_URL`` trở thành lời nói dối.
    """
    return sqlite_path(get_settings().database_url, caller="db.py")


def _get_connection() -> sqlite3.Connection:
    path = _db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    return connect_sqlite(path)


@contextmanager
def _cursor(*, commit: bool = False) -> Iterator[sqlite3.Cursor]:
    """Mở kết nối, trả cursor, **luôn** đóng lại. Commit khi được yêu cầu.

    Mười lăm hàm trong file này từng lặp lại đúng bốn dòng
    ``connect / cursor / commit / close``, và lặp theo **hai** kiểu khác nhau:
    phần lớn gọi ``conn.close()`` ở cuối thân hàm, vài hàm dùng ``try/finally``.
    Kiểu thứ nhất rò kết nối ngay khi có exception ở giữa — trên SQLite điều đó
    nghĩa là file còn bị khoá, và triệu chứng ("database is locked") hiện ra ở
    một request khác chứ không ở chỗ hỏng.

    Một chỗ định nghĩa thì cả hai kiểu thành một, và ``finally`` không quên được.
    """
    conn = _get_connection()
    try:
        yield conn.cursor()
        if commit:
            conn.commit()
    finally:
        conn.close()


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
    with _cursor(commit=True) as cursor:
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
    return req_dict


def get_generation_request(request_id: str) -> dict | None:
    with _cursor() as cursor:
        cursor.execute("SELECT * FROM generation_requests WHERE request_id = ?", (request_id,))
        row = cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    d["limit"] = d.get("retrieve_limit") or 3
    return d


def update_generation_request(request_id: str, **kwargs) -> None:
    kwargs["updated_at"] = datetime.now(UTC).isoformat()

    fields = ", ".join([f"{k} = ?" for k in kwargs.keys()])
    values = list(kwargs.values()) + [request_id]

    with _cursor(commit=True) as cursor:
        cursor.execute(f"UPDATE generation_requests SET {fields} WHERE request_id = ?", values)


# ---------------------------------------------------------------------------
# Scenarios CRUD
# ---------------------------------------------------------------------------


def get_scenario_count() -> int:
    with _cursor() as cursor:
        cursor.execute("SELECT COUNT(*) FROM scenarios")
        return int(cursor.fetchone()[0])


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
    now_str = datetime.now(UTC).isoformat()

    # ADR-013 lọc ODD bằng ``WHERE`` trên bốn cột có index, nên bốn cột đó phải
    # giữ đúng chuỗi enum. Chi tiết theo lời người dùng sống trong
    # ``spec.odd.specific_type``, không ghép vào đây.
    rt = odd_axis_value(odd.get("road_type"))
    wt = odd_axis_value(odd.get("weather"))
    at_str = odd_axis_value(odd.get("actor_type"))
    mv_str = odd_axis_value(odd.get("maneuver"))

    spec_json = json.dumps(spec, ensure_ascii=False)
    assumptions_json = json.dumps(assumptions or [], ensure_ascii=False)
    tags_json = json.dumps(tags or [], ensure_ascii=False)

    # `embedding` để NULL. ADR-011 §Hệ quả: vector chỉ được ghi trong đúng
    # transaction duyệt BEFORE_LIBRARY. Đó là cách FR-03/FR-11 ("chỉ scenario đã
    # duyệt mới tìm lại được") được thi hành bằng cấu trúc — không có vector thì
    # không lọt vào kết quả retrieval, kể cả khi người viết truy vấn quên
    # `WHERE status = 'approved_library'`.
    with _cursor(commit=True) as cursor:
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
    with _cursor() as cursor:
        cursor.execute("SELECT * FROM scenarios WHERE scenario_id = ?", (scenario_id,))
        row = cursor.fetchone()
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
    with _cursor(commit=True) as cursor:
        blob_bytes: bytes | None = None
        if new_status == ScenarioStatus.APPROVED_LIBRARY.value:
            cursor.execute(
                "SELECT title, description_vi, embedding FROM scenarios WHERE scenario_id = ?", (scenario_id,)
            )
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


def set_tags(scenario_id: str, tags: list[str]) -> None:
    """Thay toàn bộ tag của một kịch bản."""
    with _cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE scenarios SET tags = ? WHERE scenario_id = ?",
            (json.dumps(tags, ensure_ascii=False), scenario_id),
        )


def set_verification(scenario_id: str, level: VerificationLevel) -> None:
    """Ghi mức kiểm chứng suy từ kết quả chạy CARLA.

    Đây là chỗ **đóng vòng lặp**. Trước ADR-017, ``ExecutionResult`` worker gửi
    về chỉ nằm im trong ``scenario_jobs.result``: không gì đọc nó, không gì đổi
    theo nó, retrieval không biết nó tồn tại. Kịch bản chạy ra không đúng ý vẫn
    ở lại thư viện và tiếp tục làm ví dụ few-shot dạy LLM sinh ra thứ tương tự.

    Cố ý **không** đổi ``status``: kịch bản không bị rút khỏi thư viện. Số phận
    nó do người quyết ở cổng 1; đây chỉ là bằng chứng đi kèm.
    """
    with _cursor(commit=True) as cursor:
        cursor.execute("UPDATE scenarios SET verification = ? WHERE scenario_id = ?", (level.value, scenario_id))


def list_all_scenarios() -> list[dict]:
    with _cursor() as cursor:
        cursor.execute("SELECT scenario_id FROM scenarios ORDER BY created_at DESC")
        rows = cursor.fetchall()
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
    now_str = datetime.now(UTC).isoformat()

    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
        INSERT INTO review_decisions (scenario_id, gate, approved, reviewer, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """,
            (scenario_id, gate, 1 if approved else 0, reviewer, reason, now_str),
        )

    return {
        "scenario_id": scenario_id,
        "gate": gate,
        "approved": approved,
        "reviewer": reviewer,
        "reason": reason,
        "decided_at": now_str,
    }


def get_review_decisions(scenario_id: str) -> list[dict]:
    with _cursor() as cursor:
        cursor.execute(
            "SELECT scenario_id, gate, approved, reviewer, reason, created_at as decided_at "
            "FROM review_decisions WHERE scenario_id = ? ORDER BY id ASC",
            (scenario_id,),
        )
        rows = cursor.fetchall()
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

    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
        INSERT OR REPLACE INTO scenario_jobs
        (job_id, scenario_id, status, xosc_content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """,
            (job_id, scenario_id, "pending", xosc_content, now_str, now_str),
        )
    return job_dict


def get_pending_jobs() -> list[dict]:
    with _cursor() as cursor:
        cursor.execute("SELECT * FROM scenario_jobs WHERE status = 'pending' ORDER BY created_at ASC")
        return [dict(r) for r in cursor.fetchall()]


def get_job(job_id: str) -> dict | None:
    with _cursor() as cursor:
        cursor.execute("SELECT * FROM scenario_jobs WHERE job_id = ?", (job_id,))
        row = cursor.fetchone()
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
    now_str = datetime.now(UTC).isoformat()
    result_json = json.dumps(result, ensure_ascii=False)

    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
        UPDATE scenario_jobs
        SET status = ?, result = ?, updated_at = ?
        WHERE job_id = ?
    """,
            (status, result_json, now_str, job_id),
        )
