"""Node 1: parse_intent — Phân tích ý định người dùng và trích xuất ODD theo Mô hình Taxonomy Phân cấp (Sub-Category Model)."""

from __future__ import annotations

import json
import logging
import unicodedata
from pathlib import Path

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


def _remove_accents(text: str) -> str:
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d").replace("Đ", "D")


def _slugify(text: str) -> str:
    cleaned = _remove_accents(text.strip().lower())
    return cleaned.replace(" ", "_")


import re


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
        try:
            maneuver_obj = ManeuverType(maneuver_matches[0][2])
        except ValueError:
            pass
        pos, kw_len, _ = maneuver_matches[0]
        maneuver_spec = user_query[pos : pos + kw_len].strip()

    # 4. Actor Type — Span matching với word boundary
    raw_spans: list[tuple[int, int, str]] = []
    for code, keywords in rules.get("actor_type", {}).items():
        if code == "unknown":
            continue
        for kw in keywords:
            for text in (query_raw, query_no_accents):
                pos = _find_keyword(text, kw)
                if pos != -1:
                    raw_spans.append((pos, pos + len(kw), code))

    raw_spans.sort(key=lambda x: (x[1] - x[0]), reverse=True)
    non_overlapping_spans: list[tuple[int, int, str]] = []
    for s, e, code in raw_spans:
        is_subspan = any(existing_s <= s and e <= existing_e for existing_s, existing_e, _ in non_overlapping_spans)
        if not is_subspan:
            non_overlapping_spans.append((s, e, code))

    non_overlapping_spans.sort(key=lambda x: x[0])

    actor_obj = None
    actor_spec = None
    if non_overlapping_spans:
        s, e, raw_code = non_overlapping_spans[0]
        try:
            if raw_code == "bicycle":
                actor_obj = ActorType.MOTORCYCLE
            else:
                actor_obj = ActorType(raw_code)
        except ValueError:
            pass
        actor_spec = user_query[s:e].strip()

    return {
        "road_type": road_type,
        "weather": weather,
        "actor_type": actor_obj,
        "maneuver": maneuver_obj,
        "specific_type": actor_spec,
        "specific_action": maneuver_spec,
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

    # Kiểm tra kịch bản hoàn toàn không đọc được (Unparsable)
    if (
        odd_query.actor_type is None
        and odd_query.maneuver is None
        and odd_query.road_type is None
        and odd_query.weather is None
    ):
        raise ValueError("Không thể nhận diện tình huống giao thông từ prompt. Vui lòng cung cấp mô tả rõ ràng hơn.")

    # 1. Gọi ODDQuery.missing_required_axes()
    missing = odd_query.missing_required_axes()
    if missing:
        issue = ValidationIssue(
            code=IssueCode.NEED_MORE_DETAIL,
            message_vi=f"Mô tả chưa rõ thông tin bắt buộc: {', '.join(missing)}",
            suggestion="Hãy ghi rõ loại phương tiện và hành vi (ví dụ: xe máy tạt đầu)",
        )
        return {"odd_query": odd_query, "issues": [issue]}

    # 2. Gọi ODDQuery.with_defaults(policy)
    odd_hints, assumptions = odd_query.with_defaults()

    # 3. Gọi SupportPolicy.supports(road_type, actor_type, maneuver)
    if not DEFAULT_SUPPORT_POLICY.supports(odd_hints.road_type, odd_hints.actor_type, odd_hints.maneuver):
        issue = ValidationIssue(
            code=IssueCode.UNSUPPORTED_COMBINATION,
            message_vi=f"Tổ hợp ODD không được hỗ trợ: ({odd_hints.road_type}, {odd_hints.actor_type}, {odd_hints.maneuver})",
            suggestion="Vui lòng chọn loại đường hoặc hành vi khác phù hợp hơn với phạm vi hỗ trợ.",
        )
        return {"odd_query": odd_query, "odd_hints": odd_hints, "issues": [issue]}

    return {
        "odd_query": odd_query,
        "odd_hints": odd_hints,
        "assumptions": assumptions,
        "issues": [],
    }