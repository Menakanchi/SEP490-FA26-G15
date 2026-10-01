"""Chấm một lần chạy: outcome, số đo ``aeb_results``, lỗi và chuỗi nguyên nhân gốc.

Code thuần, không đụng DB — nhận ``SimulationOutcome`` trả dict để tầng lưu trữ ghi.
Chữ mô tả viết tiếng Anh vì giao diện VehicSim (Figma FE-12/14) là tiếng Anh.

**Chuỗi nguyên nhân** (màn 02 · Root cause chain) chấm lần lượt bốn khâu:

- *Perception*: người đi bộ có được phát hiện kịp lúc AEB lẽ ra phải kích hoạt không.
  "Lẽ ra" = lúc TTC trên ground truth chạm ngưỡng — cùng luật AEB nhưng mắt thần.
- *Decision*: phát hiện rồi, lệnh phanh có đến kịp không; và ngưỡng TTC có đủ để
  dừng ở tốc độ này không (trễ + đoạn tăng lực phanh + v/2a).
- *Control*: thời gian mất cho trễ kích hoạt + actuator + tăng lực phanh có quá mức.
- *Dynamics*: ma sát mặt đường có chặn mức giảm tốc được yêu cầu không.

Khâu đầu tiên hỏng trong chuỗi là nguyên nhân chính (``is_primary``).
"""

from __future__ import annotations

from dataclasses import dataclass, field

from src.services.vehicsim.simulator import (
    NEAR_MISS_DISTANCE_M,
    NEAR_MISS_TTC_S,
    AebParams,
    SimulationOutcome,
)

TIMING_TOLERANCE_S = 0.15  # chậm hơn thời điểm lý tưởng quá mức này mới tính là trễ
CONTROL_LOSS_LIMIT_S = 0.50  # trễ + actuator + nửa đoạn tăng lực phanh tối đa chấp nhận (mặc định: 0,45 s)

OUTCOME_COLLISION = "COLLISION"
OUTCOME_NEAR_MISS = "NEAR_MISS"
OUTCOME_SAFE = "SAFE"

STAGES = ("PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS")
SIDE_ENTRY_CAUSE = "SIDE_ENTRY_NOT_PREDICTED"


@dataclass
class StageVerdict:
    stage: str
    passed: bool
    summary: str
    cause_code: str | None = None
    parameter_code: str | None = None
    confidence: float = 0.9


@dataclass
class Evaluation:
    outcome: str
    verdict: str  # PASS | FAIL
    aeb_result: dict
    failure: dict | None
    chain: list[StageVerdict] = field(default_factory=list)
    headline: str = ""

    @property
    def primary_stage(self) -> StageVerdict | None:
        return next((s for s in self.chain if not s.passed), None)


def classify_outcome(metrics: dict) -> str:
    if metrics["collision"]:
        return OUTCOME_COLLISION
    min_ttc, min_dist = metrics.get("min_ttc_s"), metrics.get("min_distance_m")
    if (min_ttc is not None and min_ttc < NEAR_MISS_TTC_S) or (
        min_dist is not None and min_dist < NEAR_MISS_DISTANCE_M
    ):
        return OUTCOME_NEAR_MISS
    return OUTCOME_SAFE


def _ideal_trigger_t(outcome: SimulationOutcome, params: AebParams) -> float | None:
    """Lúc AEB "mắt thần" (ground truth, không trễ, không nhiễu) sẽ kích hoạt."""
    for f in outcome.frames:
        if f["ttc_gt"] is not None and f["ttc_gt"] <= params.ttc_threshold:
            return f["t"]
    return None


