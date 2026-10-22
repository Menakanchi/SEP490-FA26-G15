"""Mô hình dữ liệu cho Candidate, ObjectiveResult, Trial và OptimizationResult."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from .parameters import PARAM_KEYS


@dataclass
class Candidate:
    """Cấu hình AEB được MOBO đề xuất để mô phỏng."""

    params: dict[str, float]
    sampling_source: str = "INITIAL_DESIGN"  # "INITIAL_DESIGN" hoặc "ACQUISITION"
    acquisition_value: float | None = None

    def get(self, key: str, default: float = 0.0) -> float:
        return float(self.params.get(key, default))


@dataclass
class ObjectiveResult:
    """Kết quả đo đạc 3 mục tiêu sau mô phỏng (tất cả đều MINIMIZE)."""

    rms_jerk: float | None = None
    impact_speed: float | None = None
    stopping_distance: float | None = None

    @property
    def is_valid(self) -> bool:
        return (
            self.rms_jerk is not None
            and self.impact_speed is not None
            and self.stopping_distance is not None
        )

    def as_vector(self) -> tuple[float, float, float]:
        if not self.is_valid:
            raise ValueError("Chưa đủ 3 mục tiêu hợp lệ")
        return (float(self.rms_jerk), float(self.impact_speed), float(self.stopping_distance))


class Trial:
    """Kết quả chạy một Candidate qua bộ mô phỏng CARLA / Kinematic."""

    def __init__(
        self,
        trial_id: int | None = None,
        candidate: Candidate | None = None,
        objectives: ObjectiveResult | None = None,
        simulation_status: str = "COMPLETED",
        collision_occurred: bool = False,
        end_reason: str = "SAFE_STOP",
        simulated_duration_s: float = 0.0,
        constraint_violated: bool = False,
        is_pareto_optimal: bool = False,
        error_message: str | None = None,
        # Thuộc tính tương thích ngược:
        trial_number: int | None = None,
        params: dict[str, float] | None = None,
        rms_jerk: float | None = None,
        impact_speed: float | None = None,
        stopping_distance: float | None = None,
        sampling_source: str = "INITIAL_DESIGN",
        acquisition_value: float | None = None,
        **kwargs: Any,
    ):
        self.trial_id = trial_id if trial_id is not None else (trial_number if trial_number is not None else 1)
        if candidate is not None:
            self.candidate = candidate
        else:
            self.candidate = Candidate(
                params=params or {},
                sampling_source=sampling_source,
                acquisition_value=acquisition_value,
            )

        if objectives is not None:
            self.objectives = objectives
        else:
            self.objectives = ObjectiveResult(
                rms_jerk=rms_jerk,
                impact_speed=impact_speed,
                stopping_distance=stopping_distance,
            )

        self.simulation_status = simulation_status
        self.collision_occurred = collision_occurred
        self.end_reason = end_reason
        self.simulated_duration_s = simulated_duration_s
        self.constraint_violated = constraint_violated
        self.is_pareto_optimal = is_pareto_optimal
        self.error_message = error_message

    @property
    def is_valid_observation(self) -> bool:
        """Trial hợp lệ để dùng làm quan sát huấn luyện GP và tính Pareto."""
        return (
            self.simulation_status == "COMPLETED"
            and not self.constraint_violated
            and self.objectives.is_valid
        )

    # --- Các thuộc tính tương thích ngược với MoboTrial cũ ---
    @property
    def trial_number(self) -> int:
        return self.trial_id

    @property
    def params(self) -> dict[str, float]:
        return self.candidate.params

    @property
    def rms_jerk(self) -> float | None:
        return self.objectives.rms_jerk

    @property
    def impact_speed(self) -> float | None:
        return self.objectives.impact_speed

    @property
    def stopping_distance(self) -> float | None:
        return self.objectives.stopping_distance

    @property
    def sampling_source(self) -> str:
        return self.candidate.sampling_source

    @property
    def acquisition_value(self) -> float | None:
        return self.candidate.acquisition_value

    @property
    def is_valid_evaluation(self) -> bool:
        return self.is_valid_observation

    def objective_vector(self) -> tuple[float, float, float]:
        return self.objectives.as_vector()


# Alias tương thích
MoboTrial = Trial


@dataclass
class OptimizationResult:
    """Kết quả tổng thể của một Optimization Run."""

    run_id: int
    trials: list[Trial]
    valid_trials: list[Trial]
    pareto_trials: list[Trial]
    algorithm: str = "qEHVI"
