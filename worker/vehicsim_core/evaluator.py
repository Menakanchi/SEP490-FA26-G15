"""Giao diện SimulationEvaluator và MockSimulationEvaluator phục vụ kiểm thử độc lập."""

from __future__ import annotations

import math
from typing import Any

from .models import Candidate, ObjectiveResult, Trial


class SimulationEvaluator:
    """Interface trừu tượng để đánh giá một Candidate bằng bộ mô phỏng (CARLA / Kinematic)."""

    def evaluate(self, candidate: Candidate, scenario_set: Any = None) -> Trial:
        raise NotImplementedError("SimulationEvaluator must implement evaluate()")


class MockSimulationEvaluator(SimulationEvaluator):
    """Bộ đánh giá giả lập xác định dùng cho Unit Tests (không cần CARLA thật).

    Mô phỏng hàm vật lý tương đối:
    - TTC cao hơn -> quãng phanh xa hơn nhưng giảm tốc độ va chạm
    - Buildup rate cao hơn & max decel cao hơn -> RMS jerk cao hơn
    """

    def __init__(self, failure_probability: float = 0.0):
        self.trial_counter = 0
        self.failure_probability = failure_probability

    def evaluate(self, candidate: Candidate, scenario_set: Any = None) -> Trial:
        self.trial_counter += 1
        p = candidate.params

        ttc = float(p.get("TTC_THRESHOLD", 1.8))
        delay = float(p.get("BRAKE_ACTIVATION_DELAY", 0.15))
        buildup = float(p.get("BRAKE_BUILDUP_RATE", 15.0))
        decel = float(p.get("MAX_DECELERATION", 8.0))

        # Giả lập 3 hàm mục tiêu (tất cả đều MINIMIZE):
        # 1. RMS Jerk (m/s³): tăng theo buildup và decel
        rms_jerk = round(0.25 * buildup + 0.3 * decel + 0.5 / (delay + 0.05), 3)

        # 2. Impact Speed (m/s): giảm khi TTC lớn và decel lớn
        effective_ttc = ttc - delay
        raw_impact = 18.0 - (effective_ttc * 8.5 + decel * 0.8)
        impact_speed = round(max(0.0, raw_impact), 3)

        # 3. Stopping Distance (m): tăng khi TTC lớn, giảm khi decel lớn
        stopping_distance = round(max(8.0, 10.0 + ttc * 4.0 - decel * 0.9), 3)

        obj = ObjectiveResult(
            rms_jerk=rms_jerk,
            impact_speed=impact_speed,
            stopping_distance=stopping_distance,
        )

        return Trial(
            trial_id=self.trial_counter,
            candidate=candidate,
            objectives=obj,
            simulation_status="COMPLETED",
            collision_occurred=(impact_speed > 0.001),
            end_reason="COLLISION" if impact_speed > 0.001 else "SAFE_STOP",
            simulated_duration_s=round(3.0 + stopping_distance / 10.0, 2),
        )
