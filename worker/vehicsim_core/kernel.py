"""RBF / Squared Exponential Kernel với length scale riêng cho từng chiều tham số."""

from __future__ import annotations

import math
from dataclasses import dataclass, field


@dataclass
class RBFKernel:
    """RBF (Squared Exponential) Kernel cho không gian tham số chuẩn hoá [0, 1]^4.

    k(x, x') = sigma_f^2 * exp(-0.5 * sum((x_d - x'_d)^2 / l_d^2))
    """

    length_scales: list[float] = field(default_factory=lambda: [0.35, 0.35, 0.35, 0.35])
    signal_variance: float = 1.0

    def __call__(self, x1: list[float], x2: list[float]) -> float:
        """Tính giá trị covariance k(x1, x2)."""
        sq_dist = 0.0
        n_dim = min(len(x1), len(x2), len(self.length_scales))
        for d in range(n_dim):
            l_d = self.length_scales[d] if self.length_scales[d] > 1e-4 else 0.35
            diff = x1[d] - x2[d]
            sq_dist += (diff * diff) / (l_d * l_d)

        return self.signal_variance * math.exp(-0.5 * sq_dist)

    def compute_matrix(self, X1: list[list[float]], X2: list[list[float]]) -> list[list[float]]:
        """Tính ma trận kernel K giữa hai tập điểm."""
        return [[self(a, b) for b in X2] for a in X1]
