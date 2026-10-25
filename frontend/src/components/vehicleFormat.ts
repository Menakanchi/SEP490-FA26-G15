/** Định dạng số của màn "Phương tiện". Số thiếu hiện "—", không thay bằng 0. */

import type { VehicleSummary } from "@/types/vehicsim";

/** Kích thước dài × rộng × cao (m). */
export function dimensions(v: Pick<VehicleSummary, "length_m" | "width_m" | "height_m">): string {
  return `${v.length_m.toFixed(2)} × ${v.width_m.toFixed(2)} × ${v.height_m.toFixed(2)} m`;
}

/** Giảm tốc (m/s²); chưa đo thì "—". */
export function decel(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(2)} m/s²`;
}

/** Số kèm đơn vị; null thì "—". */
export function withUnit(v: number | null | undefined, digits: number, unit: string): string {
  return v === null || v === undefined ? "—" : `${v.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}
