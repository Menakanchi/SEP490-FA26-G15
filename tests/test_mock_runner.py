"""Unit tests cho worker/mock_runner.py (Worker mô phỏng giả lập)."""

from __future__ import annotations

from worker.mock_runner import simulate_kinematics


def test_simulate_kinematics_sudden_brake():
    spec = {
        "duration_s": 10.0,
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
                "category": "car",
                "position": {"lane_offset": 0, "s_offset_m": 35.0},
                "initial_speed_kmh": 80.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "sudden_brake",
                "trigger": {"type": "simulation_time", "value": 3.0},
                "target_speed_kmh": 10.0,
            }
        ],
    }

    samples, had_collision = simulate_kinematics("test_sc_001", spec)

    assert len(samples) == 100  # 10s @ 10Hz
    assert samples[0].t == 0.0
    assert samples[-1].t == 9.9
    assert isinstance(had_collision, bool)


def test_simulate_kinematics_cut_in():
    spec = {
        "duration_s": 5.0,
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
                "category": "car",
                "position": {"lane_offset": -1, "s_offset_m": -10.0},
                "initial_speed_kmh": 90.0,
                "is_ego": False,
            },
        ],
        "maneuvers": [
            {
                "actor_name": "adv",
                "maneuver": "cut_in",
                "trigger": {"type": "simulation_time", "value": 1.0},
                "target_speed_kmh": 40.0,
            }
        ],
    }

    samples, _ = simulate_kinematics("test_sc_002", spec)
    assert len(samples) == 50
    # Sau trigger t=1.0s, lat_adv phải giảm dần về 0.0
    post_trigger_sample = next(s for s in samples if s.t == 2.5)
    assert abs(post_trigger_sample.lateral_m) < 3.5
