"""Hệ AEB/FCW cần kiểm thử — dùng chung cho mọi bộ mô phỏng (động học và CARLA).

Bộ mô phỏng chỉ lo "thế giới": xe, người đi bộ, va chạm, ma sát. Mỗi khung nó
đưa ground truth vào ``AebStack.step`` và nhận lại mức giảm tốc AEB yêu cầu. Nhờ
vậy ``simulator.py`` (động học) và ``worker/run_variant.py`` (CARLA) kiểm thử
**cùng một** AEB, rồi ``evaluation`` chấm cả hai bằng cùng một luật.

Chỉ dùng thư viện chuẩn và cú pháp Python 3.10: venv CARLA của worker import
thẳng file này (``test_sim_core_is_stdlib_only_and_python310``).

Chuỗi xử lý mỗi khung:
  perception (độ trễ + nhiễu + ngưỡng confidence)
  -> decision (TTC + dự đoán quỹ đạo theo prediction horizon + hành lang an toàn)
  -> control (trễ kích hoạt + thời gian đáp ứng actuator + tốc độ tăng lực phanh)

Perception là mô hình tổng hợp trên ground truth, **kể cả khi chạy CARLA** — chưa
đọc camera/LiDAR thật. Nhiễu lấy từ ``random.Random(seed)`` riêng của lần chạy nên
cùng seed -> cùng chuỗi nhiễu, ở cả hai bộ mô phỏng.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

DT = 0.05
SENSOR_RANGE_M = 80.0
PERCEPTION_LATENCY_S = 0.10
FCW_LEAD_S = 1.0  # FCW cảnh báo sớm hơn ngưỡng AEB 1 s (chưa có tham số riêng trong DB)

# Độ tin cậy nền của bộ phát hiện người đi bộ theo môi trường. Đây là mô hình
# đơn giản hoá có chủ đích — số đo thật sẽ đến từ perception stack trên CARLA.
_WEATHER_CONFIDENCE = {"CLEAR": 0.93, "CLOUDY": 0.91, "RAIN": 0.84, "HEAVY_RAIN": 0.74, "FOG": 0.70}
_TIME_CONFIDENCE = {"DAY": 0.0, "DUSK": -0.06, "NIGHT": -0.14}
_WEATHER_POSITION_NOISE_M = {"CLEAR": 0.05, "CLOUDY": 0.06, "RAIN": 0.10, "HEAVY_RAIN": 0.16, "FOG": 0.14}


@dataclass(frozen=True)
class AebParams:
    """10 tham số của ``aeb_parameters`` (mã ENUM trong schema)."""

    detection_confidence_threshold: float = 0.70
    relative_velocity_threshold: float = 2.0
    prediction_horizon: float = 2.0
    safety_distance_margin: float = 2.0
    ttc_threshold: float = 1.5
    brake_activation_delay: float = 0.15
    max_deceleration: float = 8.0
    brake_buildup_rate: float = 50.0
    jerk_limit: float = 20.0
    actuator_response_time: float = 0.10

    @classmethod
    def from_codes(cls, values: dict[str, float]) -> AebParams:
        """``{"TTC_THRESHOLD": 1.5, ...}`` -> ``AebParams``. Mã thiếu thì giữ mặc định."""
        kwargs = {name: float(values[name.upper()]) for name in cls.__dataclass_fields__ if name.upper() in values}
        return cls(**kwargs)

    def as_codes(self) -> dict[str, float]:
        """Chiều ngược của ``from_codes``: ``{"TTC_THRESHOLD": 1.5, ...}``."""
        return {name.upper(): float(getattr(self, name)) for name in self.__dataclass_fields__}

    @property
    def corridor_half_width(self) -> float:
        """Nửa bề ngang hành lang AEB coi là "trong đường đi": nửa xe + ¼ khoảng đệm.

        ¼ chứ không phải ½: với margin mặc định 2 m, ½ cho hành lang 1,97 m — người
        đứng yên trên vỉa hè (cách tim làn 2,25 m) chỉ còn 0,28 m là "trong đường",
        và nhiễu định vị lúc mưa đủ làm AEB phanh oan gần như mọi lần.
        """
        return 0.5 * 1.93 + 0.25 * self.safety_distance_margin

    @property
    def decel_ramp_rate(self) -> float:
        """Tốc độ tăng giảm tốc thực tế: chậm hơn trong hai giới hạn build-up và jerk."""
        return min(self.brake_buildup_rate, self.jerk_limit)


@dataclass(frozen=True)
class AebTick:
    """Những gì AEB thấy và quyết định trong một khung — đủ để ghi frame."""

    detected: bool
    confidence: float
    perceived_y: float | None
    ttc: float | None
    decel_cmd: float  # m/s², >= 0: mức giảm tốc AEB đang yêu cầu actuator


def record_event(events: list[dict], t: float, kind: str, label: str, **extra) -> None:
    events.append({"t": round(t, 3), "kind": kind, "label": label, **extra})


class AebStack:
    """AEB cho một lần chạy. Gọi ``step`` đúng một lần mỗi khung, theo thứ tự thời gian.

    Hệ toạ độ (giống ``simulator.py``): xe chạy theo +x, tim làn ego ở y = 0, người
    đi bộ băng qua tại vạch x = điểm giao cắt. ``gap`` là khoảng dọc từ mũi xe tới
    vạch đó; ``ped_y`` là vị trí ngang của người đi bộ so với tim làn (trái là +).

    ``decel_limit`` là trần lực phanh phía xe: min(``MAX_DECELERATION``, khả năng
    phanh của xe). Ma sát mặt đường **không** nằm ở đây — đó là việc của thế giới
    (bộ mô phỏng tự chặn μ·g, hoặc CARLA tự có vật lý lốp).
    """

    def __init__(
        self,
        params: AebParams,
        *,
        seed: int,
        weather: str,
        time_of_day: str,
        vehicle_length_m: float,
        decel_limit: float,
        events: list[dict],
        dt: float = DT,
    ) -> None:
        self.params = params
        self.rng = random.Random(seed)
        self.weather = weather
        self.vehicle_length_m = vehicle_length_m
        self.decel_limit = decel_limit
        self.events = events
        self.dt = dt
        self.base_confidence = _WEATHER_CONFIDENCE.get(weather, 0.85) + _TIME_CONFIDENCE.get(time_of_day, 0.0)
        self.position_noise_m = _WEATHER_POSITION_NOISE_M.get(weather, 0.08)
        self.lag_frames = int(round(PERCEPTION_LATENCY_S / dt))

        self.first_detection_t: float | None = None
        self.fcw_t: float | None = None
        self.decision_t: float | None = None
        self.brake_onset_t: float | None = None
        self.decel_cmd = 0.0
        self._history: list[tuple[float, float, float]] = []  # (t, ped_y, ped_vy) cho độ trễ perception
        self._perceived_vy_filtered = 0.0

    def step(self, t: float, *, gap: float, ped_y: float, ped_vy: float, ego_v: float) -> AebTick:
        p = self.params
        self._history.append((t, ped_y, ped_vy))

        # ---- Perception (dữ liệu trễ PERCEPTION_LATENCY_S) -----------------------
        _, seen_y, seen_vy = self._history[max(0, len(self._history) - 1 - self.lag_frames)]
        distance = math.hypot(gap, seen_y)
        confidence = 0.0
        detected = False
        perceived_y = None
        if distance <= SENSOR_RANGE_M and gap > -self.vehicle_length_m:
            # Nhiễu rút từ rng của chính lần chạy -> tất định theo seed.
            confidence = self.base_confidence - 0.004 * max(0.0, distance - 15.0) + self.rng.gauss(0.0, 0.05)
            confidence = max(0.0, min(1.0, confidence))
            detected = confidence >= p.detection_confidence_threshold
            if detected:
                perceived_y = seen_y + self.rng.gauss(0.0, self.position_noise_m)
                self._perceived_vy_filtered = 0.6 * self._perceived_vy_filtered + 0.4 * seen_vy
                if self.first_detection_t is None:
                    self.first_detection_t = t
                    record_event(
                        self.events,
                        t,
                        "detection",
                        f"First detection · conf {confidence:.2f}",
                        distance_m=round(distance, 1),
                        confidence=round(confidence, 2),
                    )

        # ---- Decision ------------------------------------------------------------
        ttc_perceived = None
        if detected and perceived_y is not None and gap > 0 and ego_v >= p.relative_velocity_threshold:
            ttc_perceived = gap / ego_v
            lookahead = min(ttc_perceived, p.prediction_horizon)
            predicted_y = perceived_y + self._perceived_vy_filtered * lookahead
            in_predicted_path = abs(predicted_y) <= p.corridor_half_width or (abs(perceived_y) <= p.corridor_half_width)
            if in_predicted_path:
                if self.fcw_t is None and ttc_perceived <= p.ttc_threshold + FCW_LEAD_S:
                    self.fcw_t = t
                    record_event(self.events, t, "fcw", "FCW warning issued", ttc_s=round(ttc_perceived, 2))
                if self.decision_t is None and ttc_perceived <= p.ttc_threshold:
                    self.decision_t = t
                    record_event(self.events, t, "aeb_decision", "AEB brake command", ttc_s=round(ttc_perceived, 2))

        # ---- Control -----------------------------------------------------------
        if self.decision_t is not None and t >= self.decision_t + p.brake_activation_delay + p.actuator_response_time:
            if self.brake_onset_t is None:
                self.brake_onset_t = t
                record_event(self.events, t, "brake_onset", "Brakes engage")
            self.decel_cmd = min(self.decel_limit, self.decel_cmd + p.decel_ramp_rate * self.dt)

        return AebTick(
            detected=detected,
            confidence=confidence,
            perceived_y=perceived_y,
            ttc=ttc_perceived,
            decel_cmd=self.decel_cmd,
        )
