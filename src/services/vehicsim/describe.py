"""Bước 1 của vòng MVP: câu mô tả tiếng Việt → LLM → Scenario IR (FE-06).

Dùng lại hạ tầng của Generator cũ (Scenario Forge):

- ``is_too_vague_to_generate`` chặn câu rác giống ``POST /generate``;
- LLM gọi qua ``llm.call_with_escalation`` (DeepSeek/OpenAI theo cấu hình,
  structured output, tự leo model khi lỗi) — gọi qua *tên module* để lưới chặn
  LLM thật trong ``tests/conftest.py`` vẫn có hiệu lực;
- LLM hỏng thì lùi về trích xuất bằng luật, như ``parse_intent`` của Forge.

Khác Forge ở chỗ không dựng ODD/xosc: MVP chỉ có motif người đi bộ băng ngang,
nên IR là đúng các tham số mà simulator và ``FamilySpec`` dùng. Theo kế hoạch
MVP: IR được kiểm tra, sai thì cho LLM sửa tối đa ``MAX_REPAIRS`` lần, và mọi
giá trị không có trong câu được liệt kê rõ là *giả định*.
"""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from src.models.schemas import TOO_VAGUE_MESSAGE, is_too_vague_to_generate
from src.services import llm
from src.services.vehicsim.bundle import IR_BOUNDS, TIMES, WEATHERS
from src.services.vehicsim.common import InvalidRequestError

MOTIF = "pedestrian_crossing"
MAX_REPAIRS = 3

WeatherCode = Literal["CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG"]
TimeCode = Literal["DAY", "DUSK", "NIGHT"]


class DescribedScenario(BaseModel):
    """Đầu ra có cấu trúc mà LLM phải trả. ``None`` = câu không nói tới."""

    is_pedestrian_crossing: bool = Field(
        description=(
            "True nếu có xe ego và người đi bộ băng ngang hoặc đứng ở mép đường phía trước — kể cả khi người đi bộ "
            "dừng lại ở lề, không sang đường (đó là biến thể stops_at_curb=true của cùng motif)."
        )
    )
    title: str | None = Field(default=None, description="Tên ngắn gọn tiếng Việt cho kịch bản, tối đa 80 ký tự.")
    ego_speed_kmh: float | None = Field(default=None, description="Tốc độ xe ego, km/h.")
    trigger_distance_m: float | None = Field(
        default=None, description="Khoảng cách từ xe ego tới điểm băng qua lúc người đi bộ bắt đầu đi, mét."
    )
    pedestrian_speed_mps: float | None = Field(default=None, description="Tốc độ người đi bộ, m/s.")
    stops_at_curb: bool | None = Field(
        default=None, description="True nếu người đi bộ dừng lại ở mép đường/lề, không đi vào làn xe."
    )
    weather: WeatherCode | None = None
    time_of_day: TimeCode | None = None
    inferred_fields: list[str] = Field(
        default_factory=list,
        description="Tên các trường suy ra từ từ ngữ định tính (vd. 'chạy' → tốc độ), không có con số trong câu.",
    )
    notes: str | None = Field(
        default=None, description="Chi tiết trong câu mà IR của MVP không biểu diễn được (xe khác, đường cong...)."
    )


# Khớp FamilySpec.validate — IR ngoài khoảng này không dựng được họ kịch bản.
BOUNDS = IR_BOUNDS
# Giá trị giả định khi câu không nói tới (IR phải đủ trường để chạy được).
DEFAULTS = {
    "ego_speed_kmh": 50.0,
    "trigger_distance_m": 30.0,
    "pedestrian_speed_mps": 1.5,
    "stops_at_curb": False,
    "weather": "CLEAR",
    "time_of_day": "DAY",
}
FIELD_META = {
    "ego_speed_kmh": ("Tốc độ xe ego", "km/h"),
    "trigger_distance_m": ("Khoảng cách kích hoạt", "m"),
    "pedestrian_speed_mps": ("Tốc độ người đi bộ", "m/s"),
    "stops_at_curb": ("Người đi bộ dừng ở lề", ""),
    "weather": ("Thời tiết", ""),
    "time_of_day": ("Thời điểm", ""),
}

