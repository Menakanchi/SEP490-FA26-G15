/** HTTP/UI fixtures only. Existing explainability scalars unchanged; no physical ground truth. */
const version = "adr040-stored-aggregation/1";
const values = { rms_jerk_mps3: 2.123, impact_speed_mps: 10, stopping_distance_m: 33.25 };
const run = { revision: "metric-fixture", run_id: 101, scenario_id: 42, scenario_version_id: 201, version_no: 1,
  family: "Metric fixture", variant: "CP-001", seed: 13, baseline_id: 7, vehicle_id: 2,
  simulator: "carla-0.9.16-xosc5", dt: 0.01, status: "COMPLETED", outcome: "COLLISION",
  weather: "CLEAR", time_of_day: "DAY", failure_class: "CONTROL", error: null, end_reason: "COLLISION",
  trace_available: true, created_at: "2026-11-14T08:00:00", metrics: values };
const frames = [0, 0.25, 0.5].map(t => ({ t, ego_x: t, ego_v: 10, ego_a: -0.0004, ped_x: 30, ped_y: -1,
  ped_vy: 1, perceived_y: -1, detected: true, confidence: 0.8, ttc: null, ttc_gt: 1, aeb: true, fcw: true }));
const detail = { ...run, purpose: "BASELINE", variant_id: 201, vehicle: "Fixture car", config: "v7", date: run.created_at,
  verdict: "FAIL", evaluation_valid: true, failure_type: "COLLISION", headline: "Metric fixture", summary: "Fixture only",
  metrics: { ...values, metric_source: "SIMULATOR_RESULT", impact_speed_kmh: 36, min_distance_m: 0,
    min_ttc_s: 0, first_detection_t: 0, first_detection_distance_m: 30, aeb_activation_t: 0,
    aeb_activation_ttc_s: null, fcw_t: 0, brake_onset_t: 0.25, max_deceleration_mps2: 2,
    false_activation: false, missed_activation: false },
  configuration: [{ code: "BRAKE_ACTIVATION_DELAY", name: "Delay", value: 0.15, unit: "s" }],
  environment: { category: "CP_CROSSING", ego_speed_kmh: 36, trigger_distance_m: 30, pedestrian_speed_mps: 1, stops_at_curb: false,
    weather: "CLEAR", time_of_day: "DAY", road_friction: 0.65 },
  chain: [{ stage: "CONTROL", passed: false, summary: "Fixture", confidence: 0.8, cause_code: "FIXTURE", parameter_code: null }],
  chain_confidence: 0.8, evaluation_version: version,
  stage_evidence: [{ stage: "CONTROL", values: { brake_onset_t: 0.25, response_time_s: 0.25 } }],
  telemetry: frames.map(f => ({ t: f.t, ttc: null, speed_kmh: 36 })),
  motion_telemetry: frames.map(f => ({ t: f.t, ego_x_m: f.ego_x, ego_speed_mps: 10, ego_accel_mps2: -0.0004,
    target_y_m: -1, jerk_mps3: -0.0004, crossing_distance_m: 30 - f.ego_x, ttc_perceived_s: null,
    ttc_gt_s: 1, motion_state: "DECELERATING", derived_source: "RECORDED_GT_FINITE_DIFFERENCE" })),
  events: [{ t: 0, kind: "aeb_decision", label: "AEB brake command" }], ttc_threshold_s: 1.5,
  scene: { crossing_x: 30, vehicle_length_m: 4.8, vehicle_width_m: 2, lane_width_m: 3.5,
    path: frames.map(f => ({ t: f.t, x: f.ego_x, ped_y: f.ped_y })), end: frames.at(-1) }, similar: [] };

export const resultFixture = () => structuredClone({ run, detail, frames });
