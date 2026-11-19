import type { FailureClass } from "@/types/vehicsim";

export const FAILURE_STAGES: FailureClass[] = ["PERCEPTION", "DECISION", "CONTROL", "VEHICLE_DYNAMICS"];
export const FAILURE_OUTCOMES = ["COLLISION", "NEAR_MISS", "FALSE_BRAKING"];
export const FAILURE_WEATHERS = ["CLEAR", "CLOUDY", "RAIN", "HEAVY_RAIN", "FOG"];
export const FAILURE_FILTER_KEYS = ["f_scenario", "f_class", "f_outcome", "f_weather", "f_aeb", "f_days"] as const;
export const PARAMETER_NAMES: Record<string, string> = {
  TTC_THRESHOLD: "Ngưỡng TTC", BRAKE_ACTIVATION_DELAY: "Trễ kích hoạt phanh", MAX_DECELERATION: "Giảm tốc tối đa", BRAKE_BUILDUP_RATE: "Tốc độ tăng lực phanh",
};
export const EVIDENCE_FIELDS: Record<string, { label: string; unit: string; time?: boolean }> = {
  first_detection_t: { label: "Phát hiện lần đầu", unit: "s", time: true },
  first_detection_distance_m: { label: "Cự ly phát hiện", unit: "m" },
  decision_t: { label: "Quyết định AEB", unit: "s", time: true },
  decision_ttc_s: { label: "TTC tại quyết định", unit: "s" },
  brake_onset_t: { label: "Bắt đầu lệnh phanh", unit: "s", time: true },
  response_time_s: { label: "Trễ lệnh phanh", unit: "s" },
  max_deceleration_mps2: { label: "Giảm tốc cực đại", unit: "m/s²" },
  road_friction: { label: "Hệ số ma sát", unit: "" },
};
export const validCount = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
export const positiveId = (value: string | null, fallback = 0) => value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
