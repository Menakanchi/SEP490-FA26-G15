"""Node 1: parse_intent — Phân tích ý định người dùng và trích xuất ODD theo Mô hình Hybrid 2 Lớp (JSON Rule-based + AI Fallback).

Nhiệm vụ:
  1. Nhận câu tiếng Việt (state["user_query"]).
  2. Input Validation (độ dài >= 5, không chỉ có số).
  3. BƯỚC 1 (Rule-based Matching):
     - Khớp từ khóa trực tiếp từ file src/schemas/taxonomy_rules.json.
     - Nếu đã khớp đủ 2 trục bắt buộc (actor_type & maneuver) -> Trả về ODDQuery ngay mà KHÔNG cần gọi ChatOpenAI.
  4. BƯỚC 2 (AI Semantic Fallback):
     - Chỉ gọi ChatOpenAI(model="gpt-4o-mini", temperature=0) khi BƯỚC 1 không khớp hết từ khóa (chứa từ lóng/từ mới).
  5. Hậu xử lý (code thuần):
     - Kiểm tra nếu cả 4 trường ODD đều None/unknown -> raise ValueError(UNPARSABLE).
     - Kiểm tra thiếu trục bắt buộc (actor_type, maneuver) -> ném issue NEED_MORE_DETAIL.
     - Điền mặc định cho các trục bối cảnh (road_type, weather) qua odd_query.with_defaults().
"""

from __future__ import annotations

import json
import logging
import unicodedata
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from src.agents.state import ForgeState
from src.models.schemas import (
    ActorType,
    IssueCode,
    ManeuverType,
    RoadType,
    ValidationIssue,
    Weather,
)
from src.schemas.intent import ODDQuery
from src.services.llm import get_llm

logger = logging.getLogger(__name__)

TAXONOMY_RULES_PATH = Path(__file__).resolve().parent.parent.parent / "schemas" / "taxonomy_rules.json"


