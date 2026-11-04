import type { AnalysisRun } from "@/types/vehicsim";
import { eligible } from "@/components/analysisUi";

export type SelectionRole = "OPTIMIZATION" | "VALIDATION";
export type ChosenRun = { run: AnalysisRun; role: SelectionRole };
export type SelectionCheck = { ok: boolean; label: string; help: string };
export const sourceIdentity = (run: AnalysisRun) => [run.scenario_id, run.baseline_id, run.vehicle_id, run.simulator, run.dt].join("|");

/** Check only selection metadata. Stored metrics and final validity belong to the server. */
export function selectionChecks(selection: ChosenRun[], baselineId?: number): SelectionCheck[] {
  const opt = selection.filter(item => item.role === "OPTIMIZATION"), val = selection.filter(item => item.role === "VALIDATION");
  return [
    { ok: opt.length > 0 && val.length > 0, label: "Có run trong cả tập tối ưu và tập xác minh", help: "Gán run ở mục Lượt chạy hoặc chuyển vai trò trong bản nháp." },
    { ok: selection.length > 0 && new Set(selection.map(({run}) => sourceIdentity(run))).size === 1, label: "Cùng họ, baseline, xe, simulator và bước thời gian", help: "Bỏ hoặc thay các run khác nhóm nguồn trước khi so sánh." },
    { ok: selection.length > 0 && !opt.some(a => val.some(b => a.run.scenario_version_id === b.run.scenario_version_id)) && new Set(selection.map(({run}) => `${run.scenario_version_id}:${run.seed}`)).size === selection.length, label: "Không trùng biến thể giữa hai tập; không lặp biến thể/seed", help: "Hai tập phải độc lập theo biến thể; mỗi cặp biến thể/seed chỉ chọn một lần." },
    { ok: opt.some(item => item.run.outcome === "SAFE") && val.some(item => item.run.outcome === "SAFE"), label: "Mỗi tập giữ ít nhất một ca an toàn", help: "Giữ ca SAFE trong cả hai tập để kiểm tra phanh oan." },
    { ok: selection.length > 0 && selection.every(({run}) => eligible(run) && Boolean(run.revision)), label: "Run hoàn tất, có telemetry và revision", help: "Bỏ run thiếu điều kiện, tải lại Lượt chạy rồi chọn bằng chứng mới." },
    { ok: selection.length > 0 && baselineId !== undefined && selection.every(({run}) => run.baseline_id === baselineId), label: "Baseline của lựa chọn khớp ngữ cảnh hiện hành", help: "Máy chủ sẽ kiểm tra lại baseline khi chốt; chọn run của baseline hiện hành." },
    { ok: opt.length > 0 && val.length > 0 && opt.length <= 500 && val.length <= 500, label: "Mỗi tập có từ 1 đến 500 run", help: "Giới hạn của API chốt tập là 500 run cho mỗi vai trò." },
  ];
}

/** Reject malformed browser cache, not missing measurements or stale-but-reviewable runs. */
export function restoreSelection(raw: unknown) {
  const chosen: Record<number, ChosenRun> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { chosen, discarded: true };
  let discarded = false;
  for (const [id, value] of Object.entries(raw)) {
    const item = value as Partial<ChosenRun> | null, run = item?.run;
    const valid = run && Number(id) === run.run_id && [run.run_id, run.scenario_id, run.scenario_version_id, run.baseline_id, run.vehicle_id].every(n => Number.isSafeInteger(n) && n > 0)
      && Number.isSafeInteger(run.seed) && typeof run.dt === "number" && Number.isFinite(run.dt) && run.dt > 0
      && [run.family, run.variant, run.status, run.outcome, run.simulator].every(s => typeof s === "string")
      && typeof run.revision === "string" && run.revision.length > 0 && typeof run.trace_available === "boolean"
      && run.metrics && typeof run.metrics === "object" && !Array.isArray(run.metrics)
      && (item.role === "OPTIMIZATION" || item.role === "VALIDATION");
    if (valid) chosen[run.run_id] = item as ChosenRun; else discarded = true;
  }
  return { chosen, discarded };
}
