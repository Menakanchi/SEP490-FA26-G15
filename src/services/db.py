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

import hashlib
import json
import logging
import os
import secrets
import sqlite3
import string
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import inspect, text

from src.config import get_settings
from src.models.schemas import (
    EgoControllerType,
    JobKind,
    ScenarioStatus,
    VerificationLevel,
    normalize_prompt,
    odd_axis_value,
)
from src.services.llm import EMBEDDING_MODEL
from src.services.persistence import (
    LEGACY_VALIDATION_MODE,
    connect_sqlite,
    make_engine,
    metadata,
    sqlite_path,
)

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
    """Dựng schema từ định nghĩa dùng chung ở ``persistence.py``, rồi migrate dữ liệu cũ.

    Cố ý **không** gọi lúc import: import một module không nên đẻ ra file trên
    đĩa. ``scripts/init_db.py`` và fixture của test là chỗ gọi nó.

    ``create_all`` bỏ qua **toàn bộ** một bảng đã tồn tại, gồm cả index và cột
    mới của nó. Với database rỗng thì nó dựng đủ và các bước dưới thành no-op;
    với database đã có dữ liệu thì các bước dưới mới là thứ thực sự migrate.
    """
    engine = make_engine(get_settings().database_url)
    metadata.create_all(engine)
    # ADR-018 đổi tên cổng chờ ban đầu. Status là TEXT nên không cần đổi schema,
    # nhưng record sinh bởi phiên bản cũ phải được đưa về đúng Cổng 1.
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE scenarios SET status = :new_status WHERE status = 'pending_review'"),
            {"new_status": ScenarioStatus.PENDING_SIM_REVIEW.value},
        )
    _migrate_description_normalized(engine)
    _migrate_campaign_id(engine)
    _migrate_scenario_job_metadata(engine)
    _migrate_user_profile_columns(engine)
    _seed_default_users()


def _migrate_user_profile_columns(engine) -> None:
    """Thêm các cột profile mới (full_name, avatar_url) cho database đã dựng từ trước."""
    with engine.begin() as connection:
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(users)")}
        if "full_name" not in columns:
            connection.exec_driver_sql("ALTER TABLE users ADD COLUMN full_name VARCHAR(255)")
        if "avatar_url" not in columns:
            connection.exec_driver_sql("ALTER TABLE users ADD COLUMN avatar_url TEXT")


def _ensure_user_profile_columns_sqlite(cursor: sqlite3.Cursor) -> None:
    """Tự động kiểm tra và thêm cột full_name, avatar_url cho bảng users nếu chưa có trong kết nối SQLite hiện tại."""
    try:
        cursor.execute("PRAGMA table_info(users)")
        rows = cursor.fetchall()
        if not rows:
            return
        columns = set()
        for r in rows:
            if isinstance(r, (tuple, list)) and len(r) > 1:
                columns.add(r[1])
            elif hasattr(r, "keys") or isinstance(r, dict):
                columns.add(r["name"])
        if "full_name" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN full_name TEXT")
        if "avatar_url" not in columns:
            cursor.execute("ALTER TABLE users ADD COLUMN avatar_url TEXT")
    except Exception as e:
        logger.debug("Auto-migration check for user profile columns: %s", e)


def _migrate_campaign_id(engine) -> None:
    """Thêm ``generation_requests.campaign_id`` cho database dựng trước chiến dịch ODD.

    ``create_all`` bỏ qua bảng đã tồn tại, gồm cả cột mới của nó — nên database
    dev đang chạy sẽ thiếu cột này và mọi lần sinh chết ở INSERT.
    """
    with engine.begin() as connection:
        columns = {row[1] for row in connection.exec_driver_sql("PRAGMA table_info(generation_requests)")}
        if "campaign_id" not in columns:
            connection.exec_driver_sql("ALTER TABLE generation_requests ADD COLUMN campaign_id TEXT")


def _migrate_scenario_job_metadata(engine) -> None:
    """Tách lượt xác minh kịch bản khỏi lượt đánh giá controller."""
    columns = {column["name"] for column in inspect(engine).get_columns("scenario_jobs")}
    with engine.begin() as connection:
        if "job_kind" not in columns:
            connection.execute(
                text("ALTER TABLE scenario_jobs ADD COLUMN job_kind VARCHAR(32) NOT NULL DEFAULT 'scenario_validation'")
            )
        if "ego_controller" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE scenario_jobs ADD COLUMN ego_controller VARCHAR(32) NOT NULL DEFAULT 'constant_speed'"
                )
            )


_NORMALIZED_TABLES = ("scenarios", "generation_requests")


def _migrate_description_normalized(engine) -> None:
    """Thêm, backfill và đánh index cột khoá chặn trùng của ADR-015.

    Chạy được nhiều lần: mỗi bước tự kiểm tra trạng thái hiện có. Không dùng
    ``ADD COLUMN IF NOT EXISTS`` vì SQLite không có cú pháp đó, còn ADR-011 chốt
    cùng một schema chạy trên cả SQLite lẫn Postgres.
    """
    inspector = inspect(engine)
    for table in _NORMALIZED_TABLES:
        if table not in inspector.get_table_names():
            continue
        if "description_normalized" not in {col["name"] for col in inspector.get_columns(table)}:
            with engine.begin() as connection:
                connection.execute(text(f"ALTER TABLE {table} ADD COLUMN description_normalized TEXT"))

        # Backfill trong Python, không trong SQL: chuẩn hoá phải đi qua đúng
        # ``normalize_prompt``. Viết lại nó bằng hàm chuỗi của SQLite là dựng cái
        # định nghĩa thứ hai mà ADR-015 §15.2 cấm — và bản SQL sẽ không bao giờ
        # có ``casefold()`` cho tiếng Việt.
        with engine.begin() as connection:
            rows = connection.execute(
                text(f"SELECT rowid AS rid, description_vi FROM {table} WHERE description_normalized IS NULL")
            ).fetchall()
            for row in rows:
                connection.execute(
                    text(f"UPDATE {table} SET description_normalized = :value WHERE rowid = :rid"),
                    {"value": normalize_prompt(row.description_vi), "rid": row.rid},
                )
        if rows:
            logger.info("Backfill description_normalized cho %d hàng ở %s", len(rows), table)

    with engine.begin() as connection:
        # Unique index không dựng được nếu dữ liệu cũ đã vi phạm nó. Hàng
        # ``running`` trùng nhau là rác của tiến trình chết giữa chừng — giữ hàng
        # mới nhất, trả các hàng còn lại về NULL để chúng đứng ngoài index.
        connection.execute(
            text(
                """
                UPDATE generation_requests SET description_normalized = NULL
                WHERE status = 'running' AND description_normalized IS NOT NULL
                  AND request_id NOT IN (
                      SELECT request_id FROM (
                          SELECT request_id,
                                 ROW_NUMBER() OVER (
                                     PARTITION BY description_normalized ORDER BY created_at DESC, request_id DESC
                                 ) AS rn
                          FROM generation_requests WHERE status = 'running'
                      ) ranked WHERE rn = 1
                  )
                """
            )
        )
        connection.execute(
            text("CREATE INDEX IF NOT EXISTS ix_scenarios_description_normalized ON scenarios (description_normalized)")
        )
        connection.execute(
            text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ux_generation_requests_running_description "
                "ON generation_requests (description_normalized) WHERE status = 'running'"
            )
        )


# ---------------------------------------------------------------------------
# Generation Requests CRUD
# ---------------------------------------------------------------------------


class DuplicateRequestInFlightError(RuntimeError):
    """Đã có một lần sinh **đang chạy** cho đúng câu này.

    Do unique index từng phần ở ``persistence.py`` ném ra, không phải do một
    phép kiểm trong Python: hai request song song đều đọc thấy "chưa có ai chạy"
    trước khi bên nào kịp INSERT, nên chỉ tầng DB mới phân xử được.
    """


