import { EVIDENCE_FIELDS } from "./analysisFailurePresentation";
import { finite } from "./analysisRunData";

const STAGE_FIELDS: Record<string, readonly string[]> = {
  PERCEPTION: ["first_detection_t", "first_detection_distance_m"],
  DECISION: ["decision_t", "decision_ttc_s"],
  CONTROL: ["brake_onset_t", "response_time_s"],
  VEHICLE_DYNAMICS: ["max_deceleration_mps2", "road_friction"],
};

/** API projection only. Unknown fields keep their values without invented units/events. */
export function evidenceGroups(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object" || typeof item.stage !== "string") return [];
    const values = item.values && typeof item.values === "object" && !Array.isArray(item.values) ? item.values : {};
    const stage: string = item.stage;
    const knownFields = Object.hasOwn(STAGE_FIELDS, stage) ? STAGE_FIELDS[stage] : [];
    return [{ stage, index, rows: Object.entries(values).map(([key, raw]) => {
      const field = knownFields.includes(key) ? EVIDENCE_FIELDS[key] : undefined;
      const valid = finite(raw) && (!field || raw >= 0);
      return { key, raw, value: valid ? raw : null, label: field?.label ?? key, unit: field?.unit ?? "",
        source: `stage_evidence[${index}].values.${key}`,
        kind: !field ? "Trường chưa có mô tả" : key === "road_friction" ? "Cấu hình mô phỏng"
          : field.time ? "Mốc controller" : "Chỉ số đã tính",
        time: field?.time === true && valid ? raw as number : null };
    }) }];
  });
}

export function evidenceCanSeek(time: unknown, range: { min: number; max: number } | null): time is number {
  return finite(time) && time >= 0 && range !== null && time >= range.min && time <= range.max;
}

/** Preserve filters/signal and exact stored seconds; no time offset or index mapping. */
export function evidenceHref(runId: number, time: number, query: string, returnTo: string, playback: boolean) {
  const params = new URLSearchParams(query);
  params.set("t", String(time)); params.set("returnTo", returnTo);
  if (playback) params.delete("section"); else params.set("section", "telemetry");
  return `/analysis/failures/${runId}${playback ? "/playback" : ""}?${params}`;
}
