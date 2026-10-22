"""Đánh giá Pareto Dominance, lọc Pareto Front và tính toán Hypervolume 3D."""

from __future__ import annotations

from typing import Sequence

from .models import Trial


def dominates(a: tuple[float, float, float], b: tuple[float, float, float]) -> bool:
    """Kiểm tra a có Pareto dominate b hay không (cả 3 objectives cần MINIMIZE).

    a dominates b <=> a_i <= b_i với mọi i và tồn tại j sao cho a_j < b_j.
    """
    not_worse = (a[0] <= b[0] and a[1] <= b[1] and a[2] <= b[2])
    strictly_better = (a[0] < b[0] or a[1] < b[1] or a[2] < b[2])
    return not_worse and strictly_better


def find_pareto_front(trials: list[Trial]) -> list[Trial]:
    """Tìm danh sách các Trial thuộc Pareto-optimal front.

    Chỉ xét các trial hợp lệ (is_valid_observation = True).
    """
    valid = [t for t in trials if t.is_valid_observation]
    pareto: list[Trial] = []

    for t in valid:
        t_vec = t.objective_vector()
        is_dominated = False
        for other in valid:
            if other.trial_id == t.trial_id:
                continue
            if dominates(other.objective_vector(), t_vec):
                is_dominated = True
                break
        if not is_dominated:
            t.is_pareto_optimal = True
            pareto.append(t)
        else:
            t.is_pareto_optimal = False

    return pareto


def evaluate_pareto_front(trials: list[Trial]) -> list[int]:
    """Trả về danh sách ID / trial_number của các trial thuộc Pareto Front (tương thích ngược)."""
    pareto_trials = find_pareto_front(trials)
    return sorted(t.trial_id for t in pareto_trials)


def compute_3d_hypervolume(
    pareto_points: Sequence[tuple[float, float, float]],
    ref_point: tuple[float, float, float],
) -> float:
    """Tính Hypervolume 3D bị khống chế bởi tập điểm Pareto và Reference Point.

    Tất cả 3 objective đều là MINIMIZE. Vùng đóng góp của mỗi điểm p là [p_1, r_1] x [p_2, r_2] x [p_3, r_3].
    Dùng phương pháp chia lát theo trục Z và tính hợp các hình chữ nhật 2D (Klee's measure / sweep-line).
    """
    valid_points: list[tuple[float, float, float]] = []
    rx, ry, rz = ref_point
    for p in pareto_points:
        if p[0] < rx and p[1] < ry and p[2] < rz:
            valid_points.append(p)

    if not valid_points:
        return 0.0

    # Lấy các toạ độ z duy nhất làm các mốc chia lát
    z_coords = sorted(set(p[2] for p in valid_points))
    total_volume = 0.0

    for idx, z_cur in enumerate(z_coords):
        z_next = z_coords[idx + 1] if idx + 1 < len(z_coords) else rz
        dz = z_next - z_cur
        if dz <= 1e-9:
            continue

        # Các điểm có z_p <= z_cur sẽ che phủ toàn bộ lát [z_cur, z_next]
        pts_in_slice = [p for p in valid_points if p[2] <= z_cur]
        if not pts_in_slice:
            continue

        # Tính diện tích 2D trên mặt phẳng (X, Y) bị che bởi các điểm pts_in_slice tới (rx, ry)
        # Sử dụng sweep line theo trục X
        x_coords = sorted(set(p[0] for p in pts_in_slice))
        slice_area = 0.0
        for x_idx, x_cur in enumerate(x_coords):
            x_next = x_coords[x_idx + 1] if x_idx + 1 < len(x_coords) else rx
            dx = x_next - x_cur
            if dx <= 1e-9:
                continue

            # Điểm có x <= x_cur có y nhỏ nhất sẽ quyết định cạnh y
            matching_y = [p[1] for p in pts_in_slice if p[0] <= x_cur]
            if matching_y:
                min_y = min(matching_y)
                dy = max(0.0, ry - min_y)
                slice_area += dx * dy

        total_volume += slice_area * dz

    return max(0.0, total_volume)


def compute_hypervolume_improvement(
    sample_point: tuple[float, float, float],
    current_pareto: list[tuple[float, float, float]],
    ref_point: tuple[float, float, float],
    base_hv: float,
) -> float:
    """Tính mức gia tăng Hypervolume (HVI) khi bổ sung thêm điểm sample_point."""
    rx, ry, rz = ref_point
    # Nếu điểm nằm ngoài reference point thì không cải thiện
    if sample_point[0] >= rx or sample_point[1] >= ry or sample_point[2] >= rz:
        return 0.0

    # Nếu điểm bị dominate bởi một điểm đã có trong Pareto thì không gia tăng
    for p in current_pareto:
        if dominates(p, sample_point):
            return 0.0

    extended = list(current_pareto) + [sample_point]
    new_hv = compute_3d_hypervolume(extended, ref_point)
    diff = new_hv - base_hv
    return max(0.0, diff)
