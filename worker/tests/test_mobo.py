"""Kiểm tra module MOBO và thuật toán qEHVI."""

import unittest
from vehicsim_core.mobo import (
    MoboOptimizer,
    MoboSearchSpace,
    MoboTrial,
    compute_2d_hypervolume,
    compute_3d_hypervolume,
    compute_hvi,
    dominates,
    evaluate_pareto_front,
)


class MoboTest(unittest.TestCase):

    def test_pareto_dominance(self):
        # A(jerk=10, impact=0, dist=20) vs B(jerk=15, impact=2, dist=25) -> A dominates B
        a = (10.0, 0.0, 20.0)
        b = (15.0, 2.0, 25.0)
        self.assertTrue(dominates(a, b))
        self.assertFalse(dominates(b, a))

        # Trade-off: C(jerk=8, impact=3, dist=20) vs A(10, 0, 20) -> neither dominates
        c = (8.0, 3.0, 20.0)
        self.assertFalse(dominates(a, c))
        self.assertFalse(dominates(c, a))

    def test_evaluate_pareto_front(self):
        trials = [
            MoboTrial(trial_number=1, params={}, rms_jerk=10.0, impact_speed=0.0, stopping_distance=20.0),
            MoboTrial(trial_number=2, params={}, rms_jerk=15.0, impact_speed=2.0, stopping_distance=25.0),  # Dominated by 1
            MoboTrial(trial_number=3, params={}, rms_jerk=8.0, impact_speed=1.0, stopping_distance=19.0),   # Trade-off / non-dominated
            MoboTrial(trial_number=4, params={}, rms_jerk=5.0, impact_speed=0.0, stopping_distance=15.0, constraint_violated=True), # Infeasible
        ]
        pareto_nums = evaluate_pareto_front(trials)
        self.assertIn(1, pareto_nums)
        self.assertIn(3, pareto_nums)
        self.assertNotIn(2, pareto_nums)  # Dominated
        self.assertNotIn(4, pareto_nums)  # Infeasible

    def test_3d_hypervolume_and_hvi(self):
        ref = (1.0, 1.0, 1.0)
        p1 = (0.5, 0.5, 0.5)
        base_hv = compute_3d_hypervolume([p1], ref)
        expected_vol = 0.5 * 0.5 * 0.5
        self.assertAlmostEqual(base_hv, expected_vol, places=6)

        # Điểm bị chi phối (0.6, 0.6, 0.6) có HVI = 0
        hvi_dom = compute_hvi((0.6, 0.6, 0.6), [p1], ref, base_hv)
        self.assertEqual(hvi_dom, 0.0)

        # Điểm cải thiện trực tiếp (0.2, 0.5, 0.5)
        hvi_imp = compute_hvi((0.2, 0.5, 0.5), [p1], ref, base_hv)
        self.assertGreater(hvi_imp, 0.0)

        # Điểm đánh đổi trade-off (0.2, 0.8, 0.8) mở rộng biên Pareto ở chiều 0
        hvi_tradeoff = compute_hvi((0.2, 0.8, 0.8), [p1], ref, base_hv)
        self.assertGreater(hvi_tradeoff, 0.0)

    def test_mobo_qehvi_acquisition(self):
        space = MoboSearchSpace()
        opt = MoboOptimizer(search_space=space, n_initial_points=2, seed=123, acquisition_function="qEHVI")

        # Chưa đủ initial points -> INITIAL_DESIGN
        p1, src1, acq1 = opt.propose_candidate([])
        self.assertEqual(src1, "INITIAL_DESIGN")
        self.assertIn("TTC_THRESHOLD", p1)

        # Thêm trial 1
        t1 = MoboTrial(trial_number=1, params=p1, rms_jerk=10.0, impact_speed=0.0, stopping_distance=20.0)
        p2, src2, acq2 = opt.propose_candidate([t1])
        self.assertEqual(src2, "INITIAL_DESIGN")

        # Thêm trial 2 (đủ initial points -> qEHVI acquisition)
        t2 = MoboTrial(trial_number=2, params=p2, rms_jerk=12.0, impact_speed=1.5, stopping_distance=22.0)
        p3, src3, acq3 = opt.propose_candidate([t1, t2])
        self.assertEqual(src3, "ACQUISITION")
        self.assertIsNotNone(acq3)
        self.assertGreaterEqual(acq3, 0.0)
        self.assertTrue(0.5 <= p3["TTC_THRESHOLD"] <= 3.5)
        self.assertTrue(0.05 <= p3["BRAKE_ACTIVATION_DELAY"] <= 0.45)
        self.assertTrue(5.0 <= p3["BRAKE_BUILDUP_RATE"] <= 20.0)
        self.assertTrue(5.0 <= p3["MAX_DECELERATION"] <= 10.0)


if __name__ == "__main__":
    unittest.main()
