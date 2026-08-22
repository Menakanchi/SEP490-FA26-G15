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


def test_metrics_stop_at_first_contact() -> None:
    """Sau va chạm xe bị hất khỏi làn; tính cả phần đó thì số đo hành vi thành rác.

    Đo thật trên sc_001 ngày 22/08: tính cả phần sau va chạm cho
    ``adversary_lane_deviation_m`` = 21,18 m — xe máy nằm giữa đồng, không phải
    nó đã lấn 21 mét.
    """
    approach = [_sample(0.0, lon=20.0, lat=-0.2, lane_offset=0.4)]
    contact = [_sample(1.0, lon=4.0, lat=-0.2, lane_offset=0.6)]
    wreckage = [_sample(2.0, lon=-40.0, lat=-25.0, lane_offset=21.18)]

    metrics = trajectory.summarise(approach + contact + wreckage)

    assert metrics["adversary_lane_deviation_m"] == pytest.approx(0.6)
    assert metrics["trajectory_samples"] == 3.0, "vẫn đếm đủ mẫu đã ghi"
    assert metrics["contact_time_s"] == pytest.approx(1.0)


def test_speed_metrics_make_longitudinal_maneuvers_judgeable() -> None:
    """`sudden_brake` chỉ kiểm chứng được khi biết xe có thật sự chậm lại."""
    braking = [
        Sample(
            t=0.0,
            longitudinal_m=20,
            lateral_m=0.1,
            gap_lon_m=15,
            gap_lat_m=-1,
            ego_speed_ms=8.3,
            adv_speed_ms=13.9,
            adv_lane_offset_m=0.0,
        ),
        Sample(
            t=3.0,
            longitudinal_m=12,
            lateral_m=0.1,
            gap_lon_m=7,
            gap_lat_m=-1,
            ego_speed_ms=8.3,
            adv_speed_ms=2.8,
            adv_lane_offset_m=0.0,
        ),
    ]
    metrics = trajectory.summarise(braking)
    assert metrics["adversary_min_speed_ms"] == pytest.approx(2.8)
    assert metrics["adversary_speed_drop_ms"] == pytest.approx(11.1)


def test_surrogate_safety_measures_follow_their_definitions() -> None:
    """THW, PET, DRAC — ba phép đo chuẩn ngành, kiểm bằng số học tay.

    Ego 10 m/s bám sau tác nhân trong cùng làn, khe hở dọc 20 m rồi 10 m sau 1 s.
    """
    following = [
        Sample(
            t=0.0,
            longitudinal_m=25.0,
            lateral_m=0.1,
            gap_lon_m=20.0,
            gap_lat_m=-1.0,
            ego_speed_ms=10.0,
            adv_speed_ms=5.0,
            adv_lane_offset_m=0.0,
        ),
        Sample(
            t=1.0,
            longitudinal_m=15.0,
            lateral_m=0.1,
            gap_lon_m=10.0,
            gap_lat_m=-1.0,
            ego_speed_ms=10.0,
            adv_speed_ms=5.0,
            adv_lane_offset_m=0.0,
        ),
    ]
    m = trajectory.summarise(following)

    assert m["thw_min_s"] == pytest.approx(1.0), "10 m khe hở / 10 m/s"
    assert m["pet_min_s"] == pytest.approx(1.0), "chồng ngang -> 10 m / xe nhanh hơn 10 m/s"
    # thu hẹp 10 m/s trên khe hở 10 m -> 10^2 / (2*10) = 5 m/s²
    assert m["drac_max_ms2"] == pytest.approx(5.0)


def test_headway_ignores_a_vehicle_in_another_lane() -> None:
    """Xe ở làn bên cạnh không tạo headway, dù nó ở ngay phía trước."""
    beside = [
        Sample(
            t=t,
            longitudinal_m=20.0,
            lateral_m=-3.5,
            gap_lon_m=15.0,
            gap_lat_m=1.1,
            ego_speed_ms=10.0,
            adv_speed_ms=10.0,
            adv_lane_offset_m=0.0,
        )
        for t in (0.0, 1.0)
    ]
    assert "thw_min_s" not in trajectory.summarise(beside)


