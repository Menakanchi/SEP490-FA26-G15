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

import json
import logging
from typing import Any

from src.agents.state import ForgeState
from src.services.library.retriever import BaseRetriever, SQLiteRetriever

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


def _extract_odd_components(state: ForgeState) -> dict:
    """Bóc tách các trục ODD chi tiết (category + specific) từ state."""
    parsed_intent = state.get("parsed_intent")
    odd_query = state.get("odd_query")
    odd_hints = state.get("odd_hints")

    source = odd_query or parsed_intent or odd_hints
    if source is None:
        return {
            "actor_category": "unknown",
            "actor_specific": "unknown",
            "maneuver_category": "unknown",
            "maneuver_specific": "unknown",
            "road_type": "unknown",
            "weather": "unknown",
        }

    actor_cat = "unknown"
    actor_spec = "unknown"
    man_cat = "unknown"
    man_spec = "unknown"
    road_type = "unknown"
    weather = "unknown"

    if isinstance(source, dict):
        rt = source.get("road_type")
        wt = source.get("weather")
        at = source.get("actor_type")
        mv = source.get("maneuver")

        road_type = _get_val_str(rt) or "unknown"
        weather = _get_val_str(wt) or "unknown"

        if isinstance(at, dict):
            actor_cat = at.get("category", "unknown")
            actor_spec = at.get("specific_type", "unknown")
        elif at:
            actor_cat = _get_val_str(at) or "unknown"

        if isinstance(mv, dict):
            man_cat = mv.get("category", "unknown")
            man_spec = mv.get("specific_action", "unknown")
        elif mv:
            man_cat = _get_val_str(mv) or "unknown"
    else:
        odd_obj = getattr(source, "odd_query", source)
        road_type = _get_val_str(getattr(odd_obj, "road_type", None)) or "unknown"
        weather = _get_val_str(getattr(odd_obj, "weather", None)) or "unknown"

        at_obj = getattr(odd_obj, "actor_type", None)
        if at_obj:
            if hasattr(at_obj, "category"):
                actor_cat = getattr(at_obj, "category", "unknown")
                actor_spec = getattr(at_obj, "specific_type", "unknown")
            else:
                actor_cat = _get_val_str(at_obj) or "unknown"

        mv_obj = getattr(odd_obj, "maneuver", None)
        if mv_obj:
            if hasattr(mv_obj, "category"):
                man_cat = getattr(mv_obj, "category", "unknown")
                man_spec = getattr(mv_obj, "specific_action", "unknown")
            else:
                man_cat = _get_val_str(mv_obj) or "unknown"

    return {
        "actor_category": str(actor_cat or "unknown").lower(),
        "actor_specific": str(actor_spec or "unknown").lower(),
        "maneuver_category": str(man_cat or "unknown").lower(),
        "maneuver_specific": str(man_spec or "unknown").lower(),
        "road_type": str(road_type or "unknown").lower(),
        "weather": str(weather or "unknown").lower(),
    }


def _extract_meta_odd_components(meta: dict) -> dict:
    """Bóc tách các trục ODD từ metadata hoặc odd_json của kịch bản DB."""
    odd_data = meta.get("odd")
    if isinstance(odd_data, str):
        try:
            odd_data = json.loads(odd_data)
        except Exception:
            odd_data = {}
    elif not isinstance(odd_data, dict):
        odd_data = meta

    rt = odd_data.get("road_type", meta.get("road_type", "unknown"))
    wt = odd_data.get("weather", meta.get("weather", "unknown"))

    at = odd_data.get("actor_type", meta.get("actor_type", "unknown"))
    mv = odd_data.get("maneuver", meta.get("maneuver", "unknown"))

    actor_cat = "unknown"
    actor_spec = "unknown"
    if isinstance(at, dict):
        actor_cat = at.get("category", "unknown")
        actor_spec = at.get("specific_type", "unknown")
    elif isinstance(at, str):
        if ":" in at:
            parts = at.split(":", 1)
            actor_cat, actor_spec = parts[0], parts[1]
        else:
            actor_cat = at

    man_cat = "unknown"
    man_spec = "unknown"
    if isinstance(mv, dict):
        man_cat = mv.get("category", "unknown")
        man_spec = mv.get("specific_action", "unknown")
    elif isinstance(mv, str):
        if ":" in mv:
            parts = mv.split(":", 1)
            man_cat, man_spec = parts[0], parts[1]
        else:
            man_cat = mv

    return {
        "actor_category": str(actor_cat or "unknown").lower(),
        "actor_specific": str(actor_spec or "unknown").lower(),
        "maneuver_category": str(man_cat or "unknown").lower(),
        "maneuver_specific": str(man_spec or "unknown").lower(),
        "road_type": str(rt or "unknown").lower(),
        "weather": str(wt or "unknown").lower(),
    }


