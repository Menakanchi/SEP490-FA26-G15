"""Chiến dịch ODD — chế độ nâng cao: một ô ODD vào, N kịch bản ra.

Đây là **lớp bọc ngoài**, không phải một pipeline thứ hai. Agent sinh ra một câu
tiếng Việt cho mỗi ô rồi nạp vào đúng đường mà người dùng đang đi (``POST
/generate`` → graph 7 node). Nhờ vậy:

- không sửa node nào; mọi guardrail, validate, converter, HITL vẫn nguyên;
- kịch bản do agent sinh và kịch bản do người gõ **không** khác nhau về chất — nếu
  đường retail hỏng thì cả hai cùng hỏng, không có đường tắt nào để lọt.

Ba ràng buộc, ghi ở đây vì chúng dễ bị bỏ quên khi tự động hoá:

1. **Trần số kịch bản là điều kiện dừng, không phải tuỳ chọn.** Một vòng lặp sinh
   tự động không có trần là một hoá đơn không có trần.
2. **Chỉ sinh trong ô ``SupportPolicy`` hỗ trợ.** Sinh cho ô converter không dựng
   được là đốt tiền LLM để tạo ra thứ chắc chắn chết ở bước biên dịch.
3. **Chạy tuần tự, không song song.** Backend free tier có một worker; sinh song
   song thì chỉ đổi chỗ hàng đợi chứ không nhanh hơn, mà mất khả năng dừng giữa
   chừng đúng lúc chạm trần.
"""

from __future__ import annotations

import logging
from typing import Any

from pydantic import Field

from src.models.schemas import DEFAULT_SUPPORT_POLICY, ForgeModel, ODDCell
from src.services.llm import call_with_escalation

logger = logging.getLogger(__name__)

_AXIS_VI = {
    "highway": "đường cao tốc",
    "urban_straight": "đường phố nội đô",
    "intersection": "ngã tư",
    "residential_narrow": "ngõ hẹp khu dân cư",
    "roundabout": "vòng xuyến",
    "clear": "trời quang",
    "rain": "trời mưa",
    "heavy_rain": "mưa lớn",
    "fog": "sương mù",
    "car": "ô tô con",
    "motorcycle": "xe máy",
    "truck": "xe tải",
    "pedestrian": "người đi bộ",
    "cut_in": "tạt đầu cắt vào làn xe đang chạy",
    "sudden_brake": "phanh gấp ngay trước mũi xe khác",
    "lane_drift": "lấn làn đè vạch sang làn bên",
    "stop_in_lane": "dừng chết giữa làn đường",
    "run_red_light": "vượt đèn đỏ qua nút giao",
    "jaywalk": "băng ngang đường bất ngờ",
    "wrong_way": "đi ngược chiều",
}

_SYSTEM_PROMPT = """Bạn viết mô tả tình huống giao thông nguy hiểm bằng tiếng Việt, \
dùng để sinh kịch bản kiểm thử xe tự lái.

Quy tắc:
- Đúng MỘT câu, 20-45 từ, văn phong kỹ sư mô tả hiện trường.
- Phải nêu đủ: loại đường, thời tiết, loại phương tiện gây tình huống, và hành vi nguy hiểm.
- Nêu tốc độ cụ thể (km/h) cho cả xe gây tình huống lẫn xe bị ảnh hưởng.
- Xe gây tình huống phải **nhanh hơn** xe bị ảnh hưởng nếu nó xuất phát phía sau,
  và **chậm hơn** nếu nó xuất phát phía trước — nếu không hai xe không bao giờ gặp nhau.
- KHÔNG đặt tên riêng, không thêm bối cảnh ngoài giao thông, không nhắc tới file hay mô phỏng.
- Nếu được cho các câu đã có, viết câu KHÁC HẲN chúng về tình tiết, không phải khác vài chữ.

## VÍ DỤ

Bốn câu dưới đây là output THẬT đã đi hết pipeline và sinh ra kịch bản chạy được
trên CARLA. Học văn phong và mức chi tiết của chúng, đừng chép nội dung.

Ô: cao tốc / trời quang / xe máy / tạt đầu
→ "Xe máy chạy 80 km/h ở làn bên trái, vượt lên từ phía sau ô tô đang chạy 60 km/h,
tạt đầu rồi phanh gấp còn 40 km/h. Trời quang, ban ngày, cao tốc."

Ô: cao tốc / trời mưa / xe tải / phanh gấp
→ "Trên đường cao tốc trời mưa, một xe tải chạy 72 km/h bất ngờ phanh gấp ngay
trước đầu xe con đang chạy 90 km/h phía sau."

Ô: cao tốc / sương mù / ô tô con / dừng giữa làn
→ "Trên đường cao tốc trong sương mù dày, một ô tô con dừng chết giữa làn ở 18 km/h
khiến xe phía sau chạy 85 km/h lao tới."

Ô: cao tốc / trời mưa / ô tô con / đi ngược chiều
→ "Trên đường cao tốc trời mưa, một ô tô con chạy ngược chiều 85 km/h lao thẳng vào
làn xe bị ảnh hưởng đang chạy 70 km/h."

Lưu ý: mỗi câu đều nêu **hai** tốc độ và đặt rõ ai ở trước ai ở sau. Thiếu hai thứ
đó thì bước sinh kịch bản phải tự đoán, và đoán sai thì kịch bản chạy ra vô hại."""


