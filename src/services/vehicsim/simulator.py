"""Simulator động học 2D cho mô típ "người đi bộ băng qua đường" + AEB/FCW.

Thay CARLA cho vòng MVP khi máy không có CARLA. Cùng một hợp đồng: nhận
``PedestrianCrossingCase`` + ``AebParams`` + seed, trả ``SimulationOutcome``
(khung hình, sự kiện, số đo). CARLA runner sau này trả đúng hình dạng đó.

**Tất định:** cùng case + params + seed -> cùng từng khung hình. Nhiễu perception
lấy từ ``random.Random(seed)`` riêng của lần chạy, không dùng random toàn cục.

Hệ toạ độ: xe ego chạy theo +x, tim làn ego ở y = 0. Người đi bộ đứng trên vỉa
hè bên phải (y âm) và băng sang trái (+y) tại vạch x = ``crossing_x``.

Chuỗi xử lý mỗi khung (dt = 0,05 s):
  ground truth -> perception (độ trễ + nhiễu + ngưỡng confidence)
  -> decision (TTC + dự đoán quỹ đạo theo prediction horizon + hành lang an toàn)
  -> control (trễ kích hoạt + thời gian đáp ứng actuator + tốc độ tăng lực phanh)
  -> dynamics (giảm tốc bị chặn bởi ma sát mặt đường μ·g)
"""

from __future__ import annotations

import math
import random
from dataclasses import asdict, dataclass, field

G = 9.81
DT = 0.05
MAX_DURATION_S = 12.0
LANE_WIDTH_M = 3.5
PEDESTRIAN_RADIUS_M = 0.3
PEDESTRIAN_START_Y_M = -3.6  # trên vỉa hè, cách mép làn ego 1,85 m
CURB_STOP_Y_M = -2.25  # người "dừng ở lề" đứng lại ngay trước mép đường
CURB_SLOWDOWN_M = 0.8  # đoạn chậm dần trước khi dừng
LEAD_TIME_S = 1.5  # ego bắt đầu cách điểm kích hoạt 1,5 s để có đoạn đường tiếp cận
SENSOR_RANGE_M = 80.0
PERCEPTION_LATENCY_S = 0.10
FCW_LEAD_S = 1.0  # FCW cảnh báo sớm hơn ngưỡng AEB 1 s (chưa có tham số riêng trong DB)
NEAR_MISS_TTC_S = 1.0
NEAR_MISS_DISTANCE_M = 0.5  # người đứng trên vỉa hè khi xe chạy qua còn ~1 m: không phải suýt va chạm

# Độ tin cậy nền của bộ phát hiện người đi bộ theo môi trường. Đây là mô hình
# đơn giản hoá có chủ đích — số đo thật sẽ đến từ perception stack trên CARLA.
_WEATHER_CONFIDENCE = {"CLEAR": 0.93, "CLOUDY": 0.91, "RAIN": 0.84, "HEAVY_RAIN": 0.74, "FOG": 0.70}
_TIME_CONFIDENCE = {"DAY": 0.0, "DUSK": -0.06, "NIGHT": -0.14}
_WEATHER_POSITION_NOISE_M = {"CLEAR": 0.05, "CLOUDY": 0.06, "RAIN": 0.10, "HEAVY_RAIN": 0.16, "FOG": 0.14}
WEATHER_FRICTION = {"CLEAR": 1.0, "CLOUDY": 1.0, "FOG": 1.0, "RAIN": 0.70, "HEAVY_RAIN": 0.55}


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
class VehicleSpec:
    length_m: float = 4.75
    width_m: float = 1.93
    max_brake_decel_mps2: float = 9.5


@dataclass(frozen=True)
class PedestrianCrossingCase:
    """Một biến thể của mô típ. Trigger là **khoảng cách**, không phải giây tuyệt đối."""

    ego_speed_kmh: float
    trigger_distance_m: float
    pedestrian_speed_mps: float
    stops_at_curb: bool = False
    weather: str = "CLEAR"
    time_of_day: str = "DAY"
    friction: float | None = None  # None -> suy từ thời tiết

    @property
    def road_friction(self) -> float:
        return self.friction if self.friction is not None else WEATHER_FRICTION.get(self.weather, 1.0)