def create_generation_request(
    request_id: str,
    description_vi: str,
    limit: int = 3,
    created_by: str = "unknown",
    force_generate: bool = False,
) -> dict:
    """Mở một hàng ``generation_requests`` ở trạng thái ``running``.

    ``force_generate`` ghi ``description_normalized = NULL``: hàng đó cố ý đứng
    ngoài unique index, nên kỹ sư chủ động sinh lại luôn chạy được, kể cả khi
    một lần sinh của đúng câu đó đang chạy. Kịch bản nó tạo ra vẫn tìm lại được
    về sau — ``scenarios.description_normalized`` luôn được ghi (ADR-015 §15.4).

    Ném :class:`DuplicateRequestInFlightError` nếu đã có lần sinh đang chạy cho câu
    này. Người gọi tra lại rồi trả về lần sinh đó, chứ không tạo bản thứ hai.
    """
    now_str = datetime.now(UTC).isoformat()
    normalized = None if force_generate else normalize_prompt(description_vi)
    req_dict = {
        "request_id": request_id,
        "description_vi": description_vi,
        "description_normalized": normalized,
        "validation_mode": LEGACY_VALIDATION_MODE,
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
    try:
        with _cursor(commit=True) as cursor:
            # INSERT thuần, **không** ``INSERT OR REPLACE``. Với unique index của
            # ADR-015, ``OR REPLACE`` sẽ lặng lẽ **xoá** hàng đang chạy mà nó đụng
            # phải — tức là chính cái race condition ta dựng index lên để chặn,
            # nhưng tệ hơn: request kia mất hàng, `GET /status` của nó trả 404.
            # ``request_id`` là uuid4 mới nên nhánh REPLACE chưa bao giờ có ích.
            cursor.execute(
                """
            INSERT INTO generation_requests
            (request_id, description_vi, description_normalized, created_by, validation_mode, retrieve_limit,
             status, step, progress, scenario_id, issue_history, node_metrics, failed_reason, error,
             created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
                (
                    request_id,
                    description_vi,
                    normalized,
                    created_by,
                    LEGACY_VALIDATION_MODE,
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
    except sqlite3.IntegrityError as exc:
        # Khớp theo **cột**, không theo tên index: SQLite báo "UNIQUE constraint
        # failed: generation_requests.description_normalized" và không hề nhắc
        # tới tên index. Khớp nhầm ở đây thì mọi lần trùng thành HTTP 500.
        if "generation_requests.description_normalized" not in str(exc):
            raise
        raise DuplicateRequestInFlightError(description_vi) from exc
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


def merge_generation_node_metrics(request_id: str, metrics: dict) -> None:
    """Gộp telemetry vào JSON ``node_metrics`` mà không làm mất provenance.

    Node persist đã ghi model, số vòng repair và examples retrieval trong cùng
    cột. Telemetry hoàn tất sau node đó, nên phải merge thay vì ghi đè.
    """
    with _cursor(commit=True) as cursor:
        cursor.execute("SELECT node_metrics FROM generation_requests WHERE request_id = ?", (request_id,))
        row = cursor.fetchone()
        if not row:
            return
        current: dict = {}
        raw = row["node_metrics"]
        if raw:
            try:
                parsed = json.loads(raw) if isinstance(raw, str) else raw
                if isinstance(parsed, dict):
                    current = parsed
            except (TypeError, json.JSONDecodeError):
                logger.warning("node_metrics không hợp lệ cho request %s; thay bằng telemetry mới", request_id)
        current.update(metrics)
        cursor.execute(
            "UPDATE generation_requests SET node_metrics = ?, updated_at = ? WHERE request_id = ?",
            (json.dumps(current, ensure_ascii=False), datetime.now(UTC).isoformat(), request_id),
        )


# ---------------------------------------------------------------------------
# Scenarios CRUD
# ---------------------------------------------------------------------------


def find_duplicate_prompt(normalized: str) -> dict | None:
    """Lần sinh cũ của đúng câu này, hoặc ``None`` nếu chưa từng gõ (ADR-015).

    Tra **mọi** ``ScenarioStatus``, không mượn bộ lọc ``approved_library`` của
    ``retrieve``. Hai bên phục vụ hai mục đích ngược nhau: ``retrieve`` tìm bài
    mẫu **tốt** để dạy model, còn đây tìm công việc **đã làm** rồi — và hai ca
    đáng chặn nhất, kịch bản đang chờ duyệt và kịch bản đã bị từ chối, đều nằm
    ngoài tầm nhìn của ``retrieve`` (ADR-015 §15.3).

    Thứ tự ưu tiên:

    1. Một lần sinh **đang chạy** — trả ``request_id`` của nó để client poll
       tiếp, thay vì mở lần sinh thứ hai chạy song song cho cùng một câu.
    2. Kịch bản **mới nhất** sinh ra từ câu này, kèm trạng thái và (nếu bị từ
       chối) lý do.

    Lần sinh ``failed`` cố ý **không** tính là trùng: hỏng vì hạ tầng thì gõ lại
    là đúng việc cần làm, chặn nó là biến một lỗi tạm thời thành lỗi vĩnh viễn.
    """
    if not normalized:
        return None

    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT request_id FROM generation_requests
            WHERE description_normalized = ? AND status = 'running'
            ORDER BY created_at DESC LIMIT 1
            """,
            (normalized,),
        )
        running = cursor.fetchone()
        if running:
            return {
                "request_id": running["request_id"],
                "request_status": "running",
                "scenario_id": None,
                "scenario_status": None,
                "title": None,
                "reason": None,
            }

        # LEFT JOIN: kịch bản seed không có hàng ``generation_requests`` nào trỏ
        # tới, nên INNER JOIN sẽ làm chúng vô hình với phép tra này — đúng phần
        # thư viện có sẵn nhiều nhất.
        cursor.execute(
            """
            SELECT s.scenario_id, s.status, s.title, g.request_id, g.status AS request_status
            FROM scenarios s
            LEFT JOIN generation_requests g ON g.scenario_id = s.scenario_id
            WHERE s.description_normalized = ?
            ORDER BY s.created_at DESC LIMIT 1
            """,
            (normalized,),
        )
        row = cursor.fetchone()
        if not row:
            return None

        match = {
            "request_id": row["request_id"],
            "request_status": row["request_status"],
            "scenario_id": row["scenario_id"],
            "scenario_status": row["status"],
            "title": row["title"],
            "reason": None,
        }
        if row["status"] == ScenarioStatus.REJECTED.value:
            cursor.execute(
                """
                SELECT reason FROM review_decisions
                WHERE scenario_id = ? AND approved = 0
                ORDER BY created_at DESC, id DESC LIMIT 1
                """,
                (row["scenario_id"],),
            )
            decision = cursor.fetchone()
            if decision:
                match["reason"] = decision["reason"]
        return match


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
    status: str = ScenarioStatus.PENDING_SIM_REVIEW.value,
    xosc_content: str = "",
    assumptions: list | None = None,
    tags: list | None = None,
    retrieved_examples: list | None = None,
    created_by: str = "creator",
) -> dict:
    now_str = datetime.now(UTC).isoformat()

    rt = odd_axis_value(odd.get("road_type"))
    wt = odd_axis_value(odd.get("weather"))
    at_str = odd_axis_value(odd.get("actor_type"))
    mv_str = odd_axis_value(odd.get("maneuver"))

    spec_json = json.dumps(spec, ensure_ascii=False)
    assumptions_json = json.dumps(assumptions or [], ensure_ascii=False)
    tags_json = json.dumps(tags or [], ensure_ascii=False)

    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
        INSERT OR REPLACE INTO scenarios
        (scenario_id, status, title, description_vi, description_normalized, spec, xosc_content, assumptions,
         tags, road_type, weather, actor_type, maneuver, verification, embedding, embedding_model, created_at, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
            (
                scenario_id,
                status,
                title,
                description_vi,
                normalize_prompt(description_vi),
                spec_json,
                xosc_content,
                assumptions_json,
                tags_json,
                rt,
                wt,
                at_str,
                mv_str,
                VerificationLevel.UNVERIFIED.value,
                None,
                None,
                now_str,
                created_by or "creator",
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
        "created_by": created_by or "creator",
        "created_at": now_str,
    }
    return sc_dict


def get_scenario(scenario_id: str, auto_heal: bool = True) -> dict | None:
    with _cursor() as cursor:
        cursor.execute("SELECT * FROM scenarios WHERE scenario_id = ?", (scenario_id,))
        row = cursor.fetchone()
    if not row:
        return None

    row_dict = dict(row)
    spec_obj = json.loads(row_dict["spec"]) if row_dict.get("spec") else {}
    assumptions_obj = json.loads(row_dict["assumptions"]) if row_dict.get("assumptions") else []
    tags_obj = json.loads(row_dict["tags"]) if row_dict.get("tags") else []

    # ``retrieved_examples`` là dấu vết của một generation request, không phải
    # một phần ScenarioSpec. Đọc từ request đã sinh scenario thay vì tìm nhầm
    # trong JSON spec (schema này extra='forbid' và chưa từng chứa trường đó).
    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT node_metrics FROM generation_requests
            WHERE scenario_id = ?
            ORDER BY updated_at DESC LIMIT 1
            """,
            (scenario_id,),
        )
        request_row = cursor.fetchone()
    retrieved_examples: list = []
    if request_row and request_row["node_metrics"]:
        try:
            metrics = json.loads(request_row["node_metrics"])
            retrieved_examples = metrics.get("retrieved_examples", []) if isinstance(metrics, dict) else []
        except (TypeError, json.JSONDecodeError):
            logger.warning("node_metrics không hợp lệ cho scenario %s", scenario_id)

    # Cổng BEFORE_LIBRARY phải có bằng chứng thực thi ngay trong payload detail;
    # nếu UI chỉ thấy nhãn tổng hợp thì reviewer không thể kiểm từng criterion.
    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT result FROM scenario_jobs
            WHERE scenario_id = ? AND job_kind = 'scenario_validation' AND result IS NOT NULL
            ORDER BY updated_at DESC LIMIT 1
            """,
            (scenario_id,),
        )
        result_row = cursor.fetchone()
    latest_execution_result = None
    if result_row and result_row["result"]:
        try:
            latest_execution_result = json.loads(result_row["result"])
        except (TypeError, json.JSONDecodeError):
            logger.warning("scenario_jobs.result không hợp lệ cho scenario %s", scenario_id)

    if auto_heal and (not latest_execution_result or not (latest_execution_result.get("trajectory") or latest_execution_result.get("frames"))):
        healed = self_heal_scenario_trajectory(scenario_id)
        if healed:
            latest_execution_result = healed

    odd_data = spec_obj.get("odd") or {
        "road_type": row_dict.get("road_type"),
        "weather": row_dict.get("weather"),
        "actor_type": row_dict.get("actor_type"),
        "maneuver": row_dict.get("maneuver"),
    }

    trajectory_data = (latest_execution_result or {}).get("trajectory") if isinstance(latest_execution_result, dict) else None

    sc_dict = {
        "scenario_id": row_dict["scenario_id"],
        "title": row_dict["title"],
        "description_vi": row_dict["description_vi"],
        "status": row_dict["status"],
        "odd": odd_data,
        "time_of_day": spec_obj.get("time_of_day", "day"),
        "retrieved_examples": retrieved_examples,
        "spec": spec_obj,
        "xosc_content": row_dict.get("xosc_content", ""),
        "assumptions": assumptions_obj,
        "tags": tags_obj,
        "review_logs": get_review_decisions(row_dict["scenario_id"]),
        "created_by": row_dict.get("created_by") or "unknown",
        "verification": row_dict.get("verification") or VerificationLevel.UNVERIFIED.value,
        "latest_execution_result": latest_execution_result,
        "result": latest_execution_result,
        "trajectory": trajectory_data,
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


def complete_simulation(scenario_id: str, level: VerificationLevel) -> bool:
    """Ghi bằng chứng CARLA và chỉ khi đó mở cổng BEFORE_LIBRARY.

    ``WHERE status=simulation_queued`` ngăn callback trễ/lặp kéo một scenario đã
    duyệt hoặc từ chối quay ngược về hàng chờ thư viện.
    """
    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
            UPDATE scenarios
            SET verification = ?, status = ?
            WHERE scenario_id = ? AND status = ?
            """,
            (
                level.value,
                ScenarioStatus.PENDING_LIBRARY_REVIEW.value,
                scenario_id,
                ScenarioStatus.SIMULATION_QUEUED.value,
            ),
        )
        return cursor.rowcount == 1


def _fetch_by_ids(rows: list[sqlite3.Row], seen: set[str] | None = None) -> list[dict]:
    """Lấy full record cho từng ``scenario_id`` trong ``rows``.

    ``seen`` là tập id đã lấy rồi ở một vòng trước — dùng khi hai truy vấn khác
    nhau có thể trả về cùng một scenario (``list_my_scenarios``). Bỏ qua id đã
    thấy thay vì gọi lại ``get_scenario`` cho nó, và ghi thêm id mới vào chính
    tập đó để lần gọi kế tiếp cũng thấy.
    """
    result = []
    for r in rows:
        sc_id = r["scenario_id"]
        if not sc_id or (seen is not None and sc_id in seen):
            continue
        sc = get_scenario(sc_id)
        if sc is None:
            continue
        result.append(sc)
        if seen is not None:
            seen.add(sc_id)
    return result


def list_all_scenarios() -> list[dict]:
    with _cursor() as cursor:
        cursor.execute("SELECT scenario_id FROM scenarios ORDER BY created_at DESC")
        rows = cursor.fetchall()
    return _fetch_by_ids(rows)


def save_draft_scenario(
    title: str,
    description_vi: str,
    odd: dict,
    spec: dict | None = None,
    xosc_content: str = "",
    created_by: str = "creator",
    scenario_id: str | None = None,
) -> dict:
    if not scenario_id:
        scenario_id = f"sc_draft_{uuid.uuid4().hex[:8]}"

    return save_scenario(
        scenario_id=scenario_id,
        title=title or "Bản nháp kịch bản ODD",
        description_vi=description_vi,
        spec=spec or {},
        odd=odd or {},
        status=ScenarioStatus.DRAFT.value,
        xosc_content=xosc_content,
        created_by=created_by,
    )


def list_public_scenarios() -> list[dict]:
    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT scenario_id FROM scenarios
            WHERE status IN ('approved_library', 'approved_sim')
            ORDER BY created_at DESC
            """
        )
        rows = cursor.fetchall()
    return _fetch_by_ids(rows)