def evaluate(outcome: SimulationOutcome, params: AebParams) -> Evaluation:
    m = outcome.metrics
    kind = classify_outcome(m)
    triggered = m["aeb_decision_t"] is not None
    # Va chạm luôn là có mối nguy — kể cả khi người đi bộ bước vào HÔNG xe sau khi mũi
    # xe đã qua vạch (khi đó ttc_gt không bao giờ có, pedestrian_entered_path = False).
    # Thiếu vế này, ca đó bị chấm nhầm thành "phanh oan" (lộ ra khi chạy CARLA, 01/10/2026).
    hazard = m["pedestrian_entered_path"] or m["collision"]
    false_activation = triggered and not hazard
    ideal_t = _ideal_trigger_t(outcome, params)
    missed_activation = hazard and ideal_t is not None and not triggered

    verdict = "FAIL" if (kind == OUTCOME_COLLISION or false_activation or missed_activation) else "PASS"
    aeb_result = {
        "collision": m["collision"],
        "collision_count": 1 if m["collision"] else 0,
        "impact_speed_mps": m["impact_speed_mps"],
        "min_ttc_s": m["min_ttc_s"],
        "min_distance_m": m["min_distance_m"],
        "aeb_triggered": triggered,
        "aeb_trigger_time_s": m["aeb_decision_t"],
        "braking_latency_s": m["braking_latency_s"],
        "false_activation": false_activation,
        "missed_activation": missed_activation,
        "max_deceleration_mps2": m["max_deceleration_mps2"],
        "mean_deceleration_mps2": m["mean_deceleration_mps2"],
        "max_jerk_mps3": m["max_jerk_mps3"],
        "stopping_distance_m": m["stopping_distance_m"],
        "verdict": verdict,
    }

    if false_activation:
        chain = _false_activation_chain(outcome, params)
        failure = {
            "failure_type": "FALSE_BRAKING",
            "severity": "MEDIUM",
            "detected_at_s": m["aeb_decision_t"],
            "description": chain[1].summary,
        }
        headline = "AEB braked for a pedestrian who stopped at the curb."
        return Evaluation(kind, verdict, aeb_result, failure, chain, headline)

    if kind == OUTCOME_SAFE and not missed_activation:
        return Evaluation(kind, verdict, aeb_result, None, [], "AEB handled the crossing safely.")

    chain = _hazard_chain(outcome, params, ideal_t)
    impact_kmh = (m["impact_speed_mps"] or 0.0) * 3.6
    if kind == OUTCOME_COLLISION:
        failure_type = "COLLISION"
        severity = "CRITICAL" if impact_kmh >= 30 else "HIGH" if impact_kmh >= 15 else "MEDIUM"
        detected_at = next((e["t"] for e in outcome.events if e["kind"] == "collision"), None)
    elif missed_activation:
        failure_type, severity, detected_at = "MISSED_BRAKING", "HIGH", ideal_t
    else:
        failure_type, severity, detected_at = "LATE_BRAKING", "MEDIUM", m["aeb_decision_t"]
    primary = next((s for s in chain if not s.passed), None)
    description = primary.summary if primary else None
    if primary is None and kind == OUTCOME_NEAR_MISS:
        # Mọi khâu đạt chuẩn mà vẫn sát nút: lỗi nằm ở biên an toàn, không ở khâu nào.
        failure_type, severity = "INSUFFICIENT_STOPPING_DISTANCE", "LOW"
        description = (
            f"Every stage met spec, but the margin was thin: min distance {m['min_distance_m'] or 0:.2f} m, "
            f"min TTC {m['min_ttc_s'] or 0:.2f} s."
        )
    failure = {
        "failure_type": failure_type,
        "severity": severity,
        "detected_at_s": detected_at,
        "description": description or "Hazard reproduced without a single failing stage.",
    }
    return Evaluation(kind, verdict, aeb_result, failure, chain, _headline(chain, m, ideal_t))


