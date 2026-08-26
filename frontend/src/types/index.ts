/**
 * Hợp đồng dữ liệu Frontend — Scenario Forge (P-130)
 *
 * Mirror của `src/models/schemas.py`. Mọi thay đổi ở backend phải đồng bộ ở đây.
 */

// ---------------------------------------------------------------------------
// Enum string unions — trục ODD
// ---------------------------------------------------------------------------

export type RoadType =
  | "intersection"
  | "urban_straight"
  | "highway"
  | "residential_narrow"
  | "roundabout";

export type Weather = "clear" | "rain" | "heavy_rain" | "fog";

export type TimeOfDay = "day" | "dusk" | "night";

export type ActorType = "motorcycle" | "car" | "pedestrian" | "truck";

export type ManeuverType =
  | "cut_in"
  | "sudden_brake"
  | "run_red_light"
  | "jaywalk"
  | "wrong_way"
  | "lane_drift"
  | "stop_in_lane";

export type VehicleCategory =
  | "car"
  | "motorcycle"
  | "truck"
  | "bicycle"
  | "pedestrian";

export type ValidationMode = "static" | "sim";

// ---------------------------------------------------------------------------
// Label maps — hiển thị UI tiếng Việt
// ---------------------------------------------------------------------------

export const ROAD_TYPE_LABELS: Record<RoadType, string> = {
  intersection: "Giao lộ",
  urban_straight: "Đường đô thị thẳng",
  highway: "Cao tốc",
  residential_narrow: "Ngõ hẹp",
  roundabout: "Vòng xuyến",
};

export const WEATHER_LABELS: Record<Weather, string> = {
  clear: "Trời quang",
  rain: "Mưa nhẹ",
  heavy_rain: "Mưa lớn",
  fog: "Sương mù",
};

export const ACTOR_TYPE_LABELS: Record<ActorType, string> = {
  motorcycle: "Xe máy",
  car: "Ô tô",
  pedestrian: "Người đi bộ",
  truck: "Xe tải",
};

export const MANEUVER_TYPE_LABELS: Record<ManeuverType, string> = {
  cut_in: "Tạt đầu",
  sudden_brake: "Phanh gấp",
  run_red_light: "Vượt đèn đỏ",
  jaywalk: "Băng qua đường",
  wrong_way: "Đi ngược chiều",
  lane_drift: "Lấn làn",
  stop_in_lane: "Dừng giữa làn",
};

export const VEHICLE_CATEGORY_LABELS: Record<VehicleCategory, string> = {
  car: "Ô tô",
  motorcycle: "Xe máy",
  truck: "Xe tải",
  bicycle: "Xe đạp",
  pedestrian: "Người đi bộ",
};

// ---------------------------------------------------------------------------
// Helper for Safe Value Rendering
// ---------------------------------------------------------------------------

const normalizeStr = (str: string): string => {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/_/g, " ")
    .trim();
};