@dataclass
class SimulationOutcome:
    end_reason: str  # COLLISION | EGO_STOPPED | TARGET_CLEARED | TIMEOUT
    duration_s: float
    frames: list[dict]
    events: list[dict]
    metrics: dict
    crossing_x: float
    params: dict = field(default_factory=dict)
    case: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return asdict(self)


def _base_confidence(case: PedestrianCrossingCase) -> float:
    return _WEATHER_CONFIDENCE.get(case.weather, 0.85) + _TIME_CONFIDENCE.get(case.time_of_day, 0.0)


def simulate(
    case: PedestrianCrossingCase,
    params: AebParams,
    seed: int,
    vehicle: VehicleSpec | None = None,
) -> SimulationOutcome:
    vehicle = vehicle or VehicleSpec()
    rng = random.Random(seed)
    v0 = case.ego_speed_kmh / 3.6
    half_w = vehicle.width_m / 2

    # Ego bắt đầu sao cho còn LEAD_TIME_S trước khi người đi bộ được kích hoạt.
    crossing_x = case.trigger_distance_m + v0 * LEAD_TIME_S
    ego_front = 0.0
    ego_v = v0
    ego_a = 0.0  # giảm tốc hiện tại (>= 0)

    ped_y = PEDESTRIAN_START_Y_M
    ped_vy = 0.0
    ped_started = False

    history: list[tuple[float, float, float]] = []  # (t, ped_y, ped_vy) cho độ trễ perception
    frames: list[dict] = []
    events: list[dict] = []

    first_detection_t: float | None = None
    fcw_t: float | None = None
    decision_t: float | None = None
    brake_onset_t: float | None = None
    collision = False
    end_reason = "TIMEOUT"
    decel_target = min(params.max_deceleration, vehicle.max_brake_decel_mps2, case.road_friction * G)
    perceived_vy_filtered = 0.0
    max_a = 0.0
    decel_sum = 0.0
    decel_frames = 0
    max_jerk = 0.0
    prev_a = 0.0

    def event(t: float, kind: str, label: str, **extra) -> None:
        events.append({"t": round(t, 3), "kind": kind, "label": label, **extra})

    t = 0.0
    while t <= MAX_DURATION_S + 1e-9:
        gap = crossing_x - ego_front  # khoảng dọc từ mũi xe tới vạch băng qua

        # ---- Ground truth người đi bộ -----------------------------------------
        if not ped_started and gap <= case.trigger_distance_m:
            ped_started = True
            ped_vy = case.pedestrian_speed_mps
            event(t, "gt_start", "Pedestrian starts crossing")
        if ped_started:
            if case.stops_at_curb and ped_vy > 0:
                # Người định dừng thì chậm dần trong 0,8 m cuối, không khựng lại tức thì —
                # đó cũng là tín hiệu "ý định dừng" mà bộ dự đoán quỹ đạo đọc được.
                remaining = CURB_STOP_Y_M - ped_y
                ped_vy = case.pedestrian_speed_mps * max(0.15, min(1.0, remaining / CURB_SLOWDOWN_M))
            ped_y += ped_vy * DT
            if case.stops_at_curb and ped_y >= CURB_STOP_Y_M:
                if ped_vy > 0:
                    event(t, "gt_stop", "Pedestrian stops at the curb")
                ped_y, ped_vy = CURB_STOP_Y_M, 0.0
        history.append((t, ped_y, ped_vy))

        in_gt_path = abs(ped_y) <= half_w + PEDESTRIAN_RADIUS_M
        ttc_gt = gap / ego_v if (in_gt_path and gap > 0 and ego_v > 0.1) else None

        # ---- Perception (dữ liệu trễ PERCEPTION_LATENCY_S) -----------------------
        lag_frames = int(round(PERCEPTION_LATENCY_S / DT))
        _, seen_y, seen_vy = history[max(0, len(history) - 1 - lag_frames)]
        distance = math.hypot(gap, seen_y)
        confidence = 0.0
        detected = False
        perceived_y = None
        if distance <= SENSOR_RANGE_M and gap > -vehicle.length_m:
            # Nhiễu rút từ rng của chính lần chạy -> tất định theo seed.
            confidence = _base_confidence(case) - 0.004 * max(0.0, distance - 15.0) + rng.gauss(0.0, 0.05)
            confidence = max(0.0, min(1.0, confidence))
            detected = confidence >= params.detection_confidence_threshold
            if detected:
                perceived_y = seen_y + rng.gauss(0.0, _WEATHER_POSITION_NOISE_M.get(case.weather, 0.08))
                perceived_vy_filtered = 0.6 * perceived_vy_filtered + 0.4 * seen_vy
                if first_detection_t is None:
                    first_detection_t = t
                    event(
                        t,
                        "detection",
                        f"First detection · conf {confidence:.2f}",
                        distance_m=round(distance, 1),
                        confidence=round(confidence, 2),
                    )

        # ---- Decision ------------------------------------------------------------
        ttc_perceived = None
        in_predicted_path = False
        if detected and perceived_y is not None and gap > 0 and ego_v >= params.relative_velocity_threshold:
            ttc_perceived = gap / ego_v
            lookahead = min(ttc_perceived, params.prediction_horizon)
            predicted_y = perceived_y + perceived_vy_filtered * lookahead
            in_predicted_path = abs(predicted_y) <= params.corridor_half_width or (
                abs(perceived_y) <= params.corridor_half_width
            )
            if in_predicted_path:
                if fcw_t is None and ttc_perceived <= params.ttc_threshold + FCW_LEAD_S:
                    fcw_t = t
                    event(t, "fcw", "FCW warning issued", ttc_s=round(ttc_perceived, 2))
                if decision_t is None and ttc_perceived <= params.ttc_threshold:
                    decision_t = t
                    event(t, "aeb_decision", "AEB brake command", ttc_s=round(ttc_perceived, 2))

        # ---- Control -----------------------------------------------------------
        braking_requested = decision_t is not None and t >= decision_t + params.brake_activation_delay
        if braking_requested and t >= decision_t + params.brake_activation_delay + params.actuator_response_time:
            if brake_onset_t is None:
                brake_onset_t = t
                event(t, "brake_onset", "Brakes engage")
            ego_a = min(decel_target, ego_a + params.decel_ramp_rate * DT)

        # ---- Dynamics ----------------------------------------------------------
        if ego_v > 0:
            ego_v = max(0.0, ego_v - ego_a * DT)
            ego_front += ego_v * DT
        else:
            ego_a = 0.0
        if ego_a > 0:
            max_a = max(max_a, ego_a)
            decel_sum += ego_a
            decel_frames += 1
        max_jerk = max(max_jerk, abs(ego_a - prev_a) / DT)
        prev_a = ego_a

        frames.append(
            {
                "t": round(t, 3),
                "ego_x": round(ego_front, 3),
                "ego_v": round(ego_v, 3),
                "ego_a": round(-ego_a, 3),
                "ped_x": round(crossing_x, 3),
                "ped_y": round(ped_y, 3),
                "ped_vy": round(ped_vy, 3),
                "detected": detected,
                "confidence": round(confidence, 3),
                "perceived_y": None if perceived_y is None else round(perceived_y, 3),
                "ttc": None if ttc_perceived is None else round(ttc_perceived, 3),
                "ttc_gt": None if ttc_gt is None else round(ttc_gt, 3),
                "fcw": fcw_t is not None,
                "aeb": decision_t is not None,
            }
        )

        # ---- Kết thúc ----------------------------------------------------------
        ego_rear = ego_front - vehicle.length_m
        hits_x = crossing_x - PEDESTRIAN_RADIUS_M <= ego_front and crossing_x + PEDESTRIAN_RADIUS_M >= ego_rear
        if hits_x and abs(ped_y) <= half_w + PEDESTRIAN_RADIUS_M:
            collision = True
            end_reason = "COLLISION"
            event(t, "collision", f"Collision · {ego_v * 3.6:.1f} km/h", impact_speed_mps=round(ego_v, 3))
            break
        if ego_v <= 0.0 and decision_t is not None:
            end_reason = "EGO_STOPPED"
            event(t, "stopped", "Ego stopped", gap_m=round(gap, 2))
            break
        if ego_rear > crossing_x + 1.0:
            end_reason = "TARGET_CLEARED"
            break
        t += DT

    metrics = _summary_metrics(
        frames=frames,
        collision=collision,
        crossing_x=crossing_x,
        vehicle=vehicle,
        first_detection_t=first_detection_t,
        fcw_t=fcw_t,
        decision_t=decision_t,
        brake_onset_t=brake_onset_t,
        max_a=max_a,
        mean_a=decel_sum / decel_frames if decel_frames else None,
        max_jerk=max_jerk,
        v0=v0,
        decel_target=decel_target,
    )
    return SimulationOutcome(
        end_reason=end_reason,
        duration_s=round(frames[-1]["t"], 3) if frames else 0.0,
        frames=frames,
        events=events,
        metrics=metrics,
        crossing_x=round(crossing_x, 3),
        params=asdict(params),
        case={**asdict(case), "road_friction": case.road_friction},
    )


