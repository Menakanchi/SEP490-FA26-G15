"""Nạp kịch bản mẫu vào bảng ``scenarios`` để retrieval có gì mà tìm.

Chạy: ``python scripts/seed_db.py`` (sau ``python scripts/init_db.py``).

Ba điều đáng nói về cách script này viết:

1. **Không tự ``CREATE TABLE``.** Schema có đúng một nguồn là
   ``src/services/persistence.py`` (ADR-011 §3.2). Bản trước tự dựng bảng và
   ``DROP TABLE IF EXISTS scenarios`` trước — nghĩa là chạy seed một lần nữa sẽ
   **xoá sạch kịch bản người dùng đã sinh**, im lặng, không hỏi.

2. **Bốn cột ODD ghi giá trị enum thuần.** ADR-013 chốt lọc bằng ``WHERE`` trên
   bốn cột có index. Bản trước ghi ``"truck:xe_ben"`` nên mọi
   ``WHERE actor_type = 'truck'`` trượt hết — retrieval trả rỗng mà không báo
   lỗi. Chi tiết ("xe ben") sống trong ``spec.odd.specific_type``.

3. **Seed vào thẳng ``approved_library`` kèm embedding.** Đây là ngoại lệ duy
   nhất với luật "embedding chỉ ghi khi duyệt": seed *là* nội dung đã được người
   viết script duyệt sẵn. Không có vector thì chúng không lọt vào retrieval và
   cả thư viện mẫu thành vô dụng.

ChromaDB đã bỏ: ADR-013 chốt không có vector store riêng.
"""

from __future__ import annotations

import json
import logging
import sqlite3
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(ROOT_DIR))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("seed_db")

# `actor_type` / `maneuver` là giá trị enum của schemas.py — chỉ những giá trị
# converter có template. `specific_type` / `specific_action` giữ nguyên chữ mô
# tả, và chính chúng là thứ làm hai kịch bản cùng ô ODD vẫn khác nhau khi
# retrieval xếp hạng bằng cosine.
SEED_SCENARIOS = [
    {
        "scenario_id": "sc_seed_001",
        "title": "Xe tải bung thùng rơi kiện hàng trên cao tốc",
        "description_vi": (
            "Xe tải chở hàng bị bung thùng rơi kiện hàng xuống đường cao tốc "
            "khiến các xe phía sau phải phanh gấp đánh lái gấp."
        ),
        "odd": {
            "road_type": "highway",
            "weather": "clear",
            "actor_type": "truck",
            "maneuver": "lane_drift",
            "specific_type": "xe tải bung thùng",
            "specific_action": "rơi kiện hàng",
        },
    },
    {
        "scenario_id": "sc_seed_002",
        "title": "Xe trộn bê tông lùi chậm vào công trình",
        "description_vi": (
            "Xe trộn bê tông lùi chậm vào cổng công trình xây dựng chắn ngang làn đường ô tô đang lưu thông."
        ),
        "odd": {
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": "truck",
            "maneuver": "stop_in_lane",
            "specific_type": "xe trộn bê tông",
            "specific_action": "lùi chậm",
        },
    },
    {
        "scenario_id": "sc_seed_003",
        "title": "Xe máy tạt đầu ô tô tại ngã tư",
        "description_vi": "Xe máy tạt đầu đột ngột cướp làn ô tô ngay tại ngã tư có đèn giao thông.",
        "odd": {
            "road_type": "intersection",
            "weather": "clear",
            "actor_type": "motorcycle",
            "maneuver": "cut_in",
            "specific_type": "xe máy",
            "specific_action": "tạt đầu",
        },
    },
    {
        "scenario_id": "sc_seed_004",
        "title": "Xe buýt dừng đột ngột giữa làn đón khách",
        "description_vi": "Xe buýt tạt lề dừng đột ngột giữa làn đón trả khách gây phanh gấp cho xe đi sau.",
        "odd": {
            # "bus" không phải một ActorType: nó quy về `truck` (phương tiện lớn,
            # có blueprint CARLA). Chữ "xe buýt" không mất — nó ở specific_type.
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": "truck",
            "maneuver": "sudden_brake",
            "specific_type": "xe buýt",
            "specific_action": "dừng đột ngột đón khách",
        },
    },
    {
        "scenario_id": "sc_seed_005",
        "title": "Người đi bộ băng qua đường trong mưa lớn",
        "description_vi": (
            "Người đi bộ bất ngờ băng qua đường trong điều kiện trời mưa lớn tầm nhìn hạn chế, "
            "ô tô phía sau phải phanh gấp."
        ),
        "odd": {
            "road_type": "urban_straight",
            "weather": "heavy_rain",
            "actor_type": "pedestrian",
            "maneuver": "jaywalk",
            "specific_type": "người đi bộ",
            "specific_action": "băng qua đường",
        },
    },
    {
        "scenario_id": "sc_seed_006",
        "title": "Xe ben lấn làn trong sương mù dày đặc",
        "description_vi": "Xe ben chở đất lấn làn đè vạch suýt quẹt ô tô ngược chiều trong sương mù dày đặc.",
        "odd": {
            "road_type": "highway",
            "weather": "fog",
            "actor_type": "truck",
            "maneuver": "lane_drift",
            "specific_type": "xe ben chở đất",
            "specific_action": "lấn làn đè vạch",
        },
    },
    {
        "scenario_id": "sc_seed_007",
        "title": "Xe máy đi ngược chiều trên đường đô thị ban đêm",
        "description_vi": "Xe máy bật đèn pha đi ngược chiều trên đường đô thị ban đêm làm chói mắt tài xế.",
        "odd": {
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": "motorcycle",
            "maneuver": "wrong_way",
            "specific_type": "xe máy số",
            "specific_action": "đi ngược chiều bật đèn pha",
        },
    },
    {
        "scenario_id": "sc_seed_008",
        "title": "Xe container dừng khẩn cấp tránh chướng ngại vật",
        "description_vi": (
            "Xe container thắng gấp dừng chết giữa làn đường do phát hiện chướng ngại vật trên đường cao tốc."
        ),
        "odd": {
            "road_type": "highway",
            "weather": "clear",
            "actor_type": "truck",
            "maneuver": "stop_in_lane",
            "specific_type": "xe container",
            "specific_action": "dừng chết giữa làn",
        },
    },
    {
        "scenario_id": "sc_seed_009",
        "title": "Xe con vượt ẩu tạt đầu xe tải trên cao tốc",
        "description_vi": "Xe con vượt bên phải rồi tạt đầu ép xe tải trên đường cao tốc ở tốc độ cao.",
        "odd": {
            # "overtake" quy về `cut_in`: vượt rồi tạt đầu là đúng hình học cut_in.
            "road_type": "highway",
            "weather": "clear",
            "actor_type": "car",
            "maneuver": "cut_in",
            "specific_type": "xe con sedan",
            "specific_action": "vượt ẩu tạt đầu",
        },
    },
    {
        "scenario_id": "sc_seed_010",
        "title": "Xe 16 chỗ giảm tốc đột ngột va chạm xe máy",
        "description_vi": "Xe 16 chỗ giảm tốc đột ngột chuyển làn rẽ vào ngõ làm xe máy phía sau phanh không kịp.",
        "odd": {
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": "truck",
            "maneuver": "sudden_brake",
            "specific_type": "xe 16 chỗ",
            "specific_action": "giảm tốc đột ngột",
        },
    },
]


