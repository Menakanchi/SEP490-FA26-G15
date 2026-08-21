"""Unit tests cho Node 2 (retrieve) tuân thủ ADR-013, ADR-011, ADR-006."""

import sqlite3

import pytest

from src.agents.nodes.retrieve import retrieve_node
from src.services.library.retriever import SQLiteRetriever, generate_text_embedding


@pytest.fixture
def temp_sqlite_db(tmp_path):
    """Tạo database SQLite tạm thời phục vụ unit test."""
    db_path = tmp_path / "test_app.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute(
        """
        CREATE TABLE scenarios (
            scenario_id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'approved_library',
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

    vec1 = generate_text_embedding("Xe máy tạt đầu ô tô ở đường đô thị thẳng")
    vec2 = generate_text_embedding("Xe tải phanh gấp trên cao tốc mưa lớn")
    vec3 = generate_text_embedding("Xe nâng di chuyển ngang đường nội bộ")
    vec_unapproved = generate_text_embedding("Kịch bản chưa được duyệt")

    test_data = [
        (
            "sc_001",
            "approved_library",
            "Xe máy tạt đầu",
            "Xe máy tạt đầu ô tô",
            "urban_straight",
            "clear",
            "motorcycle",
            "cut_in",
            vec1.tobytes(),
        ),
        (
            "sc_002",
            "approved_library",
            "Xe tải phanh gấp",
            "Xe tải phanh gấp cao tốc",
            "highway",
            "heavy_rain",
            "truck",
            "sudden_brake",
            vec2.tobytes(),
        ),
        (
            "sc_003",
            "approved_library",
            "Xe nâng đường nội bộ",
            "Xe nâng lùi chậm",
            "residential_narrow",
            "clear",
            "truck",
            "cut_in",
            vec3.tobytes(),
        ),
        (
            "sc_004",
            "pending_sim_review",
            "Xe con lấn làn",
            "Chưa được duyệt",
            "urban_straight",
            "clear",
            "car",
            "lane_drift",
            vec_unapproved.tobytes(),
        ),
        (
            "sc_005",
            "rejected",
            "Xe bus vượt đỏ",
            "Đã bị từ chối",
            "intersection",
            "clear",
            "bus",
            "run_red_light",
            vec_unapproved.tobytes(),
        ),
        ("sc_006", "approved_library", "Không có embedding", "Thiếu vector", "highway", "clear", "car", "cut_in", None),
    ]

    for item in test_data:
        cursor.execute(
            """
            INSERT INTO scenarios (scenario_id, status, title, description_vi, road_type, weather, actor_type, maneuver, embedding)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            item,
        )

    conn.commit()
    conn.close()
    return db_path


def test_sqlite_retriever_happy_path(temp_sqlite_db):
    """Test case 1: SQLiteRetriever truy vấn thành công kịch bản đã qua cổng approved_library."""
    retriever = SQLiteRetriever(db_path=temp_sqlite_db)
    state = {
        "user_query": "Xe máy tạt đầu ô tô ở đường đô thị",
        "parsed_intent": {
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": "motorcycle",
            "maneuver": "cut_in",
        },
    }

    result = retrieve_node(state, k=3, retriever=retriever)

    assert "retrieved_examples" in result
    assert len(result["retrieved_examples"]) >= 1
    first_ex = result["retrieved_examples"][0]
    assert first_ex["id"] == "sc_001"
    assert "Xe máy" in first_ex["title"]


def test_sqlite_retriever_odd_where_filtering(temp_sqlite_db):
    """Test case 2: SQL WHERE ODD Pre-filtering loại bỏ chính xác kịch bản không trùng khớp ODD."""
    retriever = SQLiteRetriever(db_path=temp_sqlite_db)

    # Lọc ODD road_type=highway, actor_type=truck, maneuver=sudden_brake
    results = retriever.retrieve(
        query_text="Xe tải phanh gấp cao tốc",
        odd_query={"road_type": "highway", "actor_type": "truck", "maneuver": "sudden_brake"},
        limit=3,
    )

    assert len(results) == 1
    assert results[0]["id"] == "sc_002"
    assert results[0]["metadata"]["road_type"] == "highway"


def test_sqlite_retriever_status_gate(temp_sqlite_db):
    """Test case 3: Kiểm tra Status Gate (ADR-011) - Chỉ trả về approved_library có embedding IS NOT NULL."""
    retriever = SQLiteRetriever(db_path=temp_sqlite_db)

    # Tìm kiếm các kịch bản bất kỳ
    results = retriever.retrieve(query_text="Kịch bản bất kỳ", odd_query=None, limit=10)
    returned_ids = [r["id"] for r in results]

    # sc_004 (pending_sim_review), sc_005 (rejected), sc_006 (embedding NULL) KHÔNG ĐƯỢC lọt vào kết quả
    assert "sc_004" not in returned_ids
    assert "sc_005" not in returned_ids
    assert "sc_006" not in returned_ids
    assert "sc_001" in returned_ids


def test_retrieve_empty_or_missing_db(tmp_path):
    """Test case 4: DB không tồn tại / rỗng / SQL WHERE không khớp -> Trả về [] an toàn cho Zero-Shot mode."""
    missing_db = tmp_path / "non_existent.db"
    retriever = SQLiteRetriever(db_path=missing_db)

    state = {
        "user_query": "Kịch bản độc lạ chưa từng có",
        "parsed_intent": {"road_type": "highway", "actor_type": "bicycle", "maneuver": "jaywalk"},
    }

    result = retrieve_node(state, retriever=retriever)

    assert result["retrieved_examples"] == []
    assert result["examples"] == []


def test_retrieve_with_invalid_intent():
    """Test case 5: State rỗng/invalid intent -> Node 2 xử lý an toàn không văng exception."""
    result_empty = retrieve_node({})
    assert result_empty["retrieved_examples"] == []
    assert result_empty["examples"] == []

    result_none = retrieve_node({"parsed_intent": None})
    assert result_none["retrieved_examples"] == []
