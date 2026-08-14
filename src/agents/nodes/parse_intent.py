"""Node 1: parse_intent — Phân tích ý định người dùng và trích xuất ODD theo Mô hình Taxonomy Phân cấp (Sub-Category Model)."""

from __future__ import annotations

import json
import logging
import unicodedata
from pathlib import Path

from langchain_core.messages import HumanMessage, SystemMessage

from src.agents.state import ForgeState
from src.models.schemas import (
    IssueCode,
    ValidationIssue,
)
from src.schemas.intent import ActorDetail, ActorInfo, ManeuverDetail, ODDQuery
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


def _rule_based_extract(user_query: str, rules: dict) -> ODDQuery:
    """BƯỚC 1: Rule-based matching từ taxonomy_rules.json."""
    if not rules:
        return ODDQuery()

    query_raw = user_query.lower()
    query_no_accents = _remove_accents(query_raw)

    road_type = "unknown"
    weather = "unknown"

    # 1. Road Type
    for code, keywords in rules.get("road_type", {}).items():
        if code != "unknown" and any(kw in query_raw or kw in query_no_accents for kw in keywords):
            road_type = code
            break

    # 2. Weather
    for code, keywords in rules.get("weather", {}).items():
        if code != "unknown" and any(kw in query_raw or kw in query_no_accents for kw in keywords):
            weather = code
            break

    # 3. Maneuver
    maneuver_matches: list[tuple[int, str, str]] = []
    for code, keywords in rules.get("maneuver", {}).items():
        if code == "unknown":
            continue
        for kw in keywords:
            p1, p2 = query_raw.find(kw), query_no_accents.find(kw)
            positions = [p for p in (p1, p2) if p != -1]
            if positions:
                maneuver_matches.append((min(positions), code, _slugify(kw)))

    matched_maneuver_cat = "unknown"
    matched_maneuver_spec = "unknown"
    if maneuver_matches:
        maneuver_matches.sort(key=lambda x: x[0])
        matched_maneuver_cat = maneuver_matches[0][1]
        matched_maneuver_spec = maneuver_matches[0][2]

    # 4. Actor Type — Thu thập tất cả các match kèm vị trí start/end
    raw_spans: list[tuple[int, int, str, str]] = []
    for code, keywords in rules.get("actor_type", {}).items():
        if code == "unknown":
            continue
        for kw in keywords:
            for text in (query_raw, query_no_accents):
                pos = text.find(kw)
                if pos != -1:
                    raw_spans.append((pos, pos + len(kw), code, _slugify(kw)))

    # Lọc bỏ các match trùng lặp hoặc là chuỗi con (substring) của keyword dài hơn
    # Ví dụ: "xe_tron" nằm trong "xe_tron_be_tong" cùng vị trí -> chỉ giữ "xe_tron_be_tong"
    raw_spans.sort(key=lambda x: (x[1] - x[0]), reverse=True)  # Ưu tiên keyword dài trước
    non_overlapping_spans: list[tuple[int, int, str, str]] = []
    for s, e, code, spec in raw_spans:
        # Nếu (s, e) nằm trong bất kỳ span nào dài hơn đã chọn -> bỏ qua
        is_subspan = any(existing_s <= s and e <= existing_e for existing_s, existing_e, _, _ in non_overlapping_spans)
        if not is_subspan:
            non_overlapping_spans.append((s, e, code, spec))

    # Sắp xếp theo vị trí xuất hiện trong câu
    non_overlapping_spans.sort(key=lambda x: x[0])

    actors_list: list[ActorInfo] = []
    matched_actor_cat = "unknown"
    matched_actor_spec = "unknown"

    if non_overlapping_spans:
        seen_specs = set()
        unique_matches = []
        for s, e, cat, spec in non_overlapping_spans:
            if spec not in seen_specs:
                seen_specs.add(spec)
                unique_matches.append((s, cat, spec))

        matched_actor_cat = unique_matches[0][1]
        matched_actor_spec = unique_matches[0][2]

        for i, (pos, cat, spec) in enumerate(unique_matches):
            role = "adversary" if i == 0 else "ego"
            actors_list.append(ActorInfo(role=role, category=cat, specific_type=spec))
    else:
        for phrase in ["doan xe dap", "xe dap", "xe day", "hang rong", "xe ba goc", "doan xe"]:
            if phrase in query_no_accents or phrase in query_raw:
                if "dap" in phrase:
                    matched_actor_cat = "bicycle"
                elif "day" in phrase or "rong" in phrase:
                    matched_actor_cat = "pedestrian"
                elif "ba" in phrase:
                    matched_actor_cat = "motorcycle"
                else:
                    matched_actor_cat = "car"
                matched_actor_spec = _slugify(phrase)
                actors_list.append(ActorInfo(role="adversary", category=matched_actor_cat, specific_type=matched_actor_spec))
                break

    return ODDQuery(
        actor_type=ActorDetail(category=matched_actor_cat, specific_type=matched_actor_spec),
        maneuver=ManeuverDetail(category=matched_maneuver_cat, specific_action=matched_maneuver_spec),
        road_type=road_type,
        weather=weather,
        actors=actors_list,
        inferred=[],
    )


