"""Khoá hành vi cảnh báo gần trùng theo ADR-019."""

from __future__ import annotations

from copy import deepcopy

from src.models.schemas import ScenarioSpec
from src.services.near_duplicate import is_near_duplicate


def _spec(scenario_id: str = "sc_101", **changes: object) -> ScenarioSpec:
    data: dict = {
        "scenario_id": scenario_id,
        "title": "Xe máy tạt đầu",
        "description_vi": "Xe máy vượt lên rồi tạt đầu ô tô",
        "odd": {
            "road_type": "highway",
            "weather": "clear",
            "actor_type": "motorcycle",
            "maneuver": "cut_in",
        },
        "time_of_day": "day",
        "actors": [
            {
                "name": "hero",
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 0.0},
                "initial_speed_kmh": 60.0,
                "is_ego": True,
            },
            {
                "name": "adv",
                "category": "motorcycle",
                "position": {"lane_offset": -1, "s_offset_m": -25.0},
                "initial_speed_kmh": 80.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "cut_in",
                "trigger": {"type": "lead_distance", "value": 7.0},
                "target_speed_kmh": 40.0,
            }
        ],
        "duration_s": 30.0,
    }
    for path, value in changes.items():
        target = data
        parts = path.split("__")
        for part in parts[:-1]:
            target = target[int(part)] if isinstance(target, list) else target[part]
        if isinstance(target, list):
            target[int(parts[-1])] = value
        else:
            target[parts[-1]] = value
    return ScenarioSpec.model_validate(deepcopy(data))


def test_actor_names_and_prose_do_not_define_duplicate() -> None:
    current = _spec("sc_101")
    existing = _spec(
        "sc_102",
        title="Một tiêu đề khác",
        description_vi="Câu chữ hoàn toàn khác nhưng phép thử giống nhau",
        actors__1__name="motorcycle_1",
        maneuvers__0__actor_name="motorcycle_1",
    )

    result = is_near_duplicate(current, existing)

    assert result is not None
    assert result.duplicate_scenario_id == "sc_102"
    assert result.differences == []


def test_within_threshold_returns_concrete_differences() -> None:
    current = _spec("sc_101")
    existing = _spec(
        "sc_102",
        actors__1__position__s_offset_m=-29.0,
        actors__1__initial_speed_kmh=76.0,
        maneuvers__0__trigger__value=10.0,
        maneuvers__0__target_speed_kmh=44.0,
    )

    result = is_near_duplicate(current, existing)

    assert result is not None
    assert {(item.field, item.delta, item.unit) for item in result.differences} == {
        ("actors.motorcycle.s_offset_m", 4.0, "m"),
        ("actors.motorcycle.initial_speed_kmh", 4.0, "km/h"),
        ("maneuvers.cut_in.trigger.value", 3.0, "m"),
        ("maneuvers.cut_in.target_speed_kmh", 4.0, "km/h"),
    }


def test_beyond_any_physical_threshold_is_not_duplicate() -> None:
    current = _spec("sc_101")

    assert is_near_duplicate(current, _spec("sc_102", actors__1__initial_speed_kmh=86.0)) is None
    assert is_near_duplicate(current, _spec("sc_103", actors__1__position__s_offset_m=-31.0)) is None
    assert is_near_duplicate(current, _spec("sc_104", maneuvers__0__trigger__value=13.0)) is None
    assert is_near_duplicate(current, _spec("sc_105", maneuvers__0__target_speed_kmh=46.0)) is None


def test_different_odd_or_lane_is_not_duplicate() -> None:
    current = _spec("sc_101")

    assert is_near_duplicate(current, _spec("sc_102", odd__weather="fog")) is None
    assert is_near_duplicate(current, _spec("sc_103", actors__1__position__lane_offset=1)) is None


def test_none_target_speed_is_not_equal_to_explicit_speed() -> None:
    assert (
        is_near_duplicate(
            _spec("sc_101", maneuvers__0__target_speed_kmh=None),
            _spec("sc_102", maneuvers__0__target_speed_kmh=40.0),
        )
        is None
    )


def test_actor_and_maneuver_list_order_do_not_define_duplicate() -> None:
    current_data = _spec("sc_101").model_dump(mode="json")
    current_data["actors"].append(
        {
            "name": "adv_2",
            "category": "motorcycle",
            "position": {"lane_offset": 1, "s_offset_m": -45.0},
            "initial_speed_kmh": 70.0,
            "is_ego": False,
            "specific_type": None,
        }
    )
    current_data["maneuvers"].append(
        {
            "actor_name": "adv_2",
            "maneuver": "sudden_brake",
            "trigger": {"type": "simulation_time", "value": 8.0},
            "target_speed_kmh": 20.0,
        }
    )

    existing_data = deepcopy(current_data)
    existing_data["scenario_id"] = "sc_102"
    existing_data["actors"][1]["name"] = "moto_a"
    existing_data["actors"][2]["name"] = "moto_b"
    existing_data["maneuvers"][0]["actor_name"] = "moto_a"
    existing_data["maneuvers"][1]["actor_name"] = "moto_b"
    existing_data["actors"].reverse()
    existing_data["maneuvers"].reverse()

    result = is_near_duplicate(
        ScenarioSpec.model_validate(current_data),
        ScenarioSpec.model_validate(existing_data),
    )

    assert result is not None
    assert result.differences == []
