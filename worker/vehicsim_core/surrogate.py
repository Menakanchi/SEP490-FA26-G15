"""Surrogate Modeling: 3 Gaussian Process models độc lập cho 3 mục tiêu AEB."""

from __future__ import annotations

from .gp import GaussianProcessRegressor
from .kernel import RBFKernel
from .models import Trial
from .parameters import PARAM_KEYS, ParameterBounds


class MultiObjectiveSurrogate:
    """Quản lý 3 mô hình Gaussian Process độc lập cho 3 hàm mục tiêu:

    GP_1 -> RMS_JERK (Độ êm ái, m/s³)
    GP_2 -> IMPACT_SPEED (Tốc độ va chạm, m/s)
    GP_3 -> STOPPING_DISTANCE (Quãng đường phanh dừng, m)
    """

    def __init__(
        self,
        bounds: ParameterBounds | None = None,
        length_scales: list[float] | None = None,
        noise: float = 1e-4,
    ):
        self.bounds = bounds or ParameterBounds()
        scales = length_scales or [0.35, 0.35, 0.35, 0.35]
        self.gp_jerk = GaussianProcessRegressor(kernel=RBFKernel(length_scales=scales), noise=noise)
        self.gp_impact = GaussianProcessRegressor(kernel=RBFKernel(length_scales=scales), noise=noise)
        self.gp_stop = GaussianProcessRegressor(kernel=RBFKernel(length_scales=scales), noise=noise)
        self.gps = [self.gp_jerk, self.gp_impact, self.gp_stop]

        # Lưu cận min/max thực tế để chuẩn hoá objective về khoảng [0, 1] khi tính Hypervolume
        self.obj_bounds: list[tuple[float, float]] = [(0.0, 1.0), (0.0, 1.0), (0.0, 1.0)]

    def fit(self, valid_trials: list[Trial]) -> None:
        """Huấn luyện cả 3 GP models từ danh sách các Trial hợp lệ."""
        if not valid_trials:
            return

        # 1. Chuẩn hoá inputs X về [0, 1]^4
        X_train = [self.bounds.normalize(t.params) for t in valid_trials]

        # 2. Lấy dữ liệu 3 objectives gốc
        y_jerk = [float(t.rms_jerk or 0.0) for t in valid_trials]
        y_impact = [float(t.impact_speed or 0.0) for t in valid_trials]
        y_stop = [float(t.stopping_distance or 0.0) for t in valid_trials]

        # 3. Tính cận min-max để chuẩn hoá Y về [0, 1] cho tính toán Hypervolume ổn định số học
        def get_bounds(vals: list[float]) -> tuple[float, float]:
            vmin, vmax = min(vals), max(vals)
            diff = vmax - vmin
            return (vmin, vmax if diff > 1e-6 else vmin + 1.0)

        self.obj_bounds = [get_bounds(y_jerk), get_bounds(y_impact), get_bounds(y_stop)]

        def norm_y(vals: list[float], b: tuple[float, float]) -> list[float]:
            return [(v - b[0]) / (b[1] - b[0]) for v in vals]

        # 4. Huấn luyện từng GP
        self.gp_jerk.fit(X_train, norm_y(y_jerk, self.obj_bounds[0]))
        self.gp_impact.fit(X_train, norm_y(y_impact, self.obj_bounds[1]))
        self.gp_stop.fit(X_train, norm_y(y_stop, self.obj_bounds[2]))

    def normalize_objective_vector(self, obj_vec: tuple[float, float, float]) -> tuple[float, float, float]:
        """Chuẩn hoá vector 3 mục tiêu về không gian [0, 1]^3."""
        return (
            (obj_vec[0] - self.obj_bounds[0][0]) / (self.obj_bounds[0][1] - self.obj_bounds[0][0]),
            (obj_vec[1] - self.obj_bounds[1][0]) / (self.obj_bounds[1][1] - self.obj_bounds[1][0]),
            (obj_vec[2] - self.obj_bounds[2][0]) / (self.obj_bounds[2][1] - self.obj_bounds[2][0]),
        )

    def predict(self, candidate_unit: list[float]) -> list[tuple[float, float, float]]:
        """Dự báo phân phối posterior từ cả 3 GP: [(mean, var, std), ...]"""
        return [gp.predict(candidate_unit) for gp in self.gps]
