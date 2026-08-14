"""Service layer cho SQLite Database Persistence (ADR-011 & ADR-013).

Quản lý 4 bảng chính trong SQLite `./data/app.db`:
- `scenarios`
- `generation_requests`
- `review_decisions`
- `scenario_jobs`
"""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
import numpy as np

logger = logging.getLogger(__name__)

DB_PATH = Path("./data/app.db")


def _get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Khởi tạo cấu trúc 4 bảng SQLite nếu chưa tồn tại."""
    conn = _get_connection()
    cursor = conn.cursor()

    # 1. scenarios
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS scenarios (
            scenario_id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'pending_review',
            title TEXT NOT NULL,
            description_vi TEXT NOT NULL,
            spec TEXT,
            xosc_content TEXT,
            assumptions TEXT,
            tags TEXT,
            road_type TEXT,
            weather TEXT,
            actor_type TEXT,
            maneuver TEXT,
            embedding BLOB,
            embedding_model TEXT,
            created_at TEXT
        )
    """
    )

    # 2. generation_requests
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS generation_requests (
            request_id TEXT PRIMARY KEY,
            description_vi TEXT,
            validation_mode TEXT,
            status TEXT,
            step TEXT,
            progress INTEGER,
            scenario_id TEXT,
            limit_val INTEGER DEFAULT 3,
            issue_history TEXT,
            node_metrics TEXT,
            failed_reason TEXT,
            error TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    """
    )
    try:
        cursor.execute("ALTER TABLE generation_requests ADD COLUMN limit_val INTEGER DEFAULT 3")
    except Exception:
        pass

    # 3. review_decisions
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS review_decisions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scenario_id TEXT NOT NULL,
            gate TEXT NOT NULL,
            approved INTEGER NOT NULL,
            reviewer TEXT NOT NULL,
            reason TEXT,
            created_at TEXT NOT NULL
        )
    """
    )

    # 4. scenario_jobs
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS scenario_jobs (
            job_id TEXT PRIMARY KEY,
            scenario_id TEXT NOT NULL,
            status TEXT NOT NULL,
            claimed_by TEXT,
            claimed_at TEXT,
            result TEXT,
            xosc_content TEXT,
            created_at TEXT,
            updated_at TEXT
        )
    """
    )

    conn.commit()
    conn.close()


# Ensure tables are initialized on import
init_db()


# ---------------------------------------------------------------------------
# Generation Requests CRUD
# ---------------------------------------------------------------------------


def create_generation_request(request_id: str, description_vi: str, validation_mode: str, limit: int = 3) -> dict:
    conn = _get_connection()
    cursor = conn.cursor()
    now_str = datetime.now(UTC).isoformat()
    req_dict = {
        "request_id": request_id,
        "description_vi": description_vi,
        "validation_mode": validation_mode,
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
        (request_id, description_vi, validation_mode, limit_val, status, step, progress, scenario_id, error, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """,
        (
            request_id,
            description_vi,
            validation_mode,
            limit,
            "running",
            "queued",
            0,
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
    if "limit_val" in d and d["limit_val"] is not None:
        d["limit"] = d["limit_val"]
    elif "limit" not in d:
        d["limit"] = 3
    return d


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

    rt = str(odd.get("road_type", "unknown"))
    wt = str(odd.get("weather", "unknown"))

    at = odd.get("actor_type", "unknown")
    if isinstance(at, dict):
        at_str = f"{at.get('category','')}:{at.get('specific_type','')}"
    else:
        at_str = str(at)

    mv = odd.get("maneuver", "unknown")
    if isinstance(mv, dict):
        mv_str = f"{mv.get('category','')}:{mv.get('specific_action','')}"
    else:
        mv_str = str(mv)

    spec_json = json.dumps(spec, ensure_ascii=False)
    assumptions_json = json.dumps(assumptions or [], ensure_ascii=False)
    tags_json = json.dumps(tags or [], ensure_ascii=False)

    try:
        from src.services.library.retriever import generate_text_embedding
        vec = generate_text_embedding(f"{title} {description_vi}")
        blob_bytes = sqlite3.Binary(vec.astype(np.float32).tobytes()) if vec is not None and len(vec) > 0 else None
    except Exception as exc:
        logger.warning(f"Lỗi khi sinh embedding trong save_scenario: {exc}")
        blob_bytes = None

    cursor.execute(
        """
        INSERT OR REPLACE INTO scenarios
        (scenario_id, status, title, description_vi, spec, xosc_content, assumptions, tags, road_type, weather, actor_type, maneuver, embedding, embedding_model, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            blob_bytes,
            "text-embedding-3-small",
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
        "created_at": row_dict.get("created_at"),
    }
    return sc_dict


def update_scenario_status(scenario_id: str, new_status: str) -> None:
    conn = _get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT title, description_vi, embedding FROM scenarios WHERE scenario_id = ?", (scenario_id,))
    row = cursor.fetchone()

    if row and not row["embedding"]:
        try:
            from src.services.library.retriever import generate_text_embedding
            embed_text = f"{row['title']} {row['description_vi']}"
            vec = generate_text_embedding(embed_text)
            blob_bytes = sqlite3.Binary(vec.astype(np.float32).tobytes()) if vec is not None and len(vec) > 0 else None
            cursor.execute(
                "UPDATE scenarios SET status = ?, embedding = ?, embedding_model = ? WHERE scenario_id = ?",
                (new_status, blob_bytes, "text-embedding-3-small", scenario_id),
            )
        except Exception:
            cursor.execute("UPDATE scenarios SET status = ? WHERE scenario_id = ?", (new_status, scenario_id))
    else:
        cursor.execute("UPDATE scenarios SET status = ? WHERE scenario_id = ?", (new_status, scenario_id))

    conn.commit()
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
