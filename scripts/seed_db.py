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

3. **Seed vào thẳng ``approved_library`` kèm embedding.** Ngoại lệ duy nhất với
   luật "embedding chỉ ghi khi duyệt". Nhưng ngoại lệ đó phải trả giá bằng bằng
   chứng, không phải bằng sự tự tin: mỗi seed đi qua đúng ``validate_node`` của
   sản phẩm trước khi được nạp, và trường ``carla`` ghi lại nó đã chạy thật trên
   CARLA chưa, kết quả ra sao.

   Vì sao phải ghi: seed là ví dụ few-shot mà LLM bắt chước. Seed sai được nhân
   bản vào mọi kịch bản sinh sau đó, rồi kịch bản đó được duyệt và thành seed
   mới — một vòng tự khẳng định không có cách nào phát hiện từ bên trong. Ghi
   xuất xứ thì ít nhất **đếm được** bao nhiêu phần trăm thư viện là thứ đã kiểm
   chứng thật.

   ``carla`` nhận ba giá trị:
   - ``adversarial``    — chạy được VÀ tái hiện đúng nguy hiểm đã mô tả
   - ``ran-no-hazard``  — chạy trót lọt nhưng KHÔNG dựng được tình huống nguy hiểm
   - ``unverified``     — chưa chạy được (ngoài phạm vi converter)

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
        "scenario_id": "sc_901",
        "carla": ("ran-no-hazard", "chạy 30s, CollisionTest=0 — không dựng được nguy hiểm"),
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
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 90.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "truck",
                "position": {"lane_offset": -1, "s_offset_m": 25.0},
                "initial_speed_kmh": 70.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {"actor_name": "adv", "maneuver": "lane_drift", "trigger": {"type": "simulation_time", "value": 6.0}}
        ],
        "duration_s": 30.0,
    },
    {
        "scenario_id": "sc_902",
        "carla": ("unverified", "ngoài phạm vi converter ADR-016, chưa chạy được"),
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
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 40.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "truck",
                "position": {"lane_offset": 0, "s_offset_m": 35.0},
                "initial_speed_kmh": 10.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "stop_in_lane",
                "trigger": {"type": "simulation_time", "value": 5.0},
                "target_speed_kmh": 0.0,
            }
        ],
        "duration_s": 30.0,
    },
    {
        "scenario_id": "sc_903",
        "carla": ("unverified", "ngoài phạm vi converter ADR-016, chưa chạy được"),
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
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 40.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "motorcycle",
                "position": {"lane_offset": -1, "s_offset_m": -20.0},
                "initial_speed_kmh": 55.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "cut_in",
                "trigger": {"type": "simulation_time", "value": 6.0},
                "target_speed_kmh": 25.0,
            }
        ],
        "duration_s": 30.0,
    },
    {
        "scenario_id": "sc_904",
        "carla": ("unverified", "ngoài phạm vi converter ADR-016, chưa chạy được"),
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
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 40.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "truck",
                "position": {"lane_offset": 0, "s_offset_m": 30.0},
                "initial_speed_kmh": 35.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "sudden_brake",
                "trigger": {"type": "simulation_time", "value": 7.0},
                "target_speed_kmh": 0.0,
            }
        ],
        "duration_s": 30.0,
    },
    {
        "scenario_id": "sc_905",
        "carla": ("unverified", "ngoài phạm vi converter ADR-016, chưa chạy được"),
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
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 35.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "pedestrian",
                "position": {"lane_offset": -1, "s_offset_m": 30.0},
                "initial_speed_kmh": 5.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "jaywalk",
                "trigger": {"type": "distance_to_ego", "value": 25.0},
                "target_speed_kmh": 5.0,
            }
        ],
        "duration_s": 30.0,
    },
    {
        "scenario_id": "sc_906",
        "carla": ("ran-no-hazard", "chạy 30s, CollisionTest=0 — không dựng được nguy hiểm"),
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
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 70.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "truck",
                "position": {"lane_offset": -1, "s_offset_m": 20.0},
                "initial_speed_kmh": 60.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {"actor_name": "adv", "maneuver": "lane_drift", "trigger": {"type": "simulation_time", "value": 8.0}}
        ],
        "duration_s": 30.0,
    },
    {
        "scenario_id": "sc_907",
        "carla": ("unverified", "ngoài phạm vi converter ADR-016, chưa chạy được"),
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
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 45.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "motorcycle",
                "position": {"lane_offset": -1, "s_offset_m": 60.0},
                "initial_speed_kmh": 30.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {"actor_name": "adv", "maneuver": "wrong_way", "trigger": {"type": "simulation_time", "value": 4.0}}
        ],
        "duration_s": 30.0,
    },
    {
        "scenario_id": "sc_908",
        "carla": ("ran-no-hazard", "chạy 6s, CollisionTest=0 — không dựng được nguy hiểm"),
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
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 90.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "truck",
                "position": {"lane_offset": 0, "s_offset_m": 45.0},
                "initial_speed_kmh": 80.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "stop_in_lane",
                "trigger": {"type": "simulation_time", "value": 6.0},
                "target_speed_kmh": 0.0,
            }
        ],
        "duration_s": 30.0,
    },
    {
        "scenario_id": "sc_909",
        "carla": ("adversarial", "chạy 13.3s, CollisionTest=1 — tái hiện đúng va chạm"),
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
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 90.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "car",
                "position": {"lane_offset": -1, "s_offset_m": -30.0},
                "initial_speed_kmh": 110.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "cut_in",
                "trigger": {"type": "simulation_time", "value": 7.0},
                "target_speed_kmh": 60.0,
            }
        ],
        "duration_s": 30.0,
    },
    {
        "scenario_id": "sc_910",
        "carla": ("unverified", "ngoài phạm vi converter ADR-016, chưa chạy được"),
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
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 50.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "truck",
                "position": {"lane_offset": 0, "s_offset_m": 25.0},
                "initial_speed_kmh": 45.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "sudden_brake",
                "trigger": {"type": "simulation_time", "value": 6.0},
                "target_speed_kmh": 5.0,
            }
        ],
        "duration_s": 30.0,
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


