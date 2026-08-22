"""Phần toán của behavior checker, kiểm bằng quỹ đạo dựng tay.

Import được từ venv backend vì ``worker/trajectory.py`` để ``import carla``
trong hàm — xem docstring của module đó. Con số trong các test dưới đây lấy từ
những lượt chạy CARLA thật ngày 22/08/2026, không phải số bịa cho tròn.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

_SPEC = importlib.util.spec_from_file_location(
    "worker_trajectory", Path(__file__).parents[2] / "worker" / "trajectory.py"
)
assert _SPEC and _SPEC.loader
trajectory = importlib.util.module_from_spec(_SPEC)
# Đăng ký trước khi exec: `@dataclass` tra `sys.modules[cls.__module__]` lúc
# dựng class, và nó nổ nếu module chưa có ở đó.
sys.modules["worker_trajectory"] = trajectory
_SPEC.loader.exec_module(trajectory)

Sample = trajectory.Sample


def _sample(t: float, *, lon: float, lat: float, lane_offset: float = 0.0, ego_v: float = 19.4) -> Sample:
    """Dựng một tick với hình học thật: Tesla nửa dài 2,4 m nửa rộng 1,08 m; xe ben 1,31 m."""
    return Sample(
        t=t,
        longitudinal_m=lon,
        lateral_m=lat,
        gap_lon_m=abs(lon) - (2.4 + 2.6),
        gap_lat_m=abs(lat) - (1.08 + 1.31),
        ego_speed_ms=ego_v,
        adv_speed_ms=16.5,
        adv_lane_offset_m=lane_offset,
    )


def test_no_samples_returns_no_metrics() -> None:
    """Đo hỏng thì không có số, chứ không có số bịa."""
    assert trajectory.summarise([]) == {}


def test_near_miss_and_nothing_happened_get_different_numbers() -> None:
    """Đây là lý do checker tồn tại: CollisionTest trả 0 cho cả hai.

    Số lấy từ hai lượt chạy sc_906 ngày 22/08 — cùng kịch bản, chỉ khác thời
    điểm trigger.
    """
    # Ego đuổi kịp xe tải đi trước 20 m, chênh 2,8 m/s -> đi ngang nhau ở giây 7,2.
    # Khe hở nhỏ nhất phải đo được ĐÚNG LÚC ĐÓ, không phải lúc còn cách 20 m.
    approach = [0.0, 2.0, 4.0, 6.0, 7.0, 8.0, 10.0]
    near_miss = [_sample(t, lon=20 - 2.8 * t, lat=-2.75, lane_offset=-0.70) for t in approach]
    nothing = [_sample(t, lon=20 - 2.8 * t, lat=-3.45, lane_offset=-0.03) for t in approach]

    tight = trajectory.summarise(near_miss)
    idle = trajectory.summarise(nothing)

    assert tight["min_distance_m"] < 0.5
    assert idle["min_distance_m"] > 1.0
    # Và lệch tim làn nói maneuver có xảy ra hay không, thứ khe hở không nói được.
    assert tight["adversary_lane_deviation_m"] == pytest.approx(0.70)
    assert idle["adversary_lane_deviation_m"] < 0.1


def test_contact_sign_says_who_hit_whom() -> None:
    """Dấu của contact_longitudinal_m phân biệt tạt đầu với tông đuôi.

    Golden cut_in trigger 2,0 s: chạm lúc adversary còn sau ego 4,71 m.
    Golden cut_in trigger 6,0 s: chạm lúc adversary ở trước ego 4,78 m.
    ``CollisionTest`` báo FAILURE cho cả hai.
    """
    rear_ended = trajectory.summarise([_sample(4.32, lon=-4.71, lat=-0.2)])
    proper_cut_in = trajectory.summarise([_sample(18.30, lon=4.78, lat=-0.1)])

    assert rear_ended["contact_longitudinal_m"] < 0, "adversary tông đuôi ego"
    assert proper_cut_in["contact_longitudinal_m"] > 0, "ego đâm vào xe vừa tạt đầu"
    assert rear_ended["contact_time_s"] == pytest.approx(4.32)


def test_no_contact_leaves_the_field_out_entirely() -> None:
    """Không chạm thì không có trường contact — đừng để 0.0 bị đọc nhầm thành 'chạm ngay tâm'."""
    metrics = trajectory.summarise([_sample(1.0, lon=30.0, lat=-3.5)])
    assert "contact_longitudinal_m" not in metrics
    assert "contact_time_s" not in metrics


def test_ttc_ignores_vehicles_in_another_lane() -> None:
    """Vượt xe ở làn bên cạnh không phải sắp va chạm, dù khoảng cách dọc thu hẹp nhanh."""
    overtaking = [_sample(t, lon=40 - 10 * t, lat=-3.5) for t in (0.0, 1.0, 2.0)]
    assert "ttc_min_s" not in trajectory.summarise(overtaking)


def test_ttc_measured_when_closing_in_the_same_lane() -> None:
    """Cùng làn và đang thu hẹp: TTC = khe hở dọc / tốc độ thu hẹp."""
    closing = [_sample(t, lon=40 - 10 * t, lat=-0.1) for t in (0.0, 1.0, 2.0)]
    # tick cuối: gap_lon = 20 - 5 = 15 m, thu hẹp 10 m/s -> 1,5 s
    assert trajectory.summarise(closing)["ttc_min_s"] == pytest.approx(1.5)


def test_ttc_ignores_a_widening_gap() -> None:
    """Adversary chạy xa dần thì không có TTC nào để báo."""
    widening = [_sample(t, lon=10 + 5 * t, lat=-0.1) for t in (0.0, 1.0, 2.0)]
    assert "ttc_min_s" not in trajectory.summarise(widening)


def test_overlapping_boxes_report_zero_distance() -> None:
    """Đã chạm thì khe hở là 0, không phải một số âm mang sang chỗ khác."""
    metrics = trajectory.summarise([_sample(5.0, lon=1.0, lat=0.1)])
    assert metrics["min_distance_m"] == 0.0
