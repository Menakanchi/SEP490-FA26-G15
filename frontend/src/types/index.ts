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

export const renderSafeValue = (val: any, labelsMap?: Record<string, string>): string => {
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
// ODD Cell
// ---------------------------------------------------------------------------

export interface ODDCell {
  road_type: RoadType | any;
  weather: Weather | any;
  actor_type: ActorType | any;
  maneuver: ManeuverType | any;
  specific_type?: string;
  specific_action?: string;
}

// ---------------------------------------------------------------------------
// Scenario structures
// ---------------------------------------------------------------------------

export interface Position {
  lane_offset: number; // -4..4
  s_offset_m: number; // -200..200
}

export interface ActorSpec {
  name: string;
  category: VehicleCategory;
  position: Position;
  initial_speed_kmh: number;
  is_ego: boolean;
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
  | "pending_review"
  | "rejected"
  | "approved_library"
  | "pending_sim_review";

export type ReviewGate = "before_library" | "before_sim";

export interface ReviewRequest {
  scenario_id: string;
  gate: ReviewGate;
  approved: boolean;
  reviewer: string;
  reason: string;
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
  metadata?: Record<string, any>;
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
  spec?: ScenarioSpec;
  retrieved_examples?: RetrievedExample[];
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
  retrieved_examples?: RetrievedExample[];
}
