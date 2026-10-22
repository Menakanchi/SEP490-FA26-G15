"""Các phép toán đại số tuyến tính cơ bản viết bằng Python stdlib cho Gaussian Process.

Triển khai:
- Cholesky Decomposition: K = L * L^T với ma trận tam giác dưới L
- Forward Substitution: giải L * y = b
- Backward Substitution: giải L^T * x = y
- Thêm jitter để đảm bảo ma trận luôn đối xứng và xác định dương (positive-definite).
"""

from __future__ import annotations

import math


def cholesky_decomposition(matrix: list[list[float]], jitter: float = 1e-5) -> list[list[float]]:
    """Phân rã Cholesky ma trận đối xứng xác định dương: A + jitter*I = L * L^T.

    Trả về ma trận tam giác dưới L.
    """
    n = len(matrix)
    L = [[0.0] * n for _ in range(n)]

    # Thử phân rã với jitter tăng dần nếu ma trận gặp vấn đề điều kiện xấu
    current_jitter = jitter
    max_attempts = 5

    for attempt in range(max_attempts):
        try:
            for i in range(n):
                for j in range(i + 1):
                    s = sum(L[i][k] * L[j][k] for k in range(j))
                    if i == j:
                        val = matrix[i][i] + current_jitter - s
                        if val <= 1e-12:
                            raise ValueError(f"Pivot non-positive at index {i}: {val}")
                        L[i][j] = math.sqrt(val)
                    else:
                        if L[j][j] <= 1e-12:
                            raise ValueError(f"Diagonal near zero at {j}")
                        L[i][j] = (matrix[i][j] - s) / L[j][j]
            return L
        except ValueError:
            current_jitter *= 10.0
            L = [[0.0] * n for _ in range(n)]

    # Lần cuối nếu vẫn thất bại thì dùng cận an toàn trên đường chéo
    for i in range(n):
        for j in range(i + 1):
            s = sum(L[i][k] * L[j][k] for k in range(j))
            if i == j:
                val = max(1e-6, matrix[i][i] + current_jitter - s)
                L[i][j] = math.sqrt(val)
            else:
                denom = max(1e-6, L[j][j])
                L[i][j] = (matrix[i][j] - s) / denom
    return L


def forward_substitution(L: list[list[float]], b: list[float]) -> list[float]:
    """Giải hệ phương trình tam giác dưới: L * y = b."""
    n = len(L)
    y = [0.0] * n
    for i in range(n):
        s = sum(L[i][j] * y[j] for j in range(i))
        denom = L[i][i] if abs(L[i][i]) > 1e-12 else 1e-6
        y[i] = (b[i] - s) / denom
    return y


def backward_substitution(L: list[list[float]], y: list[float]) -> list[float]:
    """Giải hệ phương trình tam giác trên: L^T * x = y."""
    n = len(L)
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        s = sum(L[j][i] * x[j] for j in range(i + 1, n))
        denom = L[i][i] if abs(L[i][i]) > 1e-12 else 1e-6
        x[i] = (y[i] - s) / denom
    return x


def cholesky_solve(L: list[list[float]], b: list[float]) -> list[float]:
    """Giải phương trình A * x = b thông qua Cholesky L * L^T * x = b.

    Bước 1: L * y = b (forward)
    Bước 2: L^T * x = y (backward)
    """
    y = forward_substitution(L, b)
    return backward_substitution(L, y)
