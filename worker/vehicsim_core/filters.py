"""Bộ lọc gia tốc 10 Hz trước khi tính jerk (kế hoạch 20/10, D3). Chỉ dùng thư viện chuẩn, Python 3.10.

Đây là **một** cách cài đặt D3, chưa phải objective chính thức: bậc lọc, causal hay offline, khởi tạo biên và nguồn gia tốc
còn mở ở mục 5.3 của kế hoạch (Thành viên 3 chốt). Hàm ở đây tách riêng để kết quả chạy 100 Hz ghi được số đã lọc kèm đặc tả
bộ lọc mà không đổi ``rms_jerk_mps3`` hiện có.

**Không khớp Euro NCAP.** Euro NCAP AEB/LSS VRU v4.5.1, mục 4.4.1.2, lọc gia tốc bằng "12-pole phaseless Butterworth filter with a
cut off frequency of 10Hz" (không lệch pha). Bộ lọc dưới đây là bậc 2, chạy một chiều (causal, có trễ pha), nên số jerk đã lọc **không**
tuân theo đặc tả đó. Cách hiểu "12-pole phaseless" (6 cực chạy xuôi rồi ngược, theo quy ước SAE J211) và việc 10 Hz áp cho mỗi lượt
hay cho đáp ứng tổng chưa được Euro NCAP nêu, nên chưa cài. Xem docs/vehicsim/nguon-va-kiem-chung-du-lieu.md (R14, R19).
"""

from __future__ import annotations

import math
from collections.abc import Sequence

SPEC = {"type": "butterworth", "order": 2, "cutoff_hz": 10.0, "causal": True, "init": "first sample (DC steady state)"}


def butterworth_lowpass2(samples: Sequence[float], dt: float, cutoff_hz: float = 10.0) -> list[float]:
    """Butterworth bậc 2 thông thấp, chỉ chạy xuôi (causal, trễ pha) qua biến đổi song tuyến có tiền biến dạng tần số.

    Trạng thái đầu đặt bằng mẫu đầu tiên nên tín hiệu hằng không có quá độ khởi động. Cần ``cutoff_hz`` < ``1/(2·dt)``.
    """
    if not 0 < cutoff_hz < 0.5 / dt:
        raise ValueError(f"cutoff {cutoff_hz} Hz phải nằm dưới tần số Nyquist {0.5 / dt} Hz của bước {dt} s")
    if not samples:
        return []
    wc = math.tan(math.pi * cutoff_hz * dt)
    k = math.sqrt(2.0) * wc
    norm = 1.0 + k + wc * wc
    b0 = wc * wc / norm
    b1 = 2.0 * b0
    a1 = 2.0 * (wc * wc - 1.0) / norm
    a2 = (1.0 - k + wc * wc) / norm
    x1 = x2 = y1 = y2 = float(samples[0])
    out: list[float] = []
    for x in samples:
        y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2
        out.append(y)
        x2, x1 = x1, float(x)
        y2, y1 = y1, y
    return out


def filtered_rms_jerk(accel: Sequence[float], start: int, dt: float, cutoff_hz: float = 10.0) -> float | None:
    """RMS của ``Δa_lọc/dt`` từ khung ``start`` tới hết; ``None`` nếu không có khung nào. Lọc cả chuỗi rồi mới cắt pha phanh."""
    if start < 0 or start >= len(accel):
        return None
    smooth = butterworth_lowpass2(accel, dt, cutoff_hz)
    total, count = 0.0, 0
    for i in range(start, len(smooth)):
        before = smooth[i - 1] if i > 0 else smooth[0]
        jerk = (smooth[i] - before) / dt
        total += jerk * jerk
        count += 1
    return math.sqrt(total / count)