def _searchable_text(scenario: dict) -> str:
    """Chuỗi đem đi embed. Gộp cả nhãn ODD lẫn chữ mô tả.

    Chỉ embed title + description thì hai kịch bản khác hẳn ô ODD nhưng tả bằng
    từ giống nhau sẽ nằm sát nhau trong không gian vector — mà ODD mới là thứ
    người dùng thực sự đang lọc theo.
    """
    odd = scenario["odd"]
    return (
        f"{scenario['title']}. {scenario['description_vi']} "
        f"Loại đường: {odd['road_type']}, thời tiết: {odd['weather']}, "
        f"tác nhân: {odd['actor_type']} ({odd['specific_type']}), "
        f"hành vi: {odd['maneuver']} ({odd['specific_action']})."
    )


def seed_database() -> None:
    from src.config import get_settings
    from src.services.db import init_db
    from src.services.library.retriever import generate_text_embedding, pack_blob_embedding

    init_db()

    url = get_settings().database_url
    prefix = "sqlite:///"
    if not url.startswith(prefix):
        raise SystemExit(f"seed_db chỉ chạy trên SQLite; DATABASE_URL đang là {url!r}")
    db_path = Path(url[len(prefix) :])

    logger.info("Nạp %d kịch bản mẫu vào %s", len(SEED_SCENARIOS), db_path)
    conn = sqlite3.connect(db_path)
    try:
        cursor = conn.cursor()
        for scenario in SEED_SCENARIOS:
            odd = scenario["odd"]
            vector = generate_text_embedding(_searchable_text(scenario))
            spec = {
                "scenario_id": scenario["scenario_id"],
                "title": scenario["title"],
                "description_vi": scenario["description_vi"],
                "odd": odd,
            }
            cursor.execute(
                """
                INSERT OR REPLACE INTO scenarios
                (scenario_id, status, title, description_vi, spec, xosc_content, assumptions,
                 tags, road_type, weather, actor_type, maneuver, embedding, embedding_model, created_at)
                VALUES (?, 'approved_library', ?, ?, ?, ?, '[]', '["seed"]', ?, ?, ?, ?, ?, ?, datetime('now'))
                """,
                (
                    scenario["scenario_id"],
                    scenario["title"],
                    scenario["description_vi"],
                    json.dumps(spec, ensure_ascii=False),
                    "<OpenSCENARIO/>",
                    odd["road_type"],
                    odd["weather"],
                    odd["actor_type"],
                    odd["maneuver"],
                    pack_blob_embedding(vector),
                    "text-embedding-3-small",
                ),
            )
        conn.commit()
    finally:
        conn.close()

    logger.info("Xong. %d kịch bản mẫu ở trạng thái approved_library, có embedding.", len(SEED_SCENARIOS))


if __name__ == "__main__":
    seed_database()