def _compute_text_overlap(query_text: str, target_text: str) -> float:
    """Tính tỷ lệ trùng khớp từ vựng giữa user query và tiêu đề/nội dung kịch bản."""
    if not query_text or not target_text:
        return 0.0
    q_words = set(w.lower() for w in query_text.replace(",", "").replace(".", "").split() if len(w) > 1)
    if not q_words:
        return 0.0

    target_lower = target_text.lower()
    match_count = sum(1 for w in q_words if w in target_lower)
    return max(0.0, min(1.0, match_count / len(q_words)))


def _calculate_hybrid_score(
    query_odd: dict,
    item_odd: dict,
    vector_sim: float,
    user_query: str = "",
    item_title_content: str = "",
) -> float:
    """Tính điểm Hybrid Similarity = ODD Metadata Match Score + Enhanced Semantic Score.

    Trọng số:
      - Semantic & Phrase Match (tối đa 40%): Vector Cosine Sim (*0.30) + Text Phrase Overlap (*0.10)
      - Actor Match (tối đa 30%): Category (+20%), Specific (+10%)
      - Maneuver Match (tối đa 20%): Category (+12%), Specific (+8%) (có fallback keyword trong title/content)
      - Context Match (tối đa 10%): Road Type (+5%), Weather (+5%)
    """
    score = 0.0

    # 1. Semantic & Phrase Match (up to 40%)
    vector_sim_clamped = max(0.0, min(1.0, vector_sim))
    text_overlap = _compute_text_overlap(user_query, item_title_content)
    score += vector_sim_clamped * 0.30
    score += text_overlap * 0.10

    # 2. Actor Score (up to 30%)
    q_actor_cat = query_odd.get("actor_category", "unknown")
    q_actor_spec = query_odd.get("actor_specific", "unknown")
    i_actor_cat = item_odd.get("actor_category", "unknown")
    i_actor_spec = item_odd.get("actor_specific", "unknown")

    if q_actor_cat != "unknown" and q_actor_cat == i_actor_cat:
        score += 0.20
    if q_actor_spec != "unknown" and q_actor_spec == i_actor_spec:
        score += 0.10

    # 3. Maneuver Score (up to 20%)
    q_man_cat = query_odd.get("maneuver_category", "unknown")
    q_man_spec = query_odd.get("maneuver_specific", "unknown")
    i_man_cat = item_odd.get("maneuver_category", "unknown")
    i_man_spec = item_odd.get("maneuver_specific", "unknown")

    if q_man_cat != "unknown" and q_man_cat == i_man_cat:
        score += 0.12
    if q_man_spec != "unknown" and q_man_spec == i_man_spec:
        score += 0.08
    elif q_man_cat == "unknown" and item_title_content:
        content_lower = item_title_content.lower()
        if any(kw in content_lower for kw in ["giam toc", "phanh gap", "lui cham", "tat dau", "roi kien hang"]):
            score += 0.10

    # 4. Context Score (up to 10%)
    q_road = query_odd.get("road_type", "unknown")
    q_weather = query_odd.get("weather", "unknown")
    i_road = item_odd.get("road_type", "unknown")
    i_weather = item_odd.get("weather", "unknown")

    if q_road != "unknown" and q_road == i_road:
        score += 0.05
    if q_weather != "unknown" and q_weather == i_weather:
        score += 0.05

    return round(max(0.0, min(1.0, score)), 2)


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
