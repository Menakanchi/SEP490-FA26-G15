"""Hợp thức hoá L4 bằng nhãn người — biến "máy tự chấm máy" thành đo được."""

from __future__ import annotations

from src.services.metrics import intent_agreement

CUT_IN = {
    "road_type": "highway",
    "weather": "clear",
    "actor_type": "motorcycle",
    "maneuver": "cut_in",
}


def _execution(scenario_id: str, *, entered: float = 1.0, contact: float | None = None) -> dict:
    metrics = {"adversary_entered_ego_lane": entered, "min_distance_m": 0.4}
    if contact is not None:
        metrics["contact_longitudinal_m"] = contact
    return {
        "scenario_id": scenario_id,
        **CUT_IN,
        "result": {"success": True, "metrics": metrics},
    }


def _label(scenario_id: str, label: str, labeller: str = "cong", reason: str = "") -> dict:
    return {
        "scenario_id": scenario_id,
        "labeller": labeller,
        "label": label,
        "reason": reason,
        "created_at": "2026-08-23T10:00:00+00:00",
    }


def test_agreement_counts_only_scenarios_the_machine_could_judge() -> None:
    """Máy trả "chưa chấm được" thì không có gì để so — đó không phải chỗ lệch."""
    executions = [
        _execution("sc_a", entered=1.0),
        {"scenario_id": "sc_b", **CUT_IN, "result": {"success": True, "metrics": {}}},
    ]
    report = intent_agreement(executions, [_label("sc_a", "correct"), _label("sc_b", "correct")])

    assert report["scored"] == 1
    assert report["agreement"] == 1.0
    assert report["labelled_scenarios"] == 2


def test_a_disagreement_is_reported_with_the_human_reason() -> None:
    """Chỗ lệch mới là thứ đáng đọc: hoặc luật L4 hổng, hoặc luật quá chặt.

    Đây đúng hình dạng của lỗi jaywalk 23/08: máy gật vì hành vi có xảy ra, người
    lắc vì tình huống vô lý.
    """
    executions = [_execution("sc_a", entered=1.0)]
    labels = [_label("sc_a", "wrong", reason="người đi bộ đứng giữa làn xe chạy")]

    report = intent_agreement(executions, labels)

    assert report["agreement"] == 0.0
    assert report["disagreements"] == [
        {
            "scenario_id": "sc_a",
            "human": "wrong",
            "machine": "correct",
            "reason": "người đi bộ đứng giữa làn xe chạy",
        }
    ]


def test_unsure_is_excluded_instead_of_forced_to_a_side() -> None:
    """Ép người đang lưỡng lự chọn bên là tự tạo ra dữ liệu chính họ không tin."""
    report = intent_agreement([_execution("sc_a", entered=1.0)], [_label("sc_a", "unsure")])

    assert report["scored"] == 0
    assert report["unsure"] == 1
    assert report["agreement"] is None, "chưa đo được thì không được trả 0%"


def test_two_people_disagreeing_is_a_finding_not_noise() -> None:
    """Hai người chấm khác nhau nghĩa là chính câu hỏi còn mơ hồ — đừng làm phẳng nó."""
    labels = [_label("sc_a", "correct", labeller="cong"), _label("sc_a", "wrong", labeller="ban")]

    report = intent_agreement([_execution("sc_a", entered=1.0)], labels)

    assert report["human_conflicts"] == 1
    assert report["scored"] == 0


def test_the_latest_label_per_person_wins() -> None:
    """Một người đổi ý thì lấy nhãn mới, nhưng hàng cũ vẫn nằm trong DB."""
    old = {**_label("sc_a", "wrong"), "created_at": "2026-08-23T09:00:00+00:00"}
    new = {**_label("sc_a", "correct"), "created_at": "2026-08-23T11:00:00+00:00"}

    report = intent_agreement([_execution("sc_a", entered=1.0)], [old, new])

    assert report["agreement"] == 1.0
    assert report["human_conflicts"] == 0


def test_executions_are_not_filtered_by_odd_scope() -> None:
    """Hàng execution không mang bốn trục ODD — lọc theo phạm vi ở đây là loại sạch.

    Lỗi đo được ngày 23/08/2026: `intent_agreement` gọi `_in_scope(e)` trên hàng
    execution, mà hàng đó chỉ có `scenario_id`, `maneuver`, `result`. Kết quả:
    9 nhãn người đã chấm mà báo cáo ra "khớp 0/0".
    """
    bare = {"scenario_id": "sc_a", "maneuver": "cut_in", "result": {"success": True, "metrics": {
        "adversary_entered_ego_lane": 1.0, "min_distance_m": 0.4, "contact_longitudinal_m": 4.8}}}
    report = intent_agreement([bare], [_label("sc_a", "correct")])
    assert report["scored"] == 1, "không có trục ODD không phải lý do bỏ qua"