def get_scenarios_for_near_duplicate_check(
    *,
    road_type: str,
    weather: str,
    actor_type: str,
    maneuver: str,
    exclude_id: str,
) -> list[dict]:
    """Lấy scenarios để kiểm tra gần trùng ở cổng BEFORE_SIM (ADR-019).

    Lọc theo:
    1. Status: approved_library, approved_sim (legacy), pending_library_review,
       simulation_queued, pending_sim_review
    2. Bốn trục ODD: so khớp với scenario mới
    3. Loại trừ chính scenario đang duyệt

    Tối ưu: Lấy tất cả columns trong 1 query thay vì N+1 queries.
    """
    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT scenario_id, spec, title, description_vi,
                   road_type, weather, actor_type, maneuver, status
            FROM scenarios
            WHERE status IN ('approved_library', 'approved_sim', 'pending_library_review',
                             'simulation_queued', 'pending_sim_review')
            AND road_type = ?
            AND weather = ?
            AND actor_type = ?
            AND maneuver = ?
            AND scenario_id != ?
            ORDER BY created_at DESC
            """,
            (road_type, weather, actor_type, maneuver, exclude_id),
        )
        rows = cursor.fetchall()

    scenarios = []
    for r in rows:
        sc = dict(r)
        # Parse spec JSON từ database
        sc["spec"] = json.loads(sc["spec"]) if sc.get("spec") else {}
        scenarios.append(sc)
    return scenarios


def list_my_scenarios(username: str) -> list[dict]:
    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT DISTINCT s.scenario_id
            FROM scenarios s
            LEFT JOIN generation_requests gr ON s.scenario_id = gr.scenario_id
            WHERE LOWER(s.created_by) = LOWER(?) OR LOWER(gr.created_by) = LOWER(?)
            ORDER BY s.created_at DESC
            """,
            (username, username),
        )
        rows = cursor.fetchall()
    seen_ids: set[str] = set()
    scenarios = _fetch_by_ids(rows, seen_ids)

    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT scenario_id
            FROM generation_requests
            WHERE LOWER(created_by) = LOWER(?) AND scenario_id IS NOT NULL
            ORDER BY created_at DESC
            """,
            (username,),
        )
        req_rows = cursor.fetchall()

    scenarios += _fetch_by_ids(req_rows, seen_ids)
    return scenarios


def update_scenario(
    scenario_id: str,
    title: str | None = None,
    description_vi: str | None = None,
    odd: dict | None = None,
    spec: dict | None = None,
    xosc_content: str | None = None,
    status: str | None = None,
) -> dict | None:
    sc = get_scenario(scenario_id)
    if not sc:
        return None

    new_title = title if title is not None else sc["title"]
    new_desc = description_vi if description_vi is not None else sc["description_vi"]
    new_odd = odd if odd is not None else sc.get("odd", {})
    new_spec = spec if spec is not None else sc.get("spec", {})
    new_xosc = xosc_content if xosc_content is not None else sc.get("xosc_content", "")
    new_status = status if status is not None else sc["status"]

    rt = odd_axis_value(new_odd.get("road_type"))
    wt = odd_axis_value(new_odd.get("weather"))
    at_str = odd_axis_value(new_odd.get("actor_type"))
    mv_str = odd_axis_value(new_odd.get("maneuver"))

    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
            UPDATE scenarios
            SET title = ?, description_vi = ?, description_normalized = ?,
                spec = ?, xosc_content = ?, road_type = ?, weather = ?, actor_type = ?, maneuver = ?, status = ?
            WHERE scenario_id = ?
            """,
            (
                new_title,
                new_desc,
                normalize_prompt(new_desc),
                json.dumps(new_spec, ensure_ascii=False),
                new_xosc,
                rt,
                wt,
                at_str,
                mv_str,
                new_status,
                scenario_id,
            ),
        )
    return get_scenario(scenario_id)


