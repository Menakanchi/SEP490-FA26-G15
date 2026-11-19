import type { FailureDetail } from "@/types/vehicsim";
import type { ChartMarker } from "@/components/TelemetryChart";

export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Select an actual recorded sample; never interpolate missing signals. */
export function recordedAt<T extends { t: number }>(points: T[], time: number): T | null {
  return points.reduce<T | null>((best, point) => finite(point.t) && point.t >= 0 && point.t <= time && (!best || point.t > best.t) ? point : best, null);
}

export function recordedRange(detail: FailureDetail) {
  let min = Infinity, max = -Infinity;
  for (const point of [...detail.telemetry, ...(detail.motion_telemetry ?? [])]) {
    if (finite(point.t) && point.t >= 0) { min = Math.min(min, point.t); max = Math.max(max, point.t); }
  }
  return min === Infinity ? null : { min, max };
}

export function runMarkers(detail: FailureDetail): ChartMarker[] {
  const markers: ChartMarker[] = [];
  const add = (t: unknown, label: string, color: string, source: string) => {
    if (finite(t) && t >= 0) markers.push({ t, label, source, color: `var(--color-vehicsim-${color})` });
  };
  add(detail.metrics.first_detection_t, "Phát hiện", "perception", "metrics.first_detection_t");
  add(detail.metrics.fcw_t, "Cảnh báo FCW", "warn", "metrics.fcw_t");
  add(detail.metrics.aeb_activation_t, "Quyết định AEB", "decision", "metrics.aeb_activation_t");
  add(detail.metrics.brake_onset_t, "Bắt đầu lệnh phanh", "control", "metrics.brake_onset_t");
  const below = detail.events.find(event => event.kind === "ttc_below");
  const collision = detail.events.find(event => event.kind === "collision");
  const stopped = detail.events.find(event => event.kind === "stopped");
  add(below?.t, "Mốc TTC từ backend", "warn", "events[kind=ttc_below].t");
  add(collision?.t, "Va chạm", "danger", "events[kind=collision].t");
  add(stopped?.t, "Dừng", "ok", "events[kind=stopped].t");
  return markers.sort((a, b) => a.t - b.t);
}
