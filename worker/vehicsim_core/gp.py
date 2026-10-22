"""Gaussian Process Regressor gọn nhẹ dùng RBF Kernel và phân rã Cholesky thuần Python."""

from __future__ import annotations

import math
from typing import Any

from .kernel import RBFKernel
from .linalg import backward_substitution, cholesky_decomposition, forward_substitution


class GaussianProcessRegressor:
    """Gaussian Process Regressor độc lập cho từng hàm mục tiêu."""

    def __init__(
        self,
        kernel: RBFKernel | None = None,
        noise: float = 1e-4,
        jitter: float = 1e-6,
    ):
        self.kernel = kernel or RBFKernel()
        self.noise = noise
        self.jitter = jitter
        self.X_train: list[list[float]] = []
        self.y_train: list[float] = []
        self.L: list[list[float]] = []
        self.alpha: list[float] = []

    def fit(self, X: list[list[float]], y: list[float]) -> None:
        """Huấn luyện GP với tập dữ liệu X (đã chuẩn hoá [0,1]^4) và y."""
        self.X_train = [list(x) for x in X]
        self.y_train = [float(v) for v in y]
        n = len(X)
        if n == 0:
            return

        # Tính ma trận covariance K_y = K(X, X) + (noise + jitter) * I
        K = self.kernel.compute_matrix(self.X_train, self.X_train)
        for i in range(n):
            K[i][i] += self.noise + self.jitter

        # Phân rã Cholesky: K_y = L * L^T
        self.L = cholesky_decomposition(K, jitter=self.jitter)

        # Tính alpha = L^T \ (L \ y)
        y_vec = forward_substitution(self.L, self.y_train)
        self.alpha = backward_substitution(self.L, y_vec)

    def predict(self, x: list[float]) -> tuple[float, float, float]:
        """Dự báo phân phối hậu nghiệm cho điểm x: trả về (mean, variance, std)."""
        if not self.X_train:
            return 0.0, 1.0, 1.0

        # k_star = [k(x_1, x), ..., k(x_n, x)]
        k_star = [self.kernel(x_train, x) for x_train in self.X_train]

        # mean = k_star^T * alpha
        mean = sum(k * a for k, a in zip(k_star, self.alpha))

        # variance: v = L \ k_star; var = k(x, x) - v^T * v
        v = forward_substitution(self.L, k_star)
        v_sq = sum(val * val for val in v)
        k_xx = self.kernel(x, x) + self.noise

        variance = k_xx - v_sq
        if variance < 0.0:
            variance = 0.0

        std = math.sqrt(variance)
        return mean, variance, std
