/**
 * Client cho `/api/v1/vehicsim/*` — vòng MVP VehicSim (FE-12/14 + thiết lập tối thiểu FE-07/11).
 * Mọi request đi qua `apiRequest`, nên tự mang `Authorization: Bearer`.
 */

import { apiBlob, apiDownload, apiRequest } from "@/services/api";
import type {
  AebVersion,
  AnalysisDataset,
  CarlaStatus,
  CarlaRun,
  CarlaData,
  DecisionHistory,
  DescribeResult,
  FailureDetail,
  FailureFilters,
  FailureList,
  FamilyItem,
  FamilyRequest,
  OptimizationRun,
  OptimizationSelectionResult,
  OptimizationTrial,
  Playback,
  RecommendationDetail,
  RecommendationItem,
  RegressionDetail,
  RegressionList,
  RegressionPreview,
  RegressionRequest,
  ReviewDecision,
  TelemetrySummary,
  VehicSimContextData,
  WorkspaceDetail,
  WorkspaceMember,
  WorkspaceMemberCandidate,
  WorkspaceReport,
  WorkspaceSummary,
  WorkspaceTask,
  WorkspaceTaskRequest,
} from "@/types/vehicsim";

function query(params: object): string {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") q.set(key, String(value));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const vehicsimApi = {
  analysisRuns: (filters: import("@/types/vehicsim").AnalysisFilters, page = 1) =>
    apiRequest<import("@/types/vehicsim").AnalysisDashboardData>(`/vehicsim/analysis/runs${query({...filters,page,page_size:30})}`),
  analysisInspection: (id: number) => apiRequest<{run: import("@/types/vehicsim").AnalysisRun; detail: FailureDetail | null}>(`/vehicsim/analysis/runs/${id}`),
  createAnalysisSelection: (body: {scenario_id: number; baseline_id: number; optimization_run_ids: number[]; validation_run_ids: number[]; run_revisions: Record<string,string>}) =>
    apiRequest<import("@/types/vehicsim").AnalysisSelection>("/vehicsim/analysis/selections",{method:"POST",body:JSON.stringify(body)}),
  analysisHandoff: (id: number) => apiRequest<import("@/types/vehicsim").AnalysisSelection>(`/vehicsim/analysis/datasets/${id}/handoff`),
  context: () => apiRequest<VehicSimContextData>("/vehicsim/context"),

  describe: (text: string) =>
    apiRequest<DescribeResult>("/vehicsim/scenarios/describe", { method: "POST", body: JSON.stringify({ text }) }),

  families: () => apiRequest<FamilyItem[]>("/vehicsim/families"),
  createFamily: (body: FamilyRequest) =>
    apiRequest<{ scenario_id: number; code: string; variants: number; queued_runs?: number }>("/vehicsim/families", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  /** Hủy mọi run đang chờ/đang chạy của họ (run của regression/tối ưu không bị đụng). */
  cancelFamily: (scenarioId: number) =>
    apiRequest<{ scenario_id: number; stopped: number; stopping: number }>(`/vehicsim/families/${scenarioId}/cancel`, { method: "POST" }),
  runFamily: (scenarioId: number, aebVersionId?: number) =>
    apiRequest<{ queued_runs: number }>(`/vehicsim/families/${scenarioId}/run`, {
      method: "POST",
      body: JSON.stringify({ aeb_version_id: aebVersionId ?? null }),
    }),

  aebVersions: () => apiRequest<AebVersion[]>("/vehicsim/aeb/versions"),
  createCandidate: (body: { parent_version_id: number; label?: string; notes?: string; values: Record<string, number> }) =>
    apiRequest<{ id: number }>("/vehicsim/aeb/versions", { method: "POST", body: JSON.stringify(body) }),

  failures: (filters: FailureFilters, page = 1, pageSize = 20) =>
    apiRequest<FailureList>(`/vehicsim/failures${query({ ...filters, page, page_size: pageSize })}`),
  analysisDataset: (scenarioId: number) =>
    apiRequest<AnalysisDataset>(`/vehicsim/analysis/dataset${query({ scenario_id: scenarioId })}`),
  freezeAnalysisDataset: (scenarioId: number, previewToken: string) =>
    apiRequest<AnalysisDataset>("/vehicsim/analysis/datasets", {
      method: "POST", body: JSON.stringify({ scenario_id: scenarioId, preview_token: previewToken }),
    }),
  savedAnalysisDataset: (datasetId: number) =>
    apiRequest<AnalysisDataset>(`/vehicsim/analysis/datasets/${datasetId}`),
  exportFailures: (filters: FailureFilters) => apiDownload(`/vehicsim/failures.csv${query(filters)}`, "failure_cases.csv"),
  run: (runId: number) => apiRequest<FailureDetail>(`/vehicsim/runs/${runId}`),
  playback: (runId: number) => apiRequest<Playback>(`/vehicsim/runs/${runId}/playback`),
  /** Bundle nội bộ/đường tương thích cũ; giao diện CARLA tải .xosc qua downloadRunXosc. */
  downloadRunBundle: (runId: number) =>
    apiDownload(`/vehicsim/runs/${runId}/bundle`, `vehicsim-run-${runId}.json`),
  downloadRunXosc: (runId: number) => apiDownload(`/vehicsim/runs/${runId}/xosc`, `vehicsim-run-${runId}.xosc`),
  downloadScenarioXosc: (ir: unknown) => apiDownload("/vehicsim/scenarios/xosc", "scenario.xosc", { method: "POST", body: JSON.stringify(ir) }),
  runOnCarla: (runId: number) => apiRequest<{ run_id: number }>(`/vehicsim/runs/${runId}/carla`, { method: "POST" }),
  /** Hủy run PENDING (STOPPED ngay) hoặc RUNNING (STOPPING: worker đang dọn CARLA). */
  cancelRun: (runId: number) =>
    apiRequest<{ run_id: number; status: "STOPPED" | "STOPPING" }>(`/vehicsim/runs/${runId}/cancel`, { method: "POST" }),
  carlaStatus: () => apiRequest<CarlaStatus>("/vehicsim/carla/status"),
  carlaRuns: () => apiRequest<CarlaRun[]>("/vehicsim/carla/runs"),
  carlaData: (runId: number) => apiRequest<CarlaData>(`/vehicsim/runs/${runId}/carla-data`),
  carlaImage: (runId: number, frame: string) => apiBlob(`/vehicsim/runs/${runId}/carla-files/${frame}`),
  downloadCarlaFile: (runId: number, name: "frames.csv" | "collisions.json") =>
    apiDownload(`/vehicsim/runs/${runId}/carla-files/${name}`, `${runId}-${name}`),
  /** Nộp ``result.json`` của run CARLA chạy ngoài backend (run CARLA đang PENDING/FAILED, regression chưa chốt). */
  submitCarlaResult: (runId: number, result: unknown) =>
    apiRequest<{ ok: boolean; run_id: number; status: string }>(`/vehicsim/runs/${runId}/carla-result`, {
      method: "POST",
      body: JSON.stringify(result),
    }),
  /** Số đo + 3 mục tiêu MOBO từ ``frames.csv`` / ``collisions.json`` của ``worker/sensor_recorder.py``. */
  evaluateTelemetry: (body: { csv: string; collisions?: unknown[]; decel_available?: number }) =>
    apiRequest<TelemetrySummary>("/vehicsim/telemetry/evaluate", { method: "POST", body: JSON.stringify(body) }),

  regressions: (status?: string) => apiRequest<RegressionList>(`/vehicsim/regression${query({ status })}`),
  regressionPreview: (scenarioId: number, includeVariants = false) =>
    apiRequest<RegressionPreview>(
      `/vehicsim/regression/preview${query({ scenario_id: scenarioId, include_variants: includeVariants ? "true" : undefined })}`,
    ),
  createRegression: (body: RegressionRequest) =>
    apiRequest<{ id: number; code: string }>("/vehicsim/regression", { method: "POST", body: JSON.stringify(body) }),
  regression: (id: number) => apiRequest<RegressionDetail>(`/vehicsim/regression/${id}`),
  /** Gói kết quả của test đã chạy xong: JSON (manifest + cặp run + quyết định) hoặc CSV (mỗi dòng một cặp). */
  exportRegression: (id: number, format: "json" | "csv") =>
    apiDownload(`/vehicsim/regression/${id}/export.${format}`, `RT-${String(id).padStart(3, "0")}.${format}`),
  decisionHistory: () => apiRequest<DecisionHistory>("/vehicsim/decisions"),

  recommendations: () => apiRequest<RecommendationItem[]>("/vehicsim/recommendations"),
  recommendation: (id: number) => apiRequest<RecommendationDetail>(`/vehicsim/recommendations/${id}`),
  decide: (id: number, body: { decision: Exclude<ReviewDecision, "PENDING">; reason: string; conditions?: string; confirmed: boolean }) =>
    apiRequest<RecommendationDetail>(`/vehicsim/recommendations/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  // Tối ưu hoá AEB đa mục tiêu (MOBO) - FE-13
  optimizationRuns: () => apiRequest<OptimizationRun[]>("/vehicsim/optimizations"),
  optimizationRun: (id: number) => apiRequest<OptimizationRun>(`/vehicsim/optimizations/${id}`),
  optimizationTrials: (id: number) => apiRequest<OptimizationTrial[]>(`/vehicsim/optimizations/${id}/trials`),
  optimizationPareto: (id: number) => apiRequest<OptimizationTrial[]>(`/vehicsim/optimizations/${id}/pareto`),
  createOptimization: (body: {
    scenario_id: number;
    base_aeb_version_id?: number;
    max_trials?: number;
    n_initial_points?: number;
    name?: string;
    search_space?: Record<string, [number, number]>;
    objective_config?: Record<string, unknown>;
  }) => apiRequest<{ id: number; status: string }>("/vehicsim/optimizations", { method: "POST", body: JSON.stringify(body) }),
  cancelOptimization: (id: number) =>
    apiRequest<{ id: number; status: string }>(`/vehicsim/optimizations/${id}/cancel`, { method: "POST" }),
  selectOptimizationCandidate: (runId: number, trialId: number) =>
    apiRequest<OptimizationSelectionResult>(`/vehicsim/optimizations/${runId}/select/${trialId}`, { method: "POST" }),

  // Quản lý workspace (Manager / Admin) — M1…M5
  workspaces: () => apiRequest<WorkspaceSummary[]>("/vehicsim/workspaces"),
  workspace: (id: number) => apiRequest<WorkspaceDetail>(`/vehicsim/workspaces/${id}`),
  workspaceMembers: (id: number) => apiRequest<WorkspaceMember[]>(`/vehicsim/workspaces/${id}/members`),
  workspaceMemberCandidates: (id: number, q: string) =>
    apiRequest<WorkspaceMemberCandidate[]>(`/vehicsim/workspaces/${id}/member-candidates${query({ q })}`),
  addWorkspaceMember: (id: number, userId: number) =>
    apiRequest<WorkspaceMember>(`/vehicsim/workspaces/${id}/members`, { method: "POST", body: JSON.stringify({ user_id: userId }) }),
  /** Bớt thành viên; người đó tự rời mọi project của workspace. */
  removeWorkspaceMember: (id: number, userId: number) =>
    apiRequest<{ user_id: number; removed_project_memberships: number; unassigned_tasks: number }>(
      `/vehicsim/workspaces/${id}/members/${userId}`,
      { method: "DELETE" },
    ),
  /** Task của workspace; `assignee_id = 0` là chưa giao ai. */
  workspaceTasks: (id: number, filters: { status?: string; assignee_id?: number } = {}) =>
    apiRequest<WorkspaceTask[]>(`/vehicsim/workspaces/${id}/tasks${query(filters)}`),
  createWorkspaceTask: (id: number, body: WorkspaceTaskRequest) =>
    apiRequest<WorkspaceTask>(`/vehicsim/workspaces/${id}/tasks`, { method: "POST", body: JSON.stringify(body) }),
  updateWorkspaceTask: (id: number, taskId: number, body: WorkspaceTaskRequest) =>
    apiRequest<WorkspaceTask>(`/vehicsim/workspaces/${id}/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteWorkspaceTask: (id: number, taskId: number) =>
    apiRequest<{ task_id: number }>(`/vehicsim/workspaces/${id}/tasks/${taskId}`, { method: "DELETE" }),
  workspaceReports: (id: number, filters: { status?: string; project_id?: number } = {}) =>
    apiRequest<WorkspaceReport[]>(`/vehicsim/workspaces/${id}/reports${query(filters)}`),
  /** Duyệt / từ chối báo cáo đang chờ; từ chối phải có nhận xét. */
  decideWorkspaceReport: (id: number, reportId: number, decision: "APPROVED" | "REJECTED", note: string | null) =>
    apiRequest<WorkspaceReport>(`/vehicsim/workspaces/${id}/reports/${reportId}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    }),
};
