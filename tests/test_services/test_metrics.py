"""M1/M2/M3 — kiểm bằng dữ liệu dựng tay, số lấy từ các lượt chạy CARLA thật."""

from __future__ import annotations

from src.models.schemas import DEFAULT_SUPPORT_POLICY
from src.services import metrics


def _execution(maneuver: str, *, success: bool = True, collision: bool = False, **metric_values) -> dict:
    return {
        "scenario_id": "sc_001",
        "maneuver": maneuver,
        "result": {
            "success": success,
            "criteria_results": [
                {"name": "CollisionTest", "result": "FAILURE" if collision else "SUCCESS"},
                # DrivenDistance trượt nhưng KHÔNG có va chạm: bốn kịch bản chết
                # sớm ngày 22/08 rơi đúng vào đây, và đọc GLOBAL RESULT thì cả
                # bốn bị ghi nhầm thành "tìm được nguy hiểm".
                {"name": "CheckDrivenDistance", "result": "FAILURE"},
            ],
            "metrics": metric_values,
        },
    }


# --------------------------------------------------------------------- M1


def test_l4_rejects_a_cut_in_that_became_a_rear_end() -> None:
    """Có va chạm, nhưng sai loại: adversary tông đuôi ego thay vì tạt đầu.

    Criteria báo FAILURE y hệt một cú tạt đầu đúng ý, nên chỉ số đo quỹ đạo mới
    phân biệt được. Đo thật ngày 22/08: chạm lúc adversary còn sau ego 4,71 m.
    """
    verdict = metrics.intent_verdict(
        _execution("cut_in", collision=True, adversary_lane_deviation_m=1.72, contact_longitudinal_m=-4.71)
    )
    assert verdict is False


def test_l4_accepts_a_proper_cut_in() -> None:
    """Cùng kịch bản, trigger đúng: chạm lúc adversary ở trước ego 4,78 m."""
    verdict = metrics.intent_verdict(
        _execution("cut_in", collision=True, adversary_lane_deviation_m=1.73, contact_longitudinal_m=4.78)
    )
    assert verdict is True


def test_l4_rejects_a_drift_that_met_nobody() -> None:
    """Lấn làn có xảy ra (0,70 m) nhưng ego đã đi khỏi — khe hở 1,01 m, vô hại."""
    assert (
        metrics.intent_verdict(_execution("lane_drift", adversary_lane_deviation_m=0.70, min_distance_m=1.01)) is False
    )


def test_l4_accepts_a_drift_that_actually_grazed_the_ego() -> None:
    assert (
        metrics.intent_verdict(_execution("lane_drift", adversary_lane_deviation_m=0.70, min_distance_m=0.36)) is True
    )


def test_l4_returns_none_for_maneuvers_without_a_rule_yet() -> None:
    """Chưa chấm được thì trả None. Đếm nó thành 'sai ý định' là bịa ra thất bại."""
    assert metrics.intent_verdict(_execution("jaywalk", adversary_lane_deviation_m=0.9)) is None


def test_l4_returns_none_when_the_run_carried_no_trajectory() -> None:
    """Worker cũ hoặc đo hỏng: không có số thì không kết luận."""
    assert metrics.intent_verdict(_execution("cut_in")) is None


def test_unjudgeable_runs_are_reported_separately_not_as_failures() -> None:
    report = metrics.validity(
        requests=[],
        scenarios=[],
        executions=[
            _execution("cut_in", collision=True, adversary_lane_deviation_m=1.7, contact_longitudinal_m=4.8),
            _execution("jaywalk", adversary_lane_deviation_m=0.9),
        ],
    )
    level = report["l4_intent"]
    assert level["passed"] == 1 and level["total"] == 1, "chỉ tính lượt chấm được"
    assert level["not_measurable"] == 1


def test_no_data_reports_none_not_zero_percent() -> None:
    """0% và 'chưa có dữ liệu' là hai câu khác nhau; 0% trông như thất bại."""
    report = metrics.validity(requests=[], scenarios=[], executions=[])
    assert report["l1_schema"]["rate"] is None
    assert report["l3_runtime"]["rate"] is None


# --------------------------------------------------------------------- M2


