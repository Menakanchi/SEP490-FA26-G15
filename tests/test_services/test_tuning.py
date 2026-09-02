"""Dò tham số tới hạn — kiểm bằng hình học của các kịch bản thật."""

from __future__ import annotations

import json
from pathlib import Path

from src.models.schemas import ManeuverType, ScenarioSpec
from src.services import tuning

FIXTURES = Path(__file__).parents[2] / "fixtures" / "scenario_specs"


def _spec(**overrides) -> ScenarioSpec:
    """Hình học sc_906: xe tải trước ego 20 m, chậm hơn 10 km/h -> ngang nhau ở giây 7,2."""
    data = json.loads((FIXTURES / "sc_001.json").read_text(encoding="utf-8"))
    data.pop("_comment", None)
    data["actors"][1]["position"]["s_offset_m"] = 20.0
    data["actors"][0]["initial_speed_kmh"] = 70.0
    data["actors"][1]["initial_speed_kmh"] = 60.0
    data["maneuvers"][0]["maneuver"] = ManeuverType.LANE_DRIFT.value
    data["odd"]["maneuver"] = ManeuverType.LANE_DRIFT.value
    data["maneuvers"][0]["trigger"]["type"] = "simulation_time"
    data["maneuvers"][0]["trigger"]["value"] = 8.0
    for key, value in overrides.items():
        data[key] = value
    return ScenarioSpec.model_validate(data)


def test_sweep_is_anchored_on_the_moment_the_vehicles_draw_level() -> None:
    """Không quét lưới mù: mốc neo tính được bằng số học, nên 4 lượt là đủ.

    20 m / ((70-60)/3.6) = 7,2 s. `lane_drift` phải lấn TRƯỚC mốc đó.
    """
    triggers = tuning.propose_triggers(_spec())
    assert triggers == [6.2, 5.2, 4.2, 3.2]


def test_cut_in_sweeps_lead_distance_without_using_commanded_speed() -> None:
    """`cut_in` dò theo mét dẫn trước, không theo mốc thời gian suy từ tốc độ."""
    data = json.loads((FIXTURES / "sc_001.json").read_text(encoding="utf-8"))
    data.pop("_comment", None)
    spec = ScenarioSpec.model_validate(data)

    triggers = tuning.propose_triggers(spec)

    assert triggers == [8.0, 9.0, 10.0]

    changed = spec.model_dump(mode="json")
    changed["actors"][0]["initial_speed_kmh"] = 95.0
    changed["actors"][1]["initial_speed_kmh"] = 96.0
    assert tuning.propose_triggers(ScenarioSpec.model_validate(changed)) == triggers


def test_no_sweep_when_the_vehicles_never_close_on_each_other() -> None:
    """Hai xe không bao giờ tiến lại gần nhau thì dò trigger không cứu được.

    Vấn đề nằm ở vị trí và tốc độ, và trả rỗng nói đúng điều đó thay vì đốt 4
    lượt GPU để khẳng định lại.
    """
    spec = _spec()
    data = spec.model_dump(mode="json")
    data["actors"][1]["initial_speed_kmh"] = data["actors"][0]["initial_speed_kmh"]
    assert tuning.propose_triggers(ScenarioSpec.model_validate(data)) == []


def test_variants_change_exactly_one_field() -> None:
    """Đổi nhiều thứ cùng lúc thì tốt lên cũng không biết nhờ cái nào."""
    spec = _spec()
    variants = tuning.variant_specs(spec)

    assert len(variants) == 4
    for variant in variants:
        original = spec.model_dump(mode="json")
        changed = variant.model_dump(mode="json")
        original.pop("title"), changed.pop("title")
        original["maneuvers"][0]["trigger"]["value"] = changed["maneuvers"][0]["trigger"]["value"]
        assert original == changed, "chỉ trigger.value (và tiêu đề) được khác"


def test_ranking_uses_distance_not_collision_count() -> None:
    """Khe hở 0,36 m không va chạm tới hạn hơn hẳn khe hở 1,7 m — đếm va chạm thì bằng nhau."""
    ranked = tuning.rank_variants(
        [
            {"scenario_id": "sc_a", "metrics": {"min_distance_m": 1.71}},
            {"scenario_id": "sc_b", "metrics": {"min_distance_m": 0.36}},
            {"scenario_id": "sc_c", "metrics": {}},
        ]
    )
    assert [r["scenario_id"] for r in ranked] == ["sc_b", "sc_a", "sc_c"]