SYSTEM_PROMPT = """Bạn trích xuất Scenario IR cho VehicSim — nền tảng kiểm thử hệ thống phanh khẩn cấp (AEB).
MVP chỉ có MỘT motif: xe ego chạy thẳng, người đi bộ băng ngang đường phía trước (kiểu Euro NCAP CPNA).

Quy tắc:
1. Chỉ điền giá trị mà câu mô tả NÓI RÕ hoặc suy ra trực tiếp từ từ ngữ. Không bịa. Trường nào câu không nhắc thì để null.
2. Đơn vị: tốc độ xe ego theo km/h; tốc độ người đi bộ theo m/s; khoảng cách theo mét. Đổi đơn vị nếu câu dùng đơn vị khác.
3. Suy luận định tính được phép, nhưng phải ghi tên trường vào inferred_fields:
   đi bộ/đi chậm ≈ 1.4 m/s, đi nhanh ≈ 2.0 m/s, chạy/lao ra ≈ 3.0 m/s.
   Khoảng cách chỉ lấy khi câu có con số; không suy từ chữ như "đột ngột", "sát đầu xe".
4. weather: trời quang/nắng → CLEAR, nhiều mây/âm u → CLOUDY, mưa/mưa nhỏ → RAIN, mưa to/mưa lớn/giông → HEAVY_RAIN, sương mù → FOG.
   time_of_day: ban ngày → DAY, chạng vạng/hoàng hôn/sáng sớm → DUSK, ban đêm/buổi tối → NIGHT.
5. stops_at_curb: người đi bộ dừng lại ở mép đường/lề, đứng chờ, không bước vào làn → true; băng qua/sang đường/lao ra → false.
6. is_pedestrian_crossing = false CHỈ khi tình huống không có người đi bộ ở mép đường / trên đường phía trước xe
   (vd. xe máy tạt đầu, ô tô cắt làn). Người đi bộ đứng hoặc dừng ở mép đường, không sang đường, VẪN là motif này
   (is_pedestrian_crossing=true, stops_at_curb=true) — đây là ca bắt buộc để đo phanh oan.
7. Chi tiết không biểu diễn được (xe đỗ che khuất, nhiều người, đường cong...) ghi ngắn vào notes.

Ví dụ: "Xe VF8 chạy 60 km/h ban đêm trời mưa, một người đi bộ lao ra từ lề phải khi xe còn cách 25 m"
→ is_pedestrian_crossing=true, ego_speed_kmh=60, trigger_distance_m=25, pedestrian_speed_mps=3.0, stops_at_curb=false,
  weather=RAIN, time_of_day=NIGHT, inferred_fields=["pedestrian_speed_mps"].
Ví dụ: "Người đi bộ đứng ở mép đường rồi dừng lại, không sang đường; xe chạy 40 km/h"
→ is_pedestrian_crossing=true, ego_speed_kmh=40, stops_at_curb=true, các trường còn lại null."""


# ---------------------------------------------------------------------------
# Kiểm tra IR
# ---------------------------------------------------------------------------


def check(ir: DescribedScenario) -> list[str]:
    """Lỗi khiến IR không dựng được họ kịch bản (rỗng = hợp lệ)."""
    issues = []
    for key, (lo, hi) in BOUNDS.items():
        value = getattr(ir, key)
        if value is not None and not lo <= value <= hi:
            label, unit = FIELD_META[key]
            issues.append(f"{label} = {value:g} {unit} nằm ngoài khoảng [{lo:g}, {hi:g}] {unit}".strip())
    unknown = [f for f in ir.inferred_fields if f not in FIELD_META]
    if unknown:
        issues.append(f"inferred_fields có tên trường không tồn tại: {unknown}")
    return issues


# ---------------------------------------------------------------------------
# Đường lui bằng luật (khi LLM không dùng được)
# ---------------------------------------------------------------------------


def _plain(text: str) -> str:
    text = unicodedata.normalize("NFD", text.lower()).replace("đ", "d")
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn")


_NUM = r"(\d+(?:[.,]\d+)?)"


def _num(pattern: str, text: str) -> float | None:
    match = re.search(pattern, text)
    return float(match.group(1).replace(",", ".")) if match else None


def rule_based(text: str) -> DescribedScenario:
    """Trích xuất bằng regex/từ khoá — kém LLM nhưng không bao giờ bịa số."""
    t = _plain(text)
    inferred: list[str] = []
    ped_speed = _num(_NUM + r"\s*m\s*/\s*s", t)
    if ped_speed is None:
        if re.search(r"\b(chay|lao)\s+(ra|qua|sang)", t):
            ped_speed = 3.0
            inferred.append("pedestrian_speed_mps")
        elif re.search(r"\bdi\s+bo\s+(cham|tu tu)|\bdi\s+cham", t):
            ped_speed = 1.4
            inferred.append("pedestrian_speed_mps")
    weather = None
    for pattern, code in (
        (r"mua\s+(to|lon|nang hat)|giong", "HEAVY_RAIN"),
        (r"\bmua\b", "RAIN"),
        (r"suong\s+mu", "FOG"),
        (r"nhieu\s+may|am\s+u", "CLOUDY"),
        (r"troi\s+(quang|nang)|nang\s+dep", "CLEAR"),
    ):
        if re.search(pattern, t):
            weather = code
            break
    time_of_day = None
    for pattern, code in (
        (r"ban\s+dem|buoi\s+toi|\bdem\b|troi\s+toi", "NIGHT"),
        (r"chang\s+vang|hoang\s+hon|sang\s+som", "DUSK"),
        (r"ban\s+ngay|buoi\s+sang|buoi\s+chieu|giua\s+trua", "DAY"),
    ):
        if re.search(pattern, t):
            time_of_day = code
            break
    stops = None
    if re.search(r"dung\s+(lai\s+)?(o\s+)?(mep|le|via)|khong\s+(sang|qua)\s+duong|dung\s+cho", t):
        stops = True
    elif re.search(r"bang\s+qua|sang\s+duong|qua\s+duong|lao\s+ra|chay\s+ra", t):
        stops = False
    return DescribedScenario(
        is_pedestrian_crossing=bool(re.search(r"nguoi\s+di\s+bo|nguoi\s+qua\s+duong|bo\s+hanh|khach\s+bo\s+hanh", t)),
        title=None,
        ego_speed_kmh=_num(_NUM + r"\s*km\s*/?\s*h", t),
        # "m" đứng riêng (không phải m/s, km, mm): "cách 25 m", "25m"
        trigger_distance_m=_num(_NUM + r"\s*m(?:et)?\b(?!\s*/)", t),
        pedestrian_speed_mps=ped_speed,
        stops_at_curb=stops,
        weather=weather,
        time_of_day=time_of_day,
        inferred_fields=inferred,
    )


