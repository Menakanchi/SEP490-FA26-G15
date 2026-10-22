"""Bounded Random Sampling cho giai đoạn thiết kế ban đầu và sinh candidate pool.

Lưu ý quan trọng theo đặc tả dự án:
- KHÔNG sử dụng Latin Hypercube Sampling (LHS).
- Sử dụng Bounded Random Sampling độc lập trong miền cho phép của từng tham số.
- Sử dụng random.Random(seed) để kết quả có thể tái lập (reproducible).
"""

from __future__ import annotations

import random
from typing import Any

from .models import Candidate
from .parameters import PARAM_KEYS, ParameterBounds


def generate_random_candidate(
    bounds: ParameterBounds,
    rng: random.Random,
    source: str = "INITIAL_DESIGN",
) -> Candidate:
    """Sinh một Candidate ngẫu nhiên độc lập trong parameter bounds."""
    params: dict[str, float] = {}
    for k in PARAM_KEYS:
        lo = bounds.lower(k)
        hi = bounds.upper(k)
        val = rng.uniform(lo, hi)
        params[k] = round(val, 3)
    return Candidate(params=params, sampling_source=source)


def generate_initial_candidates(
    bounds: ParameterBounds,
    n_points: int,
    rng: random.Random,
) -> list[Candidate]:
    """Sinh danh sách n_points Candidate ban đầu cho Initial Design bằng Bounded Random Sampling."""
    candidates: list[Candidate] = []
    for _ in range(n_points):
        candidates.append(generate_random_candidate(bounds, rng, source="INITIAL_DESIGN"))
    return candidates


def generate_candidate_pool(
    bounds: ParameterBounds,
    pool_size: int,
    rng: random.Random,
) -> list[Candidate]:
    """Sinh candidate pool hữu hạn bằng Bounded Random Sampling để qEHVI tìm kiếm."""
    pool: list[Candidate] = []
    for _ in range(pool_size):
        pool.append(generate_random_candidate(bounds, rng, source="ACQUISITION"))
    return pool