def test_summary_reports_no_improvement_as_a_finding_not_a_failure() -> None:
    """Dò không cải thiện nghĩa là thời điểm KHÔNG phải nguyên nhân — vẫn là thông tin."""
    summary = tuning.summarise_tuning(
        baseline={"metrics": {"min_distance_m": 1.7}},
        results=[{"scenario_id": "sc_x", "metrics": {"min_distance_m": 1.8}}],
    )
    assert summary["improved"] is False
    assert summary["reached_critical"] is False
    assert summary["best_scenario_id"] == "sc_x", "vẫn nói rõ bản nào tốt nhất trong các bản đã thử"


def test_summary_flags_reaching_the_critical_band() -> None:
    """Đúng cải thiện đã đo tay trên sc_906: 1,05 m -> 0,36 m."""
    summary = tuning.summarise_tuning(
        baseline={"metrics": {"min_distance_m": 1.05}},
        results=[{"scenario_id": "sc_y", "metrics": {"min_distance_m": 0.36}}],
    )
    assert summary["improved"] is True
    assert summary["reached_critical"] is True


def test_no_sweep_when_the_vehicles_meet_before_the_maneuver_can_form() -> None:
    """Đo trên sc_019: ego 90 km/h đuổi xe 45 km/h cách 20 m -> ngang nhau ở giây 1,6.

    Lấn làn cần ~2,5 s mới thành hình, nên không thời điểm nào cứu được. Trả rỗng
    là kết luận đúng — nguyên nhân là chênh tốc độ, không phải thời điểm.
    """
    spec = _spec()
    data = spec.model_dump(mode="json")
    data["actors"][0]["initial_speed_kmh"] = 90.0
    data["actors"][1]["initial_speed_kmh"] = 45.0
    assert tuning.propose_triggers(ScenarioSpec.model_validate(data)) == []


def test_sweep_stops_as_soon_as_a_variant_reaches_the_critical_band() -> None:
    """Đo trên sc_024: 78,26 m -> 0,63 m ngay ở bước thứ ba.

    Hai lượt còn lại chỉ để xác nhận chúng tệ hơn — đó là ~70 giây GPU mua một
    thông tin đã biết trước, vì các bước càng xa mốc neo càng nhạt.
    """
    variant, decision = tuning.plan_sweep_step(
        _spec(),
        [
            {"scenario_id": "sc_024_t1", "metrics": {"min_distance_m": 12.0}},
            {"scenario_id": "sc_024_t2", "metrics": {"min_distance_m": 3.4}},
            {"scenario_id": "sc_024_t3", "metrics": {"min_distance_m": 0.63}},
        ],
    )
    assert variant is None
    assert decision == tuning.SWEEP_STOP_REACHED_CRITICAL


def test_sweep_waits_instead_of_queueing_a_second_run() -> None:
    """Biến thể chưa chạy xong có thể đã đủ tới hạn — dựng thêm là đặt trước một lượt GPU thừa."""
    variant, decision = tuning.plan_sweep_step(_spec(), [{"scenario_id": "sc_024_t1", "metrics": {}}])
    assert variant is None
    assert decision == tuning.SWEEP_STOP_WAITING


def test_a_collision_counts_as_measured_not_as_pending() -> None:
    """Khe hở 0,0 m là va chạm. Kiểm bằng falsy thì nó thành "chưa đo" và dò tiếp vô ích."""
    variant, decision = tuning.plan_sweep_step(
        _spec(), [{"scenario_id": "sc_024_t1", "metrics": {"min_distance_m": 0.0}}]
    )
    assert variant is None
    assert decision == tuning.SWEEP_STOP_REACHED_CRITICAL


def test_sweep_hands_back_the_next_trigger_in_order() -> None:
    """Mỗi lần đúng một biến thể, theo đúng thứ tự propose_triggers (gần mốc neo trước)."""
    spec = _spec()
    first, decision = tuning.plan_sweep_step(spec, [])
    assert decision == tuning.SWEEP_NEXT
    assert first is not None and first.maneuvers[0].trigger.value == 6.2

    second, _ = tuning.plan_sweep_step(spec, [{"scenario_id": "x_t1", "metrics": {"min_distance_m": 9.0}}])
    assert second is not None and second.maneuvers[0].trigger.value == 5.2


