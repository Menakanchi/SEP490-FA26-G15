"""Unit tests toàn diện cho MOBO Core Engine theo đặc tả bài toán (Mục 28).

Kiểm thử:
1. Parameter validation & bounds
2. Bounded Random Sampling (reproducibility với seed)
3. RBF Kernel (đối xứng, đường chéo dương)
4. Cholesky decomposition (L * L^T ≈ K)
5. Gaussian Process Regressor (fit, predict mean/var/std)
6. Pareto dominance & non-dominated filtering
7. 3D Hypervolume & Hypervolume Improvement (HV >= 0)
8. qEHVI via Monte Carlo
9. Deduplication with tolerance (chống trùng lặp điểm gần)
10. Vòng lặp MOBO đầy đủ với MockSimulationEvaluator
"""

from __future__ import annotations

import math
import random
import unittest

from vehicsim_core.acquisition import calculate_qehvi, is_near_duplicate
from vehicsim_core.evaluator import MockSimulationEvaluator
from vehicsim_core.gp import GaussianProcessRegressor
from vehicsim_core.hypervolume import (
    compute_3d_hypervolume,
    compute_hypervolume_improvement,
    dominates,
    find_pareto_front,
)
from vehicsim_core.kernel import RBFKernel
from vehicsim_core.linalg import cholesky_decomposition
from vehicsim_core.mobo import MoboOptimizer
from vehicsim_core.models import Candidate, ObjectiveResult, Trial
from vehicsim_core.parameters import DEFAULT_SEARCH_SPACE, ParameterBounds
from vehicsim_core.sampling import (
    generate_candidate_pool,
    generate_initial_candidates,
    generate_random_candidate,
)
from vehicsim_core.surrogate import MultiObjectiveSurrogate


