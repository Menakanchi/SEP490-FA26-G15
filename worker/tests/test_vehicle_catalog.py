"""Phần tính của ``vehicle_catalog.py`` (không cần CARLA): đổi physics đọc được sang cột ``carla_vehicle_models`` và sinh SQL."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
import vehicle_catalog as vc


def _pos(x: float, y: float) -> SimpleNamespace:
    return SimpleNamespace(x=x, y=y, z=0.0)


def _snapshot(wheels: list[dict] | None = None) -> dict:
    return {"mass": 1845.0, "drag_coefficient": 0.15, "max_rpm": 15000.0, "moi": 1.0, "final_ratio": 4.0,
            "center_of_mass": {"x": 0.04, "y": 0.0, "z": -0.31},
            "wheels": wheels or [{"tire_friction": 3.5, "max_brake_torque": 700.0}, {"tire_friction": 3.5, "max_brake_torque": 700.0},
                                 {"tire_friction": 3.5, "max_brake_torque": 500.0}, {"tire_friction": 3.5, "max_brake_torque": 500.0}],
            "length_m": 4.79306, "width_m": 2.163208, "height_m": 1.48841, "wheelbase_m": 2.9}


def test_wheelbase_runs_from_front_axle_to_last_axle() -> None:
    four = [_pos(150, -80), _pos(150, 80), _pos(-140, -80), _pos(-140, 80)]
    six = [_pos(300, -100), _pos(300, 100), _pos(-100, -100), _pos(-100, 100), _pos(-250, -100), _pos(-250, 100)]
    assert vc.axle_wheelbase_m(four) == pytest.approx(2.9)
    assert vc.axle_wheelbase_m(six) == pytest.approx(5.5)  # trục cuối, không phải trục giữa (4,0 m)
    assert vc.axle_wheelbase_m(four[:2]) is None


def test_catalog_row_maps_physics_to_columns() -> None:
    row = vc.catalog_row("vehicle.tesla.model3", "Tesla Model 3", True, _snapshot(), 2.9, 3.56, 9.5)
    assert set(row) == set(vc.COLUMNS)
    assert row["length_m"] == 4.793 and row["width_m"] == 2.163 and row["height_m"] == 1.488
    assert row["num_wheels"] == 4 and row["mass_kg"] == 1845.0
    assert (row["center_of_mass_x_m"], row["center_of_mass_y_m"], row["center_of_mass_z_m"]) == (0.04, 0.0, -0.31)
    assert row["max_brake_torque_nm"] == 700.0  # bánh lớn nhất, không phải trung bình
    assert row["max_brake_decel_mps2"] == 9.5 and row["carla_full_brake_decel_mps2"] == 3.56
    assert row["max_speed_mps"] is None and row["is_supported"] is True


def test_missing_measurement_stays_empty_not_zero() -> None:
    row = vc.catalog_row("vehicle.x", "X", False, _snapshot(), None, None, 9.5)
    assert row["carla_full_brake_decel_mps2"] is None and row["wheelbase_m"] is None
    assert row["is_supported"] is False


def test_study_decel_takes_base_group_mean_and_skips_failed_vehicles() -> None:
    study = {"vehicles": [
        {"blueprint": "vehicle.a", "groups": {"base": {"decel_mps2": {"mean": 3.5612}}}},
        {"blueprint": "vehicle.b", "groups": {"base": {"decel_mps2": None}}},
        {"blueprint": "vehicle.c", "error": "RuntimeError: không có blueprint"},
    ]}
    assert vc.study_decel(study) == {"vehicle.a": 3.56}


def test_sql_insert_skips_existing_blueprints_and_escapes_text() -> None:
    row = vc.catalog_row("vehicle.o'brien", "O'Brien", False, _snapshot(), None, None, 9.5)
    sql = vc.sql_insert([row])
    assert "'vehicle.o''brien' AS carla_blueprint_id" in sql and "'O''Brien' AS display_name" in sql
    assert "NULL AS carla_full_brake_decel_mps2" in sql and "FALSE AS is_supported" in sql
    assert "WHERE v.carla_blueprint_id NOT IN" in sql  # chạy lại không thêm trùng, không sửa dòng cũ
    assert sql.count("UNION ALL") == 0
    assert vc.sql_insert([row, row]).count("UNION ALL") == 1
