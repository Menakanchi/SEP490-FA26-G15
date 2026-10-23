/**
 * Kiểu dữ liệu VehicSim — khớp payload của backend `/api/v1/vehicsim/*`
 * (src/services/vehicsim/views.py).
 */

export type FailureClass = "PERCEPTION" | "DECISION" | "CONTROL" | "VEHICLE_DYNAMICS";
export type Outcome = "COLLISION" | "NEAR_MISS" | "SAFE" | "FALSE_BRAKING";
export type RegressionStatus = "PENDING" | "RUNNING" | "PASSED" | "FAILED" | "ERROR";
export type ReviewDecision = "PENDING" | "ACCEPT" | "REJECT" | "REQUEST_MORE_TESTS";
export type Weather = "CLEAR" | "CLOUDY" | "RAIN" | "HEAVY_RAIN" | "FOG";
export type TimeOfDay = "DAY" | "DUSK" | "NIGHT";

export interface CarlaStatus {
  configured: boolean;
  connected: boolean;
  compatible?: boolean;
  scenario_runner: boolean;
  version?: string | null;
  simulator?: string;
  error?: string;
}

export interface CarlaRun {
  id: number;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "STOPPED";
  scenario_id: number;
  aeb_version_id: number;
  simulator_version: string;
  error_message: string | null;
}

export interface CarlaData {
  run_id: number;
  summary: TelemetrySummary;
  camera_frames: string[];
}

export interface VersionBrief {
  id: number;
  label: string;
  version_number: number;
  status: "BASELINE" | "CANDIDATE" | "ACCEPTED" | "REJECTED" | "ARCHIVED";
  source: string;
  parent_version_id: number | null;
  notes: string | null;
  created_at: string | null;
}

export interface ParameterDef {
  code: string;
  name: string;
  category: FailureClass;
  unit: string;
  min_value: number;
  max_value: number;
  default_value: number;
}

export interface VehicSimContextData {
  project: { id: number; name: string };
  workspace: { id: number; name: string } | null;
  vehicle: { id: number; name: string } | null;
  /** Bộ mô phỏng run MỚI sẽ dùng, vd. `vehicsim-kinematic-1.0` hoặc `carla-0.9.16-xosc3`. */
  simulator: string;
  system: { id: number; name: string; baseline: VersionBrief | null };
  versions: VersionBrief[];
  families: { id: number; code: string; name: string }[];
  parameters: ParameterDef[];
}

export interface FamilyItem {
  id: number;
  code: string;
  name: string;
  description: string | null;
  variants: number;
  parameter_space: Record<string, (number | boolean | string)[]>;
  runs: Record<string, number>;
  /** Số biến thể có lỗi ở run baseline mới nhất của `baseline` (không tính run regression). */
  failures: number;
  baseline: string | null;
  created_at: string;
}

export interface FamilyRequest {
  name: string;
  description?: string;
  ego_speeds_kmh: number[];
  trigger_distances_m: number[];
  pedestrian_speeds_mps: number[];
  stops_at_curb: boolean[];
  weathers: Weather[];
  times_of_day: TimeOfDay[];
  run_baseline: boolean;
  /** Họ tạo từ bước "Sinh từ mô tả": lưu câu gốc + model + IR vào bản gốc (source NATURAL_LANGUAGE). */
  origin?: { natural_language_input: string; llm_model?: string | null; described?: Record<string, unknown> };
}

export type DescribeKey = "ego_speed_kmh" | "trigger_distance_m" | "pedestrian_speed_mps" | "stops_at_curb" | "weather" | "time_of_day";
/** Nguồn gốc giá trị: câu nói rõ / suy từ từ ngữ / giá trị mặc định / người dùng sửa tay. */
export type FieldOrigin = "stated" | "inferred" | "assumed" | "edited";

export interface DescribedIr {
  motif: string;
  ego_speed_kmh: number;
  trigger_distance_m: number;
  pedestrian_speed_mps: number;
  stops_at_curb: boolean;
  weather: Weather;
  time_of_day: TimeOfDay;
}

/** `POST /api/v1/vehicsim/scenarios/describe` — src/services/vehicsim/describe.py. */
export interface DescribeResult {
  motif: string;
  source: "llm" | "rules";
  model: string | null;
  llm_error: string | null;
  repairs: number;
  issues: string[];
  title: string;
  notes: string | null;
  ir: DescribedIr;
  fields: { key: DescribeKey; label: string; value: number | boolean | string; unit: string; origin: FieldOrigin }[];
  assumed: DescribeKey[];
  cost_usd: number;
  llm_calls: number;
}

