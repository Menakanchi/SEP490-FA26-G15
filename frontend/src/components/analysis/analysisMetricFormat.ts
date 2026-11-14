import type { ObjectiveValue } from "@/types/vehicsim";

/** Display only. Never round or replace the raw values used for calculations. */
export function formatMetric(value: unknown, digits = 2, nonNegative = false): string {
  if (typeof value !== "number" || !Number.isFinite(value) || (nonNegative && value < 0)) return "—";
  // Preserve small signed signals instead of showing a measured zero (or -0).
  if (value !== 0 && Math.abs(value) < 10 ** -digits) return value.toExponential(2);
  return (Object.is(value, -0) ? 0 : value).toFixed(digits);
}

export const formatObjective = (value: unknown) => formatMetric(value, 3, true);
export function formatMeasurement(value: unknown, unit: string, digits = unit === "km/h" ? 1 : unit === "m/s³" ? 3 : 2, nonNegative = false): string {
  const text = formatMetric(value, digits, nonNegative);
  return text === "—" ? text : `${text}${unit ? ` ${unit}` : ""}`;
}

/** Canonical per-run impact is ego speed at collision; aggregate zero is a separate contract. */
export function formatRunImpact(value: unknown, run: { status: string; outcome: string }, digits = 3): string {
  return run.status === "COMPLETED" && run.outcome === "COLLISION" ? formatMetric(value, digits, true) : "—";
}

/** Frame.ego_v is m/s. API speed_kmh fields must not pass through this conversion. */
export function speedKmh(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const converted = value * 3.6;
  return Number.isFinite(converted) ? converted : null;
}

const count = (value: unknown) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function objectiveState(value: ObjectiveValue | undefined, unit: string) {
  const samples = count(value?.samples), missing = count(value?.missing), notApplicable = count(value?.notApplicable);
  const valid = value?.status === "VALID" && value.unit === unit && samples !== null && samples > 0
    && missing === 0 && notApplicable !== null && formatObjective(value.value) !== "—";
  return { valid, samples, missing, notApplicable,
    label: valid ? "Đủ số đo để tổng hợp" : value?.status === "NOT_APPLICABLE" && value.value === null
      && samples === 0 && missing === 0 && notApplicable !== null ? "Không áp dụng" : "Chưa đủ dữ liệu hợp lệ" };
}
