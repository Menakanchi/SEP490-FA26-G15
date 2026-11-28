import type { AnalysisRun, FailureDetail } from "@/types/vehicsim";
import { recordedChain } from "./analysisClassificationData";

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Rendering boundary for the existing inspection response, not a new API or diagnosis. */
export function assertInspection(value: unknown, runId: number): asserts value is { run: AnalysisRun; detail: FailureDetail | null } {
  if (!object(value) || !object(value.run) || value.run.run_id !== runId)
    throw new Error("Dữ liệu trả về không khớp lượt chạy đang mở.");
  const textFields = (row: Record<string, unknown>, keys: string[]) => {
    if (keys.some(key => row[key] != null && typeof row[key] !== "string"))
      throw new Error("Response có thông tin mô tả không hợp lệ.");
  };
  textFields(value.run, ["family", "variant", "status", "simulator", "created_at", "error", "end_reason"]);
  for (const key of ["scenario_id", "scenario_version_id", "seed", "baseline_id", "vehicle_id", "dt"])
    if (value.run[key] != null && typeof value.run[key] !== "number") throw new Error("Response có định danh hoặc bước thời gian không hợp lệ.");
  const d = value.detail;
  if (d === null) return; // Actual status-only API path; undefined is malformed, not unfinished.
  if (!object(d) || d.run_id !== runId) throw new Error("Dữ liệu trả về không khớp lượt chạy đang mở.");
  for (const [detailKey, runKey] of [["scenario_id", "scenario_id"], ["variant_id", "scenario_version_id"], ["seed", "seed"], ["simulator", "simulator"], ["status", "status"]]) {
    if (d[detailKey] != null && value.run[runKey] != null && d[detailKey] !== value.run[runKey])
      throw new Error("Danh tính hoặc trạng thái chi tiết không khớp nguồn run. Hãy tải lại dữ liệu.");
  }
  if (![d.metrics, d.environment, d.scene].every(object))
    throw new Error("Response thiếu cấu trúc chỉ số, môi trường hoặc cảnh chạy. Hãy tải lại hoặc báo bên cung cấp dữ liệu.");
  const scene = d.scene as Record<string, unknown>;
  for (const [name, rows] of [["configuration", d.configuration], ["telemetry", d.telemetry], ["events", d.events], ["scene.path", scene.path], ["similar", d.similar],
    ...(d.motion_telemetry == null ? [] : [["motion_telemetry", d.motion_telemetry]])]) {
    if (!Array.isArray(rows) || !rows.every(object))
      throw new Error(`Response có cấu trúc ${name} không hợp lệ. Hãy tải lại hoặc báo bên cung cấp dữ liệu.`);
  }
  // Reject text/object substitutions that would crash recorded-data renderers. Nullable
  // numeric measurements remain untouched and are formatted as unknown by existing helpers.
  textFields(d, ["status", "outcome", "headline", "failure_type", "failure_class", "recorded_cause", "simulator", "vehicle", "summary", "config", "date"]);
  textFields(d.environment as Record<string, unknown>, ["category", "weather", "time_of_day"]);
  for (const row of d.configuration as Record<string, unknown>[]) textFields(row, ["code", "name", "unit"]);
  for (const row of d.similar as Record<string, unknown>[]) textFields(row, ["variant", "summary"]);
  if (Array.isArray(d.chain)) for (const row of d.chain) if (object(row)) textFields(row, ["stage", "summary", "cause_code", "parameter_code"]);
}

/** Preserve disagreements; never choose a collision authority or re-evaluate a run. */
export function legacyDisagreements(d: FailureDetail): string[] {
  const notes: string[] = [];
  if (d.verdict === "PASS" && (d.failure_type || recordedChain(d.chain).some(stage => stage.passed === false)))
    notes.push("Verdict PASS đi kèm phân loại lỗi hoặc khâu không đạt. Giữ cả hai nhận định đã lưu để đối chiếu.");
  if (d.outcome === "COLLISION" && d.metrics.false_activation === true)
    notes.push("Outcome va chạm và cờ phanh oan cùng được ghi. API chưa giải thích bất đồng giữa các trường này.");
  if (d.outcome === "FALSE_BRAKING")
    notes.push("Outcome phanh oan có thể được backend ưu tiên trước cờ va chạm. Response này không cung cấp cờ contact độc lập để xác nhận có hay không va chạm vật lý.");
  if (d.outcome !== "COLLISION" && typeof d.metrics.impact_speed_mps === "number" && Number.isFinite(d.metrics.impact_speed_mps))
    notes.push("Có impact đã lưu nhưng outcome không phải COLLISION. Giữ dấu — ở số đo va chạm từng run; chưa xác định thẩm quyền giữa các nguồn.");
  return notes;
}

export function recordedOutcome(d: FailureDetail) {
  switch (d.outcome) {
    case "COLLISION": return "Có ghi nhận va chạm trong kết quả đã lưu.";
    case "SAFE": return "Kết quả đã lưu là SAFE (an toàn theo luật). Đây chưa là xác minh an toàn vật lý.";
    case "NEAR_MISS": return "Kết quả đã lưu là suýt va chạm theo luật.";
    case "FALSE_BRAKING": return "Kết quả đã lưu là phanh oan theo luật; cần đối chiếu bằng chứng.";
    default: return "Chưa có outcome được hỗ trợ để diễn giải; không suy ra an toàn từ dữ liệu thiếu.";
  }
}
