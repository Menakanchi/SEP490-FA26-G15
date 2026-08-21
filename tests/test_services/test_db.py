"""Bất biến của tầng truy vấn HTTP trên bốn bảng ADR-011.

Ba thứ được canh ở đây, và cả ba đều từng sai theo kiểu **không báo lỗi**:
schema bị định nghĩa hai lần, embedding ghi trước khi duyệt, và cột ODD ghi
chuỗi ghép làm `WHERE` trượt sạch.
"""

from __future__ import annotations

import ast
import sqlite3
from pathlib import Path

import pytest

from src.config import get_settings
from src.models.schemas import ScenarioStatus
from src.services import db
from src.services.persistence import metadata

SPEC = {
    "scenario_id": "sc_001",
    "title": "Xe máy tạt đầu",
    "description_vi": "Xe máy tạt đầu ô tô trên cao tốc",
    "odd": {
        "road_type": "highway",
        "weather": "clear",
        "actor_type": "motorcycle",
        "maneuver": "cut_in",
        "specific_type": "xe máy",
        "specific_action": "tạt đầu",
    },
}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(get_settings().database_url).removeprefix("sqlite:///"))
    conn.row_factory = sqlite3.Row
    return conn


def _save(scenario_id: str = "sc_001", odd: dict | None = None) -> None:
    db.save_scenario(
        scenario_id=scenario_id,
        title=SPEC["title"],
        description_vi=SPEC["description_vi"],
        spec=SPEC,
        odd=odd if odd is not None else SPEC["odd"],
        status=ScenarioStatus.PENDING_SIM_REVIEW.value,
        xosc_content="<OpenSCENARIO/>",
    )


def test_schema_has_one_definition_only() -> None:
    """``db.py`` không được tự dựng bảng — nó mượn schema của ``persistence.py``.

    Hai định nghĩa cùng trỏ vào một ``app.db`` thì ``CREATE TABLE IF NOT EXISTS``
    khiến bên chạy trước thắng, bên kia đọc/ghi trên schema lệch mà không có lỗi
    nào bắn ra. Test này đỏ ngay khi ai đó chép lại một khối ``CREATE TABLE``.
    """
    # Dùng AST chứ không grep: file này *nói về* CREATE TABLE trong docstring và
    # comment suốt. Chỉ chuỗi thật sự đem đi chạy mới tính.
    tree = ast.parse(Path(db.__file__ or "").read_text(encoding="utf-8"))
    docstrings = {id(node.value) for node in ast.walk(tree) if isinstance(node, ast.Expr)}
    executed_sql = [
        node.value
        for node in ast.walk(tree)
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in docstrings
    ]
    offenders = [sql for sql in executed_sql if "CREATE TABLE" in sql.upper()]
    assert not offenders, f"db.py không được định nghĩa schema, thấy: {offenders}"

    with _connect() as conn:
        tables = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert set(metadata.tables) <= tables


def test_importing_db_does_not_create_files(tmp_path, monkeypatch) -> None:
    """Import một module không được đẻ ra file trên đĩa.

    Bản trước gọi ``init_db()`` ở cấp module, nên chỉ cần ``import src.api.routes``
    — kể cả lúc pytest thu thập test — là ``data/app.db`` xuất hiện.
    """
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'never.db'}")
    get_settings.cache_clear()

    import importlib

    importlib.reload(db)
    assert not (tmp_path / "never.db").exists()


def test_pending_scenario_has_no_embedding() -> None:
    """ADR-011: vector chỉ ghi trong transaction duyệt BEFORE_LIBRARY.

    Đây là cách FR-03/FR-11 (*"chỉ scenario đã duyệt mới tìm lại được"*) được thi
    hành **bằng cấu trúc**: chưa duyệt thì không có vector, không có vector thì
    không lọt vào kết quả retrieval — kể cả khi người viết truy vấn quên mệnh đề
    ``status``.
    """
    _save()
    with _connect() as conn:
        row = conn.execute("SELECT status, embedding, embedding_model FROM scenarios").fetchone()
    assert row["status"] == ScenarioStatus.PENDING_SIM_REVIEW.value
    assert row["embedding"] is None
    assert row["embedding_model"] is None


def test_init_db_migrates_legacy_pending_review_to_first_gate() -> None:
    _save("sc_legacy")
    with _connect() as conn:
        conn.execute("UPDATE scenarios SET status = 'pending_review' WHERE scenario_id = 'sc_legacy'")
        conn.commit()

    db.init_db()

    assert db.get_scenario("sc_legacy")["status"] == ScenarioStatus.PENDING_SIM_REVIEW.value