def _get_system_prompt() -> str:
    rules_json_str = json.dumps(_load_taxonomy_rules(), ensure_ascii=False, indent=2)
    return f"""Bạn là chuyên gia phân tích ODD kịch bản giao thông cho xe tự lái (Autonomous Driving Multi-Actor Scenario Analyst).
Nhiệm vụ: Phân tích mô tả tiếng Việt (bao gồm kịch bản đơn hoặc NHIỀU PHƯƠNG TIỆN MULTI-ACTOR) và trích xuất ODD theo mô hình Suy luận Ngữ nghĩa Bản chất & Phân định Vai trò (Multi-Actor Role Reasoning).

═══════════════════════════════════════════════════════════
A. BẢNG ENUM CHUẨN ODD — LLM PHẢI CHỌN ĐÚNG TRONG CÁC GIÁ TRỊ NÀY
═══════════════════════════════════════════════════════════

ACTOR CATEGORY (bắt buộc chọn 1):
  • car          — Ô tô con 4 bánh, sedan, SUV, hatchback, xe cơ quan
  • motorcycle   — Xe máy 2-3 bánh (Honda Wave, Vision, xe côn tay, xe ba bánh gắn máy, xe ba gác máy)
  • truck        — Xe tải hàng, xe ben, xe container, xe rơ-moóc, xe siêu trường siêu trọng, xe bồn, xe cẩu, xe công trình
  • bus          — Xe buýt, xe khách, minibus, xe 16 chỗ trở lên, xe limousine, xe giường nằm
  • pedestrian   — Người đi bộ, người băng qua đường, trẻ em chạy ra đường
  • bicycle      — Xe đạp, xe đạp điện (có thể thêm người), đoàn xe đạp, xe thô sơ
  • unknown      — Không xác định được từ mô tả

MANEUVER CATEGORY (bắt buộc chọn 1):
  • cut_in         — Tạt đầu, cướp làn, cắt mặt xe khác, chen vào làn đột ngột
  • sudden_brake   — Phanh gấp, thắng gấp, dừng đột ngột giữa đường, hãm phanh khẩn cấp
  • run_red_light  — Vượt đèn đỏ, phóng qua ngã tư khi đèn đỏ, vượt đèn tín hiệu
  • jaywalk        — Người đi bộ băng qua đường sai vị trí, không nhìn đường, bất ngờ xuất hiện
  • wrong_way      — Đi ngược chiều, đi vào làn đường trái, lùi xe trên cao tốc
  • lane_drift     — Lấn làn từ từ, đè vạch kẻ đường, chệch làn, rơi vật thể ra đường, lật xe đổ vào làn khác
  • stop_in_lane   — Dừng chết giữa làn, đỗ chặn đường, hỏng xe giữa đường, xe bị tai nạn án ngữ
  • overtake       — Vượt xe trái phép, vượt ẩu, vượt qua tim đường
  • unknown        — Không xác định được hành vi

ROAD TYPE (tùy chọn, nếu không rõ để "unknown"):
  • urban_straight      — Đường đô thị thẳng, đường phố, quốc lộ trong thành phố
  • highway             — Cao tốc, đường vành đai tốc độ cao, quốc lộ ngoài thành phố
  • intersection        — Ngã tư, ngã ba, giao lộ có/không có đèn tín hiệu
  • residential_narrow  — Ngõ hẻm, đường khu dân cư hẹp, kiệt đường nhỏ
  • roundabout          — Vòng xuyến, bùng binh
  • unknown             — Không nhắc đến trong mô tả

WEATHER (tùy chọn, nếu không rõ để "unknown"):
  • clear       — Trời quang, nắng, thời tiết bình thường
  • rain        — Mưa nhẹ, mưa phùn
  • heavy_rain  — Mưa to, mưa lớn, mưa bão, tầm nhìn kém vì mưa
  • fog         — Sương mù, tầm nhìn hạn chế do sương
  • unknown     — Không nhắc đến trong mô tả

═══════════════════════════════════════════════════════════
B. QUY TẮC PHÂN ĐỊNH VAI TRÒ VÀ TRÍCH XUẤT MULTI-ACTOR (`actors`)
═══════════════════════════════════════════════════════════

Đọc toàn bộ câu và trích xuất danh sách TẤT CẢ phương tiện/tác nhân vào mảng `actors`:
1. `role`:
   - `adversary`          : Phương tiện thực hiện hành vi/sự cố CHÍNH gây ra tình huống nguy hiểm
   - `ego`                : Phương tiện chịu ảnh hưởng, bị đâm vào, hoặc phương tiện tự lái quan sát
   - `secondary_adversary`: Phương tiện thứ 3 phụ trợ (nếu có)
2. `category`     : Chọn trong bảng ACTOR CATEGORY ở trên
3. `specific_type`: Tên/đặc điểm phương tiện chi tiết dạng slug không dấu (VD: "xe_khach_29_cho", "xe_may_wave", "xe_container_ro_mooc")

Trường `actor_type` = phương tiện chính có role='adversary'.
Trường `maneuver`   = hành vi chính do adversary thực hiện.

═══════════════════════════════════════════════════════════
C. FEW-SHOT EXAMPLES — PHỦ ĐẦY ĐỦ 8 MANEUVER VÀ 5 ROAD TYPE
═══════════════════════════════════════════════════════════

--- cut_in ---
Input: 'Xe máy tạt đầu ô tô trên đường cao tốc lúc trời mưa'
Output: {{
  "actors": [
    {{"role": "adversary", "category": "motorcycle", "specific_type": "xe_may"}},
    {{"role": "ego", "category": "car", "specific_type": "o_to"}}
  ],
  "actor_type": {{"category": "motorcycle", "specific_type": "xe_may"}},
  "maneuver": {{"category": "cut_in", "specific_action": "tat_dau_o_to"}},
  "road_type": "highway",
  "weather": "rain"
}}

--- sudden_brake ---
Input: 'Xe khách phanh gấp làm xe máy phía sau đâm vào'
Output: {{
  "actors": [
    {{"role": "adversary", "category": "bus", "specific_type": "xe_khach"}},
    {{"role": "ego", "category": "motorcycle", "specific_type": "xe_may"}}
  ],
  "actor_type": {{"category": "bus", "specific_type": "xe_khach"}},
  "maneuver": {{"category": "sudden_brake", "specific_action": "phanh_gap"}},
  "road_type": "urban_straight",
  "weather": "unknown"
}}

--- run_red_light ---
Input: 'Xe tải vượt đèn đỏ tại ngã tư tông vào ô tô đang đi đúng làn'
Output: {{
  "actors": [
    {{"role": "adversary", "category": "truck", "specific_type": "xe_tai"}},
    {{"role": "ego", "category": "car", "specific_type": "o_to"}}
  ],
  "actor_type": {{"category": "truck", "specific_type": "xe_tai"}},
  "maneuver": {{"category": "run_red_light", "specific_action": "vuot_den_do"}},
  "road_type": "intersection",
  "weather": "unknown"
}}

--- jaywalk ---
Input: 'Trẻ em bất ngờ chạy ra đường tại khu dân cư khi xe ô tô đang đến gần'
Output: {{
  "actors": [
    {{"role": "adversary", "category": "pedestrian", "specific_type": "tre_em"}},
    {{"role": "ego", "category": "car", "specific_type": "o_to"}}
  ],
  "actor_type": {{"category": "pedestrian", "specific_type": "tre_em"}},
  "maneuver": {{"category": "jaywalk", "specific_action": "chay_ra_duong_bat_ngo"}},
  "road_type": "residential_narrow",
  "weather": "unknown"
}}

--- wrong_way ---
Input: 'Xe máy đi ngược chiều trên làn cao tốc hướng vào thành phố'
Output: {{
  "actors": [
    {{"role": "adversary", "category": "motorcycle", "specific_type": "xe_may"}}
  ],
  "actor_type": {{"category": "motorcycle", "specific_type": "xe_may"}},
  "maneuver": {{"category": "wrong_way", "specific_action": "di_nguoc_chieu_cao_toc"}},
  "road_type": "highway",
  "weather": "unknown"
}}

--- lane_drift ---
Input: 'Xe tải lấn làn ép ô tô sedan va vào dải phân cách'
Output: {{
  "actors": [
    {{"role": "adversary", "category": "truck", "specific_type": "xe_tai"}},
    {{"role": "ego", "category": "car", "specific_type": "xe_sedan"}}
  ],
  "actor_type": {{"category": "truck", "specific_type": "xe_tai"}},
  "maneuver": {{"category": "lane_drift", "specific_action": "lan_lan_ep_xe"}},
  "road_type": "urban_straight",
  "weather": "unknown"
}}

--- stop_in_lane ---
Input: 'Xe buýt đột ngột dừng giữa làn đường cao tốc do hỏng máy, gây ùn tắc'
Output: {{
  "actors": [
    {{"role": "adversary", "category": "bus", "specific_type": "xe_buyt"}}
  ],
  "actor_type": {{"category": "bus", "specific_type": "xe_buyt"}},
  "maneuver": {{"category": "stop_in_lane", "specific_action": "dung_giua_lan_hong_may"}},
  "road_type": "highway",
  "weather": "unknown"
}}

--- overtake ---
Input: 'Ô tô vượt ẩu qua tim đường tại khúc cua khuất tầm nhìn gặp xe ngược chiều'
Output: {{
  "actors": [
    {{"role": "adversary", "category": "car", "specific_type": "o_to"}}
  ],
  "actor_type": {{"category": "car", "specific_type": "o_to"}},
  "maneuver": {{"category": "overtake", "specific_action": "vuot_au_qua_tim_duong"}},
  "road_type": "highway",
  "weather": "unknown"
}}

--- residential_narrow + bicycle ---
Input: 'Đoàn xe đạp đi hàng ba chiếm trọn làn ngõ hẹp khu dân cư'
Output: {{
  "actors": [
    {{"role": "adversary", "category": "bicycle", "specific_type": "doan_xe_dap"}}
  ],
  "actor_type": {{"category": "bicycle", "specific_type": "doan_xe_dap"}},
  "maneuver": {{"category": "lane_drift", "specific_action": "di_hang_ba_chiem_lan"}},
  "road_type": "residential_narrow",
  "weather": "unknown"
}}

--- roundabout ---
Input: 'Xe máy không nhường đường tại vòng xuyến khiến xe ô tô phải phanh gấp'
Output: {{
  "actors": [
    {{"role": "adversary", "category": "motorcycle", "specific_type": "xe_may"}},
    {{"role": "ego", "category": "car", "specific_type": "o_to"}}
  ],
  "actor_type": {{"category": "motorcycle", "specific_type": "xe_may"}},
  "maneuver": {{"category": "cut_in", "specific_action": "khong_nhuong_duong_vong_xuyen"}},
  "road_type": "roundabout",
  "weather": "unknown"
}}

═══════════════════════════════════════════════════════════
D. QUY TẮC CHỐNG TỰ ĐIỀN (STRICT ZERO-DEFAULT POLICY)
═══════════════════════════════════════════════════════════
- road_type và weather KHÔNG được đoán nếu prompt KHÔNG nhắc tới → để "unknown"
- specific_type và specific_action: trích xuất TRỰC TIẾP từ từ ngữ prompt, không được bịa đặt
- BẮT BUỘC tuân thủ Pydantic Schema, trả về JSON Structured Output hợp lệ

E. BỘ TỪ ĐIỂN TAXONOMY THAM KHẢO (JSON):
{rules_json_str}
"""