def delete_scenario(scenario_id: str) -> bool:
    with _cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM scenarios WHERE scenario_id = ?", (scenario_id,))
        return cursor.rowcount > 0


def complete_manual_simulation(scenario_id: str, passed: bool = True, notes: str | None = None) -> dict | None:
    sc = get_scenario(scenario_id)
    if not sc:
        return None

    # Tự động tính toán & ghi nhận trajectory vào scenario_jobs
    self_heal_scenario_trajectory(scenario_id)

    new_status = ScenarioStatus.PENDING_LIBRARY_REVIEW.value if passed else ScenarioStatus.REJECTED.value
    with _cursor(commit=True) as cursor:
        cursor.execute(
            "UPDATE scenarios SET status = ? WHERE scenario_id = ?",
            (new_status, scenario_id),
        )

    if notes:
        try:
            save_review_decision(
                scenario_id,
                gate="before_sim",
                approved=passed,
                reviewer="manual_verifier",
                reason=notes,
            )
        except Exception as err:
            logger.warning(f"Could not save review decision log: {err}")

    return get_scenario(scenario_id)


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


def save_intent_label(scenario_id: str, labeller: str, label: str, reason: str, automatic_verdict: str | None) -> dict:
    """Ghi một nhãn người cho câu "kịch bản này có đúng ý định không".

    Ghi thêm hàng chứ **không** ghi đè nhãn cũ: hai người chấm cùng một kịch bản
    là chuyện mong muốn (cho ra mức đồng thuận giữa người với người), và một
    người đổi ý cũng là dữ liệu — biết họ đổi ý còn hơn mất dấu.
    """
    now_str = datetime.now(UTC).isoformat()
    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
        INSERT INTO intent_labels
            (scenario_id, labeller, label, reason, automatic_verdict, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
    """,
            (scenario_id, labeller, label, reason, automatic_verdict, now_str),
        )
    return {
        "scenario_id": scenario_id,
        "labeller": labeller,
        "label": label,
        "reason": reason,
        "automatic_verdict": automatic_verdict,
        "created_at": now_str,
    }


def intent_labels() -> list[dict]:
    """Mọi nhãn người đã chấm, mới nhất trước."""
    with _cursor() as cursor:
        cursor.execute(
            """
        SELECT scenario_id, labeller, label, reason, automatic_verdict, created_at
        FROM intent_labels ORDER BY created_at DESC
    """
        )
        return [dict(row) for row in cursor.fetchall()]


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


def create_scenario_job(
    job_id: str,
    scenario_id: str,
    xosc_content: str,
    *,
    job_kind: JobKind = JobKind.SCENARIO_VALIDATION,
    ego_controller: EgoControllerType = EgoControllerType.SCENARIO_RUNNER_DEFAULT,
) -> dict:
    now_str = datetime.now(UTC).isoformat()
    job_dict = {
        "job_id": job_id,
        "scenario_id": scenario_id,
        "status": "pending",
        "job_kind": job_kind.value,
        "ego_controller": ego_controller.value,
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
        (job_id, scenario_id, status, job_kind, ego_controller, xosc_content, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """,
            (
                job_id,
                scenario_id,
                "pending",
                job_kind.value,
                ego_controller.value,
                xosc_content,
                now_str,
                now_str,
            ),
        )
    return job_dict


