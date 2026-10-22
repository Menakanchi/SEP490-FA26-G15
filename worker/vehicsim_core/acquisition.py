"""Hàm thu thập qEHVI (Expected Hypervolume Improvement) qua Monte Carlo và cơ chế chống trùng lặp."""

from __future__ import annotations

import math
import random
from typing import Any

from .gp import GaussianProcessRegressor
from .hypervolume import compute_3d_hypervolume, compute_hypervolume_improvement
from .models import Candidate
from .parameters import PARAM_KEYS, ParameterBounds


def is_near_duplicate(
    candidate_unit: list[float],
    evaluated_units: list[list[float]],
    tolerance: float = 0.04,
) -> bool:
    """Kiểm tra candidate có bị trùng hoặc quá gần candidate đã đánh giá trong không gian chuẩn hoá [0, 1]^4 không.

    Khoảng cách Euclidean: d(a, b) = sqrt(sum((a_d - b_d)^2)).
    """
    tol_sq = tolerance * tolerance
    for prev in evaluated_units:
        dist_sq = sum((a - b) ** 2 for a, b in zip(candidate_unit, prev))
        if dist_sq < tol_sq:
            return True
    return False


def calculate_qehvi(
    candidate_unit: list[float],
    gps: list[GaussianProcessRegressor],
    pareto_norm: list[tuple[float, float, float]],
    ref_point: tuple[float, float, float],
    base_hv: float,
    rng: random.Random,
    n_mc: int = 64,
) -> float:
    """Tính qEHVI cho một candidate qua Monte Carlo Integration.

    y^(s) ~ N(mu(x), sigma^2(x))
    qEHVI(x) = (1 / N_MC) * sum(HVI(y^(s)))
    """
    # 3 GP predictions: (mean, variance, std)
    preds = [gp.predict(candidate_unit) for gp in gps]
    means = [p[0] for p in preds]
    stds = [p[2] for p in preds]

    # Nếu uncertainty của cả 3 đều bằng 0, chỉ cần tính 1 lần
    if all(s <= 1e-9 for s in stds):
        sample_pt = (means[0], means[1], means[2])
        return compute_hypervolume_improvement(sample_pt, pareto_norm, ref_point, base_hv)

    total_hvi = 0.0
    for _ in range(n_mc):
        sample_pt = (
            means[0] + stds[0] * rng.gauss(0.0, 1.0),
            means[1] + stds[1] * rng.gauss(0.0, 1.0),
            means[2] + stds[2] * rng.gauss(0.0, 1.0),
        )
        hvi = compute_hypervolume_improvement(sample_pt, pareto_norm, ref_point, base_hv)
        total_hvi += hvi

    return max(0.0, total_hvi / n_mc)