def test_crossing_is_detected_by_a_sign_flip_close_to_the_ego() -> None:
    """Người đi bộ băng ngang = đổi dấu độ lệch ngang lúc còn gần ego."""
    crossing = [
        _sample(0.0, lon=25.0, lat=-4.0),
        _sample(1.0, lon=12.0, lat=-1.5),
        _sample(2.0, lon=6.0, lat=1.5),
        _sample(3.0, lon=2.0, lat=4.0),
    ]
    assert trajectory.summarise(crossing)["adversary_crossed_ego_path"] == 1.0


def test_crossing_far_from_the_ego_is_not_counted() -> None:
    """Sang đường cách ego 200 m là giao thông bình thường, không phải kịch bản.

    Khoá vẫn phải CÓ MẶT với giá trị 0: vắng mặt dành riêng cho "worker cũ không
    đo", còn 0 là một phán quyết — đo rồi, và nó không băng qua.
    """
    far = [_sample(0.0, lon=180.0, lat=-4.0), _sample(1.0, lon=175.0, lat=4.0)]
    assert trajectory.summarise(far)["adversary_crossed_ego_path"] == 0.0


def test_heading_delta_reports_opposing_traffic() -> None:
    """Ngược chiều ~180 độ; cùng chiều ~0. Quy về [0, 180] nên 350 độ là 10."""
    opposing = [
        Sample(
            t=0.0,
            longitudinal_m=40,
            lateral_m=0.2,
            gap_lon_m=35,
            gap_lat_m=-1,
            ego_speed_ms=20,
            adv_speed_ms=16,
            adv_lane_offset_m=0.0,
            ego_pose=(0.0, 0.0, 90.0),
            adv_pose=(0.0, 0.0, -90.0),
        ),
    ]
    assert trajectory.summarise(opposing)["adversary_heading_delta_deg"] == 180.0

    same = [
        Sample(
            t=0.0,
            longitudinal_m=40,
            lateral_m=0.2,
            gap_lon_m=35,
            gap_lat_m=-1,
            ego_speed_ms=20,
            adv_speed_ms=16,
            adv_lane_offset_m=0.0,
            ego_pose=(0.0, 0.0, 5.0),
            adv_pose=(0.0, 0.0, 355.0),
        ),
    ]
    assert trajectory.summarise(same)["adversary_heading_delta_deg"] == 10.0


def test_heading_is_absent_rather_than_zero_when_no_pose_was_recorded() -> None:
    """0 độ nghĩa là cùng hướng — khác hẳn 'không đo được'."""
    assert "adversary_heading_delta_deg" not in trajectory.summarise([_sample(0.0, lon=10.0, lat=0.2)])


def _load_runner():
    """`worker/runner.py` import được từ venv backend: nó không `import carla` ở đầu file."""
    import importlib.util

    root = Path(__file__).parents[2] / "worker"
    sys.path.insert(0, str(root))
    spec = importlib.util.spec_from_file_location("worker_runner", root / "runner.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["worker_runner"] = module
    spec.loader.exec_module(module)
    return module


def test_failed_runs_never_carry_trajectory_numbers() -> None:
    """Spawn hỏng thì recorder đo nhầm actor còn sót từ lượt trước.

    Đo thật ngày 22/08: bốn lượt `Error: Unable to add actors` liên tiếp vẫn trả
    "khe hở nhỏ nhất 29,04 m" — số trông như thật cho kịch bản chưa hề bắt đầu.
    """
    runner = _load_runner()
    stale = {"min_distance_m": 29.04, "adversary_lane_deviation_m": 63.88}

    failed = runner.attach_trajectory(
        {"success": False, "metrics": {}, "error": "Unable to add actors"}, stale, [{"t": 0.0}]
    )
    assert failed["metrics"] == {}
    assert "trajectory" not in failed

    ok = runner.attach_trajectory({"success": True, "metrics": {}}, stale, [{"t": 0.0}])
    assert ok["metrics"]["min_distance_m"] == 29.04
    assert len(ok["trajectory"]) == 1