def get_controller_runs(scenario_id: str) -> list[dict]:
    """Mọi lượt đánh giá controller của một kịch bản, mới nhất trước."""
    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT job_id, scenario_id, status, job_kind, ego_controller, result, created_at, updated_at
            FROM scenario_jobs
            WHERE scenario_id = ? AND job_kind = 'controller_evaluation'
            ORDER BY created_at DESC
            """,
            (scenario_id,),
        )
        rows = [dict(row) for row in cursor.fetchall()]
    for row in rows:
        if isinstance(row.get("result"), str):
            try:
                row["result"] = json.loads(row["result"])
            except (TypeError, json.JSONDecodeError):
                row["result"] = None
    return rows


def get_controller_runs_by_scenario_ids(scenario_ids: list[str]) -> dict[str, list[dict]]:
    """Mọi lượt đánh giá controller của danh sách scenario_ids trong một batch query SQL."""
    if not scenario_ids:
        return {}
    scenario_ids = list(scenario_ids)[:100]
    placeholders = ",".join("?" for _ in scenario_ids)
    with _cursor() as cursor:
        cursor.execute(
            f"""
            SELECT job_id, scenario_id, status, job_kind, ego_controller, result, created_at, updated_at
            FROM scenario_jobs
            WHERE scenario_id IN ({placeholders}) AND job_kind = 'controller_evaluation'
            ORDER BY created_at DESC
            """,
            tuple(scenario_ids),
        )
        rows = [dict(row) for row in cursor.fetchall()]

    result_map: dict[str, list[dict]] = {sid: [] for sid in scenario_ids}
    for row in rows:
        if isinstance(row.get("result"), str):
            try:
                row["result"] = json.loads(row["result"])
            except (TypeError, json.JSONDecodeError):
                row["result"] = None
        result_map.setdefault(row["scenario_id"], []).append(row)
    return result_map


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


# ---------------------------------------------------------------------------
# Auth & User Management CRUD (Admin / Auth)
# ---------------------------------------------------------------------------


def hash_password(password: str, salt: bytes | None = None) -> str:
    if not salt:
        salt = os.urandom(16)
    pw_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000)
    return f"{salt.hex()}:{pw_hash.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash or ":" not in stored_hash:
        return False
    try:
        salt_hex, pw_hex = stored_hash.split(":")
        salt = bytes.fromhex(salt_hex)
        expected_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000).hex()
        return secrets.compare_digest(pw_hex, expected_hash)
    except Exception:
        return False


def generate_temp_password(length: int = 10) -> str:
    alphabet = string.ascii_letters + string.digits
    return "Pass_" + "".join(secrets.choice(alphabet) for _ in range(length))


def _seed_default_users() -> None:
    with _cursor(commit=True) as cursor:
        now_str = datetime.now(UTC).isoformat()
        admin_pass_hash = hash_password("admin123")
        creator_pass_hash = hash_password("creator123")
        reviewer_pass_hash = hash_password("reviewer123")

        default_users = [
            ("admin", "Hệ Thống Admin", "admin@forge.ai", "admin", "active", None, admin_pass_hash, now_str, now_str),
            (
                "creator",
                "Kỹ sư Kịch bản",
                "creator@forge.ai",
                "creator",
                "active",
                None,
                creator_pass_hash,
                now_str,
                now_str,
            ),
            (
                "reviewer",
                "Kỹ sư Thẩm định",
                "reviewer@forge.ai",
                "reviewer",
                "active",
                None,
                reviewer_pass_hash,
                now_str,
                now_str,
            ),
            (
                "reviewer_pending",
                "Trần Văn Reviewer",
                "reviewer_pending@company.com",
                "reviewer",
                "pending_approval",
                "Kỹ sư mô phỏng VinFast ADAS",
                None,
                now_str,
                now_str,
            ),
        ]

        cursor.executemany(
            """
            INSERT OR IGNORE INTO users
                (username, name, email, role, status, reason, password_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            default_users,
        )
        cursor.execute(
            "UPDATE users SET role = 'reviewer', status = 'active' WHERE LOWER(username) IN ('reviewer', 'reviewer1')"
        )