def _hazard_chain(outcome: SimulationOutcome, params: AebParams, ideal_t: float | None) -> list[StageVerdict]:
    m = outcome.metrics
    case = outcome.case
    v0 = m["ego_initial_speed_mps"]
    det_t = m["first_detection_t"]
    dec_t = m["aeb_decision_t"]
    reference_t = ideal_t if ideal_t is not None else m["gt_in_path_t"]

    # -- Perception ----------------------------------------------------------------
    if det_t is None:
        perception = StageVerdict(
            "PERCEPTION",
            False,
            f"Pedestrian never passed the detection threshold {params.detection_confidence_threshold:.2f} "
            f"({case['weather'].lower().replace('_', ' ')}, {case['time_of_day'].lower()}).",
            "OBJECT_NOT_DETECTED",
            "DETECTION_CONFIDENCE_THRESHOLD",
        )
    elif reference_t is not None and det_t > reference_t + TIMING_TOLERANCE_S:
        perception = StageVerdict(
            "PERCEPTION",
            False,
            f"Pedestrian first detected at t {det_t:.1f} s ({m['first_detection_distance_m']:.0f} m), "
            f"{det_t - reference_t:.1f} s after AEB should have fired.",
            "OBJECT_DETECTED_LATE",
            "DETECTION_CONFIDENCE_THRESHOLD",
        )
    else:
        dist = m["first_detection_distance_m"]
        perception = StageVerdict(
            "PERCEPTION",
            True,
            f"Pedestrian detected at t {det_t:.1f} s ({dist:.0f} m) with latency 0.1 s."
            if dist is not None
            else f"Pedestrian detected at t {det_t:.1f} s.",
        )

    # -- Ngân sách thời gian để dừng ------------------------------------------------
    # t_ctrl: mất cho trễ kích hoạt + actuator + nửa đoạn tăng lực phanh.
    # needed_nominal: TTC tối thiểu để dừng trên đường khô với chính cấu hình này.
    # needed_actual: như trên nhưng với mức giảm tốc mặt đường thực sự cho phép.
    a_nom = params.max_deceleration
    a_eff = m["decel_available_mps2"]
    ramp_time = a_nom / params.decel_ramp_rate if params.decel_ramp_rate else 0.0
    t_ctrl = params.brake_activation_delay + params.actuator_response_time + ramp_time / 2
    needed_nominal = t_ctrl + v0 / (2 * a_nom)
    needed_actual = t_ctrl + v0 / (2 * a_eff)
    entry_ttc = next((f["ttc_gt"] for f in outcome.frames if f["ttc_gt"] is not None), None)

    # -- Decision ------------------------------------------------------------------
    if m["collision"] and entry_ttc is None:
        decision = StageVerdict(
            "DECISION",
            False,
            "Pedestrian stepped into the side of the car after its front had passed the crossing; "
            "AEB only predicts the pedestrian's position for the moment the front arrives.",
            SIDE_ENTRY_CAUSE,
            "PREDICTION_HORIZON",
            confidence=0.6,
        )
    elif dec_t is None:
        decision = StageVerdict(
            "DECISION",
            False,
            "AEB never issued a brake command: the predicted path did not enter the lane in time.",
            "NO_TRIGGER",
            "PREDICTION_HORIZON",
        )
    elif reference_t is not None and dec_t > reference_t + TIMING_TOLERANCE_S and perception.passed:
        decision = StageVerdict(
            "DECISION",
            False,
            f"AEB fired at TTC {m['aeb_decision_ttc_s']:.1f} s, {dec_t - reference_t:.1f} s after "
            f"the {params.ttc_threshold:.1f} s threshold was reached.",
            "TRIGGERED_TOO_LATE",
            "TTC_THRESHOLD",
        )
    elif params.ttc_threshold < needed_nominal:
        decision = StageVerdict(
            "DECISION",
            False,
            f"TTC threshold {params.ttc_threshold:.1f} s is below the {needed_nominal:.1f} s needed to stop "
            f"from {v0 * 3.6:.0f} km/h.",
            "THRESHOLD_TOO_LOW",
            "TTC_THRESHOLD",
            confidence=0.85,
        )
    elif entry_ttc is not None and entry_ttc < needed_actual and (m["aeb_decision_ttc_s"] or 0) < needed_actual:
        decision = StageVerdict(
            "DECISION",
            False,
            f"Pedestrian entered the path at TTC {entry_ttc:.1f} s, inside the {needed_actual:.1f} s stopping "
            f"envelope; only an earlier path prediction could have fired in time.",
            "PATH_ENTERED_LATE",
            "PREDICTION_HORIZON",
            confidence=0.6,
        )
    else:
        decision = StageVerdict(
            "DECISION",
            True,
            f"Brake command at TTC {m['aeb_decision_ttc_s']:.1f} s, within the {params.ttc_threshold:.1f} s threshold.",
        )

    # -- Control -------------------------------------------------------------------
    if dec_t is not None and t_ctrl > CONTROL_LOSS_LIMIT_S:
        control = StageVerdict(
            "CONTROL",
            False,
            f"Brake delay {params.brake_activation_delay:.2f} s + actuator {params.actuator_response_time:.2f} s + "
            f"ramp {ramp_time:.2f} s lost {t_ctrl:.2f} s of braking (limit {CONTROL_LOSS_LIMIT_S:.2f} s).",
            "SLOW_BRAKE_BUILDUP",
            "BRAKE_BUILDUP_RATE" if ramp_time / 2 >= params.brake_activation_delay else "BRAKE_ACTIVATION_DELAY",
            confidence=0.75,
        )
    else:
        control = StageVerdict(
            "CONTROL",
            True,
            f"Brake command reached {m['max_deceleration_mps2'] or 0:.1f} m/s² with {t_ctrl:.2f} s of delay and ramp."
            if dec_t is not None
            else "No brake command to execute.",
        )

    # -- Dynamics ------------------------------------------------------------------
    friction = case["road_friction"]
    if a_eff < a_nom - 0.05:
        dynamics = StageVerdict(
            "VEHICLE_DYNAMICS",
            False,
            f"Road friction μ {friction:.2f} capped deceleration at {a_eff:.1f} m/s² vs {a_nom:.1f} requested.",
            "LOW_FRICTION",
            "MAX_DECELERATION",
            confidence=0.85,
        )
    else:
        dynamics = StageVerdict(
            "VEHICLE_DYNAMICS",
            True,
            f"Road friction μ {friction:.2f}: requested {a_nom:.1f} m/s² was achievable.",
        )
    return [perception, decision, control, dynamics]