const formatSpecificText = (text: string): string => {
  if (!text) return "";
  const cleaned = text.replace(/_/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

/**
 * Một trục ODD có thể tới dưới hai hình dạng, và cả hai đều hợp lệ:
 *   - chuỗi enum thuần (`"motorcycle"`) — đây là thứ `GET /scenarios` trả về,
 *     vì bốn cột ODD trong DB lưu đúng giá trị enum để `WHERE` còn khớp;
 *   - object có `category` + nhãn mô tả — đây là `parsed_intent` của Node 1,
 *     nơi chữ người dùng gõ ("xe khách") còn được giữ nguyên bên cạnh ô enum.
 */
export interface OddAxisDetail {
  category?: string;
  specific_type?: string;
  specific_action?: string;
}

export type OddAxisValue = string | OddAxisDetail | null | undefined;

export const renderSafeValue = (
  val: OddAxisValue,
  labelsMap?: Record<string, string>,
): string => {
  if (!val) return "unknown";
  if (typeof val === "string") return labelsMap?.[val] ?? val;
  if (typeof val === "object") {
    const catKey = val.category && val.category !== "unknown" ? val.category : "";
    const cat = catKey ? (labelsMap?.[catKey] ?? catKey) : "";

    const rawSpec =
      val.specific_type && val.specific_type !== "unknown"
        ? val.specific_type
        : val.specific_action && val.specific_action !== "unknown"
        ? val.specific_action
        : "";

    const spec = formatSpecificText(rawSpec);

    if (cat && spec) {
      if (normalizeStr(cat) === normalizeStr(spec) || normalizeStr(catKey) === normalizeStr(spec)) {
        return cat;
      }
      return `${cat} (${spec})`;
    }
    if (cat) {
      return cat;
    }
    if (spec) {
      return spec;
    }
    return "unknown";
  }
  return String(val);
};

// ---------------------------------------------------------------------------
// Smart Actor Fallback Helpers (Frontend Only)
// ---------------------------------------------------------------------------

/**
 * Loại phương tiện để vẽ. Ưu tiên `actor.category`, thiếu thì lấy nhãn ODD.
 *
 * `ActorType` là tập con của `VehicleCategory` (ODD không có `bicycle`), nên
 * dùng thẳng nhãn ODD làm category là an toàn về kiểu.
 *
 * Bản trước có nhánh `at.split(":")` để bóc `"truck:xe_ben"`, và nhánh
 * `typeof at === "object"`. Cả hai đã chết: backend giờ ghi giá trị enum thuần
 * vào bốn cột ODD (chuỗi ghép làm mọi `WHERE actor_type = 'truck'` trượt), còn
 * chi tiết thì nằm ở `specific_type` riêng.
 */
export function getSanitizedActorCategory(actor: ActorSpec, odd?: ODDCell): VehicleCategory {
  if (actor.category) return actor.category;
  if (odd?.actor_type) return odd.actor_type;
  return "car";
}

/** Chữ người dùng gõ cho phương tiện này, nếu còn giữ được. */
export function getSanitizedActorSpecificType(actor: ActorSpec, odd?: ODDCell): string {
  return actor.specific_type || odd?.specific_type || "";
}

export function sanitizeActors(actors: ActorSpec[], odd?: ODDCell): ActorSpec[] {
  if (!actors || actors.length === 0) return [];
  return actors.map((actor) => {
    const cat = getSanitizedActorCategory(actor, odd);
    const specType = getSanitizedActorSpecificType(actor, odd);
    return {
      ...actor,
      category: cat,
      specific_type: specType || actor.specific_type,
    };
  });
}

export function renderActorCategoryLabel(actor: ActorSpec, odd?: ODDCell): string {
  const cat = getSanitizedActorCategory(actor, odd);
  const specType = getSanitizedActorSpecificType(actor, odd);

  const catLabel = VEHICLE_CATEGORY_LABELS[cat] || cat;
  if (specType) {
    return `${catLabel} (${specType})`;
  }
  return catLabel;
}

// ---------------------------------------------------------------------------
// ODD Cell
// ---------------------------------------------------------------------------

export interface ODDCell {
  road_type: RoadType;
  weather: Weather;
  actor_type: ActorType;
  maneuver: ManeuverType;
  /** Chữ người dùng gõ, giữ lại sau khi đã quy về ô enum ("xe khách" -> truck).
   *  Là nhãn mô tả, KHÔNG phải trục thứ năm — coverage vẫn đếm theo bốn trục trên. */
  specific_type?: string | null;
  specific_action?: string | null;
}

// ---------------------------------------------------------------------------
// Scenario structures
// ---------------------------------------------------------------------------

export interface Position {
  /** Lệch bao nhiêu làn so với làn của ego. Âm = trái, dương = phải. Khoảng -4..4.
   *  KHÔNG phải số thứ tự làn; đây là độ lệch tương đối theo quy ước OpenSCENARIO. */
  lane_offset: number;
  /** Lệch dọc so với ego, mét. Âm = phía sau ego. Khoảng -200..200. */
  s_offset_m: number;
}

export interface ActorSpec {
  name: string;
  category: VehicleCategory;
  position: Position;
  initial_speed_kmh: number;
  is_ego: boolean;
  specific_type?: string;
}

export interface TriggerCondition {
  type: "distance_to_ego" | "simulation_time";
  value: number;
}

export interface ManeuverSpec {
  actor_name: string;
  maneuver: ManeuverType;
  trigger: TriggerCondition;
  target_speed_kmh: number | null;
}

export interface ScenarioSpec {
  scenario_id: string;
  description_vi: string;
  title: string;
  odd: ODDCell;
  time_of_day: TimeOfDay;
  actors: ActorSpec[];
  maneuvers: ManeuverSpec[];
  duration_s: number;
}

// ---------------------------------------------------------------------------
// Status & Review
// ---------------------------------------------------------------------------

export type ScenarioStatus =
  | "draft"
  | "pending_review"
  | "approved_library"
  | "approved_sim"
  | "rejected"
  | "pending_sim_review"
  | "simulation_queued"
  | "pending_library_review";

export type ReviewGate = "before_library" | "before_sim";

export interface ReviewRequest {
  scenario_id: string;
  gate: ReviewGate;
  approved: boolean;
  reviewer: string;
  reason: string;
  force_simulate?: boolean;
  force_intent_override?: boolean;
}

export interface DuplicateDifference {
  field: string;
  current: string | number | null;
  existing: string | number | null;
  delta: number | null;
  unit: "km/h" | "m" | "s" | null;
}

export interface DuplicateDiff {
  duplicate_scenario_id: string;
  differences: DuplicateDifference[];
}

export interface ReviewResponse {
  ok: boolean;
  status?: ScenarioStatus;
  job_created?: boolean;
  warning?: "near_duplicate";
  duplicate?: DuplicateDiff;
}

export interface ReviewLog extends ReviewRequest {
  decided_at: string; // ISO datetime
}

// ---------------------------------------------------------------------------
// ODD Payload — bộ lọc thư viện
// ---------------------------------------------------------------------------

export interface ODDPayload {
  road_type?: RoadType;
  weather?: Weather;
  actor_type?: ActorType;
  maneuver?: ManeuverType;
}

// ---------------------------------------------------------------------------
// Scenario list item — dạng summary cho Library
// ---------------------------------------------------------------------------

export interface RetrievedExample {
  id: string;
  title: string;
  content: string;
  description_vi?: string;
  metadata?: Record<string, string>;
  similarity_score?: number;
}

export interface ScenarioItem {
  scenario_id: string;
  title: string;
  description_vi: string;
  odd: ODDCell;
  status: ScenarioStatus;
  xosc_content?: string;
  created_at: string; // ISO datetime
  actors?: ActorSpec[];
  spec?: ScenarioSpec;
  retrieved_examples?: RetrievedExample[];
  /** Kết quả model evaluation tách biệt với lifecycle `approved_library`. */
  controller_evaluation?: ControllerRunsResponse["comparison"];
}

// ---------------------------------------------------------------------------
// Generation workflow
// ---------------------------------------------------------------------------

export type GenerationStep =
  | "queued"
  | "parse_intent"
  | "retrieve"
  | "generate_draft"
  | "validate"
  | "repair_draft"
  | "convert_xosc"
  | "persist"
  | "done"
  | "failed";

export interface GenerationStatus {
  request_id: string;
  step: GenerationStep;
  scenario_id?: string;
  error?: string;
  progress: number; // 0-100
}

// ---------------------------------------------------------------------------
// Scenario detail — full response from GET /scenarios/{id}
// ---------------------------------------------------------------------------

/** Một mẫu quỹ đạo ĐO ĐƯỢC khi chạy, không phải suy diễn từ spec. */
export interface TrajectoryPoint {
  t: number;
  /** x, y, yaw(độ) trong hệ toạ độ CARLA. */
  ego: [number, number, number];
  adv: [number, number, number];
  /** Tim làn ego đang đi, hỏi thẳng bản đồ — vẽ được mặt đường thật. */
  lane_centre: [number, number];
  /** Vị trí tác nhân trong hệ quy chiếu ego: [dọc, ngang] mét. Dọc dương = ở trước ego. */
  rel?: [number, number];
}

export interface CriterionResult {
  name: string;
  result: "SUCCESS" | "FAILURE";
  actual_value?: number | string | null;
  expected_value?: number | string | null;
}

export interface ExecutionResult {
  scenario_id: string;
  success: boolean;
  criteria_results: CriterionResult[];
  /** Xem `ExecutionResult.metrics` ở backend: khoá vắng mặt = KHÔNG ĐO ĐƯỢC, không phải 0. */
  metrics: Record<string, number>;
  /** Rỗng nghĩa là không đo được quỹ đạo, không phải xe đứng yên. */
  trajectory?: TrajectoryPoint[];
  ego_controller?: "constant_speed" | "behavior_agent";
  error?: string | null;
}

export interface ControllerRun {
  job_id: string;
  scenario_id: string;
  status: "pending" | "running" | "done" | "failed";
  job_kind: "controller_evaluation";
  ego_controller: "constant_speed" | "behavior_agent";
  result?: ExecutionResult | null;
  created_at: string;
  updated_at: string;
}

export interface ControllerRunsResponse {
  scenario_id: string;
  baseline?: ExecutionResult | null;
  runs: ControllerRun[];
  comparison: {
    outcome:
      | "not_run"
      | "pending"
      | "execution_failed"
      | "incomparable_initial_conditions"
      | "avoided_hazard"
      | "near_failure"
      | "controller_collision"
      | "inconclusive";
    baseline_collision: boolean | null;
    controller_collision: boolean | null;
    initial_speed_delta_ms: number | null;
    comparable_initial_conditions: boolean;
    next_action:
      | "run_controller"
      | "wait_for_pair"
      | "fix_worker"
      | "rerun_controller"
      | "create_harder_variant"
      | "keep_regression"
      | "adjust_scenario";
    recommendation_vi: string;
  };
}

/** Vì sao một trục ODD có giá trị mà người dùng không gõ ra.
 *
 * Không có `explicit`: trục người dùng nói thẳng thì backend **không sinh
 * Assumption nào**. Vắng mặt chính là dấu hiệu. */
export type AssumptionSource = "inferred" | "default";

/** Một giá trị hệ thống tự điền thay người dùng.
 *
 * Metadata của *lần sinh này*, không phải thuộc tính của kịch bản — nên nó nằm
 * cạnh `ScenarioDetail` chứ không nằm trong `spec`. Đây là thứ reviewer ở cổng 1
 * cần thấy để biết trục nào do người gõ, trục nào do máy đoán. */
export interface Assumption {
  /** Tên trục ODD: `road_type` | `weather` | `actor_type` | `maneuver`. */
  field: string;
  value: string;
  source: AssumptionSource;
  reason_vi: string;
}

export interface ScenarioDetail {
  scenario_id: string;
  title: string;
  description_vi: string;
  odd: ODDCell;
  time_of_day: TimeOfDay;
  status: ScenarioStatus;
  spec: ScenarioSpec;
  xosc_content?: string;
  review_logs: ReviewLog[];
  created_at: string;
  /** Trục ODD hệ thống tự điền. Rỗng nghĩa là cả bốn trục đều lấy từ câu người dùng. */
  assumptions?: Assumption[];
  retrieved_examples?: RetrievedExample[];
  /** Có sau khi worker chạy xong; đây là thứ cổng BEFORE_LIBRARY duyệt. */
  latest_execution_result?: ExecutionResult | null;
  verification?: string;
  /** Oracle L4 chấm từ telemetry CARLA; null nghĩa là chưa đủ dữ liệu, không phải sai. */
  intent_evaluation?: {
    verdict: boolean | null;
    status: "matched" | "mismatched" | "not_measurable";
    label_vi: string;
  };
}

/** GET /metrics/quality — M1/M2/M3. `rate: null` nghĩa là CHƯA CÓ DỮ LIỆU, không phải 0%. */
export interface Ratio {
  passed: number;
  total: number;
  rate: number | null;
}

export interface ValidityLevel extends Ratio {
  label: string;
  /** Lượt chạy chưa có luật chấm — không tính là sai. */
  not_measurable: number;
}

export interface QualityReport {
  m1_validity: {
    l1_schema: ValidityLevel;
    l2_xosc: ValidityLevel;
    l3_runtime: ValidityLevel;
    l4_intent: ValidityLevel;
  };
  m2_coverage: {
    covered_supported: number;
    supported_total: number;
    rate_supported: Ratio;
    covered_any: number;
    enum_total: number;
    covered_out_of_scope: number;
    scenarios_per_maneuver: Record<string, number>;
    /** Phủ theo CẶP trục — chuẩn kiểm thử tổ hợp; ít kịch bản vẫn phủ được nhiều cặp. */
    covered_pairs: number;
    feasible_pairs: number;
    rate_pairwise: Ratio;
  };
  m3_hazard: {
    executed: number;
    collision: number;
    near_miss: number;
    no_hazard: number;
    rate: Ratio;
    collision_rate: Ratio;
  };
}

/** Chiến dịch ODD — chế độ nâng cao: khoanh vùng ô, agent viết câu. */
export interface CampaignSummary {
  campaign_id: string;
  created_by: string;
  cells: ODDCell[];
  per_cell: number;
  max_scenarios: number;
  status: "running" | "done" | "stopped";
  generated: number;
  failed: number;
  created_at: string;
}

export interface CampaignRequest {
  request_id: string;
  status: string;
  /** Câu do AGENT viết, không phải người gõ — vẫn đi qua đúng graph 7 node. */
  description_vi: string;
  scenario_id: string | null;
  error?: string | null;
  road_type?: string | null;
  weather?: string | null;
  actor_type?: string | null;
  maneuver?: string | null;
}

export interface CampaignDetail extends CampaignSummary {
  requests: CampaignRequest[];
}

export interface CampaignReviewResponse {
  ok: boolean;
  campaign_id: string;
  scenarios: string[];
  count: number;
  near_duplicates: Array<{
    scenario_id: string;
    warning: "near_duplicate";
    duplicate: DuplicateDiff;
  }>;
}

export interface CampaignControllerBatchResponse {
  ok: boolean;
  campaign_id: string;
  queued_scenarios: string[];
  count: number;
  job_count: number;
  jobs: ControllerRun[];
  skipped: Array<{ scenario_id: string; reason: string }>;
}

export interface CampaignControllerSummary {
  campaign_id: string;
  evaluations: ControllerRunsResponse[];
  counts: Record<string, number>;
  pending: boolean;
}

export * from "./auth";

/** Một kịch bản chờ người chấm ý định.
 *
 * Cố ý **không** có trường phán quyết của máy: thấy trước thì người chấm gật
 * theo, và mức khớp thu được là con số vô nghĩa. Backend cũng không gửi nó.
 */
export interface LabelQueueItem {
  scenario_id: string;
  title: string;
  description_vi: string;
  maneuver: string;
  road_type: string;
  trajectory: TrajectoryPoint[];
  /** Giây xảy ra va chạm đầu tiên, nếu có. Bản phát lại cắt ở đây. */
  contact_time_s?: number | null;
  /** Người đang đăng nhập đã chấm kịch bản này chưa — không nói đã chấm ra sao. */
  labelled: boolean;
}

export interface IntentAgreement {
  agreement: number | null;
  matched: number;
  scored: number;
  labelled_scenarios: number;
  unsure: number;
  human_conflicts: number;
  disagreements: { scenario_id: string; human: string; machine: string; reason: string }[];
}
