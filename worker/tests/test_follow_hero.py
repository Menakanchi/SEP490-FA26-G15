"""Phần số của HUD trong ``worker/follow_hero.py`` — không cần CARLA."""

from __future__ import annotations

from types import SimpleNamespace

import follow_hero


def _v(x: float, y: float, z: float = 0.0) -> SimpleNamespace:
    return SimpleNamespace(x=x, y=y, z=z)


def test_longitudinal_is_signed_along_heading() -> None:
    forward = _v(0.0, 1.0)  # xe hướng +y
    assert follow_hero.longitudinal(_v(0.5, -6.0), forward) == -6.0  # đang phanh
    assert follow_hero.longitudinal(_v(3.0, 0.0), forward) == 0.0  # gia tốc ngang không tính


def test_hud_lines_show_speed_pedals_and_gaps() -> None:
    lines = follow_hero.hud_lines(13.89, -6.04, 0.0, 0.85, 3.4, pedestrian_m=12.34, vehicle_m=None)
    assert lines == [
        "v  50.0 km/h   a  -6.0 m/s2",
        "ga 0.00   phanh 0.85",
        "t   3.40 s   nguoi  12.3 m (tam-tam)",
    ]


def test_hud_lines_without_targets_and_ascii_only() -> None:
    lines = follow_hero.hud_lines(0.0, 0.0, 0.3, 0.0, 0.0, pedestrian_m=None, vehicle_m=20.0)
    assert lines[-1] == "t   0.00 s   xe  20.0 m (tam-tam)"
    assert follow_hero.hud_lines(1.0, 0.0, 0.0, 0.0, 1.0, None, None)[-1] == "t   1.00 s"
    assert all(line.isascii() for line in lines)
    assert "a  +0.0 m/s2" in follow_hero.hud_lines(1.0, -0.01, 0.0, 0.0, 1.0, None, None)[0]  # không in "-0.0"


def test_nearest_skips_destroyed_actors() -> None:
    origin = SimpleNamespace(distance=lambda loc: abs(loc.x))

    def gone() -> None:
        raise RuntimeError("actor destroyed")

    actors = [SimpleNamespace(get_location=lambda: _v(9.0, 0.0)), SimpleNamespace(get_location=gone),
              SimpleNamespace(get_location=lambda: _v(-4.0, 0.0))]
    assert follow_hero.nearest(origin, actors) == 4.0
    assert follow_hero.nearest(origin, []) is None
