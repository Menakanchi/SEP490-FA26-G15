"""Multi-Objective Bayesian Optimization (MOBO) cho 4 tham số AEB theo 3 mục tiêu.

Phạm vi chuẩn hoá (ADR-040, Business Spec):
- 4 Decision variables:
  1. TTC_THRESHOLD (s)
  2. BRAKE_ACTIVATION_DELAY (s)
  3. BRAKE_BUILDUP_RATE (m/s³)
  4. MAX_DECELERATION (m/s²)
- 3 Objectives (tất cả đều MINIMIZE):
  1. Comfort: RMS Jerk (m/s³)
  2. Collision Mitigation: Relative Impact Speed (m/s)
  3. Stopping Performance: Stopping Distance (m)

Thuật toán Tối ưu Đa mục tiêu:
- Giai đoạn Initial Design (khi số trial < n_initial_points): Latin Hypercube Sampling (LHS).
- Giai đoạn Tối ưu Bayes (MOBO): qEHVI (Expected Hypervolume Improvement qua Monte Carlo Integration).
  Thay vì scalarization đơn giản, qEHVI tối ưu trực tiếp kỳ vọng diện tích/thể tích siêu hộp Pareto
  qEHVI(x) = E[HVI(x)] được mở rộng, xét đầy đủ sự đánh đổi (trade-off) giữa cả 3 objectives.
- Đánh giá Pareto Front: Pareto Dominance trên 3 mục tiêu cho các trial hợp lệ.

Tuân thủ bất biến AGENTS.md: chỉ dùng thư viện chuẩn Python (math, random, dataclasses),
cú pháp Python >= 3.10, không yêu cầu gói ngoài (numpy/scipy/botorch) để chạy được trên mọi môi trường.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Any

# Danh sách chuẩn 4 tham số AEB và 3 mục tiêu
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


def _norm_cdf(z: float) -> float:
    """Hàm phân phối tích lũy chuẩn phi(z)."""
    return 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))


def _norm_pdf(z: float) -> float:
    """Hàm mật độ xác suất chuẩn phi(z)."""
    return math.exp(-0.5 * z * z) / math.sqrt(2.0 * math.pi)


@dataclass
class MoboSearchSpace:
    bounds: dict[str, tuple[float, float]] = field(
        default_factory=lambda: dict(DEFAULT_SEARCH_SPACE)
    )

    def lower(self, key: str) -> float:
        return self.bounds[key][0]

    def upper(self, key: str) -> float:
        return self.bounds[key][1]

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


@dataclass
class MoboTrial:
    trial_number: int
    params: dict[str, float]
    # 3 objective values (tất cả cần minimize)
    rms_jerk: float | None = None
    impact_speed: float | None = None
    stopping_distance: float | None = None
    # Ràng buộc
    constraint_violated: bool = False
    sampling_source: str = "INITIAL_DESIGN"

    @property
    def is_valid_evaluation(self) -> bool:
        return (
            not self.constraint_violated
            and self.rms_jerk is not None
            and self.impact_speed is not None
            and self.stopping_distance is not None
        )

    def objective_vector(self) -> tuple[float, float, float]:
        if not self.is_valid_evaluation:
            raise ValueError("Trial evaluation incomplete or invalid")
        return (float(self.rms_jerk), float(self.impact_speed), float(self.stopping_distance))


class GaussianProcessRegressor:
    """Gaussian Process Regressor gọn nhẹ dùng thư viện chuẩn Python (Cholesky decomposition)."""

    def __init__(self, length_scale: float = 0.35, signal_variance: float = 1.0, noise: float = 1e-4):
        self.length_scale = length_scale
        self.signal_variance = signal_variance
        self.noise = noise
        self.X_train: list[list[float]] = []
        self.y_train: list[float] = []
        self.L: list[list[float]] = []  # Ma trận Cholesky dưới: K = L * L^T
        self.alpha: list[float] = []    # L^T \ (L \ y)

    def _kernel(self, x1: list[float], x2: list[float]) -> float:
        sq_dist = sum((a - b) ** 2 for a, b in zip(x1, x2))
        return self.signal_variance * math.exp(-0.5 * sq_dist / (self.length_scale ** 2))

    def fit(self, X: list[list[float]], y: list[float]) -> None:
        self.X_train = [list(x) for x in X]
        self.y_train = list(y)
        n = len(X)
        if n == 0:
            return

        # Tính ma trận hiệp phương sai K + sigma_n^2 * I
        K = [[self._kernel(X[i], X[j]) for j in range(n)] for i in range(n)]
        for i in range(n):
            K[i][i] += self.noise

        # Cholesky decomposition: K = L * L^T
        L = [[0.0] * n for _ in range(n)]
        for i in range(n):
            for j in range(i + 1):
                s = sum(L[i][k] * L[j][k] for k in range(j))
                if i == j:
                    val = K[i][i] - s
                    L[i][j] = math.sqrt(max(val, 1e-8))
                else:
                    if L[j][j] == 0:
                        L[i][j] = 0.0
                    else:
                        L[i][j] = (K[i][j] - s) / L[j][j]
        self.L = L

        # Giải L * z = y (Forward substitution)
        z = [0.0] * n
        for i in range(n):
            s = sum(L[i][k] * z[k] for k in range(i))
            z[i] = (y[i] - s) / max(L[i][i], 1e-8)

        # Giải L^T * alpha = z (Backward substitution)
        self.alpha = [0.0] * n
        for i in range(n - 1, -1, -1):
            s = sum(L[k][i] * self.alpha[k] for k in range(i + 1, n))
            self.alpha[i] = (z[i] - s) / max(L[i][i], 1e-8)

    def predict(self, x_star: list[float]) -> tuple[float, float]:
        """Trả về (mean, std)."""
        n = len(self.X_train)
        if n == 0:
            return 0.0, 1.0

        k_star = [self._kernel(x_star, xi) for xi in self.X_train]
        mean = sum(k_star[i] * self.alpha[i] for i in range(n))

        # Giải L * v = k_star
        v = [0.0] * n
        for i in range(n):
            s = sum(self.L[i][k] * v[k] for k in range(i))
            v[i] = (k_star[i] - s) / max(self.L[i][i], 1e-8)

        v_dot_v = sum(vi * vi for vi in v)
        k_self = self._kernel(x_star, x_star)
        var = max(k_self - v_dot_v, 1e-8)
        return mean, math.sqrt(var)


def compute_2d_hypervolume(points: list[tuple[float, float]], rx: float, ry: float) -> float:
    """Tính diện tích siêu thể tích 2D bị chi phối bởi tập điểm Pareto cực tiểu hóa, giới hạn bởi điểm tham chiếu (rx, ry)."""
    valid = [p for p in points if p[0] < rx and p[1] < ry]
    if not valid:
        return 0.0
    valid.sort(key=lambda p: (p[0], p[1]))
    filtered: list[tuple[float, float]] = []
    min_y = float("inf")
    for x, y in valid:
        if y < min_y:
            filtered.append((x, y))
            min_y = y
    area = 0.0
    for i in range(len(filtered)):
        x_curr, y_curr = filtered[i]
        x_next = filtered[i + 1][0] if i + 1 < len(filtered) else rx
        area += (x_next - x_curr) * (ry - y_curr)
    return area


def compute_3d_hypervolume(
    points: list[tuple[float, float, float]], ref: tuple[float, float, float]
) -> float:
    """Tính thể tích siêu thể tích 3D (3 objectives minimization) bị chi phối bởi tập Pareto,

    giới hạn bởi điểm tham chiếu ref=(rx, ry, rz), sử dụng phương pháp 2D slicing (Klee's measure).
    """
    rx, ry, rz = ref
    valid = [p for p in points if p[0] < rx and p[1] < ry and p[2] < rz]
    if not valid:
        return 0.0
    z_coords = sorted(list(set([p[2] for p in valid] + [rz])))
    total_vol = 0.0
    for k in range(len(z_coords) - 1):
        z_k = z_coords[k]
        z_next = z_coords[k + 1]
        active_2d = [(p[0], p[1]) for p in valid if p[2] <= z_k]
        a = compute_2d_hypervolume(active_2d, rx, ry)
        total_vol += a * (z_next - z_k)
    return total_vol


def compute_hvi(
    new_point: tuple[float, float, float],
    pareto_points: list[tuple[float, float, float]],
    ref: tuple[float, float, float],
    base_hv: float,
) -> float:
    """Tính độ gia tăng siêu thể tích HVI(y) = HV(P U {y}, R) - HV(P, R).

    Nếu điểm mới bị chi phối hoặc vượt ngưỡng tham chiếu, HVI = 0.
    """
    if any(new_point[i] >= ref[i] for i in range(3)):
        return 0.0
    for p in pareto_points:
        if p[0] <= new_point[0] and p[1] <= new_point[1] and p[2] <= new_point[2]:
            return 0.0
    new_hv = compute_3d_hypervolume(pareto_points + [new_point], ref)
    return max(0.0, new_hv - base_hv)


class MoboOptimizer:
    """Triển khai Multi-Objective Bayesian Optimization qua qEHVI (Expected Hypervolume Improvement).

    Sau khi có mô hình Gaussian Process surrogate cho từng objective, qEHVI không chọn candidate
    chỉ dựa vào dự đoán objective đơn lẻ mà tính toán kỳ vọng độ gia tăng siêu thể tích:
    qEHVI(x) = E[HVI(x)]
    từ đó tối ưu hóa sự đánh đổi (trade-off) toàn diện giữa cả 3 objectives.
    """

    def __init__(
        self,
        search_space: MoboSearchSpace | None = None,
        n_initial_points: int = 5,
        seed: int = 42,
        acquisition_function: str = "qEHVI",
    ):
        self.search_space = search_space or MoboSearchSpace()
        self.n_initial_points = n_initial_points
        self.rng = random.Random(seed)
        self.acquisition_function = acquisition_function

    def sample_initial_lhs(self, n_samples: int) -> list[dict[str, float]]:
        """Sinh n_samples theo Latin Hypercube Sampling trong không gian 4D."""
        keys = list(PARAM_KEYS)
        dim = len(keys)
        columns: list[list[float]] = []
        for _ in range(dim):
            col = []
            for i in range(n_samples):
                u = (i + self.rng.random()) / n_samples
                col.append(u)
            self.rng.shuffle(col)
            columns.append(col)

        samples: list[dict[str, float]] = []
        for i in range(n_samples):
            point = {}
            for d, k in enumerate(keys):
                point[k] = round(self.search_space.scale_from_unit(k, columns[d][i]), 3)
            samples.append(point)
        return samples

    def propose_candidate(self, trials: list[MoboTrial]) -> tuple[dict[str, float], str, float | None]:
        """Đề xuất cấu hình 4 tham số AEB tiếp theo bằng hàm thu nhận qEHVI.

        Trả về: (dict 4 params, sampling_source, qEHVI_value)
        """
        all_evaluated = [t for t in trials if t.params]
        valid_trials = [t for t in trials if t.is_valid_evaluation]

        # 1. Giai đoạn Initial Design nếu chưa đủ số điểm thiết kế ban đầu
        if len(all_evaluated) < self.n_initial_points:
            samples = self.sample_initial_lhs(max(self.n_initial_points * 4, 20))
            best_sample = samples[0]
            max_min_dist = -1.0
            for s in samples:
                if not all_evaluated:
                    best_sample = s
                    break
                min_d = min(
                    sum(
                        (self.search_space.scale_to_unit(k, s[k]) - self.search_space.scale_to_unit(k, vt.params.get(k, 0.0))) ** 2
                        for k in PARAM_KEYS
                    )
                    for vt in all_evaluated
                )
                if min_d > max_min_dist:
                    max_min_dist = min_d
                    best_sample = s

            return best_sample, "INITIAL_DESIGN", None

        # Nếu chưa có trial nào thoả mãn ràng buộc an toàn -> khám phá vùng không gian mới
        if not valid_trials:
            samples = self.sample_initial_lhs(max(self.n_initial_points * 4, 20))
            best_sample = samples[0]
            max_min_dist = -1.0
            for s in samples:
                min_d = min(
                    sum(
                        (self.search_space.scale_to_unit(k, s[k]) - self.search_space.scale_to_unit(k, vt.params.get(k, 0.0))) ** 2
                        for k in PARAM_KEYS
                    )
                    for vt in all_evaluated
                )
                if min_d > max_min_dist:
                    max_min_dist = min_d
                    best_sample = s
            return best_sample, "ACTIVE_LEARNING", None

        # 2. Giai đoạn MOBO với qEHVI:
        # Huấn luyện 3 mô hình Gaussian Process riêng biệt cho 3 objectives
        # f1: rms_jerk, f2: impact_speed, f3: stopping_distance
        X_train: list[list[float]] = []
        for t in valid_trials:
            x_row = [self.search_space.scale_to_unit(k, t.params[k]) for k in PARAM_KEYS]
            X_train.append(x_row)

        raw_jerk = [float(t.rms_jerk) for t in valid_trials]
        raw_impact = [float(t.impact_speed) for t in valid_trials]
        raw_stop = [float(t.stopping_distance) for t in valid_trials]

        min_j, max_j = min(raw_jerk), max(raw_jerk)
        min_v, max_v = min(raw_impact), max(raw_impact)
        min_s, max_s = min(raw_stop), max(raw_stop)

        def norm_f(val: float, vmin: float, vmax: float) -> float:
            diff = vmax - vmin
            return (val - vmin) / (diff if diff > 1e-6 else 1.0)

        norm_jerk = [norm_f(v, min_j, max_j) for v in raw_jerk]
        norm_impact = [norm_f(v, min_v, max_v) for v in raw_impact]
        norm_stop = [norm_f(v, min_s, max_s) for v in raw_stop]

        gp_jerk = GaussianProcessRegressor(length_scale=0.35, noise=1e-4)
        gp_impact = GaussianProcessRegressor(length_scale=0.35, noise=1e-4)
        gp_stop = GaussianProcessRegressor(length_scale=0.35, noise=1e-4)

        gp_jerk.fit(X_train, norm_jerk)
        gp_impact.fit(X_train, norm_impact)
        gp_stop.fit(X_train, norm_stop)
        gps = [gp_jerk, gp_impact, gp_stop]

        # Xác định tập Pareto hiện tại trong không gian chuẩn hóa [0, 1]^3
        pareto_trial_nums = set(evaluate_pareto_front(valid_trials))
        pareto_norm: list[tuple[float, float, float]] = []
        for t in valid_trials:
            if t.trial_number in pareto_trial_nums:
                pareto_norm.append((
                    norm_f(float(t.rms_jerk), min_j, max_j),
                    norm_f(float(t.impact_speed), min_v, max_v),
                    norm_f(float(t.stopping_distance), min_s, max_s),
                ))

        # Điểm tham chiếu (Reference Point): điểm cận trên trong miền thu nhỏ [0, 1]^3
        ref_point = (1.1, 1.1, 1.1)
        base_hv = compute_3d_hypervolume(pareto_norm, ref_point)

        # Đánh giá qEHVI(x) = E[HVI(x)] qua Monte Carlo Integration
        def eval_qehvi(cand_unit: list[float], n_mc: int = 64) -> float:
            preds = [gp.predict(cand_unit) for gp in gps]
            means = [p[0] for p in preds]
            stds = [p[1] for p in preds]

            total_hvi = 0.0
            for _ in range(n_mc):
                sample_pt = (
                    means[0] + stds[0] * self.rng.gauss(0.0, 1.0),
                    means[1] + stds[1] * self.rng.gauss(0.0, 1.0),
                    means[2] + stds[2] * self.rng.gauss(0.0, 1.0),
                )
                hvi = compute_hvi(sample_pt, pareto_norm, ref_point, base_hv)
                total_hvi += hvi
            return total_hvi / n_mc

        # Tập ứng viên kết hợp:
        # 1. 250 mẫu Latin Hypercube phủ đều không gian tìm kiếm
        # 2. Các điểm nhiễu cục bộ quanh các điểm Pareto hiện tại để khai thác sâu (exploitation)
        candidate_pool: list[list[float]] = []
        lhs_samples = self.sample_initial_lhs(250)
        for s in lhs_samples:
            candidate_pool.append([self.search_space.scale_to_unit(k, s[k]) for k in PARAM_KEYS])

        for t in valid_trials:
            if t.trial_number in pareto_trial_nums:
                base_cand = [self.search_space.scale_to_unit(k, t.params[k]) for k in PARAM_KEYS]
                for _ in range(10):
                    perturbed = [
                        max(0.0, min(1.0, val + self.rng.gauss(0.0, 0.08)))
                        for val in base_cand
                    ]
                    candidate_pool.append(perturbed)

        best_cand: list[float] = candidate_pool[0]
        best_qehvi = -1.0

        for cand in candidate_pool:
            val = eval_qehvi(cand, n_mc=64)
            if val > best_qehvi:
                best_qehvi = val
                best_cand = cand

        proposed = {
            k: round(self.search_space.scale_from_unit(k, best_cand[i]), 3)
            for i, k in enumerate(PARAM_KEYS)
        }
        return proposed, "ACQUISITION", round(max(0.0, best_qehvi), 6)


def dominates(a: tuple[float, float, float], b: tuple[float, float, float]) -> bool:
    """Kiểm tra a có Pareto dominate b hay không (cả 3 objectives cần MINIMIZE).

    a dominates b <=> a_i <= b_i với mọi i và tồn tại j sao cho a_j < b_j.
    """
    not_worse = (a[0] <= b[0] and a[1] <= b[1] and a[2] <= b[2])
    strictly_better = (a[0] < b[0] or a[1] < b[1] or a[2] < b[2])
    return not_worse and strictly_better


def evaluate_pareto_front(trials: list[MoboTrial]) -> list[int]:
    """Tìm danh sách trial_number của các trial thuộc Pareto-optimal front.

    Chỉ xét các trial hợp lệ (is_valid_evaluation = True và constraint_violated = False).
    """
    valid = [t for t in trials if t.is_valid_evaluation]
    pareto_trial_numbers: list[int] = []

    for t in valid:
        t_vec = t.objective_vector()
        is_dominated = False
        for other in valid:
            if other.trial_number == t.trial_number:
                continue
            other_vec = other.objective_vector()
            if dominates(other_vec, t_vec):
                is_dominated = True
                break
        if not is_dominated:
            pareto_trial_numbers.append(t.trial_number)

    return sorted(pareto_trial_numbers)
