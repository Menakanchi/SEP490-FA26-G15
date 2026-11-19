"""Phần số của HUD trong ``worker/follow_hero.py`` — không cần CARLA."""

from __future__ import annotations

from types import SimpleNamespace

import follow_hero


def _v(x: float, y: float, z: float = 0.0) -> SimpleNamespace:
    return SimpleNamespace(x=x, y=y, z=z)


def _loc(x: float) -> SimpleNamespace:
    return SimpleNamespace(x=x, distance=lambda other: abs(other.x - x))


def test_longitudinal_is_signed_along_heading() -> None:
    forward = _v(0.0, 1.0)  # xe hướng +y
    assert follow_hero.longitudinal(_v(0.5, -6.0), forward) == -6.0  # đang phanh
    assert follow_hero.longitudinal(_v(3.0, 0.0), forward) == 0.0  # gia tốc ngang không tính


def test_hud_lines_show_speed_pedals_and_gaps() -> None:
    lines = follow_hero.hud_lines(13.89, -6.04, 0.0, 0.85, 3.4, pedestrian_m=12.34, vehicle_m=None)
    assert lines == [
        " 50.0 km/h",
        "Gia tốc  -6.0 m/s²",
        "Ga 0.00   Phanh 0.85",
        "t   3.40 s",
        "Người  12.3 m (tâm-tâm)",
    ]


def test_hud_lines_without_targets() -> None:
    assert follow_hero.hud_lines(0.0, 0.0, 0.3, 0.0, 0.0, pedestrian_m=None, vehicle_m=20.0)[-1] == "Xe  20.0 m (tâm-tâm)"
    assert follow_hero.hud_lines(1.0, 0.0, 0.0, 0.0, 1.0, None, None)[-1] == "t   1.00 s"
    assert "+0.0 m/s²" in follow_hero.hud_lines(1.0, -0.01, 0.0, 0.0, 1.0, None, None)[1]  # không in "-0.0"


def test_nearest_and_snapshot_skip_destroyed_actors() -> None:
    states = {1: SimpleNamespace(get_transform=lambda: SimpleNamespace(location=_loc(9.0))),
              3: SimpleNamespace(get_transform=lambda: SimpleNamespace(location=_loc(-4.0)))}
    snapshot = SimpleNamespace(find=states.get)  # actor 2 đã huỷ: không có trong snapshot
    actors = [SimpleNamespace(id=1), SimpleNamespace(id=2), SimpleNamespace(id=3)]
    locations = follow_hero.snapshot_locations(snapshot, actors)
    assert [loc.x for loc in locations] == [9.0, -4.0]
    assert follow_hero.nearest(_loc(0.0), locations) == 4.0
    assert follow_hero.nearest(_loc(0.0), []) is None


def test_hud_from_snapshot_reads_the_tick() -> None:
    hero_state = SimpleNamespace(
        get_transform=lambda: SimpleNamespace(location=_loc(0.0), get_forward_vector=lambda: _v(1.0, 0.0)),
        get_velocity=lambda: _v(10.0, 0.0),
        get_acceleration=lambda: _v(-5.0, 0.2),
    )
    snapshot = SimpleNamespace(find={7: hero_state}.get, timestamp=SimpleNamespace(elapsed_seconds=12.5))
    hero = SimpleNamespace(id=7, get_control=lambda: SimpleNamespace(throttle=0.0, brake=1.0))
    lines, braking = follow_hero.hud_from_snapshot(hero, snapshot, 10.0, [], [])
    assert lines[:4] == [" 36.0 km/h", "Gia tốc  -5.0 m/s²", "Ga 0.00   Phanh 1.00", "t   2.50 s"]
    assert braking is True
    gone = SimpleNamespace(id=8, get_control=hero.get_control)
    assert follow_hero.hud_from_snapshot(gone, snapshot, 10.0, [], []) is None