def _false_activation_chain(outcome: SimulationOutcome, params: AebParams) -> list[StageVerdict]:
    m = outcome.metrics
    return [
        StageVerdict("PERCEPTION", True, "Pedestrian detected and tracked correctly."),
        StageVerdict(
            "DECISION",
            False,
            f"AEB braked at TTC {m['aeb_decision_ttc_s']:.1f} s for a pedestrian who stopped at the curb; "
            f"the {params.prediction_horizon:.1f} s predicted path entered the lane.",
            "PATH_PREDICTION_TOO_CONSERVATIVE",
            "TTC_THRESHOLD",
            confidence=0.8,
        ),
        StageVerdict("CONTROL", True, "Braking executed as commanded."),
        StageVerdict("VEHICLE_DYNAMICS", True, "Vehicle dynamics nominal."),
    ]


def _headline(chain: list[StageVerdict], m: dict, ideal_t: float | None) -> str:
    primary = next((s for s in chain if not s.passed), None)
    if primary is None:
        if m["collision"]:
            return "Every stage met its spec, yet the pedestrian was reached."
        return "AEB stopped in time, but with less margin than the near-miss limit."
    if primary.stage == "PERCEPTION":
        return "The pedestrian was detected too late for AEB to stop."
    if primary.stage == "DECISION":
        if primary.cause_code == SIDE_ENTRY_CAUSE:
            return "The pedestrian walked into the side of the car; AEB only checks the moment the front arrives."
        if m["aeb_decision_t"] is not None and ideal_t is not None and m["aeb_decision_t"] > ideal_t:
            return f"The pedestrian was detected in time, but AEB activated {m['aeb_decision_t'] - ideal_t:.1f} s too late."
        return "The pedestrian was detected in time, but the TTC threshold left too little room to stop."
    if primary.stage == "CONTROL":
        return "AEB fired in time, but braking built up too slowly."
    return "AEB fired in time, but the road could not deliver the requested deceleration."
