import type { AnalysisSelection } from "@/types/vehicsim";

export type SavedSelection = Omit<AnalysisSelection, "baseline_current" | "handoff_ready"> & {
  baseline_current?: boolean; handoff_ready?: boolean;
};
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const id = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;

/** Rendering boundary only. Server owns evidence/metric/eligibility validation. No values are filled. */
export function readSavedSelection(value: unknown, expectedId?: number): SavedSelection {
  if (object(value) && value.schema === "vehicsim.analysis-dataset/v1")
    throw new Error("Đây là snapshot lưu trữ phiên bản cũ, chưa có hai tập độc lập. Không thể bàn giao trực tiếp; chọn run và chốt tập mới. Snapshot cũ không bị thay đổi.");
  if (!object(value) || value.schema !== "vehicsim.analysis-dataset/v2" || !id(value.id)
      || (expectedId !== undefined && value.id !== expectedId))
    throw new Error("Snapshot trả về không đúng định dạng hoặc mã tập đang mở. Hãy tải lại tập đã chốt.");
  const { scenario, baseline, reference, evaluation, runs, optimization_run_ids: opt, validation_run_ids: val } = value;
  const aggregate = (raw: unknown) => object(raw) && ["rms_jerk_mps3", "impact_speed_mps", "stopping_distance_m"].every(key => object(raw[key]));
  if (!object(scenario) || !id(scenario.id) || typeof scenario.name !== "string"
      || !object(baseline) || !id(baseline.id) || typeof baseline.label !== "string"
      || !object(reference) || !object(evaluation) || typeof evaluation.version !== "string"
      || !Array.isArray(runs) || !Array.isArray(opt) || !Array.isArray(val)
      || opt.length < 1 || val.length < 1 || opt.length > 500 || val.length > 500
      || !opt.every(id) || !val.every(id) || new Set([...opt, ...val]).size !== opt.length + val.length
      || !runs.every(run => object(run) && id(run.run_id) && object(run.metrics))
      || new Set(runs.map(run => run.run_id)).size !== runs.length
      || runs.length !== opt.length + val.length || !runs.every(run => [...opt, ...val].includes(run.run_id))
      || !aggregate(value.optimization_objectives) || !aggregate(value.validation_objectives))
    throw new Error("Snapshot thiếu hoặc bất đồng cấu trúc run, vai trò hoặc chỉ số. Chưa thể rà soát hay bàn giao; hãy tải lại tập đã chốt.");
  return value as unknown as SavedSelection;
}

/** Compare the saved payload, ignoring response-time flags. Not a digest or authority check. */
export function sameSavedSelection(a: SavedSelection, b: SavedSelection): boolean {
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable)
    : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])])) : value;
  const payload = ({ baseline_current: _current, handoff_ready: _ready, dataset_digest: _digest, created_at: _date, ...rest }: SavedSelection & { created_at?: unknown }) => {
    void _current; void _ready; void _digest; void _date;
    return stable(rest);
  };
  return JSON.stringify(payload(a)) === JSON.stringify(payload(b));
}
