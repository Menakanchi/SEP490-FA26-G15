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

export interface FailureDetail extends RunHeader {
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
  telemetry: { t: number; ttc: number | null; speed_kmh: number }[];
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
    scenario_set: { old_critical: boolean; all_variants: boolean; old_critical_count: number; variant_count: number };
  };
  progress: { done: number; total: number };
  created_by: string | null;
  created_at: string;
  summary: RegressionSummary;
}

export interface RegressionPreview {
  scenario_id: number;
  family: string;
  baseline: string;
  variant_count: number;
  old_critical_count: number;
  baseline_runs_existing: number;
}

export interface RegressionRequest {
  candidate_version_id: number;
  scenario_id: number;
  include_old_critical: boolean;
  include_all_variants: boolean;
  criteria: Record<string, { enabled?: boolean; value?: number }>;
  name?: string;
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

// ---------------------------------------------------------------------------
// Trợ lý dự án (RAG, chỉ đọc) — `src/services/vehicsim/assistant.py`
// ---------------------------------------------------------------------------

export type AssistantScope = "in_scope" | "not_found" | "out_of_scope" | "blocked";
export type KnowledgeSourceType = "DOC" | "PROJECT" | "AEB" | "FAMILY" | "FAILURE" | "REGRESSION";

export interface AssistantSource {
  id: string; // "S1"… — khớp mã [S1] trong câu trả lời
  type: KnowledgeSourceType;
  ref: string; // "#1055", "RT-004", "v1.3", "parameters", "docs/adr/…md"
  title: string;
  link: string | null; // màn hình VehicSim tương ứng (tài liệu repo thì null)
}

export interface AssistantTurn {
  role: "user" | "assistant";
  content: string;
}

/** Một bước ReAct: công cụ chỉ đọc đã gọi (không có suy nghĩ nội bộ của LLM). */
export interface AssistantTraceStep {
  tool: string;
  args: Record<string, string | number | boolean>;
  sources: string[];
}

export interface AssistantAnswer {
  scope: AssistantScope;
  answer: string;
  sources: AssistantSource[];
  grounded: boolean;
  trace: AssistantTraceStep[];
  retrieved: number;
  model: string | null;
  cost_usd: number;
  llm_calls: number;
}

export interface AssistantStatus {
  model: string;
  embeddings: "openai" | "offline";
  chunks: number;
  by_type: Partial<Record<KnowledgeSourceType, number>>;
  updated_at: string | null;
}