export interface AebVersion extends VersionBrief {
  parameters: Record<string, number>;
}

export interface FailureItem {
  run_id: number;
  failure_id: number;
  failure_type: string;
  severity: string;
  outcome: Outcome;
  failure_class: FailureClass | null;
  cause_code: string | null;
  root_cause: string;
  confidence: number | null;
  impact_kmh: number | null;
  min_ttc_s: number | null;
  scenario_id: number;
  family: string;
  variant: string;
  summary: string;
  weather: Weather;
  time_of_day: TimeOfDay;
  aeb_version_id: number;
  config: string;
  purpose: string;
  created_at: string;
}

export interface AnalysisDataset {
  schema: "vehicsim.analysis-dataset/v1";
  metric_policy: "AS_STORED";
  preview_token: string;
  id?: number;
  baseline_current?: boolean;
  created_at?: string | null;
  scenario: { id: number; code: string; name: string; category: string };
  baseline: { id: number; label: string };
  reference: { vehicle_id: number; simulator: string } | null;
  counts: { total: number; completed: number; not_run: number; classified: number; unclassified: number; failures: number; safe: number };
  variants: {
    scenario_version_id: number;
    version_no: number;
    source: string;
    summary: string;
    ego_speed_kmh: number | null;
    trigger_distance_m: number | null;
    pedestrian_speed_mps: number | null;
    stops_at_curb: boolean | null;
    weather: string | null;
    time_of_day: string | null;
    status: "COMPLETED" | "NOT_RUN";
    run_id: number | null;
    seed: number | null;
    metrics: {
      verdict: "PASS" | "FAIL" | null;
      classification_status: "CLASSIFIED" | "INCOMPLETE";
      outcome: "SAFE" | "NEAR_MISS" | "COLLISION" | "FALSE_BRAKING" | "UNCLASSIFIED";
      end_reason: string | null;
      collision_occurred: boolean | null;
      false_activation: boolean | null;
      missed_activation: boolean | null;
      rms_jerk_mps3: number | null;
      impact_speed_mps: number | null;
      stopping_distance_m: number | null;
      min_distance_m: number | null;
      min_ttc_s: number | null;
      max_deceleration_mps2: number | null;
      mean_deceleration_mps2: number | null;
      aeb_activation_time_s: number | null;
    } | null;
  }[];
}