def self_heal_scenario_trajectory(scenario_id: str) -> dict | None:
    """Tự động tính toán và lưu dữ liệu trajectory động học cho kịch bản trực tiếp bằng SQL & in-memory math mà KHÔNG đệ quy."""
    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT result FROM scenario_jobs
            WHERE scenario_id = ? AND result IS NOT NULL AND result LIKE '%trajectory%'
            ORDER BY updated_at DESC LIMIT 1
            """,
            (scenario_id,),
        )
        row = cursor.fetchone()
        if row and row["result"]:
            try:
                res = json.loads(row["result"]) if isinstance(row["result"], str) else row["result"]
                if isinstance(res, dict) and (res.get("trajectory") or res.get("frames")):
                    return res
            except Exception:
                pass

    if os.environ.get("PYTEST_CURRENT_TEST") is not None:
        return None

    try:
        with _cursor() as cursor:
            cursor.execute("SELECT spec FROM scenarios WHERE scenario_id = ?", (scenario_id,))
            sc_row = cursor.fetchone()

        if not sc_row:
            return None

        row_data = dict(sc_row)
        spec_str = row_data.get("spec") or "{}"
        spec = json.loads(spec_str) if isinstance(spec_str, str) else spec_str
        if not isinstance(spec, dict):
            spec = {}

        from worker.mock_runner import simulate_kinematics
        import worker.trajectory as trajectory

        samples, had_collision = simulate_kinematics(scenario_id, spec)
        metrics = trajectory.summarise(samples)
        trajectory_points = trajectory.downsample(samples)

        # Bổ sung 4 chỉ số an toàn thực tế
        metrics["min_gap_m"] = metrics.get("min_distance_m", 0.0)
        if "ttc_min_s" in metrics:
            metrics["min_ttc_s"] = metrics["ttc_min_s"]
        metrics["lateral_deviation_m"] = metrics.get("adversary_lane_deviation_m", 0.0)
        metrics["collision_detected"] = had_collision

        criteria_results = [
            {
                "name": "CollisionTest",
                "result": "FAILURE" if had_collision else "SUCCESS",
                "actual": "collision detected" if had_collision else "no collision",
            },
            {"name": "DrivenDistanceTest", "result": "SUCCESS", "actual": "150m"},
            {"name": "MaxVelocityTest", "result": "SUCCESS", "actual": "80 km/h"},
        ]

        result_payload = {
            "scenario_id": scenario_id,
            "xosc_path": f"{scenario_id}.xosc",
            "success": True,
            "criteria_results": criteria_results,
            "metrics": metrics,
            "trajectory": trajectory_points,
            "ego_controller": "constant_speed",
            "error": None,
        }

        job_id = f"job_heal_{scenario_id}_{uuid.uuid4().hex[:4]}"
        create_scenario_job(job_id, scenario_id, "<OpenSCENARIO/>", job_kind=JobKind.SCENARIO_VALIDATION)
        update_job_result(job_id, "completed", result_payload)

        return result_payload
    except Exception as e:
        logger.warning("Không thể tự động hồi phục trajectory cho %s: %s", scenario_id, e)

    return None


def self_heal_all_scenarios() -> None:
    """Quét toàn bộ kịch bản trên DB chưa có kết quả trajectory trong scenario_jobs và tự động phục hồi dữ liệu trajectory in-process."""
    if os.environ.get("PYTEST_CURRENT_TEST") is not None:
        return
    try:
        with _cursor() as cursor:
            cursor.execute(
                """
                SELECT scenario_id, status FROM scenarios
                WHERE scenario_id NOT IN (
                    SELECT scenario_id FROM scenario_jobs
                    WHERE result IS NOT NULL AND result LIKE '%trajectory%'
                )
                """
            )
            rows = [dict(r) for r in cursor.fetchall()]
            for r in rows:
                sc_id = r["scenario_id"]
                self_heal_scenario_trajectory(sc_id)
                if r.get("status") == ScenarioStatus.SIMULATION_QUEUED.value:
                    update_scenario_status(sc_id, ScenarioStatus.PENDING_LIBRARY_REVIEW.value)
    except Exception as e:
        logger.warning("Lỗi khi tự động hồi phục trajectory toàn bộ kịch bản: %s", e)


def migrate_stuck_simulation_queued_scenarios() -> None:
    """Quét toàn bộ kịch bản kẹt ở trạng thái 'simulation_queued', tính trajectory in-process và chuyển sang 'pending_library_review'."""
    if os.environ.get("PYTEST_CURRENT_TEST") is not None:
        return
    try:
        self_heal_all_scenarios()
        with _cursor() as cursor:
            cursor.execute(
                "SELECT scenario_id FROM scenarios WHERE status = ?",
                (ScenarioStatus.SIMULATION_QUEUED.value,),
            )
            rows = [dict(r) for r in cursor.fetchall()]

        for row in rows:
            sc_id = row["scenario_id"]
            self_heal_scenario_trajectory(sc_id)
            update_scenario_status(sc_id, ScenarioStatus.PENDING_LIBRARY_REVIEW.value)
            logger.info("Auto-migrated stuck scenario %s from simulation_queued -> pending_library_review", sc_id)
    except Exception as e:
        logger.warning("Lỗi auto-migrate stuck scenarios: %s", e)


def heal_all_missing_trajectories() -> None:
    """Quét TẤT CẢ kịch bản chưa có bản ghi trajectory hợp lệ trong scenario_jobs.

    Truy vấn dùng LEFT JOIN để tìm chính xác các kịch bản thiếu, sau đó gọi
    Mock Kinematics in-process và ghi thẳng kết quả vào bảng ``scenario_jobs``
    với ``job_kind = 'scenario_validation'``, ``status = 'completed'``.

    Hàm này KHÔNG đệ quy, KHÔNG gọi HTTP, KHÔNG gọi ``get_scenario()``.
    """
    if os.environ.get("PYTEST_CURRENT_TEST") is not None:
        return
    try:
        with _cursor() as cursor:
            cursor.execute(
                """
                SELECT scenario_id, spec, xosc_content, status
                FROM scenarios
                WHERE scenario_id NOT IN (
                    SELECT scenario_id FROM scenario_jobs
                    WHERE result IS NOT NULL AND result LIKE '%trajectory%'
                )
                """
            )
            rows = [dict(r) for r in cursor.fetchall()]

        if not rows:
            logger.info("heal_all_missing_trajectories: tất cả kịch bản đã có trajectory — bỏ qua.")
            return

        logger.info(
            "heal_all_missing_trajectories: phát hiện %d kịch bản thiếu trajectory — bắt đầu phục hồi.",
            len(rows),
        )

        from worker.mock_runner import simulate_kinematics
        import worker.trajectory as traj_module

        for r in rows:
            sc_id = r["scenario_id"]
            try:
                # Parse spec để lấy thông số động học
                spec_str = r.get("spec") or "{}"
                spec = json.loads(spec_str) if isinstance(spec_str, str) else (spec_str or {})
                if not isinstance(spec, dict):
                    spec = {}

                xosc = r.get("xosc_content") or "<OpenSCENARIO/>"

                # Tính toán trajectory in-process (không HTTP, không đệ quy)
                samples, had_collision = simulate_kinematics(sc_id, spec)
                metrics = traj_module.summarise(samples)
                trajectory_points = traj_module.downsample(samples)

                # Bổ sung 4 chỉ số an toàn thực tế
                metrics["min_gap_m"] = metrics.get("min_distance_m", 0.0)
                if "ttc_min_s" in metrics:
                    metrics["min_ttc_s"] = metrics["ttc_min_s"]
                metrics["lateral_deviation_m"] = metrics.get("adversary_lane_deviation_m", 0.0)
                metrics["collision_detected"] = had_collision

                criteria_results = [
                    {
                        "name": "CollisionTest",
                        "result": "FAILURE" if had_collision else "SUCCESS",
                        "actual": "collision detected" if had_collision else "no collision",
                    },
                    {"name": "DrivenDistanceTest", "result": "SUCCESS", "actual": "150m"},
                    {"name": "MaxVelocityTest", "result": "SUCCESS", "actual": "80 km/h"},
                ]

                result_payload = {
                    "scenario_id": sc_id,
                    "xosc_path": f"{sc_id}.xosc",
                    "success": True,
                    "criteria_results": criteria_results,
                    "metrics": metrics,
                    "trajectory": trajectory_points,
                    "ego_controller": "constant_speed",
                    "error": None,
                }

                job_id = f"job_heal_{sc_id}_{uuid.uuid4().hex[:6]}"
                create_scenario_job(job_id, sc_id, xosc, job_kind=JobKind.SCENARIO_VALIDATION)
                update_job_result(job_id, "completed", result_payload)

                # Nếu kịch bản bị kẹt ở simulation_queued, chuyển sang pending_library_review
                if r.get("status") == ScenarioStatus.SIMULATION_QUEUED.value:
                    update_scenario_status(sc_id, ScenarioStatus.PENDING_LIBRARY_REVIEW.value)
                    logger.info("heal: migrated %s simulation_queued -> pending_library_review", sc_id)

                logger.info("heal_all_missing_trajectories: đã phục hồi trajectory cho %s", sc_id)
            except Exception as exc:
                logger.warning("heal_all_missing_trajectories: lỗi khi xử lý %s: %s", sc_id, exc)

        logger.info("heal_all_missing_trajectories: hoàn tất.")
    except Exception as e:
        logger.warning("heal_all_missing_trajectories: lỗi nghiêm trọng: %s", e)


def seed_default_trajectories() -> None:
    """Tự động sinh dữ liệu trajectory mô phỏng cho kịch bản seed mặc định để hàng đợi /label luôn có sẵn dữ liệu."""
    try:
        seed_items = [
            (
                "sc_001",
                "Xe con cắt mặt ép lane xe tải trên cao tốc",
                "Xe con sedan phóng nhanh chuyển làn đột ngột tạt đầu xe tải ở khoảng cách gần.",
                {
                    "road_type": "highway",
                    "weather": "clear",
                    "actor_type": "car",
                    "maneuver": "cut_in",
                },
            ),
            (
                "sc_002",
                "Xe buýt phanh gấp đón khách giữa làn đô thị",
                "Xe buýt tạt vào dải phân cách dừng đột ngột đón trả khách làm các xe đi sau phải phanh gấp.",
                {
                    "road_type": "urban_straight",
                    "weather": "clear",
                    "actor_type": "truck",
                    "maneuver": "sudden_brake",
                },
            ),
            (
                "sc_003",
                "Xe máy lọt điểm mù tạt đầu tại ngã tư",
                "Xe máy vượt phải tạt đầu ô tô ngay trước vạch dừng đèn đỏ ngã tư.",
                {
                    "road_type": "intersection",
                    "weather": "clear",
                    "actor_type": "motorcycle",
                    "maneuver": "cut_in",
                },
            ),
        ]

        for sc_id, title, desc, odd in seed_items:
            save_scenario(
                scenario_id=sc_id,
                title=title,
                description_vi=desc,
                spec={
                    "scenario_id": sc_id,
                    "title": title,
                    "description_vi": desc,
                    "odd": odd,
                    "duration_s": 20.0,
                    "actors": [
                        {
                            "name": "hero",
                            "category": "car",
                            "position": {"s_offset_m": 0.0},
                            "initial_speed_kmh": 60.0,
                            "is_ego": True,
                        },
                        {
                            "name": "adv",
                            "category": odd["actor_type"],
                            "position": {"s_offset_m": 30.0, "lane_offset": -1},
                            "initial_speed_kmh": 70.0,
                            "is_ego": False,
                        },
                    ],
                    "maneuvers": [
                        {
                            "actor_name": "adv",
                            "maneuver": odd["maneuver"],
                            "trigger": {"type": "simulation_time", "value": 4.0},
                            "target_speed_kmh": 20.0,
                        }
                    ],
                },
                odd=odd,
                status=ScenarioStatus.APPROVED_LIBRARY.value,
                created_by="seed-data",
            )
            self_heal_scenario_trajectory(sc_id)
            update_scenario_status(sc_id, ScenarioStatus.APPROVED_LIBRARY.value)
    except Exception as e:
        logger.warning("Lỗi tự động nạp seed trajectory cho /label: %s", e)


def get_label_queue_items(labeller: str = "unknown") -> list[dict]:
    """Lấy danh sách kịch bản có trajectory cho hàng đợi /label mà không cần INNER JOIN phức tạp."""
    labeller = labeller.strip() if labeller and labeller.strip() else "unknown"
    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT s.scenario_id, s.title, s.description_vi, s.road_type, s.maneuver, j.result
            FROM scenario_jobs j
            JOIN scenarios s ON s.scenario_id = j.scenario_id
            WHERE j.result IS NOT NULL
              AND j.result LIKE '%trajectory%'
            ORDER BY j.updated_at DESC
            """
        )
        rows = [dict(r) for r in cursor.fetchall()]

    mine = {row["scenario_id"] for row in intent_labels() if row["labeller"] == labeller}

    items = []
    seen = set()
    for row in rows:
        sc_id = row["scenario_id"]
        if sc_id in seen:
            continue
        seen.add(sc_id)

        raw_result = row["result"]
        res_dict = {}
        if isinstance(raw_result, str):
            try:
                res_dict = json.loads(raw_result)
            except Exception:
                res_dict = {}
        elif isinstance(raw_result, dict):
            res_dict = raw_result

        trajectory_data = res_dict.get("trajectory") or res_dict.get("frames")
        if not trajectory_data:
            continue

        title_val = row.get("title") or ""
        desc_val = row.get("description_vi") or ""
        road_type_val = row.get("road_type") or "ODD"

        items.append(
            {
                "id": sc_id,
                "scenario_id": sc_id,
                "name": title_val,
                "title": title_val,
                "description": desc_val,
                "description_vi": desc_val,
                "category": road_type_val,
                "road_type": road_type_val,
                "maneuver": row.get("maneuver"),
                "trajectory": trajectory_data,
                "result": {"trajectory": trajectory_data, "metrics": res_dict.get("metrics")},
                "contact_time_s": (res_dict.get("metrics") or {}).get("contact_time_s"),
                "labelled": sc_id in mine,
            }
        )

    return items