def test_sweep_reports_exhaustion_when_no_trigger_helped() -> None:
    """Thử hết mà không tới hạn nghĩa là thời điểm KHÔNG phải nguyên nhân — vẫn là thông tin."""
    done = [{"scenario_id": f"x_t{i}", "metrics": {"min_distance_m": 9.0}} for i in range(1, 5)]
    variant, decision = tuning.plan_sweep_step(_spec(), done)
    assert variant is None
    assert decision == tuning.SWEEP_STOP_EXHAUSTED


def _run_red_light_spec(ego_kmh: float = 24.0, actor_kmh: float = 36.0) -> ScenarioSpec:
    """Hình học anchor đô thị: ego tới điểm cắt sau 41,27 m, actor sau 38,56 m."""
    data = json.loads((FIXTURES / "sc_001.json").read_text(encoding="utf-8"))
    data.pop("_comment", None)
    data["odd"]["road_type"] = "urban_straight"
    data["odd"]["maneuver"] = ManeuverType.RUN_RED_LIGHT.value
    data["odd"]["actor_type"] = "car"
    data["actors"][0]["initial_speed_kmh"] = ego_kmh
    data["actors"][1]["category"] = "car"
    data["actors"][1]["initial_speed_kmh"] = actor_kmh
    data["actors"][1]["position"] = {"lane_offset": 0, "s_offset_m": 0.0}
    data["maneuvers"][0]["maneuver"] = ManeuverType.RUN_RED_LIGHT.value
    data["maneuvers"][0]["trigger"] = {"type": "simulation_time", "value": 1.0}
    data["maneuvers"][0]["target_speed_kmh"] = actor_kmh
    return ScenarioSpec.model_validate(data)


def test_run_red_light_sweeps_speed_because_trigger_time_has_no_anchor() -> None:
    """Phép dò theo thời điểm bó tay ở giao lộ vuông góc, nên phải vặn tốc độ.

    `run_red_light` bắt buộc actor có s_offset_m = 0 — nó nằm trên nhánh đường
    vuông góc, không trước cũng không sau ego. `time_until_alongside` chia cho
    khoảng cách dọc bằng 0 nên không có mốc nào để neo.
    """
    spec = _run_red_light_spec()

    assert tuning.propose_triggers(spec) == []
    assert tuning.propose_crossing_speeds(spec)


def test_crossing_speed_brackets_the_moment_both_reach_the_conflict_point() -> None:
    """Mốc là lúc hai xe tới điểm cắt cùng lúc, và phép dò bắc qua CẢ HAI phía.

    Khác phép dò theo thời điểm trigger: ở đó hình học loại sẵn một hướng. Ở giao
    lộ thì tới sớm quá hay muộn quá đều trượt như nhau.

    ego 24 km/h đi 41,27 m -> tới điểm cắt ở giây 6,19. Để actor cũng tới lúc đó
    thì nó phải đi 38,56 m trong 6,19 s = 22,2 km/h.
    """
    speeds = tuning.propose_crossing_speeds(_run_red_light_spec(ego_kmh=24.0))

    assert speeds[0] == 22.2
    assert any(s > 22.2 for s in speeds) and any(s < 22.2 for s in speeds)


def test_no_crossing_sweep_when_ego_is_parked() -> None:
    """Ego đứng yên thì không có thời điểm tới nào để mà khớp."""
    assert tuning.propose_crossing_speeds(_run_red_light_spec(ego_kmh=0.0)) == []


def test_crossing_variants_move_both_speed_fields_together() -> None:
    """Converter dùng `target_speed_kmh`, nhưng `initial_speed_kmh` phải đi theo.

    Lệch hai trường thì xe xuất phát ở một tốc độ rồi giật sang tốc độ khác ngay
    trước nút giao — một tình huống khác hẳn thứ được mô tả.
    """
    spec = _run_red_light_spec()
    variants = tuning.variant_specs(spec)

    assert variants
    for variant in variants:
        adversary = next(a for a in variant.actors if not a.is_ego)
        assert adversary.initial_speed_kmh == variant.maneuvers[0].target_speed_kmh
        assert variant.actors[0].initial_speed_kmh == spec.actors[0].initial_speed_kmh
