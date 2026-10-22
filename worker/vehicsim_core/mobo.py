"""Lõi Multi-Objective Bayesian Optimization (MOBO) cho 4 tham số AEB theo 3 mục tiêu.

Thuật toán chuẩn hoá theo đặc tả:
- 4 Tham số AEB: TTC_THRESHOLD, BRAKE_ACTIVATION_DELAY, BRAKE_BUILDUP_RATE, MAX_DECELERATION
- 3 Objectives (tất cả đều MINIMIZE):
  1. Comfort: RMS Jerk (m/s³)
  2. Collision Mitigation: Impact Speed (m/s)
  3. Stopping Performance: Stopping Distance (m)

Quy trình:
1. Bounded Random Sampling cho Initial Design.
2. 3 mô hình Gaussian Process Regressor độc lập (RBF Kernel + Phân rã Cholesky).
3. Hàm thu thập qEHVI (Expected Hypervolume Improvement) qua Monte Carlo Integration.
4. Cơ chế chống trùng lặp ứng viên có dung sai (Deduplication with Tolerance trong không gian chuẩn hoá 4D).
5. Lọc tập nghiệm Pareto Front (Non-dominated Pareto-optimal Trials).
"""

from __future__ import annotations

import random
from typing import Any

from .acquisition import calculate_qehvi, is_near_duplicate
from .evaluator import MockSimulationEvaluator, SimulationEvaluator
from .hypervolume import (
    compute_3d_hypervolume,
    dominates,
    evaluate_pareto_front,
    find_pareto_front,
)
from .models import Candidate, ObjectiveResult, OptimizationResult, Trial
from .parameters import DEFAULT_SEARCH_SPACE, PARAM_KEYS, ParameterBounds
from .sampling import (
    generate_candidate_pool,
    generate_initial_candidates,
    generate_random_candidate,
)
from .surrogate import MultiObjectiveSurrogate

# Tương thích ngược
MoboSearchSpace = ParameterBounds
MoboTrial = Trial


