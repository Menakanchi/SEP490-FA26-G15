/**
 * Client cho `/api/v1/vehicsim/*` — vòng MVP VehicSim (FE-12/14 + thiết lập tối thiểu FE-07/11).
 * Mọi request đi qua `apiRequest`, nên tự mang `Authorization: Bearer`.
 */

import { apiDownload, apiRequest } from "@/services/api";
import type {
  AebVersion,
  AssistantAnswer,
  AssistantStatus,
  AssistantTurn,
  DescribeResult,
  FailureDetail,
  FailureFilters,
  FailureList,
  FamilyItem,
  FamilyRequest,
  Playback,
  RecommendationDetail,
  RecommendationItem,
  RegressionDetail,
  RegressionList,
  RegressionPreview,
  RegressionRequest,
  ReviewDecision,
  VehicSimContextData,
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
  context: () => apiRequest<VehicSimContextData>("/vehicsim/context"),

  describe: (text: string) =>
    apiRequest<DescribeResult>("/vehicsim/scenarios/describe", { method: "POST", body: JSON.stringify({ text }) }),

  families: () => apiRequest<FamilyItem[]>("/vehicsim/families"),
  createFamily: (body: FamilyRequest) =>
    apiRequest<{ scenario_id: number; code: string; variants: number; queued_runs?: number }>("/vehicsim/families", {
      method: "POST",
      body: JSON.stringify(body),
    }),
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
  exportFailures: (filters: FailureFilters) => apiDownload(`/vehicsim/failures.csv${query(filters)}`, "failure_cases.csv"),
  run: (runId: number) => apiRequest<FailureDetail>(`/vehicsim/runs/${runId}`),
  playback: (runId: number) => apiRequest<Playback>(`/vehicsim/runs/${runId}/playback`),
  /** JSON chạy lại đúng run này ngoài web: `worker/run_variant.py` (CARLA) hoặc `worker/kinematic_sim.py`. */
  downloadRunBundle: (runId: number) =>
    apiDownload(`/vehicsim/runs/${runId}/bundle`, `vehicsim-run-${runId}.json`),

  regressions: (status?: string) => apiRequest<RegressionList>(`/vehicsim/regression${query({ status })}`),
  regressionPreview: (scenarioId: number) =>
    apiRequest<RegressionPreview>(`/vehicsim/regression/preview${query({ scenario_id: scenarioId })}`),
  createRegression: (body: RegressionRequest) =>
    apiRequest<{ id: number; code: string }>("/vehicsim/regression", { method: "POST", body: JSON.stringify(body) }),
  regression: (id: number) => apiRequest<RegressionDetail>(`/vehicsim/regression/${id}`),

  recommendations: () => apiRequest<RecommendationItem[]>("/vehicsim/recommendations"),
  recommendation: (id: number) => apiRequest<RecommendationDetail>(`/vehicsim/recommendations/${id}`),
  decide: (id: number, body: { decision: Exclude<ReviewDecision, "PENDING">; reason: string; conditions?: string; confirmed: boolean }) =>
    apiRequest<RecommendationDetail>(`/vehicsim/recommendations/${id}/decision`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** Trợ lý dự án — chỉ đọc; trả lời từ dữ liệu project + tài liệu repo, kèm nguồn. */
  assistantAsk: (question: string, history: AssistantTurn[]) =>
    apiRequest<AssistantAnswer>("/vehicsim/assistant/ask", { method: "POST", body: JSON.stringify({ question, history }) }),
  assistantStatus: () => apiRequest<AssistantStatus>("/vehicsim/assistant/status"),
};