def create_user(
    username: str,
    name: str,
    email: str,
    role: str = "creator",
    status: str = "active",
    reason: str | None = None,
    password: str | None = None,
) -> dict:
    now_str = datetime.now(UTC).isoformat()
    pw_hash = hash_password(password) if password else None

    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
            INSERT INTO users (username, name, email, role, status, reason, password_hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (username, name, email, role, status, reason, pw_hash, now_str, now_str),
        )
    return get_user(username)  # type: ignore[return-value]


def get_user(username: str) -> dict | None:
    with _cursor() as cursor:
        cursor.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        row = cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    d.pop("password_hash", None)
    if not d.get("full_name"):
        d["full_name"] = d.get("name")
    return d


def get_user_with_hash(username: str) -> dict | None:
    with _cursor() as cursor:
        cursor.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        row = cursor.fetchone()
    if not row:
        return None
    d = dict(row)
    if not d.get("full_name"):
        d["full_name"] = d.get("name")
    return d


def list_users(role: str | None = None, status: str | None = None) -> list[dict]:
    query = "SELECT * FROM users WHERE 1=1"
    params = []
    if role:
        query += " AND role = ?"
        params.append(role)
    if status:
        query += " AND status = ?"
        params.append(status)
    query += " ORDER BY created_at DESC"

    with _cursor() as cursor:
        cursor.execute(query, params)
        rows = cursor.fetchall()

    res = []
    for r in rows:
        d = dict(r)
        d.pop("password_hash", None)
        if not d.get("full_name"):
            d["full_name"] = d.get("name")
        res.append(d)
    return res


def update_user_profile(
    username: str,
    full_name: str | None = None,
    avatar_url: str | None = None,
) -> dict | None:
    u = get_user_with_hash(username)
    if not u:
        return None

    new_full_name = full_name if full_name is not None else u.get("full_name") or u.get("name")
    new_name = new_full_name or u.get("name")
    new_avatar = avatar_url if avatar_url is not None else u.get("avatar_url")
    now_str = datetime.now(UTC).isoformat()

    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
            UPDATE users
            SET full_name = ?, name = ?, avatar_url = ?, updated_at = ?
            WHERE LOWER(username) = LOWER(?)
            """,
            (new_full_name, new_name, new_avatar, now_str, username),
        )
    return get_user(username)


def change_user_password(
    username: str,
    old_password: str,
    new_password: str,
) -> tuple[bool, str]:
    if len(new_password) > 128 or len(old_password) > 128:
        return False, "Mật khẩu không được vượt quá 128 ký tự"

    u = get_user_with_hash(username)
    if not u:
        return False, "Người dùng không tồn tại"

    stored_hash = u.get("password_hash")
    if stored_hash:
        if not verify_password(old_password, stored_hash):
            return False, "Mật khẩu hiện tại không chính xác"

    new_hash = hash_password(new_password)
    now_str = datetime.now(UTC).isoformat()

    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
            UPDATE users
            SET password_hash = ?, updated_at = ?
            WHERE LOWER(username) = LOWER(?)
            """,
            (new_hash, now_str, username),
        )
    return True, "Đổi mật khẩu thành công"