def _load_taxonomy_rules() -> dict:
    """Nạp từ điển quy đổi từ file taxonomy_rules.json (đường dẫn tuyệt đối)."""
    if TAXONOMY_RULES_PATH.exists():
        try:
            return json.loads(TAXONOMY_RULES_PATH.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning(f"Không thể đọc taxonomy_rules.json tại {TAXONOMY_RULES_PATH}: {exc}")
    else:
        logger.warning(f"File taxonomy_rules.json không tồn tại tại {TAXONOMY_RULES_PATH}")
    return {}


def _remove_accents(text: str) -> str:
    """Loại bỏ dấu tiếng Việt để so sánh chuỗi không dấu."""
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return text.replace("đ", "d").replace("Đ", "D")


def _rule_based_extract(user_query: str, rules: dict) -> ODDQuery | None:
    """BƯỚC 1: Rule-based matching trực tiếp từ taxonomy_rules.json."""
    if not rules:
        return None

    query_raw = user_query.lower()
    query_no_accents = _remove_accents(query_raw)

    extracted: dict[str, str | None] = {
        "road_type": None,
        "weather": None,
        "actor_type": None,
        "maneuver": None,
    }

    # 1. Road Type
    road_rules = rules.get("road_type", {})
    for code, keywords in road_rules.items():
        if code == "unknown":
            continue
        if any(kw in query_raw or kw in query_no_accents for kw in keywords):
            extracted["road_type"] = code
            break

    # 2. Weather
    weather_rules = rules.get("weather", {})
    for code, keywords in weather_rules.items():
        if code == "unknown":
            continue
        if any(kw in query_raw or kw in query_no_accents for kw in keywords):
            extracted["weather"] = code
            break

    # 3. Maneuver
    maneuver_rules = rules.get("maneuver", {})
    for code, keywords in maneuver_rules.items():
        if code == "unknown":
            continue
        if any(kw in query_raw or kw in query_no_accents for kw in keywords):
            extracted["maneuver"] = code
            break

    # 4. Actor Type (Chủ thể: lấy tác nhân đầu tiên thực hiện hành vi trong prompt)
    actor_rules = rules.get("actor_type", {})
    actor_matches: list[tuple[int, str]] = []
    for code, keywords in actor_rules.items():
        if code == "unknown":
            continue
        for kw in keywords:
            pos1 = query_raw.find(kw)
            pos2 = query_no_accents.find(kw)
            positions = [p for p in (pos1, pos2) if p != -1]
            if positions:
                actor_matches.append((min(positions), code))

    if actor_matches:
        actor_matches.sort(key=lambda x: x[0])
        extracted["actor_type"] = actor_matches[0][1]

    # Kiểm tra nếu đã khớp đủ 2 trục bắt buộc (actor_type & maneuver) -> thành công ở Bước 1
    if extracted["actor_type"] and extracted["maneuver"]:
        logger.info(f"Matched via taxonomy_rules.json rule-based matching: {extracted}")

        rt_val = (
            RoadType(extracted["road_type"])
            if (extracted["road_type"] and extracted["road_type"] in [r.value for r in RoadType])
            else "unknown"
        )
        wt_val = (
            Weather(extracted["weather"])
            if (extracted["weather"] and extracted["weather"] in [w.value for w in Weather])
            else "unknown"
        )

        try:
            at_val = ActorType(extracted["actor_type"])
        except ValueError:
            at_val = extracted["actor_type"]

        mv_str = extracted["maneuver"]
        if mv_str == "lane_departure":
            mv_str = "lane_drift"
        try:
            mv_val = ManeuverType(mv_str)
        except ValueError:
            mv_val = mv_str

        return ODDQuery(
            road_type=rt_val,
            weather=wt_val,
            actor_type=at_val,
            maneuver=mv_val,
            inferred=[],
        )

    return None


def _get_system_prompt() -> str:
    rules = _load_taxonomy_rules()
    rules_json_str = json.dumps(rules, ensure_ascii=False, indent=2)

    return f"""Bạn là chuyên gia phân tích kịch bản giao thông Việt Nam cho hệ thống Scenario Forge.
Nhiệm vụ của bạn là phân tích câu mô tả tiếng Việt của người dùng và trích xuất 4 nhãn ODD (Operational Design Domain) chuẩn xác theo Enum Taxonomy bằng MÔ HÌNH HYBRID (kết hợp từ điển JSON quy chuẩn và tư duy suy luận ngữ nghĩa AI).

A. NGUYÊN TẮC HYBRID & XỬ LÝ TỪ LÓNG / VIẾT TẮT / KÝ HIỆU SỐ:
1. ĐỌC FILE TỪ ĐIỂN JSON BÊN DƯỚI LÀM BỘ QUY CHUẨN MẪU:
   - Nếu từ ngữ trong prompt trùng khớp với các từ trong từ điển JSON, hãy lấy đúng mã Enum tương ứng.
2. XỬ LÝ LINH HOẠT TỪ LÓNG VÀ KÝ HIỆU SỐ:
   - Phương tiện: "xe 16 cho", "16 cho", "xe transit", "xe khach" -> bus; "cont", "xe cont" -> truck; "xe ga", "xe so" -> motorcycle.
   - Hành vi: "chen ep", "chen ngang", "ep xe" -> cut_in; "dam phanh", "dap phanh", "khung lai" -> sudden_brake; "cup dau" -> cut_in; "vuot au" -> overtake.

B. QUY TẮC PHÂN BIỆT CHỦ THỂ TRONG CÂU PHỨC (CÂU NÉ / TRÁNH / VA CHẠM):
1. Trong câu chứa hành vi né/tránh/va chạm (ví dụ: 'Xe A dậm phanh né/tránh Người B'), TÁC NHÂN CHÍNH (actor_type) BẮT BUỘC là Xe A (xe thực hiện hành vi dậm phanh/né/chủ ngữ), KHÔNG ĐƯỢC lấy Người B (đối tượng bị né/tránh).
   - Ví dụ 1: "xe 16 cho dam phanh ne nguoi di bo" -> Xe 16 chỗ là chủ thể thực hiện dậm phanh né -> actor_type: "bus", maneuver: "sudden_brake" (KHÔNG ĐƯỢC lấy "pedestrian").
   - Ví dụ 2: "o to chen ep xe may" -> Ô tô thực hiện chèn ép -> actor_type: "car", maneuver: "cut_in".

C. QUY TẮC TUYỆT ĐỐI CHỐNG TỰ ĐIỀN (STRICT ZERO-DEFAULT POLICY):
1. KHÔNG ĐƯỢC TỰ Ý MẶC ĐỊNH HOẶC SUY ĐOÁN các trường thông tin mà người dùng KHÔNG ĐỀ CẬP HOẶC KHÔNG THỂ SUY LUẬN ĐƯỢC từ prompt.
2. Nếu prompt KHÔNG đề cập đến Thời tiết (weather) -> BẮT BUỘC đặt giá trị là "unknown" (hoặc null).
3. Nếu prompt KHÔNG đề cập đến Loại đường (road_type) -> BẮT BUỘC đặt giá trị là "unknown" (hoặc null).
4. Chỉ gán "unknown" khi prompt hoàn toàn không nhắc đến hoặc không có cách nào suy luận được.

D. ENUM TAXONOMY CHUẨN:
- actor_type: ["car", "motorcycle", "truck", "bus", "pedestrian", "unknown"]
- maneuver: ["cut_in", "sudden_brake", "lane_departure", "overtake", "unknown"]
- road_type: ["urban_straight", "highway", "intersection", "unknown"]
- weather: ["clear", "heavy_rain", "fog", "unknown"]

E. BỘ QUY CHUẨN TỪ ĐIỂN TAXONOMY (JSON):
{rules_json_str}

NẾU CÂU MÔ TẢ KHÔNG ĐỀ CẬP BẤT KỲ THÔNG TIN ODD NÀO, BẮT BUỘC ĐẶT TẤT CẢ 4 TRƯỜNG TRÊN LÀ "unknown" (HOẶC NULL).
"""


def parse_intent_node(state: ForgeState) -> dict:
    """Node 1: parse_intent — nhận user_query và sinh ODDQuery + ODDCell + Assumptions."""
    user_query = state.get("user_query", "")
    clean_prompt = user_query.strip()
    words = clean_prompt.split()

    # 1. BƯỚC VALIDATE ĐẦU VÀO (Guardrails): rỗng, < 10 ký tự, < 3 từ hoặc chỉ chứa chữ số
    if len(clean_prompt) < 10 or len(words) < 3 or clean_prompt.isnumeric():
        raise ValueError("Mô tả kịch bản quá ngắn hoặc không đủ thông tin kịch bản giao thông.")

    rules = _load_taxonomy_rules()

    # 2. BƯỚC 1: Rule-based matching từ taxonomy_rules.json trước
    rule_matched_odd = _rule_based_extract(user_query, rules)
    if rule_matched_odd is not None:
        odd_query = rule_matched_odd
    else:
        # 3. BƯỚC 2: AI Semantic Fallback — chỉ gọi LLM khi BƯỚC 1 chưa trích xuất đủ thông tin
        logger.info("Fallback to LLM reasoning for missing/complex ODD fields")
        llm = get_llm()
        structured_llm = llm.with_structured_output(ODDQuery)

        system_prompt = _get_system_prompt()
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Mô tả kịch bản: {user_query}"),
        ]

        try:
            odd_query = structured_llm.invoke(messages)
        except Exception as err:
            # Nếu prompt không chứa bất kỳ từ khóa ODD nào từ từ điển fallback -> coi là prompt rác
            from src.api.routes import _extract_odd_fallback_from_prompt

            fb = _extract_odd_fallback_from_prompt(user_query)
            if all(v == "unknown" for v in fb.values()):
                raise ValueError(
                    "Không thể nhận diện tình huống giao thông từ prompt. Vui lòng cung cấp mô tả rõ ràng hơn."
                )
            issue = ValidationIssue(
                code=IssueCode.LLM_PROVIDER_ERROR,
                message_vi=f"Lỗi khi gọi mô hình ngôn ngữ phân tích ODD: {err}",
                suggestion="Vui lòng kiểm tra lại kết nối API OpenAI hoặc thử lại sau",
            )
            return {"issues": [issue]}

    # 4. Logic xử lý kịch bản UNPARSABLE: cả 4 trường ODD đều là None / unknown
    if not (
        (odd_query.road_type and str(odd_query.road_type) not in ("unknown", "none"))
        or (odd_query.weather and str(odd_query.weather) not in ("unknown", "none"))
        or (odd_query.actor_type and str(odd_query.actor_type) not in ("unknown", "none"))
        or (odd_query.maneuver and str(odd_query.maneuver) not in ("unknown", "none"))
    ):
        raise ValueError("Không thể nhận diện tình huống giao thông từ prompt. Vui lòng cung cấp mô tả rõ ràng hơn.")

    # 5. Kiểm tra các trục bắt buộc (actor_type, maneuver)
    missing = odd_query.missing_required_axes()
    if missing:
        missing_vi = ", ".join(missing)
        issue = ValidationIssue(
            code=IssueCode.NEED_MORE_DETAIL,
            message_vi=f"Mô tả chưa rõ thông tin bắt buộc: {missing_vi}",
            suggestion="Hãy ghi rõ loại phương tiện/người gây nguy hiểm và hành vi (ví dụ: xe máy tạt đầu, ô tô phanh gấp)",
        )
        return {"odd_query": odd_query, "issues": [issue]}

    # 6. Điền mặc định các trục bối cảnh (road_type, weather) & ghi nhận assumptions
    odd_hints, assumptions = odd_query.with_defaults()

    return {
        "odd_query": odd_query,
        "odd_hints": odd_hints,
        "assumptions": assumptions,
        "issues": [],
    }
