"""Node 1: parse_intent — Phân tích ý định người dùng và trích xuất ODD theo Mô hình Taxonomy Phân cấp (Sub-Category Model)."""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from collections.abc import Mapping
from enum import StrEnum
from pathlib import Path
from typing import Any, TypeVar

from langchain_core.messages import HumanMessage, SystemMessage

from src.agents.prompts.parse_intent import SYSTEM_PROMPT
from src.agents.state import ForgeState
from src.models.schemas import (
    DEFAULT_SUPPORT_POLICY,
    TOO_VAGUE_MESSAGE,
    ActorType,
    IssueCode,
    ManeuverType,
    ODDQuery,
    RoadType,
    ValidationIssue,
    Weather,
    is_too_vague_to_generate,
    odd_axis_value,
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


_EnumT = TypeVar("_EnumT", bound=StrEnum)


def _to_enum(code: str | None, enum: type[_EnumT], aliases: Mapping[str, _EnumT]) -> _EnumT | None:
    """Mã taxonomy -> giá trị enum, hoặc ``None`` nếu không quy được.

    Actor và maneuver quy đổi theo **cùng một luật** — chuẩn hoá chữ, tra bảng
    bí danh, rồi thử chính enum — và trước đây có hai bản sao của luật đó. Chúng
    lệch nhau ngay lần đầu ai đó thêm `.strip()` hay đổi cách so chữ ở một bên,
    và triệu chứng là *một nửa* từ vựng taxonomy im lặng rơi về ``None``.
    """
    if not code:
        return None
    code = code.strip().lower()
    if code in aliases:
        return aliases[code]
    try:
        return enum(code)
    except ValueError:
        return None


def _to_actor_type(code: str | None) -> ActorType | None:
    return _to_enum(code, ActorType, _ACTOR_ALIASES)


def _to_maneuver_type(code: str | None) -> ManeuverType | None:
    return _to_enum(code, ManeuverType, _MANEUVER_ALIASES)


def _remove_accents(text: str) -> str:
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d").replace("Đ", "D")


def _find_keyword(text: str, kw: str) -> int:
    """Tìm vị trí kw trong text với ràng buộc ranh giới từ (word boundary)."""
    pattern = r"(?<!\w)" + re.escape(kw) + r"(?!\w)"
    match = re.search(pattern, text)
    return match.start() if match else -1


def _infer_actor_roles(
    query_no_accents: str,
    actor_spans: list[tuple[int, int, str]],
    maneuver_matches: list[tuple[int, int, str]],
) -> list[str]:
    """Suy vai trò từ quan hệ trong câu, không từ thứ tự actor.

    Chỉ gán khi có bằng chứng ngôn ngữ: actor gần nhất đứng trước hành vi là
    adversary; actor có cụm nạn nhân trong đoạn của nó là ego. Với đúng hai
    actor, biết chắc một đầu thì đầu còn lại là vai đối ứng. Mơ hồ thì giữ
    ``unknown`` để tầng sinh đọc toàn câu, thay vì code đoán bừa.
    """
    roles = ["unknown"] * len(actor_spans)

    if maneuver_matches:
        maneuver_pos = min(maneuver_matches, key=lambda match: match[0])[0]
        preceding = [idx for idx, (start, _end, _code) in enumerate(actor_spans) if start <= maneuver_pos]
        if preceding:
            roles[preceding[-1]] = "adversary"

    victim_pattern = re.compile(r"\b(?:bi|khong kip tranh|khong the tranh|phai ne tranh)\b")
    for idx, (start, end, _code) in enumerate(actor_spans):
        next_start = actor_spans[idx + 1][0] if idx + 1 < len(actor_spans) else len(query_no_accents)
        if victim_pattern.search(query_no_accents[end:next_start]):
            roles[idx] = "ego"

        # Người dùng gọi thẳng "ô tô ego" / "ego ô tô" là bằng chứng mạnh
        # hơn heuristic "actor gần maneuver nhất". Không ưu tiên marker này
        # thì câu fixture thật gán ô tô thành adversary chỉ vì nó được nhắc gần
        # chữ "tạt" hơn xe máy — rồi generator đảo luôn tốc độ 60/80.
        before = query_no_accents[max(0, start - 12) : start]
        after = query_no_accents[end : min(next_start, end + 24)]
        if re.search(r"\bego\s*$", before) or re.match(r"\s*(?:la\s+)?ego\b", after):
            roles[idx] = "ego"

    if len(roles) == 2 and roles.count("unknown") == 1:
        known_role = next(role for role in roles if role != "unknown")
        roles[roles.index("unknown")] = "ego" if known_role == "adversary" else "adversary"

    return roles


def _rule_based_extract(user_query: str, rules: dict) -> dict:
    """BƯỚC 1: Rule-based matching từ taxonomy_rules.json -> dict chứa các trục ODD."""
    if not rules:
        return {}

    query_raw = user_query.lower()
    query_no_accents = _remove_accents(query_raw)

    def _first_match(axis: str, enum: type[_EnumT]) -> _EnumT | None:
        """Giá trị enum đầu tiên có từ khoá xuất hiện trong câu.

        ``road_type`` và ``weather`` quét theo đúng cùng một cách; viết rời hai
        vòng lặp giống hệt nhau chỉ tạo hai chỗ để quên ``query_no_accents`` —
        và quên nó nghĩa là *"cao toc"* gõ không dấu không khớp gì cả.
        """
        for code, keywords in rules.get(axis, {}).items():
            if code == "unknown":
                continue
            if any(_find_keyword(query_raw, kw) != -1 or _find_keyword(query_no_accents, kw) != -1 for kw in keywords):
                try:
                    return enum(code)
                except ValueError:
                    return None
        return None

    road_type = _first_match("road_type", RoadType)
    weather = _first_match("weather", Weather)

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
                    # Chỉ bỏ khi tên phương tiện đứng NGAY SAU từ hạ tầng
                    # ("làn ô tô", "vỉa hè"). Kiểm tra ``"lan" in prefix``
                    # từng loại nhầm "..., tạt ra làn giữa, xe máy ..." chỉ vì
                    # chữ "làn" xuất hiện đâu đó trong 12 ký tự trước actor.
                    if re.search(r"(?:lan|làn|via he|vỉa hè)\s*$", prefix):
                        continue
                    raw_spans.append((pos, pos + len(kw), code))

    raw_spans.sort(key=lambda x: x[1] - x[0], reverse=True)
    non_overlapping_spans: list[tuple[int, int, str]] = []
    for s, e, code in raw_spans:
        is_subspan = any(existing_s <= s and e <= existing_e for existing_s, existing_e, _ in non_overlapping_spans)
        if not is_subspan:
            non_overlapping_spans.append((s, e, code))

    non_overlapping_spans.sort(key=lambda x: x[0])
    actor_roles = _infer_actor_roles(query_no_accents, non_overlapping_spans, maneuver_matches)

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
                {
                    "name": "hero" if actor_roles[0] == "ego" else "adversary_1",
                    "category": cat0,
                    "specific_type": spec0,
                    "role": actor_roles[0],
                },
                {
                    "name": "hero" if actor_roles[1] == "ego" else "adversary_2",
                    "category": cat1,
                    "specific_type": spec1,
                    "role": actor_roles[1],
                },
            ]
        else:
            cat0 = raw_code
            parsed_actors = [
                {
                    "name": "hero" if actor_roles[0] == "ego" else "actor_1",
                    "category": cat0,
                    "specific_type": actor_spec,
                    "role": actor_roles[0],
                },
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

    # Guardrail: Chặn prompt rác / quá ngắn. Cùng một ngưỡng với HTTP 400 ở
    # `POST /generate` — xem `is_too_vague_to_generate`.
    if is_too_vague_to_generate(user_query):
        raise ValueError(TOO_VAGUE_MESSAGE)

    rules = _load_taxonomy_rules()

    # BƯỚC 1: Rule-based extraction local
    rule_dict = _rule_based_extract(user_query, rules)
    is_rule_complete = (rule_dict.get("actor_type") is not None) and (rule_dict.get("maneuver") is not None)

    def _odd_query_from_rules() -> ODDQuery:
        """``rule_dict`` -> ``ODDQuery``. Dựng ở hai nhánh, viết một lần.

        Nhánh "rule khớp đủ" và nhánh "LLM hỏng, lùi về rule" đều dựng đúng cùng
        một object. Hai bản sao thì thêm một trường vào ``ODDQuery`` mà chỉ sửa
        một nhánh sẽ làm đường lui **im lặng** mất trường đó — và đường lui chỉ
        chạy khi LLM đã hỏng, tức là đúng lúc không ai đang nhìn.
        """
        return ODDQuery(
            road_type=rule_dict.get("road_type"),
            weather=rule_dict.get("weather"),
            actor_type=rule_dict.get("actor_type"),
            maneuver=rule_dict.get("maneuver"),
            specific_type=rule_dict.get("specific_type"),
            specific_action=rule_dict.get("specific_action"),
            inferred=[],
        )

    odd_query: ODDQuery | None = None

    if is_rule_complete:
        logger.info("Khớp hoàn toàn từ Rule-based local (Bước 1), bỏ qua LLM call.")
        odd_query = _odd_query_from_rules()
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
                odd_query = _odd_query_from_rules()
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

    at_cat = odd_axis_value(odd_query.actor_type)
    mv_cat = odd_axis_value(odd_query.maneuver)
    parsed_intent: dict[str, Any] = {
        "road_type": odd_axis_value(odd_query.road_type),
        "weather": odd_axis_value(odd_query.weather),
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
