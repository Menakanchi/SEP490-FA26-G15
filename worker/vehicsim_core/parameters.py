"""Quản lý không gian 4 tham số AEB và ràng buộc giá trị."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Danh sách chuẩn 4 tham số AEB và 3 mục tiêu (ADR-040)
PARAM_KEYS = (
    "TTC_THRESHOLD",
    "BRAKE_ACTIVATION_DELAY",
    "BRAKE_BUILDUP_RATE",
    "MAX_DECELERATION",
)

OBJECTIVE_KEYS = (
    "rms_jerk",
    "impact_speed",
    "stopping_distance",
)

# Giới hạn tìm kiếm mặc định (khớp với aeb_parameters trong database)
DEFAULT_SEARCH_SPACE: dict[str, tuple[float, float]] = {
    "TTC_THRESHOLD": (0.5, 3.5),
    "BRAKE_ACTIVATION_DELAY": (0.05, 0.45),
    "BRAKE_BUILDUP_RATE": (5.0, 20.0),
    "MAX_DECELERATION": (5.0, 10.0),
}


@dataclass
class ParameterBounds:
    """Quản lý cận và chuẩn hoá cho 4 tham số AEB."""

    bounds: dict[str, tuple[float, float]] = field(
        default_factory=lambda: dict(DEFAULT_SEARCH_SPACE)
    )

    def lower(self, key: str) -> float:
        return self.bounds[key][0]

    def upper(self, key: str) -> float:
        return self.bounds[key][1]

    def is_valid(self, params: dict[str, float]) -> bool:
        """Kiểm tra cấu hình có nằm trong bounds hay không."""
        for k in PARAM_KEYS:
            if k not in params:
                return False
            val = float(params[k])
            lo, hi = self.bounds[k]
            if val < lo - 1e-6 or val > hi + 1e-6:
                return False
        return True

    def clamp(self, key: str, val: float) -> float:
        lo, hi = self.bounds[key]
        return max(lo, min(hi, val))

    def scale_to_unit(self, key: str, val: float) -> float:
        lo, hi = self.bounds[key]
        if hi <= lo:
            return 0.5
        return (val - lo) / (hi - lo)

    def scale_from_unit(self, key: str, unit_val: float) -> float:
        lo, hi = self.bounds[key]
        return lo + unit_val * (hi - lo)

    def normalize(self, params: dict[str, float]) -> list[float]:
        return [self.scale_to_unit(k, float(params[k])) for k in PARAM_KEYS]

    def denormalize(self, unit_vector: list[float]) -> dict[str, float]:
        return {
            k: round(self.scale_from_unit(k, unit_vector[i]), 3)
            for i, k in enumerate(PARAM_KEYS)
        }


# Tương thích ngược với tên cũ MoboSearchSpace
MoboSearchSpace = ParameterBounds
