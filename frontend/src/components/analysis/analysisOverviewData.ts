import type { AnalysisDashboardData, AnalysisRun, ObjectiveValue } from "@/types/vehicsim";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
export const overviewCount = (value: unknown, total = Number.MAX_SAFE_INTEGER): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= total ? value : null;
const positiveId = (value: unknown) => overviewCount(value) !== null && (value as number) > 0;

/** Validate this view's response boundary without changing the shared API or stored evaluation. */
export function overviewResponse(value: unknown): value is AnalysisDashboardData {
  return record(value) && overviewCount(value.total) !== null && positiveId(value.page) && positiveId(value.page_size)
    && record(value.counts) && Array.isArray(value.items) && Array.isArray(value.objective_groups);
}

export function overviewRun(value: unknown): value is AnalysisRun {
  return record(value) && positiveId(value.run_id) && typeof value.family === "string"
    && typeof value.variant === "string" && typeof value.simulator === "string"
    && typeof value.status === "string" && typeof value.outcome === "string"
    && positiveId(value.baseline_id) && positiveId(value.vehicle_id)
    && typeof value.dt === "number" && Number.isFinite(value.dt) && value.dt > 0
    && typeof value.seed === "number" && Number.isFinite(value.seed)
    && (value.weather == null || typeof value.weather === "string")
    && (value.time_of_day == null || typeof value.time_of_day === "string");
}

type Group = AnalysisDashboardData["objective_groups"][number];
export function overviewGroup(value: unknown): value is Group {
  return record(value) && typeof value.identity === "string" && typeof value.simulator === "string"
    && positiveId(value.baseline_id) && positiveId(value.vehicle_id) && record(value.objectives);
}

export function overviewMetric(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "—";
  // Do not turn a recorded positive value into a displayed zero through rounding.
  return value > 0 && value < 0.001 ? value.toExponential(2) : value.toFixed(3);
}

export const overviewVersion = (value: unknown) => typeof value === "string" && value.trim() ? value : "—";

export function overviewObjective(value: ObjectiveValue | undefined, unit: string) {
  const samples = overviewCount(value?.samples), missing = overviewCount(value?.missing);
  const notApplicable = overviewCount(value?.notApplicable);
  const valid = value?.status === "VALID" && value.unit === unit && samples !== null && samples > 0
    && missing === 0 && notApplicable !== null && overviewMetric(value.value) !== "—";
  return { valid, samples, missing, notApplicable,
    label: valid ? "Đủ số đo để tổng hợp" : value?.status === "NOT_APPLICABLE" && value.value === null
      && samples === 0 && missing === 0 && notApplicable !== null ? "Không áp dụng" : "Chưa đủ dữ liệu hợp lệ" };
}

export function overviewPercentage(value: number | null, total: number): string | null {
  if (value === null || total <= 0) return null;
  const percent = 100 * value / total;
  if (percent > 0 && percent < 0.1) return "<0,1%";
  if (percent < 100 && percent > 99.9) return ">99,9%";
  return percent.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "%";
}