export interface FailureList {
  kpis: {
    total: number;
    this_week: number;
    collisions: number;
    near_misses: number;
    false_braking: number;
    by_class: Record<FailureClass, number>;
  };
  families: { id: number; name: string; failures: number }[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
  items: FailureItem[];
}

export interface FailureFilters {
  scenario_id?: number;
  failure_class?: FailureClass;
  outcome?: Exclude<Outcome, "SAFE">;
  weather?: Weather;
  aeb_version_id?: number;
  days?: number;
}

export interface ChainStage {
  stage: FailureClass;
  passed: boolean;
  summary: string;
  cause_code: string | null;
  parameter_code: string | null;
  confidence: number;
}

export interface SimEvent {
  t: number;
  kind: string;
  label: string;
  [key: string]: unknown;
}

export interface Frame {
  t: number;
  ego_x: number;
  ego_v: number;
  ego_a: number;
  ped_x: number;
  ped_y: number;
  ped_vy: number;
  detected: boolean;
  confidence: number;
  perceived_y: number | null;
  ttc: number | null;
  ttc_gt: number | null;
  fcw: boolean;
  aeb: boolean;
}

export interface RunHeader {
  evaluation_valid?: boolean;
  run_id: number;
  purpose: string;
  status: string;
  seed: number;
  family: string;
  scenario_id: number;
  variant: string;
  variant_id: number;
  summary: string;
  vehicle: string;
  config: string;
  aeb_version_id: number;
  simulator: string | null;
  date: string;
  outcome: Outcome;
  verdict: "PASS" | "FAIL";
  failure_type: string | null;
  failure_class: FailureClass | null;
  headline: string;
}

export interface MotionTelemetryPoint {
  jerk_mps3?: number | null;
  crossing_distance_m?: number | null;
  motion_state?: string;
  derived_source?: string;
  t: number;
  ego_x_m: number | null;
  ego_speed_mps: number | null;
  ego_accel_mps2: number | null;
  target_x_m: number | null;
  target_y_m: number | null;
  target_vy_mps: number | null;
  perceived_y_m: number | null;
  ttc_perceived_s: number | null;
  ttc_gt_s: number | null;
}

export interface FailureDetail extends RunHeader {
  motion_telemetry: MotionTelemetryPoint[];
  stage_evidence?: {stage: string; values: Record<string,number | null>}[];
  evaluation_version?: string;
  metrics: {
    impact_speed_kmh: number | null;
    min_distance_m: number | null;
    min_ttc_s: number | null;
    first_detection_t: number | null;
    first_detection_distance_m: number | null;
    aeb_activation_t: number | null;
    aeb_activation_ttc_s: number | null;
    fcw_t: number | null;
    brake_onset_t: number | null;
    max_deceleration_mps2: number | null;
    stopping_distance_m: number | null;
    rms_jerk_mps3: number | null;
    impact_speed_mps: number | null;
    metric_source: "SIMULATOR_RESULT";
    false_activation: boolean;
    missed_activation: boolean;
  };
  chain: ChainStage[];
  chain_confidence: number | null;
  configuration: { code: string; name: string; unit: string; value: number | undefined }[];
  environment: {
    ego_speed_kmh: number;
    trigger_distance_m: number;
    pedestrian_speed_mps: number;
    stops_at_curb: boolean;
    weather: string;
    time_of_day: string;
    road_friction: number;
  };
  ttc_threshold_s: number | null;
  telemetry: { t: number; ttc: number | null; speed_kmh: number | null }[];
  events: SimEvent[];
  scene: {
    crossing_x: number;
    lane_width_m: number;
    vehicle_length_m: number;
    vehicle_width_m: number;
    path: { t: number; x: number; ped_y: number }[];
    end: Frame | null;
  };
  similar: { run_id: number; variant: string; summary: string; similarity_pct: number }[];
}

export interface Playback extends RunHeader {
  motion_telemetry?: MotionTelemetryPoint[];
  duration_s: number;
  frames: Frame[];
  events: SimEvent[];
  crossing_x: number;
  lane_width_m: number;
  vehicle_length_m: number;
  vehicle_width_m: number;
  ttc_threshold_s: number | null;
  ego_speed_kmh: number;
  related_runs: { run_id: number; config: string; purpose: string; outcome: Outcome }[];
}

export interface RegressionItem {
  id: number;
  code: string;
  name: string;
  baseline: string;
  candidate: string;
  candidate_version_id: number;
  status: RegressionStatus;
  review_decision: ReviewDecision;
  scenarios: number | null;
  progress: { done: number; total: number };
  fixed: number | null;
  regressed: number | null;
  created_by: string | null;
  created_at: string;
}

export interface RegressionList {
  kpis: {
    total: number;
    passed: number;
    failed: number;
    running: number;
    running_progress: { code: string; done: number; total: number } | null;
    since: string | null;
  };
  items: RegressionItem[];
}

export type OutcomeKey = "COLLISION" | "NEAR_MISS" | "SAFE";

export interface Pair {
  variant_id: number;
  label: string;
  summary: string;
  family: string;
  baseline_run_id: number;
  candidate_run_id: number;
  baseline_outcome: OutcomeKey;
  candidate_outcome: OutcomeKey;
  baseline_verdict: "PASS" | "FAIL";
  candidate_verdict: "PASS" | "FAIL";
  baseline_false_activation: boolean;
  candidate_false_activation: boolean;
  min_ttc_delta_s: number | null;
  candidate_impact_kmh: number | null;
  change: "fixed" | "regressed" | "unchanged";
  /**
   * Ba mục tiêu ADR-040 của từng run, đọc thẳng từ worker (chưa gộp theo tập). null = không phanh (jerk, quãng phanh)
   * hoặc không va chạm (tốc độ va chạm). Optional vì backend cũ không trả.
   */
  baseline_rms_jerk_mps3?: number | null;
  candidate_rms_jerk_mps3?: number | null;
  baseline_impact_speed_mps?: number | null;
  candidate_impact_speed_mps?: number | null;
  baseline_stopping_distance_m?: number | null;
  candidate_stopping_distance_m?: number | null;
}

export interface Criterion {
  key: string;
  label: string;
  enabled: boolean;
  required: boolean;
  threshold: number | null;
  actual: number | string | null;
  passed: boolean;
}

export interface RegressionSummary {
  counts?: { scenarios: number; fixed: number; regressed: number; unchanged: number; new_collisions: number };
  transitions?: Record<OutcomeKey, Record<OutcomeKey, number>>;
  rates?: {
    collision_baseline_pct: number;
    collision_candidate_pct: number;
    false_activation_baseline_pct: number;
    false_activation_candidate_pct: number;
  };
  median_min_ttc?: { baseline: number | null; candidate: number | null; delta: number | null };
  families?: { scenario_id: number; name: string; scenarios: number; fixed: number; regressed: number; median_ttc_delta: number | null }[];
  criteria?: Criterion[];
  pairs?: Pair[];
  error?: string;
}

export interface ParamDiff {
  code: string;
  name: string;
  unit: string;
  category?: string;
  baseline: number | undefined;
  candidate: number | undefined;
  changed: boolean;
}

export interface RegressionDetail {
  id: number;
  code: string;
  recommendation_code: string;
  name: string;
  status: RegressionStatus;
  review_decision: ReviewDecision;
  family: string;
  scenario_id: number;
  baseline: { id: number; label: string; status: string };
  candidate: { id: number; label: string; status: string };
  key_parameters: ParamDiff[];
  parameter_diff: ParamDiff[];
  pass_criteria: {
    criteria: Record<string, { enabled: boolean; required: boolean; value?: number }>;
    scenario_set: {
      old_critical: boolean;
      all_variants: boolean;
      old_critical_count: number;
      variant_count: number;
      /** Có từ đợt 2: cách chọn tập; test cũ không có (coi như theo hai cờ ở trên). */
      mode?: "old_critical" | "all_variants" | "custom";
      variant_ids?: number[] | null;
      /** Số ca trước đây an toàn trong tập lúc tạo test. */
      safe_count?: number;
    };
  };
  progress: { done: number; total: number };
  created_by: string | null;
  created_at: string;
  summary: RegressionSummary;
  /** Bộ mô phỏng của test (vd. `carla-0.9.16-xosc2`); null/undefined ở bản backend cũ. */
  simulator?: string;
  /** Có khi test chạy trên CARLA: phanh chưa hiệu chuẩn, số chỉ để quan sát/đối chiếu (TD-17). */
  simulator_caveat?: SimulatorCaveat | null;
  candidate_source?: CandidateSource | null;
}

export interface SimulatorCaveat {
  carla: boolean;
  calibrated: boolean;
}

/** Candidate tạo thủ công hay đến từ chiến dịch tối ưu; chiến dịch/trial null khi chưa có dữ liệu tối ưu. */
export interface CandidateSource {
  type: "MANUAL" | "OPTIMIZATION";
  optimization_run_id: number | null;
  campaign_name: string | null;
  trial_id: number | null;
  trial_number: number | null;
}

export interface RegressionPreview {
  scenario_id: number;
  family: string;
  baseline: string;
  variant_count: number;
  old_critical_count: number;
  baseline_runs_existing: number;
  /** Bộ mô phỏng mà test mới sẽ chạy (cấu hình backend), vd. `vehicsim-kinematic-1.0` hoặc `carla-0.9.16-xosc2`. */
  simulator?: string;
  /** Có khi gọi với `include_variants=true`: danh sách biến thể để chọn tay. */
  variants?: PreviewVariant[];
}

export interface PreviewVariant {
  id: number;
  label: string;
  summary: string;
  /** null = chưa có run baseline hoàn tất cùng bộ mô phỏng + xe. */
  baseline_outcome: OutcomeKey | null;
  baseline_false_activation: boolean | null;
  /** Đã có run baseline (kể cả đang chờ) — có thì dùng lại, không thì chạy thêm khi tạo test. */
  has_baseline_run: boolean;
  /** Trước đây an toàn: baseline chạy xong và không ghi nhận lỗi — cần có trong tập để kiểm phanh oan / xấu đi. */
  safe: boolean;
  old_critical: boolean;
}

export interface RegressionRequest {
  candidate_version_id: number;
  scenario_id: number;
  include_old_critical: boolean;
  include_all_variants: boolean;
  criteria: Record<string, { enabled?: boolean; value?: number }>;
  name?: string;
  /** Tập biến thể chọn tay; có thì thay cho hai cờ include_*. */
  variant_ids?: number[];
}

export type RecommendationStatus = ReviewDecision | "BLOCKED";

export interface RecommendationItem {
  id: number;
  code: string;
  regression_code: string;
  baseline: string;
  candidate: string;
  status: RecommendationStatus;
  rates: NonNullable<RegressionSummary["rates"]> | Record<string, never>;
  counts: NonNullable<RegressionSummary["counts"]> | Record<string, never>;
  created_at: string;
}

export interface RecommendationDetail extends RegressionDetail {
  recommendation_status: RecommendationStatus;
  recommendation_status_label: string;
  changed_parameters: ParamDiff[];
  expected_effect: {
    collision_rate: [number | null, number | null];
    false_activation: [number | null, number | null];
    median_min_ttc: [number | null, number | null];
    fixed: number | null;
    regressed: number | null;
  };
  tradeoffs: string[];
  confidence: "High" | "Medium" | "Low";
  evidence: { key: string; title: string; status: "PASS" | "FAIL" | "NOT_RUN"; detail: string }[];
  review: {
    decision: ReviewDecision;
    reviewed_by: string | null;
    reviewed_at: string | null;
    note: string | null;
    conditions: string | null;
    requested_by: string | null;
  };
}

/** ``GET /vehicsim/decisions`` — quyết định của Reviewer (mới nhất trước) và chuỗi baseline của project. */
export interface DecisionHistory {
  decisions: {
    recommendation_code: string;
    regression_code: string;
    test_id: number;
    baseline: string;
    candidate: string;
    decision: ReviewDecision;
    reviewed_by: string | null;
    reviewed_at: string | null;
    reason: string | null;
    conditions: string | null;
  }[];
  baselines: {
    id: number;
    version_no: number;
    label: string;
    status: "BASELINE" | "ARCHIVED";
    /** null = baseline khởi tạo của project, không do quyết định Accept nào nâng. */
    promoted_by: string | null;
    promoted_at: string | null;
    regression_code: string | null;
    reason: string | null;
  }[];
}

/** ``POST /vehicsim/telemetry/evaluate`` — số đo từ ``frames.csv`` của ``worker/sensor_recorder.py`` (ADR-040). */
export interface TelemetrySummary {
  /** 3 mục tiêu MOBO; null = không phanh (jerk, quãng phanh) hoặc không va chạm (tốc độ va chạm). */
  rms_jerk_mps3: number | null;
  impact_speed_mps: number | null;
  stopping_distance_m: number | null;
  relative_impact_speed_mps: number | null;
  total_frames: number;
  duration_s: number;
  radar_min_ttc_s: number | null;
  obstacle_min_distance_m: number | null;
  max_deceleration_ms2: number | null;
  mean_deceleration_ms2: number | null;
  max_abs_jerk_mps3: number | null;
  first_brake_time_s: number | null;
  collisions: number;
  first_collision_time_s: number | null;
  impact_peak_accel_ms2: number | null;
}

// ---------------------------------------------------------------------------
// Tối ưu hoá AEB đa mục tiêu (MOBO) - FE-13 / ADR-040
// ---------------------------------------------------------------------------

export type OptimizationStatus = "PENDING" | "RUNNING" | "COMPLETED" | "CANCELLED" | "FAILED";

export interface OptimizationRun {
  id: number;
  project_id: number;
  scenario_id: number;
  name: string;
  algorithm: string;
  status: OptimizationStatus;
  max_trials: number;
  completed_trials: number;
  pareto_count: number;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  search_space?: Record<string, [number, number]>;
  objective_config?: Record<string, unknown>;
}

export interface OptimizationTrial {
  id: number;
  trial_number: number;
  candidate_aeb_version_id: number;
  sampling_source: string;
  acquisition_value: number | null;
  rms_jerk_mps3: number | null;
  impact_speed_mps: number | null;
  stopping_distance_m: number | null;
  collision_rate_pct: number | null;
  constraint_violated: boolean;
  is_pareto_optimal: boolean;
  status: string;
  parameters: Record<string, number>;
}

export interface OptimizationSelectionResult {
  optimization_run_id: number;
  trial_id: number;
  candidate_aeb_version_id: number;
  parameters: Record<string, number>;
  objectives: {
    rms_jerk_mps3: number;
    impact_speed_mps: number;
    stopping_distance_m: number;
  };
  regression_test_id: number;
  status: string;
}

export interface AnalysisRun {
  revision: string; run_id: number; scenario_id: number; scenario_version_id: number; version_no: number;
  family: string; variant: string; seed: number; baseline_id: number; vehicle_id: number;
  simulator: string; dt: number; status: string; outcome: string; weather: string | null;
  time_of_day: string | null; failure_class: string | null; error: string | null;
  end_reason: string | null; trace_available: boolean; created_at: string | null;
  metrics: { rms_jerk_mps3: number | null; impact_speed_mps: number | null; stopping_distance_m: number | null };
}
export interface ObjectiveAggregate {
  version: string; invalid_runs: number;
  rms_jerk_mps3: ObjectiveValue; impact_speed_mps: ObjectiveValue; stopping_distance_m: ObjectiveValue;
}
export interface ObjectiveValue {
  value: number | null; samples: number; missing: number; notApplicable: number;
  unit: string; status: "VALID" | "INCOMPLETE" | "NOT_APPLICABLE";
}
export interface AnalysisDashboardData {
  total: number; page: number; page_size: number; counts: Record<string,number>;
  items: AnalysisRun[]; evaluation_version: string;
  objective_groups: {identity: string; simulator: string; baseline_id: number; vehicle_id: number;
    objectives: ObjectiveAggregate; carla_observational_only: boolean }[];
}
export interface AnalysisSelection {
  schema: "vehicsim.analysis-dataset/v2"; id: number; baseline_current: boolean; handoff_ready: boolean;
  scenario: {id: number; code: string; name: string; category: string};
  baseline: {id: number; label: string};
  reference: {vehicle_id: number; simulator: string; dt: number};
  runs: AnalysisRun[]; optimization_run_ids: number[]; validation_run_ids: number[];
  optimization_objectives: ObjectiveAggregate; validation_objectives: ObjectiveAggregate;
  evaluation: {version: string; carla_observational_only: boolean};
}
export interface AnalysisFilters {
  scenario_id?: number; variant_id?: number; aeb_version_id?: number; vehicle_id?: number;
  simulator?: string; weather?: string; time_of_day?: string; status?: string; failure_class?: string;
}

// Quản lý workspace (Manager — M1…M5), khớp com.vehicsim.dto.WorkspaceDtos
export interface WorkspaceUserRef { id: number; full_name: string; email: string }
export type WorkspaceStatus = "ACTIVE" | "ARCHIVED";
export interface WorkspaceSummary {
  id: number; name: string; description: string | null; status: WorkspaceStatus; manager: WorkspaceUserRef;
  member_count: number; project_count: number; pending_report_count: number; created_date: string;
}
export interface WorkspaceProject {
  id: number; name: string; status: "ACTIVE" | "ARCHIVED"; owner: WorkspaceUserRef; member_count: number; created_date: string;
}
export interface WorkspaceDetail { workspace: WorkspaceSummary; projects: WorkspaceProject[] }
export type WorkspaceMemberRole = "ENGINEER" | "REVIEWER";
export interface WorkspaceMember {
  user_id: number; full_name: string; email: string; role: WorkspaceMemberRole; is_active: boolean; joined_at: string;
  added_by: WorkspaceUserRef | null; project_count: number; owned_project_count: number; open_task_count: number;
}
export interface WorkspaceMemberCandidate { user_id: number; full_name: string; email: string; role: WorkspaceMemberRole }
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type TaskStatus = "TODO" | "IN_PROGRESS" | "REVIEW" | "DONE";
export interface WorkspaceTask {
  id: number; title: string; description: string | null; priority: TaskPriority; status: TaskStatus; progress_pct: number;
  assignee: WorkspaceUserRef | null; project: { id: number; name: string } | null; created_by: WorkspaceUserRef;
  due_date: string | null; overdue: boolean; report_count: number; created_date: string; updated_at: string;
}
export interface WorkspaceTaskRequest {
  title: string; description: string | null; priority: TaskPriority; status: TaskStatus; progress_pct: number;
  assignee_id: number | null; project_id: number | null; due_date: string | null;
}
export type ReportStatus = "SUBMITTED" | "APPROVED" | "REJECTED";
export interface WorkspaceReport {
  id: number; project: { id: number; name: string }; task: { id: number; title: string } | null; submitted_by: WorkspaceUserRef;
  title: string; content: string; attachment_url: string | null; status: ReportStatus;
  reviewed_by: WorkspaceUserRef | null; reviewed_at: string | null; review_note: string | null; created_date: string;
}
export interface NotificationItem {
  id: number; type: string; title: string; content: string; reference_type: string | null; reference_id: number | null;
  workspace_id: number | null; workspace_name: string | null; is_read: boolean; created_date: string;
}
export interface NotificationList { items: NotificationItem[]; unread_count: number }