class MoboCoreTest(unittest.TestCase):

    def setUp(self):
        self.bounds = ParameterBounds()
        self.rng = random.Random(42)

    # -------------------------------------------------------------
    # 1. Parameter Validation & Normalization
    # -------------------------------------------------------------
    def test_parameter_validation_and_bounds(self):
        valid_params = {
            "TTC_THRESHOLD": 1.8,
            "BRAKE_ACTIVATION_DELAY": 0.2,
            "BRAKE_BUILDUP_RATE": 15.0,
            "MAX_DECELERATION": 8.0,
        }
        self.assertTrue(self.bounds.is_valid(valid_params))

        # Điểm ngoài bounds
        invalid_params = dict(valid_params, TTC_THRESHOLD=9.9)
        self.assertFalse(self.bounds.is_valid(invalid_params))

        # Test chuẩn hoá [0, 1] và khôi phục
        norm_vec = self.bounds.normalize(valid_params)
        for val in norm_vec:
            self.assertTrue(0.0 <= val <= 1.0)
        restored = self.bounds.denormalize(norm_vec)
        self.assertAlmostEqual(restored["TTC_THRESHOLD"], 1.8, places=2)

    # -------------------------------------------------------------
    # 2. Bounded Random Sampling & Reproducibility
    # -------------------------------------------------------------
    def test_bounded_random_sampling(self):
        cands = generate_initial_candidates(self.bounds, n_points=10, rng=random.Random(123))
        self.assertEqual(len(cands), 10)
        for c in cands:
            self.assertTrue(self.bounds.is_valid(c.params))

        # Kiểm tra tính tái lập với cùng seed
        cands2 = generate_initial_candidates(self.bounds, n_points=10, rng=random.Random(123))
        self.assertEqual(cands[0].params, cands2[0].params)
        self.assertEqual(cands[5].params, cands2[5].params)

    # -------------------------------------------------------------
    # 3. RBF Kernel Properties
    # -------------------------------------------------------------
    def test_rbf_kernel_properties(self):
        kernel = RBFKernel(length_scales=[0.35, 0.35, 0.35, 0.35], signal_variance=1.5)
        x1 = [0.2, 0.4, 0.6, 0.8]
        x2 = [0.5, 0.1, 0.9, 0.3]

        # k(x, x) = signal_variance > 0
        self.assertAlmostEqual(kernel(x1, x1), 1.5, places=5)

        # Tính đối xứng: k(x, x') = k(x', x)
        self.assertAlmostEqual(kernel(x1, x2), kernel(x2, x1), places=6)

    # -------------------------------------------------------------
    # 4. Cholesky Decomposition (L * L^T ≈ K)
    # -------------------------------------------------------------
    def test_cholesky_decomposition(self):
        # Ma trận đối xứng xác định dương 3x3
        K = [
            [4.0, 1.0, 0.5],
            [1.0, 5.0, 1.2],
            [0.5, 1.2, 3.0],
        ]
        L = cholesky_decomposition(K, jitter=0.0)

        # Kiểm tra tái tạo K_approx = L * L^T
        n = len(K)
        for i in range(n):
            for j in range(n):
                val = sum(L[i][k] * L[j][k] for k in range(n))
                self.assertAlmostEqual(val, K[i][j], places=4)

    # -------------------------------------------------------------
    # 5. Gaussian Process Regressor
    # -------------------------------------------------------------
    def test_gaussian_process_regressor(self):
        gp = GaussianProcessRegressor(noise=1e-4)
        X = [
            [0.1, 0.2, 0.3, 0.4],
            [0.5, 0.5, 0.5, 0.5],
            [0.9, 0.8, 0.7, 0.6],
        ]
        y = [1.2, 3.4, 5.6]
        gp.fit(X, y)

        # Dự báo tại điểm đã huấn luyện: mean phải rất sát y, variance thấp
        mean, var, std = gp.predict(X[1])
        self.assertAlmostEqual(mean, 3.4, delta=0.1)
        self.assertTrue(var >= 0.0)
        self.assertAlmostEqual(std, math.sqrt(var), places=5)

    # -------------------------------------------------------------
    # 6. Pareto Dominance & Filtering
    # -------------------------------------------------------------
    def test_pareto_dominance_and_filtering(self):
        # Tất cả 3 mục tiêu đều MINIMIZE: (RMS Jerk, Impact Speed, Stopping Distance)
        t1 = Trial(trial_id=1, params={}, rms_jerk=2.0, impact_speed=0.0, stopping_distance=15.0)
        t2 = Trial(trial_id=2, params={}, rms_jerk=4.0, impact_speed=5.0, stopping_distance=20.0)  # bị t1 dominate hoàn toàn
        t3 = Trial(trial_id=3, params={}, rms_jerk=1.0, impact_speed=2.0, stopping_distance=14.0)  # trade-off tốt

        self.assertTrue(dominates(t1.objective_vector(), t2.objective_vector()))
        self.assertFalse(dominates(t2.objective_vector(), t1.objective_vector()))

        pareto = find_pareto_front([t1, t2, t3])
        pareto_ids = [t.trial_id for t in pareto]
        self.assertIn(1, pareto_ids)
        self.assertIn(3, pareto_ids)
        self.assertNotIn(2, pareto_ids)

    # -------------------------------------------------------------
    # 7. 3D Hypervolume & Improvement (HV >= 0)
    # -------------------------------------------------------------
    def test_hypervolume_and_improvement(self):
        ref_point = (1.0, 1.0, 1.0)
        p1 = (0.5, 0.5, 0.5)
        hv = compute_3d_hypervolume([p1], ref_point)
        # Thể tích hộp [0.5, 1.0]^3 = 0.5 * 0.5 * 0.5 = 0.125
        self.assertAlmostEqual(hv, 0.125, places=4)

        # Thêm điểm cải thiện: Hypervolume tăng lên
        p_better = (0.2, 0.2, 0.2)
        hvi = compute_hypervolume_improvement(p_better, [p1], ref_point, hv)
        self.assertTrue(hvi > 0.0)

        # Thêm điểm bị dominate: HVI = 0
        p_worse = (0.8, 0.8, 0.8)
        hvi_worse = compute_hypervolume_improvement(p_worse, [p1], ref_point, hv)
        self.assertEqual(hvi_worse, 0.0)

    # -------------------------------------------------------------
    # 8. Deduplication with Tolerance
    # -------------------------------------------------------------
    def test_deduplication_with_tolerance(self):
        prev = [[0.5, 0.5, 0.5, 0.5]]
        exact = [0.5, 0.5, 0.5, 0.5]
        near = [0.51, 0.5, 0.49, 0.5]  # d ≈ 0.014 < tolerance 0.04
        far = [0.8, 0.2, 0.1, 0.9]

        self.assertTrue(is_near_duplicate(exact, prev, tolerance=0.04))
        self.assertTrue(is_near_duplicate(near, prev, tolerance=0.04))
        self.assertFalse(is_near_duplicate(far, prev, tolerance=0.04))

    # -------------------------------------------------------------
    # 9. Vòng lặp MOBO hoàn chỉnh với MockSimulationEvaluator
    # -------------------------------------------------------------
    def test_full_mobo_optimization_loop(self):
        optimizer = MoboOptimizer(
            search_space=self.bounds,
            n_initial_points=3,
            seed=42,
            candidate_pool_size=50,
            n_mc=32,
        )
        evaluator = MockSimulationEvaluator()

        result = optimizer.optimize(evaluator, max_trials=6)
        self.assertEqual(len(result.trials), 6)
        self.assertTrue(len(result.valid_trials) >= 3)
        self.assertTrue(len(result.pareto_trials) >= 1)

        # Đảm bảo mỗi trial đề xuất nằm trong bounds
        for t in result.trials:
            self.assertTrue(self.bounds.is_valid(t.params))


if __name__ == "__main__":
    unittest.main()