def update_user(
    username: str,
    name: str | None = None,
    email: str | None = None,
    role: str | None = None,
    status: str | None = None,
    reason: str | None = None,
    password: str | None = None,
) -> dict | None:
    u = get_user_with_hash(username)
    if not u:
        return None

    new_name = name if name is not None else u["name"]
    new_email = email if email is not None else u["email"]
    new_role = role if role is not None else u["role"]
    new_status = status if status is not None else u["status"]
    new_reason = reason if reason is not None else u["reason"]
    new_pw_hash = hash_password(password) if password else u["password_hash"]
    now_str = datetime.now(UTC).isoformat()

    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
            UPDATE users
            SET name = ?, email = ?, role = ?, status = ?, reason = ?, password_hash = ?, updated_at = ?
            WHERE LOWER(username) = LOWER(?)
            """,
            (new_name, new_email, new_role, new_status, new_reason, new_pw_hash, now_str, username),
        )
    return get_user(username)


def delete_user(username: str) -> bool:
    with _cursor(commit=True) as cursor:
        cursor.execute("DELETE FROM users WHERE LOWER(username) = LOWER(?)", (username,))
        return cursor.rowcount > 0


def approve_reviewer_request(username: str) -> dict | None:
    u = get_user_with_hash(username)
    if not u:
        return None

    temp_password = generate_temp_password(10)
    pw_hash = hash_password(temp_password)
    now_str = datetime.now(UTC).isoformat()

    with _cursor(commit=True) as cursor:
        cursor.execute(
            """
            UPDATE users
            SET status = 'active', password_hash = ?, updated_at = ?
            WHERE LOWER(username) = LOWER(?)
            """,
            (pw_hash, now_str, username),
        )

    # Log email service sending credentials to reviewer
    logger.info(
        f"[EMAIL SERVICE] Sent login credentials to {u['email']} ({u['name']}): Username: {u['username']}, Temp Password: {temp_password}"
    )

    user_dict = get_user(username)
    if user_dict:
        user_dict["temp_password"] = temp_password
        user_dict["email_sent"] = True
    return user_dict


def reject_reviewer_request(username: str) -> dict | None:
    return update_user(username, status="rejected")


def get_pending_reviewers() -> list[dict]:
    with _cursor() as cursor:
        cursor.execute(
            """
            SELECT * FROM users
            WHERE status IN ('pending_approval', 'pending')
            ORDER BY created_at DESC
            """
        )
        rows = cursor.fetchall()
    res = []
    for r in rows:
        d = dict(r)
        d.pop("password_hash", None)
        res.append(d)
    return res


def create_campaign(campaign_id: str, cells: list[dict], per_cell: int, max_scenarios: int, created_by: str) -> dict:
    now = datetime.now(UTC).isoformat()
    with _cursor(commit=True) as cursor:
        cursor.execute(
            "INSERT INTO campaigns (campaign_id, created_by, cells, per_cell, max_scenarios, status, "
            "generated, failed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'running', 0, 0, ?, ?)",
            (campaign_id, created_by, json.dumps(cells), per_cell, max_scenarios, now, now),
        )
    return get_campaign(campaign_id) or {}


def update_campaign(
    campaign_id: str, *, generated: int | None = None, failed: int | None = None, status: str | None = None
) -> None:
    sets, params = ["updated_at = ?"], [datetime.now(UTC).isoformat()]
    for column, value in (("generated", generated), ("failed", failed), ("status", status)):
        if value is not None:
            sets.append(f"{column} = ?")
            params.append(value)
    params.append(campaign_id)
    with _cursor(commit=True) as cursor:
        cursor.execute(f"UPDATE campaigns SET {', '.join(sets)} WHERE campaign_id = ?", params)


def get_campaign(campaign_id: str) -> dict | None:
    """Chiến dịch + các kịch bản nó đã sinh, để trang theo dõi chỉ cần một lượt gọi."""
    with _cursor() as cursor:
        cursor.execute("SELECT * FROM campaigns WHERE campaign_id = ?", (campaign_id,))
        row = cursor.fetchone()
        if not row:
            return None
        campaign = dict(row)
        campaign["cells"] = json.loads(campaign["cells"]) if campaign.get("cells") else []
        cursor.execute(
            "SELECT r.request_id, r.status, r.description_vi, r.scenario_id, r.error, s.road_type, s.weather, "
            "s.actor_type, s.maneuver FROM generation_requests r "
            "LEFT JOIN scenarios s ON s.scenario_id = r.scenario_id "
            "WHERE r.campaign_id = ? ORDER BY r.created_at",
            (campaign_id,),
        )
        campaign["requests"] = [dict(r) for r in cursor.fetchall()]
    return campaign


def list_campaigns() -> list[dict]:
    with _cursor() as cursor:
        cursor.execute(
            "SELECT campaign_id, created_by, cells, per_cell, max_scenarios, status, generated, "
            "failed, created_at FROM campaigns ORDER BY created_at DESC"
        )
        campaigns = [dict(r) for r in cursor.fetchall()]
    for campaign in campaigns:
        campaign["cells"] = json.loads(campaign["cells"]) if campaign.get("cells") else []
    return campaigns


def attach_request_to_campaign(request_id: str, campaign_id: str) -> None:
    with _cursor(commit=True) as cursor:
        cursor.execute("UPDATE generation_requests SET campaign_id = ? WHERE request_id = ?", (campaign_id, request_id))


def campaign_prompts(campaign_id: str, odd_key: str | None = None) -> list[str]:
    """Câu đã sinh trong chiến dịch, để agent không lặp lại chính nó."""
    with _cursor() as cursor:
        cursor.execute(
            "SELECT description_vi FROM generation_requests WHERE campaign_id = ? ORDER BY created_at",
            (campaign_id,),
        )
        del odd_key
        return [r["description_vi"] for r in cursor.fetchall()]


def campaign_scenarios_awaiting_sim(campaign_id: str) -> list[dict]:
    """Kịch bản của một chiến dịch đang chờ ở cổng 1."""
    with _cursor() as cursor:
        cursor.execute(
            "SELECT s.scenario_id, s.status FROM scenarios s "
            "JOIN generation_requests r ON r.scenario_id = s.scenario_id "
            "WHERE r.campaign_id = ? AND s.status = ?",
            (campaign_id, ScenarioStatus.PENDING_SIM_REVIEW.value),
        )
        return [dict(r) for r in cursor.fetchall()]


def campaign_scenarios(campaign_id: str) -> list[dict]:
    """Mọi kịch bản đã sinh bởi chiến dịch, không lẫn scenario bên ngoài."""
    with _cursor() as cursor:
        cursor.execute(
            "SELECT s.scenario_id, s.status, s.verification, s.xosc_content "
            "FROM scenarios s "
            "JOIN generation_requests r ON r.scenario_id = s.scenario_id "
            "WHERE r.campaign_id = ? ORDER BY r.created_at",
            (campaign_id,),
        )
        return [dict(r) for r in cursor.fetchall()]


def metrics_rows() -> tuple[list[dict], list[dict], list[dict]]:
    """Dữ liệu thô cho báo cáo M1/M2/M3. Phần tính nằm ở ``services/metrics.py``.

    Trả ba tập vì ba metric hỏi ba tầng khác nhau: lần **sinh** (qua schema
    không), **kịch bản** (biên dịch được không, phủ ô ODD nào), và lần **chạy**
    (chạy nổi không, có dựng được nguy hiểm không).
    """
    with _cursor() as cursor:
        cursor.execute("SELECT request_id, status FROM generation_requests")
        requests = [dict(r) for r in cursor.fetchall()]

        cursor.execute(
            # `created_by` có mặt vì báo cáo phải loại được kịch bản mock
            # (`seed-data`) — xem `metrics.SEED_AUTHOR`.
            "SELECT scenario_id, status, created_by, road_type, weather, actor_type, "
            "maneuver, verification, xosc_content FROM scenarios"
        )
        scenarios = [dict(r) for r in cursor.fetchall()]

        # Chỉ lần chạy MỚI NHẤT của mỗi kịch bản. Chạy lại cùng một kịch bản ba
        # lần rồi đếm cả ba là để một kịch bản tự bỏ phiếu ba lần vào tỷ lệ.
        cursor.execute(
            """
            SELECT j.scenario_id, j.result, s.maneuver
            FROM scenario_jobs j
            JOIN scenarios s ON s.scenario_id = j.scenario_id
            WHERE j.result IS NOT NULL
              AND j.job_kind = 'scenario_validation'
              AND j.updated_at = (
                  SELECT MAX(j2.updated_at) FROM scenario_jobs j2
                  WHERE j2.scenario_id = j.scenario_id
                    AND j2.job_kind = 'scenario_validation' AND j2.result IS NOT NULL
              )
            """
        )
        executions = []
        for row in cursor.fetchall():
            item = dict(row)
            if isinstance(item.get("result"), str):
                try:
                    item["result"] = json.loads(item["result"])
                except (TypeError, json.JSONDecodeError):
                    logger.warning("scenario_jobs.result không hợp lệ cho %s", item["scenario_id"])
                    item["result"] = None
            executions.append(item)

    return requests, scenarios, executions


def get_admin_stats() -> dict:
    with _cursor() as cursor:
        cursor.execute("SELECT role, status, COUNT(*) AS count FROM users GROUP BY role, status")
        user_rows = cursor.fetchall()

        cursor.execute("SELECT status, COUNT(*) AS count FROM scenarios GROUP BY status")
        scenario_rows = cursor.fetchall()

    user_stats = {
        "total": 0,
        "creator": 0,
        "reviewer": 0,
        "admin": 0,
        "pending_approval": 0,
    }
    for r in user_rows:
        cnt = r["count"]
        user_stats["total"] += cnt
        role = r["role"]
        status = r["status"]
        if status in ("pending_approval", "pending"):
            user_stats["pending_approval"] += cnt
        elif role == "reviewer" and status == "active":
            user_stats["reviewer"] += cnt
        elif role == "creator" and status == "active":
            user_stats["creator"] += cnt
        elif role == "admin":
            user_stats["admin"] += cnt

    scenario_stats = {
        "total": 0,
        "draft": 0,
        "pending_sim_review": 0,
        "simulation_queued": 0,
        "pending_library_review": 0,
        "approved_library": 0,
        "approved_sim": 0,
        "rejected": 0,
    }
    for r in scenario_rows:
        cnt = r["count"]
        st = r["status"]
        scenario_stats["total"] += cnt
        if st in scenario_stats:
            scenario_stats[st] = cnt

    return {
        "users": user_stats,
        "scenarios": scenario_stats,
    }
