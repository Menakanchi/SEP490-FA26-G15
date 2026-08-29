"""Chiến dịch ODD — phần lập kế hoạch. Không gọi LLM, không cần DB."""

from __future__ import annotations

from src.models.schemas import DEFAULT_SUPPORT_POLICY
from src.services import campaign


def _cell(**overrides) -> dict:
    base = {"road_type": "highway", "weather": "clear", "actor_type": "car", "maneuver": "cut_in"}
    return {**base, **overrides}


def test_cells_outside_the_converter_scope_are_dropped_before_any_llm_call() -> None:
    """Sinh cho ô converter không dựng được là đốt tiền LLM để tạo thứ chắc chắn chết."""
    plan = campaign.plan_cells([_cell(road_type="intersection")], per_cell=3, max_scenarios=10)
    assert plan == []


def test_budget_is_a_hard_stop() -> None:
    """Trần là điều kiện dừng: 3 ô × 5 lượt = 15, nhưng trần 4 thì chỉ 4."""
    cells = [_cell(), _cell(weather="rain"), _cell(weather="fog")]
    plan = campaign.plan_cells(cells, per_cell=5, max_scenarios=4)
    assert len(plan) == 4


def test_rounds_interleave_so_a_stop_leaves_an_even_spread() -> None:
    """Chạm trần giữa chừng thì kết quả phải rải đều, không phủ kín vài ô đầu.

    Sinh hết ô 1 mới sang ô 2 thì dừng sớm = một ô có 5 kịch bản, hai ô còn lại
    trống — vô dụng cho một chiến dịch lấy độ phủ làm mục tiêu.
    """
    cells = [_cell(), _cell(weather="rain"), _cell(weather="fog")]
    plan = campaign.plan_cells(cells, per_cell=2, max_scenarios=4)
    assert [c.weather.value for c in plan] == ["clear", "rain", "fog", "clear"]


def test_invalid_cells_do_not_kill_the_campaign() -> None:
    """Một ô hỏng do người dùng gửi chỉ mất ô đó."""
    plan = campaign.plan_cells([{"road_type": "không-có-thật"}, _cell()], per_cell=1, max_scenarios=5)
    assert len(plan) == 1


def test_every_supported_cell_can_be_planned() -> None:
    """Khoanh cả vùng hỗ trợ thì kế hoạch phủ đúng 76 ô, không thiếu không thừa."""
    cells = [c.model_dump(mode="json") for c in DEFAULT_SUPPORT_POLICY.supported_cells()]
    plan = campaign.plan_cells(cells, per_cell=1, max_scenarios=1000)
    assert len(plan) == DEFAULT_SUPPORT_POLICY.denominator()
    assert len({c.key for c in plan}) == len(plan), "không ô nào bị lặp"


def test_compose_prompt_injects_the_maneuver_constraint(monkeypatch) -> None:
    """Luật hình học phải tới được lời gọi sinh câu, không nằm chờ trong system prompt.

    Chiến dịch 29/08 vi phạm luật "xuất phát phía sau thì phải nhanh hơn" 6/35
    lần dù luật đó đã có trong `_SYSTEM_PROMPT` — sinh ra "xe tải 68 km/h từ phía
    sau vượt lên xe ego 94 km/h". Một dòng cụ thể cho đúng maneuver đang viết ăn
    hơn một gạch đầu dòng tổng quát.
    """
    from src.models.schemas import ActorType, ManeuverType, ODDCell, RoadType, Weather
    from src.services import campaign

    seen: dict[str, str] = {}

    def _fake_call(messages, structured_output_schema, operation):  # noqa: ANN001, ARG001
        seen["user"] = messages[-1]["content"]
        return {"description_vi": "Một câu mô tả tình huống giao thông nguy hiểm trên cao tốc để test."}

    monkeypatch.setattr(campaign, "call_with_escalation", _fake_call)

    campaign.compose_prompt(
        ODDCell(
            road_type=RoadType.HIGHWAY,
            weather=Weather.CLEAR,
            actor_type=ActorType.CAR,
            maneuver=ManeuverType.CUT_IN,
        )
    )

    assert "NHANH HƠN" in seen["user"]
    assert "15 km/h" in seen["user"]