def _validated_spec(scenario: dict) -> dict:
    """Dựng ``ScenarioSpec`` và **bắt nó đi qua đúng validator của sản phẩm**.

    Đây là chỗ trả lời một câu hỏi thẳng: seed là dữ liệu tự viết, vậy lấy gì
    đảm bảo nó đúng? Nếu không kiểm, seed thành *khẳng định* chứ không phải
    *bằng chứng* — mà chúng lại là ví dụ few-shot mà LLM bắt chước. Sai ở đây
    được nhân bản vào mọi kịch bản sinh sau đó, và không có cơ chế nào phát hiện.

    Kiểm tĩnh không thay được việc chạy CARLA, nhưng nó chặn được toàn bộ lớp
    lỗi mà `validate_node` biết: sai bất biến, lệch nhãn ODD, hình học vô lý.
    Seed nào không qua thì **không được nạp**, thay vì nạp rồi hy vọng.
    """
    import asyncio

    from src.agents.nodes.validate_node import validate_node
    from src.models.schemas import IssueSeverity, ScenarioDraft, ScenarioSpec

    # Đi đúng con đường mà kịch bản sinh thật đi: draft -> validate -> promote.
    # `validate_node` kiểm `ScenarioDraft`, và draft KHÔNG được có scenario_id
    # hay description_vi — hai trường đó là của backend, cấp ở bước promote.
    draft = ScenarioDraft.model_validate(
        {
            "title": scenario["title"],
            "odd": scenario["odd"],
            "time_of_day": scenario.get("time_of_day", "day"),
            "actors": scenario["actors"],
            "maneuvers": scenario["maneuvers"],
            "duration_s": scenario["duration_s"],
        }
    )
    # `odd_query` là nhãn NGƯỜI DÙNG nói ra, và validate cần nó để bắt
    # ODD_LABEL_DRIFT — trường hợp draft tự đổi nhãn so với thứ được yêu cầu.
    # Thiếu nó thì validate trả VALIDATION_CONTEXT_MISSING và từ chối kiểm, thay
    # vì lặng lẽ bỏ qua một phép kiểm. Với seed thì nhãn trong `odd` chính là
    # yêu cầu gốc, nên truyền lại đúng nó.
    odd_query = {axis: scenario["odd"][axis] for axis in ("road_type", "weather", "actor_type", "maneuver")}
    result = asyncio.run(validate_node({"draft": draft.model_dump(mode="json"), "odd_query": odd_query}))
    blocking = [i for i in result.get("issues", []) if i.severity is IssueSeverity.ERROR]
    if blocking:
        detail = "\n    ".join(f"{i.code.value} tại {i.path}: {i.message_vi}" for i in blocking)
        raise SystemExit(f"Seed {scenario['scenario_id']} không qua validate — không nạp.\n    {detail}")

    spec = ScenarioSpec.promote(
        draft,
        scenario_id=scenario["scenario_id"],
        description_vi=scenario["description_vi"],
    )
    return spec.model_dump(mode="json")


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
            spec = _validated_spec(scenario)
            cursor.execute(
                """
                INSERT OR REPLACE INTO scenarios
                (scenario_id, status, title, description_vi, spec, xosc_content, assumptions,
                 tags, road_type, weather, actor_type, maneuver, embedding, embedding_model, created_at)
                VALUES (?, 'approved_library', ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """,
                (
                    scenario["scenario_id"],
                    scenario["title"],
                    scenario["description_vi"],
                    json.dumps(spec, ensure_ascii=False),
                    "<OpenSCENARIO/>",
                    # Xuất xứ đi kèm dữ liệu, không nằm trong đầu người viết.
                    json.dumps(["seed", f"carla:{scenario['carla'][0]}"], ensure_ascii=False),
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
