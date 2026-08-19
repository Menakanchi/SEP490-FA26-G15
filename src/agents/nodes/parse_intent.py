"""Node 1: parse_intent — Phân tích ý định người dùng và trích xuất ODD theo Mô hình Taxonomy Phân cấp (Sub-Category Model)."""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from enum import StrEnum
from pathlib import Path
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from src.agents.prompts.parse_intent import SYSTEM_PROMPT
from src.agents.state import ForgeState
from src.models.schemas import (
    DEFAULT_SUPPORT_POLICY,
    ActorType,
    IssueCode,
    ManeuverType,
    ODDQuery,
    RoadType,
    ValidationIssue,
    Weather,
)
from src.services.llm import get_llm

logger = logging.getLogger(__name__)

TAXONOMY_RULES_PATH = Path(__file__).resolve().parent.parent.parent / "schemas" / "taxonomy_rules.json"


def _load_taxonomy_rules() -> dict:
    if TAXONOMY_RULES_PATH.exists():
        try:
            return json.loads(TAXONOMY_RULES_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning(f"Không thể đọc taxonomy_rules.json: {exc}")
    return {}


# Từ vựng taxonomy rộng hơn ma trận ODD, và phải rộng hơn: người dùng gõ "xe
# khách", "vượt ẩu" — không gõ "truck", "cut_in". Nhưng ``ODDCell`` chỉ nhận
# đúng 4 ActorType và 7 ManeuverType mà converter có template.
#
# Quy đổi ở đây, ngay tại biên parse, thay vì nới enum trong ``schemas.py``:
# thêm ``bus`` và ``overtake`` vào enum sẽ nở mẫu số ``ODD coverage`` bằng những
# ô mà converter không dựng nổi — coverage tụt vì đổi định nghĩa mẫu số, không
# phải vì hệ thống kém đi (ADR-016 chốt phạm vi đã kiểm chứng là 76 ô).
#
# Chữ gốc người dùng gõ **không mất**: nó đi tiếp trong ``specific_type`` /
# ``specific_action`` của ``ODDCell``.
#
# Muốn ``bus``/``overtake`` thành trục thật thì cần template converter tương ứng
# + errata cho ADR-016 — không phải sửa một dòng enum.
_ACTOR_ALIASES: dict[str, ActorType] = {
    "bus": ActorType.TRUCK,  # xe khách/xe buýt: phương tiện lớn, dùng blueprint truck
    "xe_bus": ActorType.TRUCK,
    "xe_khach": ActorType.TRUCK,
    "bicycle": ActorType.MOTORCYCLE,  # hai bánh, không có blueprint riêng trong phạm vi hiện tại
}

_MANEUVER_ALIASES: dict[str, ManeuverType] = {
    "overtake": ManeuverType.CUT_IN,  # "vượt ẩu tạt đầu" — hình học trùng cut_in
    "lane_departure": ManeuverType.LANE_DRIFT,
}


def _to_actor_type(code: str | None) -> ActorType | None:
    """Mã actor từ taxonomy về ``ActorType``, hoặc ``None`` nếu không quy được."""
    if not code:
        return None
    code = code.strip().lower()
    if code in _ACTOR_ALIASES:
        return _ACTOR_ALIASES[code]
    try:
        return ActorType(code)
    except ValueError:
        return None


def _to_maneuver_type(code: str | None) -> ManeuverType | None:
    """Mã hành vi từ taxonomy về ``ManeuverType``, hoặc ``None``."""
    if not code:
        return None
    code = code.strip().lower()
    if code in _MANEUVER_ALIASES:
        return _MANEUVER_ALIASES[code]
    try:
        return ManeuverType(code)
    except ValueError:
        return None


def _remove_accents(text: str) -> str:
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d").replace("Đ", "D")


def _find_keyword(text: str, kw: str) -> int:
    """Tìm vị trí kw trong text với ràng buộc ranh giới từ (word boundary)."""
    pattern = r"(?<!\w)" + re.escape(kw) + r"(?!\w)"
    match = re.search(pattern, text)
    return match.start() if match else -1


def _rule_based_extract(user_query: str, rules: dict) -> dict:
    """BƯỚC 1: Rule-based matching từ taxonomy_rules.json -> dict chứa các trục ODD."""
    if not rules:
        return {}

    query_raw = user_query.lower()
    query_no_accents = _remove_accents(query_raw)

    road_type = None
    weather = None

    # 1. Road Type
    for code, keywords in rules.get("road_type", {}).items():
        if code != "unknown":
            for kw in keywords:
                if _find_keyword(query_raw, kw) != -1 or _find_keyword(query_no_accents, kw) != -1:
                    try:
                        road_type = RoadType(code)
                    except ValueError:
                        pass
                    break
            if road_type:
                break

    # 2. Weather
    for code, keywords in rules.get("weather", {}).items():
        if code != "unknown":
            for kw in keywords:
                if _find_keyword(query_raw, kw) != -1 or _find_keyword(query_no_accents, kw) != -1:
                    try:
                        weather = Weather(code)
                    except ValueError:
                        pass
                    break
            if weather:
                break

    # 3. Maneuver
    maneuver_matches: list[tuple[int, int, str]] = []
    for code, keywords in rules.get("maneuver", {}).items():
        if code == "unknown":
            continue
        for kw in keywords:
            p1, p2 = _find_keyword(query_raw, kw), _find_keyword(query_no_accents, kw)
            positions = [p for p in (p1, p2) if p != -1]
            if positions:
                min_pos = min(positions)
                maneuver_matches.append((min_pos, len(kw), code))

    maneuver_obj = None
    maneuver_spec = None
    if maneuver_matches:
        maneuver_matches.sort(key=lambda x: x[0])
        maneuver_obj = _to_maneuver_type(maneuver_matches[0][2])
        pos, kw_len, _ = maneuver_matches[0]
        maneuver_spec = user_query[pos : pos + kw_len].strip()

    # 4. Actor Type — Span matching với word boundary (Bỏ qua cụm từ chỉ hạ tầng như 'làn ô tô', 'vỉa hè')
    raw_spans: list[tuple[int, int, str]] = []
    for code, keywords in rules.get("actor_type", {}).items():
        if code == "unknown":
            continue
        for kw in keywords:
            for text in (query_raw, query_no_accents):
                pos = _find_keyword(text, kw)
                if pos != -1:
                    prefix = text[max(0, pos - 12) : pos].lower()
                    if "lan" in prefix or "làn" in prefix or "via he" in prefix or "vỉa hè" in prefix:
                        continue
                    raw_spans.append((pos, pos + len(kw), code))

    raw_spans.sort(key=lambda x: x[1] - x[0], reverse=True)
    non_overlapping_spans: list[tuple[int, int, str]] = []
    for s, e, code in raw_spans:
        is_subspan = any(existing_s <= s and e <= existing_e for existing_s, existing_e, _ in non_overlapping_spans)
        if not is_subspan:
            non_overlapping_spans.append((s, e, code))

    non_overlapping_spans.sort(key=lambda x: x[0])

    actor_obj = None
    actor_spec = None
    parsed_actors: list[dict] = []

    if non_overlapping_spans:
        s, e, raw_code = non_overlapping_spans[0]
        actor_obj = _to_actor_type(raw_code)
        actor_spec = user_query[s:e].strip()

        if len(non_overlapping_spans) >= 2:
            s0, e0, code0 = non_overlapping_spans[0]
            s1, e1, code1 = non_overlapping_spans[1]
            spec0 = user_query[s0:e0].strip()
            spec1 = user_query[s1:e1].strip()
            cat0 = code0
            cat1 = code1

            parsed_actors = [
                {"name": "hero", "category": cat0, "specific_type": spec0, "role": "ego"},
                {"name": "adversary_1", "category": cat1, "specific_type": spec1, "role": "adversary"},
            ]
        else:
            cat0 = raw_code
            parsed_actors = [
                {"name": "hero", "category": cat0, "specific_type": actor_spec, "role": "ego"},
            ]

    return {
        "road_type": road_type,
        "weather": weather,
        "actor_type": actor_obj,
        "maneuver": maneuver_obj,
        "specific_type": actor_spec,
        "specific_action": maneuver_spec,
        "actors": parsed_actors,
    }


def parse_intent_node(state: ForgeState) -> dict:
    """Node 1: parse_intent — Xử lý ý định người dùng."""
    user_query = state.get("user_query", "").strip()

    # Guardrail: Chặn prompt rác / quá ngắn
    if len(user_query) < 10 or len(user_query.split()) < 3 or user_query.isnumeric():
        raise ValueError("Mô tả kịch bản quá ngắn hoặc không đủ thông tin kịch bản giao thông.")

    rules = _load_taxonomy_rules()

    # BƯỚC 1: Rule-based extraction local
    rule_dict = _rule_based_extract(user_query, rules)
    is_rule_complete = (rule_dict.get("actor_type") is not None) and (rule_dict.get("maneuver") is not None)

    odd_query: ODDQuery | None = None

    if is_rule_complete:
        logger.info("Khớp hoàn toàn từ Rule-based local (Bước 1), bỏ qua LLM call.")
        odd_query = ODDQuery(
            road_type=rule_dict.get("road_type"),
            weather=rule_dict.get("weather"),
            actor_type=rule_dict.get("actor_type"),
            maneuver=rule_dict.get("maneuver"),
            specific_type=rule_dict.get("specific_type"),
            specific_action=rule_dict.get("specific_action"),
            inferred=[],
        )
    else:
        # BƯỚC 2: Gọi LLM nếu Bước 1 chưa trích xuất đủ cả 2 trục bắt buộc
        logger.info("Chuyển sang BƯỚC 2: Gọi LLM Fallback (AI Semantic Extraction)")
        try:
            llm = get_llm()
            structured_llm = llm.with_structured_output(ODDQuery)
            messages = [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=f"Mô tả kịch bản: {user_query}"),
            ]
            odd_query = structured_llm.invoke(messages)
        except Exception as err:
            logger.warning(f"LLM Call failed ({err}). Reverting to Rule-based fallback.")
            if rule_dict.get("actor_type") or rule_dict.get("maneuver"):
                odd_query = ODDQuery(
                    road_type=rule_dict.get("road_type"),
                    weather=rule_dict.get("weather"),
                    actor_type=rule_dict.get("actor_type"),
                    maneuver=rule_dict.get("maneuver"),
                    specific_type=rule_dict.get("specific_type"),
                    specific_action=rule_dict.get("specific_action"),
                    inferred=[],
                )
            else:
                issue = ValidationIssue(
                    code=IssueCode.LLM_PROVIDER_ERROR,
                    message_vi=f"Lỗi khi gọi mô hình AI phân tích ODD: {err}",
                    suggestion="Vui lòng kiểm tra lại cấu hình LLM (API Key, hạn ngạch hoặc kết nối mạng).",
                )
                return {"issues": [issue]}

    # Danh sách actor **không** nằm trong ``ODDQuery``: model đó mô tả bốn trục
    # ODD, không mô tả dàn diễn viên. Trước đây chỗ này nhét nó vào bằng
    # ``object.__setattr__`` — thao tác đi vòng qua Pydantic, nên trường lậu đó
    # không được validate, không có trong ``model_dump()``, và biến mất im lặng
    # ở bất kỳ chỗ nào serialize lại object. Thread thẳng qua state thay vì vậy.
    actors = rule_dict.get("actors") or []

    # Không đọc nổi trục nào = prompt không phải mô tả giao thông.
    if all(getattr(odd_query, axis) is None for axis in ODDQuery.AXES):
        raise ValueError("Không thể nhận diện tình huống giao thông từ prompt. Vui lòng cung cấp mô tả rõ ràng hơn.")

    def _axis(value: object, fallback: str = "unknown") -> str:
        return str(value.value) if isinstance(value, StrEnum) else fallback

    at_cat = _axis(odd_query.actor_type)
    mv_cat = _axis(odd_query.maneuver)
    parsed_intent: dict[str, Any] = {
        "road_type": _axis(odd_query.road_type),
        "weather": _axis(odd_query.weather),
        "actor_type": {
            "category": at_cat,
            "specific_type": odd_query.specific_type or (at_cat if at_cat != "unknown" else None),
        },
        "maneuver": {
            "category": mv_cat,
            "specific_action": odd_query.specific_action or (mv_cat if mv_cat != "unknown" else None),
        },
        "actors": actors,
    }

    if missing := odd_query.missing_required_axes():
        issue = ValidationIssue(
            code=IssueCode.NEED_MORE_DETAIL,
            message_vi=f"Mô tả chưa rõ thông tin bắt buộc: {', '.join(missing)}",
            suggestion="Hãy ghi rõ loại phương tiện và hành vi (ví dụ: xe máy tạt đầu)",
        )
        return {"parsed_intent": parsed_intent, "odd_query": odd_query, "issues": [issue]}

    # Điền hai trục bối cảnh còn trống. Truyền policy tường minh: mặc định của
    # `with_defaults` cũng là nó, nhưng viết ra thì người đọc thấy ngay rằng
    # road_type mặc định phụ thuộc phạm vi converter (ADR-016), không phải hằng số.
    odd_hints, assumptions = odd_query.with_defaults(DEFAULT_SUPPORT_POLICY)

    parsed_intent["road_type"] = odd_hints.road_type.value
    parsed_intent["weather"] = odd_hints.weather.value
    parsed_intent["actor_type"]["category"] = odd_hints.actor_type.value
    parsed_intent["maneuver"]["category"] = odd_hints.maneuver.value

    if not DEFAULT_SUPPORT_POLICY.supports(odd_hints.road_type, odd_hints.actor_type, odd_hints.maneuver):
        issue = ValidationIssue(
            code=IssueCode.UNSUPPORTED_COMBINATION,
            message_vi=(
                f"Chưa hỗ trợ tổ hợp ({odd_hints.road_type.value}, "
                f"{odd_hints.actor_type.value}, {odd_hints.maneuver.value})."
            ),
            suggestion="Phạm vi hiện tại là cao tốc (ADR-016). Thử mô tả lại tình huống trên cao tốc.",
        )
        return {
            "parsed_intent": parsed_intent,
            "odd_query": odd_query,
            "odd_hints": odd_hints,
            "issues": [issue],
        }

    return {
        "parsed_intent": parsed_intent,
        "odd_query": odd_query,
        "odd_hints": odd_hints,
        "assumptions": assumptions,
        "actors": actors,
        "issues": [],
    }