class GeneratedPrompt(ForgeModel):
    """Output có cấu trúc của agent sinh câu. Một câu, không kèm giải thích."""

    description_vi: str = Field(..., min_length=20, max_length=400)


def compose_prompt(cell: ODDCell, existing: list[str] | None = None) -> str:
    """Viết một câu tiếng Việt cho ô ODD này.

    Truyền các câu đã sinh **trong cùng ô** vào prompt: không có chúng thì model
    sinh gần như cùng một câu cho mỗi lần gọi trong một ô, và chốt chặn trùng ở
    ``POST /generate`` sẽ loại sạch từ cái thứ hai — chiến dịch chạy xong mà ô
    vẫn chỉ có một kịch bản.
    """
    parts = [
        f"Loại đường: {_vi(cell.road_type.value)}",
        f"Thời tiết: {_vi(cell.weather.value)}",
        f"Phương tiện gây tình huống: {_vi(cell.actor_type.value)}",
        f"Hành vi nguy hiểm: {_vi(cell.maneuver.value)}",
    ]
    if existing:
        parts.append("Các câu đã có trong ô này (phải khác hẳn):")
        parts.extend(f"- {sentence}" for sentence in existing[-5:])

    result = call_with_escalation(
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": "\n".join(parts)},
        ],
        structured_output_schema=GeneratedPrompt,
    )
    text = result.description_vi if isinstance(result, GeneratedPrompt) else str(result.get("description_vi", ""))
    return text.strip()


def plan_cells(cells: list[dict[str, Any]], per_cell: int, max_scenarios: int) -> list[ODDCell]:
    """Khoanh vùng ODD -> danh sách ô sẽ sinh, đã cắt theo trần.

    Giao với ``SupportPolicy.supported_cells()`` chứ không tin đầu vào: người dùng
    chọn trên ma trận 560 ô, còn converter chỉ dựng được 76. Ô ngoài phạm vi bị
    loại ở đây, trước khi tốn một lượt LLM nào.

    Xếp xen kẽ (ô 1, ô 2, ..., rồi vòng lại) chứ không sinh hết ô 1 mới sang ô 2:
    chạm trần giữa chừng thì kết quả vẫn **rải đều** trên vùng đã khoanh, thay vì
    phủ kín vài ô đầu và bỏ trống phần còn lại.
    """
    supported = {c.key: c for c in DEFAULT_SUPPORT_POLICY.supported_cells()}
    chosen: list[ODDCell] = []
    for raw in cells:
        try:
            cell = ODDCell.model_validate(raw)
        except Exception:  # noqa: BLE001 — ô hỏng do người dùng gửi, bỏ qua chứ không làm chết chiến dịch
            logger.warning("Bỏ ô ODD không hợp lệ: %s", raw)
            continue
        if cell.key in supported:
            chosen.append(cell)
        else:
            logger.info("Bỏ ô ngoài phạm vi converter: %s", cell.key)

    plan: list[ODDCell] = []
    for round_index in range(per_cell):
        for cell in chosen:
            if len(plan) >= max_scenarios:
                return plan
            plan.append(cell)
        del round_index
    return plan


def _vi(value: str) -> str:
    return _AXIS_VI.get(value, value)