def test_coverage_uses_the_support_policy_as_denominator() -> None:
    """Mẫu số là số ô converter dựng được, không phải 560 tổ hợp enum (ADR-016)."""
    scenarios = [
        {"road_type": "highway", "weather": "clear", "actor_type": "car", "maneuver": "cut_in"},
        {"road_type": "highway", "weather": "clear", "actor_type": "car", "maneuver": "cut_in"},
        {"road_type": "highway", "weather": "rain", "actor_type": "truck", "maneuver": "lane_drift"},
    ]
    report = metrics.coverage(scenarios)
    assert report["supported_total"] == DEFAULT_SUPPORT_POLICY.denominator()
    assert report["covered_supported"] == 2, "hai ô khác nhau, dù có ba kịch bản"
    assert report["enum_total"] == 560


def test_coverage_counts_out_of_scope_cells_separately() -> None:
    """Kịch bản đô thị có tồn tại nhưng converter chưa dựng được — đừng gộp vào tử số."""
    report = metrics.coverage(
        [{"road_type": "urban_straight", "weather": "clear", "actor_type": "truck", "maneuver": "stop_in_lane"}]
    )
    assert report["covered_supported"] == 0
    assert report["covered_out_of_scope"] == 1


# --------------------------------------------------------------------- M3


def test_hazard_counts_near_miss_as_a_success_not_a_failure() -> None:
    """`lane_drift` cố ý không va chạm; đo bằng CollisionTest thì nó luôn trông như trượt."""
    report = metrics.hazard(
        [
            _execution("cut_in", collision=True, min_distance_m=0.0),
            _execution("lane_drift", min_distance_m=0.36),
            _execution("lane_drift", min_distance_m=1.01),
        ]
    )
    assert report["collision"] == 1
    assert report["near_miss"] == 1
    assert report["no_hazard"] == 1
    assert report["rate"]["rate"] == 0.6667
    assert report["collision_rate"]["rate"] == 0.3333


def test_hazard_ignores_runs_that_never_completed() -> None:
    """Kịch bản crash không nói gì về việc nó có nguy hiểm hay không."""
    report = metrics.hazard([_execution("cut_in", success=False, collision=True)])
    assert report["executed"] == 0
    assert report["rate"]["rate"] is None


def test_l2_excludes_scenarios_the_converter_was_never_meant_to_build() -> None:
    """6 seed đô thị kéo L2 xuống 50% và trông như converter hỏng 6 lần.

    Chúng không có .xosc vì `urban_straight` chưa có anchor (ADR-016) — quyết
    định thu hẹp phạm vi, không phải lỗi. Tính riêng thì bảng số nói đúng chuyện.
    """
    scenarios = [
        {
            "road_type": "highway",
            "weather": "clear",
            "actor_type": "car",
            "maneuver": "cut_in",
            "xosc_content": "<xml/>",
        },
        {
            "road_type": "urban_straight",
            "weather": "clear",
            "actor_type": "truck",
            "maneuver": "stop_in_lane",
            "xosc_content": "",
        },
    ]
    level = metrics.validity(requests=[], scenarios=scenarios, executions=[])["l2_xosc"]
    assert level["rate"] == 1.0, "một ô trong phạm vi, biên dịch được"
    assert level["total"] == 1
    assert level["not_measurable"] == 1, "ô ngoài phạm vi đếm riêng"


def test_seed_data_never_reaches_the_report() -> None:
    """Kịch bản mock dựng sẵn để demo giao diện không được tính vào độ phủ.

    Chúng không đi qua pipeline: không có lần sinh, ô ODD do người gõ tay. Đếm
    chúng là báo cáo độ phủ bằng dữ liệu bịa.
    """
    real = {
        "created_by": "creator",
        "road_type": "highway",
        "weather": "clear",
        "actor_type": "car",
        "maneuver": "cut_in",
        "xosc_content": "<xml/>",
    }
    mock = {**real, "created_by": metrics.SEED_AUTHOR, "weather": "rain"}

    report = metrics.build_report(requests=[], scenarios=[real, mock], executions=[])

    assert report["m2_coverage"]["covered_supported"] == 1, "chỉ ô của kịch bản thật"
    assert report["excluded_seed_data"] == 1, "và phải hiện ra là đã bỏ bao nhiêu"
    assert report["m1_validity"]["l2_xosc"]["total"] == 1