# ---------------------------------------------------------------------------
# Gọi LLM + vòng sửa
# ---------------------------------------------------------------------------


def _ask_llm(text: str) -> tuple[DescribedScenario, int, list[str]]:
    """Trả ``(ir, số lần sửa, lỗi còn lại)``. Lỗi LLM/parse thì ném ra để caller lùi về luật."""
    schema = DescribedScenario.model_json_schema()
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Mô tả kịch bản: {text}"},
    ]
    ir: DescribedScenario | None = None
    issues: list[str] = []
    for attempt in range(MAX_REPAIRS + 1):
        raw = llm.call_with_escalation(
            messages, schema, operation="vs_describe" if attempt == 0 else "vs_describe_repair"
        )
        payload = raw.model_dump() if isinstance(raw, BaseModel) else raw
        try:
            ir = DescribedScenario.model_validate(payload)
            issues = check(ir)
        except ValidationError as exc:
            issues = [f"{'.'.join(map(str, e['loc']))}: {e['msg']}" for e in exc.errors()]
        if not issues:
            return ir, attempt, []  # type: ignore[return-value]
        if attempt == MAX_REPAIRS:
            break
        messages += [
            {"role": "assistant", "content": json.dumps(payload, ensure_ascii=False)},
            {
                "role": "user",
                "content": "Kết quả trên chưa hợp lệ: "
                + "; ".join(issues)
                + ". Hãy trả lại IR đã sửa. Trường nào câu không nói rõ thì để null.",
            },
        ]
    if ir is None:
        raise ValueError("LLM không trả được IR hợp lệ: " + "; ".join(issues))
    return ir, MAX_REPAIRS, issues


def describe(text: str) -> dict:
    """Câu mô tả → IR đầy đủ (điền giả định) + nguồn gốc từng trường."""
    text = (text or "").strip()
    if is_too_vague_to_generate(text):
        raise InvalidRequestError(TOO_VAGUE_MESSAGE)

    source, model, llm_error, repairs, issues = "llm", None, None, 0, []
    with llm.collect_provider_metrics() as events:
        try:
            ir, repairs, issues = _ask_llm(text)
            model = llm._get_escalated_model() if any(e.get("escalated") for e in events) else llm._get_primary_model()
        except Exception as exc:  # noqa: BLE001 — mọi lỗi LLM đều lùi về luật, như parse_intent
            ir, source, llm_error = rule_based(text), "rules", str(exc)[:300]
    metrics = llm.summarize_provider_metrics(events)

    if not ir.is_pedestrian_crossing:
        raise InvalidRequestError(
            "Mô tả không phải tình huống người đi bộ băng ngang — MVP hiện chỉ hỗ trợ motif này. "
            "Hãy mô tả xe gặp người đi bộ đi ra đường phía trước."
        )

    stated = ir.model_dump()
    inferred = set(ir.inferred_fields)
    fields, values = [], {}
    for key, (label, unit) in FIELD_META.items():
        value = stated[key]
        origin = "inferred" if key in inferred and value is not None else "stated"
        if value is None:
            value, origin = DEFAULTS[key], "assumed"
        values[key] = value
        fields.append({"key": key, "label": label, "value": value, "unit": unit, "origin": origin})

    return {
        "motif": MOTIF,
        "source": source,
        "model": model,
        "llm_error": llm_error,
        "repairs": repairs,
        "issues": issues,
        "title": (ir.title or "").strip()[:80] or "Người đi bộ băng ngang",
        "notes": ir.notes,
        "ir": {"motif": MOTIF, **values},
        "fields": fields,
        "assumed": [f["key"] for f in fields if f["origin"] == "assumed"],
        "cost_usd": metrics["cost_usd"],
        "llm_calls": metrics["llm_calls"],
        "weathers": list(WEATHERS),
        "times": list(TIMES),
    }