def _summary_metrics(
    *,
    frames: list[dict],
    collision: bool,
    crossing_x: float,
    vehicle: VehicleSpec,
    first_detection_t: float | None,
    fcw_t: float | None,
    decision_t: float | None,
    brake_onset_t: float | None,
    max_a: float,
    mean_a: float | None,
    max_jerk: float,
    v0: float,
    decel_target: float,
) -> dict:
    half_w = vehicle.width_m / 2
    min_distance = math.inf
    min_ttc = None
    gt_in_path_t = None
    ped_ever_in_path = False
    for f in frames:
        front, rear = f["ego_x"], f["ego_x"] - vehicle.length_m
        dx = 0.0 if rear <= crossing_x <= front else min(abs(crossing_x - front), abs(crossing_x - rear))
        dy = max(0.0, abs(f["ped_y"]) - half_w)
        dist = max(0.0, math.hypot(dx, dy) - PEDESTRIAN_RADIUS_M)
        min_distance = min(min_distance, dist)
        if f["ttc_gt"] is not None:
            ped_ever_in_path = True
            if gt_in_path_t is None:
                gt_in_path_t = f["t"]
            min_ttc = f["ttc_gt"] if min_ttc is None else min(min_ttc, f["ttc_gt"])
    if collision:
        min_distance = 0.0
        min_ttc = 0.0
    last = frames[-1] if frames else {"ego_v": v0, "ego_x": 0.0}
    impact_speed = last["ego_v"] if collision else None

    def _at(t: float | None, key: str):
        if t is None:
            return None
        for f in frames:
            if f["t"] >= t - 1e-9:
                return f[key]
        return None

    detection_distance = None
    if first_detection_t is not None:
        ego_x = _at(first_detection_t, "ego_x")
        detection_distance = round(crossing_x - ego_x, 2) if ego_x is not None else None

    brake_start_x = _at(brake_onset_t, "ego_x")
    stopping_distance = None
    if brake_start_x is not None and not collision:
        stopping_distance = round(last["ego_x"] - brake_start_x, 3)

    return {
        "collision": collision,
        "impact_speed_mps": None if impact_speed is None else round(impact_speed, 3),
        "min_distance_m": round(min_distance, 3) if math.isfinite(min_distance) else None,
        "min_ttc_s": None if min_ttc is None else round(min_ttc, 3),
        "pedestrian_entered_path": ped_ever_in_path,
        "gt_in_path_t": gt_in_path_t,
        "first_detection_t": first_detection_t,
        "first_detection_distance_m": detection_distance,
        "fcw_t": fcw_t,
        "aeb_decision_t": decision_t,
        "aeb_decision_ttc_s": _at(decision_t, "ttc"),
        "brake_onset_t": brake_onset_t,
        "braking_latency_s": None
        if decision_t is None or brake_onset_t is None
        else round(brake_onset_t - decision_t, 3),
        "max_deceleration_mps2": round(max_a, 3) if max_a else None,
        "mean_deceleration_mps2": None if mean_a is None else round(mean_a, 3),
        "max_jerk_mps3": round(max_jerk, 3),
        "stopping_distance_m": stopping_distance,
        "ego_initial_speed_mps": round(v0, 3),
        "ego_final_speed_mps": round(last["ego_v"], 3),
        "ego_distance_m": round(last["ego_x"], 3),
        "decel_available_mps2": round(decel_target, 3),
    }
