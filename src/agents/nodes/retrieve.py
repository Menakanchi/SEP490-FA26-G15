"""Node 2: retrieve — Semantic Search kịch bản mẫu từ ChromaDB dựa trên ODD parsed_intent.

Nhiệm vụ:
  1. Nhận `parsed_intent` (hoặc `odd_query`/`odd_hints`) từ State.
  2. Tổng hợp ODD thành câu query tiếng Việt (ví dụ: "Đường đô thị thẳng, trời quang, xe máy, tạt đầu").
  3. Kết nối tới ChromaDB để thực hiện Semantic Search lấy Top-K (mặc định k = 3).
  4. Xử lý ngoại lệ an toàn: nếu ChromaDB rỗng/chưa khởi tạo hoặc parsed_intent là None -> trả về [] và log warning.
  5. Cập nhật state["retrieved_examples"] và state["examples"].
  6. Log console: `[NODE 2 OUTPUT] Retrieved Examples Count: X`.
"""

from __future__ import annotations

import logging

from src.agents.state import ForgeState
from src.models.schemas import odd_axis_value
from src.services.library.retriever import BaseRetriever, SQLiteRetriever

logger = logging.getLogger(__name__)

_ODD_AXES = ("road_type", "weather", "actor_type", "maneuver")

ROAD_TYPE_VI = {
    "urban_straight": "Đường đô thị thẳng",
    "intersection": "Ngã tư",
    "roundabout": "Vòng xoay",
    "highway": "Cao tốc",
    "residential_narrow": "Đường hẹp khu dân cư",
    "curve": "Đường cong",
}

WEATHER_VI = {
    "clear": "Trời quang",
    "rain": "Mưa nhẹ",
    "heavy_rain": "Mưa lớn",
    "fog": "Sương mù",
    "night": "Ban đêm",
    "overcast": "Trời âm u",
}

ACTOR_TYPE_VI = {
    "motorcycle": "Xe máy",
    "car": "Ô tô",
    "truck": "Xe tải",
    "bus": "Xe bus",
    "pedestrian": "Người đi bộ",
    "bicycle": "Xe đạp",
}

MANEUVER_VI = {
    "cut_in": "Tạt đầu",
    "sudden_brake": "Phanh gấp",
    "lane_drift": "Lấn làn",
    "run_red_light": "Vượt đèn đỏ",
    "jaywalk": "Băng qua đường",
    "wrong_way": "Đi ngược chiều",
    "stop_in_lane": "Dừng giữa làn",
}


def _build_odd_query_text(state: ForgeState) -> str | None:
    """Trích xuất và tổng hợp ODD thành câu query tiếng Việt."""
    parsed_intent = state.get("parsed_intent")
    odd_query = state.get("odd_query")
    odd_hints = state.get("odd_hints")

    source = parsed_intent or odd_query or odd_hints
    if source is None:
        return None

    # ``default=""`` chứ không ``"unknown"``: giá trị này chỉ dùng để ghép câu
    # query, và một trục vắng mặt phải biến mất khỏi câu chứ không thành chữ
    # "unknown" đi vào embedding.
    if isinstance(source, dict):
        road_type, weather, actor_type, maneuver = (odd_axis_value(source.get(axis), "") for axis in _ODD_AXES)
    else:
        odd_obj = getattr(source, "odd_query", source)
        road_type, weather, actor_type, maneuver = (
            odd_axis_value(getattr(odd_obj, axis, None), "") for axis in _ODD_AXES
        )

    parts = []
    if road_type:
        parts.append(ROAD_TYPE_VI.get(road_type, road_type))
    if weather:
        parts.append(WEATHER_VI.get(weather, weather))
    if actor_type:
        parts.append(ACTOR_TYPE_VI.get(actor_type, actor_type))
    if maneuver:
        parts.append(MANEUVER_VI.get(maneuver, maneuver))

    if not parts:
        return None

    return ", ".join(parts)


def retrieve_node(state: ForgeState, k: int = 3, retriever: BaseRetriever | None = None) -> dict:
    """Node 2: retrieve — Hybrid ODD Pre-filtering SQL WHERE + NumPy Cosine Similarity (ADR-013, ADR-006, ADR-011)."""
    limit = state.get("limit") or state.get("k") or k
    query_text = state.get("user_query") or _build_odd_query_text(state)

    if not query_text:
        logger.warning("[NODE 2 WARNING] parsed_intent/ODD rỗng hoặc không hợp lệ")
        print("[NODE 2 OUTPUT] Retrieved Examples Count: 0")
        return {
            "examples": [],
            "retrieved_examples": [],
        }

    odd_source = state.get("odd_query") or state.get("parsed_intent") or state.get("odd_hints")
    active_retriever = retriever or SQLiteRetriever()

    try:
        retrieved_examples = active_retriever.retrieve(query_text, odd_query=odd_source, limit=limit)
        retrieved_examples = retrieved_examples[:limit]
    except Exception as exc:
        logger.warning(f"[NODE 2 WARNING] Retrieval failed: {exc}")
        retrieved_examples = []

    print(f"[NODE 2 OUTPUT] Retrieved Examples Count: {len(retrieved_examples)}")

    return {
        "examples": retrieved_examples,
        "retrieved_examples": retrieved_examples,
    }