def test_embedding_written_only_when_entering_library() -> None:
    """Chỉ ``approved_library`` mới sinh vector; ``rejected`` thì không.

    Điều kiện phải gắn vào trạng thái đích, không phải vào "embedding đang rỗng".
    Bản trước hễ thấy chưa có vector là sinh, nên một kịch bản **bị từ chối** vẫn
    có vector — tức là vẫn tìm lại được.
    """
    _save("sc_rejected")
    db.update_scenario_status("sc_rejected", ScenarioStatus.REJECTED.value)

    _save("sc_approved")
    db.update_scenario_status("sc_approved", ScenarioStatus.APPROVED_LIBRARY.value)

    with _connect() as conn:
        rows = {r["scenario_id"]: r for r in conn.execute("SELECT * FROM scenarios")}

    assert rows["sc_rejected"]["embedding"] is None, "kịch bản bị từ chối không được có vector"
    assert rows["sc_approved"]["embedding"] is not None
    # 1536 chiều × 4 byte float32 — hợp đồng BLOB của ADR-006/ADR-013.
    assert len(rows["sc_approved"]["embedding"]) == 1536 * 4


@pytest.mark.parametrize(
    "actor_value",
    [
        "motorcycle",
        {"category": "motorcycle", "specific_type": "xe ba gác"},
    ],
    ids=["chuỗi thuần", "dict có specific_type"],
)
def test_odd_columns_store_bare_enum_values(actor_value) -> None:
    """Cột ODD phải giữ đúng giá trị enum để ``WHERE`` còn khớp được.

    ADR-013 chốt lọc ODD bằng ``WHERE`` trên bốn cột có index. Ghi
    ``"motorcycle:xe ba gác"`` vào đó làm mọi ``WHERE actor_type = 'motorcycle'``
    trượt — retrieval trả rỗng và **không có lỗi nào bắn ra**.
    """
    _save(odd={**SPEC["odd"], "actor_type": actor_value})

    with _connect() as conn:
        matched = conn.execute("SELECT scenario_id FROM scenarios WHERE actor_type = 'motorcycle'").fetchall()
    assert len(matched) == 1


def test_generation_request_round_trips_retrieve_limit() -> None:
    """Top-k người dùng chọn phải sống sót qua DB — nó đổi kết quả retrieval."""
    db.create_generation_request("req_1", "Xe máy tạt đầu", "static", limit=7)
    assert db.get_generation_request("req_1")["limit"] == 7

    db.update_generation_request("req_1", step="retrieve", progress=25)
    updated = db.get_generation_request("req_1")
    assert (updated["step"], updated["progress"], updated["limit"]) == ("retrieve", 25, 7)


# ===========================================================================
# ADR-015 — khoá chặn trùng
# ===========================================================================


def test_init_db_backfill_description_normalized_cho_hang_cu() -> None:
    """Hàng ghi trước khi có cột này phải được điền, nếu không chúng vô hình.

    Đây là ca thật chứ không phải giả định: 10/27 kịch bản trên bản dev không có
    hàng ``generation_requests`` nào trỏ tới, và cả 10 đều đang ở
    ``approved_library`` — tức là đúng phần thư viện có sẵn nhiều nhất.
    """
    _save("sc_cu")
    with _connect() as conn:
        conn.execute("UPDATE scenarios SET description_normalized = NULL")
        conn.commit()

    db.init_db()

    with _connect() as conn:
        row = conn.execute("SELECT description_normalized FROM scenarios WHERE scenario_id = 'sc_cu'").fetchone()
    assert row["description_normalized"] == "xe máy tạt đầu ô tô trên cao tốc"


def test_tim_duoc_kich_ban_khong_co_generation_request() -> None:
    """LEFT JOIN, không INNER JOIN.

    Kịch bản seed không có hàng request nào trỏ tới; INNER JOIN làm chúng vô
    hình với phép tra trùng, và người dùng gõ lại một câu seed sẽ sinh bản sao.
    """
    _save("sc_seed")

    match = db.find_duplicate_prompt("xe máy tạt đầu ô tô trên cao tốc")

    assert match["scenario_id"] == "sc_seed"
    assert match["request_id"] is None


def test_cau_chua_tung_go_khong_phai_la_trung() -> None:
    _save("sc_001")
    assert db.find_duplicate_prompt("một câu hoàn toàn khác chưa ai gõ") is None
    assert db.find_duplicate_prompt("") is None


def test_migration_chay_lai_duoc_nhieu_lan() -> None:
    """``init_db`` là đường mà ``scripts/init_db.py`` gọi mỗi lần deploy.

    Không idempotent thì lần chạy thứ hai hoặc đổ vì index đã tồn tại, hoặc ghi
    đè khoá của những hàng lần một vừa điền.
    """
    _save("sc_001")
    db.init_db()
    db.init_db()

    assert db.find_duplicate_prompt("xe máy tạt đầu ô tô trên cao tốc")["scenario_id"] == "sc_001"