class MoboOptimizer:
    """Bộ điều phối tối ưu hoá MOBO tích hợp đầy đủ cho quy trình VehicSim."""

    def __init__(
        self,
        search_space: ParameterBounds | None = None,
        n_initial_points: int = 5,
        seed: int = 42,
        reference_point: tuple[float, float, float] = (1.1, 1.1, 1.1),
        dedup_tolerance: float = 0.04,
        candidate_pool_size: int = 300,
        n_mc: int = 64,
        **kwargs: Any,
    ):
        self.bounds = search_space or ParameterBounds()
        self.n_initial_points = n_initial_points
        self.seed = seed
        self.rng = random.Random(seed)
        self.ref_point = reference_point
        self.dedup_tolerance = dedup_tolerance
        self.candidate_pool_size = candidate_pool_size
        self.n_mc = n_mc
        self.surrogate = MultiObjectiveSurrogate(bounds=self.bounds)

    def propose_candidate(
        self,
        trials: list[Trial],
    ) -> tuple[dict[str, float], str, float | None]:
        """Đề xuất cấu hình tham số 4 chiều AEB tiếp theo dựa trên các trial đã chạy.

        Giai đoạn 1: Số trial hợp lệ < n_initial_points -> Dùng Bounded Random Sampling.
        Giai đoạn 2: Kích hoạt qEHVI qua Monte Carlo để tối đa hoá mức tăng siêu thể tích Pareto.
        """
        valid_trials = [t for t in trials if t.is_valid_observation]
        evaluated_units = [self.bounds.normalize(t.params) for t in trials]

        # ---------------------------------------------------------
        # Giai đoạn 1: Bounded Random Sampling ban đầu
        # ---------------------------------------------------------
        if len(valid_trials) < self.n_initial_points:
            for _ in range(50):
                cand = generate_random_candidate(self.bounds, self.rng, source="INITIAL_DESIGN")
                cand_unit = self.bounds.normalize(cand.params)
                if not is_near_duplicate(cand_unit, evaluated_units, self.dedup_tolerance):
                    return cand.params, "INITIAL_DESIGN", None

            # Fallback nếu không tìm được điểm không trùng
            fallback = generate_random_candidate(self.bounds, self.rng, source="INITIAL_DESIGN")
            return fallback.params, "INITIAL_DESIGN", None

        # ---------------------------------------------------------
        # Giai đoạn 2: qEHVI Acquisition với Monte Carlo
        # ---------------------------------------------------------
        # 1. Huấn luyện 3 GP surrogate models
        self.surrogate.fit(valid_trials)

        # 2. Xác định Pareto Front hiện tại trong không gian chuẩn hoá [0, 1]^3
        pareto_trials = find_pareto_front(valid_trials)
        pareto_norm: list[tuple[float, float, float]] = [
            self.surrogate.normalize_objective_vector(t.objective_vector())
            for t in pareto_trials
        ]
        base_hv = compute_3d_hypervolume(pareto_norm, self.ref_point)

        # 3. Tạo Candidate Pool hữu hạn (Bounded Random + nhiễu quanh Pareto để khai thác)
        candidate_pool: list[list[float]] = []

        # 3.1. Các điểm random phủ đều không gian
        random_pool = generate_candidate_pool(self.bounds, self.candidate_pool_size, self.rng)
        for c in random_pool:
            candidate_pool.append(self.bounds.normalize(c.params))

        # 3.2. Điểm khai thác cục bộ (Exploitation) quanh các nghiệm Pareto hiện tại
        for pt in pareto_trials:
            base_cand = self.bounds.normalize(pt.params)
            for _ in range(8):
                perturbed = [
                    max(0.0, min(1.0, val + self.rng.gauss(0.0, 0.06)))
                    for val in base_cand
                ]
                candidate_pool.append(perturbed)

        # 4. Lọc trùng lặp với các candidate đã đánh giá (Deduplication with Tolerance)
        unique_pool = [
            cand_unit for cand_unit in candidate_pool
            if not is_near_duplicate(cand_unit, evaluated_units, self.dedup_tolerance)
        ]

        if not unique_pool:
            unique_pool = candidate_pool

        # 5. Tính toán qEHVI cho từng candidate trong pool
        scored_candidates: list[tuple[list[float], float]] = []
        for cand_unit in unique_pool:
            qehvi_val = calculate_qehvi(
                candidate_unit=cand_unit,
                gps=self.surrogate.gps,
                pareto_norm=pareto_norm,
                ref_point=self.ref_point,
                base_hv=base_hv,
                rng=self.rng,
                n_mc=self.n_mc,
            )
            scored_candidates.append((cand_unit, qehvi_val))

        # 6. Chọn candidate có qEHVI cao nhất
        scored_candidates.sort(key=lambda item: item[1], reverse=True)
        best_cand_unit, best_qehvi = scored_candidates[0]

        best_params = self.bounds.denormalize(best_cand_unit)
        return best_params, "ACQUISITION", round(max(0.0, best_qehvi), 6)

    def optimize(
        self,
        evaluator: SimulationEvaluator,
        max_trials: int = 10,
        scenario_set: Any = None,
    ) -> OptimizationResult:
        """Thực thi toàn bộ vòng lặp tối ưu hoá từ đầu đến cuối."""
        all_trials: list[Trial] = []

        # 1. Sinh initial candidates bằng Bounded Random Sampling
        initial_cands = generate_initial_candidates(self.bounds, self.n_initial_points, self.rng)
        for cand in initial_cands:
            trial = evaluator.evaluate(cand, scenario_set)
            all_trials.append(trial)

        # 2. Vòng lặp tối ưu qEHVI cho các trial tiếp theo
        for _ in range(len(all_trials), max_trials):
            proposed_params, source, qehvi_val = self.propose_candidate(all_trials)
            cand = Candidate(params=proposed_params, sampling_source=source, acquisition_value=qehvi_val)
            trial = evaluator.evaluate(cand, scenario_set)
            all_trials.append(trial)

        # 3. Lọc Pareto Front cuối cùng
        valid_trials = [t for t in all_trials if t.is_valid_observation]
        pareto_trials = find_pareto_front(valid_trials)

        return OptimizationResult(
            run_id=1,
            trials=all_trials,
            valid_trials=valid_trials,
            pareto_trials=pareto_trials,
            algorithm="qEHVI",
        )
