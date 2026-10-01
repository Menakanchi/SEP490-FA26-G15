"""Simulator động học 2D cho mô típ "người đi bộ băng qua đường" + AEB/FCW.

Một trong hai bộ mô phỏng cắm vào cùng một hợp đồng (bộ kia là CARLA,
``worker/run_variant.py``): nhận ``PedestrianCrossingCase`` + ``AebParams`` + seed,
trả ``SimulationOutcome`` (khung hình, sự kiện, số đo). Hệ AEB cần kiểm thử nằm ở
``aeb_stack.py`` và được cả hai dùng chung; file này chỉ lo "thế giới".

**Tất định:** cùng case + params + seed -> cùng từng khung hình. Nhiễu perception
lấy từ ``random.Random(seed)`` riêng của lần chạy, không dùng random toàn cục.

Hệ toạ độ: xe ego chạy theo +x, tim làn ego ở y = 0. Người đi bộ đứng trên vỉa
hè bên phải (y âm) và băng sang trái (+y) tại vạch x = ``crossing_x``.

Chuỗi xử lý mỗi khung (dt = 0,05 s):
  ground truth -> ``AebStack.step`` (perception -> decision -> control)
  -> dynamics (giảm tốc bị chặn bởi ma sát mặt đường μ·g)

``make_frame``, ``MotionStats`` và ``build_outcome`` là phần "ghi kết quả" dùng
chung: CARLA runner gọi đúng các hàm này nên frame và số đo cùng hình dạng.
Chỉ dùng thư viện chuẩn và cú pháp Python 3.10 (venv CARLA import file này).
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

from src.services.vehicsim.aeb_stack import DT, AebParams, AebStack, AebTick, record_event

__all__ = ["DT", "AebParams", "PedestrianCrossingCase", "SimulationOutcome", "VehicleSpec", "simulate"]

G = 9.81
MAX_DURATION_S = 12.0
LANE_WIDTH_M = 3.5
PEDESTRIAN_RADIUS_M = 0.3
PEDESTRIAN_START_Y_M = -3.6  # trên vỉa hè, cách mép làn ego 1,85 m
CURB_STOP_Y_M = -2.25  # người "dừng ở lề" đứng lại ngay trước mép đường
CURB_SLOWDOWN_M = 0.8  # đoạn chậm dần trước khi dừng
LEAD_TIME_S = 1.5  # ego bắt đầu cách điểm kích hoạt 1,5 s để có đoạn đường tiếp cận
NEAR_MISS_TTC_S = 1.0
NEAR_MISS_DISTANCE_M = 0.5  # người đứng trên vỉa hè khi xe chạy qua còn ~1 m: không phải suýt va chạm

WEATHER_FRICTION = {"CLEAR": 1.0, "CLOUDY": 1.0, "FOG": 1.0, "RAIN": 0.70, "HEAVY_RAIN": 0.55}


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

    @property
    def crossing_x(self) -> float:
        """Quãng đường từ mũi xe lúc bắt đầu tới vạch băng qua: trigger + LEAD_TIME_S ở tốc độ đầu."""
        return self.trigger_distance_m + self.ego_speed_kmh / 3.6 * LEAD_TIME_S


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

    @classmethod
    def from_dict(cls, data: dict) -> SimulationOutcome:
        return cls(**{name: data[name] for name in cls.__dataclass_fields__ if name in data})


def new_aeb_stack(
    case: PedestrianCrossingCase, params: AebParams, seed: int, vehicle: VehicleSpec, events: list[dict]
) -> AebStack:
    """AEB cho một lần chạy — cùng cách dựng ở mọi bộ mô phỏng."""
    return AebStack(
        params,
        seed=seed,
        weather=case.weather,
        time_of_day=case.time_of_day,
        vehicle_length_m=vehicle.length_m,
        decel_limit=min(params.max_deceleration, vehicle.max_brake_decel_mps2),
        events=events,
    )


def ground_truth_ttc(gap: float, ped_y: float, ego_v: float, vehicle: VehicleSpec) -> float | None:
    """TTC "mắt thần": chỉ có khi người đi bộ đang thật sự nằm trên đường đi của xe."""
    in_gt_path = abs(ped_y) <= vehicle.width_m / 2 + PEDESTRIAN_RADIUS_M
    return gap / ego_v if (in_gt_path and gap > 0 and ego_v > 0.1) else None


def make_frame(
    *,
    t: float,
    ego_x: float,
    ego_v: float,
    ego_decel: float,
    crossing_x: float,
    ped_y: float,
    ped_vy: float,
    tick: AebTick,
    ttc_gt: float | None,
    stack: AebStack,
) -> dict:
    return {
        "t": round(t, 3),
        "ego_x": round(ego_x, 3),
        "ego_v": round(ego_v, 3),
        "ego_a": round(-ego_decel, 3),
        "ped_x": round(crossing_x, 3),
        "ped_y": round(ped_y, 3),
        "ped_vy": round(ped_vy, 3),
        "detected": tick.detected,
        "confidence": round(tick.confidence, 3),
        "perceived_y": None if tick.perceived_y is None else round(tick.perceived_y, 3),
        "ttc": None if tick.ttc is None else round(tick.ttc, 3),
        "ttc_gt": None if ttc_gt is None else round(ttc_gt, 3),
        "fcw": stack.fcw_t is not None,
        "aeb": stack.decision_t is not None,
    }


class MotionStats:
    """Cộng dồn giảm tốc/jerk mỗi khung cho ``aeb_results`` (max, trung bình, jerk)."""

    def __init__(self, dt: float = DT) -> None:
        self.dt = dt
        self.max_a = 0.0
        self.decel_sum = 0.0
        self.decel_frames = 0
        self.max_jerk = 0.0
        self.prev_a = 0.0

    def add(self, decel: float) -> None:
        if decel > 0:
            self.max_a = max(self.max_a, decel)
            self.decel_sum += decel
            self.decel_frames += 1
        self.max_jerk = max(self.max_jerk, abs(decel - self.prev_a) / self.dt)
        self.prev_a = decel


def build_outcome(
    *,
    case: PedestrianCrossingCase,
    params: AebParams,
    vehicle: VehicleSpec,
    stack: AebStack,
    stats: MotionStats,
    frames: list[dict],
    events: list[dict],
    end_reason: str,
    crossing_x: float,
    decel_available: float,
) -> SimulationOutcome:
    metrics = _summary_metrics(
        frames=frames,
        collision=end_reason == "COLLISION",
        crossing_x=crossing_x,
        vehicle=vehicle,
        first_detection_t=stack.first_detection_t,
        fcw_t=stack.fcw_t,
        decision_t=stack.decision_t,
        brake_onset_t=stack.brake_onset_t,
        max_a=stats.max_a,
        mean_a=stats.decel_sum / stats.decel_frames if stats.decel_frames else None,
        max_jerk=stats.max_jerk,
        v0=case.ego_speed_kmh / 3.6,
        decel_target=decel_available,
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


def simulate(
    case: PedestrianCrossingCase,
    params: AebParams,
    seed: int,
    vehicle: VehicleSpec | None = None,
) -> SimulationOutcome:
    vehicle = vehicle or VehicleSpec()
    v0 = case.ego_speed_kmh / 3.6
    half_w = vehicle.width_m / 2

    # Ego bắt đầu sao cho còn LEAD_TIME_S trước khi người đi bộ được kích hoạt.
    crossing_x = case.crossing_x
    ego_front = 0.0
    ego_v = v0
    ego_a = 0.0  # giảm tốc thực tế (>= 0)

    ped_y = PEDESTRIAN_START_Y_M
    ped_vy = 0.0
    ped_started = False

    frames: list[dict] = []
    events: list[dict] = []
    stack = new_aeb_stack(case, params, seed, vehicle, events)
    stats = MotionStats()
    friction_limit = case.road_friction * G
    end_reason = "TIMEOUT"

    t = 0.0
    while t <= MAX_DURATION_S + 1e-9:
        gap = crossing_x - ego_front  # khoảng dọc từ mũi xe tới vạch băng qua

        # ---- Ground truth người đi bộ -----------------------------------------
        if not ped_started and gap <= case.trigger_distance_m:
            ped_started = True
            ped_vy = case.pedestrian_speed_mps
            record_event(events, t, "gt_start", "Pedestrian starts crossing")
        if ped_started:
            if case.stops_at_curb and ped_vy > 0:
                # Người định dừng thì chậm dần trong 0,8 m cuối, không khựng lại tức thì —
                # đó cũng là tín hiệu "ý định dừng" mà bộ dự đoán quỹ đạo đọc được.
                remaining = CURB_STOP_Y_M - ped_y
                ped_vy = case.pedestrian_speed_mps * max(0.15, min(1.0, remaining / CURB_SLOWDOWN_M))
            ped_y += ped_vy * DT
            if case.stops_at_curb and ped_y >= CURB_STOP_Y_M:
                if ped_vy > 0:
                    record_event(events, t, "gt_stop", "Pedestrian stops at the curb")
                ped_y, ped_vy = CURB_STOP_Y_M, 0.0
        ttc_gt = ground_truth_ttc(gap, ped_y, ego_v, vehicle)

        # ---- AEB cần kiểm thử: perception -> decision -> control ---------------
        tick = stack.step(t, gap=gap, ped_y=ped_y, ped_vy=ped_vy, ego_v=ego_v)
        ego_a = min(tick.decel_cmd, friction_limit)  # mặt đường chặn mức phanh ở μ·g

        # ---- Dynamics ----------------------------------------------------------
        if ego_v > 0:
            ego_v = max(0.0, ego_v - ego_a * DT)
            ego_front += ego_v * DT
        else:
            ego_a = 0.0
        stats.add(ego_a)

        frames.append(
            make_frame(
                t=t,
                ego_x=ego_front,
                ego_v=ego_v,
                ego_decel=ego_a,
                crossing_x=crossing_x,
                ped_y=ped_y,
                ped_vy=ped_vy,
                tick=tick,
                ttc_gt=ttc_gt,
                stack=stack,
            )
        )

        # ---- Kết thúc ----------------------------------------------------------
        ego_rear = ego_front - vehicle.length_m
        hits_x = crossing_x - PEDESTRIAN_RADIUS_M <= ego_front and crossing_x + PEDESTRIAN_RADIUS_M >= ego_rear
        if hits_x and abs(ped_y) <= half_w + PEDESTRIAN_RADIUS_M:
            end_reason = "COLLISION"
            record_event(
                events, t, "collision", f"Collision · {ego_v * 3.6:.1f} km/h", impact_speed_mps=round(ego_v, 3)
            )
            break
        if ego_v <= 0.0 and stack.decision_t is not None:
            end_reason = "EGO_STOPPED"
            record_event(events, t, "stopped", "Ego stopped", gap_m=round(gap, 2))
            break
        if ego_rear > crossing_x + 1.0:
            end_reason = "TARGET_CLEARED"
            break
        t += DT

    return build_outcome(
        case=case,
        params=params,
        vehicle=vehicle,
        stack=stack,
        stats=stats,
        frames=frames,
        events=events,
        end_reason=end_reason,
        crossing_x=crossing_x,
        decel_available=min(params.max_deceleration, vehicle.max_brake_decel_mps2, friction_limit),
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
