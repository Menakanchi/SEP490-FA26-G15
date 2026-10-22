/**
 * Client cho `/api/v1/vehicsim/*` — vòng MVP VehicSim (FE-12/14 + thiết lập tối thiểu FE-07/11).
 * Mọi request đi qua `apiRequest`, nên tự mang `Authorization: Bearer`.
 */

import { apiDownload, apiRequest } from "@/services/api";
import type {
  AebVersion,
<<<<<<< Updated upstream
=======
  AnalysisDataset,
  CarlaStatus,
  CarlaRun,
  CarlaData,
>>>>>>> Stashed changes
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
};
