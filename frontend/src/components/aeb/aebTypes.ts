import type { AebVersion, FailureClass, VersionBrief } from "@/types/vehicsim";

export const STATUS_TONE: Record<VersionBrief["status"], "dark" | "info" | "ok" | "danger" | "neutral"> = {
  BASELINE: "dark",
  CANDIDATE: "info",
  ACCEPTED: "ok",
  REJECTED: "danger",
  ARCHIVED: "neutral",
};

export const STATUS_LABEL: Record<VersionBrief["status"], string> = {
  BASELINE: "cơ sở",
  CANDIDATE: "ứng viên",
  ACCEPTED: "đã chấp nhận",
  REJECTED: "đã từ chối",
  ARCHIVED: "lưu trữ",
};

export const SOURCE_LABEL: Record<string, string> = {
  MANUAL: "thủ công",
  OPTIMIZATION: "tối ưu hoá",
  INITIAL_DESIGN: "khởi tạo ban đầu",
  SOBOL_INIT: "khởi tạo ban đầu",
  ACQUISITION: "tối ưu hoá",
};

// 4 tham số AEB chỉnh được theo ADR-040.
export const KEY_PARAMS = ["TTC_THRESHOLD", "BRAKE_ACTIVATION_DELAY", "MAX_DECELERATION", "BRAKE_BUILDUP_RATE"] as const;

export const PARAM_NAMES: Record<string, string> = {
  TTC_THRESHOLD: "Ngưỡng TTC",
  BRAKE_ACTIVATION_DELAY: "Độ trễ kích hoạt phanh",
  MAX_DECELERATION: "Giảm tốc tối đa",
  BRAKE_BUILDUP_RATE: "Tốc độ tăng lực phanh",
};

export function paramDisplayName(code: string): string {
  return PARAM_NAMES[code] ?? code;
}

export const CATEGORY_ORDER: FailureClass[] = ["DECISION", "CONTROL", "VEHICLE_DYNAMICS"];

export function changedNote(v: AebVersion, baseline: AebVersion | null): string {
  if (!baseline || v.id === baseline.id) return SOURCE_LABEL[v.source] ?? v.source;
  const n = Object.keys({ ...v.parameters, ...baseline.parameters }).filter(
    (k) => v.parameters[k] !== baseline.parameters[k],
  ).length;
  return `${n} tham số khác bản cơ sở`;
}
