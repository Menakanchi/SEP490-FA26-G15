"""Phần so sánh của ``verify_cases.py`` (không cần CARLA hay Java)."""

from __future__ import annotations

import json
from pathlib import Path

import verify_cases


def test_every_bundled_case_is_a_pedestrian_crossing_with_the_calibrated_etron() -> None:
    bundles = sorted(verify_cases.DEFAULT_CASES.glob("*.json"))
    assert [b.stem for b in bundles] == ["c1", "c2", "c3", "c4", "c5", "c6", "c7"]
    for bundle in bundles:
        doc = json.loads(bundle.read_text(encoding="utf-8"))
        assert doc["format"] == "vehicsim.variant/v1" and doc["seed"] == 48846
        carla = doc["vehicle"]["carla"]
        # Đúng cấu hình bảng bàn đạp e-tron (ADR-054) và migration 014: khác đi thì adapter quay về bàn đạp tuyến tính.
        assert carla["blueprint"] == "vehicle.audi.etron" and carla["physics"]["wheels"]["max_brake_torque"] == 1800.0
        assert carla["full_brake_decel_mps2"] == 9.13
    assert set(verify_cases.REFERENCE_2026_11_13) <= {b.stem for b in bundles}


def test_compare_rows_put_carla_mean_sd_next_to_kinematic_and_reference() -> None:
    carla = {"summary": {"end_reason": {"EGO_STOPPED": 3}, "aeb_decision_t": {"n": 3, "mean": 2.25, "sd": 0.0},
                         "stopping_distance_m": {"n": 3, "mean": 9.1, "sd": 0.05}, "min_distance_m": {"n": 0}}}
    kinematic = {"end_reason": "EGO_STOPPED", "aeb_decision_t": 2.25, "stopping_distance_m": 8.78, "min_distance_m": 3.701}
    rows = {r["metric"]: r for r in verify_cases.compare_rows("c1", carla, kinematic)}
    assert rows["end_reason"] == {"case": "c1", "metric": "end_reason", "carla": "EGO_STOPPED ×3", "kinematic": "EGO_STOPPED",
                                  "ref_2026_11_13": "EGO_STOPPED"}
    assert rows["stopping_distance_m"]["carla"] == "9.100 ± 0.050" and rows["stopping_distance_m"]["kinematic"] == "8.780"
    assert rows["stopping_distance_m"]["ref_2026_11_13"] == "11.413"
    assert rows["min_distance_m"]["carla"] == "—"  # không có mẫu thì không thành 0
    assert rows["brake_onset_t"]["ref_2026_11_13"] == ""  # 13/11 không ghi chỉ số này


def test_without_carla_the_table_still_lists_kinematic_numbers(tmp_path: Path) -> None:
    rows = verify_cases.compare_rows("c7", None, {"end_reason": "EGO_STOPPED", "aeb_decision_t": 2.25})
    text = verify_cases.markdown(rows, {"c7": "vehicsim.xosc/v9"}, 3, skipped=True)
    assert "c7 vehicsim.xosc/v9" in text and "| c7 | aeb_decision_t | — | 2.250 |  |" in text
    xosc = tmp_path / "s.xosc"
    xosc.write_text('<ParameterDeclaration name="vs_format" parameterType="string" value="vehicsim.xosc/v9" />', encoding="utf-8")
    assert verify_cases.xosc_format(xosc) == "vehicsim.xosc/v9"


def test_vehicle_cases_match_the_calibrated_pedal_maps() -> None:
    """Bộ ca 3 xe (ADR-059): mô-men / phanh 100% đúng như migration 016, để adapter chọn đúng bảng bàn đạp."""
    expected = {"vehicle.tesla.model3": (1750.0, 9.87), "vehicle.nissan.patrol_2021": (2250.0, 9.90), "vehicle.mercedes.sprinter": (2250.0, 8.91)}
    bundles = sorted((verify_cases.WORKER / "cases" / "pedestrian-xe").glob("*.json"))
    assert len(bundles) == 9
    for bundle in bundles:
        carla = json.loads(bundle.read_text(encoding="utf-8"))["vehicle"]["carla"]
        torque, full = expected[carla["blueprint"]]
        assert carla["physics"]["wheels"]["max_brake_torque"] == torque and carla["full_brake_decel_mps2"] == full
