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
from typing import Any

from src.agents.state import ForgeState

logger = logging.getLogger(__name__)

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


def _get_val_str(obj: Any) -> str | None:
    if obj is None:
        return None
    if hasattr(obj, "value"):
        return str(obj.value)
    return str(obj)


def _build_odd_query_text(state: ForgeState) -> str | None:
    """Trích xuất và tổng hợp ODD thành câu query tiếng Việt."""
    parsed_intent = state.get("parsed_intent")
    odd_query = state.get("odd_query")
    odd_hints = state.get("odd_hints")

    source = parsed_intent or odd_query or odd_hints
    if source is None:
        return None

    if isinstance(source, dict):
        road_type = _get_val_str(source.get("road_type"))
        weather = _get_val_str(source.get("weather"))
        actor_type = _get_val_str(source.get("actor_type"))
        maneuver = _get_val_str(source.get("maneuver"))
    else:
        odd_obj = getattr(source, "odd_query", source)
        road_type = _get_val_str(getattr(odd_obj, "road_type", None))
        weather = _get_val_str(getattr(odd_obj, "weather", None))
        actor_type = _get_val_str(getattr(odd_obj, "actor_type", None))
        maneuver = _get_val_str(getattr(odd_obj, "maneuver", None))

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


def get_chroma_client():
    """Hàm helper kết nối ChromaDB client (dễ dàng patch trong unit tests)."""
    import chromadb

    return chromadb.Client()


def retrieve_node(state: ForgeState, k: int = 3) -> dict:
    """Node 2: retrieve — Semantic Search lấy k kịch bản mẫu từ ChromaDB."""
    query_text = _build_odd_query_text(state)

    if not query_text:
        logger.warning("[NODE 2 WARNING] parsed_intent/ODD rỗng hoặc không hợp lệ")
        print("[NODE 2 OUTPUT] Retrieved Examples Count: 0")
        return {
            "examples": [],
            "retrieved_examples": [],
        }

    retrieved_examples: list[dict] = []

    try:
        client = get_chroma_client()
        collection = client.get_collection("scenarios")
        results = collection.query(query_texts=[query_text], n_results=k)

        if results and "documents" in results and results["documents"]:
            docs = results["documents"][0]
            metadatas = results.get("metadatas", [[]])[0]
            ids = results.get("ids", [[]])[0]

            for i, doc in enumerate(docs):
                meta = metadatas[i] if i < len(metadatas) else {}
                doc_id = ids[i] if i < len(ids) else f"ex_{i + 1}"
                retrieved_examples.append(
                    {
                        "id": doc_id,
                        "title": meta.get("title", f"Kịch bản mẫu {i + 1}"),
                        "content": doc,
                        "metadata": meta,
                    }
                )
    except Exception as exc:
        logger.warning(f"[NODE 2 WARNING] ChromaDB query failed or collection missing: {exc}")
        retrieved_examples = []

    print(f"[NODE 2 OUTPUT] Retrieved Examples Count: {len(retrieved_examples)}")

    return {
        "examples": retrieved_examples,
        "retrieved_examples": retrieved_examples,
    }