def _get_cat_and_spec(obj: Any) -> tuple[str, str]:
    """Hàm helper trích xuất safe string category và specific_type/action từ bất kỳ dạng object/dict/enum/str nào."""
    if obj is None:
        return "unknown", "unknown"
    if isinstance(obj, str):
        v = obj.strip().lower()
        if v in ("unknown", "none", "n/a", "null", ""):
            return "unknown", "unknown"
        return v, "unknown"
    if hasattr(obj, "value"):
        v = str(obj.value).strip().lower()
        if v in ("unknown", "none", "n/a", "null", ""):
            return "unknown", "unknown"
        return v, "unknown"
    if hasattr(obj, "category"):
        cat = getattr(obj, "category", "unknown") or "unknown"
        spec = getattr(obj, "specific_type", getattr(obj, "specific_action", "unknown")) or "unknown"
        return str(cat).lower(), str(spec).lower()
    if isinstance(obj, dict):
        cat = obj.get("category", "unknown") or "unknown"
        spec = obj.get("specific_type", obj.get("specific_action", "unknown")) or "unknown"
        return str(cat).lower(), str(spec).lower()
    v = str(obj).lower()
    return v, "unknown"


def parse_intent_node(state: ForgeState) -> dict:
    """Node 1: parse_intent — Xử lý ý định người dùng."""
    user_query = state.get("user_query", "").strip()

    # Guardrail: Chặn prompt rác / quá ngắn
    if len(user_query) < 10 or len(user_query.split()) < 3 or user_query.isnumeric():
        raise ValueError("Mô tả kịch bản quá ngắn hoặc không đủ thông tin kịch bản giao thông.")

    rules = _load_taxonomy_rules()

    # BƯỚC 1: Rule-based extraction local
    rule_odd = _rule_based_extract(user_query, rules)

    rule_actor_cat, rule_actor_spec = _get_cat_and_spec(rule_odd.actor_type)
    rule_man_cat, rule_man_spec = _get_cat_and_spec(rule_odd.maneuver)

    is_rule_complete = (
        (rule_actor_cat != "unknown" or rule_actor_spec != "unknown")
        and (rule_man_cat != "unknown" or rule_man_spec != "unknown")
    )

    odd_query = None

    if is_rule_complete:
        logger.info("Khớp hoàn toàn từ Rule-based local (Bước 1), bỏ qua LLM call.")
        odd_query = rule_odd
    else:
        # BƯỚC 2: Gọi LLM nếu Bước 1 chưa trích xuất đủ cả 2 trục bắt buộc
        logger.info("Chuyển sang BƯỚC 2: Gọi LLM Fallback (AI Semantic Extraction)")
        try:
            llm = get_llm()
            structured_llm = llm.with_structured_output(ODDQuery)
            messages = [
                SystemMessage(content=_get_system_prompt()),
                HumanMessage(content=f"Mô tả kịch bản: {user_query}"),
            ]
            odd_query = structured_llm.invoke(messages)
        except Exception as err:
            # BƯỚC 3: GRACEFUL FALLBACK KHI AI LỖI / 429 QUOTA
            logger.warning(f"LLM Call failed ({err}). Reverting to Rule-based fallback.")
            if rule_actor_cat != "unknown" or rule_actor_spec != "unknown":
                odd_query = rule_odd
                logger.info("Graceful Fallback: Trả về kết quả Rule-based local để kịch bản tiếp tục chạy.")
            else:
                issue = ValidationIssue(
                    code=IssueCode.LLM_PROVIDER_ERROR,
                    message_vi=f"Lỗi khi gọi mô hình AI phân tích ODD: {err}",
                    suggestion="Vui lòng kiểm tra lại cấu hình LLM (API Key, hạn ngạch hoặc kết nối mạng).",
                )
                return {"issues": [issue]}

    # Kiểm tra kịch bản hoàn toàn không đọc được (Unparsable)
    actor_obj = getattr(odd_query, "actor_type", None)
    maneuver_obj = getattr(odd_query, "maneuver", None)

    actor_cat, actor_spec = _get_cat_and_spec(actor_obj)
    maneuver_cat, maneuver_spec = _get_cat_and_spec(maneuver_obj)

    is_actor_unknown = (actor_cat == "unknown" and actor_spec == "unknown")
    is_maneuver_unknown = (maneuver_cat == "unknown" and maneuver_spec == "unknown")
    is_road_unknown = (odd_query.road_type in ("unknown", None))
    is_weather_unknown = (odd_query.weather in ("unknown", None))

    if is_actor_unknown and is_maneuver_unknown and is_road_unknown and is_weather_unknown:
        raise ValueError("Không thể nhận diện tình huống giao thông từ prompt. Vui lòng cung cấp mô tả rõ ràng hơn.")

    # Kiểm tra thiếu trục bắt buộc (actor_type)
    missing = odd_query.missing_required_axes()
    if actor_spec != "unknown":
        missing = [m for m in missing if m != "actor_type"]

    if missing:
        issue = ValidationIssue(
            code=IssueCode.NEED_MORE_DETAIL,
            message_vi=f"Mô tả chưa rõ thông tin bắt buộc: {', '.join(missing)}",
            suggestion="Hãy ghi rõ loại phương tiện và hành vi (ví dụ: xe máy tạt đầu)",
        )
        return {"odd_query": odd_query, "issues": [issue]}

    odd_hints, assumptions = odd_query.with_defaults()

    return {
        "odd_query": odd_query,
        "odd_hints": odd_hints,
        "assumptions": assumptions,
        "issues": [],
    }